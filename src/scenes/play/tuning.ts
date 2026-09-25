import { TILE_SIZE } from "../../config/gameConfig";
import type { TouchControlState } from "../../gameplay/TouchControls";

/**
 * Every number PlayScene was tuned to, and why it is that number.
 *
 * These were a hundred and thirteen lines at the top of PlayScene.ts, which is
 * four screens of prose between the imports and the first line of code. They
 * are almost entirely comment — a bounce velocity derived from a gravity change
 * so a template level's platform stays reachable, a teleport cooldown that
 * needed a second guard because it and the player move on different clocks, a
 * respawn delay chosen for how long the other player is left alone. That
 * reasoning is the point and none of it is deleted; it is just no longer in the
 * way of reading the scene.
 *
 * Nothing here imports Phaser, and nothing here depends on the scene. The one
 * rule for this file is that a constant belongs in it only if its value is a
 * decision — if the number could have been another number and somebody had to
 * choose. Layout positions and derived geometry stay where they are used.
 */

// Raised from -650 alongside GRAVITY_Y's 900→1100 bump (2026-08-19, see
// its own comment in gameConfig.ts) — v scales by sqrt(1100/900) to keep
// the bounce's own apex height (h = v²/2g) exactly what it was before,
// since SPRING_MEADOW's landing platform in templateLevels.ts was placed
// and verified against that specific height. Airtime drops from ~1.4s to
// ~1.3s as a side effect, which only makes the pad feel snappier, not
// less reachable.
export const BOUNCE_VELOCITY_Y = -719;
// Swimming (see the water check in update()) sets vertical velocity
// directly every frame rather than fighting gravity, so these aren't
// forces — SWIM_UP_VELOCITY while jump/up is held, SWIM_SINK_VELOCITY
// otherwise, both far gentler than JUMP_VELOCITY/gravity so movement in
// water reads as buoyant control rather than a normal fall/jump.
export const SWIM_UP_VELOCITY = -160;
export const SWIM_SINK_VELOCITY = 80;
// Applied on top of speedMultiplierAt's own Speed Potion multiplier (see
// update()) — water slows horizontal movement the same way it would in
// any platformer, without needing a second buff-stacking system.
export const SWIM_SPEED_MULTIPLIER = 0.6;
// Green reads as "good/active" against every one of this game's built-in
// backgrounds and the bell's own cyan/blue art, matching the existing
// buff-tint convention (see updateCharacterVisuals) of a flat setTint rather
// than a second baked texture — cheap, and it survives a user-uploaded
// skin of any color scheme instead of needing an "activated" variant of
// whatever image they chose.
export const CHECKPOINT_ACTIVE_TINT = 0x4ade80;
// How long a toast (see showToast) stays up — shorter than
// EditorUI.setStatus's 2500ms since these fire mid-platforming and
// shouldn't linger over the action.
export const CHECKPOINT_TOAST_MS = 1200;
// Text color for showToast's "something didn't happen" case (a basket with
// no matching basket in its paired area — see useBasket) — distinct from
// the Checkpoint toast's green so a warning reads as a warning at a glance.
export const WARNING_TOAST_COLOR = "#facc15";
// A basket teleport lands the player standing exactly on top of the
// *destination* area's own matching basket (see enterArea/useBasket) —
// without a guard, that new position immediately overlaps that basket's
// own freshly-rebuilt trigger zone and bounces straight back where they
// came from, forever.
//
// This timer was that guard on its own until 2026-08-22, and it turned out
// not to be enough, because it and the player's movement are measured on
// two different clocks. `this.time.now` follows wall time whatever the
// frame rate (measured: it advanced 783ms across 782ms of wall clock on a
// loaded machine), but the player's position is integrated per physics
// step, so a starved loop moves them a fraction of the usual distance in
// the same 500ms. Reproduced deterministically under 6x CPU throttling:
// they cover ~10px instead of ~100px, are therefore still standing on the
// basket when the timer lapses, and ping-pong between the two areas for
// as long as the direction is held. Real players on slow phones can hit
// this — the game is built for phones — and CI hit it too.
//
// So the actual guard is now `latchedBasketTile`, which asks the
// frame-rate-independent question ("has the player left that pad yet?") and
// is scoped to the one pad they landed on, so a neighbouring basket still
// works. The timer stays as a second line of defence: it keeps an *inert*
// basket from re-toasting every physics frame. Long enough to clear one
// overlap check after landing, short enough that using a different basket
// right after arriving never feels blocked.
export const TELEPORT_COOLDOWN_MS = 500;

// How far apart two characters are placed when they arrive somewhere together
// — a fresh start, and every basket teleport. Stacking them on the identical
// pixel is not merely ugly: two Arcade bodies at the same point get pushed
// apart by the separation pass in whichever direction rounding happens to
// favour, which reads as one of them being flung. Half a tile is enough to
// avoid that and still small enough that both are plainly at the same door.
// With one player it multiplies by zero and changes nothing.
export const SPAWN_SPACING_X = TILE_SIZE / 2;

// What a character who is not holding the console reads from the on-screen
// controls: nothing. Frozen rather than built per frame so it cannot be
// written into by accident — `mergePad` returns a fresh object anyway.
export const NO_TOUCH: TouchControlState = Object.freeze({ left: false, right: false, jump: false, attack: false });

// Player one's `baseTint`. Not a colour so much as the absence of one: see
// updateCharacterVisuals, which turns this exact value back into `clearTint()`
// rather than a white tint, so the solo character is untouched by co-op.
export const UNTINTED = 0xffffff;

// Player two wears the same character in a different colour — no second skin,
// no second Skin Creator entry, no second cast in the cut scenes. Warm orange
// because it has to survive being read against four very different backgrounds
// and against the two buff tints it takes turns with: it is nowhere near the
// Shield's cyan or the hurt flash's red, so "which one am I" and "what just
// happened to me" never look like the same signal.
export const PLAYER_TWO_TINT = 0xffa24a;

// How long a fallen character stays out before popping back.
//
// The run only ends when *everybody* is down at once, so this is also the
// window the other player has to survive alone. Long enough to feel like a
// consequence and to get clear of whatever did it; short enough that the
// person holding the other half of the keyboard is not sitting and watching.
export const RESPAWN_DELAY_MS = 1500;

// PJ Thunder Hat's shock — see Bolt.ts for the projectile itself.
// Launch position is roughly the wizard's chest/hand height, offset ahead
// of the player in whichever direction they're facing (player.flipX).
export const BOLT_LAUNCH_OFFSET_X = 16;
export const BOLT_LAUNCH_OFFSET_Y = 24;
// How long the "wizard-cast" pose holds when firing a bolt — brief on
// purpose, just long enough to read as a cast rather than a static jump/
// idle/walk frame. Fed into characterState's own situation ranking (see
// update()) rather than stamped over the animation afterward, so it can't
// fight whatever pose the resolver already chose.
export const CAST_FLASH_MS = 150;
// The same pose, held a little longer, for the moment a power-up is picked
// up — the cast frame's arms-up stance already reads as "something good
// just happened," so this needs no new art. Distinct from the persistent
// powered-up look, which is the accessory sprites (see
// updateAccessoryVisuals) plus the Speed/Shield tints.
export const POWERUP_FLASH_MS = 260;
