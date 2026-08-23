import { describe, expect, it } from "vitest";
import {
  builtInReferenceId,
  builtInReferenceSources,
  NO_REFERENCE_ID,
  parseReferenceId,
  skinReferenceId,
} from "./referenceSources";

describe("builtInReferenceSources", () => {
  const sources = builtInReferenceSources();

  it("offers all five of Grampa's poses, which is the whole point", () => {
    // His art can't be imported into the pixel canvas, so tracing it is the
    // only way to make a pixel character that matches the original.
    const labels = sources.filter((s) => s.label.startsWith("Grampa ")).map((s) => s.label);
    expect(labels).toEqual(["Grampa idle", "Grampa walk1", "Grampa walk2", "Grampa jump", "Grampa cast"]);
  });

  it("puts the character frames first, ahead of the brushes", () => {
    expect(sources[0].label).toBe("Grampa idle");
  });

  it("includes every enemy, for drawing a replacement over what it replaces", () => {
    const labels = sources.map((s) => s.label);
    for (const expected of ["Ghost", "Spike", "Bat", "Golem"]) {
      expect(labels, expected).toContain(expected);
    }
  });

  it("leaves out tiles and hazards, which have no standalone sprite to trace", () => {
    const labels = sources.map((s) => s.label);
    for (const excluded of ["Grass", "Brick", "Water", "Desert"]) {
      expect(labels, excluded).not.toContain(excluded);
    }
  });

  it("leaves out one-off props by default, so the picker stays a usable size", () => {
    // Listing every skinnable brush was tried and rejected from a screenshot:
    // ~30 entries ran the dropdown off the bottom of the canvas and collided
    // the labels into each other. Tracing someone else's coin while drawing a
    // chest was not worth that.
    const labels = sources.map((s) => s.label);
    for (const excluded of ["Coin", "Heart", "Bush", "Cloud"]) {
      expect(labels, excluded).not.toContain(excluded);
    }
  });

  it("still offers the thing you are currently editing, whatever it is", () => {
    // The rule is "the animated cast, plus whatever you're working on" — so
    // reskinning the Coin can still trace the coin.
    const editingCoin = builtInReferenceSources("item-coin").map((s) => s.label);
    expect(editingCoin).toContain("Coin");
    expect(editingCoin).toContain("Grampa idle");
  });

  it("does not list the current target twice when it is already in the list", () => {
    const editingGhost = builtInReferenceSources("enemy-ghost");
    expect(editingGhost.filter((s) => s.label === "Ghost")).toHaveLength(1);
  });

  it("ignores a target id that matches no brush rather than throwing", () => {
    expect(() => builtInReferenceSources("no-such-brush")).not.toThrow();
    expect(builtInReferenceSources("no-such-brush").length).toBe(sources.length);
  });

  it("never lists the same texture twice", () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a texture key to draw a thumbnail from", () => {
    for (const source of sources) {
      expect(source.textureKey, source.label).toBeTruthy();
      expect(source.kind).toBe("builtin");
    }
  });
});

describe("reference ids", () => {
  it("round-trips a built-in", () => {
    const id = builtInReferenceId("wizard-jump");
    expect(parseReferenceId(id)).toEqual({ kind: "builtin", parts: ["wizard-jump"] });
  });

  it("round-trips a saved skin", () => {
    const id = skinReferenceId("enemy-ghost", "abc-123");
    expect(parseReferenceId(id)).toEqual({ kind: "skin", parts: ["enemy-ghost", "abc-123"] });
  });

  it("splits a skin id on the first colon only, so an asset id may contain one", () => {
    expect(parseReferenceId(skinReferenceId("enemy-bat", "a:b:c"))).toEqual({
      kind: "skin",
      parts: ["enemy-bat", "a:b:c"],
    });
  });

  it("keeps a built-in and a saved skin from ever colliding", () => {
    expect(builtInReferenceId("enemy-ghost")).not.toBe(skinReferenceId("enemy-ghost", "enemy-ghost"));
  });

  it("returns null for the off sentinel and for anything unrecognised", () => {
    expect(parseReferenceId(NO_REFERENCE_ID)).toBeNull();
    expect(parseReferenceId("")).toBeNull();
    expect(parseReferenceId("skin:no-asset-part")).toBeNull();
    expect(parseReferenceId("something-else")).toBeNull();
  });
});
