import { describe, expect, it } from "vitest";
import type { CharacterSituation } from "../gameplay/characterState";
import { situationTextureKey } from "../gameplay/wizardAnimation";
import {
  BUILT_IN_HEROES,
  DEFAULT_HERO_ID,
  heroFrameKeys,
  heroName,
  heroTextureKey,
  heroWhenRoomTurnedOn,
  isBuiltInHeroId,
  ROOM_HERO_ID,
  ZINK_FRAME_KEYS,
} from "./heroChoice";

/**
 * The thing worth testing here is not the table — it is that the table's keys
 * are the keys the runtime looks up.
 *
 * `heroChoice.ts` spells `"walk.1"` itself because it may not import the
 * gameplay layer, and `wizardAnimation.ts` spells it for the same reason in
 * reverse. Two private copies of one string is a drift waiting to happen, and
 * the drift is silent: a mis-keyed map misses every lookup and every pose falls
 * back to Grampa, which looks like "Zink isn't wired up yet" rather than like a
 * typo. So these tests ask `situationTextureKey` — the real lookup, from the
 * real module — rather than reading the map.
 */

/** Exhaustive by compiler, so a situation added to the game breaks this list as
 * well as `ZINK_POSES` rather than quietly going untested. */
const SITUATIONS: Record<CharacterSituation, true> = {
  idle: true,
  walk: true,
  jump: true,
  swim: true,
  cast: true,
  win: true,
  lose: true,
};
const everySituation = Object.keys(SITUATIONS) as CharacterSituation[];

describe("a built-in hero's frame map", () => {
  it("answers for every situation the game can be in", () => {
    const zink = heroFrameKeys("zink");
    expect(zink).not.toBeNull();
    for (const situation of everySituation) {
      const key = situationTextureKey(situation, 0, zink ?? undefined);
      expect(key, `${situation} fell back to the built-in art`).toMatch(/^zink-/);
    }
  });

  it("walks on two frames, and holds his own pose past them", () => {
    const zink = heroFrameKeys("zink") ?? undefined;
    expect(situationTextureKey("walk", 0, zink)).toBe("zink-walk1");
    expect(situationTextureKey("walk", 1, zink)).toBe("zink-walk2");
    // Nothing paints a third stride frame for a built-in hero, so index 2 holds
    // frame 0 — his own, never Grampa's.
    expect(situationTextureKey("walk", 2, zink)).toBe("zink-walk1");
  });

  it("names only textures BootScene preloads", () => {
    const zink = heroFrameKeys("zink") ?? new Map();
    const loaded = new Set<string>(ZINK_FRAME_KEYS);
    for (const key of zink.values()) expect(loaded, `${key} is not preloaded`).toContain(key);
  });

  it("leaves Grampa on the path he has always taken", () => {
    // Null, not a map of wizard-* keys: the absence is what keeps the ordinary
    // case identical rather than merely equivalent.
    expect(heroFrameKeys(undefined)).toBeNull();
    expect(heroFrameKeys("grampa")).toBeNull();
    expect(situationTextureKey("idle", 0, heroFrameKeys(undefined) ?? undefined)).toBe("wizard-idle");
  });

  it("lands an unknown hero on Grampa rather than on nothing", () => {
    // deserializeLevel casts this field rather than validating it, so a
    // misspelt or future id reaches here as an ordinary string.
    expect(heroFrameKeys("Zink")).toBeNull();
    expect(heroFrameKeys("wizard")).toBeNull();
    expect(heroFrameKeys("")).toBeNull();
  });
});

describe("naming a hero", () => {
  it("knows each built-in by face and by name", () => {
    for (const hero of BUILT_IN_HEROES) {
      expect(isBuiltInHeroId(hero)).toBe(true);
      expect(heroName(hero)).not.toBe("");
      expect(heroTextureKey(hero)).not.toBe("");
    }
    expect(heroTextureKey("zink")).toBe("zink-idle");
    expect(heroTextureKey("grampa")).toBe("wizard-idle");
  });

  it("does not mistake a skin id for a hero id", () => {
    expect(isBuiltInHeroId("1f2e3d4c-0000-4000-8000-000000000000")).toBe(false);
    expect(isBuiltInHeroId(undefined)).toBe(false);
    expect(isBuiltInHeroId(null)).toBe(false);
  });
});

describe("turning Room on", () => {
  it("claims an untouched level for Zink", () => {
    expect(heroWhenRoomTurnedOn(undefined, undefined)).toBe(ROOM_HERO_ID);
    expect(ROOM_HERO_ID).not.toBe(DEFAULT_HERO_ID);
  });

  it("keeps a hero the level already names", () => {
    expect(heroWhenRoomTurnedOn("grampa", undefined)).toBe("grampa");
    expect(heroWhenRoomTurnedOn("zink", undefined)).toBe("zink");
  });

  it("keeps out of the way of any skin choice at all", () => {
    // null is "pin the built-in art" — a child asking for Grampa in so many
    // words. A string is a painted character, which outranks this field anyway.
    expect(heroWhenRoomTurnedOn(undefined, null)).toBeUndefined();
    expect(heroWhenRoomTurnedOn(undefined, "1f2e3d4c-0000-4000-8000-000000000000")).toBeUndefined();
  });
});
