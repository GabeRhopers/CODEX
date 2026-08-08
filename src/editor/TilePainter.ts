import Phaser from "phaser";
import { EMPTY_TILE, LevelData } from "../level/LevelSchema";

/**
 * The single mutator for the editable ground layer. Every paint/erase in
 * EditorScene goes through TilePainter#paint so that (a) the LevelData
 * grid and the visible TilemapLayer never fall out of sync, and (b)
 * PaintTileCommand can wrap this one function for undo/redo instead of
 * every pointer-handling call site needing to know about tiles.
 *
 * Drag debouncing ("only paint when the pointer reaches a new cell") lives
 * in EditorScene, not here — it needs to read the pre-paint tile index at
 * the same moment it decides whether to paint, to build an accurate
 * PaintTileCommand.
 */
export class TilePainter {
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

  private inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.level.width && tileY < this.level.height;
  }
}
