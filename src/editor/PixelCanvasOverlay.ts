import Phaser from "phaser";
import { GameRect, positionOverlay } from "./domOverlay";

/** The grid every skin was painted on before 2026-08-22, and still the
 * default: entities are 32px art. The player character paints at 48 instead
 * so it matches Grampa's own render height — see spriteFrames.ts's
 * CHARACTER_GRID_SIZE for why that size specifically. The size is per-canvas
 * rather than global for exactly that reason. */
export const PIXEL_GRID_SIZE = 32;

// Zoom range for setDisplaySize — MAX is sized to fit the Skin Creator's
// fixed vertical layout (canvas top pinned at y=132, ~16px margin before
// the scene's 468px-tall floor) without pushing anything off-screen; MIN
// keeps individual cells comfortably clickable rather than shrinking to
// the point precise placement gets hard again. See SkinEditorScene's
// ZOOM_STEP for the increment these get adjusted by.
export const MIN_DISPLAY_SIZE = 200;
export const MAX_DISPLAY_SIZE = 320;

export type PixelTool = "paint" | "fill" | "eyedropper";

// Pure-CSS checkerboard so transparent cells read as "empty" while
// editing, rather than looking identical to the page behind the canvas —
// applied as the canvas element's own CSS background, never touched by
// exportPngDataUrl() (canvas.toDataURL only ever serializes the canvas's
// own drawn bitmap, not its CSS styling), so it never leaks into a saved
// skin's actual transparency.
const CHECKERBOARD_CSS = {
  backgroundImage:
    "linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundColor: "#999999",
};

/** One cell's before/after color — the undo unit. A whole stroke (a
 * pointerdown-drag-pointerup gesture, or a single flood fill) is an array
 * of these, batched in `currentStrokeChanges` and pushed to `undoStack` as
 * one entry on pointerup, mirroring EditorScene's own "one drag = one undo
 * step" CompositeCommand convention — just without needing that class
 * machinery, since a cell-color delta is already the simplest possible
 * command (no GameObjects, no brush lookups, nothing to re-derive). */
interface CellChange {
  index: number;
  prevColor: string | null;
  newColor: string | null;
}

/**
 * A real DOM `<canvas>` (not a Phaser texture) overlaid exactly on top of
 * a spot in the game canvas — the same "DOM overlay trick" as
 * FileInputOverlay/LevelNameInput (see domOverlay.ts) — used here because
 * per-pixel click/drag painting is what a `<canvas>` 2D context already
 * does well, rather than reimplementing it in Phaser's own scene graph.
 * Pointer Events (not separate mouse/touch handlers) means click-drag and
 * a real finger-drag on a touchscreen both just work.
 *
 * The canvas's actual pixel buffer is exactly 32x32 — one real canvas
 * pixel per grid cell, no supersampling — stretched up to whatever
 * on-screen size `rect` specifies purely via CSS (`image-rendering:
 * pixelated` keeps that stretch crisp instead of the browser's default
 * smoothing). That means `exportPngDataUrl()` needs no separate resize
 * step: it's already a pixel-perfect 32x32 PNG, matching TILE_SIZE
 * exactly, so it renders in-game with zero resampling — a real quality
 * win over the ordinary upload path (see skinUpload.ts), whose source
 * images are essentially always some other resolution and get
 * bilinear-downscaled to fit. `setDisplaySize` only ever touches `rect`'s
 * on-screen CSS size (re-centered around its previous middle, so zooming
 * doesn't visually shift the drawing), never the 32x32 buffer itself.
 *
 * `cells` (a flat, row-major array of hex colors or `null` for
 * transparent) is the actual source of truth; the canvas is just this
 * array's current rendering, redrawn one cell at a time as strokes
 * happen rather than recomputed from the canvas's own pixel data.
 */
// Pure-CSS grid lines, one per cell boundary, sized as a fraction of the
// container rather than a fixed pixel spacing so it stays exactly aligned
// with cells at any zoom level with no JS math — see the gridEl setup in
// the constructor. A sibling element layered above the canvas rather than
// anything drawn onto it, so it's structurally impossible for it to leak
// into exportPngDataUrl()'s output the way drawing it into the pixel
// buffer itself would risk.
function gridLineCss(gridSize: number): Record<string, string> {
  return {
    backgroundImage:
      "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
    // Derived from the canvas's own grid size rather than the module default,
    // so a 48-cell character canvas draws 48 lines and not 32 — the whole
    // point of the fraction-of-container sizing is that it stays aligned, and
    // a hardcoded 32 there would misalign every line on any other size.
    backgroundSize: `calc(100% / ${gridSize}) calc(100% / ${gridSize})`,
  };
}

