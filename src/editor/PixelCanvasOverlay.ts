import Phaser from "phaser";
import {
  clampPan,
  clampZoomIndex,
  contentSizeFor,
  FIT_INDEX,
  panForAnchor,
  stepZoomIndex,
} from "./canvasZoom";
import { GameRect, positionOverlay } from "./domOverlay";

/** The grid every skin was painted on before 2026-08-22, and still the
 * default: entities are 32px art. The player character paints at 48 instead
 * so it matches Grampa's own render height — see spriteFrames.ts's
 * CHARACTER_GRID_SIZE for why that size specifically. The size is per-canvas
 * rather than global for exactly that reason. */
export const PIXEL_GRID_SIZE = 32;

/** Below this many screen pixels per cell the grid lines stop being a guide
 * and start being most of what you can see — a 48-cell grid zoomed out to half
 * the window is 3.3px per cell, i.e. a 1px line every 3px. The Grid toggle
 * stays on; it just has nothing useful to draw down there. */
const MIN_GRID_CELL_PX = 4;

/** How far apart two fingers have to drift before a pinch counts as one step
 * on the zoom ladder. Loose enough not to fire on the wobble of a two-finger
 * pan, tight enough that a deliberate pinch responds on the first move. */
const PINCH_STEP_RATIO = 1.3;

export type PixelTool = "paint" | "fill" | "eyedropper" | "pan";

/** Zoom level plus where the drawing sits inside the window. Handed out and
 * taken back whole so SkinEditorScene can persist it across the canvas
 * teardown/rebuild that every frame and palette switch causes — zooming into a
 * face, switching to the next frame, and landing back at the same face is the
 * behaviour that makes tracing an animation bearable. */
export interface CanvasView {
  zoomIndex: number;
  panX: number;
  panY: number;
}

export interface PixelCanvasOptions {
  scene: Phaser.Scene;
  /** The fixed window the drawing is seen through. Never resized by zoom —
   * that is the entire point of the 2026-08-23 rework. */
  viewport: GameRect;
  initialCells?: (string | null)[];
  onPaint: () => void;
  /** Fired once per eyedropper pick (see setTool) so the caller can sync its
   * own "current color" state and swatch highlight — the overlay has no
   * concept of a palette/swatch UI of its own, so it can only report what got
   * sampled, not update any UI for it. */
  onColorPicked?: (color: string | null) => void;
  /** Cells per side. Defaults to PIXEL_GRID_SIZE. */
  gridSize?: number;
  initialView?: CanvasView;
  /** Fired whenever zoom or pan changes, however it changed — buttons, wheel,
   * drag or pinch — so the readout and the caller's persisted copy stay true
   * without polling. */
  onViewChange?: (view: CanvasView) => void;
}

// Pure-CSS checkerboard so transparent cells read as "empty" while editing,
// rather than looking identical to the page behind the canvas. Lives on its
// own element *under* the canvas rather than as the canvas's own background,
// because a tracing reference has to sit between the two — see the layer
// table in the constructor. Either way it is CSS, and exportPngDataUrl()
// (canvas.toDataURL) only ever serializes the canvas's own drawn bitmap, so
// no styling here can leak into a saved skin's transparency.
//
// Its squares are a fixed screen size rather than a fixed number of cells:
// it answers "is this transparent", which is a question about what you can
// see, not about the grid — a checkerboard that zoomed with the drawing would
// turn into two enormous squares behind a magnified pixel.
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
 * The canvas's actual pixel buffer is exactly gridSize x gridSize — one real
 * canvas pixel per grid cell, no supersampling — stretched up to whatever
 * on-screen size the current zoom asks for, purely via CSS (`image-rendering:
 * pixelated` keeps that stretch crisp instead of the browser's default
 * smoothing). That means `exportPngDataUrl()` needs no separate resize
 * step: it's already a pixel-perfect 32x32 PNG, matching TILE_SIZE
 * exactly, so it renders in-game with zero resampling — a real quality
 * win over the ordinary upload path (see skinUpload.ts), whose source
 * images are essentially always some other resolution and get
 * bilinear-downscaled to fit.
 *
 * *Zoom is a window, not a resize.* `viewport` is fixed for the overlay's whole
 * life; zoom scales the content inside it and pan slides that content around,
 * both in CSS only. Nothing here ever touches the pixel buffer, `cells`, or the
 * undo history — see canvasZoom.ts for why growing the canvas itself could
 * never have gone past 1.6x.
 *
 * `cells` (a flat, row-major array of hex colors or `null` for
 * transparent) is the actual source of truth; the canvas is just this
 * array's current rendering, redrawn one cell at a time as strokes
 * happen rather than recomputed from the canvas's own pixel data.
 */
