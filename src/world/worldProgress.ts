/**
 * How far a player has got through each world.
 *
 * Kept in localStorage rather than in the world document, because it is not a
 * property of the world — two people opening the same world have different
 * progress, and the author editing a world should not be publishing their own
 * save file with it. Same reasoning, and the same never-trust-storage handling,
 * as audioPrefs.ts and customPalette.ts.
 *
 * The unlock rule is deliberately the simplest one that still gates: node *n+1*
 * opens when node *n* is beaten. It falls straight out of `levelIds` already
 * being an ordered list, so no separate graph of prerequisites has to exist.
 */

const STORAGE_KEY = "rhopers:world-progress";

/** worldId -> how many of its levels, counting from the first, are beaten. */
type ProgressMap = Record<string, number>;

/** Drops anything that isn't a sane count, so a hand-edited or half-written
 * entry can't unlock a whole world or push the marker off the end. */
function sanitize(raw: unknown): ProgressMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProgressMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) out[id] = value;
  }
  return out;
}

function load(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function persist(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // A full or blocked localStorage must not stop anyone playing — losing
    // progress is worse than not saving it, but far better than a dead map.
  }
}

/**
 * How many levels of this world are beaten, never more than it actually has.
 *
 * The clamp matters on a world that has been *edited since*: removing levels
 * would otherwise leave a stored count past the end, which would unlock
 * nothing that exists and park the marker off the map.
 */
export function completedCount(worldId: string, levelCount: number): number {
  return Math.min(load()[worldId] ?? 0, Math.max(0, levelCount));
}

/**
 * Records that the level at `index` was beaten. Monotonic — replaying an
 * earlier level cannot take progress away, which is the behaviour anyone
 * revisiting a favourite level expects.
 */
export function recordCompletion(worldId: string, index: number): void {
  if (!Number.isInteger(index) || index < 0) return;
  const map = load();
  const next = index + 1;
  if ((map[worldId] ?? 0) >= next) return;
  map[worldId] = next;
  persist(map);
}

/** Node 0 is always open; every later one waits for the node before it. */
export function isUnlocked(index: number, completed: number): boolean {
  return index <= completed;
}

/** Where the marker stands: the first level not yet beaten, or the last one
 * once the world is finished — never off the end of the map. */
export function currentIndex(completed: number, levelCount: number): number {
  if (levelCount <= 0) return 0;
  return Math.min(completed, levelCount - 1);
}

export function isWorldComplete(completed: number, levelCount: number): boolean {
  return levelCount > 0 && completed >= levelCount;
}

/** Used by the map's own "start over" and by tests. */
export function clearProgress(worldId: string): void {
  const map = load();
  if (!(worldId in map)) return;
  delete map[worldId];
  persist(map);
}
