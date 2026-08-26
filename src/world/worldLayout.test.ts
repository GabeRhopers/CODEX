import { describe, expect, it } from "vitest";
import {
  autoArrange,
  cellAt,
  cellCenter,
  cellKey,
  MAP_COLS,
  MAP_ROWS,
  MAX_NODES,
  orderedCells,
  resolveLayout,
  serpentineCell,
  type Cell,
} from "./worldLayout";

const RECT = { x: 0, y: 0, width: 800, height: 400 };

/** Two cells touch if they are neighbours on either axis (diagonals count). */
const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;

describe("serpentineCell", () => {
  it("runs left to right, then right to left on the next row", () => {
    expect(serpentineCell(0)).toEqual({ col: 0, row: 0 });
    expect(serpentineCell(MAP_COLS - 1)).toEqual({ col: MAP_COLS - 1, row: 0 });
    // The turn: the first cell of row 1 sits directly under the last of row 0.
    expect(serpentineCell(MAP_COLS)).toEqual({ col: MAP_COLS - 1, row: 1 });
  });

  it("keeps every consecutive pair touching, which is the whole point", () => {
    // Plain reading order would jump the full width of the map at the end of
    // each row, and the path drawn between those two nodes would cut back
    // across everything below it.
    for (let i = 1; i < MAX_NODES; i++) {
      expect(adjacent(serpentineCell(i - 1), serpentineCell(i)), `${i - 1} -> ${i}`).toBe(true);
    }
  });

  it("gives every index up to the cap its own cell", () => {
    const seen = new Set(Array.from({ length: MAX_NODES }, (_, i) => cellKey(serpentineCell(i))));
    expect(seen.size).toBe(MAX_NODES);
  });
});

describe("autoArrange", () => {
  it("spreads a small world across the middle rather than into a corner", () => {
    // Three nodes packed against the top-left with three quarters of the map
    // empty reads as a bug, not a route.
    const layout = autoArrange(["a", "b", "c"]);
    const cols = Object.values(layout).map((c) => c.col);
    expect(Math.min(...cols)).toBe(0);
    expect(Math.max(...cols)).toBe(MAP_COLS - 1);
    expect(new Set(Object.values(layout).map((c) => c.row)).size).toBe(1);
  });

  it("centres a single node instead of parking it at the edge", () => {
    expect(autoArrange(["only"]).only.col).toBe(Math.floor(MAP_COLS / 2));
  });

  it("gives every level in a small world its own cell", () => {
    for (let n = 1; n <= MAP_COLS; n++) {
      const ids = Array.from({ length: n }, (_, i) => `l${i}`);
      const layout = autoArrange(ids);
      expect(new Set(Object.values(layout).map(cellKey)).size, `${n} levels`).toBe(n);
    }
  });

  it("falls back to the serpentine once one row is not enough", () => {
    const ids = Array.from({ length: MAP_COLS + 2 }, (_, i) => `l${i}`);
    const layout = autoArrange(ids);
    expect(layout.l0).toEqual(serpentineCell(0));
    expect(new Set(Object.values(layout).map(cellKey)).size).toBe(ids.length);
  });
});