export class PixelCanvasOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gridEl: HTMLDivElement;
  private cells: (string | null)[];
  private currentColor: string | null = null;
  private tool: PixelTool = "paint";
  private mirrorX = false;
  private isPointerDown = false;
  private lastActedIndex = -1;
  private currentStrokeChanges: CellChange[] = [];
  private undoStack: CellChange[][] = [];
  private redoStack: CellChange[][] = [];
  private rect: GameRect;
  private readonly boundReposition = (): void => this.reposition();
  private readonly boundPointerDown = (e: PointerEvent): void => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent): void => this.onPointerMove(e);
  private readonly boundContextMenu = (e: Event): void => e.preventDefault();
  private readonly boundWindowPointerUp = (): void => {
    this.isPointerDown = false;
    this.lastActedIndex = -1;
    this.commitStroke();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    rect: GameRect,
    initialCells: (string | null)[] | undefined,
    private readonly onPaint: () => void,
    // Fired once per eyedropper pick (see setTool) so the caller can sync
    // its own "current color" state and swatch highlight — the overlay
    // has no concept of a palette/swatch UI of its own, so it can only
    // report what got sampled, not update any UI for it.
    private readonly onColorPicked?: (color: string | null) => void,
    /** Cells per side. Defaults to PIXEL_GRID_SIZE so every existing call
     * site keeps its exact previous behaviour. */
    private readonly gridSize: number = PIXEL_GRID_SIZE,
  ) {
    this.rect = rect;
    this.cells = initialCells ? [...initialCells] : new Array<string | null>(gridSize * gridSize).fill(null);

    this.canvas = document.createElement("canvas");
    this.canvas.width = gridSize;
    this.canvas.height = gridSize;
    this.canvas.style.position = "fixed";
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.cursor = "crosshair";
    this.canvas.style.touchAction = "none"; // a finger-drag paints; it must not also scroll the page
    this.canvas.style.border = "1px solid #444444";
    this.canvas.style.zIndex = "1000";
    Object.assign(this.canvas.style, CHECKERBOARD_CSS);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    document.body.appendChild(this.canvas);

    this.gridEl = document.createElement("div");
    this.gridEl.style.position = "fixed";
    this.gridEl.style.zIndex = "1001"; // above the canvas
    this.gridEl.style.pointerEvents = "none"; // strokes still go to the canvas underneath
    this.gridEl.style.display = "none"; // off by default — see setGridVisible
    Object.assign(this.gridEl.style, gridLineCss(gridSize));
    document.body.appendChild(this.gridEl);

    this.redrawAll();
    this.reposition();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    // Right-click is a quick always-erase gesture (see actAt) regardless
    // of the selected tool/color — the browser's own context menu would
    // otherwise pop up mid-stroke and swallow the rest of the drag.
    this.canvas.addEventListener("contextmenu", this.boundContextMenu);
    window.addEventListener("pointerup", this.boundWindowPointerUp);
  }

  setCurrentColor(color: string | null): void {
    this.currentColor = color;
  }

  /** Paint (freehand), Fill (flood-fill the clicked region), or Eyedropper
   * (sample a cell's color back into currentColor, see actAt) — see
   * SkinEditorScene's tool-mode buttons. */
  setTool(tool: PixelTool): void {
    this.tool = tool;
  }

  /** When on, every committed cell change also applies to its horizontal
   * mirror (see setCellWithMirror) — paint, fill, and right-click erase
   * all go through that same path, so all three respect it uniformly. */
  setMirrorX(enabled: boolean): void {
    this.mirrorX = enabled;
  }

  getDisplaySize(): number {
    return this.rect.width;
  }

  setGridVisible(visible: boolean): void {
    this.gridEl.style.display = visible ? "block" : "none";
  }

  /** Re-centers on whatever the canvas's current on-screen middle is, so
   * zooming in/out doesn't visually shift the drawing to a different
   * corner — only ever touches the CSS-pixel `rect`, never the 32x32
   * pixel buffer itself, so nothing about `cells`/undo history is
   * affected. Clamped to [MIN_DISPLAY_SIZE, MAX_DISPLAY_SIZE]. */
  setDisplaySize(size: number): void {
    const clamped = Phaser.Math.Clamp(size, MIN_DISPLAY_SIZE, MAX_DISPLAY_SIZE);
    const centerX = this.rect.x + this.rect.width / 2;
    const centerY = this.rect.y + this.rect.height / 2;
    this.rect = { x: centerX - clamped / 2, y: centerY - clamped / 2, width: clamped, height: clamped };
    this.reposition();
  }

  /** Loading a different skin's cells (re-opening one to edit) starts a
   * fresh undo session, same "loading a different level resets undo
   * history" convention EditorScene's own Undo/Redo bullet documents —
   * an undo stack full of some *other* skin's strokes would make no sense
   * applied here. */
  loadCells(cells: (string | null)[]): void {
    this.cells = [...cells];
    this.undoStack = [];
    this.redoStack = [];
    this.currentStrokeChanges = [];
    this.redrawAll();
  }

  getCells(): (string | null)[] {
    return [...this.cells];
  }

  /** Irreversible after its own two-tap confirm, same as EditorUI's
   * Clear/Delete Area — resets the undo/redo stacks too, rather than
   * leaving an undo history that could "revive" cells Clear just wiped. */
  clearAll(): void {
    this.cells = new Array<string | null>(this.gridSize * this.gridSize).fill(null);
    this.undoStack = [];
    this.redoStack = [];
    this.currentStrokeChanges = [];
    this.redrawAll();
    this.onPaint();
  }

  exportPngDataUrl(): string {
    return this.canvas.toDataURL("image/png");
  }

  /** Reverts the most recent stroke (or flood fill), one whole gesture at
   * a time — iterates its changes in reverse so a cell touched twice in
   * one stroke unwinds back through its intermediate value correctly,
   * same reasoning as CompositeCommand's own reverse-order undo. Returns
   * false (a no-op) when there's nothing to undo, so callers can surface
   * "Nothing to undo" the same way EditorScene.undo() already does. */
  undo(): boolean {
    const batch = this.undoStack.pop();
    if (!batch) return false;
    for (let i = batch.length - 1; i >= 0; i--) {
      const change = batch[i];
      this.cells[change.index] = change.prevColor;
      this.redrawCell(change.index);
    }
    this.redoStack.push(batch);
    this.onPaint();
    return true;
  }

  redo(): boolean {
    const batch = this.redoStack.pop();
    if (!batch) return false;
    for (const change of batch) {
      this.cells[change.index] = change.newColor;
      this.redrawCell(change.index);
    }
    this.undoStack.push(batch);
    this.onPaint();
    return true;
  }

  private cellIndexFromEvent(e: PointerEvent): number | null {
    const box = this.canvas.getBoundingClientRect();
    const cellW = box.width / this.gridSize;
    const cellH = box.height / this.gridSize;
    const x = Math.floor((e.clientX - box.left) / cellW);
    const y = Math.floor((e.clientY - box.top) / cellH);
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return null;
    return y * this.gridSize + x;
  }

  private onPointerDown(e: PointerEvent): void {
    this.isPointerDown = true;
    this.lastActedIndex = -1;
    this.currentStrokeChanges = [];
    this.actAt(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isPointerDown) return;
    // Fill and Eyedropper are one-shot-per-press, not drag-continuous —
    // dragging with Fill active would otherwise re-flood-fill (usually a
    // no-op after the first cell, but wasted work) on every cell the
    // pointer crosses, and a dragged Eyedropper would keep resampling
    // instead of settling on the cell you actually meant to pick.
    if (this.tool !== "paint") return;
    this.actAt(e);
  }

  /** Debounced to "only the first time this stroke touches a given cell,"
   * same shape as EditorScene's own drag-paint (dragLastX/dragLastY) —
   * without it, a slow drag would fire dozens of redundant same-color
   * repaints of one cell as the pointer lingers over it. Right-click
   * (or a right-button drag) always erases, regardless of `tool` or
   * `currentColor` — a quick "get rid of this" gesture that doesn't
   * require switching to the transparent swatch first and back after. */
  private actAt(e: PointerEvent): void {
    const index = this.cellIndexFromEvent(e);
    if (index === null) return;

    if (this.tool === "eyedropper") {
      if (index === this.lastActedIndex) return;
      this.lastActedIndex = index;
      const picked = this.cells[index];
      this.currentColor = picked;
      this.onColorPicked?.(picked);
      return;
    }

    if (index === this.lastActedIndex) return;
    this.lastActedIndex = index;
    const erasing = (e.buttons & 2) !== 0;
    const color = erasing ? null : this.currentColor;

    if (this.tool === "fill") this.floodFill(index, color);
    else this.setCellWithMirror(index, color);
    this.onPaint();
  }

  /** The shared "commit one cell" primitive every tool bottoms out at —
   * records the undo delta and redraws, same no-op guard TilePainter.paint
   * uses (skip entirely if the value wouldn't actually change, so a
   * same-color repaint doesn't pollute the undo stack with a no-op
   * entry). */
  private setCell(index: number, color: string | null): void {
    if (this.cells[index] === color) return;
    this.currentStrokeChanges.push({ index, prevColor: this.cells[index], newColor: color });
    this.cells[index] = color;
    this.redrawCell(index);
  }

  /** Paint/fill/erase all route through this rather than setCell directly
   * — when mirroring is on, also applies the same color to the
   * horizontal-mirror cell. Mirrors the *action* (paint this color here
   * and at the mirrored spot), not "independently re-derive a fill region
   * on the mirrored side" — simpler and more predictable than the two
   * sides potentially disagreeing about where their own fill boundary is
   * if the drawing isn't already symmetric. 32 is even, so every column
   * has a distinct mirror (no self-mirroring center column to guard
   * against). */
  private setCellWithMirror(index: number, color: string | null): void {
    this.setCell(index, color);
    if (this.mirrorX) {
      const x = index % this.gridSize;
      const y = Math.floor(index / this.gridSize);
      this.setCell(y * this.gridSize + (this.gridSize - 1 - x), color);
    }
  }

  /** Classic 4-directional (not diagonal) flood fill — walks every cell
   * reachable from `startIndex` through orthogonal neighbors of the same
   * starting color, recoloring each via setCellWithMirror so Fill respects
   * the mirror toggle exactly like Paint does. A no-op if the clicked
   * cell is already the target color, same guard TilePainter.paint uses
   * for an ordinary same-value repaint. */
  private floodFill(startIndex: number, color: string | null): void {
    const targetColor = this.cells[startIndex];
    if (targetColor === color) return;

    const stack = [startIndex];
    const visited = new Set<number>();
    while (stack.length > 0) {
      const index = stack.pop()!;
      if (visited.has(index)) continue;
      visited.add(index);
      if (this.cells[index] !== targetColor) continue;

      this.setCellWithMirror(index, color);

      const x = index % this.gridSize;
      const y = Math.floor(index / this.gridSize);
      if (x > 0) stack.push(index - 1);
      if (x < this.gridSize - 1) stack.push(index + 1);
      if (y > 0) stack.push(index - this.gridSize);
      if (y < this.gridSize - 1) stack.push(index + this.gridSize);
    }
  }

  private commitStroke(): void {
    if (this.currentStrokeChanges.length === 0) return;
    this.undoStack.push(this.currentStrokeChanges);
    this.currentStrokeChanges = [];
    this.redoStack = []; // a fresh edit invalidates whatever redo history existed, same convention HistoryStack.push already uses
  }

  private redrawCell(index: number): void {
    const x = index % this.gridSize;
    const y = Math.floor(index / this.gridSize);
    const color = this.cells[index];
    if (color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, 1, 1);
    } else {
      this.ctx.clearRect(x, y, 1, 1);
    }
  }

  private redrawAll(): void {
    this.ctx.clearRect(0, 0, this.gridSize, this.gridSize);
    for (let i = 0; i < this.cells.length; i++) this.redrawCell(i);
  }

  private reposition(): void {
    positionOverlay(this.scene, this.canvas, this.rect);
    positionOverlay(this.scene, this.gridEl, this.rect);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
    window.removeEventListener("pointerup", this.boundWindowPointerUp);
    this.canvas.remove();
    this.gridEl.remove();
  }
}
