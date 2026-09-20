import type { TouchControlState } from "./TouchControls";

/**
 * A game controller, with nothing to install.
 *
 * Chrome (and every other current browser) ships the **Gamepad API**, so a
 * plugged-in pad is readable from an ordinary page — no extension, no native
 * build, no library. That is the whole reason this file is short: the platform
 * already does the hard part, and what is left is deciding which button means
 * what.
 *
 * **Read directly rather than through Phaser's gamepad plugin**, for two
 * reasons. Phaser's builds its list from `gamepadconnected` events, which a
 * test cannot drive without synthesising browser events; replacing
 * `navigator.getGamepads` is one line in a test's init script, so this is the
 * version that can actually be covered. And the plugin needs a config flag that
 * loads it into every scene — the Skin Creator included — to wrap an API that
 * is this small to read.
 *
 * **Polled, never subscribed.** Reading every frame means a pad that appears
 * halfway through simply starts working, with no connect/disconnect
 * bookkeeping to get wrong. That is not a rare case to tidy up later: browsers
 * deliberately hide gamepads until the player presses a button on one, so
 * "appears late" is the *normal* path, and an event-driven version would have
 * to handle it anyway.
 *
 * Pure: no Phaser, no scene, and the one DOM call lives at the call site rather
 * than in here. `readPad` takes the snapshot it is given, so the rules are
 * testable against a literal — the same split `spriteFrames.ts` and
 * `soundSynth.ts` use.
 */

/**
 * The **standard mapping** button indices, as the Gamepad API defines them.
 *
 * Named for the *job*, not the glyph. The same physical button is A on an Xbox
 * pad and Cross on a PlayStation one, and a child does not care which — it is
 * the one you jump with. Naming them this way also keeps the mapping decisions
 * in one readable block instead of scattered as magic numbers.
 *
 * A browser reports `mapping: "standard"` for essentially every pad sold for a
 * console, which is what makes fixed indices safe here. A pad that reports
 * something else is still read rather than rejected — see `readPad`.
 */
const BUTTON = {
  /** A / Cross. Jump, and "yes" on a menu — deliberately the same button, so
   * the one you press most is the one you press everywhere. */
  bottomFace: 0,
  /** B / Circle. "No" / back out, the near-universal console convention. */
  rightFace: 1,
  /** X / Square. The shock attack, matching the X *key* on the keyboard by
   * happy accident rather than design, but worth keeping aligned. */
  leftFace: 2,
  /** Start. Pause — the one button whose meaning nobody has to be taught. */
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** Left stick, horizontal and vertical. Index 0/1 under the standard mapping. */
const AXIS_X = 0;
const AXIS_Y = 1;

/**
 * How far the stick must move before it counts as a direction.
 *
 * **Not optional, and not a nicety.** A stick that has seen a few years rests
 * slightly off centre and reports something like 0.1 forever. Without a
 * deadzone that is a held direction nobody is touching, so the player walks
 * into a wall by themselves and the game reads as broken rather than the pad
 * as worn.
 *
 * Half travel, which is far outside any drift and still an easy, unambiguous
 * push. There is no analog speed here to preserve — movement is a boolean
 * either way (see PlayerController's MOVE_SPEED) — so nothing is lost by
 * demanding a deliberate one.
 */
const DEADZONE = 0.5;

/**
 * Everything the game asks a pad, as booleans.
 *
 * Wider than `TouchControlState` because menus need more than gameplay does:
 * gameplay wants left/right/jump/attack, a menu wants confirm/back/pause. One
 * shape for both keeps a single read per frame rather than one per consumer.
 */
export interface PadState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  confirm: boolean;
  back: boolean;
  pause: boolean;
}

/** Nothing pressed. The answer whenever no usable pad is present, which is the
 * overwhelmingly common case — most people are playing on a keyboard. */
export const NO_PAD: PadState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  attack: false,
  confirm: false,
  back: false,
  pause: false,
};

function pressed(pad: Gamepad, index: number): boolean {
  return !!pad.buttons[index]?.pressed;
}

/**
 * The first pad that is actually there.
 *
 * `navigator.getGamepads()` returns a sparse, fixed-length list — usually four
 * slots, mostly `null`, and a pad that was unplugged can linger with
 * `connected: false`. Both have to be skipped or every read throws or lies.
 *
 * First-connected wins rather than merging every pad: this is a one-player
 * game, and two pads fighting over one wizard is a worse answer than the second
 * one doing nothing.
 */
