import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickByText, gotoApp, startEditorWithLevel, waitForGame } from "./support/coords";
import { hold, installFakePad, PAD, release, stick, tap, unplug } from "./support/gamepad";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedLevels, seedWorlds } from "./support/worlds";
import type { GameBundle } from "../../src/game/gameBundle";

/**
 * Playing with a controller, with nothing installed.
 *
 * The claim this file defends is not "the code reads a gamepad" — it is that
 * somebody handed a link can finish a game without ever touching the mouse.
 * So the last test drives the *published* flow end to end, in a context with no
 * Drive and no profile, and **clicks nothing**: every step is a button press.
 *
 * The fake pad works by replacing `navigator.getGamepads`, which is only
 * possible because the game reads that API itself rather than going through
 * Phaser's gamepad plugin. See `support/gamepad.ts`.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 2, y: 5 },
      { type: "goal", x: 18, y: 5 },
    ]),
  );

/** The player's horizontal velocity — the thing a player would actually
 * notice, rather than whether some handler was registered. */
async function velocityX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      player?: { body?: { velocity?: { x: number } } };
    };
    return scene.player?.body?.velocity?.x ?? 0;
  });
}

async function activeScene(page: Page, key: string): Promise<boolean> {
  return page.evaluate((k) => window.__debugGame!.scene.isActive(k), key);
}

/** Straight into Test Play with a pad attached. */
async function playWithPad(page: Page): Promise<void> {
  await installFakePad(page);
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
}

test("the d-pad moves the player, and letting go stops them", async ({ page }) => {
  test.slow();
  await playWithPad(page);

  await hold(page, PAD.right);
  expect(await velocityX(page)).toBeGreaterThan(0);

  await release(page, PAD.right);
  expect(await velocityX(page)).toBe(0);

  await hold(page, PAD.left);
  expect(await velocityX(page)).toBeLessThan(0);
  await release(page, PAD.left);
});

test("the stick moves the player, but only past the deadzone", async ({ page }) => {
  test.slow();
  await playWithPad(page);

  // The bug this exists for: a worn stick rests slightly off centre and reports
  // a small value forever. Read naively that is a direction nobody is holding,
  // so the player walks into a wall by themselves and the *game* looks broken.
  await stick(page, 0, 0.2);
  expect(await velocityX(page), "a resting stick moved the player").toBe(0);

  await stick(page, 0, 0.95);
  expect(await velocityX(page)).toBeGreaterThan(0);

  await stick(page, 0, 0);
  expect(await velocityX(page)).toBe(0);
});

test("the pad joins the keyboard rather than replacing it", async ({ page }) => {
  test.slow();
  await playWithPad(page);

  // There is no "controller mode" to be in — touch is already OR'd into the
  // keyboard, and a pad joins the same way. Someone playing on a keyboard with
  // a pad plugged in must not find their arrow keys dead.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(120);
  expect(await velocityX(page)).toBeGreaterThan(0);
  await page.keyboard.up("ArrowRight");
});

test("an unplugged pad stops the player instead of leaving them walking", async ({ page }) => {
  test.slow();
  await playWithPad(page);

  await hold(page, PAD.right);
  expect(await velocityX(page)).toBeGreaterThan(0);

  // A flat battery leaves the entry in the list with connected: false, often
  // still holding whatever it was. Reading it would walk the player into a wall
  // forever with the pad dead on the table.
  await unplug(page);
  expect(await velocityX(page)).toBe(0);
});

test("Start pauses once per press, not once per frame", async ({ page }) => {
  test.slow();
  await playWithPad(page);

  const paused = () =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as { paused: boolean };
      return scene.paused;
    });

  expect(await paused()).toBe(false);

  // Held for many frames. Without edge detection this would toggle sixty times
  // a second and land on whichever state the frame count happened to give —
  // a game flickering between paused and running.
  await hold(page, PAD.start);
  await page.waitForTimeout(500);
  expect(await paused(), "holding Start toggled pause more than once").toBe(true);

  await release(page, PAD.start);
  expect(await paused(), "releasing Start un-paused it").toBe(true);

  await tap(page, PAD.start);
  expect(await paused()).toBe(false);
});

/**
 * The real claim: a whole published game, on the pad, with no clicks.
 *
 * Built through the real editor so what is played is what the tool actually
 * produces, then opened in a context of its own — no mocked Drive, no seeded
 * profile, no token — because a visitor has none of those. Anything that
 * happens here could only have come from the file and the controller.
 */
test("a published game plays start to finish without ever touching the mouse", async ({ browser }) => {
  test.slow();

  // --- author and publish, with a mouse, as the author would
  const authorContext = await browser.newContext();
  const authorPage = await authorContext.newPage();
  await gotoApp(authorPage);
  const levels = await seedLevels(authorPage, ["Green Hill"]);
  await seedWorlds(authorPage, [makeWorld("w1", "World One", levels)]);
  await clickByText(authorPage, "Menu", "Game Maker");
  await authorPage.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await authorPage.getByPlaceholder("Grampa's Quest").fill("Pad Quest");
  await authorPage.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(authorPage, "GameMaker", "Add");
  await clickByText(authorPage, "GameMaker", "Publish…");
  await authorPage.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  const [download] = await Promise.all([
    authorPage.waitForEvent("download"),
    clickByText(authorPage, "Publish", "Download"),
  ]);
  const bundle = JSON.parse(readFileSync((await download.path())!, "utf8")) as GameBundle;
  await authorContext.close();

  // --- and now play it, as a relative opening the link, with a controller
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await installFakePad(page);
    await page.addInitScript(() => localStorage.clear());
    await page.route("**/game.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) }),
    );
    await page.goto("/");
    await waitForGame(page);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });

    // The title says the pad was seen. Worth asserting because browsers hide a
    // gamepad until a button is pressed on one, so this line appearing is the
    // only confirmation a player gets before committing to a level.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("GameTitle");
          return scene.children.list.some((c) => ((c as { text?: string }).text ?? "").includes("Controller ready"));
        }),
      )
      .toBe(true);

    // Title → map, on the pad.
    await tap(page, PAD.confirm);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"), undefined, { timeout: 20_000 });

    // Map → level, on the pad. This is the step that did not exist before: the
    // map's nodes were reachable only by pointer, so a controller could start
    // a game and then never pick a level.
    await tap(page, PAD.confirm);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"), undefined, { timeout: 20_000 });

    // And it is really playable, not merely open.
    await hold(page, PAD.right);
    expect(await velocityX(page)).toBeGreaterThan(0);
    await release(page, PAD.right);

    // Nothing in this test clicked anything.
    expect(await activeScene(page, "Play")).toBe(true);
  } finally {
    await context.close();
  }
});
