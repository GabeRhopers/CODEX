import { describe, expect, it } from "vitest";
import { BOUNCE_FRAMES, buildRenderGrid, groundFrameAt, HAZARD_FRAMES } from "./groundAutotile";
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

const E = EMPTY_TILE;
const G = GROUND_GRASS_TILE;
const D = GROUND_DESERT_TILE;
const C = GROUND_CASTLE_TILE;
const S = GROUND_SNOW_TILE;
const B = BRICK_TILE;
const BC = BRICK_CASTLE_TILE;
const P = BOUNCE_TILE; // "P" for sPring, avoids clashing with B (brick)
const PC = BOUNCE_CASTLE_TILE;
const W = WATER_TILE;
const L = LAVA_TILE;

describe("groundFrameAt", () => {
  it("is TOP when there is nothing above (open air)", () => {
    const grid = [
      [E, E],
      [G, G],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(0); // grass top frame
  });

  it("is TOP when the cell is at the very top row (no row above at all)", () => {
    const grid = [[G, G]];
    expect(groundFrameAt(grid, 0, 0)).toBe(0);
  });

  it("is FILL when another ground cell sits directly above it", () => {
    const grid = [
      [G, E],
      [G, G],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(1); // grass fill frame
  });

  it("only depends on the cell directly above, not diagonal neighbors", () => {
    const grid = [
      [G, E],
      [E, G],
    ];
    // (1,1) has ground diagonally up-left, but nothing directly above (1,0) is E.
    expect(groundFrameAt(grid, 1, 1)).toBe(0);
  });

  it("each ground skin has its own top/fill frame pair, in GROUND_SKINS order", () => {
    expect(groundFrameAt([[G]], 0, 0)).toBe(0); // grass top
    expect(groundFrameAt([[D]], 0, 0)).toBe(5); // desert top
    expect(groundFrameAt([[C]], 0, 0)).toBe(10); // castle top
    expect(groundFrameAt([[S]], 0, 0)).toBe(15); // snow top
    expect(groundFrameAt([[G], [G]], 0, 1)).toBe(1); // grass fill
    expect(groundFrameAt([[D], [D]], 0, 1)).toBe(6); // desert fill
    expect(groundFrameAt([[C], [C]], 0, 1)).toBe(11); // castle fill
    expect(groundFrameAt([[S], [S]], 0, 1)).toBe(16); // snow fill
  });

  it("is BRICK for a brick cell regardless of what's above it — shared vs. castle frames differ", () => {
    const grid = [
      [G, E],
      [B, BC],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(2);
    expect(groundFrameAt(grid, 1, 1)).toBe(12);
  });

  it("is BOUNCE for a bounce cell regardless of what's above it — shared vs. castle frames differ", () => {
    expect(groundFrameAt([[P]], 0, 0)).toBe(3);
    expect(groundFrameAt([[PC]], 0, 0)).toBe(13);
  });

  it("is WATER/LAVA for a hazard cell regardless of what's above it", () => {
    const grid = [
      [G, E],
      [W, L],
    ];
    expect(groundFrameAt(grid, 0, 1)).toBe(4);
    expect(groundFrameAt(grid, 1, 1)).toBe(14);
  });

  it("a ground cell buried under a brick still reads as FILL (still solid above it)", () => {
    const grid = [[B], [G]];
    expect(groundFrameAt(grid, 0, 1)).toBe(1);
  });
});

describe("BOUNCE_FRAMES / HAZARD_FRAMES", () => {
  it("cover both the shared and castle-specific frame for their kind", () => {
    expect(BOUNCE_FRAMES.has(3)).toBe(true);
    expect(BOUNCE_FRAMES.has(13)).toBe(true);
    expect(BOUNCE_FRAMES.has(4)).toBe(false);
    expect(HAZARD_FRAMES.has(4)).toBe(true);
    expect(HAZARD_FRAMES.has(14)).toBe(true);
    expect(HAZARD_FRAMES.has(3)).toBe(false);
  });
});

describe("buildRenderGrid", () => {
  it("keeps EMPTY_TILE untouched and maps ground cells to the correct frame", () => {
    const grid = [
      [G, E],
      [G, G],
    ];
    expect(buildRenderGrid(grid)).toEqual([
      [0, E],
      [1, 0],
    ]);
  });

  it("a three-tall vertical stack is TOP only at the exposed surface", () => {
    const grid = [[G], [G], [G]];
    expect(buildRenderGrid(grid)).toEqual([[0], [1], [1]]);
  });

  it("a level mixing every ground skin renders each with its own frames", () => {
    const grid = [[G, D, C, S]];
    expect(buildRenderGrid(grid)).toEqual([[0, 5, 10, 15]]);
  });
});
