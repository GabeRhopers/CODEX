import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * When the keyboard starts listening, as opposed to when the level is ready.
 *
 * **A level does not finish loading in `create()`.** PlayScene waits on the
 * ground tilesets and builds the area in a callback, so there is a real window
 * — a beat on a warm cache, over a second on a cold one — in which the scene is
 * on screen, is receiving key events, and has no character yet.
 *
 * What makes that window dangerous is a detail of Phaser's keyboard: a `Key`
 * learns a button is held from a keydown *event*, and never by asking the
 * keyboard. A Key created while a button is already down therefore reads as up
 * until that button is released and pressed again. So binding the keys during
 * the area build rather than in `create()` means: hold right while a level
 * loads, and the character stands still until you let go and press again.
 *
 * That is not hypothetical. It happened on 2026-09-22, when the player's
 * bindings moved into the per-character factory as part of two-player support.
 * Test Play never saw it — the tilesets are warm by then and the area is built
 * before a test can press anything — and it cost two `game-maker.spec.ts`
 * tests, which reach a level through the World Map and press the instant the
 * scene goes active.
 *
 * This file exists so the next person to move that call finds out here, with a
 * message that says what the rule is, rather than in two unrelated tests about
 * finishing a world.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 2, y: 5 },
      { type: "goal", x: 18, y: 5 },
    ]),
  );

/** Read at the earliest moment there is anything to read: are the bindings
 * there, and has the area been built yet? */
const inputState = (page: Page): Promise<{ bound: boolean; built: boolean; players: number }> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      soloInput?: unknown;
      areaBuilt?: boolean;
      players?: unknown[];
    };
    return { bound: !!scene.soloInput, built: !!scene.areaBuilt, players: scene.players?.length ?? 0 };
  });

test("the keys are bound the moment the level opens, not when it finishes loading", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");

  // The instant the scene is active is the instant somebody can press a key, so
  // it is also the instant the bindings have to exist. Read with no wait at
  // all, deliberately — a `waitForTimeout` here would let the area finish
  // building and turn this into an assertion about nothing.
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  const atOpen = await inputState(page);

  expect(atOpen.bound, "the keyboard is listening before the level is ready").toBe(true);
});

test("a direction held from the moment the level opens still moves the character", async ({ page }) => {
  test.slow();
  // The same rule stated as the thing a person would notice. Weaker than the
  // assertion above on a warm cache — where the area may already be built by
  // the time the key goes down, so it would pass either way — but it is the
  // claim that actually matters, and on a cold load it is the failing case
  // exactly.
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  await page.keyboard.down("ArrowRight");
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
              players?: { sprite: { x: number } }[];
            };
            return scene.players?.[0]?.sprite.x ?? 0;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(320);
  } finally {
    await page.keyboard.up("ArrowRight");
  }
});
