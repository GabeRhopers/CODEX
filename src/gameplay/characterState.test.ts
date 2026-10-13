import { describe, expect, it } from "vitest";
import {
  angleFor,
  CharacterMotion,
  CharacterSituation,
  frameFor,
  resolveSituation,
  resolveTint,
  TINT_COLORS,
} from "./characterState";

/** A neutral standing-still snapshot; each test overrides only what it's
 * actually about, so a failure points at one branch rather than a whole
 * hand-built object. */
function motion(overrides: Partial<CharacterMotion> = {}): CharacterMotion {
  return {
    outcome: "playing",
    grounded: true,
    movingHorizontally: false,
    swimming: false,
    casting: false,
    ...overrides,
  };
}

describe("resolveSituation", () => {
  it("is idle standing still on the ground", () => {
    expect(resolveSituation(motion())).toBe("idle");
  });

  it("is walk when moving along the ground", () => {
    expect(resolveSituation(motion({ movingHorizontally: true }))).toBe("walk");
  });

  it("is jump whenever airborne, moving or not", () => {
    expect(resolveSituation(motion({ grounded: false }))).toBe("jump");
    expect(resolveSituation(motion({ grounded: false, movingHorizontally: true }))).toBe("jump");
  });

  it("is swim in water, which outranks jump — swimming is always airborne by the grounded check", () => {
    expect(resolveSituation(motion({ grounded: false, swimming: true }))).toBe("swim");
  });

  it("is cast while firing, outranking movement so the shock reads mid-stride", () => {
    expect(resolveSituation(motion({ casting: true, movingHorizontally: true }))).toBe("cast");
    expect(resolveSituation(motion({ casting: true, grounded: false }))).toBe("cast");
    expect(resolveSituation(motion({ casting: true, swimming: true, grounded: false }))).toBe("cast");
  });

  it("is win once the run is won, outranking everything still in motion", () => {
    expect(resolveSituation(motion({ outcome: "won", casting: true, movingHorizontally: true }))).toBe("win");
  });

  it("is lose once the run is lost, outranking win-adjacent state and every motion", () => {
    expect(resolveSituation(motion({ outcome: "lost", casting: true, grounded: false, swimming: true }))).toBe("lose");
  });
});

describe("frameFor", () => {
  it("alternates the two walk frames", () => {
    expect(frameFor("walk", 0)).toBe("wizard-walk1");
    expect(frameFor("walk", 1)).toBe("wizard-walk2");
  });

  it("reuses the cast pose for winning, unchanged from before the state system", () => {
    expect(frameFor("win", 0)).toBe("wizard-cast");
    expect(frameFor("cast", 0)).toBe("wizard-cast");
  });

  it("reuses the jump frame for swimming — the tilt is what distinguishes them", () => {
    expect(frameFor("swim", 0)).toBe("wizard-jump");
    expect(frameFor("jump", 0)).toBe("wizard-jump");
  });

  it("has a defeated pose of its own rather than a tilted idle", () => {
    // This asserted "wizard-idle" until lose.png existed, when the tint and an
    // 18° tilt were all that said the run was over. Both the frame and the
    // absence of a tilt (see angleFor below) have to hold, or he reads as
    // standing about with a grey wash over him.
    expect(frameFor("lose", 0)).toBe("wizard-lose");
    expect(frameFor("lose", 0)).not.toBe(frameFor("idle", 0));
  });

  it("only ever returns one of the six textures that actually exist", () => {
    const existing = ["wizard-idle", "wizard-walk1", "wizard-walk2", "wizard-jump", "wizard-cast", "wizard-lose"];
    const situations: CharacterSituation[] = ["lose", "win", "cast", "swim", "jump", "walk", "idle"];
    for (const situation of situations) {
      expect(existing).toContain(frameFor(situation, 0));
      expect(existing).toContain(frameFor(situation, 1));
    }
  });
});

describe("resolveTint", () => {
  const base = { situation: "idle" as CharacterSituation, hurtFlash: false, invincible: false, speedBoosted: false };

  it("is untinted with nothing active", () => {
    expect(resolveTint(base)).toBe("none");
    expect(TINT_COLORS.none).toBeNull();
  });

  it("shows speed only when nothing stronger applies", () => {
    expect(resolveTint({ ...base, speedBoosted: true })).toBe("speed");
  });

  it("lets a Shield outrank a speed boost, since tint alone can't show both", () => {
    expect(resolveTint({ ...base, invincible: true, speedBoosted: true })).toBe("shield");
  });

  it("lets a fresh hit outrank the invincibility that same hit just granted", () => {
    // The bug this ordering fixes: registerHit sets invincibleUntil, so
    // without hurt winning here an absorbed hit would look exactly like
    // holding a Shield.
    expect(resolveTint({ ...base, hurtFlash: true, invincible: true })).toBe("hurt");
    expect(TINT_COLORS.hurt).not.toBe(TINT_COLORS.shield);
  });

  it("lets losing outrank every buff still notionally active", () => {
    expect(resolveTint({ situation: "lose", hurtFlash: true, invincible: true, speedBoosted: true })).toBe("lose");
  });
});

describe("angleFor", () => {
  it("leaves every pose but swimming upright", () => {
    // `lose` joined this list when it got a frame of its own. It is the whole
    // reason the dedicated frame is worth having: pixelArt:true filters NEAREST,
    // so any rotation renders with chewed edges, and on the idle frame an 18°
    // tilt detached the hat's bobble.
    for (const situation of ["idle", "walk", "jump", "cast", "win", "lose"] as CharacterSituation[]) {
      expect(angleFor(situation, false)).toBe(0);
      expect(angleFor(situation, true)).toBe(0);
    }
  });

  it("leans while swimming, which still reuses the jump frame", () => {
    expect(Math.abs(angleFor("swim", false))).toBeGreaterThan(0);
  });

  it("tilts toward whichever way the character is facing", () => {
    expect(angleFor("swim", true)).toBe(-angleFor("swim", false));
  });
});