describe("resolveLayout", () => {
  it("auto-arranges a world that has never been laid out", () => {
    // The migration guarantee: a world saved before the map existed has no
    // layout at all, and must still open as a route rather than a pile.
    expect(resolveLayout(["a", "b", "c"])).toEqual(autoArrange(["a", "b", "c"]));
  });

  it("keeps the cells a world was actually saved with", () => {
    const stored = { a: { col: 3, row: 2 }, b: { col: 5, row: 4 } };
    expect(resolveLayout(["a", "b"], stored)).toEqual(stored);
  });

  it("slots a newly added level in rather than dropping it on an existing node", () => {
    const stored = { a: { col: 0, row: 0 } };
    const resolved = resolveLayout(["a", "b"], stored);
    expect(resolved.a).toEqual({ col: 0, row: 0 });
    expect(resolved.b).toBeDefined();
    expect(cellKey(resolved.b)).not.toBe(cellKey(resolved.a));
  });

  it("relocates a duplicate cell instead of stacking two levels", () => {
    const stored = { a: { col: 2, row: 1 }, b: { col: 2, row: 1 } };
    const resolved = resolveLayout(["a", "b"], stored);
    expect(resolved.a).toEqual({ col: 2, row: 1 }); // first come, first served
    expect(cellKey(resolved.b)).not.toBe(cellKey(resolved.a));
  });

  it("relocates an out-of-range cell from a hand-edited file", () => {
    for (const bad of [
      { col: -1, row: 0 },
      { col: MAP_COLS, row: 0 },
      { col: 0, row: MAP_ROWS },
      { col: 1.5, row: 0 },
    ]) {
      const resolved = resolveLayout(["a"], { a: bad });
      expect(resolved.a.col, JSON.stringify(bad)).toBeGreaterThanOrEqual(0);
      expect(resolved.a.col).toBeLessThan(MAP_COLS);
      expect(resolved.a.row).toBeGreaterThanOrEqual(0);
      expect(resolved.a.row).toBeLessThan(MAP_ROWS);
    }
  });

  it("never puts two levels in one cell, whatever storage says", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `l${i}`);
    // Every stored cell identical — the worst case a corrupted file can be.
    const stored = Object.fromEntries(ids.map((id) => [id, { col: 0, row: 0 }]));
    const resolved = resolveLayout(ids, stored);
    expect(new Set(Object.values(resolved).map(cellKey)).size).toBe(ids.length);
  });

  it("drops ids past the cap rather than overlapping them", () => {
    const ids = Array.from({ length: MAX_NODES + 3 }, (_, i) => `l${i}`);
    const resolved = resolveLayout(ids);
    expect(Object.keys(resolved)).toHaveLength(MAX_NODES);
    expect(new Set(Object.values(resolved).map(cellKey)).size).toBe(MAX_NODES);
  });

  it("does not mutate the stored layout it was handed", () => {
    const stored = { a: { col: 1, row: 1 } };
    const resolved = resolveLayout(["a"], stored);
    resolved.a.col = 7;
    expect(stored.a.col).toBe(1);
  });
});

describe("cellCenter / cellAt", () => {
  it("round-trips a cell through pixels and back", () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 3, row: 2 },
      { col: MAP_COLS - 1, row: MAP_ROWS - 1 },
    ]) {
      const { x, y } = cellCenter(cell, RECT);
      expect(cellAt(x, y, RECT), cellKey(cell)).toEqual(cell);
    }
  });

  it("places the first cell inside the rect, not on its corner", () => {
    const { x, y } = cellCenter({ col: 0, row: 0 }, RECT);
    expect(x).toBeGreaterThan(RECT.x);
    expect(y).toBeGreaterThan(RECT.y);
  });

  it("returns null outside the rect rather than clamping to an edge", () => {
    // A stray click near the border should place nothing, not snap onto a
    // corner cell the player never aimed at.
    expect(cellAt(RECT.x - 1, RECT.y + 10, RECT)).toBeNull();
    expect(cellAt(RECT.x + 10, RECT.y - 1, RECT)).toBeNull();
    expect(cellAt(RECT.x + RECT.width + 1, RECT.y + 10, RECT)).toBeNull();
    expect(cellAt(RECT.x + 10, RECT.y + RECT.height + 1, RECT)).toBeNull();
  });

  it("honours the caller's own rect, so the maker and the map agree on cells", () => {
    const offset = { x: 480, y: 90, width: 540, height: 300 };
    const cell = { col: 2, row: 3 };
    expect(cellAt(cellCenter(cell, offset).x, cellCenter(cell, offset).y, offset)).toEqual(cell);
  });
});

describe("orderedCells", () => {
  it("follows play order, not layout order", () => {
    const layout = { a: { col: 5, row: 0 }, b: { col: 1, row: 0 } };
    expect(orderedCells(["b", "a"], layout)).toEqual([layout.b, layout.a]);
  });

  it("skips a level with no cell rather than emitting a hole", () => {
    expect(orderedCells(["a", "missing"], { a: { col: 0, row: 0 } })).toHaveLength(1);
  });
});
