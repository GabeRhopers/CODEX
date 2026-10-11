import { describe, expect, it } from "vitest";
import { CharacterSituation } from "./characterState";
import { LOOP_FRAME_INTERVAL_MS } from "./spriteLoop";
import { SPEED_MULTIPLIER } from "./PlayerStats";
import {
  advanceSituation,
  createWizardAnimState,
  situationTextureKey,
  strideIntervalMs,
  updateWizardAnimation,
  WALK_FRAME_INTERVAL_MS,
  WizardAnimContext,
} from "./wizardAnimation";

/**
 * This file exists because wizardAnimation stopped needing Phaser.
 *
 * Every `Phaser.` in that module is a type position, so making the import
 * type-only left a function that takes a sprite-shaped object and calls methods
 * on it — which a plain object can satisfy. Before that, the only way to find
 * out which texture the character shows after a jump was to load a page and
 * watch, and the only things pinning it were e2e specs measuring the symptom.
 *
 * What is pinned here is the timing, which is the part that silently rots: a
 * stride's cadence, and the reset that keeps one situation's frame index out of
 * another's.
 */

type Sprite = Parameters<typeof updateWizardAnimation>[0];

/** The sprite surface updateWizardAnimation actually touches — texture swap,
 * facing, and the body it re-centres. Nothing else is reached, which is why a
 * literal can stand in for a Phaser sprite here. */
function fakeSprite(): { sprite: Sprite; applied: string[]; flips: boolean[] } {
  const applied: string[] = [];
  const flips: boolean[] = [];
  const body = {
    velocity: { x: 0, y: 0 },
    blocked: { down: true },
    setSize: () => {},
    setOffset: () => {},
  };
  const sprite = {
    texture: { key: "wizard-idle" },
    width: 48,
    body,
    setTexture(key: string) {
      this.texture.key = key;
      applied.push(key);
      return this;
    },
    setFlipX(value: boolean) {
      flips.push(value);
      return this;
    },
  };
  return { sprite: sprite as unknown as Sprite, applied, flips };
}

function body(sprite: Sprite): { velocity: { x: number; y: number }; blocked: { down: boolean } } {
  return (sprite as unknown as { body: { velocity: { x: number; y: number }; blocked: { down: boolean } } }).body;
}

const PLAYING: WizardAnimContext = { outcome: "playing", swimming: false, casting: false };

/** Puts the stub into the motion a situation resolves from, so the tests read
 * as "while walking" rather than as velocity arithmetic. */
function set(sprite: Sprite, situation: "walk" | "idle" | "jump"): void {
  const b = body(sprite);
  b.velocity.x = situation === "walk" ? 50 : 0;
  b.blocked.down = situation !== "jump";
}

describe("the character's stride", () => {
  it("alternates its two frames on the 140ms cadence it has always had", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "walk");

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, PLAYING);
      seen.push(sprite.texture.key);
    }
    expect(seen).toEqual(["wizard-walk2", "wizard-walk1", "wizard-walk2", "wizard-walk1"]);
  });

  it("does not inherit the enemies' slower loop interval", () => {
    // The regression this guards: advanceLoop defaults to LOOP_FRAME_INTERVAL_MS
    // (180ms), and a shared timer called without an interval would re-time the
    // character by 29% without changing a single visible line.
    expect(LOOP_FRAME_INTERVAL_MS).toBeGreaterThan(WALK_FRAME_INTERVAL_MS);
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "walk");

    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, PLAYING);
    expect(sprite.texture.key, "one walk interval must be a whole step").toBe("wizard-walk2");
  });

  it("holds a frame until its interval is actually up", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "walk");

    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS - 1, PLAYING);
    expect(sprite.texture.key).toBe("wizard-walk1");
    updateWizardAnimation(sprite, state, 1, PLAYING);
    expect(sprite.texture.key).toBe("wizard-walk2");
  });
});

describe("the timer belongs to one situation", () => {
  it("restarts the stride from the same foot after a jump", () => {
    // The behaviour the docstring claimed and the code did not do until
    // 2026-10-10: the frame index used to survive a situation change, so a walk
    // resumed on whichever foot it left on.
    //
    // This pins the behaviour, not the mechanism. Two things now produce it —
    // the explicit reset in advanceSituation, and advanceLoop zeroing any state
    // it is given a frameCount of 1 for — so deleting the reset leaves this
    // test green. The reset is pinned where it can actually fail, in the
    // advanceSituation block below.
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();

    set(sprite, "walk");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, PLAYING);
    expect(sprite.texture.key, "precondition: mid-stride on the second frame").toBe("wizard-walk2");

    set(sprite, "jump");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, PLAYING);
    expect(sprite.texture.key).toBe("wizard-jump");

    set(sprite, "walk");
    updateWizardAnimation(sprite, state, 1, PLAYING);
    expect(sprite.texture.key, "the stride starts over, not where it left off").toBe("wizard-walk1");
  });

  it("does not carry one situation's elapsed time into the next", () => {
    // Why the reset is a whole LoopState rather than just the frame: a nearly
    // full timer carried across would step the new situation on its first frame.
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();

    set(sprite, "walk");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS - 1, PLAYING);
    set(sprite, "jump");
    updateWizardAnimation(sprite, state, 0, PLAYING);
    set(sprite, "walk");
    updateWizardAnimation(sprite, state, 1, PLAYING);

    expect(sprite.texture.key, "1ms of walking is not a step").toBe("wizard-walk1");
  });

  it("records which situation the timer is measuring", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    expect(state.situation, "null before the first update, so it starts clean").toBeNull();

    set(sprite, "walk");
    expect(updateWizardAnimation(sprite, state, 16, PLAYING)).toBe("walk");
    expect(state.situation).toBe("walk");
  });
});

