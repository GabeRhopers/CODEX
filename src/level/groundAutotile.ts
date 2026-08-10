import { BOUNCE_TILE, BRICK_TILE, EMPTY_TILE } from "./LevelSchema";

/**
 * The ground layer stores one logical value per cell: empty, plain ground
 * (which merges with its neighbors — see below), or a fixed-look block
 * type (brick, bounce). Which *frame* of the shared tileset a cell renders
 * as is derived here, never stored:
 *   - GROUND_TILE: GROUND_FRAME_TOP (grass cap) when exposed to open air
 *     above it, GROUND_FRAME_FILL (plain dirt) when buried under another
 *     non-empty cell — this is what makes a vertical stack of ground read
 *     as one solid mass instead of a grass stripe partway up.
 *   - BRICK_TILE / BOUNCE_TILE: always their own fixed frame, regardless
 *     of neighbors — they're standalone blocks, not merging terrain.
 * All frames live in the same per-theme tileset image (see
 * generateTextures.ts) at these indices.
 */
export const GROUND_FRAME_TOP = 0;
export const GROUND_FRAME_FILL = 1;
export const GROUND_FRAME_BRICK = 2;
export const GROUND_FRAME_BOUNCE = 3;

export function groundFrameAt(grid: number[][], x: number, y: number): number {
  const value = grid[y][x];
  if (value === BRICK_TILE) return GROUND_FRAME_BRICK;
  if (value === BOUNCE_TILE) return GROUND_FRAME_BOUNCE;
  const above = grid[y - 1]?.[x];
  return above !== undefined && above !== EMPTY_TILE ? GROUND_FRAME_FILL : GROUND_FRAME_TOP;
}

/** Derives a full render grid (frame indices, or EMPTY_TILE) from a stored
 * ground grid — for building/rebuilding a whole tilemap at once. */
export function buildRenderGrid(grid: number[][]): number[][] {
  return grid.map((row, y) => row.map((cell, x) => (cell === EMPTY_TILE ? EMPTY_TILE : groundFrameAt(grid, x, y))));
}
