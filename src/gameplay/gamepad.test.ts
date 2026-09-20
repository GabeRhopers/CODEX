import { describe, expect, it } from "vitest";
import { mergePad, NO_PAD, padEdges, readPad, type PadState } from "./gamepad";
import type { TouchControlState } from "./TouchControls";

/**
 * What these guard is everything a real pad does that a hand-held one does not:
 * arriving late, going away, resting off-centre, and reporting a mapping we did
 * not expect. None of those is reachable by clicking around, and two of them
 * (drift, and a stale disconnected entry) look like the *game* is broken rather
 * than the pad.
 *
 * Pure snapshots rather than a browser, which is the whole reason `readPad`
 * takes the list instead of calling `navigator.getGamepads()` itself.
 */

/** A pad with nothing held. Standard mapping, 17 buttons and 4 axes, which is
 * what a console controller actually reports. */
function pad(over: Partial<Gamepad> = {}): Gamepad {
  return {
    id: "Test Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: null,
    ...over,
  } as unknown as Gamepad;
}

/** A pad holding exactly the given standard-mapping button indices. */
function holding(...indices: number[]): Gamepad {
  const p = pad();
  const buttons = p.buttons.map((b, i) => (indices.includes(i) ? { ...b, pressed: true, value: 1 } : b));
  return pad({ buttons });
}

describe("readPad", () => {
  it("reports nothing when there is no pad, which is most of the time", () => {
    // Every shape the browser actually hands back when nobody has plugged
    // anything in — most people are playing on a keyboard.
    expect(readPad([])).toEqual(NO_PAD);
    expect(readPad([null, null, null, null])).toEqual(NO_PAD);
  });

  it("ignores a pad that has been unplugged", () => {
    // An unplugged pad lingers in the list with connected: false, often still
    // carrying whatever it was holding at the time. Reading it would leave the
    // player walking into a wall after the batteries died.
    const stale = pad({ connected: false, buttons: holding(14).buttons });
    expect(readPad([stale])).toEqual(NO_PAD);
  });

  it("takes the first connected pad, not the first slot", () => {
    // Slot 0 is routinely empty — a pad unplugged and replugged lands in a
    // later slot — so "pads[0]" would work until someone reconnected.
    expect(readPad([null, holding(15)]).right).toBe(true);
  });

  it("reads the d-pad", () => {
    expect(readPad([holding(14)]).left).toBe(true);
    expect(readPad([holding(15)]).right).toBe(true);
    expect(readPad([holding(13)]).down).toBe(true);
    expect(readPad([holding(12)]).up).toBe(true);
  });

  it("maps the face buttons to the jobs they do", () => {
    expect(readPad([holding(0)]).jump, "bottom face jumps").toBe(true);
    expect(readPad([holding(0)]).confirm, "bottom face also confirms").toBe(true);
    expect(readPad([holding(1)]).back, "right face backs out").toBe(true);
    expect(readPad([holding(2)]).attack, "left face attacks").toBe(true);
    expect(readPad([holding(9)]).pause, "start pauses").toBe(true);
  });

  it("jumps on up as well, the way the up arrow does", () => {
    // isJumpPressed accepts cursors.up and Space alike; a pad that only jumped
    // on the face button would be the odd one out, and pressing up is what
    // someone tries first.
    expect(readPad([holding(12)]).jump).toBe(true);
  });

  describe("the stick", () => {
    it("ignores a resting stick, however worn", () => {
      // The bug this exists for: an older stick rests off centre and reports
      // a small value forever. Without a deadzone that is a direction nobody
      // is holding, and the game looks broken rather than the pad worn.
      for (const drift of [0.1, 0.15, -0.2, 0.49]) {
        const state = readPad([pad({ axes: [drift, drift, 0, 0] })]);
        expect(state.left || state.right || state.up || state.down, `drift ${drift} moved the player`).toBe(false);
      }
    });

    it("accepts a deliberate push", () => {
      expect(readPad([pad({ axes: [-0.9, 0, 0, 0] })]).left).toBe(true);
      expect(readPad([pad({ axes: [0.9, 0, 0, 0] })]).right).toBe(true);
      // Y is inverted against the screen: negative is up, per the spec.
      expect(readPad([pad({ axes: [0, -0.9, 0, 0] })]).up).toBe(true);
      expect(readPad([pad({ axes: [0, 0.9, 0, 0] })]).down).toBe(true);
    });

    it("agrees with the d-pad, so either works", () => {
      expect(readPad([pad({ axes: [-1, 0, 0, 0] })]).left).toBe(readPad([holding(14)]).left);
    });
  });

  it("survives a pad that is not shaped like the ones we planned for", () => {
    // A no-name pad can report a non-standard mapping, fewer buttons, or no
    // axes at all. It is read anyway rather than rejected — a pad where some
    // buttons do the wrong thing is recoverable by trying another one, while a
    // pad that does nothing reads as "no controller support" — but it must not
    // throw on the way.
    const odd = pad({ mapping: "" as GamepadMappingType, buttons: [], axes: [] });
    expect(() => readPad([odd])).not.toThrow();
    expect(readPad([odd])).toEqual(NO_PAD);
  });
});

