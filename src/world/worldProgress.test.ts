import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProgress,
  completedCount,
  currentIndex,
  isUnlocked,
  isWorldComplete,
  recordCompletion,
} from "./worldProgress";

/** Vitest runs under the node environment (see vite.config.ts) and jsdom isn't
 * a dependency, so localStorage has to be supplied. An in-memory stub is the
 * right scope anyway: what's under test is this module's handling of what comes
 * back out, not the browser's storage. */
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

beforeEach(() => stubLocalStorage());

describe("recordCompletion / completedCount", () => {
  it("counts a beaten level and remembers it", () => {
    recordCompletion("w1", 0);
    expect(completedCount("w1", 3)).toBe(1);
  });

  it("keeps worlds apart", () => {
    recordCompletion("w1", 2);
    expect(completedCount("w2", 5)).toBe(0);
  });

  it("never goes backwards when you replay an earlier level", () => {
    recordCompletion("w1", 2); // beat the third
    recordCompletion("w1", 0); // then replay the first
    expect(completedCount("w1", 5)).toBe(3);
  });

  it("ignores a nonsense index rather than storing it", () => {
    recordCompletion("w1", -1);
    recordCompletion("w1", 1.5);
    expect(completedCount("w1", 5)).toBe(0);
  });

  it("clamps to the levels the world actually has now", () => {
    // The world was five levels long and finished; it has since been edited
    // down to two. Without the clamp the marker would sit off the end of the
    // map and nothing that exists would read as unlocked.
    recordCompletion("w1", 4);
    expect(completedCount("w1", 2)).toBe(2);
  });
});

describe("isUnlocked", () => {
  it("always opens the first node", () => {
    expect(isUnlocked(0, 0)).toBe(true);
  });

  it("opens the next node only once the one before it is beaten", () => {
    expect(isUnlocked(1, 0)).toBe(false);
    expect(isUnlocked(1, 1)).toBe(true);
    expect(isUnlocked(2, 1)).toBe(false);
  });
});

describe("currentIndex", () => {
  it("stands on the first level not yet beaten", () => {
    expect(currentIndex(0, 3)).toBe(0);
    expect(currentIndex(1, 3)).toBe(1);
  });

  it("stays on the last node once the world is finished, not past it", () => {
    expect(currentIndex(3, 3)).toBe(2);
  });

  it("survives an empty world", () => {
    expect(currentIndex(0, 0)).toBe(0);
  });
});

describe("isWorldComplete", () => {
  it("is true only once every level is beaten", () => {
    expect(isWorldComplete(2, 3)).toBe(false);
    expect(isWorldComplete(3, 3)).toBe(true);
  });

  it("is false for a world with no levels, which cannot be completed", () => {
    expect(isWorldComplete(0, 0)).toBe(false);
  });
});

describe("clearProgress", () => {
  it("starts the world over", () => {
    recordCompletion("w1", 1);
    clearProgress("w1");
    expect(completedCount("w1", 3)).toBe(0);
  });
});

describe("bad storage", () => {
  it("reads zero from corrupted JSON rather than throwing", () => {
    localStorage.setItem("rhopers:world-progress", "{not json");
    expect(completedCount("w1", 3)).toBe(0);
  });

  it("drops entries that aren't sane counts", () => {
    localStorage.setItem("rhopers:world-progress", JSON.stringify({ w1: "lots", w2: -3, w3: 1.5, w4: 2 }));
    expect(completedCount("w1", 9)).toBe(0);
    expect(completedCount("w2", 9)).toBe(0);
    expect(completedCount("w3", 9)).toBe(0);
    expect(completedCount("w4", 9)).toBe(2);
  });

  it("survives a stored value that isn't an object at all", () => {
    localStorage.setItem("rhopers:world-progress", JSON.stringify([1, 2, 3]));
    expect(completedCount("w1", 3)).toBe(0);
  });

  it("keeps playing when localStorage itself throws", () => {
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
    expect(completedCount("w1", 3)).toBe(0);
    expect(() => recordCompletion("w1", 0)).not.toThrow();
  });
});
