import { LevelSummary } from "./LevelSchema";

/**
 * Which saved level the home page offers to resume. Pure and separated from
 * MenuScene so the choice is unit-testable without a Phaser scene, matching
 * where PlayerStats/characterState already sit.
 */

/** `updatedAt` is a plain ISO string on the wire (see LevelSummary), so it
 * can be missing or malformed on a hand-edited or legacy Drive file. Treat
 * anything unparseable as the epoch rather than letting NaN poison the
 * comparison — a level with a broken timestamp should sort last, not make
 * the whole ordering undefined. */
function timestampOf(level: LevelSummary): number {
  const parsed = Date.parse(level.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The most recently updated level, or null for an empty library. Ties keep
 * the earliest entry in list order (strict `>`), so repeated calls over an
 * unchanged list always offer the same level — a home page that shuffled
 * which level "Continue" points at between visits would be worse than not
 * offering it at all.
 */
export function pickResumeLevel(levels: readonly LevelSummary[]): LevelSummary | null {
  let best: LevelSummary | null = null;
  let bestAt = -Infinity;
  for (const level of levels) {
    const at = timestampOf(level);
    if (at > bestAt) {
      best = level;
      bestAt = at;
    }
  }
  return best;
}
