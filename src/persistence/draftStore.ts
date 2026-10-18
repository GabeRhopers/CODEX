import { LevelData } from "../level/LevelSchema";
import { deserializeLevel, serializeLevel } from "../level/LevelSerializer";
import { parseWorld, WorldData } from "../world/WorldSchema";

/**
 * A local copy of work that has not reached Drive.
 *
 * Three families live here — levels, worlds, and the Thing Maker's one drawing
 * — because they share one discipline, not because they share a schema. Each is
 * keyed separately and each never throws.
 *
 * **The hole this fills is a tab close, not an outage.** `EditorScene`'s
 * `handlePageHide` does `void this.persistLevel()` — an async Drive write fired
 * as the page is being torn down, which the browser is under no obligation to
 * finish and usually does not. Everything else about a failed save is already
 * handled well (the level stays on screen, stays dirty, and `leaveToMenu`
 * refuses to navigate), so the one way a child's work actually disappears is
 * closing the tab before a save lands. `localStorage` is **synchronous**, which
 * makes it the only write that can complete in that moment.
 *
 * **Drive stays the single source of truth.** A draft is unsent mail, not a
 * second library: it exists only while storage has not accepted the work, it is
 * cleared the moment a save succeeds, and it is offered back only when it is
 * strictly newer than what storage returns. Nothing here ever becomes the
 * canonical copy of a level, which is what keeps "which one is real?" from
 * being a question anyone has to answer.
 *
 * Takes its `Storage` as an argument rather than reaching for `localStorage`,
 * for the reason spriteFrames.ts and characterState.ts take their inputs: this
 * module then needs no `window` and unit-tests in Vitest's node environment,
 * where `localStorage` does not exist. It is also how the quota path gets
 * tested at all.
 */

/** One key per level, so a quota failure on a big level cannot take the other
 * drafts with it — the alternative, one JSON blob holding every draft, loses
 * everything each time it cannot be rewritten. */
const draftKey = (id: string) => `rhopers:draft:${id}`;

const DRAFT_PREFIX = "rhopers:draft:";

/**
 * Writes a draft, returning whether it landed.
 *
 * Never throws. `localStorage.setItem` throws on quota (and in Safari's private
 * mode on any write at all), and every caller here is in a path where throwing
 * is worse than failing: one of them runs during page teardown, and the other
 * is already handling a failed save. A caller that wants to know can check the
 * return, but none of them can do anything useful about it.
 */
export function saveDraft(storage: Storage, level: LevelData): boolean {
  try {
    storage.setItem(draftKey(level.id), serializeLevel(level));
    return true;
  } catch {
    return false;
  }
}

/** The draft for a level, or null if there is none or it cannot be read. A
 * corrupt draft is treated as absent rather than surfaced: it is a recovery
 * aid, and one that fails to parse has nothing to offer. */
export function loadDraft(storage: Storage, id: string): LevelData | null {
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return deserializeLevel(raw);
  } catch {
    return null;
  }
}

/** Called on every successful save, so it must tolerate there being nothing to
 * clear — which is the common case, since most saves follow a save. */
export function clearDraft(storage: Storage, id: string): void {
  try {
    storage.removeItem(draftKey(id));
  } catch {
    // Nothing to do and nothing worth telling the user: the draft is stale at
    // worst, and `isDraftNewer` will decline to offer it.
  }
}

/**
 * Whether a draft is worth offering back.
 *
 * Strictly newer, by the document's own `updatedAt`. Equal timestamps mean the
 * draft is the copy that already reached storage, and offering that back would
 * ask a child to recover work they have not lost. Comparison is on the ISO
 * strings, which sort lexicographically for the same reason LocalStorageAdapter
 * sorts its index that way — every `updatedAt` here is written by
 * `new Date().toISOString()`, so they share a format and a zone.
 *
 * Takes `{ updatedAt }` rather than a `LevelData` so levels and worlds settle
 * this the same way. Two copies of a one-line comparison is how two copies
 * start disagreeing about whether an equal timestamp counts.
 */
export function isDraftNewer(draft: { updatedAt: string }, stored: { updatedAt: string } | null): boolean {
  if (!stored) return true;
  return draft.updatedAt > stored.updatedAt;
}

