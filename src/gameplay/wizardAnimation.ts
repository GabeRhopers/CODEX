import Phaser from "phaser";
import { CharacterMotion, CharacterSituation, frameFor, resolveSituation, WizardFrameKey } from "./characterState";

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
const WALK_FRAME_INTERVAL_MS = 140;
const MOVING_VELOCITY_THRESHOLD = 5;

export interface WizardAnimState {
  walkTimer: number;
  walkFrame: 0 | 1;
}

export function createWizardAnimState(): WizardAnimState {
  return { walkTimer: 0, walkFrame: 0 };
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
}

/**
 * Advances the character's pose one frame and returns which situation it
 * settled on, so the caller can apply the matching tint/tilt without
 * resolving the same precedence a second time (see PlayScene's
 * updateCharacterVisuals).
 *
 * The walk timer only advances while actually walking — any other situation
 * resets it, so the cycle always restarts from the same foot rather than
 * resuming mid-stride after a jump or a cast.
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

  if (situation === "walk") {
    state.walkTimer += deltaMs;
    if (state.walkTimer >= WALK_FRAME_INTERVAL_MS) {
      state.walkTimer = 0;
      state.walkFrame = state.walkFrame === 0 ? 1 : 0;
    }
  } else {
    state.walkTimer = 0;
  }

  applyWizardTexture(player, frameFor(situation, state.walkFrame));
  return situation;
}
