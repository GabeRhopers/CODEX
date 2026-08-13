import {
  BOUNCE_CASTLE_TILE,
  BOUNCE_TILE,
  BRICK_CASTLE_TILE,
  BRICK_TILE,
  EMPTY_TILE,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  GROUND_SNOW_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "./LevelSchema";

/**
 * The ground layer stores one value per cell: empty, a ground-skin block
 * (grass/desert/castle/snow — each merges with its own-skin neighbors,
 * see below), or a fixed-look block (a skin's brick/bounce, or the
 * water/lava hazard). Which *frame* of the combined multi-skin tileset a
 * cell renders as is derived here, never stored.
 *
 * All four skins' 5-frame tileset images (top/fill/brick/bounce/hazard —
 * see generateTextures.ts and prepare-kenney-assets.py) are registered as
 * separate Phaser Tilesets on the same TilemapLayer, each claiming a
 * 5-wide gid range in GROUND_SKINS order (see groundSkins.ts) — grass
 * 0-4, desert 5-9, castle 10-14, snow 15-19. GROUND_KIND_FRAMES/
 * FIXED_FRAMES below are that same layout expressed as a lookup, so a
 * stored tile value maps straight to a global frame index without the
 * tilemap ever needing to know which *texture* it came from.
 */
interface SkinFrames {
  top: number;
  fill: number;
}

const GROUND_KIND_FRAMES: Record<number, SkinFrames> = {
  [GROUND_GRASS_TILE]: { top: 0, fill: 1 },
  [GROUND_DESERT_TILE]: { top: 5, fill: 6 },
  [GROUND_CASTLE_TILE]: { top: 10, fill: 11 },
  [GROUND_SNOW_TILE]: { top: 15, fill: 16 },
};

/** Brick/Bounce/Water are shared pixel-for-pixel across grass/desert/snow
 * (see prepare-kenney-assets.py) — any one of those three skins' tileset
 * slot works, so grass's (gid range 0-4) is what's used here. Castle's
 * versions (plus lava, its stand-in for water) are its own procedural
 * frames, at its own gid range (10-14). */
const FIXED_FRAMES: Record<number, number> = {
  [BRICK_TILE]: 2,
  [BRICK_CASTLE_TILE]: 12,
  [BOUNCE_TILE]: 3,
  [BOUNCE_CASTLE_TILE]: 13,
  [WATER_TILE]: 4,
  [LAVA_TILE]: 14,
};

export const GROUND_FRAME_BRICK = FIXED_FRAMES[BRICK_TILE];
export const GROUND_FRAME_BOUNCE = FIXED_FRAMES[BOUNCE_TILE];
export const GROUND_FRAME_WATER = FIXED_FRAMES[WATER_TILE];

/** Frames the player can bounce off, across every skin — checked with
 * `.has()` at the two call sites (PlayScene's landing check and its
 * collision setup) instead of a single `===` now that Bounce has two
 * looks. */
export const BOUNCE_FRAMES = new Set([FIXED_FRAMES[BOUNCE_TILE], FIXED_FRAMES[BOUNCE_CASTLE_TILE]]);

/** Frames that are a hazard rather than solid ground — Water and its
 * castle counterpart, Lava. Same `.has()` pattern as BOUNCE_FRAMES. */
export const HAZARD_FRAMES = new Set([FIXED_FRAMES[WATER_TILE], FIXED_FRAMES[LAVA_TILE]]);

export function groundFrameAt(grid: number[][], x: number, y: number): number {
  const value = grid[y][x];
  const fixed = FIXED_FRAMES[value];
  if (fixed !== undefined) return fixed;
  const kind = GROUND_KIND_FRAMES[value];
  const above = grid[y - 1]?.[x];
  const buried = above !== undefined && above !== EMPTY_TILE;
  return buried ? kind.fill : kind.top;
}

/** Derives a full render grid (frame indices, or EMPTY_TILE) from a stored
 * ground grid — for building/rebuilding a whole tilemap at once. */
export function buildRenderGrid(grid: number[][]): number[][] {
  return grid.map((row, y) => row.map((cell, x) => (cell === EMPTY_TILE ? EMPTY_TILE : groundFrameAt(grid, x, y))));
}