/**
 * The same three calls for a world, under their own key family.
 *
 * A world is worth as much as a level and was exposed the same way:
 * `WorldMakerScene.handlePageHide` fired `void persistWorld()` into a page
 * being torn down, so closing the tab mid-outage lost which levels were in the
 * world, what order they played in, where their nodes sat on the map, and the
 * backdrop — about eight gestures, and no copy of them anywhere.
 *
 * Kept separate from the level keys rather than sharing one, because an id
 * collision between a level and a world would hand the editor a world to open.
 * They come from the same `crypto.randomUUID()`, so a collision is not
 * realistic, but the cost of ruling it out is one word in a string.
 */
const worldDraftKey = (id: string) => `rhopers:worlddraft:${id}`;

export function saveWorldDraft(storage: Storage, world: WorldData): boolean {
  try {
    storage.setItem(worldDraftKey(world.id), JSON.stringify(world));
    return true;
  } catch {
    // Quota, or Safari's private mode — see saveDraft for why this never
    // throws: the caller is in page teardown or already handling a failed save.
    return false;
  }
}

/**
 * The draft for a world, or null if there is none or it cannot be read.
 *
 * Validated by `parseWorld`, the same reader every stored world goes through,
 * rather than a second shape check written here. A draft that does not parse is
 * treated as absent for the reason `loadDraft` treats a corrupt level that way:
 * it is a recovery aid, and one that cannot be read has nothing to offer.
 */
export function loadWorldDraft(storage: Storage, id: string): WorldData | null {
  let raw: string | null;
  try {
    raw = storage.getItem(worldDraftKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parseWorld(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Called on every successful world save, so it must tolerate there being
 * nothing to clear — the common case, since most saves follow a save. */
export function clearWorldDraft(storage: Storage, id: string): void {
  try {
    storage.removeItem(worldDraftKey(id));
  } catch {
    // Same as clearDraft: a stale draft is stale at worst, and isDraftNewer
    // will decline to offer it.
  }
}

/**
 * The Thing Maker's draft, under one key.
 *
 * **One key, not one per thing, because only one thing is ever being drawn.**
 * The Thing Maker holds a single editing target at a time, so there is no
 * second draft to collide with, and the draft carries its own identity (the
 * brush and the skin id it came from) for the restore to check against.
 *
 * Generic rather than typed against `EditingTarget`: that interface lives in
 * SkinEditorScene, importing it here would drag Phaser into a module whose
 * whole point is not needing it, and re-declaring its shape would be a second
 * copy to keep in step. What this module owns is the storage discipline — one
 * key, never throwing — not the schema, which the scene knows and asserts.
 *
 * The exposure here is worse than the level editor's, which is why it is worth
 * the code: SkinEditorScene has no autosave, no pagehide flush and no dirty
 * tracking of its own, so before this the only copy of a drawing was the one on
 * screen, for the whole session.
 */
const THING_DRAFT_KEY = "rhopers:thingdraft";

export function saveThingDraft(storage: Storage, value: unknown): boolean {
  try {
    storage.setItem(THING_DRAFT_KEY, JSON.stringify(value));
    return true;
  } catch {
    // Quota, or Safari's private mode. Same reasoning as saveDraft: the caller
    // is in page teardown and has nothing better to do about it.
    return false;
  }
}

/** The stored draft, or null if there is none or it cannot be read. The caller
 * asserts the shape; a draft written by an older version that no longer parses
 * is treated as absent, which is the same call `loadDraft` makes. */
export function loadThingDraft<T>(storage: Storage): T | null {
  let raw: string | null;
  try {
    raw = storage.getItem(THING_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearThingDraft(storage: Storage): void {
  try {
    storage.removeItem(THING_DRAFT_KEY);
  } catch {
    // Nothing useful to do; a stale draft is offered back at most once and the
    // next save clears it again.
  }
}

/** Every level id that currently has a draft. Used by nothing yet; it is here
 * because a "you have unsaved work elsewhere" prompt is the obvious next step
 * and the key layout above is what makes it cheap. */
export function draftIds(storage: Storage): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) ids.push(key.slice(DRAFT_PREFIX.length));
    }
  } catch {
    return [];
  }
  return ids;
}
