import Phaser from "phaser";
import { groundFrameAt } from "../level/groundAutotile";
import { EMPTY_TILE, LevelArea } from "../level/LevelSchema";

/**
 * The single mutator for the editable ground layer. Every paint/erase in
 * EditorScene goes through TilePainter#paint so that (a) the area's grid
 * and the visible TilemapLayer never fall out of sync, and (b)
 * PaintTileCommand can wrap this one function for undo/redo instead of
 * every pointer-handling call site needing to know about tiles.
 *
 * Bound to one `LevelArea` (Main, Sub, or Up — see "Sub/Up areas" under
 * Art) at a time, not the whole `LevelData` — EditorScene constructs a
 * fresh one whenever the area being edited switches, same as EntityPlacer.
 *
 * Drag debouncing ("only paint when the pointer reaches a new cell") lives
 * in EditorScene, not here — it needs to read the pre-paint tile index at
 * the same moment it decides whether to paint, to build an accurate
 * PaintTileCommand.
 */
export class TilePainter {
  constructor(
    private readonly level: LevelArea,
    private readonly layer: Phaser.Tilemaps.TilemapLayer,
  ) {}

  paint(tileX: number, tileY: number, tileIndex: number): boolean {
    if (!this.inBounds(tileX, tileY)) return false;
    if (this.level.layers.ground[tileY][tileX] === tileIndex) return false;

    this.level.layers.ground[tileY][tileX] = tileIndex;
    this.renderCell(tileX, tileY);

    // The cell directly below just gained/lost a neighbor above it, which
    // is the only thing its rendered frame (grass-top vs. buried-fill)
    // depends on — see groundAutotile.ts.
    if (this.inBounds(tileX, tileY + 1) && this.level.layers.ground[tileY + 1][tileX] !== EMPTY_TILE) {
      this.renderCell(tileX, tileY + 1);
    }
    return true;
  }

  private renderCell(tileX: number, tileY: number): void {
    const value = this.level.layers.ground[tileY][tileX];
    if (value === EMPTY_TILE) {
      this.layer.removeTileAt(tileX, tileY);
    } else {
      this.layer.putTileAt(groundFrameAt(this.level.layers.ground, tileX, tileY), tileX, tileY);
    }
  }

  private inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.level.width && tileY < this.level.height;
  }
}
