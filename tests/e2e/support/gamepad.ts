import type { Page } from "@playwright/test";

/**
 * A fake controller, for tests.
 *
 * Playwright cannot plug in a gamepad, and Chrome DevTools has no command to
 * synthesise one. What it *can* do is replace `navigator.getGamepads` before
 * any page script runs — which works precisely because the game reads that API
 * itself rather than going through Phaser's gamepad plugin, whose list is built
 * from `gamepadconnected` events that would have to be forged too.
 *
 * That is not a happy accident. "Can this be tested?" is why the implementation
 * reads the API directly; this file is the other half of that decision.
 */

/** Standard-mapping indices, matching `src/gameplay/gamepad.ts`'s BUTTON. Kept
 * as plain numbers rather than imported, so a test says what a *controller*
 * sends and would catch the implementation renumbering itself. */
export const PAD = {
  confirm: 0,
  jump: 0,
  back: 1,
  attack: 2,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Long enough for several frames at 60fps, so a press is unambiguously seen
 * and — for the edge-detected menu actions — unambiguously *released* before
 * the next one. A single frame would be a race with Phaser's loop. */
const FRAMES_MS = 120;

interface FakePad {
  connected: boolean;
  axes: number[];
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  /** Bumped on every change. A real pad's timestamp advances whenever its
   * state does, and code is entitled to use that to skip unchanged reads —
   * a fake that never moved it would be a fake that behaved differently
   * from the thing it stands in for. */
  timestamp: number;
}

declare global {
  interface Window {
    /** Every fake pad, in slot order. One of them unless a test asked for more. */
    __pads?: FakePad[];
  }
}

/**
 * Installs `count` fake pads. Must be called before `goto`, like every other
 * `addInitScript` fixture here.
 *
 * They start connected with nothing held. Real browsers hide a pad until a
 * button is pressed on it, which this deliberately does not simulate: that
 * behaviour is the player's problem to solve by pressing a button, and every
 * test here would otherwise begin with a meaningless wake-up press.
 *
 * **One by default, and that matters.** Five solo-controller tests were written
 * against a single pad and must keep passing word for word; they call every
 * helper below without a pad index and get slot 0, exactly as they did when
 * one pad was all this could make.
 */
export async function installFakePad(page: Page, count = 1): Promise<void> {
  await page.addInitScript((n: number) => {
    const pads = Array.from({ length: n }, (_, index) => ({
      id: `Playwright Pad ${index} (STANDARD GAMEPAD Vendor: 0000 Product: 0000)`,
      index,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    }));
    window.__pads = pads as unknown as NonNullable<Window["__pads"]>;
    // Returned live rather than copied, so a press made from the test is
    // visible to the very next frame the game reads — which is what makes
    // `hold` and `release` behave like a thumb rather than like a message.
    navigator.getGamepads = () => pads as unknown as ReturnType<typeof navigator.getGamepads>;
  }, count);
}

/** Presses and keeps holding — for movement, which the game reads as "is it
 * held right now". `pad` is the slot, and defaults to the first. */
export async function hold(page: Page, button: number, pad = 0): Promise<void> {
  await page.evaluate(
    ({ b, i }) => {
      const p = window.__pads![i];
      p.buttons[b] = { pressed: true, touched: true, value: 1 };
      p.timestamp = performance.now();
    },
    { b: button, i: pad },
  );
  await page.waitForTimeout(FRAMES_MS);
}

export async function release(page: Page, button: number, pad = 0): Promise<void> {
  await page.evaluate(
    ({ b, i }) => {
      const p = window.__pads![i];
      p.buttons[b] = { pressed: false, touched: false, value: 0 };
      p.timestamp = performance.now();
    },
    { b: button, i: pad },
  );
  await page.waitForTimeout(FRAMES_MS);
}

/**
 * A press and a release — what a menu needs.
 *
 * Menu actions are edge-triggered, so they fire on the press and not again
 * until the button has come back up. Releasing here is therefore not tidiness:
 * without it the *next* tap would be invisible, and a test would pass the first
 * time and silently stop working after that.
 */
export async function tap(page: Page, button: number, pad = 0): Promise<void> {
  await hold(page, button, pad);
  await release(page, button, pad);
}

/** Pushes the left stick. `value` is -1..1; anything inside the deadzone must
 * read as no direction at all. */
export async function stick(page: Page, axis: number, value: number, pad = 0): Promise<void> {
  await page.evaluate(
    ({ axis, value, i }) => {
      const p = window.__pads![i];
      p.axes[axis] = value;
      p.timestamp = performance.now();
    },
    { axis, value, i: pad },
  );
  await page.waitForTimeout(FRAMES_MS);
}

/** Unplugs it, the way a flat battery does — the entry stays in the list with
 * `connected: false` rather than disappearing. */
export async function unplug(page: Page, pad = 0): Promise<void> {
  await page.evaluate((i) => {
    window.__pads![i].connected = false;
  }, pad);
  await page.waitForTimeout(FRAMES_MS);
}
