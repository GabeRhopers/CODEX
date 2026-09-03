import { describe, expect, it } from "vitest";
import {
  addPanel,
  CutScene,
  cutSceneBackgroundIds,
  emptyCutScene,
  hasContent,
  movePanel,
  panelHasContent,
  playablePanels,
  removePanel,
  updatePanel,
} from "./CutScene";

const scene = (...panels: CutScene["panels"]): CutScene => ({ panels });

describe("panelHasContent", () => {
  it("counts a picture, words, or both", () => {
    expect(panelHasContent({ imageId: "bg-1" })).toBe(true);
    expect(panelHasContent({ words: "Once upon a time" })).toBe(true);
    expect(panelHasContent({ imageId: "bg-1", words: "Once upon a time" })).toBe(true);
  });

  it("does not count an empty panel, or one holding only whitespace", () => {
    expect(panelHasContent({})).toBe(false);
    expect(panelHasContent({ words: "" })).toBe(false);
    expect(panelHasContent({ words: "   \n  " })).toBe(false);
  });
});

describe("hasContent", () => {
  /**
   * The case this exists for: someone presses Add panel three times, types
   * nothing, and plays. Asking `panels.length` would give them three blank
   * screens to click through before their own game started.
   */
  it("is false for a cut scene of nothing but empty panels", () => {
    expect(hasContent(scene({}, {}, {}))).toBe(false);
    expect(hasContent(emptyCutScene())).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });

  it("is true as soon as one panel says something", () => {
    expect(hasContent(scene({}, { words: "Meanwhile…" }, {}))).toBe(true);
  });
});

describe("playablePanels", () => {
  it("drops the empty ones and keeps the order of the rest", () => {
    const shown = playablePanels(scene({ words: "One" }, {}, { imageId: "bg-2" }));
    expect(shown).toEqual([{ words: "One" }, { imageId: "bg-2" }]);
  });

  it("is empty rather than undefined when there is no cut scene at all", () => {
    expect(playablePanels(undefined)).toEqual([]);
  });
});

describe("editing panels", () => {
  it("adds to the end, and adds a blank one by default", () => {
    expect(addPanel(emptyCutScene()).panels).toEqual([{}]);
    expect(addPanel(scene({ words: "One" }), { words: "Two" }).panels).toEqual([{ words: "One" }, { words: "Two" }]);
  });

  it("removes by index, and ignores an index that is not there", () => {
    const three = scene({ words: "One" }, { words: "Two" }, { words: "Three" });
    expect(removePanel(three, 1).panels).toEqual([{ words: "One" }, { words: "Three" }]);
    expect(removePanel(three, 9)).toBe(three);
    expect(removePanel(three, -1)).toBe(three);
  });

  it("merges changes into one panel and leaves its siblings alone", () => {
    const two = scene({ words: "One" }, { words: "Two" });
    const edited = updatePanel(two, 0, { imageId: "bg-1" });
    expect(edited.panels[0]).toEqual({ words: "One", imageId: "bg-1" });
    expect(edited.panels[1]).toEqual({ words: "Two" });
    expect(updatePanel(two, 5, { imageId: "bg-1" })).toBe(two);
  });
});

describe("movePanel", () => {
  const three = scene({ words: "One" }, { words: "Two" }, { words: "Three" });

  it("swaps with the neighbour in that direction", () => {
    expect(movePanel(three, 1, -1).panels.map((p) => p.words)).toEqual(["Two", "One", "Three"]);
    expect(movePanel(three, 1, 1).panels.map((p) => p.words)).toEqual(["One", "Three", "Two"]);
  });

  /**
   * Clamped, not wrapping — and the identity check is the point of the test, not
   * a detail: callers skip a redraw on it, exactly as they do for `moveWorld`.
   */
  it("does nothing at either end, returning the very same object", () => {
    expect(movePanel(three, 0, -1)).toBe(three);
    expect(movePanel(three, 2, 1)).toBe(three);
  });

  it("ignores an index outside the list", () => {
    expect(movePanel(three, -1, 1)).toBe(three);
    expect(movePanel(three, 3, -1)).toBe(three);
  });
});

describe("cutSceneBackgroundIds", () => {
  /**
   * What stops a published game losing its cut-scene art. The collector unions
   * this with the levels' own references; if it under-reports, the opening is
   * blank on the link and fine in the editor.
   */
  it("finds ids across both cut scenes and de-duplicates them", () => {
    const opening = scene({ imageId: "bg-1" }, { words: "no picture" }, { imageId: "bg-2" });
    const closing = scene({ imageId: "bg-2" }, { imageId: "bg-3" });
    expect(cutSceneBackgroundIds(opening, closing).sort()).toEqual(["bg-1", "bg-2", "bg-3"]);
  });

  it("is empty when there are no cut scenes, or none of them have pictures", () => {
    expect(cutSceneBackgroundIds(undefined, undefined)).toEqual([]);
    expect(cutSceneBackgroundIds(scene({ words: "words only" }))).toEqual([]);
  });
});
