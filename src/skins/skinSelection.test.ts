import { describe, expect, it } from "vitest";
import { resolveSkinId, sanitizeLevelSkins, skinSource, withLevelSkin } from "./skinSelection";

const AVAILABLE = ["skin-a", "skin-b"];

describe("resolveSkinId", () => {
  it("prefers the level's own choice over the default", () => {
    expect(resolveSkinId("skin-a", "skin-b", AVAILABLE)).toBe("skin-a");
  });

  it("falls back to the default when the level has not decided", () => {
    expect(resolveSkinId(undefined, "skin-b", AVAILABLE)).toBe("skin-b");
  });

  it("uses built-in art when neither layer has anything", () => {
    expect(resolveSkinId(undefined, null, AVAILABLE)).toBeNull();
    expect(resolveSkinId(undefined, undefined, [])).toBeNull();
  });

  it("honours a level that explicitly chose built-in art, default or no default", () => {
    // The whole point of the third state: someone who deliberately wanted
    // Grampa's own art in this level does not get overruled the day a default
    // is set for everyone.
    expect(resolveSkinId(null, "skin-b", AVAILABLE)).toBeNull();
  });

  it("falls through to the default when the level names a deleted skin", () => {
    expect(resolveSkinId("gone", "skin-b", AVAILABLE)).toBe("skin-b");
  });

  it("falls all the way to built-in art when both layers name deleted skins", () => {
    expect(resolveSkinId("gone", "also-gone", AVAILABLE)).toBeNull();
  });
});

describe("skinSource", () => {
  it("reports the layer that actually supplied the answer", () => {
    expect(skinSource("skin-a", "skin-b", AVAILABLE)).toBe("level");
    expect(skinSource(undefined, "skin-b", AVAILABLE)).toBe("default");
    expect(skinSource(undefined, null, AVAILABLE)).toBe("builtin");
  });

  it("calls a deliberate built-in choice a level decision, because it is one", () => {
    expect(skinSource(null, "skin-b", AVAILABLE)).toBe("level");
  });

  it("reports the default when the level's choice has been deleted, matching what is on screen", () => {
    expect(skinSource("gone", "skin-b", AVAILABLE)).toBe("default");
  });
});

describe("withLevelSkin", () => {
  it("records a chosen skin", () => {
    expect(withLevelSkin(undefined, "enemy-ghost", "skin-a")).toEqual({ "enemy-ghost": "skin-a" });
  });

  it("records an explicit built-in choice as null, not as an absence", () => {
    expect(withLevelSkin({}, "enemy-ghost", null)).toEqual({ "enemy-ghost": null });
  });

  it("deletes the key for 'follow the default' rather than storing a sentinel", () => {
    // Otherwise every saved level would carry an entry for every brush whose
    // picker anyone ever opened.
    expect(withLevelSkin({ "enemy-ghost": "skin-a" }, "enemy-ghost", undefined)).toEqual({});
  });

  it("leaves other brushes alone and never mutates its input", () => {
    const before = { "enemy-ghost": "skin-a", "item-coin": "skin-b" };
    const after = withLevelSkin(before, "enemy-ghost", null);
    expect(after).toEqual({ "enemy-ghost": null, "item-coin": "skin-b" });
    expect(before).toEqual({ "enemy-ghost": "skin-a", "item-coin": "skin-b" });
  });
});

describe("sanitizeLevelSkins", () => {
  it("keeps skin ids and explicit nulls", () => {
    expect(sanitizeLevelSkins({ a: "skin-a", b: null })).toEqual({ a: "skin-a", b: null });
  });

  it("drops values that could never be a choice", () => {
    expect(sanitizeLevelSkins({ a: 7, b: {}, c: "skin-a" })).toEqual({ c: "skin-a" });
  });

  it("returns undefined for anything that isn't a plain object, or holds nothing usable", () => {
    expect(sanitizeLevelSkins(undefined)).toBeUndefined();
    expect(sanitizeLevelSkins(null)).toBeUndefined();
    expect(sanitizeLevelSkins(["skin-a"])).toBeUndefined();
    expect(sanitizeLevelSkins("skin-a")).toBeUndefined();
    expect(sanitizeLevelSkins({})).toBeUndefined();
    expect(sanitizeLevelSkins({ a: 7 })).toBeUndefined();
  });
});

describe("the layering as a whole", () => {
  it("leaves a pre-2026-08-23 level looking exactly as it did", () => {
    // Every such level has no `skins` field, so every brush reads undefined and
    // defers to activeId — which is precisely what used to be the only answer.
    // This is the claim that says the change needs no migration.
    const level = undefined;
    for (const activeId of ["skin-a", "skin-b", null]) {
      expect(resolveSkinId(level?.["enemy-ghost"], activeId, AVAILABLE)).toBe(activeId);
    }
  });

  it("lets two levels wear different skins for the same brush at once", () => {
    const levelA: Record<string, string | null> = { "enemy-ghost": "skin-a" };
    const levelB: Record<string, string | null> = { "enemy-ghost": null };
    expect(resolveSkinId(levelA["enemy-ghost"], "skin-b", AVAILABLE)).toBe("skin-a");
    expect(resolveSkinId(levelB["enemy-ghost"], "skin-b", AVAILABLE)).toBeNull();
  });
});
