import { beforeEach, describe, expect, it } from "vitest";
import { clearActiveProfile, isProfile, loadActiveProfile, PROFILES, saveActiveProfile } from "./Profile";

/**
 * The three profiles are a filter, not an access boundary (see Profile.ts's own
 * docstring), but the *storage* behind them still has real rules — and one of
 * them is a documented near-miss: `clearActiveProfile` has to remove the legacy
 * key too, because otherwise the very next `loadActiveProfile` migrates it
 * straight back and silently undoes the Switch profile click.
 *
 * None of this was covered. Every e2e spec seeds `rhopers:profile` before the
 * page loads, so the migration path and the clear path had never run in a test
 * at all.
 */

/** Vitest runs under the node environment (see vite.config.ts) and jsdom isn't
 * a dependency, so localStorage has to be supplied — same in-memory stub
 * worldProgress.test.ts uses, and the right scope anyway: what is under test is
 * this module's handling of what comes back out, not the browser's storage. */
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

const CURRENT_KEY = "rhopers:profile";
const LEGACY_KEY = "spellbound:profile";

beforeEach(() => stubLocalStorage());

describe("isProfile", () => {
  it("accepts exactly the three real profiles", () => {
    expect(PROFILES).toEqual(["Mike", "Gabriel", "Andressa"]);
    for (const profile of PROFILES) expect(isProfile(profile)).toBe(true);
  });

  it("rejects anything else, including near-misses", () => {
    for (const value of ["", "mike", "Mike ", "Bob", "null", "[object Object]"]) {
      expect(isProfile(value), value).toBe(false);
    }
  });
});

describe("loadActiveProfile", () => {
  it("reports nobody when nothing is stored", () => {
    expect(loadActiveProfile()).toBeNull();
  });

  it("reports nobody when what is stored is not a profile", () => {
    // Never trust storage: a hand-edited or stale value must send someone back
    // through the picker rather than through as a profile that doesn't exist.
    localStorage.setItem(CURRENT_KEY, "Bob");
    expect(loadActiveProfile()).toBeNull();
  });

  it("migrates a device that only has the pre-rename key", () => {
    // The app was renamed on 2026-08-16; a device that picked a profile before
    // that must not be sent back through the picker just because the key
    // changed underneath it.
    localStorage.setItem(LEGACY_KEY, "Gabriel");
    expect(loadActiveProfile()).toBe("Gabriel");
  });

  it("makes that migration stick, rather than re-reading the legacy key forever", () => {
    localStorage.setItem(LEGACY_KEY, "Gabriel");
    loadActiveProfile();
    expect(localStorage.getItem(CURRENT_KEY)).toBe("Gabriel");
  });

  it("ignores a legacy value that isn't a profile either", () => {
    localStorage.setItem(LEGACY_KEY, "Bob");
    expect(loadActiveProfile()).toBeNull();
    expect(localStorage.getItem(CURRENT_KEY)).toBeNull();
  });

  it("prefers the current key when both are set and disagree", () => {
    localStorage.setItem(CURRENT_KEY, "Andressa");
    localStorage.setItem(LEGACY_KEY, "Mike");
    expect(loadActiveProfile()).toBe("Andressa");
  });
});

describe("saveActiveProfile", () => {
  it("round-trips", () => {
    saveActiveProfile("Andressa");
    expect(loadActiveProfile()).toBe("Andressa");
  });
});

describe("clearActiveProfile", () => {
  it("clears the current key", () => {
    saveActiveProfile("Mike");
    clearActiveProfile();
    expect(loadActiveProfile()).toBeNull();
  });

  it("clears the legacy key too, so nothing migrates the old profile back", () => {
    // This is the whole point, and the failure mode is invisible: clearing only
    // the current key leaves the legacy one to be migrated by the very next
    // load, so Switch profile would appear to do nothing at all.
    localStorage.setItem(LEGACY_KEY, "Mike");
    saveActiveProfile("Mike");

    clearActiveProfile();

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(loadActiveProfile()).toBeNull();
  });
});
