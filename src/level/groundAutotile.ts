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
 * see below), a fixed-look block (a skin's brick/bounce), or a hazard
 * block (water/lava — buried-aware like ground, see below). Which
 * *frame* of the combined multi-skin tileset a cell renders as is
 * derived here, never stored.
 *
 * All four skins' 6-frame tileset images (top/fill/brick/bounce/hazard-
 * top/hazard-fill — see generateTextures.ts, prepare-kenney-assets.py,
 * and scripts/add-water-depth-frame.py) are registered as separate
 * Phaser Tilesets on the same TilemapLayer, each claiming a 6-wide gid
 * range in GROUND_SKINS order (see groundSkins.ts) — grass 0-5, desert
 * 6-11, castle 12-17, snow 18-23. GROUND_KIND_FRAMES/HAZARD_KIND_FRAMES/
 * FIXED_FRAMES below are that same layout expressed as a lookup, so a
 * stored tile value maps straight to a global frame index without the
 * tilemap ever needing to know which *texture* it came from.
 */
interface TopFillFrames {
  top: number;
  fill: number;
}

const GROUND_KIND_FRAMES: Record<number, TopFillFrames> = {
  [GROUND_GRASS_TILE]: { top: 0, fill: 1 },
  [GROUND_DESERT_TILE]: { top: 6, fill: 7 },
  [GROUND_CASTLE_TILE]: { top: 12, fill: 13 },
  [GROUND_SNOW_TILE]: { top: 18, fill: 19 },
};

/** Water/Lava autotile the same way ground does — a "top" frame (open
 * air/nothing directly above) vs. a "fill" frame (another hazard cell
 * directly above, i.e. genuinely submerged/buried rather than the true
 * surface) — see scripts/add-water-depth-frame.py for how water's fill
 * frame was derived, and generateTextures.ts's drawLava for why lava's
 * two frames are deliberately identical (it stays a hazard regardless of
 * depth, unlike water — see PlayScene's swim handling). */
const HAZARD_KIND_FRAMES: Record<number, TopFillFrames> = {
  [WATER_TILE]: { top: 4, fill: 5 },
  [LAVA_TILE]: { top: 16, fill: 17 },
};

/** Brick/Bounce are shared pixel-for-pixel across grass/desert/snow (see
 * prepare-kenney-assets.py) — any one of those three skins' tileset slot
 * works, so grass's (gid range 0-5) is what's used here. Castle's
 * versions are its own procedural frames, at its own gid range (12-17). */
const FIXED_FRAMES: Record<number, number> = {
  [BRICK_TILE]: 2,
  [BRICK_CASTLE_TILE]: 14,
  [BOUNCE_TILE]: 3,
  [BOUNCE_CASTLE_TILE]: 15,
};

export const GROUND_FRAME_BRICK = FIXED_FRAMES[BRICK_TILE];
export const GROUND_FRAME_BOUNCE = FIXED_FRAMES[BOUNCE_TILE];
export const GROUND_FRAME_WATER = HAZARD_KIND_FRAMES[WATER_TILE].top;

/** Frames the player can bounce off, across every skin — checked with
 * `.has()` at the two call sites (PlayScene's landing check and its
 * collision setup) instead of a single `===` now that Bounce has two
 * looks. */
export const BOUNCE_FRAMES = new Set([FIXED_FRAMES[BOUNCE_TILE], FIXED_FRAMES[BOUNCE_CASTLE_TILE]]);

/** Water is swimmable, not solid and not damaging — see PlayScene's
 * update() — but still needs excluding from ground collision the same
 * way HAZARD_FRAMES does, so both top and fill frames are covered here.
 * Deliberately a separate set from HAZARD_FRAMES rather than merged with
 * it, now that the two behave completely differently in PlayScene. */
export const WATER_FRAMES = new Set([HAZARD_KIND_FRAMES[WATER_TILE].top, HAZARD_KIND_FRAMES[WATER_TILE].fill]);

/** Frames that are an instant hazard rather than solid ground — Lava
 * only, as of the water/swim rework (see PlayScene's HAZARD_FRAMES
 * check and WATER_FRAMES above). Both of lava's frames are covered even
 * though they're visually identical (see HAZARD_KIND_FRAMES) — a level
 * built before this pass could still have a "buried" lava cell, and it
 * needs to keep hurting exactly like an exposed one. */
export const HAZARD_FRAMES = new Set([HAZARD_KIND_FRAMES[LAVA_TILE].top, HAZARD_KIND_FRAMES[LAVA_TILE].fill]);

export function groundFrameAt(grid: number[][], x: number, y: number): number {
  const value = grid[y][x];
  const fixed = FIXED_FRAMES[value];
  if (fixed !== undefined) return fixed;
  const kind = GROUND_KIND_FRAMES[value] ?? HAZARD_KIND_FRAMES[value];
  const above = grid[y - 1]?.[x];
  const buried = above !== undefined && above !== EMPTY_TILE;
  return buried ? kind.fill : kind.top;
}

/** Derives a full render grid (frame indices, or EMPTY_TILE) from a stored
 * ground grid — for building/rebuilding a whole tilemap at once. */
export function buildRenderGrid(grid: number[][]): number[][] {
  return grid.map((row, y) => row.map((cell, x) => (cell === EMPTY_TILE ? EMPTY_TILE : groundFrameAt(grid, x, y))));
}
