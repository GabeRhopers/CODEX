/**
 * The frame timer behind an animated enemy skin — pure, so the "which frame
 * now" arithmetic is testable without a scene, in the same spirit as
 * PlayerStats.ts and characterState.ts.
 *
 * Deliberately not Phaser's own animation system. This game's sprites are
 * swapped by `setTexture` throughout (see wizardAnimation.applyWizardTexture),
 * because a custom skin's frames arrive at runtime as separately-registered
 * textures rather than as a preloaded atlas — there is no sprite sheet to
 * define an animation against. Matching that existing mechanism keeps one way
 * of doing this in the codebase instead of two.
 */

/** Roughly the character's own walk cadence (WALK_FRAME_INTERVAL_MS is 140ms),
 * a little slower so an idling enemy reads as breathing rather than twitching.
 * Fixed rather than per-skin: a speed control is one more thing to store, and
 * to get wrong, for a game whose enemies all move at similar speeds. Still
 * per-*skin* fixed — the `intervalMs` argument below is per-caller, and exists
 * only so the character can drive this same timer at its own long-standing
 * 140ms stride instead of silently inheriting an enemy's 180ms. */
export const LOOP_FRAME_INTERVAL_MS = 180;

export interface LoopState {
  elapsedMs: number;
  frame: number;
}

export function createLoopState(): LoopState {
  return { elapsedMs: 0, frame: 0 };
}

/**
 * Advances `state` by `deltaMs` and returns the frame index now showing.
 *
 * Accumulates rather than resetting the clock to zero on each step, so a long
 * frame doesn't silently swallow the remainder and drift the cycle slower than
 * it should be — under a starved loop (software rendering, a busy phone) that
 * drift is exactly the kind of thing that makes an animation look wrong
 * without looking obviously broken.
 *
 * A frameCount of 0 or 1 is a still: no timer runs and frame 0 is always the
 * answer, which is what an unpainted or single-frame skin should do.
 */
export function advanceLoop(
  state: LoopState,
  deltaMs: number,
  frameCount: number,
  intervalMs: number = LOOP_FRAME_INTERVAL_MS,
): number {
  if (frameCount <= 1) {
    state.elapsedMs = 0;
    state.frame = 0;
    return 0;
  }
  state.elapsedMs += deltaMs;
  const steps = Math.floor(state.elapsedMs / intervalMs);
  if (steps > 0) {
    state.elapsedMs -= steps * intervalMs;
    state.frame = (state.frame + steps) % frameCount;
  }
  // Guards a frameCount that shrank between calls — a skin can be swapped for
  // one with fewer frames while a level is running.
  if (state.frame >= frameCount) state.frame = state.frame % frameCount;
  return state.frame;
}

/**
 * Plays frames 0..frameCount-1 once and then **holds the last one**, where
 * `advanceLoop` would wrap back to 0.
 *
 * A separate function rather than a mode flag on `advanceLoop`, whose "it
 * cycles" contract is documented and covered by seven tests — a boolean that
 * silently makes those tests describe only half the behaviour is how a tested
 * function stops being one.
 *
 * This is what makes dying read as dying. A collapse that cycles back to
 * standing is a twitch; a jump arc that restarts mid-air is a flicker. Holding
 * the final frame is the whole point, so once the end is reached the timer stops
 * accumulating rather than running on into numbers nothing will use.
 */
export function advanceOnce(
  state: LoopState,
  deltaMs: number,
  frameCount: number,
  intervalMs: number = LOOP_FRAME_INTERVAL_MS,
): number {
  if (frameCount <= 1) {
    state.elapsedMs = 0;
    state.frame = 0;
    return 0;
  }
  const last = frameCount - 1;
  // Also catches a frameCount that shrank between calls, the same case
  // advanceLoop guards at its tail: clamping is the honest answer either way.
  if (state.frame >= last) {
    state.frame = last;
    state.elapsedMs = 0;
    return last;
  }
  state.elapsedMs += deltaMs;
  const steps = Math.floor(state.elapsedMs / intervalMs);
  if (steps > 0) {
    state.elapsedMs -= steps * intervalMs;
    state.frame = Math.min(state.frame + steps, last);
    if (state.frame === last) state.elapsedMs = 0;
  }
  return state.frame;
}
