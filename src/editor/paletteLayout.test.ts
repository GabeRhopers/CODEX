import { describe, expect, it } from "vitest";
import { Brush, BrushCategory, CATEGORIES, PALETTE } from "./Palette";
import { layOutBrushes, pageOfBrush, paginateBrushes } from "./paletteLayout";

/**
 * Whether every brush can actually be reached.
 *
 * The grid has five rows and Blocks and Decor already fill all five, so this
 * exists to hold two things at once: that adding paging moved *nothing* that
 * shipped before it, and that a category which outgrows one page still shows
 * every one of its brushes on some page rather than drawing them off the panel.
 */

/** The real numbers the editor lays out with — see EditorUI's ICON_ROWS. */
const ROWS = 5;
const COLS = 2;

const brush = (id: string, over: Partial<Brush> = {}): Brush => ({
  id,
  category: "items",
  kind: "entity",
  label: id,
  textureKey: "item-coin",
  entityType: "item-coin",
  ...over,
});

const brushes = (n: number): Brush[] => Array.from({ length: n }, (_, i) => brush(`b${i}`));

describe("every built-in category, as it shipped", () => {
  it("still fits on one page, with nothing moved", () => {
    // The load-bearing regression guard: paging is meant to be invisible until
    // an invented type exists. If this ever fails, an existing brush moved.
    for (const category of CATEGORIES) {
      const inCategory = PALETTE.filter((b) => b.category === category.id);
      const pages = layOutBrushes(inCategory, ROWS, COLS);
      expect(pages.length, category.id).toBe(1);
      expect(pages[0].map((s) => s.brush.id)).toEqual(inCategory.map((b) => b.id));
      expect(Math.max(...pages[0].map((s) => s.row)), category.id).toBeLessThan(ROWS);
    }
  });
});

describe("paginateBrushes", () => {
  it("fills rows two at a time and breaks at the row limit", () => {
    const pages = paginateBrushes(brushes(13), ROWS, COLS);
    expect(pages.map((p) => p.length)).toEqual([10, 3]);
    expect(pages[1][0]).toMatchObject({ col: 0, row: 0 });
  });

  it("keeps a group together by starting the next brush on a new row", () => {
    // groupEnd is why this cannot be plain arithmetic: it forces a row break, so
    // a group's tail must not end up on the next page with a hole left behind.
    const list = [brush("a"), brush("b", { groupEnd: true }), brush("c")];
    const pages = paginateBrushes(list, ROWS, COLS);
    expect(pages[0].map((s) => [s.col, s.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  it("counts a group-ended row as a whole row against the page", () => {
    const list = Array.from({ length: 6 }, (_, i) => brush(`g${i}`, { groupEnd: true }));
    const pages = paginateBrushes(list, ROWS, COLS);
    expect(pages.map((p) => p.length)).toEqual([5, 1]);
  });

  it("always returns a page, even for nothing at all", () => {
    expect(paginateBrushes([], ROWS, COLS)).toEqual([[]]);
  });

  it("loses no brush, whatever the shape", () => {
    for (const count of [1, 9, 10, 11, 20, 37]) {
      const list = brushes(count);
      const flat = paginateBrushes(list, ROWS, COLS).flat();
      expect(flat.map((s) => s.brush.id), String(count)).toEqual(list.map((b) => b.id));
    }
  });
});

describe("layOutBrushes", () => {
  it("gives the last row up to the pager once a second page is needed", () => {
    // Five rows while it fits, four when it doesn't — the pager has to be drawn
    // somewhere, and the alternative is drawing it over the skin picker.
    expect(layOutBrushes(brushes(10), ROWS, COLS).map((p) => p.length)).toEqual([10]);
    expect(layOutBrushes(brushes(11), ROWS, COLS).map((p) => p.length)).toEqual([8, 3]);
  });

  it("puts the eleventh Decor brush on a page rather than off the panel", () => {
    // The concrete case: Decor ships with exactly ten, so one invented decor
    // type is all it takes.
    const decor = PALETTE.filter((b) => b.category === ("decor" as BrushCategory));
    const invented = layOutBrushes([...decor, brush("custom:x")], ROWS, COLS);
    expect(invented.length).toBe(2);
    expect(invented.flat().map((s) => s.brush.id)).toContain("custom:x");
    for (const slot of invented.flat()) expect(slot.row).toBeLessThan(ROWS - 1);
  });
});

describe("pageOfBrush", () => {
  it("finds which page a brush landed on, and says so when it is on none", () => {
    const pages = layOutBrushes(brushes(11), ROWS, COLS);
    expect(pageOfBrush(pages, "b0")).toBe(0);
    expect(pageOfBrush(pages, "b10")).toBe(1);
    expect(pageOfBrush(pages, "not-here")).toBe(-1);
  });
});
