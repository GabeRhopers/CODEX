import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomColor,
  loadCustomColors,
  MAX_CUSTOM_COLORS,
  removeCustomColor,
  sanitizeCustomColors,
  saveCustomColors,
} from "./customPalette";

describe("addCustomColor", () => {
  it("puts the newest colour first", () => {
    expect(addCustomColor(["#111111"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("moves a colour you reach for again to the front instead of duplicating", () => {
    expect(addCustomColor(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("returns the same array when the colour is already first, so no pointless write", () => {
    const colors = ["#111111"];
    expect(addCustomColor(colors, "#111111")).toBe(colors);
  });

  it("treats two spellings of one colour as one", () => {
    expect(addCustomColor(["#aabbcc"], "#AABBCC")).toEqual(["#aabbcc"]);
  });

  it("caps the list, dropping the least recent", () => {
    let colors: string[] = [];
    for (let i = 0; i < MAX_CUSTOM_COLORS + 4; i++) {
      colors = addCustomColor(colors, `#0000${i.toString(16).padStart(2, "0")}`);
    }
    expect(colors).toHaveLength(MAX_CUSTOM_COLORS);
    expect(colors[0]).toBe("#000013"); // the most recent
  });

  it("ignores something that isn't a colour", () => {
    const colors = ["#111111"];
    expect(addCustomColor(colors, "chartreuse")).toBe(colors);
  });
});

describe("removeCustomColor", () => {
  it("removes by value, whatever the case", () => {
    expect(removeCustomColor(["#aabbcc", "#111111"], "#AABBCC")).toEqual(["#111111"]);
  });
});

describe("sanitizeCustomColors", () => {
  it("drops junk, duplicates and non-strings rather than rendering them", () => {
    expect(sanitizeCustomColors(["#111111", "nope", 7, "#111111", "#222222"])).toEqual(["#111111", "#222222"]);
  });

  it("survives a value that isn't a list at all", () => {
    expect(sanitizeCustomColors({ nope: true })).toEqual([]);
    expect(sanitizeCustomColors(null)).toEqual([]);
  });
});

/**
 * Vitest runs these under the node environment (see vite.config.ts) and jsdom
 * isn't a dependency, so localStorage has to be supplied. An in-memory stub is
 * the honest scope anyway: what's under test is this module's handling of what
 * comes back out — including the corrupted case — not the browser's storage.
 */
function stubLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

describe("storage", () => {
  beforeEach(() => stubLocalStorage());

  it("round-trips", () => {
    saveCustomColors(["#123456"]);
    expect(loadCustomColors()).toEqual(["#123456"]);
  });

  it("returns empty rather than throwing on corrupted storage", () => {
    localStorage.setItem("rhopers:custom-palette", "{not json");
    expect(loadCustomColors()).toEqual([]);
  });

  it("survives storage that throws — a full quota must not take the editor down", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    expect(loadCustomColors()).toEqual([]);
    expect(() => saveCustomColors(["#123456"])).not.toThrow();
  });
});
