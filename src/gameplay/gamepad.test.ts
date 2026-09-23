import { describe, expect, it } from "vitest";
import { countConnected, mergePad, NO_PAD, padEdges, padForPlayer, padName, padStatusLine, readPad, type PadState } from "./gamepad";
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

  describe("a second pad, for a second player", () => {
    it("hands player two the second pad that exists", () => {
      const [one, two] = [holding(14), holding(15)];
      expect(readPad([one, two], 0).left, "player one gets the first").toBe(true);
      expect(readPad([one, two], 1).right, "player two gets the second").toBe(true);
    });

    it("counts pads rather than slots, so an empty slot does not shuffle anybody", () => {
      // **The reason this counts instead of indexing.** The browser never
      // compacts its list: unplug the pad in slot 0 and the one in slot 1 stays
      // in slot 1, with a null left in front of it. Indexing the raw list would
      // give player one nothing and player two the only pad there is — so the
      // person still holding a controller would find it had stopped working.
      const only = holding(15);
      expect(readPad([null, only], 0).right, "the one real pad is player one's").toBe(true);
      expect(readPad([null, only], 1), "and there is no second player's pad").toEqual(NO_PAD);
    });

    it("skips a pad that lingers after being unplugged", () => {
      // Same argument, with the other way a slot goes dead: a disconnected
      // entry still occupies its slot, so it must not be counted either.
      const stale = pad({ connected: false });
      const live = holding(14);
      expect(readPad([stale, live], 0).left).toBe(true);
      expect(readPad([stale, live], 1)).toEqual(NO_PAD);
    });

    it("is silent when the second player has no pad, which is nearly always", () => {
      expect(readPad([holding(15)], 1)).toEqual(NO_PAD);
      expect(readPad([], 1)).toEqual(NO_PAD);
    });

    it("defaults to the first pad, so every existing caller is unchanged", () => {
      expect(readPad([holding(15)])).toEqual(readPad([holding(15)], 0));
    });
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

describe("countConnected", () => {
  it("counts the real ones and nothing else", () => {
    expect(countConnected([])).toBe(0);
    expect(countConnected([null, null])).toBe(0);
    expect(countConnected([pad()])).toBe(1);
    expect(countConnected([null, pad(), null, pad()])).toBe(2);
  });

  it("does not count a pad that has been unplugged", () => {
    expect(countConnected([pad({ connected: false }), pad()])).toBe(1);
  });
});

describe("padForPlayer", () => {
  /**
   * The whole rule as its own table, because it is the kind of thing that is
   * easy to get subtly right for the case in front of you and wrong for the
   * one you are not holding.
   */

  it("gives a lone player the first pad, exactly as before there were two", () => {
    // The property eighteen solo specs depend on: one character, one pad, pad 0.
    expect(padForPlayer(0, 1, 1)).toBe(0);
    expect(padForPlayer(0, 1, 2)).toBe(0);
    expect(padForPlayer(0, 1, 4)).toBe(0);
  });

  it("gives nobody a pad when there are none", () => {
    expect(padForPlayer(0, 1, 0)).toBeNull();
    expect(padForPlayer(0, 2, 0)).toBeNull();
    expect(padForPlayer(1, 2, 0)).toBeNull();
  });

  it("hands the only controller to player two, and player one gives it up", () => {
    // **The decision this rule exists for.** A tablet, one person on the
    // on-screen D-pad and one holding the only gamepad. If player one kept it,
    // the person who just joined would have nothing at all to play with — a
    // tablet has no keyboard to fall back on either.
    expect(padForPlayer(1, 2, 1)).toBe(0);
    expect(padForPlayer(0, 2, 1)).toBeNull();
  });

  it("gives one each when there are two", () => {
    expect(padForPlayer(0, 2, 2)).toBe(0);
    expect(padForPlayer(1, 2, 2)).toBe(1);
  });

  it("never hands the same pad to both of them", () => {
    // The bug that prompted all of this was exactly this: both characters read
    // pad 0, so one controller moved the pair of them.
    for (const pads of [1, 2, 3, 4]) {
      const one = padForPlayer(0, 2, pads);
      const two = padForPlayer(1, 2, pads);
      if (one !== null && two !== null) expect(one).not.toBe(two);
    }
  });

  it("puts player two on the last pad, not the second", () => {
    // Three plugged in and two playing: the spare sits in the middle rather
    // than leaving player two on a pad nobody is holding.
    expect(padForPlayer(1, 2, 3)).toBe(2);
    expect(padForPlayer(0, 2, 3)).toBe(0);
  });
});

describe("padName", () => {
  it("keeps the part a person would recognise and drops the vendor ids", () => {
    expect(padName(pad({ id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)" }))).toBe(
      "Xbox Wireless Controller",
    );
  });

  it("uses the whole string when there is no bracket, since the format is a convention", () => {
    expect(padName(pad({ id: "8BitDo SN30 Pro" }))).toBe("8BitDo SN30 Pro");
  });

  it("never comes back empty, however odd the pad", () => {
    // A blank name would render as a gap where the answer should be.
    expect(padName(pad({ id: "" }))).toBe("Controller");
    expect(padName(pad({ id: "(STANDARD GAMEPAD)" }))).toBe("Controller");
  });
});

describe("padStatusLine", () => {
  /**
   * The wording, settled here rather than by loading a page and squinting at a
   * corner of it — which is the whole reason this rule is pure.
   */

  it("tells a player with no controller seen which button to press", () => {
    // **The case this was written for.** Browsers hide a gamepad until a button
    // is pressed on it, so a controller paired before the page opened is
    // invisible for ever. "None connected" would be true and useless: the
    // player is holding one. The line has to say what to do about it.
    expect(padStatusLine(true, 0)).toContain("PRESS A BUTTON");
  });

  it("does not tell a browser with no Gamepad API to press anything", () => {
    // Pressing is exactly what will not help here, and saying so would send
    // somebody off pressing buttons they have already pressed.
    const line = padStatusLine(false, 0);
    expect(line).not.toContain("PRESS A BUTTON");
    expect(line).toContain("NOT IN THIS BROWSER");
  });

  it("confirms one, and says how many when there are more", () => {
    expect(padStatusLine(true, 1)).toContain("READY");
    expect(padStatusLine(true, 1)).not.toContain("PRESS A BUTTON");
    expect(padStatusLine(true, 2)).toContain("2 READY");
  });

  it("is two lines in every state, so the band does not reflow", () => {
    // The line sits in a fixed slot in the console's left band between the
    // join button and the D-pad; a state that was one line or three would
    // shift against its neighbours.
    for (const line of [padStatusLine(false, 0), padStatusLine(true, 0), padStatusLine(true, 1), padStatusLine(true, 3)]) {
      expect(line.split("\n")).toHaveLength(2);
    }
  });
});
