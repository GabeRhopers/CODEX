import { describe, expect, it } from "vitest";
import {
  canDoubleJump,
  CHEST_SCORE_BONUS,
  collectCoin,
  collectFeather,
  collectHeart,
  collectKey,
  collectShield,
  collectSpeed,
  createPlayerStats,
  HIT_GRACE_MS,
  isInvincible,
  openChest,
  registerHit,
  resetDoubleJump,
  SHIELD_DURATION_MS,
  SPEED_DURATION_MS,
  SPEED_MULTIPLIER,
  speedMultiplierAt,
  useDoubleJump,
} from "./PlayerStats";

describe("registerHit", () => {
  it("is fatal when there are no extra hits and no active invincibility", () => {
    const stats = createPlayerStats();
    expect(registerHit(stats, 0)).toBe("fatal");
    expect(stats.extraHits).toBe(0);
  });

  it("absorbs a hit when an extra hit (Heart) is available, spending it and granting grace", () => {
    const stats = createPlayerStats();
    collectHeart(stats);
    expect(registerHit(stats, 1000)).toBe("absorbed");
    expect(stats.extraHits).toBe(0);
    expect(stats.invincibleUntil).toBe(1000 + HIT_GRACE_MS);
  });

  it("is free (invincible) during an active Shield, without spending any extra hits", () => {
    const stats = createPlayerStats();
    collectHeart(stats);
    collectShield(stats, 0);
    expect(registerHit(stats, 500)).toBe("invincible");
    expect(stats.extraHits).toBe(1);
  });

  it("is free (invincible) during the post-hit grace period so one contact can't chain multiple hits", () => {
    const stats = createPlayerStats();
    collectHeart(stats);
    collectHeart(stats);
    expect(registerHit(stats, 1000)).toBe("absorbed");
    expect(stats.extraHits).toBe(1);
    // Still within the grace window granted by the previous hit.
    expect(registerHit(stats, 1000 + HIT_GRACE_MS - 1)).toBe("invincible");
    expect(stats.extraHits).toBe(1);
  });

  it("goes back to spending extra hits once the grace period has fully elapsed", () => {
    const stats = createPlayerStats();
    collectHeart(stats);
    collectHeart(stats);
    registerHit(stats, 1000);
    expect(registerHit(stats, 1000 + HIT_GRACE_MS)).toBe("absorbed");
    expect(stats.extraHits).toBe(0);
  });
});

describe("isInvincible / speedMultiplierAt", () => {
  it("is invincible strictly before invincibleUntil, not at or after it", () => {
    const stats = createPlayerStats();
    collectShield(stats, 0);
    expect(isInvincible(stats, SHIELD_DURATION_MS - 1)).toBe(true);
    expect(isInvincible(stats, SHIELD_DURATION_MS)).toBe(false);
  });

  it("applies the speed multiplier strictly before speedBoostUntil, not at or after it", () => {
    const stats = createPlayerStats();
    collectSpeed(stats, 0);
    expect(speedMultiplierAt(stats, SPEED_DURATION_MS - 1)).toBe(SPEED_MULTIPLIER);
    expect(speedMultiplierAt(stats, SPEED_DURATION_MS)).toBe(1);
  });

  it("has no speed multiplier when no Speed Potion has been collected", () => {
    const stats = createPlayerStats();
    expect(speedMultiplierAt(stats, 0)).toBe(1);
  });
});

describe("canDoubleJump / useDoubleJump / resetDoubleJump", () => {
  it("is false without the Feather upgrade", () => {
    const stats = createPlayerStats();
    expect(canDoubleJump(stats, false)).toBe(false);
  });

  it("is false while grounded, even with the Feather upgrade", () => {
    const stats = createPlayerStats();
    collectFeather(stats);
    expect(canDoubleJump(stats, true)).toBe(false);
  });

  it("is true while airborne with the Feather upgrade and the double jump unused", () => {
    const stats = createPlayerStats();
    collectFeather(stats);
    expect(canDoubleJump(stats, false)).toBe(true);
  });

  it("is false again once the double jump has been used, until reset (landing)", () => {
    const stats = createPlayerStats();
    collectFeather(stats);
    useDoubleJump(stats);
    expect(canDoubleJump(stats, false)).toBe(false);
    resetDoubleJump(stats);
    expect(canDoubleJump(stats, false)).toBe(true);
  });
});

describe("collect* mutations", () => {
  it("collectCoin increments score by one per call", () => {
    const stats = createPlayerStats();
    collectCoin(stats);
    collectCoin(stats);
    expect(stats.score).toBe(2);
  });

  it("collectHeart increments extraHits by one per call", () => {
    const stats = createPlayerStats();
    collectHeart(stats);
    collectHeart(stats);
    expect(stats.extraHits).toBe(2);
  });

  it("collectFeather sets hasDoubleJump without touching doubleJumpUsed", () => {
    const stats = createPlayerStats();
    collectFeather(stats);
    expect(stats.hasDoubleJump).toBe(true);
    expect(stats.doubleJumpUsed).toBe(false);
  });

  it("collectShield extends an already-longer invincibility window instead of shortening it", () => {
    const stats = createPlayerStats();
    stats.invincibleUntil = 10000;
    collectShield(stats, 0); // would set 8000, less than the current 10000
    expect(stats.invincibleUntil).toBe(10000);
  });

  it("collectShield raises a shorter invincibility window", () => {
    const stats = createPlayerStats();
    stats.invincibleUntil = 100;
    collectShield(stats, 1000);
    expect(stats.invincibleUntil).toBe(1000 + SHIELD_DURATION_MS);
  });

  it("collectSpeed extends an already-longer boost window instead of shortening it", () => {
    const stats = createPlayerStats();
    stats.speedBoostUntil = 10000;
    collectSpeed(stats, 0);
    expect(stats.speedBoostUntil).toBe(10000);
  });

  it("collectSpeed raises a shorter boost window", () => {
    const stats = createPlayerStats();
    stats.speedBoostUntil = 100;
    collectSpeed(stats, 1000);
    expect(stats.speedBoostUntil).toBe(1000 + SPEED_DURATION_MS);
  });

  it("collectKey sets hasKey", () => {
    const stats = createPlayerStats();
    collectKey(stats);
    expect(stats.hasKey).toBe(true);
  });
});

describe("openChest", () => {
  it("is locked (no mutation) without a key", () => {
    const stats = createPlayerStats();
    expect(openChest(stats)).toBe("locked");
    expect(stats.score).toBe(0);
    expect(stats.hasKey).toBe(false);
  });

  it("opens and spends the key, awarding the score bonus", () => {
    const stats = createPlayerStats();
    collectKey(stats);
    expect(openChest(stats)).toBe("opened");
    expect(stats.hasKey).toBe(false);
    expect(stats.score).toBe(CHEST_SCORE_BONUS);
  });

  it("is locked again on a second attempt after the key is spent", () => {
    const stats = createPlayerStats();
    collectKey(stats);
    openChest(stats);
    expect(openChest(stats)).toBe("locked");
    expect(stats.score).toBe(CHEST_SCORE_BONUS); // unchanged by the second attempt
  });
});
