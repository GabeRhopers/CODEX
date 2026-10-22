import { describe, expect, it } from "vitest";
import { backDestination } from "./backDestination";

/**
 * The button in the corner of a level, and the sentence under a win.
 *
 * Worth a test rather than a glance because every branch produces a
 * plausible-looking word: the failure mode is a button that says one place and
 * goes to another, which looks completely normal in a screenshot and is only
 * wrong once somebody presses it.
 */

describe("backDestination", () => {
  it("sends a level played from Test Play back to the editor", () => {
    // The only entry that passes no returnScene at all, so it is the fallback
    // that every unknown case lands on too.
    expect(backDestination({})).toEqual({ label: "Editor", phrase: "the editor" });
  });

  it("names Templates and My Levels by what the player saw", () => {
    expect(backDestination({ returnScene: "Templates" })).toEqual({ label: "Templates", phrase: "Templates" });
    // Not "LevelBrowser": a player never sees a scene key, and that screen's
    // own heading reads My Levels.
    expect(backDestination({ returnScene: "LevelBrowser" })).toEqual({ label: "My Levels", phrase: "My Levels" });
  });

  it("falls back to the editor for a scene it has no name for", () => {
    // A returnScene nobody taught it about must not produce an empty button.
    expect(backDestination({ returnScene: "SomeFutureScreen" })).toEqual({ label: "Editor", phrase: "the editor" });
  });

  it("goes to the map for a saved world, and to Worlds for an unsaved one", () => {
    expect(backDestination({ world: { worldId: "w1" } })).toEqual({ label: "Map", phrase: "the map" });
    expect(backDestination({ world: {} })).toEqual({ label: "Worlds", phrase: "Worlds" });
  });

  it("lets a world run win over where the player came from", () => {
    // Load-bearing, and the reason this is one function rather than two
    // independent lookups: being inside a world is the stronger fact, so a run
    // started from My Levels still goes back to its map and not to the list.
    expect(backDestination({ world: { worldId: "w1" }, returnScene: "LevelBrowser" })).toEqual({
      label: "Map",
      phrase: "the map",
    });
  });

  it("gives a phrase that reads as English mid-sentence", () => {
    // The hint is "press Esc for <phrase>", so a label dropped straight in
    // would read "press Esc for Editor".
    for (const context of [{}, { world: { worldId: "w1" } }]) {
      expect(`Press R to play again, or Esc for ${backDestination(context).phrase}`).toMatch(
        /Esc for (the editor|the map)$/,
      );
    }
  });
});