/** How strongly a tracing reference shows through. Faint enough that your own
 * strokes stay clearly the foreground, strong enough to actually follow — a
 * judgement call, checked by eye against both grid sizes rather than derived. */
const REFERENCE_OPACITY = "0.38";

const REFERENCE_CSS = {
  // `contain`, not `cover` or a plain stretch: the built-in art is not square
  // (measured: wizard-idle is 29x48, wizard-walk1 30x48, ghost-pillow 40x40),
  // so filling a square canvas with it would stretch Grampa 1.66x sideways and
  // make him useless as a guide.
  backgroundSize: "contain",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  imageRendering: "pixelated",
  opacity: REFERENCE_OPACITY,
};

// Pure-CSS grid lines, one per cell boundary, sized as a fraction of the
// container rather than a fixed pixel spacing so it stays exactly aligned
// with cells at any zoom level with no JS math. A sibling element layered
// above the canvas rather than anything drawn onto it, so it's structurally
// impossible for it to leak into exportPngDataUrl()'s output the way drawing
// it into the pixel buffer itself would risk.
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
  private readonly scene: Phaser.Scene;
  private readonly gridSize: number;
  private readonly onPaint: () => void;
  private readonly onColorPicked?: (color: string | null) => void;
  private readonly onViewChange?: (view: CanvasView) => void;

  private readonly viewport: GameRect;
  private readonly viewportEl: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gridEl: HTMLDivElement;
  private readonly checkerEl: HTMLDivElement;
  private readonly referenceEl: HTMLDivElement;

  private cells: (string | null)[];
  private currentColor: string | null = null;
  private tool: PixelTool = "paint";
  private mirrorX = false;
  private isPointerDown = false;
  private lastActedIndex = -1;
  private currentStrokeChanges: CellChange[] = [];
  private undoStack: CellChange[][] = [];
  private redoStack: CellChange[][] = [];

  private zoomIndex = FIT_INDEX;
  private panX = 0;
  private panY = 0;
  private gridVisible = false;
  /** Set for the duration of a pan drag — the Pan tool, a middle-button drag,
   * or two fingers. Holds where the pan started so the drag is computed from
   * its own origin rather than accumulating rounding per move event. */
  private panDrag?: { clientX: number; clientY: number; panX: number; panY: number };
  /** Live touch points, for the two-finger pan/pinch gesture. */
  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  private readonly boundReposition = (): void => this.reposition();
  private readonly boundPointerDown = (e: PointerEvent): void => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent): void => this.onPointerMove(e);
  private readonly boundPointerUp = (e: PointerEvent): void => this.onPointerUp(e);
  private readonly boundWheel = (e: WheelEvent): void => this.onWheel(e);
  private readonly boundContextMenu = (e: Event): void => e.preventDefault();
  private readonly boundWindowPointerUp = (): void => {
    this.isPointerDown = false;
    this.lastActedIndex = -1;
    this.panDrag = undefined;
    this.applyCursor();
    this.commitStroke();
  };

  constructor(options: PixelCanvasOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.gridSize = options.gridSize ?? PIXEL_GRID_SIZE;
    this.onPaint = options.onPaint;
    this.onColorPicked = options.onColorPicked;
    this.onViewChange = options.onViewChange;
    this.cells = options.initialCells
      ? [...options.initialCells]
      : new Array<string | null>(this.gridSize * this.gridSize).fill(null);

    // The window. Everything else lives inside it and is clipped by it, which
    // is what lets the drawing be four times the size of the space available
    // without pushing a single button off the 468px-tall scene. The border is
    // an inset shadow rather than a real border so it costs no layout: an
    // absolutely-positioned child resolves against the padding box, and a 1px
    // border would silently shift the content by a pixel and shrink the
    // clickable area by two.
    this.viewportEl = document.createElement("div");
    this.viewportEl.style.position = "fixed";
    this.viewportEl.style.overflow = "hidden";
    this.viewportEl.style.zIndex = "998";
    this.viewportEl.style.background = "#12121f";
    this.viewportEl.style.boxShadow = "inset 0 0 0 1px #444444";
    this.viewportEl.style.touchAction = "none"; // a finger-drag paints or pans; it must never also scroll the page
    document.body.appendChild(this.viewportEl);

    // One element that moves and scales, so pan/zoom is a single position
    // write rather than four kept in step. Its children all fill it exactly.
    this.contentEl = document.createElement("div");
    this.contentEl.style.position = "absolute";
    this.viewportEl.appendChild(this.contentEl);

    // Four stacked, identically-sized layers inside the content box. The order
    // is the whole reason the checkerboard is not the canvas's own CSS
    // background:
    //
    //   1  checkerboard   what "transparent" looks like
    //   2  reference      the tracing guide, faint
    //   3  canvas         your actual pixels, fully opaque, transparent-backed
    //   4  grid lines     on top, non-interactive
    //
    // The reference has to be *under* your strokes so it can't wash them out,
    // and *over* the checkerboard so it's legible. Fading it with `opacity` on
    // the canvas itself would fade the artwork with it, hence a layer of its
    // own.
    const fillContent = (el: HTMLElement, z: string): void => {
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.zIndex = z;
    };

    this.checkerEl = document.createElement("div");
    fillContent(this.checkerEl, "1");
    this.checkerEl.style.pointerEvents = "none";
    Object.assign(this.checkerEl.style, CHECKERBOARD_CSS);
    this.contentEl.appendChild(this.checkerEl);

    this.referenceEl = document.createElement("div");
    fillContent(this.referenceEl, "2");
    this.referenceEl.style.pointerEvents = "none";
    this.referenceEl.style.display = "none"; // nothing to trace until one is picked
    Object.assign(this.referenceEl.style, REFERENCE_CSS);
    this.contentEl.appendChild(this.referenceEl);

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.gridSize;
    this.canvas.height = this.gridSize;
    fillContent(this.canvas, "3");
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.cursor = "crosshair";
    this.canvas.style.touchAction = "none";

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.contentEl.appendChild(this.canvas);

    this.gridEl = document.createElement("div");
    fillContent(this.gridEl, "4");
    this.gridEl.style.pointerEvents = "none"; // strokes still go to the canvas underneath
    this.gridEl.style.display = "none"; // off by default — see setGridVisible
    Object.assign(this.gridEl.style, gridLineCss(this.gridSize));
    this.contentEl.appendChild(this.gridEl);

    const view = options.initialView;
    this.zoomIndex = clampZoomIndex(view?.zoomIndex ?? FIT_INDEX);
    this.panX = view?.panX ?? 0;
    this.panY = view?.panY ?? 0;

    this.redrawAll();
    this.applyView({ notify: false });
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointercancel", this.boundPointerUp);
    // Right-click is a quick always-erase gesture (see actAt) regardless
    // of the selected tool/color — the browser's own context menu would
    // otherwise pop up mid-stroke and swallow the rest of the drag.
    this.canvas.addEventListener("contextmenu", this.boundContextMenu);
    // On the window rather than the canvas: at high zoom the pointer is
    // routinely outside the window when it stops, and wheel-to-pan should keep
    // working over the gutter when the drawing is smaller than the window.
    this.viewportEl.addEventListener("wheel", this.boundWheel, { passive: false });
    window.addEventListener("pointerup", this.boundWindowPointerUp);
  }

  setCurrentColor(color: string | null): void {
    this.currentColor = color;
  }

  /** Paint (freehand), Fill (flood-fill the clicked region), Eyedropper
   * (sample a cell's color back into currentColor, see actAt), or Pan (drag
   * the window around a magnified drawing) — see SkinEditorScene's tool-mode
   * buttons. Pan is a tool rather than only a modifier gesture because a
   * touchscreen has no middle button and no wheel. */
  setTool(tool: PixelTool): void {
    this.tool = tool;
    this.applyCursor();
  }

  /** When on, every committed cell change also applies to its horizontal
   * mirror (see setCellWithMirror) — paint, fill, and right-click erase
   * all go through that same path, so all three respect it uniformly. */
  setMirrorX(enabled: boolean): void {
    this.mirrorX = enabled;
  }

  // --- zoom and pan --------------------------------------------------------

  getView(): CanvasView {
    return { zoomIndex: this.zoomIndex, panX: this.panX, panY: this.panY };
  }

  getZoomIndex(): number {
    return this.zoomIndex;
  }

  /** On-screen size of the whole drawing, in game units — larger than the
   * viewport once zoomed past fit. */
  getContentSize(): number {
    return contentSizeFor(this.viewport.width, this.zoomIndex);
  }

  /** False when the whole drawing already fits, in which case it is centred and
   * every pan gesture is a no-op. The caller uses this to say so in the UI
   * rather than leaving people dragging at a thing that cannot move. */
  canPan(): boolean {
    return this.getContentSize() > this.viewport.width;
  }

  /** Steps the zoom ladder about the middle of the window, so whatever you were
   * looking at stays what you are looking at. */
  zoomBy(delta: number): void {
    this.applyZoom(delta, this.viewport.width / 2, this.viewport.height / 2);
  }

  /** Steps the ladder about a point inside the window (game units) — what
   * Ctrl+wheel and pinch use, so zooming happens where the pointer is. */
  zoomAt(delta: number, anchorX: number, anchorY: number): void {
    this.applyZoom(delta, anchorX, anchorY);
  }

  /** Back to "the whole sprite, exactly filling the window". */
  fitToViewport(): void {
    this.zoomIndex = FIT_INDEX;
    this.applyView();
  }

  private applyZoom(delta: number, anchorX: number, anchorY: number): void {
    const next = stepZoomIndex(this.zoomIndex, delta);
    if (next === this.zoomIndex) return;
    const oldSize = this.getContentSize();
    const newSize = contentSizeFor(this.viewport.width, next);
    this.zoomIndex = next;
    this.panX = panForAnchor(this.panX, oldSize, newSize, anchorX, this.viewport.width);
    this.panY = panForAnchor(this.panY, oldSize, newSize, anchorY, this.viewport.height);
    this.applyView();
  }

  private panBy(dx: number, dy: number): void {
    if (!this.canPan()) return;
    this.panX += dx;
    this.panY += dy;
    this.applyView();
  }

  /** The single place pan/zoom state becomes pixels. Clamps first (so no caller
   * can leave the drawing off in a corner), then writes the content box, the
   * grid's effective visibility and the cursor, then reports. */
  private applyView(options?: { notify?: boolean }): void {
    const size = this.getContentSize();
    this.panX = clampPan(this.panX, size, this.viewport.width);
    this.panY = clampPan(this.panY, size, this.viewport.height);
    this.reposition();
    this.applyGridVisibility();
    this.applyCursor();
    if (options?.notify !== false) this.onViewChange?.(this.getView());
  }

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.applyGridVisibility();
  }

  /** Honours the toggle, but not below MIN_GRID_CELL_PX per cell — see its
   * docstring. Deliberately does not flip `gridVisible` itself, so zooming back
   * in restores the lines rather than silently having switched them off. */
  private applyGridVisibility(): void {
    const cellPx = this.getContentSize() / this.gridSize;
    this.gridEl.style.display = this.gridVisible && cellPx >= MIN_GRID_CELL_PX ? "block" : "none";
  }

  private applyCursor(): void {
    if (this.panDrag) this.canvas.style.cursor = "grabbing";
    else if (this.tool === "pan") this.canvas.style.cursor = this.canPan() ? "grab" : "not-allowed";
    else this.canvas.style.cursor = "crosshair";
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

  /**
   * Shows `dataUrl` faintly behind the pixels as a tracing guide, or clears it
   * with null. Purely a view state — it is never read back, never saved, and
   * cannot reach exportPngDataUrl, which serializes the canvas bitmap alone.
   */
  setReferenceImage(dataUrl: string | null): void {
    if (!dataUrl) {
      this.referenceEl.style.display = "none";
      this.referenceEl.style.backgroundImage = "";
      return;
    }
    this.referenceEl.style.backgroundImage = `url("${dataUrl}")`;
    this.referenceEl.style.display = "block";
  }

  /**
   * Stamps a whole grid over the current one as a single undoable step — the
   * "trace this in as a starting point" action.
   *
   * Deliberately *not* loadCells: that resets the undo history because it means
   * "a different skin is now open". Stamping is an edit like any other, and
   * being able to take it back is most of the point — you try tracing
   * something in, decide you preferred your own version, and press Undo.
   */
  stampCells(cells: readonly (string | null)[]): void {
    for (let i = 0; i < this.cells.length; i++) {
      // setCell already skips a no-op and records the previous value, so a
      // stamp that changes nothing leaves the undo stack alone.
      this.setCell(i, cells[i] ?? null);
    }
    this.commitStroke();
    this.onPaint();
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

  /** Unchanged by the zoom rework, and deliberately so: it reads the canvas
   * element's own on-screen box, which already reflects whatever zoom and pan
   * are doing. Nothing here needs to know either exists. */
  private cellIndexFromEvent(e: PointerEvent): number | null {
    const box = this.canvas.getBoundingClientRect();
    const cellW = box.width / this.gridSize;
    const cellH = box.height / this.gridSize;
    const x = Math.floor((e.clientX - box.left) / cellW);
    const y = Math.floor((e.clientY - box.top) / cellH);
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return null;
    return y * this.gridSize + x;
  }

  /** Game units per CSS pixel — the inverse of what positionOverlay applies,
   * needed to turn a drag in real screen pixels back into a pan. */
  private gameUnitsPerPixel(): number {
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    if (canvasRect.width === 0) return 1;
    return this.scene.scale.width / canvasRect.width;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "touch") {
      this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touchPoints.size === 2) {
        // A second finger means "move the view", never "keep painting" — end
        // whatever stroke the first finger had started so it commits cleanly
        // rather than smearing across the pinch.
        this.isPointerDown = false;
        this.lastActedIndex = -1;
        this.commitStroke();
        this.pinchDistance = this.touchDistance();
        return;
      }
      if (this.touchPoints.size > 2) return;
    }

    // Middle button pans regardless of tool: left paints and right erases, so
    // it is the one button with nothing else to do.
    const middleButton = (e.buttons & 4) !== 0;
    if (this.tool === "pan" || middleButton) {
      if (!this.canPan()) return;
      this.panDrag = { clientX: e.clientX, clientY: e.clientY, panX: this.panX, panY: this.panY };
      this.canvas.setPointerCapture(e.pointerId);
      this.applyCursor();
      return;
    }

    this.isPointerDown = true;
    this.lastActedIndex = -1;
    this.currentStrokeChanges = [];
    this.actAt(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === "touch" && this.touchPoints.has(e.pointerId)) {
      this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touchPoints.size === 2) {
        this.handlePinch();
        return;
      }
    }

    if (this.panDrag) {
      const units = this.gameUnitsPerPixel();
      this.panX = this.panDrag.panX + (e.clientX - this.panDrag.clientX) * units;
      this.panY = this.panDrag.panY + (e.clientY - this.panDrag.clientY) * units;
      this.applyView();
      return;
    }

    if (!this.isPointerDown) return;
    // Fill and Eyedropper are one-shot-per-press, not drag-continuous —
    // dragging with Fill active would otherwise re-flood-fill (usually a
    // no-op after the first cell, but wasted work) on every cell the
    // pointer crosses, and a dragged Eyedropper would keep resampling
    // instead of settling on the cell you actually meant to pick.
    if (this.tool !== "paint") return;
    this.actAt(e);
  }

  private onPointerUp(e: PointerEvent): void {
    this.touchPoints.delete(e.pointerId);
    if (this.touchPoints.size < 2) this.pinchDistance = 0;
    if (this.panDrag && this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    // The rest (committing the stroke, clearing panDrag) is the window-level
    // handler's job, which also catches a pointer released off the canvas.
  }

  private touchDistance(): number {
    const [a, b] = [...this.touchPoints.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Two fingers: their midpoint pans, and spreading/closing them steps the
   * zoom ladder. Stepped rather than continuous because the ladder is discrete
   * — the baseline resets on each step so a long pinch keeps zooming. */
  private handlePinch(): void {
    const distance = this.touchDistance();
    if (distance === 0 || this.pinchDistance === 0) {
      this.pinchDistance = distance;
      return;
    }
    const ratio = distance / this.pinchDistance;
    if (ratio > PINCH_STEP_RATIO || ratio < 1 / PINCH_STEP_RATIO) {
      const [a, b] = [...this.touchPoints.values()];
      const box = this.viewportEl.getBoundingClientRect();
      const units = this.gameUnitsPerPixel();
      this.zoomAt(
        ratio > 1 ? 1 : -1,
        ((a.x + b.x) / 2 - box.left) * units,
        ((a.y + b.y) / 2 - box.top) * units,
      );
      this.pinchDistance = distance;
    }
  }

  /**
   * Wheel pans; Ctrl/Cmd+wheel zooms at the pointer. This is the pan gesture
   * that needs no mode switch and no second button, so it is the one most
   * people will use without being told.
   *
   * preventDefault unconditionally: an unhandled wheel scrolls the page out
   * from under the game, and an unhandled Ctrl+wheel triggers the browser's own
   * page zoom, which is emphatically not what someone magnifying a sprite
   * means.
   */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Line-mode deltas (Firefox) are in rows, not pixels; roughly a text line.
    const step = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const box = this.viewportEl.getBoundingClientRect();
      const units = this.gameUnitsPerPixel();
      this.zoomAt(e.deltaY < 0 ? 1 : -1, (e.clientX - box.left) * units, (e.clientY - box.top) * units);
      return;
    }
    const units = this.gameUnitsPerPixel();
    this.panBy(-e.deltaX * step * units, -e.deltaY * step * units);
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
   * if the drawing isn't already symmetric. Both grid sizes are even, so
   * every column has a distinct mirror (no self-mirroring center column to
   * guard against). */
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

  /** The window is placed by the shared overlay helper exactly as before; the
   * content box inside it is then placed in the same CSS-pixel scale, so both
   * survive a browser resize and Phaser's FIT letterboxing without any of the
   * four art layers needing to know about either. */
  private reposition(): void {
    positionOverlay(this.scene, this.viewportEl, this.viewport);
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const scale = canvasRect.width / this.scene.scale.width;
    const size = this.getContentSize();
    this.contentEl.style.left = `${this.panX * scale}px`;
    this.contentEl.style.top = `${this.panY * scale}px`;
    this.contentEl.style.width = `${size * scale}px`;
    this.contentEl.style.height = `${size * scale}px`;
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerUp);
    this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
    this.viewportEl.removeEventListener("wheel", this.boundWheel);
    window.removeEventListener("pointerup", this.boundWindowPointerUp);
    this.viewportEl.remove(); // takes the content box and all four layers with it
  }
}
