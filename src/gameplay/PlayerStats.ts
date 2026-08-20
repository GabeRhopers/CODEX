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
  /** When the last hit was actually *absorbed* (see registerHit) — distinct
   * from `invincibleUntil`, which that same hit also sets. Without this, a
   * survived hit and a held Shield were visually identical: both left the
   * player tinted cyan for over a second, so there was no way to tell "you
   * just got hurt" from "you're protected." See characterState.resolveTint,
   * which flashes red for the brief window this opens before falling back to
   * the ordinary invincibility tint. 0 means "never been hit this run."  */
  lastHitAt: number;
  speedBoostUntil: number;
  /** PJ Thunder Hat — a permanent equip (like Chicken Slipper/double jump)
   * rather than limited ammo, gated by a cooldown instead of a stock count
   * (see THUNDER_COOLDOWN_MS/canFireThunderHat) so a level can't be
   * softlocked by running out of shots on an enemy that needs one. */
  hasThunderHat: boolean;
  /** Timestamp (compare against scene.time.now) before which firing again
   * is blocked — set by fireThunderHat, mirrors invincibleUntil's shape. */
  thunderCooldownUntil: number;
  /** Held until spent opening a Chest — see openChest(). Only ever one Key
   * at a time (matching the one-per-type placement every entity type
   * already uses — see Palette.ts's docstring), so a plain boolean is
   * enough; a level with multiple Chests isn't supported by this field. */
  hasKey: boolean;
}

export const HIT_GRACE_MS = 1200;
/** How long the red "you got hit" flash lasts — deliberately far shorter than
 * HIT_GRACE_MS, since it's a hit *notification* sitting on top of the longer
 * invincibility that hit granted, not a duration of its own. */
export const HURT_FLASH_MS = 220;
export const SHIELD_DURATION_MS = 8000;
export const SPEED_DURATION_MS = 6000;
export const SPEED_MULTIPLIER = 1.6;
export const CHEST_SCORE_BONUS = 5;
/** Minimum gap between shots — long enough that spamming the attack input
 * can't turn the shock into a continuous beam (it's meant to be one bolt
 * at a time, see PlayScene's Bolt handling), short enough not to feel
 * unresponsive against a single enemy. */
export const THUNDER_COOLDOWN_MS = 800;

export function createPlayerStats(): PlayerStats {
  return {
    score: 0,
    extraHits: 0,
    hasDoubleJump: false,
    doubleJumpUsed: false,
    invincibleUntil: 0,
    lastHitAt: 0,
    speedBoostUntil: 0,
    hasThunderHat: false,
    thunderCooldownUntil: 0,
    hasKey: false,
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
    stats.lastHitAt = now;
    return "absorbed";
  }
  return "fatal";
}

/** True during the brief flash right after an absorbed hit — a strict subset
 * of the invincibility that same hit granted, which is exactly why it has to
 * be checked *first* when picking a tint (see characterState.resolveTint).
 * Only ever true after a hit was actually survived: a fatal hit ends the run,
 * where the lose pose takes over instead. */
export function isHurtFlashing(stats: PlayerStats, now: number): boolean {
  return stats.lastHitAt > 0 && now < stats.lastHitAt + HURT_FLASH_MS;
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

export function collectThunderHat(stats: PlayerStats): void {
  stats.hasThunderHat = true;
}

/** Mirrors canDoubleJump's shape: the single decision point for "is a shock
 * available right now" — gated on the hat being held and the cooldown
 * having elapsed. Unlike double jump there's no grounded/airborne
 * restriction; the shock fires from anywhere. */
export function canFireThunderHat(stats: PlayerStats, now: number): boolean {
  return stats.hasThunderHat && now >= stats.thunderCooldownUntil;
}

export function fireThunderHat(stats: PlayerStats, now: number): void {
  stats.thunderCooldownUntil = now + THUNDER_COOLDOWN_MS;
}

export function collectShield(stats: PlayerStats, now: number): void {
  stats.invincibleUntil = Math.max(stats.invincibleUntil, now + SHIELD_DURATION_MS);
}

export function collectSpeed(stats: PlayerStats, now: number): void {
  stats.speedBoostUntil = Math.max(stats.speedBoostUntil, now + SPEED_DURATION_MS);
}

export function collectKey(stats: PlayerStats): void {
  stats.hasKey = true;
}

export type ChestResult = "opened" | "locked";

/** The single decision point for "player touched a Chest": spends the Key
 * and awards a score bonus if one's held, otherwise leaves everything
 * unchanged (the chest stays shut, touchable again later once a Key is
 * found) — mirrors registerHit's shape (a result the caller branches on,
 * mutation only in the success case) for the same reason: PlayScene needs
 * to know whether to destroy the chest sprite without duplicating the
 * "do I actually have a key" check itself. */
export function openChest(stats: PlayerStats): ChestResult {
  if (!stats.hasKey) return "locked";
  stats.hasKey = false;
  stats.score += CHEST_SCORE_BONUS;
  return "opened";
}
