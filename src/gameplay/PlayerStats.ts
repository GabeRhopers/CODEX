/**
 * Score/hearts/buffs state and the pure rules around it — kept separate
 * from PlayScene so the actual branching logic (does this hit kill you,
 * how fast should you be moving right now) is unit-testable without a
 * Phaser scene. PlayScene owns creating the sprites/overlaps and calling
 * into these; this module never touches a GameObject.
 */
export interface PlayerStats {
  score: number;
  /** Extra hits absorbed before a bad contact costs the level — 0 means
   * the original instant-lose-on-any-bad-contact behavior, exactly as
   * before Hearts existed. */
  extraHits: number;
  hasDoubleJump: boolean;
  doubleJumpUsed: boolean;
  /** Timestamp (compare against scene.time.now) until which any bad
   * contact is fully absorbed for free — set by a Shield pickup, and
   * briefly re-set after an absorbed hit so the same hazard can't chain
   * two hits in one collision. */
  invincibleUntil: number;
  speedBoostUntil: number;
}

export const HIT_GRACE_MS = 1200;
export const SHIELD_DURATION_MS = 8000;
export const SPEED_DURATION_MS = 6000;
export const SPEED_MULTIPLIER = 1.6;

export function createPlayerStats(): PlayerStats {
  return {
    score: 0,
    extraHits: 0,
    hasDoubleJump: false,
    doubleJumpUsed: false,
    invincibleUntil: 0,
    speedBoostUntil: 0,
  };
}

export function isInvincible(stats: PlayerStats, now: number): boolean {
  return now < stats.invincibleUntil;
}

export function speedMultiplierAt(stats: PlayerStats, now: number): number {
  return now < stats.speedBoostUntil ? SPEED_MULTIPLIER : 1;
}

export type HitResult = "invincible" | "absorbed" | "fatal";

/** The single decision point for "player touched something bad": currently
 * invincible (Shield, or the grace period right after a prior hit) absorbs
 * it for free; an available extra hit is spent and grants that same brief
 * grace period (so a level's built-in enemy overlap check, which fires
 * every physics frame of continued contact, can't drain multiple hearts
 * from one touch); no hits left ends the level, same as always. Mutates
 * `stats` in the "absorbed" case only. */
export function registerHit(stats: PlayerStats, now: number): HitResult {
  if (isInvincible(stats, now)) return "invincible";
  if (stats.extraHits > 0) {
    stats.extraHits -= 1;
    stats.invincibleUntil = now + HIT_GRACE_MS;
    return "absorbed";
  }
  return "fatal";
}

export function canDoubleJump(stats: PlayerStats, grounded: boolean): boolean {
  return stats.hasDoubleJump && !grounded && !stats.doubleJumpUsed;
}

export function useDoubleJump(stats: PlayerStats): void {
  stats.doubleJumpUsed = true;
}

export function resetDoubleJump(stats: PlayerStats): void {
  stats.doubleJumpUsed = false;
}

export function collectCoin(stats: PlayerStats): void {
  stats.score += 1;
}

export function collectHeart(stats: PlayerStats): void {
  stats.extraHits += 1;
}

export function collectFeather(stats: PlayerStats): void {
  stats.hasDoubleJump = true;
}

export function collectShield(stats: PlayerStats, now: number): void {
  stats.invincibleUntil = Math.max(stats.invincibleUntil, now + SHIELD_DURATION_MS);
}

export function collectSpeed(stats: PlayerStats, now: number): void {
  stats.speedBoostUntil = Math.max(stats.speedBoostUntil, now + SPEED_DURATION_MS);
}
