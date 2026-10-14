import { LevelData } from "../level/LevelSchema";
import { deserializeLevel, serializeLevel } from "../level/LevelSerializer";

/**
 * A local copy of work that has not reached Drive.
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
 * Strictly newer, by the level's own `updatedAt`. Equal timestamps mean the
 * draft is the copy that already reached storage, and offering that back would
 * ask a child to recover work they have not lost. Comparison is on the ISO
 * strings, which sort lexicographically for the same reason LocalStorageAdapter
 * sorts its index that way — every `updatedAt` here is written by
 * `new Date().toISOString()`, so they share a format and a zone.
 */
export function isDraftNewer(draft: LevelData, stored: { updatedAt: string } | null): boolean {
  if (!stored) return true;
  return draft.updatedAt > stored.updatedAt;
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
