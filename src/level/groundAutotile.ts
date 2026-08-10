import { EMPTY_TILE } from "./LevelSchema";

/**
 * The ground layer stores just one logical value per cell (present/empty —
 * see LevelSchema). Which of two visual tiles a present cell renders as is
 * derived here, not stored: GROUND_FRAME_TOP (grass cap) when the cell is
 * exposed to open air above it, GROUND_FRAME_FILL (plain dirt) when another
 * ground cell sits directly above it. This is what makes a vertical stack
 * of ground read as one solid mass instead of a grass stripe appearing in
 * the middle of a dirt block. Both frames live in the same tileset image
 * (see generateTextures.ts) at these indices.
 */
export const GROUND_FRAME_TOP = 0;
export const GROUND_FRAME_FILL = 1;

export function groundFrameAt(grid: number[][], x: number, y: number): number {
  const above = grid[y - 1]?.[x];
  return above !== undefined && above !== EMPTY_TILE ? GROUND_FRAME_FILL : GROUND_FRAME_TOP;
}

/** Derives a full render grid (frame indices, or EMPTY_TILE) from a stored
 * ground grid — for building/rebuilding a whole tilemap at once. */
export function buildRenderGrid(grid: number[][]): number[][] {
  return grid.map((row, y) => row.map((cell, x) => (cell === EMPTY_TILE ? EMPTY_TILE : groundFrameAt(grid, x, y))));
}
