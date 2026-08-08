import Phaser from "phaser";
import { EMPTY_TILE, LevelData } from "../level/LevelSchema";

/**
 * The single mutator for the editable ground layer. Every paint/erase in
 * EditorScene goes through TilePainter#paint so that (a) the LevelData
 * grid and the visible TilemapLayer never fall out of sync, and (b) a
 * later undo/redo milestone can wrap this one function instead of
 * touching every pointer-handling call site.
 */
export class TilePainter {
  private lastPaintedX = -1;
  private lastPaintedY = -1;

  constructor(
    private readonly level: LevelData,
    private readonly layer: Phaser.Tilemaps.TilemapLayer,
  ) {}

  paint(tileX: number, tileY: number, tileIndex: number): boolean {
    if (!this.inBounds(tileX, tileY)) return false;
    if (this.level.layers.ground[tileY][tileX] === tileIndex) return false;

    this.level.layers.ground[tileY][tileX] = tileIndex;
    if (tileIndex === EMPTY_TILE) {
      this.layer.removeTileAt(tileX, tileY);
    } else {
      this.layer.putTileAt(tileIndex, tileX, tileY);
    }
    return true;
  }

  /** Debounce helper: only paints when the pointer has moved to a new cell. */
  paintIfNewCell(tileX: number, tileY: number, tileIndex: number): boolean {
    if (tileX === this.lastPaintedX && tileY === this.lastPaintedY) return false;
    this.lastPaintedX = tileX;
    this.lastPaintedY = tileY;
    return this.paint(tileX, tileY, tileIndex);
  }

  resetDrag(): void {
    this.lastPaintedX = -1;
    this.lastPaintedY = -1;
  }

  private inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.level.width && tileY < this.level.height;
  }
}