describe("situations with a single picture", () => {
  it("stays still however long it runs", () => {
    const { sprite, applied } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "idle");

    for (let i = 0; i < 10; i++) updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, PLAYING);
    expect(sprite.texture.key).toBe("wizard-idle");
    // applyWizardTexture early-returns when the key is unchanged, so an idle
    // that never moves should never have swapped a texture at all.
    expect(applied).toEqual([]);
  });

  it("runs no timer, so a still cannot bank time against its next situation", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "idle");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS * 5, PLAYING);
    expect(state.timer.elapsedMs).toBe(0);
    expect(state.timer.frame).toBe(0);
  });

  it("shows the final pose for an outcome, whatever the body is doing", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "walk");
    updateWizardAnimation(sprite, state, 16, { ...PLAYING, outcome: "lost" });
    expect(sprite.texture.key).toBe("wizard-idle");
    updateWizardAnimation(sprite, state, 16, { ...PLAYING, outcome: "won" });
    expect(sprite.texture.key).toBe("wizard-cast");
  });
});

describe("a painted skin stands in for the built-in art", () => {
  it("uses the skin's own frame for each pose", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    const frameKeys = new Map([
      ["idle", "skin-idle"],
      ["walk1", "skin-walk1"],
      ["walk2", "skin-walk2"],
    ]);

    set(sprite, "walk");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, { ...PLAYING, frameKeys });
    expect(sprite.texture.key).toBe("skin-walk2");
  });

  it("falls back to the built-in frame for a pose the skin never painted", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    const frameKeys = new Map([["idle", "skin-idle"]]);

    set(sprite, "jump");
    updateWizardAnimation(sprite, state, 16, { ...PLAYING, frameKeys });
    expect(sprite.texture.key).toBe("wizard-jump");
  });

  it("asks only for the five frame names a stored skin can have", () => {
    // Pins the storage boundary this phase deliberately did not move: the
    // runtime still looks skins up by their legacy names. The step that changes
    // this is the one that teaches the editor to write "walk.0".
    const asked = new Set<string>();
    const frameKeys = {
      get(name: string) {
        asked.add(name);
        return undefined;
      },
    } as unknown as ReadonlyMap<string, string>;

    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    const situations: Array<[CharacterSituation, "walk" | "idle" | "jump"]> = [
      ["walk", "walk"],
      ["idle", "idle"],
      ["jump", "jump"],
    ];
    for (const [, motion] of situations) {
      set(sprite, motion);
      updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, { ...PLAYING, frameKeys });
      updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS, { ...PLAYING, frameKeys });
    }
    for (const name of asked) {
      expect(["idle", "walk1", "walk2", "jump", "cast"], `asked for "${name}"`).toContain(name);
    }
    expect(asked.has("walk1") && asked.has("walk2"), "both stride frames were asked for").toBe(true);
  });
});

describe("facing", () => {
  it("turns to face the way it is moving, and holds its facing when stopped", () => {
    const { sprite, flips } = fakeSprite();
    const state = createWizardAnimState();

    body(sprite).velocity.x = -50;
    updateWizardAnimation(sprite, state, 16, PLAYING);
    expect(flips).toEqual([true]);

    body(sprite).velocity.x = 50;
    updateWizardAnimation(sprite, state, 16, PLAYING);
    expect(flips).toEqual([true, false]);

    body(sprite).velocity.x = 0;
    updateWizardAnimation(sprite, state, 16, PLAYING);
    expect(flips, "standing still must not snap him to a default side").toEqual([true, false]);
  });
});