describe("mergePad", () => {
  const touch = (over: Partial<TouchControlState> = {}): TouchControlState => ({
    left: false,
    right: false,
    jump: false,
    attack: false,
    ...over,
  });
  const padState = (over: Partial<PadState> = {}): PadState => ({ ...NO_PAD, ...over });

  it("does not write into the object it was handed", () => {
    // **The stuck-button bug.** TouchControls.get() returns its own internal
    // state by reference, so merging in place would leave an on-screen button
    // lit after the pad let go — nothing ever clears a flag the touch handlers
    // did not set. Frozen rather than compared afterwards, so the failure lands
    // on the line that did it.
    const own = Object.freeze(touch());
    expect(() => mergePad(own, padState({ left: true, jump: true }))).not.toThrow();
    expect(own.left).toBe(false);
  });

  it("combines rather than replaces, so a pad and a keyboard both work", () => {
    // Touch is already OR'd into the keyboard rather than switching it off —
    // there is no input mode to be in, which is what stops the game having to
    // guess which device you meant.
    expect(mergePad(touch({ left: true }), padState({ right: true }))).toEqual({
      left: true,
      right: true,
      jump: false,
      attack: false,
    });
  });

  it("passes gameplay's four flags through and drops the menu-only ones", () => {
    // PadState is wider than TouchControlState on purpose; confirm/back/pause
    // are menu business and must not leak into movement.
    const merged = mergePad(touch(), padState({ confirm: true, back: true, pause: true }));
    expect(merged).toEqual({ left: false, right: false, jump: false, attack: false });
  });

  it("carries every gameplay button across", () => {
    expect(mergePad(touch(), padState({ left: true, right: true, jump: true, attack: true }))).toEqual({
      left: true,
      right: true,
      jump: true,
      attack: true,
    });
  });
});

/**
 * The rule that turns "held" into "pressed", for menus.
 *
 * Getting this wrong is not a subtle bug. Without it, Start toggles pause on
 * every frame — sixty times a second, so the game flickers between paused and
 * running — and one nudge of the d-pad runs the whole length of the world map.
 * Both are invisible to any test that only presses a button once, which is why
 * half of these press it twice.
 */
describe("padEdges", () => {
  const held = (over: Partial<PadState>): PadState => ({ ...NO_PAD, ...over });

  it("fires on the frame a button goes down", () => {
    expect(padEdges(NO_PAD, held({ confirm: true })).confirm).toBe(true);
  });

  it("stays quiet while the button is held", () => {
    // The pause-flicker bug and the map-sprint bug, in one assertion.
    const down = held({ confirm: true, pause: true, right: true });
    const edges = padEdges(down, down);
    expect(edges.confirm).toBe(false);
    expect(edges.pause).toBe(false);
    expect(edges.right).toBe(false);
  });

  it("stays quiet on release", () => {
    // Letting go is not a press. A menu that acted on release would fire twice
    // per tap, which reads as a double-click nobody made.
    expect(padEdges(held({ confirm: true }), NO_PAD).confirm).toBe(false);
  });

  it("fires again once released and pressed anew", () => {
    const down = held({ confirm: true });
    expect(padEdges(down, NO_PAD).confirm).toBe(false);
    expect(padEdges(NO_PAD, down).confirm).toBe(true);
  });

  it("tracks each button on its own", () => {
    // Holding left while tapping confirm has to keep working — a shared
    // "something changed" flag would swallow the tap.
    const edges = padEdges(held({ left: true }), held({ left: true, confirm: true }));
    expect(edges.left, "left was already down").toBe(false);
    expect(edges.confirm, "confirm is new").toBe(true);
  });

  it("reports nothing at all when nothing is happening", () => {
    expect(padEdges(NO_PAD, NO_PAD)).toEqual(NO_PAD);
  });
});
