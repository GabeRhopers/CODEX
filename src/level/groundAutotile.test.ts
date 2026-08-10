import { describe, expect, it } from "vitest";
import { buildRenderGrid, groundFrameAt, GROUND_FRAME_FILL, GROUND_FRAME_TOP } from "./groundAutotile";
import { EMPTY_TILE, GROUND_TILE } from "./LevelSchema";

const E = EMPTY_TILE;
const T = GROUND_TILE;

describe("groundFrameAt", () => {
  it("is TOP when there is nothing above (open air)", () => {
    const grid = [
      [E, E],
      [T, T],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(GROUND_FRAME_TOP);
  });

  it("is TOP when the cell is at the very top row (no row above at all)", () => {
    const grid = [[T, T]];
    expect(groundFrameAt(grid, 0, 0)).toBe(GROUND_FRAME_TOP);
  });

  it("is FILL when another ground cell sits directly above it", () => {
    const grid = [
      [T, E],
      [T, T],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(GROUND_FRAME_FILL);
  });

  it("only depends on the cell directly above, not diagonal neighbors", () => {
    const grid = [
      [T, E],
      [E, T],
    ];
    // (1,1) has ground diagonally up-left, but nothing directly above (1,0) is E.
    expect(groundFrameAt(grid, 1, 1)).toBe(GROUND_FRAME_TOP);
  });
});

describe("buildRenderGrid", () => {
  it("keeps EMPTY_TILE untouched and maps ground cells to the correct frame", () => {
    const grid = [
      [T, E],
      [T, T],
    ];
    expect(buildRenderGrid(grid)).toEqual([
      [GROUND_FRAME_TOP, E],
      [GROUND_FRAME_FILL, GROUND_FRAME_TOP],
    ]);
  });

  it("a three-tall vertical stack is TOP only at the exposed surface", () => {
    const grid = [[T], [T], [T]];
    expect(buildRenderGrid(grid)).toEqual([[GROUND_FRAME_TOP], [GROUND_FRAME_FILL], [GROUND_FRAME_FILL]]);
  });
});
