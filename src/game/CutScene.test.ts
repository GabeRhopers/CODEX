import { describe, expect, it } from "vitest";
import {
  addActor,
  addPanel,
  CutScene,
  cutSceneActorIds,
  cutSceneBackgroundIds,
  emptyCutScene,
  hasContent,
  movePanel,
  panelActors,
  panelHasContent,
  playablePanels,
  removeActor,
  removePanel,
  updateActor,
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

  /**
   * A panel holding nothing but a character on the plain backdrop is still a
   * panel somebody composed. Miss this and `playablePanels` drops it, so the
   * work is plainly there in the maker and silently gone on the link.
   */
  it("counts a panel whose only content is somebody standing in it", () => {
    expect(panelHasContent({ actors: [{ id: "enemy-ghost", x: 0.5, y: 0.8 }] })).toBe(true);
  });

  it("does not count an actors field that is present but empty", () => {
    expect(panelHasContent({ actors: [] })).toBe(false);
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

  /**
   * The half that can break publishing silently. A panel may name one of the 4
   * shipped backgrounds, which has nothing in the library to collect — report it
   * and `collectGameBundle` hunts for an asset that was never there, then
   * `bundleProblems` tells the author a picture is missing when it is fine.
   */
  it("ignores the shipped built-ins and reports only uploaded pictures", () => {
    const opening = scene({ imageId: "meadow" }, { imageId: "bg-upload-1" }, { imageId: "pirate-cove" });
    expect(cutSceneBackgroundIds(opening)).toEqual(["bg-upload-1"]);
    expect(cutSceneBackgroundIds(scene({ imageId: "sunny-valley" }, { imageId: "frozen-volcano" }))).toEqual([]);
  });
});

describe("editing actors", () => {
  const panel = (...actors: { id: string; x: number; y: number }[]): CutScene => scene({ actors });

  it("treats a missing actors field as an empty cast", () => {
    expect(panelActors(undefined)).toEqual([]);
    expect(panelActors({ words: "nobody here" })).toEqual([]);
  });

  it("adds to the end of the panel's cast", () => {
    const one = addActor(scene({}), 0, { id: "enemy-ghost", x: 0.5, y: 0.9 });
    const two = addActor(one, 0, { id: "item-coin", x: 0.2, y: 0.7 });
    expect(panelActors(two.panels[0]).map((a) => a.id)).toEqual(["enemy-ghost", "item-coin"]);
  });

  /** A drag that leaves the stage means "as far as it goes". An actor stored
   * outside 0..1 would draw off the edge of a panel nobody could then select. */
  it("clamps a position to the stage rather than refusing it", () => {
    const added = addActor(scene({}), 0, { id: "enemy-ghost", x: -3, y: 9 });
    expect(panelActors(added.panels[0])[0]).toMatchObject({ x: 0, y: 1 });

    const moved = updateActor(added, 0, 0, { x: 1.4, y: -0.2 });
    expect(panelActors(moved.panels[0])[0]).toMatchObject({ x: 1, y: 0 });
  });

  it("changes only the actor named, and leaves its siblings alone", () => {
    const next = updateActor(panel({ id: "a", x: 0.1, y: 0.1 }, { id: "b", x: 0.2, y: 0.2 }), 0, 1, { flip: true });
    expect(panelActors(next.panels[0])[0]).toEqual({ id: "a", x: 0.1, y: 0.1 });
    expect(panelActors(next.panels[0])[1]).toMatchObject({ id: "b", flip: true });
  });

  it("removes by index and keeps the rest in order", () => {
    const next = removeActor(panel({ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }, { id: "c", x: 0, y: 0 }), 0, 1);
    expect(panelActors(next.panels[0]).map((a) => a.id)).toEqual(["a", "c"]);
  });

  /** Same convention as movePanel: an index naming nothing returns the very same
   * object, so a caller can skip a redraw on identity rather than on a compare. */
  it("returns the same cut scene when the panel or the actor does not exist", () => {
    const one = panel({ id: "a", x: 0, y: 0 });
    expect(addActor(one, 4, { id: "b", x: 0, y: 0 })).toBe(one);
    expect(updateActor(one, 0, 3, { flip: true })).toBe(one);
    expect(updateActor(one, 0, -1, { flip: true })).toBe(one);
    expect(removeActor(one, 0, 3)).toBe(one);
  });
});

describe("cutSceneActorIds", () => {
  it("finds ids across both cut scenes and de-duplicates them", () => {
    const opening = scene({ actors: [{ id: "enemy-ghost", x: 0, y: 0 }] }, { words: "nobody" });
    const closing = scene({ actors: [{ id: "enemy-ghost", x: 0, y: 0 }, { id: "custom:bug", x: 0, y: 0 }] });
    expect(cutSceneActorIds(opening, closing).sort()).toEqual(["custom:bug", "enemy-ghost"]);
  });

  it("is empty when nobody is standing in anything", () => {
    expect(cutSceneActorIds(undefined)).toEqual([]);
    expect(cutSceneActorIds(scene({ imageId: "meadow" }))).toEqual([]);
  });
});
