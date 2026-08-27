import { TILE_SIZE } from "../config/gameConfig";
import { GROUND_SKINS } from "./groundSkins";
import {
  BRICK_CASTLE_TILE,
  BRICK_TILE,
  EMPTY_TILE,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  GROUND_SNOW_TILE,
} from "./LevelSchema";

/**
 * Where a ground mass *ends*, so its silhouette can be outlined.
 *
 * prepare-kenney-assets.py strips a 2px border off every ground tile
 * (TERRAIN_BORDER_PX) so that adjacent ground merges into one mass rather than
 * each tile showing its own box. That is right for the interior and leaves the
 * outside with no edge at all: grass's `top` frame is a green cap over bare
 * dirt, and its `fill` frame is bare dirt on all four sides. So the fix is not
 * to put the border back — it is to draw one only where the mass actually ends.
 *
 * The whole thing is **three bits**, not an autotile table. An outline
 * *composes*: put a band on each exposed side, inset into the cell, and corners
 * fall out of the geometry rather than needing to be enumerated.
 *
 *  - A **convex** corner (the bottom-left of a platform) is two bands meeting
 *    inside one cell.
 *  - A **concave** corner (an inner notch) is two bands in two *different*
 *    cells, meeting at the grid point they share. Nothing encodes it; it just
 *    happens.
 *  - Two masses touching only **diagonally** each keep their own full rim.
 *
 * That is why this is 8 frames and not the 16 of a 4-bit autotiler or the 47 of
 * a blob one — either of which would also have meant re-authoring four
 * tilesets, moving the 6-wide gid stride, and asking the Skin Creator to paint
 * sixteen frames per ground brush.
 *
 * Pure data and rules — no Phaser, no DOM — so generateTextures.ts, the editor
 * and the runtime all read one answer, and it unit-tests the way
 * groundAutotile.ts does.
 */

export const EDGE_LEFT = 1;
export const EDGE_RIGHT = 2;
export const EDGE_BOTTOM = 4;
/** No side exposed: an interior cell, which draws no overlay tile at all. */
export const EDGE_NONE = 0;
/** How many distinct masks exist — the overlay strip's frame count. */
export const EDGE_FRAME_COUNT = 8;

/**
 * There is no top bit, deliberately. Every ground kind's `top` frame already
 * *is* its own edge treatment (grass's cap, snow's crust, castle's lighter
 * course), so a band there would be a second edge drawn over the first.
 */

/**
 * Blocks that get outlined.
 *
 * Ground only. Brick already carries its own border — prepare-kenney-assets.py
 * keeps it on purpose, because brick is meant to read as a discrete block
 * rather than as terrain. Bounce is a pad whose cell is transparent above
 * y=10. Water and lava are fluid, and boxing them in would make them read as
 * solid blocks, which is the one thing their art is trying not to do.
 */
const OUTLINED_TILES = new Set([GROUND_GRASS_TILE, GROUND_DESERT_TILE, GROUND_CASTLE_TILE, GROUND_SNOW_TILE]);

/**
 * Neighbours that suppress a band — the tiles whose art fills the *whole* cell,
 * so that butting up against one leaves no silhouette to draw.
 *
 * Checked against the actual art rather than assumed: brick fills its cell (and
 * castle's `drawBrick` fills then strokes), while `drawBounce` starts at y=10
 * and leaves the top third transparent. Water and lava are excluded too, so
 * ground draws an edge against water — which reads as a shoreline, and is the
 * behaviour you want.
 *
 * Two *different* ground skins meeting suppress each other, because they are
 * one mass with a material change through it, not two masses.
 */
const FILLS_CELL = new Set([
  GROUND_GRASS_TILE,
  GROUND_DESERT_TILE,
  GROUND_CASTLE_TILE,
  GROUND_SNOW_TILE,
  BRICK_TILE,
  BRICK_CASTLE_TILE,
]);

/**
 * Whether the world outside the grid counts as filled.
 *
 * `false`, so ground running to the level boundary is outlined there like
 * anywhere else and the level reads as a self-contained slab. This also matches
 * the convention groundAutotile.ts already follows: `groundFrameAt` treats a
 * missing row above as open air, so a tile on row 0 shows its cap rather than a
 * buried fill. One constant, and flipping it is the whole of the other
 * behaviour.
 */
const OUT_OF_BOUNDS_FILLS_CELL = false;

function fillsCellAt(grid: readonly (readonly number[])[], x: number, y: number): boolean {
  const row = grid[y];
  if (!row || x < 0 || x >= row.length) return OUT_OF_BOUNDS_FILLS_CELL;
  return FILLS_CELL.has(row[x]);
}