function firstConnected(pads: readonly (Gamepad | null)[]): Gamepad | null {
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

/**
 * What the player is holding, from a snapshot of the browser's pad list.
 *
 * Takes the list rather than calling `navigator.getGamepads()` itself, so the
 * rules can be tested against a literal object with no browser involved.
 *
 * **A pad reporting a non-standard `mapping` is read anyway rather than
 * ignored.** Its indices might mean something else, so some buttons may do the
 * wrong thing — but a pad that does something is recoverable by trying another
 * button, while a pad that does nothing at all reads as "this game does not
 * support controllers". Optional chaining throughout means an unusual pad with
 * fewer buttons or axes returns false rather than throwing.
 */
export function readPad(pads: readonly (Gamepad | null)[]): PadState {
  const pad = firstConnected(pads);
  if (!pad) return NO_PAD;

  const x = pad.axes[AXIS_X] ?? 0;
  const y = pad.axes[AXIS_Y] ?? 0;

  const up = pressed(pad, BUTTON.dpadUp) || y < -DEADZONE;
  return {
    left: pressed(pad, BUTTON.dpadLeft) || x < -DEADZONE,
    right: pressed(pad, BUTTON.dpadRight) || x > DEADZONE,
    up,
    down: pressed(pad, BUTTON.dpadDown) || y > DEADZONE,
    // Up jumps as well as the face button, matching the keyboard, where both
    // the up arrow and Space do (see isJumpPressed) — and matching what anyone
    // who has held a controller before will try first.
    jump: pressed(pad, BUTTON.bottomFace) || up,
    attack: pressed(pad, BUTTON.leftFace),
    confirm: pressed(pad, BUTTON.bottomFace),
    back: pressed(pad, BUTTON.rightFace),
    pause: pressed(pad, BUTTON.start),
  };
}

/**
 * Folds a pad into the on-screen controls' state, so gameplay reads one value.
 *
 * This is what makes the whole feature one line at the call site: every input
 * decision in the game already goes through a single `TouchControlState` (see
 * PlayerController's three predicates), so a pad that arrives *as* one needs no
 * new plumbing anywhere downstream.
 *
 * **Returns a new object, and that matters.** `TouchControls.get()` hands back
 * its own internal state by reference — writing into it would leave an
 * on-screen button lit after the pad let go, since nothing ever clears a flag
 * the touch handlers did not set.
 *
 * OR'd rather than switched, like touch is against the keyboard: there is no
 * "controller mode" to enter or leave, so a pad and a keyboard work at the same
 * time and nothing has to detect which one you meant.
 */
export function mergePad(touch: TouchControlState, pad: PadState): TouchControlState {
  return {
    left: touch.left || pad.left,
    right: touch.right || pad.right,
    jump: touch.jump || pad.jump,
    attack: touch.attack || pad.attack,
  };
}

/**
 * Which buttons became pressed between two reads.
 *
 * Gameplay wants to know whether a button *is* held — you walk for as long as
 * you push left. A menu wants the opposite: one press, one action. Holding
 * Start must pause once rather than sixty times a second, and a nudge of the
 * d-pad must move one level along the map rather than sprint to the end of it.
 *
 * Lives here, beside the state it compares, rather than with the scene glue
 * that uses it — that file imports Phaser, and Phaser cannot load without a
 * `window`, so a rule parked there could not be unit-tested at all. Same reason
 * `spriteFrames.ts` keeps its rules clear of Phaser, learned again the hard way.
 */
export function padEdges(previous: PadState, next: PadState): PadState {
  const edge = (key: keyof PadState): boolean => next[key] && !previous[key];
  return {
    left: edge("left"),
    right: edge("right"),
    up: edge("up"),
    down: edge("down"),
    jump: edge("jump"),
    attack: edge("attack"),
    confirm: edge("confirm"),
    back: edge("back"),
    pause: edge("pause"),
  };
}

/**
 * The live read, and the only place the DOM is touched.
 *
 * Wrapped rather than called inline so that scenes do not each repeat the
 * `navigator.getGamepads?.()` guard — the API is missing in some embedded
 * WebViews, and a missing pad must be silence, not a crash on boot.
 */
export function currentPad(): PadState {
  return readPad(navigator.getGamepads?.() ?? []);
}

/** Whether any pad is present at all — for telling the player it was seen.
 * Browsers reveal a pad only after a button is pressed on it, so this turning
 * true *is* the confirmation that the press registered. */
export function padConnected(): boolean {
  return firstConnected(navigator.getGamepads?.() ?? []) !== null;
}
