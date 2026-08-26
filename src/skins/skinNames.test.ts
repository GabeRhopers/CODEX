import { describe, expect, it } from "vitest";
import { defaultSkinName, displaySkinName, MAX_SKIN_NAME_LENGTH, sanitizeSkinName } from "./skinNames";

describe("displaySkinName", () => {
  it("uses the skin's own name when it has one", () => {
    expect(displaySkinName({ name: "Spooky ghost" }, "Ghost")).toBe("Spooky ghost");
  });

  it("falls back to the brush label for a skin saved before names existed", () => {
    // This is what makes the field optional and the change migration-free: an
    // old library entry keeps reading exactly as it did.
    expect(displaySkinName({}, "Ghost")).toBe("Ghost");
    expect(displaySkinName({ name: undefined }, "Ghost")).toBe("Ghost");
  });

  it("treats a blank or whitespace name as no name at all", () => {
    expect(displaySkinName({ name: "" }, "Ghost")).toBe("Ghost");
    expect(displaySkinName({ name: "   " }, "Ghost")).toBe("Ghost");
  });

  it("trims, so a stray space can't shift a row's text", () => {
    expect(displaySkinName({ name: "  Spooky  " }, "Ghost")).toBe("Spooky");
  });
});

describe("defaultSkinName", () => {
  it("starts at 1 for the first skin of a brush", () => {
    expect(defaultSkinName("Ghost", [])).toBe("Ghost 1");
  });

  it("gives the next one a distinct name without anyone typing", () => {
    expect(defaultSkinName("Ghost", ["Ghost 1"])).toBe("Ghost 2");
    expect(defaultSkinName("Ghost", ["Ghost 1", "Ghost 2"])).toBe("Ghost 3");
  });

  it("fills the lowest free number rather than counting", () => {
    // Deleting "Ghost 1" and making another should not produce a second
    // "Ghost 2" — two identically-named skins are the exact problem names
    // exist to solve.
    expect(defaultSkinName("Ghost", ["Ghost 2", "Ghost 3"])).toBe("Ghost 1");
  });

  it("ignores names that aren't of its own shape", () => {
    expect(defaultSkinName("Ghost", ["Spooky", "My ghost"])).toBe("Ghost 1");
  });

  it("doesn't collide with a hand-typed name that happens to match", () => {
    expect(defaultSkinName("Ghost", ["ghost 1", "  GHOST 2  "])).toBe("Ghost 3");
  });

  it("works for a brush label with a space in it", () => {
    expect(defaultSkinName("Sleep Bat", ["Sleep Bat 1"])).toBe("Sleep Bat 2");
  });
});

describe("sanitizeSkinName", () => {
  it("keeps a real name, trimmed", () => {
    expect(sanitizeSkinName("  Spooky ghost ", "Ghost 1")).toBe("Spooky ghost");
  });

  it("falls back rather than storing a blank, matching LevelNameInput", () => {
    expect(sanitizeSkinName("", "Ghost 1")).toBe("Ghost 1");
    expect(sanitizeSkinName("   ", "Ghost 1")).toBe("Ghost 1");
    expect(sanitizeSkinName(undefined, "Ghost 1")).toBe("Ghost 1");
  });

  it("caps the length so a long name can't run into the row's buttons", () => {
    const long = "x".repeat(MAX_SKIN_NAME_LENGTH + 40);
    expect(sanitizeSkinName(long, "Ghost 1")).toHaveLength(MAX_SKIN_NAME_LENGTH);
  });
});
