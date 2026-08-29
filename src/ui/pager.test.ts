import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageLabel, pageSlice, rowsPerPage } from "./pager";

/**
 * Paging, extracted from the World Maker so all four browser screens share it.
 *
 * The bug being prevented is silent: rows laid out as `start + i * height` with
 * nothing checking the canvas is tall enough simply draw the overflow past the
 * bottom edge, where it cannot be clicked. Nothing errors and nothing looks
 * broken — the list just stops.
 */

describe("rowsPerPage", () => {
  it("counts what actually fits", () => {
    // My Levels' real numbers: rows from y=90 at 44px on a 468px canvas.
    expect(rowsPerPage(90, 468, 44)).toBe(8);
  });

  it("never returns zero, however cramped", () => {
    // A page showing nothing at all would be worse than a cramped one, and would
    // make pageCount divide by zero.
    expect(rowsPerPage(90, 100, 44)).toBe(1);
    expect(rowsPerPage(90, 90, 44)).toBe(1);
  });
});

describe("pageCount", () => {
  it("counts pages, rounding up", () => {
    expect(pageCount(8, 8)).toBe(1);
    expect(pageCount(9, 8)).toBe(2);
    expect(pageCount(16, 8)).toBe(2);
    expect(pageCount(17, 8)).toBe(3);
  });

  it("reports one page for an empty list rather than none", () => {
    expect(pageCount(0, 8)).toBe(1);
  });
});

describe("clampPage", () => {
  it("keeps a valid page as it is", () => {
    expect(clampPage(1, 20, 8)).toBe(1);
  });

  it("pulls back a page that no longer exists", () => {
    // Deleting the only item on the last page is the real case: without this the
    // screen keeps rendering an empty page and looks broken.
    expect(clampPage(2, 9, 8)).toBe(1);
    expect(clampPage(5, 3, 8)).toBe(0);
  });

  it("refuses a negative page", () => {
    expect(clampPage(-1, 20, 8)).toBe(0);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("returns the rows for that page", () => {
    expect(pageSlice(items, 0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pageSlice(items, 1, 8)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("returns the short remainder on the last page", () => {
    expect(pageSlice(items, 2, 8)).toEqual([16, 17, 18, 19]);
  });

  it("clamps rather than returning nothing for an out-of-range page", () => {
    expect(pageSlice(items, 99, 8)).toEqual([16, 17, 18, 19]);
  });

  it("covers every item exactly once across all pages", () => {
    // The guarantee that matters: no level is unreachable, and none is listed
    // twice. This is the whole point of the change.
    const seen = [0, 1, 2].flatMap((page) => pageSlice(items, page, 8));
    expect(seen).toEqual(items);
  });

  it("covers every item for awkward totals too", () => {
    for (const total of [1, 7, 8, 9, 15, 16, 17]) {
      const list = Array.from({ length: total }, (_, i) => i);
      const pages = Array.from({ length: pageCount(total, 8) }, (_, p) => pageSlice(list, p, 8));
      expect(pages.flat(), `total=${total}`).toEqual(list);
    }
  });
});

describe("pageLabel", () => {
  it("reads as a person would say it", () => {
    expect(pageLabel(0, 20, 8)).toBe("Page 1 of 3");
    expect(pageLabel(2, 20, 8)).toBe("Page 3 of 3");
  });

  it("reports the clamped page, not the one it was asked about", () => {
    expect(pageLabel(9, 9, 8)).toBe("Page 2 of 2");
  });
});
