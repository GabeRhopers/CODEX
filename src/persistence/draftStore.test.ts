import { describe, expect, it } from "vitest";
import { clearDraft, clearThingDraft, draftIds, isDraftNewer, loadDraft, loadThingDraft, saveDraft, saveThingDraft } from "./draftStore";
import { LevelData } from "../level/LevelSchema";
import { createEmptyGrid, SCHEMA_VERSION } from "../level/LevelSchema";

/** A minimal Storage, because Vitest runs in node and there is no
 * `localStorage` — the same reason draftStore takes one as an argument. */
function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    ...overrides,
  } as Storage;
}

/** Storage that refuses every write, which is what a full quota looks like —
 * and, in Safari's private mode, what every write looks like. */
const fullStorage = (): Storage =>
  fakeStorage({
    setItem: () => {
      throw new DOMException("QuotaExceededError");
    },
  });

function level(id: string, updatedAt: string, name = "A Level"): LevelData {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    tileSize: 32,
    width: 20,
    height: 12,
    layers: { ground: createEmptyGrid(20, 12) },
    entities: [],
  };
}

describe("draftStore", () => {
  it("round-trips a level through a draft", () => {
    const storage = fakeStorage();
    const original = level("a", "2026-10-14T10:00:00.000Z", "Meadow Path");
    expect(saveDraft(storage, original)).toBe(true);

    const back = loadDraft(storage, "a");
    expect(back?.id).toBe("a");
    expect(back?.name).toBe("Meadow Path");
    expect(back?.updatedAt).toBe("2026-10-14T10:00:00.000Z");
  });

  it("keeps drafts for different levels apart", () => {
    const storage = fakeStorage();
    saveDraft(storage, level("a", "2026-10-14T10:00:00.000Z", "One"));
    saveDraft(storage, level("b", "2026-10-14T11:00:00.000Z", "Two"));
    expect(loadDraft(storage, "a")?.name).toBe("One");
    expect(loadDraft(storage, "b")?.name).toBe("Two");
  });

  it("has nothing to offer when no draft was written", () => {
    expect(loadDraft(fakeStorage(), "never-saved")).toBeNull();
  });

  it("clears a draft, and tolerates clearing one that is not there", () => {
    const storage = fakeStorage();
    saveDraft(storage, level("a", "2026-10-14T10:00:00.000Z"));
    clearDraft(storage, "a");
    expect(loadDraft(storage, "a")).toBeNull();
    expect(() => clearDraft(storage, "a")).not.toThrow();
  });

  it("reports failure instead of throwing when storage is full", () => {
    // Load-bearing: one caller runs during page teardown and the other is
    // already handling a failed save. Throwing in either is worse than
    // returning false.
    expect(saveDraft(fullStorage(), level("a", "2026-10-14T10:00:00.000Z"))).toBe(false);
  });

  it("treats a corrupt draft as absent rather than throwing", () => {
    const storage = fakeStorage();
    storage.setItem("rhopers:draft:a", "{ this is not a level");
    expect(loadDraft(storage, "a")).toBeNull();
  });

  describe("isDraftNewer", () => {
    it("offers a draft that is newer than what storage holds", () => {
      const draft = level("a", "2026-10-14T12:00:00.000Z");
      expect(isDraftNewer(draft, { updatedAt: "2026-10-14T11:00:00.000Z" })).toBe(true);
    });

    it("declines one that only matches storage", () => {
      // The common case after a successful save: the draft *is* what landed, so
      // offering it would ask a child to recover work they never lost.
      const draft = level("a", "2026-10-14T12:00:00.000Z");
      expect(isDraftNewer(draft, { updatedAt: "2026-10-14T12:00:00.000Z" })).toBe(false);
    });

    it("declines one that is older than what storage holds", () => {
      const draft = level("a", "2026-10-14T10:00:00.000Z");
      expect(isDraftNewer(draft, { updatedAt: "2026-10-14T12:00:00.000Z" })).toBe(false);
    });

    it("offers a draft for a level storage has never heard of", () => {
      // A level that was never successfully saved at all — the case with the
      // most to lose, since there is no other copy anywhere.
      expect(isDraftNewer(level("a", "2026-10-14T10:00:00.000Z"), null)).toBe(true);
    });
  });

  describe("the Thing Maker's draft", () => {
    interface Target {
      brush: { id: string };
      name: string;
      frameCells: Record<string, (string | null)[]>;
    }
    const target: Target = {
      brush: { id: "custom:bug" },
      name: "Grumble Bug",
      frameCells: { "idle.0": ["#ff0000", null, "#00ff00"] },
    };

    it("round-trips the whole editing target, nulls and all", () => {
      // The nulls matter: a null cell is "not painted", and JSON that dropped
      // them would shift every cell after it and smear the drawing.
      const storage = fakeStorage();
      expect(saveThingDraft(storage, target)).toBe(true);
      expect(loadThingDraft<Target>(storage)).toEqual(target);
    });

    it("has nothing to offer when none was written", () => {
      expect(loadThingDraft(fakeStorage())).toBeNull();
    });

    it("keeps only the newest, since only one thing is drawn at a time", () => {
      const storage = fakeStorage();
      saveThingDraft(storage, { ...target, name: "First" });
      saveThingDraft(storage, { ...target, name: "Second" });
      expect(loadThingDraft<Target>(storage)?.name).toBe("Second");
    });

    it("clears, and tolerates clearing nothing", () => {
      const storage = fakeStorage();
      saveThingDraft(storage, target);
      clearThingDraft(storage);
      expect(loadThingDraft(storage)).toBeNull();
      expect(() => clearThingDraft(storage)).not.toThrow();
    });

    it("reports failure instead of throwing when storage is full", () => {
      expect(saveThingDraft(fullStorage(), target)).toBe(false);
    });

    it("treats a corrupt draft as absent", () => {
      const storage = fakeStorage();
      storage.setItem("rhopers:thingdraft", "{ not json");
      expect(loadThingDraft(storage)).toBeNull();
    });

    it("does not collide with a level draft", () => {
      // Different keyspaces; a child with both an unsaved level and an unsaved
      // drawing must not lose one to the other.
      const storage = fakeStorage();
      saveDraft(storage, level("a", "2026-10-14T10:00:00.000Z"));
      saveThingDraft(storage, target);
      expect(loadDraft(storage, "a")).not.toBeNull();
      expect(loadThingDraft<Target>(storage)?.name).toBe("Grumble Bug");
      expect(draftIds(storage)).toEqual(["a"]);
    });
  });

  describe("draftIds", () => {
    it("lists only draft keys, stripped of their prefix", () => {
      const storage = fakeStorage();
      saveDraft(storage, level("a", "2026-10-14T10:00:00.000Z"));
      saveDraft(storage, level("b", "2026-10-14T10:00:00.000Z"));
      storage.setItem("rhopers:index", "[]"); // LocalStorageAdapter's key, not a draft
      expect(draftIds(storage).sort()).toEqual(["a", "b"]);
    });

    it("is empty when there are none", () => {
      expect(draftIds(fakeStorage())).toEqual([]);
    });
  });
});
