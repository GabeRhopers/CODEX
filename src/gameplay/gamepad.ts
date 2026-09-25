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
 * The nth pad that is actually there, counting only the real ones.
 *
 * `navigator.getGamepads()` returns a sparse, fixed-length list — usually four
 * slots, mostly `null`, and a pad that was unplugged can linger with
 * `connected: false`. Both have to be skipped or every read throws or lies.
 *
 * **Counting connected pads rather than indexing the raw list is the whole
 * point.** A browser does not compact that list: unplug the pad in slot 0 and
 * the pad in slot 1 stays in slot 1, with a `null` or a stale `connected:
 * false` entry above it. Indexing it directly would hand player two a pad
 * whose slot number depends on what was plugged in earlier in the session, and
 * would give player one nothing at all while a dead entry sat in front of it.
 * Here, "player two" means "the second pad that exists", which is what someone
 * picking up a controller means by it.
 *
 * Out of range — the usual case, since almost nobody has two pads — is `null`,
 * which `readPad` turns into silence.
 */
function nthConnected(pads: readonly (Gamepad | null)[], index: number): Gamepad | null {
  let seen = 0;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    if (seen === index) return pad;
    seen += 1;
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
export function readPad(pads: readonly (Gamepad | null)[], index = 0): PadState {
  const pad = nthConnected(pads, index);
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
export function currentPad(index = 0): PadState {
  return readPad(navigator.getGamepads?.() ?? [], index);
}

/** Whether any pad is present at all — for telling the player it was seen.
 * Browsers reveal a pad only after a button is pressed on it, so this turning
 * true *is* the confirmation that the press registered. */
export function padConnected(): boolean {
  return nthConnected(navigator.getGamepads?.() ?? [], 0) !== null;
}

/** How many real pads there are, skipping the empty slots and the unplugged
 * stragglers exactly as `nthConnected` does. What `padForPlayer` is asked
 * about. */
export function countConnected(pads: readonly (Gamepad | null)[]): number {
  let n = 0;
  for (const pad of pads) if (pad && pad.connected) n += 1;
  return n;
}

/** The live count. Same DOM guard as `currentPad`. */
export function connectedPadCount(): number {
  return countConnected(navigator.getGamepads?.() ?? []);
}

/**
 * Every connected pad's buttons folded into one — what the *menus* read.
 *
 * Gameplay asks which pad a particular character is holding (see
 * `padForPlayer`); a menu does not care who pressed. Pause, back and confirm
 * should answer to anyone in the room, and reading only pad 0 meant player
 * two's Start button did nothing at all once each person had a controller.
 *
 * OR'd, for the same reason a pad is OR'd into the on-screen buttons: there is
 * no "which device is in charge" to decide, and nothing has to be told which
 * one you meant.
 */
export function anyPad(pads: readonly (Gamepad | null)[]): PadState {
  let merged = NO_PAD;
  const count = countConnected(pads);
  for (let i = 0; i < count; i += 1) {
    const state = readPad(pads, i);
    merged = {
      left: merged.left || state.left,
      right: merged.right || state.right,
      up: merged.up || state.up,
      down: merged.down || state.down,
      jump: merged.jump || state.jump,
      attack: merged.attack || state.attack,
      confirm: merged.confirm || state.confirm,
      back: merged.back || state.back,
      pause: merged.pause || state.pause,
    };
  }
  return merged;
}

/** The live read of every pad at once. Same DOM guard as `currentPad`. */
export function currentAnyPad(): PadState {
  return anyPad(navigator.getGamepads?.() ?? []);
}

/**
 * Whether this browser has the Gamepad API at all.
 *
 * Distinct from "no controller is connected", and the difference is the whole
 * reason this exists. Every read below guards with `?.()` and turns a missing
 * API into silence, which is right for gameplay and useless to a person: told
 * only that nothing is connected, they will go on pressing buttons on a
 * controller the page is constitutionally unable to see. Every third-party
 * browser on an iPad is a WKWebView, and that is exactly where this comes back
 * false.
 */
export function padApiAvailable(): boolean {
  return typeof navigator.getGamepads === "function";
}

/**
 * A controller's name, short enough to show.
 *
 * Browsers report something like `Xbox Wireless Controller (STANDARD GAMEPAD
 * Vendor: 045e Product: 02ea)` — the useful half is before the bracket, and the
 * rest is a vendor id nobody is holding. Falls back to the whole string when
 * there is no bracket, since the format is a convention rather than a rule.
 */
export function padName(pad: Gamepad): string {
  const id = pad.id ?? "";
  // `>= 0`, not `> 0`: an id that is *only* a bracket leaves nothing, which the
  // fallback below then names. Written as `> 0` first, and the "never comes
  // back empty" test said so.
  const cut = id.indexOf("(");
  const short = (cut >= 0 ? id.slice(0, cut) : id).trim();
  return short || "Controller";
}

/** The names of every connected pad, in the order `padForPlayer` counts them. */
export function connectedPadNames(): string[] {
  const pads = navigator.getGamepads?.() ?? [];
  const out: string[] = [];
  for (const pad of pads) if (pad && pad.connected) out.push(padName(pad));
  return out;
}

/**
 * What to tell the player about controllers, in the console's own voice.
 *
 * **The middle case is the one that matters**, and it is an instruction rather
 * than a status. Browsers deliberately hide a gamepad from a page until a
 * button is pressed on it, so a controller paired before the page opened is
 * invisible however long you wait — and the player, holding a controller that
 * does nothing, has no way to know the rule exists. Saying "none connected"
 * there would be true and useless. Saying which button to press is the fix.
 *
 * Pure, so the wording is settled in a unit test rather than by loading a page
 * and squinting at a corner of it.
 */
export function padStatusLine(available: boolean, count: number): string {
  if (!available) return "CONTROLLERS\nNOT IN THIS BROWSER";
  if (count <= 0) return "CONTROLLER?\nPRESS A BUTTON ON IT";
  if (count === 1) return "CONTROLLER\nREADY";
  return `CONTROLLERS\n${count} READY`;
}

/**
 * Who is holding what, once two people are playing.
 *
 * Named by *device* rather than by key, because the answer depends on what is
 * plugged in — and on a tablet, which is what this was built for, "ARROWS" and
 * "WASD" name things that are not in the room. Re-read whenever the pad count
 * changes (see PlayScene's update), so plugging a second controller in
 * mid-level corrects the line rather than leaving it lying.
 *
 * The one-pad row is `padForPlayer`'s table read back as English: player one
 * gives up the controller, so player one is on the screen and the arrows.
 */
export function coopSummaryLine(pads: number): string {
  if (pads >= 2) return "P1  CONTROLLER 1\nP2  CONTROLLER 2";
  if (pads === 1) return "P1  SCREEN + ARROWS\nP2  CONTROLLER";
  return "P1  ARROWS + X\nP2  WASD + Q";
}

/**
 * What the toast says at the moment of joining.
 *
 * Reads the pad count for the same reason `coopSummaryLine` does, and it is not
 * a nicety: this said "WASD to move, Q to zap" unconditionally, which with a
 * controller plugged in contradicted the line in the left band directly beside
 * it. Two pieces of the same screen telling a child two different things about
 * which buttons are theirs is worse than either one alone — which is why these
 * two live together, and are tested against each other.
 */
export function coopJoinLine(pads: number): string {
  if (pads >= 2) return "Player 2 joined! The second controller is yours";
  if (pads === 1) return "Player 2 joined! The controller is yours";
  return "Player 2 joined! WASD to move, Q to zap";
}

/**
 * Which pad drives a given character, or `null` for "none — keyboard and the
 * on-screen buttons only".
 *
 * | players | pads | player one | player two |
 * |---|---|---|---|
 * | 1 | 0 | — | — |
 * | 1 | 1+ | pad 0 | — |
 * | 2 | 0 | — | — |
 * | 2 | 1 | **—** | **pad 0** |
 * | 2 | 2+ | pad 0 | pad 1 |
 *
 * **Player two takes the last pad, not the second one.** With two controllers
 * that is pad 1 and reads as "one each". With one controller it is pad 0, and
 * player one gives it up — which is the decision that makes the setup this was
 * written for work at all: a tablet, one person on the on-screen D-pad and one
 * holding the only gamepad. Had player one kept it, the person who just joined
 * would have had nothing to play with, since a tablet has no keyboard either.
 *
 * **Derived, never stored.** The count changes the moment somebody plugs a
 * controller in, and a remembered index would then be pointing at the wrong
 * one — or at nothing. An earlier version of this stored `padIndex` on each
 * player and no caller ever read it, which is its own argument.
 *
 * Solo is byte-for-byte what it was before there was a second player: one
 * character, one pad, pad 0.
 */
export function padForPlayer(playerIndex: number, playerCount: number, padCount: number): number | null {
  if (padCount <= 0) return null;
  if (playerCount <= 1) return playerIndex === 0 ? 0 : null;
  // The last player takes the last pad; everyone before them takes pads from
  // the front. With the two the key schemes allow, that is exactly the table.
  if (playerIndex === playerCount - 1) return padCount - 1;
  return playerIndex < padCount - 1 ? playerIndex : null;
}
