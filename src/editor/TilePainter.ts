import Phaser from "phaser";
import { groundFrameAt } from "../level/groundAutotile";
import { EDGE_GID_BASE, EDGE_NONE, edgeMaskAt } from "../level/groundEdges";
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
    /** The silhouette overlay above `layer` — see groundEdges.ts. Optional so a
     * caller that only cares about the ground grid (a test, a future headless
     * path) still works; the edge pass is then simply skipped. */
    private readonly edgeLayer?: Phaser.Tilemaps.TilemapLayer,
  ) {}

  paint(tileX: number, tileY: number, tileIndex: number): boolean {
    if (!this.inBounds(tileX, tileY)) return false;
    if (this.level.layers.ground[tileY][tileX] === tileIndex) return false;

    this.level.layers.ground[tileY][tileX] = tileIndex;
    this.renderCell(tileX, tileY);

    // Changing one cell changes what its four orthogonal neighbours look like,
    // so all four are re-rendered too:
    //
    //  - the cell **below** may have gained or lost a neighbour above it, which
    //    is what decides grass-top vs. buried-fill (groundAutotile.ts);
    //  - **all four** may have gained or lost an exposed side, which is what
    //    decides their outline (groundEdges.ts).
    //
    // Diagonals are deliberately not refreshed: neither rule looks at them, and
    // widening this to the full 8 would be work per paint that can never change
    // anything.
    for (const [dx, dy] of NEIGHBOURS) this.renderCell(tileX + dx, tileY + dy);
    return true;
  }

  private renderCell(tileX: number, tileY: number): void {
    if (!this.inBounds(tileX, tileY)) return;
    const value = this.level.layers.ground[tileY][tileX];
    if (value === EMPTY_TILE) {
      this.layer.removeTileAt(tileX, tileY);
    } else {
      this.layer.putTileAt(groundFrameAt(this.level.layers.ground, tileX, tileY), tileX, tileY);
    }
    this.renderEdge(tileX, tileY);
  }

  private renderEdge(tileX: number, tileY: number): void {
    if (!this.edgeLayer) return;
    const mask = edgeMaskAt(this.level.layers.ground, tileX, tileY);
    // Offset into the overlay tileset's own gid range — see EDGE_GID_BASE.
    if (mask === EDGE_NONE) this.edgeLayer.removeTileAt(tileX, tileY);
    else this.edgeLayer.putTileAt(EDGE_GID_BASE + mask, tileX, tileY);
  }

  private inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.level.width && tileY < this.level.height;
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
];
