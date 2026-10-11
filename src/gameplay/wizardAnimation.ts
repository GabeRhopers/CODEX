// Type-only: every `Phaser.` below is a type position, and nothing here calls
// into the library. Importing it as a type keeps this module loadable without a
// `window`, which is what lets wizardAnimation.test.ts drive it with a stub
// sprite — the same trick that makes characterState.ts and PlayerStats.ts
// testable, applied to the one piece that sits between them and the engine.
import type Phaser from "phaser";
import { CharacterMotion, CharacterSituation, frameFor, resolveSituation, WizardFrameKey } from "./characterState";
import { advanceLoop, createLoopState, LoopState } from "./spriteLoop";

/**
 * Player character art: cropped/normalized from a hand-drawn sprite sheet
 * the user supplied (idle, walk1, walk2, jump, cast — all originally
 * facing right). All frames are pre-scaled offline to the same display
 * height (48px) so swapping textures at runtime never jitters the
 * character's vertical size; only width varies slightly per pose.
 *
 * Which of these five shows for a given game situation is decided by
 * characterState.ts, not here — this module owns the sprite mechanics
 * (texture swap, body re-centering, facing, walk timing), that one owns the
 * rules. `satisfies` keeps this preload list and that module's own
 * WizardFrameKey union from drifting apart.
 */
export const WIZARD_FRAME_KEYS = [
  "wizard-idle",
  "wizard-walk1",
  "wizard-walk2",
  "wizard-jump",
  "wizard-cast",
] as const satisfies readonly WizardFrameKey[];

// Exported for PlayScene's accessory sprites (Chicken Slipper/Thunder Hat —
// see updateAccessoryVisuals there), which need the player's own display
// height to position a hat near the top of the frame without duplicating
// this constant.
export const FRAME_HEIGHT = 48;
const BODY_WIDTH = 22;
const BODY_HEIGHT = 40;
/** The character's stride, unchanged since before spriteLoop.ts existed, and
 * passed to `advanceLoop` explicitly so sharing that timer with the enemies
 * cannot silently re-time him to their slower 180ms. Exported so the test can
 * name the cadence it is pinning rather than repeat the number. */
export const WALK_FRAME_INTERVAL_MS = 140;
const MOVING_VELOCITY_THRESHOLD = 5;

/** How many frames the built-in art has for a walk: walk1 and walk2. Every
 * other situation is a single picture (see characterState's FRAME_BY_SITUATION),
 * which is exactly what the frame groups landed in Phase 1 are meant to end —
 * but until the editor can paint a sequence, one is the honest count. */
const WALK_FRAME_COUNT = 2;

export interface WizardAnimState {
  /**
   * Which situation the timer below is currently measuring.
   *
   * Null before the first update, so a freshly created state counts as a change
   * and starts clean rather than inheriting frame 0 by luck.
   */
  situation: CharacterSituation | null;
  /** One timer, belonging to whichever situation `situation` names. Reset on a
   * change — see updateWizardAnimation for why that is the load-bearing part. */
  timer: LoopState;
}

export function createWizardAnimState(): WizardAnimState {
  return { situation: null, timer: createLoopState() };
}

/**
 * Advances the timer belonging to `situation`, restarting it when the situation
 * has changed since the last call, and returns the frame index to show.
 *
 * **Its own function so the restart can be tested at all.** Through
 * `updateWizardAnimation` the restart is currently invisible: walk is the only
 * situation with more than one frame, and `advanceLoop` already zeroes a state
 * it is handed a `frameCount` of 1 for — so stepping through a jump launders
 * the timer and the explicit reset changes nothing you can observe. Deleting it
 * passed all thirteen tests here on 2026-10-10, which is the definition of a
 * test that is not one.
 *
 * Taken out, it can be handed two multi-frame counts directly, which is exactly
 * the case that arrives the moment a painted skin gives a second situation a
 * sequence — and then forgetting this reset means a jump that begins on frame 2
 * because that is where the walk happened to be.
 */
export function advanceSituation(
  state: WizardAnimState,
  situation: CharacterSituation,
  deltaMs: number,
  frameCount: number,
  intervalMs: number,
): number {
  if (state.situation !== situation) {
    state.situation = situation;
    state.timer = createLoopState();
  }
  return advanceLoop(state.timer, deltaMs, frameCount, intervalMs);
}

