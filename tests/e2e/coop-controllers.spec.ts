import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { hold, installFakePad, PAD, release } from "./support/gamepad";
import { makeArea, makeLevel } from "./support/levels";
import type { LevelEntity } from "../../src/level/LevelSchema";

/**
 * Two people, two controllers — or one controller and the screen.
 *
 * **This file exists because of a bug it would have caught on day one.** The
 * per-character pad read was written as `currentPad()` with no index, so both
 * characters were driven by pad 0: one controller moved the pair of them at
 * once, and a second controller did nothing at all. The rule that decides who
 * gets which pad was written, unit-tested and then never wired up.
 *
 * Nothing noticed, because the two specs that could have were each looking the
 * other way: `gamepad.spec.ts` only ever has one player, `coop.spec.ts` only
 * ever uses the keyboard, and the fake pad could only fake one pad. So the
 * assertions below are all of the form "this one moved and that one did not" —
 * a test that merely checked somebody moved would have passed throughout.
 *
 * The setup being defended is a tablet: one person tapping the on-screen D-pad
 * and one holding the only controller. See `padForPlayer`.
 */

const MARKERS = (): LevelEntity[] => [
  { type: "player-spawn", x: 6, y: 9 },
  // Parked high up, out of walking reach — most of these tests hold a
  // direction, and reaching the goal would end the run mid-assertion.
  { type: "goal", x: 19, y: 2 },
];

const FLAT = () => makeLevel(makeArea(20, 12, 10, MARKERS()));

interface Character {
  x: number;
}

async function characters(page: Page): Promise<Character[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      players?: { sprite: { x: number } }[];
    };
    return (scene.players ?? []).map((p) => ({ x: p.sprite.x }));
  });
}

/**
 * Waits until the level is actually ready, rather than for a fixed moment.
 *
 * **A level is not finished loading when the scene goes active.** PlayScene
 * hands off to `composeGroundTilesets` and builds the area in a callback,
 * bounded at ten seconds — so `areaBuilt` is the only honest answer to "can I
 * drive this yet". This was `waitForTimeout(300)`, which is enough on an idle
 * machine and is not under load, and it cost two unrelated tests in this file
 * a failure nobody could reproduce afterwards.
 */
const waitForLevel = (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () => (window.__debugGame!.scene.getScene("Play") as unknown as { areaBuilt?: boolean }).areaBuilt === true,
    undefined,
    { timeout: 20_000 },
  );

/** Test Play with `pads` fake controllers attached. */
async function play(page: Page, pads: number): Promise<void> {
  await installFakePad(page, pads);
  await gotoApp(page);
  await startEditorWithLevel(page, FLAT());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  // Not a fixed wait: `characters(page)` is [] until the area is built, so the
  // tests below that read a starting position straight after this would throw
  // on `before[0]` rather than merely time out.
  await waitForLevel(page);
}

/** Test Play with `pads` controllers, then a second player. */
async function playTwo(page: Page, pads: number): Promise<void> {
  await play(page, pads);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await characters(page)).length, { timeout: 5_000 }).toBe(2);
  await page.waitForTimeout(200);
}

/** How far each character has travelled from where it started. Signed, so
 * "went left" and "went right" are distinguishable and "did not move" is zero. */
function drift(before: Character[], after: Character[]): number[] {
  return after.map((c, i) => Math.round(c.x - before[i].x));
}

test("with one controller, it drives player two and leaves player one alone", async ({ page }) => {
  test.slow();
  // **The exact bug, as an assertion.** Before the fix both characters read pad
  // 0, so this pushed them both right together. The second expectation is the
  // one that matters: player one must not move a pixel.
  //
  // It is also the decision behind padForPlayer — with a single controller,
  // player two gets it. On the tablet this was built for, player one still has
  // the on-screen D-pad and player two would otherwise have nothing at all.
  await playTwo(page, 1);
  const before = await characters(page);

  await hold(page, PAD.right);
  await page.waitForTimeout(500);
  const moved = drift(before, await characters(page));
  await release(page, PAD.right);

  expect(moved[1], "the controller moved player two").toBeGreaterThan(20);
  expect(moved[0], "and player one, whose controller it is not, stayed put").toBe(0);
});

test("with two controllers, each drives its own character at the same time", async ({ page }) => {
  test.slow();
  // Opposite directions at once, which is the only way to tell two independent
  // characters from one pad driving both: were they sharing, left and right
  // would cancel and neither would move.
  await playTwo(page, 2);
  const before = await characters(page);

  await hold(page, PAD.left, 0);
  await hold(page, PAD.right, 1);
  await page.waitForTimeout(500);
  const moved = drift(before, await characters(page));
  await release(page, PAD.left, 0);
  await release(page, PAD.right, 1);

  expect(moved[0], "the first controller took player one left").toBeLessThan(-20);
  expect(moved[1], "the second took player two right, at the same moment").toBeGreaterThan(20);
});

test("a lone player still has the first controller, exactly as before", async ({ page }) => {
  test.slow();
  // The property every solo controller test depends on, asserted here too
  // because the rule that reassigns pads on joining is the thing most likely to
  // have broken it.
  await play(page, 1);
  const before = await characters(page);

  await hold(page, PAD.right);
  await page.waitForTimeout(500);
  const moved = drift(before, await characters(page));
  await release(page, PAD.right);

  expect(moved[0]).toBeGreaterThan(20);
});

test("+ PLAYER 2 can be tapped, because a tablet has no Enter key", async ({ page }) => {
  test.slow();
  // The join was keyboard-only, on a feature whose reason for existing is two
  // people sharing a tablet. Not one key is pressed here.
  await play(page, 1);
  expect(await characters(page), "one player to begin with").toHaveLength(1);

  await clickByText(page, "Play", "+ PLAYER 2");
  await expect.poll(async () => (await characters(page)).length, { timeout: 5_000 }).toBe(2);
});

test("the joined-up hint names the devices actually in the room", async ({ page }) => {
  test.slow();
  // "P2 WASD + Q" is a lie on a tablet. With a controller connected the line
  // has to say so — and has to correct itself if a second one arrives, which is
  // why it is re-read rather than written once on joining.
  const labels = (): Promise<string[]> =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play");
      type O = { type?: string; text?: string; list?: O[] };
      const out: string[] = [];
      const walk = (l: O[]): void => {
        for (const c of l) {
          if (c.type === "Text" && c.text) out.push(c.text);
          if (c.list) walk(c.list);
        }
      };
      walk((scene.children.list as unknown as O[]) ?? []);
      return out;
    });

  await playTwo(page, 1);
  await expect.poll(labels, { timeout: 5_000 }).toContain("P1  SCREEN + ARROWS\nP2  CONTROLLER");

  // A second controller arrives mid-level. The line must follow.
  await page.evaluate(() => {
    window.__pads!.push({
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 0,
    } as unknown as NonNullable<Window["__pads"]>[number]);
  });
  await expect.poll(labels, { timeout: 5_000 }).toContain("P1  CONTROLLER 1\nP2  CONTROLLER 2");
});
