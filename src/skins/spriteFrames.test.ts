import { describe, expect, it } from "vitest";
import {
  baseFrameOf,
  CHARACTER_FRAMES,
  CHARACTER_GRID_SIZE,
  CHARACTER_SKIN_ID,
  ENTITY_GRID_SIZE,
  framePlanFor,
  gridSizeFor,
  loopLength,
  resolveFrame,
} from "./spriteFrames";

/** A painted-frames map, with a distinguishable stand-in per frame so the
 * tests can tell *which* frame resolved, not just that something did. */
function painted(...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, `png:${name}`]));
}

describe("framePlanFor", () => {
  it("gives the character its five poses on the 48 grid", () => {
    const plan = framePlanFor(CHARACTER_SKIN_ID);
    expect(plan?.kind).toBe("character");
    expect(plan?.frames).toEqual(["idle", "walk1", "walk2", "jump", "cast"]);
    expect(plan?.gridSize).toBe(CHARACTER_GRID_SIZE);
  });

  it("gives every enemy a four-frame loop on the ordinary 32 grid", () => {
    for (const id of ["enemy-ghost", "enemy-spike", "enemy-bat", "enemy-golem"]) {
      const plan = framePlanFor(id);
      expect(plan, id).not.toBeNull();
      expect(plan?.kind, id).toBe("loop");
      expect(plan?.frames, id).toEqual(["0", "1", "2", "3"]);
      expect(plan?.gridSize, id).toBe(ENTITY_GRID_SIZE);
    }
  });

  it("leaves ordinary props single-frame, which is the unchanged path", () => {
    for (const id of ["item-coin", "chest", "goal", "decor-tree", "basket-up"]) {
      expect(framePlanFor(id), id).toBeNull();
    }
  });

  it("does not animate a brush merely because its id looks enemy-ish", () => {
    // The list is explicit precisely so a future "enemy-spawner" prop can't
    // silently start cycling frames.
    expect(framePlanFor("enemy-statue")).toBeNull();
  });

  it("reports the painting grid for animated and single-frame targets alike", () => {
    expect(gridSizeFor(CHARACTER_SKIN_ID)).toBe(48);
    expect(gridSizeFor("enemy-bat")).toBe(32);
    expect(gridSizeFor("item-coin")).toBe(32);
  });
});

describe("resolveFrame", () => {
  const character = framePlanFor(CHARACTER_SKIN_ID)!;
  const loop = framePlanFor("enemy-bat")!;

  it("uses a painted frame when there is one", () => {
    expect(resolveFrame(character, painted("idle", "jump"), "jump")).toBe("png:jump");
  });

  it("falls back to the skin's own idle, never to the built-in art", () => {
    // A skin with only an idle is still a usable skin — it just doesn't
    // animate. Half a painted character turning into hand-drawn Grampa
    // mid-jump would read as a bug rather than as unfinished work.
    expect(resolveFrame(character, painted("idle"), "jump")).toBe("png:idle");
    expect(resolveFrame(character, painted("idle"), "walk1")).toBe("png:idle");
    expect(resolveFrame(character, painted("idle"), "cast")).toBe("png:idle");
  });

  it("falls back to frame 0 for a loop", () => {
    expect(resolveFrame(loop, painted("0"), "2")).toBe("png:0");
  });

  it("reports nothing when the skin is entirely unpainted, so callers keep the built-in art", () => {
    expect(resolveFrame(character, {}, "idle")).toBeNull();
    expect(resolveFrame(loop, {}, "0")).toBeNull();
  });

  it("still resolves a frame the plan does not name, rather than throwing", () => {
    // Guards the storage boundary: a hand-edited or future-versioned skins
    // file can carry a frame name this build has never heard of.
    expect(resolveFrame(character, painted("idle"), "somersault")).toBe("png:idle");
  });

  it("names the frame everything else falls back to", () => {
    expect(baseFrameOf(character)).toBe("idle");
    expect(baseFrameOf(loop)).toBe("0");
    expect(CHARACTER_FRAMES[0]).toBe(baseFrameOf(character));
  });
});

describe("loopLength", () => {
  const loop = framePlanFor("enemy-golem")!;

  it("counts a full four-frame cycle", () => {
    expect(loopLength(loop, painted("0", "1", "2", "3"))).toBe(4);
  });

  it("counts the classic two-frame cycle", () => {
    expect(loopLength(loop, painted("0", "1"))).toBe(2);
  });

  it("treats a single painted frame as a still", () => {
    expect(loopLength(loop, painted("0"))).toBe(1);
  });

  it("stops at the first gap rather than stuttering over a hole", () => {
    // Frames 0, 1 and 3 painted: cycling 0,1,3 would jump, and cycling
    // 0,1,blank,3 would flicker. Two frames is the honest answer.
    expect(loopLength(loop, painted("0", "1", "3"))).toBe(2);
  });

  it("is zero for an unpainted skin", () => {
    expect(loopLength(loop, {})).toBe(0);
  });
});
