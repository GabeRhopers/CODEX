import { describe, expect, it } from "vitest";
import { rowEnd, rowPositions, type RowItem } from "./rowLayout";

/**
 * The arithmetic the Sound row got wrong for its whole life.
 *
 * Worth testing rather than eyeballing because a spacing bug produces a row
 * that looks like a row: nothing throws, nothing overlaps enough to trip
 * `assertLayoutSound` (which only compares *interactive* Text anyway), and the
 * only symptom is that the whitespace groups the buttons wrongly. It took a
 * screenshot and a ruler to find the first time.
 */

const gaps = (items: RowItem[], startX: number, spacing: { gap: number; groupGap: number }): number[] => {
  const xs = rowPositions(items, startX, spacing);
  return xs.slice(1).map((x, i) => x - (xs[i] + items[i].width));
};

describe("rowPositions", () => {
  const spacing = { gap: 8, groupGap: 28 };

  it("gives every neighbour the same gap, whatever the labels measure", () => {
    // The actual failure, in miniature: "Hit" is narrow and "Pickup" is wide,
    // and on a fixed step that difference lands in the whitespace.
    const items: RowItem[] = [{ width: 48 }, { width: 70 }, { width: 38 }, { width: 62 }];
    expect(gaps(items, 100, spacing)).toEqual([8, 8, 8]);
  });

  it("starts where it is told and advances by width plus gap", () => {
    expect(rowPositions([{ width: 50 }, { width: 30 }], 100, spacing)).toEqual([100, 158]);
  });

  it("puts the wider gap only in front of the item that starts a group", () => {
    // The Sound row's real shape: five choices, then Roll and Play, which are
    // actions. Roll opens the group; Play is inside it and gets the small gap.
    const items: RowItem[] = [{ width: 40 }, { width: 40 }, { width: 55, startsGroup: true }, { width: 45 }];
    expect(gaps(items, 0, spacing)).toEqual([8, 28, 8]);
  });

  it("ignores startsGroup on the first item, which has nothing to be apart from", () => {
    expect(rowPositions([{ width: 40, startsGroup: true }, { width: 40 }], 10, spacing)).toEqual([10, 58]);
  });

  it("handles an empty row and a single item without inventing a gap", () => {
    expect(rowPositions([], 10, spacing)).toEqual([]);
    expect(rowPositions([{ width: 40 }], 10, spacing)).toEqual([10]);
  });
});

describe("rowEnd", () => {
  const spacing = { gap: 8, groupGap: 28 };

  it("is the right edge of the last item", () => {
    // What the caller checks the row against. The old fixed step existed to
    // keep this clear of the drawing column, and that constraint has to
    // survive the change in spacing — so it is measurable, not assumed.
    expect(rowEnd([{ width: 50 }, { width: 30 }], 100, spacing)).toBe(188);
  });

  it("counts the wider gap too", () => {
    expect(rowEnd([{ width: 50 }, { width: 30, startsGroup: true }], 100, spacing)).toBe(208);
  });

  it("is the start for an empty row", () => {
    expect(rowEnd([], 100, spacing)).toBe(100);
  });
});
