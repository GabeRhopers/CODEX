import Phaser from "phaser";
import { GameRect, positionOverlay } from "./domOverlay";

export const PIXEL_GRID_SIZE = 32;
const CELL_COUNT = PIXEL_GRID_SIZE * PIXEL_GRID_SIZE;

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
 * bilinear-downscaled to fit.
 *
 * `cells` (a flat, row-major array of hex colors or `null` for
 * transparent) is the actual source of truth; the canvas is just this
 * array's current rendering, redrawn one cell at a time as strokes
 * happen rather than recomputed from the canvas's own pixel data.
 */
export class PixelCanvasOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cells: (string | null)[];
  private currentColor: string | null = null;
  private isPointerDown = false;
  private lastPaintedIndex = -1;
  private readonly boundReposition = (): void => this.reposition();
  private readonly boundPointerDown = (e: PointerEvent): void => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent): void => this.onPointerMove(e);
  private readonly boundWindowPointerUp = (): void => {
    this.isPointerDown = false;
    this.lastPaintedIndex = -1;
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rect: GameRect,
    initialCells: (string | null)[] | undefined,
    private readonly onPaint: () => void,
  ) {
    this.cells = initialCells ? [...initialCells] : new Array<string | null>(CELL_COUNT).fill(null);

    this.canvas = document.createElement("canvas");
    this.canvas.width = PIXEL_GRID_SIZE;
    this.canvas.height = PIXEL_GRID_SIZE;
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

    this.redrawAll();
    this.reposition();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundWindowPointerUp);
  }

  setCurrentColor(color: string | null): void {
    this.currentColor = color;
  }

  loadCells(cells: (string | null)[]): void {
    this.cells = [...cells];
    this.redrawAll();
  }

  getCells(): (string | null)[] {
    return [...this.cells];
  }

  clearAll(): void {
    this.cells = new Array<string | null>(CELL_COUNT).fill(null);
    this.redrawAll();
    this.onPaint();
  }

  exportPngDataUrl(): string {
    return this.canvas.toDataURL("image/png");
  }

  private cellIndexFromEvent(e: PointerEvent): number | null {
    const box = this.canvas.getBoundingClientRect();
    const cellW = box.width / PIXEL_GRID_SIZE;
    const cellH = box.height / PIXEL_GRID_SIZE;
    const x = Math.floor((e.clientX - box.left) / cellW);
    const y = Math.floor((e.clientY - box.top) / cellH);
    if (x < 0 || x >= PIXEL_GRID_SIZE || y < 0 || y >= PIXEL_GRID_SIZE) return null;
    return y * PIXEL_GRID_SIZE + x;
  }

  private onPointerDown(e: PointerEvent): void {
    this.isPointerDown = true;
    this.lastPaintedIndex = -1;
    this.paintAt(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isPointerDown) return;
    this.paintAt(e);
  }

  // Debounced to "only the first time this stroke touches a given cell,"
  // same shape as EditorScene's own drag-paint (dragLastX/dragLastY) —
  // without it, a slow drag would fire dozens of redundant same-color
  // repaints of one cell as the pointer lingers over it.
  private paintAt(e: PointerEvent): void {
    const index = this.cellIndexFromEvent(e);
    if (index === null || index === this.lastPaintedIndex) return;
    this.lastPaintedIndex = index;
    this.cells[index] = this.currentColor;
    this.redrawCell(index);
    this.onPaint();
  }

  private redrawCell(index: number): void {
    const x = index % PIXEL_GRID_SIZE;
    const y = Math.floor(index / PIXEL_GRID_SIZE);
    const color = this.cells[index];
    if (color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, 1, 1);
    } else {
      this.ctx.clearRect(x, y, 1, 1);
    }
  }

  private redrawAll(): void {
    this.ctx.clearRect(0, 0, PIXEL_GRID_SIZE, PIXEL_GRID_SIZE);
    for (let i = 0; i < this.cells.length; i++) this.redrawCell(i);
  }

  private reposition(): void {
    positionOverlay(this.scene, this.canvas, this.rect);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundWindowPointerUp);
    this.canvas.remove();
  }
}