/**
 * Which sides of one cell are exposed, as a bitmask — or `EDGE_NONE` for a cell
 * that isn't outlined at all (empty, or a block that carries its own edge).
 */
export function edgeMaskAt(grid: readonly (readonly number[])[], x: number, y: number): number {
  const value = grid[y]?.[x];
  if (value === undefined || value === EMPTY_TILE || !OUTLINED_TILES.has(value)) return EDGE_NONE;
  let mask = EDGE_NONE;
  if (!fillsCellAt(grid, x - 1, y)) mask |= EDGE_LEFT;
  if (!fillsCellAt(grid, x + 1, y)) mask |= EDGE_RIGHT;
  if (!fillsCellAt(grid, x, y + 1)) mask |= EDGE_BOTTOM;
  return mask;
}

/**
 * A whole grid's worth of masks, with `EMPTY_TILE` wherever no overlay tile
 * should be placed — the same shape and the same "-1 means nothing here"
 * convention as groundAutotile.buildRenderGrid, so the two can be built and
 * consumed side by side.
 */
export function buildEdgeGrid(grid: readonly (readonly number[])[]): number[][] {
  return grid.map((row, y) =>
    row.map((_, x) => {
      const mask = edgeMaskAt(grid, x, y);
      return mask === EDGE_NONE ? EMPTY_TILE : mask;
    }),
  );
}

/** How far the band reaches into the cell. 3px at 32px reads as a rim at the
 * game's normal scale without eating the tile's own pattern — and it is close
 * to the 2px the source art used to carry on every side. */
export const EDGE_BAND_PX = 3;

export interface EdgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The band for one mask, as **non-overlapping** rectangles.
 *
 * This is the corner fix, and it is the only part of the whole feature that
 * isn't free. The bands are drawn translucent so they darken whatever ground
 * art (or painted skin) is underneath. Drawn as three plain full-length
 * rectangles they would overlap in the 3x3px square where two meet, and alpha
 * compounds — putting a visibly darker dot on the outside of every convex
 * corner. Insetting the bottom band by the width of whichever vertical bands
 * are already being drawn covers exactly the same pixels with no double
 * coverage.
 *
 * The rectangles are the optimisation; `coversPixel` below is the definition,
 * and the tests hold the two against each other.
 */
export function edgeBandRects(mask: number, size = TILE_SIZE, band = EDGE_BAND_PX): EdgeRect[] {
  const rects: EdgeRect[] = [];
  const left = (mask & EDGE_LEFT) !== 0;
  const right = (mask & EDGE_RIGHT) !== 0;
  if (left) rects.push({ x: 0, y: 0, width: band, height: size });
  if (right) rects.push({ x: size - band, y: 0, width: band, height: size });
  if ((mask & EDGE_BOTTOM) !== 0) {
    // Starts after the left band and stops before the right one, so the corners
    // where they meet are covered exactly once.
    const from = left ? band : 0;
    const to = right ? size - band : size;
    if (to > from) rects.push({ x: from, y: size - band, width: to - from, height: band });
  }
  return rects;
}

/** Whether a pixel is part of the band — the plain statement of the rule the
 * rectangles above encode more efficiently. Exists for the tests to check the
 * decomposition against, and is the thing to change if the band itself ever
 * changes shape. */
export function coversPixel(mask: number, px: number, py: number, size = TILE_SIZE, band = EDGE_BAND_PX): boolean {
  if ((mask & EDGE_LEFT) !== 0 && px < band) return true;
  if ((mask & EDGE_RIGHT) !== 0 && px >= size - band) return true;
  if ((mask & EDGE_BOTTOM) !== 0 && py >= size - band) return true;
  return false;
}

/** The overlay strip generated from `edgeBandRects` (see generateTextures.ts)
 * and registered as its own Tileset above the ground layer. Named here, beside
 * the masks that index into it, so the two can't drift apart. */
export const GROUND_EDGE_TEXTURE_KEY = "tile-ground-edges";

/**
 * Where the overlay strip's frames start in the tilemap's gid space.
 *
 * Gids are per-*tilemap*, not per-layer, and the ground layer's four tilesets
 * already claim 0-23 (see groundAutotile.ts's frame table). So a raw 0-7 mask
 * put into the overlay layer would index into grass's own frames instead — the
 * overlay would render the wrong art, or nothing at all. Every render site adds
 * this; `buildEdgeGrid` deliberately does not, so the masks stay small and
 * readable in tests.
 *
 * Derived rather than written as `24` so it tracks the ground layer if the
 * per-skin stride ever changes; groundEdges.test.ts holds it against
 * groundStrip.ts's own STRIP_LENGTH.
 */
export const GROUND_TILESET_STRIDE = 6;
export const EDGE_GID_BASE = GROUND_SKINS.length * GROUND_TILESET_STRIDE;