describe("advanceSituation", () => {
  // Driven directly, with frame counts this test chooses, because that is the
  // only way the restart is observable: see the function's own docstring for
  // why going through updateWizardAnimation cannot show it today.
  const STEP = WALK_FRAME_INTERVAL_MS;

  it("restarts the frame index when the situation changes", () => {
    const state = createWizardAnimState();
    expect(advanceSituation(state, "walk", STEP, 4, STEP)).toBe(1);
    expect(advanceSituation(state, "walk", STEP, 4, STEP)).toBe(2);
    // Both counts are above one, so advanceLoop cannot zero the state on the
    // caller's behalf. Without the reset this is 2 — a jump beginning two
    // frames into an arc it has not started.
    expect(advanceSituation(state, "jump", 0, 4, STEP)).toBe(0);
  });

  it("drops a part-finished interval rather than carrying it into the next situation", () => {
    const state = createWizardAnimState();
    advanceSituation(state, "walk", STEP - 1, 4, STEP);
    // 1ms into a jump is not a step, however nearly the walk had finished one.
    expect(advanceSituation(state, "jump", 1, 4, STEP)).toBe(0);
  });

  it("keeps advancing for as long as the situation holds", () => {
    const state = createWizardAnimState();
    const seen = [0, 1, 2, 3].map(() => advanceSituation(state, "walk", STEP, 4, STEP));
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it("counts the first call on a fresh state as a change", () => {
    const state = createWizardAnimState();
    expect(state.situation).toBeNull();
    expect(advanceSituation(state, "idle", STEP, 4, STEP)).toBe(1);
    expect(state.situation).toBe("idle");
  });

  it("honours the interval it is given", () => {
    const slow = createWizardAnimState();
    expect(advanceSituation(slow, "walk", STEP, 4, STEP * 2)).toBe(0);
  });
});

describe("running takes faster steps", () => {
  it("shortens the stride in proportion to how fast he is moving", () => {
    // Measured against the real constants rather than written out: 140 / 1.6 =
    // 87.5ms per frame while a Speed Potion is up.
    expect(strideIntervalMs(SPEED_MULTIPLIER)).toBeCloseTo(WALK_FRAME_INTERVAL_MS / SPEED_MULTIPLIER);
    expect(strideIntervalMs(SPEED_MULTIPLIER)).toBeLessThan(WALK_FRAME_INTERVAL_MS);
  });

  it("walks at the ordinary cadence when nothing is boosting him", () => {
    // speedMultiplierAt returns exactly 1 when no potion is active, and that
    // must leave the stride bit-for-bit what it was before this existed.
    expect(strideIntervalMs(1)).toBe(WALK_FRAME_INTERVAL_MS);
  });

  it("falls back to the ordinary cadence rather than freezing on a nonsense speed", () => {
    // An interval of Infinity would hold one leg forward forever, which reads
    // as a broken sprite rather than as a character standing still.
    for (const bad of [0, -1, Number.NaN]) {
      expect(strideIntervalMs(bad), `multiplier ${bad}`).toBe(WALK_FRAME_INTERVAL_MS);
    }
  });

  it("takes more steps than an ordinary walk over the same stretch of time", () => {
    // The property as a player sees it, counted in actual texture swaps rather
    // than in timer internals. An earlier version of this test compared the two
    // elapsed times, which is true whether the boosted stride is faster *or*
    // slower — it survived inverting the division, so it was not a test.
    const steps = (speedMultiplier: number): number => {
      const { sprite, applied } = fakeSprite();
      const state = createWizardAnimState();
      set(sprite, "walk");
      for (let elapsed = 0; elapsed < WALK_FRAME_INTERVAL_MS * 2; elapsed += 10) {
        updateWizardAnimation(sprite, state, 10, { ...PLAYING, speedMultiplier });
      }
      return applied.length;
    };

    // Over 280ms: an ordinary stride steps at 140 and 280, a boosted one at
    // 87.5, 175 and 262.5.
    expect(steps(SPEED_MULTIPLIER)).toBeGreaterThan(steps(1));
  });

  it("leaves a caller that says nothing about speed walking exactly as before", () => {
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "walk");
    updateWizardAnimation(sprite, state, WALK_FRAME_INTERVAL_MS - 1, PLAYING);
    expect(sprite.texture.key).toBe("wizard-walk1");
    updateWizardAnimation(sprite, state, 1, PLAYING);
    expect(sprite.texture.key).toBe("wizard-walk2");
  });
});

describe("the pose a run ends on", () => {
  // The bug this guards: applyTerminalPose wrote the built-in key directly, and
  // PlayScene.update returns early once a run is over, so a painted character
  // finished every run — won or lost — wearing Grampa's art, permanently.
  const painted = new Map([
    ["idle", "skin-frame-player-idle"],
    ["cast", "skin-frame-player-cast"],
  ]);

  it("keeps a painted character's own art when they win", () => {
    expect(situationTextureKey("win", 0, painted)).toBe("skin-frame-player-cast");
  });

  it("keeps it when they lose", () => {
    expect(situationTextureKey("lose", 0, painted)).toBe("skin-frame-player-idle");
  });

  it("agrees with what the per-frame path would have shown", () => {
    // One answer to "which texture for this situation", not two that can drift.
    const { sprite } = fakeSprite();
    const state = createWizardAnimState();
    set(sprite, "idle");
    updateWizardAnimation(sprite, state, 16, { ...PLAYING, outcome: "won", frameKeys: painted });
    expect(sprite.texture.key).toBe(situationTextureKey("win", 0, painted));
  });

  it("still falls back to the built-in art for an unpainted character", () => {
    expect(situationTextureKey("win", 0)).toBe("wizard-cast");
    expect(situationTextureKey("lose", 0, new Map())).toBe("wizard-idle");
  });
});