/**
 * Swaps the sprite's texture and re-centers its (constant-size) physics
 * body under the new frame. Frames share one height by construction, so
 * only the horizontal offset needs recomputing per frame width. Combined
 * with origin (0.5, 1) on the sprite, the body's bottom edge always lands
 * exactly on the sprite's anchor point (the ground-contact position),
 * regardless of which pose is showing.
 */
export function applyWizardTexture(player: Phaser.Physics.Arcade.Sprite, key: string): void {
  if (player.texture.key === key) return;
  player.setTexture(key);
  const body = player.body as Phaser.Physics.Arcade.Body;
  body.setSize(BODY_WIDTH, BODY_HEIGHT);
  body.setOffset((player.width - BODY_WIDTH) / 2, FRAME_HEIGHT - BODY_HEIGHT);
}

/** What the caller knows that the sprite itself can't report — see
 * PlayScene's update(). Everything else (grounded, moving, facing) is read
 * straight off the physics body here, so PlayScene never has to re-derive it. */
export interface WizardAnimContext {
  outcome: "playing" | "won" | "lost";
  swimming: boolean;
  casting: boolean;
  /**
   * A custom character skin's frames, keyed by frame name ("idle", "walk1",
   * …) — see spriteFrames.ts. Absent (the ordinary case) means Grampa's own
   * built-in art, exactly as before this existed.
   *
   * The names line up with the `wizard-*` texture keys by construction, which
   * is why the lookup below is a prefix strip rather than a second mapping
   * table that could drift out of step with FRAME_BY_SITUATION.
   */
  frameKeys?: ReadonlyMap<string, string>;
}

/** The frame *name* a built-in texture key corresponds to — "wizard-walk1"
 * becomes "walk1". */
const WIZARD_KEY_PREFIX = "wizard-";

function textureKeyFor(builtIn: WizardFrameKey, frameKeys?: ReadonlyMap<string, string>): string {
  if (!frameKeys) return builtIn;
  return frameKeys.get(builtIn.slice(WIZARD_KEY_PREFIX.length)) ?? builtIn;
}

/**
 * Advances the character's pose one frame and returns which situation it
 * settled on, so the caller can apply the matching tint/tilt without
 * resolving the same precedence a second time (see PlayScene's
 * updateCharacterVisuals).
 *
 * **The timer belongs to one situation at a time and is reset when that
 * changes.** This is the part worth getting right: once a situation can hold a
 * sequence rather than a single picture, an index carried across a change is an
 * index into the wrong group — a jump that begins on frame 2 because that is
 * where the walk happened to be. Resetting is cheap and the failure it prevents
 * is invisible until it is ugly.
 *
 * It also makes this function finally do what the paragraph here always claimed:
 * a stride now restarts from the same foot every time. Until 2026-10-10 the
 * timer was reset on a change but the frame index was not, so a walk resumed on
 * whichever foot it had left on — the code and the comment above it disagreed,
 * and the comment was the one worth keeping.
 */
export function updateWizardAnimation(
  player: Phaser.Physics.Arcade.Sprite,
  state: WizardAnimState,
  deltaMs: number,
  context: WizardAnimContext,
): CharacterSituation {
  const body = player.body as Phaser.Physics.Arcade.Body;

  if (body.velocity.x < -MOVING_VELOCITY_THRESHOLD) player.setFlipX(true);
  else if (body.velocity.x > MOVING_VELOCITY_THRESHOLD) player.setFlipX(false);

  const motion: CharacterMotion = {
    outcome: context.outcome,
    grounded: body.blocked.down,
    movingHorizontally: Math.abs(body.velocity.x) > MOVING_VELOCITY_THRESHOLD,
    swimming: context.swimming,
    casting: context.casting,
  };
  const situation = resolveSituation(motion);

  // Walk is still the only situation with more than one frame to play, because
  // the built-in art has five pictures and no skin can store a sequence until
  // the editor can paint one. What has changed is that the count is now a
  // *number fed to a timer* rather than a hand-rolled boolean flip, so the step
  // that gives a situation four frames is a different count, not different code.
  const frameCount = situation === "walk" ? WALK_FRAME_COUNT : 1;
  const index = advanceSituation(state, situation, deltaMs, frameCount, WALK_FRAME_INTERVAL_MS);

  applyWizardTexture(player, textureKeyFor(frameFor(situation, index === 1 ? 1 : 0), context.frameKeys));
  return situation;
}
