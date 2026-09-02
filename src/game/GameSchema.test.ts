import { describe, expect, it } from "vitest";
import {
  addWorld,
  createEmptyGame,
  GameData,
  isGameComplete,
  moveWorld,
  nextWorldId,
  removeWorld,
  validationError,
} from "./GameSchema";

/**
 * The rules behind "a title, worlds in order, and an ending".
 *
 * Two carry most of the weight. **Order is the play order**, so anything that
 * rearranges it must never lose, duplicate or wrap an entry — a reorder bug here
 * is invisible until someone plays the game and lands in the wrong world. And
 * **a game is complete only when every world is**, derived from the per-world
 * progress that already exists rather than recorded a second time where the two
 * could disagree.
 */

const game = (over: Partial<GameData> = {}): GameData => ({
  ...createEmptyGame("g1"),
  title: "Grampa's Quest",
  worldIds: ["w1", "w2", "w3"],
  ...over,
});

describe("createEmptyGame", () => {
  it("opens needing only what the author must supply", () => {
    // A form must never start in a state its own validator cannot explain, and
    // the first thing missing should be the title, not the ending.
    const blank = createEmptyGame("g1");
    expect(validationError(blank)).toBe("Give your game a title.");
    expect(validationError({ ...blank, title: "Quest" })).toBe("Add at least one world.");
    expect(validationError({ ...blank, title: "Quest", worldIds: ["w1"] })).toBeNull();
  });

  it("comes with an ending already written", () => {
    // An ending nobody edited should still read as one rather than as a blank
    // screen at the end of someone's game.
    const blank = createEmptyGame("g1");
    expect(blank.ending.headline.trim()).not.toBe("");
    expect(blank.ending.message.trim()).not.toBe("");
  });
});

describe("validationError", () => {
  it("accepts a well-formed game", () => {
    expect(validationError(game())).toBeNull();
  });

  it("refuses the same world twice", () => {
    // Not merely untidy: beating it once would satisfy both positions and the
    // run would skip straight past the second.
    expect(validationError(game({ worldIds: ["w1", "w2", "w1"] }))).toContain("twice");
  });

  it("refuses a blank title, however it is blank", () => {
    expect(validationError(game({ title: "   " }))).toBe("Give your game a title.");
  });
});

describe("moveWorld", () => {
  it("swaps with its neighbour in the play order", () => {
    expect(moveWorld(game(), 1, -1).worldIds).toEqual(["w2", "w1", "w3"]);
    expect(moveWorld(game(), 1, 1).worldIds).toEqual(["w1", "w3", "w2"]);
  });

  it("clamps at both ends rather than wrapping", () => {
    // Wrapping would silently send the opening world to the end of the game,
    // which is the opposite of what pressing "up" on the first row means.
    expect(moveWorld(game(), 0, -1).worldIds).toEqual(["w1", "w2", "w3"]);
    expect(moveWorld(game(), 2, 1).worldIds).toEqual(["w1", "w2", "w3"]);
  });

  it("returns the very same object when nothing moved, so a caller can skip a redraw", () => {
    const g = game();
    expect(moveWorld(g, 0, -1)).toBe(g);
    expect(moveWorld(g, 99, 1)).toBe(g);
    expect(moveWorld(g, -1, 1)).toBe(g);
  });

  it("never loses or duplicates a world, whatever it is asked to do", () => {
    let g = game({ worldIds: ["a", "b", "c", "d"] });
    for (const [i, dir] of [
      [0, -1],
      [3, 1],
      [2, -1],
      [1, 1],
      [0, 1],
    ] as [number, -1 | 1][]) {
      g = moveWorld(g, i, dir);
      expect([...g.worldIds].sort()).toEqual(["a", "b", "c", "d"]);
    }
  });

  it("does not mutate the game it was given", () => {
    const g = game();
    const before = [...g.worldIds];
    moveWorld(g, 1, -1);
    expect(g.worldIds).toEqual(before);
  });
});

describe("addWorld / removeWorld", () => {
  it("appends to the end, because that is where a new world plays", () => {
    expect(addWorld(game({ worldIds: ["w1"] }), "w2").worldIds).toEqual(["w1", "w2"]);
  });

  it("refuses a duplicate rather than creating one validation would reject", () => {
    const g = game({ worldIds: ["w1", "w2"] });
    expect(addWorld(g, "w1")).toBe(g);
  });

  it("removes by id, and is a no-op for one that is not there", () => {
    expect(removeWorld(game(), "w2").worldIds).toEqual(["w1", "w3"]);
    const g = game();
    expect(removeWorld(g, "nope")).toBe(g);
  });
});

describe("isGameComplete", () => {
  it("is true only once every world is finished", () => {
    const done = new Set(["w1", "w2"]);
    expect(isGameComplete(["w1", "w2", "w3"], (id) => done.has(id))).toBe(false);
    done.add("w3");
    expect(isGameComplete(["w1", "w2", "w3"], (id) => done.has(id))).toBe(true);
  });

  it("is false for a game with no worlds", () => {
    // "Every world is finished" is vacuously true of nothing, which would show
    // the ending to someone who never played anything.
    expect(isGameComplete([], () => true)).toBe(false);
  });
});

describe("nextWorldId", () => {
  it("gives the next world, and null on the last one — the moment the ending is due", () => {
    expect(nextWorldId(game(), 0)).toBe("w2");
    expect(nextWorldId(game(), 1)).toBe("w3");
    expect(nextWorldId(game(), 2)).toBeNull();
    expect(nextWorldId(game(), 99)).toBeNull();
  });
});
