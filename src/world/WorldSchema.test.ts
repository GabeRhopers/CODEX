import { describe, expect, it } from "vitest";
import { parseWorld, parseWorldSummary, type WorldData } from "./WorldSchema";
import { resolveLayout } from "./worldLayout";

/**
 * The boundary between a stored file and the screen built out of it.
 *
 * Both world adapters used to do `JSON.parse(content) as WorldData` and hand
 * the result to `WorldMapScene`, which draws a backdrop, a node per level and
 * the paths between them from that one document and nothing else. So a
 * `levelIds` that was not an array was not a bad world, it was a blank screen
 * and a TypeError.
 */

const good = (): WorldData => ({
  id: "w1",
  name: "Green Hills",
  levelIds: ["l1", "l2"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
});

describe("parseWorld", () => {
  it("keeps a well-formed world exactly as it is", () => {
    expect(parseWorld(good())).toEqual(good());
  });

  it("keeps the optional fields when they are there", () => {
    const withExtras = { ...good(), layout: { l1: { col: 1, row: 2 } }, background: "meadow" };
    expect(parseWorld(withExtras)).toEqual(withExtras);
  });

  it("refuses anything that is not a world-shaped object", () => {
    for (const raw of [null, undefined, 0, "world", [], [good()], {}]) {
      expect(parseWorld(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("refuses the fields the map cannot draw without", () => {
    // levelIds is the one that mattered most: WorldMapScene maps over it
    // directly, so a string here was a TypeError rather than an empty map.
    expect(parseWorld({ ...good(), levelIds: "l1" })).toBeNull();
    expect(parseWorld({ ...good(), levelIds: ["l1", 2] })).toBeNull();
    expect(parseWorld({ ...good(), id: 1 })).toBeNull();
    expect(parseWorld({ ...good(), name: null })).toBeNull();
    expect(parseWorld({ ...good(), updatedAt: undefined })).toBeNull();
  });

  it("drops a malformed layout or background instead of losing the world", () => {
    // Both are documented as absent on a world saved before the map existed, so
    // absence is the normal case and rejection would be the wrong response to a
    // bad one. A world with no layout opens auto-arranged.
    const parsed = parseWorld({ ...good(), layout: "nope", background: 7 });
    expect(parsed).not.toBeNull();
    expect(parsed?.layout).toBeUndefined();
    expect(parsed?.background).toBeUndefined();
    expect(parsed?.levelIds).toEqual(["l1", "l2"]);
  });

  it("leaves cell-level nonsense to resolveLayout, which already handles it", () => {
    // Deliberately not re-checked here: resolveLayout relocates out-of-range,
    // duplicate and non-numeric cells and is tested for it. Two opinions about
    // the same rule is how they drift apart.
    const parsed = parseWorld({ ...good(), layout: { l1: { col: 99, row: -4 }, l2: "junk" } });
    expect(parsed?.layout).toBeDefined();
    const resolved = resolveLayout(parsed!.levelIds, parsed!.layout);
    for (const id of parsed!.levelIds) {
      expect(resolved[id], `${id} should still get a cell`).toBeDefined();
    }
  });
});

describe("parseWorldSummary", () => {
  const row = { id: "w1", name: "Green Hills", levelCount: 2, updatedAt: "2026-09-02T00:00:00.000Z" };

  it("keeps a good row and refuses a bad one", () => {
    expect(parseWorldSummary(row)).toEqual(row);
    expect(parseWorldSummary({ ...row, levelCount: "two" })).toBeNull();
    expect(parseWorldSummary({ ...row, id: null })).toBeNull();
    expect(parseWorldSummary(null)).toBeNull();
  });

  it("refuses a count that is not a real number", () => {
    // NaN survives a JSON round trip as null, but a hand-edited file can carry
    // one, and it would make the "N levels" line read "NaN levels".
    expect(parseWorldSummary({ ...row, levelCount: NaN })).toBeNull();
    expect(parseWorldSummary({ ...row, levelCount: Infinity })).toBeNull();
  });
});
