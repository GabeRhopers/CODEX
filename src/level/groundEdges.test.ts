import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "../config/gameConfig";
import {
  BOUNCE_TILE,
  BRICK_TILE,
  EMPTY_TILE,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "./LevelSchema";
import { GROUND_SKINS } from "./groundSkins";
import { STRIP_LENGTH } from "../skins/groundStrip";
import {
  buildEdgeGrid,
  EDGE_GID_BASE,
  coversPixel,
  EDGE_BAND_PX,
  EDGE_BOTTOM,
  EDGE_FRAME_COUNT,
  EDGE_LEFT,
  EDGE_NONE,
  EDGE_RIGHT,
  edgeBandRects,
  edgeMaskAt,
} from "./groundEdges";

/**
 * The claim under test is that three bits are enough to outline a ground mass,
 * corners included. So most of these are shaped like little maps: build a
 * neighbourhood, read the mask, and check the outline that falls out of it is
 * the one a person would draw by hand.
 */

const G = GROUND_GRASS_TILE;
const _ = EMPTY_TILE;

const ALL = EDGE_LEFT | EDGE_RIGHT | EDGE_BOTTOM;

describe("edgeMaskAt", () => {
  it("rims a lone block on every side", () => {
    expect(edgeMaskAt([[G]], 0, 0)).toBe(ALL);
  });

  it("opens the ends of a horizontal run and leaves the middle underlined only", () => {
    const grid = [[G, G, G]];
    expect(edgeMaskAt(grid, 0, 0)).toBe(EDGE_LEFT | EDGE_BOTTOM);
    expect(edgeMaskAt(grid, 1, 0)).toBe(EDGE_BOTTOM);
    expect(edgeMaskAt(grid, 2, 0)).toBe(EDGE_RIGHT | EDGE_BOTTOM);
  });

  it("runs both sides down a column and closes only the foot", () => {
    const grid = [[G], [G], [G]];
    expect(edgeMaskAt(grid, 0, 0)).toBe(EDGE_LEFT | EDGE_RIGHT);
    expect(edgeMaskAt(grid, 0, 1)).toBe(EDGE_LEFT | EDGE_RIGHT);
    expect(edgeMaskAt(grid, 0, 2)).toBe(ALL);
  });

  it("gives a 2x2 block four corner cells and no interior seam", () => {
    const grid = [
      [G, G],
      [G, G],
    ];
    expect(edgeMaskAt(grid, 0, 0)).toBe(EDGE_LEFT);
    expect(edgeMaskAt(grid, 1, 0)).toBe(EDGE_RIGHT);
    expect(edgeMaskAt(grid, 0, 1)).toBe(EDGE_LEFT | EDGE_BOTTOM);
    expect(edgeMaskAt(grid, 1, 1)).toBe(EDGE_RIGHT | EDGE_BOTTOM);
  });

  it("turns a concave corner without anything encoding one", () => {
    // An L: the notch is the empty cell at (1,1). The outline around it is
    // formed by two *different* cells each facing it — nothing in the mask
    // says "inner corner", it simply falls out.
    const grid = [
      [G, G],
      [G, _],
    ];
    expect(edgeMaskAt(grid, 1, 0) & EDGE_BOTTOM).toBe(EDGE_BOTTOM);
    expect(edgeMaskAt(grid, 0, 1) & EDGE_RIGHT).toBe(EDGE_RIGHT);
  });

  it("keeps two diagonally-touching masses fully rimmed", () => {
    const grid = [
      [G, _],
      [_, G],
    ];
    expect(edgeMaskAt(grid, 0, 0)).toBe(ALL);
    expect(edgeMaskAt(grid, 1, 1)).toBe(ALL);
  });

  it("merges different ground skins into one mass", () => {
    // A material change through a slab, not two slabs — so no seam between
    // them, only the outside gets a band.
    const grid = [[G, GROUND_DESERT_TILE, GROUND_CASTLE_TILE]];
    expect(edgeMaskAt(grid, 1, 0)).toBe(EDGE_BOTTOM);
    expect(edgeMaskAt(grid, 0, 0)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  });

  it("merges into brick, which carries its own border", () => {
    expect(edgeMaskAt([[G, BRICK_TILE]], 0, 0)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  });

  it("draws a shoreline against water and lava, which do not fill their cell", () => {
    expect(edgeMaskAt([[G, WATER_TILE]], 0, 0)).toBe(ALL);
    expect(edgeMaskAt([[G, LAVA_TILE]], 0, 0)).toBe(ALL);
  });

  it("draws against bounce, whose cell is transparent above the pad", () => {
    expect(edgeMaskAt([[G, BOUNCE_TILE]], 0, 0)).toBe(ALL);
  });

  it("outlines the level boundary, matching groundAutotile's own open-air rule", () => {
    // Out of bounds counts as empty — the same convention that makes a tile on
    // row 0 show its cap rather than a buried fill.
    const grid = [
      [G, G],
      [G, G],
    ];
    expect(edgeMaskAt(grid, 0, 0) & EDGE_LEFT).toBe(EDGE_LEFT);
    expect(edgeMaskAt(grid, 1, 1) & (EDGE_RIGHT | EDGE_BOTTOM)).toBe(EDGE_RIGHT | EDGE_BOTTOM);
  });

  it("outlines nothing that carries its own edge, and nothing empty", () => {
    for (const tile of [EMPTY_TILE, BRICK_TILE, BOUNCE_TILE, WATER_TILE, LAVA_TILE]) {
      expect(edgeMaskAt([[tile]], 0, 0), `tile ${tile}`).toBe(EDGE_NONE);
    }
  });

  it("reports nothing outside the grid", () => {
    expect(edgeMaskAt([[G]], 5, 0)).toBe(EDGE_NONE);
    expect(edgeMaskAt([[G]], 0, 5)).toBe(EDGE_NONE);
  });
});

describe("buildEdgeGrid", () => {
  it("keeps the grid's shape and marks un-outlined cells the way the ground layer does", () => {
    const grid = [
      [_, _],
      [G, BRICK_TILE],
    ];
    const edges = buildEdgeGrid(grid);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual([EMPTY_TILE, EMPTY_TILE]);
    expect(edges[1][0]).toBe(EDGE_LEFT | EDGE_BOTTOM);
    expect(edges[1][1]).toBe(EMPTY_TILE);
  });

  it("never produces a mask outside the strip's frame range", () => {
    const grid = [
      [G, G, _],
      [G, _, G],
    ];
    for (const row of buildEdgeGrid(grid)) {
      for (const value of row) {
        expect(value === EMPTY_TILE || (value >= 0 && value < EDGE_FRAME_COUNT)).toBe(true);
      }
    }
  });
});

describe("edgeBandRects", () => {
  /** Every pixel the rectangles actually cover, and how many times. */
  function coverage(mask: number): number[][] {
    const counts = Array.from({ length: TILE_SIZE }, () => Array<number>(TILE_SIZE).fill(0));
    for (const rect of edgeBandRects(mask)) {
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) counts[y][x] += 1;
      }
    }
    return counts;
  }

  it("covers exactly the pixels the rule says, for every mask", () => {
    for (let mask = 0; mask < EDGE_FRAME_COUNT; mask++) {
      const counts = coverage(mask);
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          expect(counts[y][x] > 0, `mask ${mask} at ${x},${y}`).toBe(coversPixel(mask, x, y));
        }
      }
    }
  });

  it("never covers a pixel twice — the convex-corner fix", () => {
    // The bands are drawn translucent, so an overlap compounds and leaves a
    // visibly darker dot on the outside of every convex corner. This is the
    // assertion that keeps the decomposition honest; three plain full-length
    // rectangles fail it.
    for (let mask = 0; mask < EDGE_FRAME_COUNT; mask++) {
      for (const row of coverage(mask)) {
        for (const count of row) expect(count).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws nothing for an interior cell", () => {
    expect(edgeBandRects(EDGE_NONE)).toEqual([]);
  });

  it("meets in the corner rather than leaving a gap there", () => {
    // The outermost pixel of a convex corner is covered — by one band or the
    // other, but covered — so the outline turns cleanly instead of breaking.
    const counts = coverage(EDGE_LEFT | EDGE_BOTTOM);
    expect(counts[TILE_SIZE - 1][0]).toBe(1);
    const right = coverage(EDGE_RIGHT | EDGE_BOTTOM);
    expect(right[TILE_SIZE - 1][TILE_SIZE - 1]).toBe(1);
  });

  it("insets the band from each exposed side by the band width", () => {
    const [left] = edgeBandRects(EDGE_LEFT);
    expect(left).toEqual({ x: 0, y: 0, width: EDGE_BAND_PX, height: TILE_SIZE });
    const [right] = edgeBandRects(EDGE_RIGHT);
    expect(right).toEqual({ x: TILE_SIZE - EDGE_BAND_PX, y: 0, width: EDGE_BAND_PX, height: TILE_SIZE });
  });
});

describe("EDGE_GID_BASE", () => {
  it("starts after every ground tileset's gid range", () => {
    // The ground layer registers one tileset per skin at firstgid i * stride,
    // so the overlay has to begin past the last of them or its frames would
    // collide with snow's. STRIP_LENGTH is imported from the skin composer —
    // the module that actually decides how wide a strip is — so widening a
    // strip there fails here rather than silently rendering the wrong art.
    expect(EDGE_GID_BASE).toBe(GROUND_SKINS.length * STRIP_LENGTH);
    expect(EDGE_GID_BASE).toBe(24);
  });

  it("leaves room for every mask without running into anything", () => {
    // Nothing else claims gids above the ground tilesets, so this is really a
    // statement that the overlay's own range is contiguous and self-contained.
    expect(EDGE_GID_BASE + EDGE_FRAME_COUNT - 1).toBeGreaterThanOrEqual(EDGE_GID_BASE);
    expect(EDGE_GID_BASE).toBeGreaterThan(0);
  });
});
