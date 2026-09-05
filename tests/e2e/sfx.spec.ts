import { expect, test, type Page } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  clickScenePoint,
  gotoApp,
  readSceneField,
  selectPaletteCategory,
  tileCenter,
} from "./support/coords";

/**
 * The game makes a noise when you do something.
 *
 * Until 2026-09-05 it made none at all — `this.sound.play` appeared nowhere in
 * src/. Silence is not a subtle defect: jumping, taking a coin and reaching the
 * goal were all completely quiet, which reads as broken within seconds.
 *
 * Recording what the *SoundManager* was asked to play, rather than listening for
 * audio. Chromium in this harness has no audio device and Playwright cannot hear
 * one anyway, so the honest question a test can ask is "did the game try to play
 * the right sound at the right moment", which is exactly where the bug would be.
 * That the files themselves are audible is checked by scripts/generate-sfx.py's
 * own output and by ear.
 */

/** Wraps `sound.play` on the live game so every key it is asked for lands in an
 * array the test can read. Installed after boot, so it sees gameplay rather than
 * the menu theme. */
async function recordSounds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.__debugGame!;
    const played: string[] = [];
    (window as unknown as { __sfx: string[] }).__sfx = played;
    const manager = game.sound as unknown as { play: (key: string, ...rest: unknown[]) => unknown };
    const original = manager.play.bind(manager);
    manager.play = (key: string, ...rest: unknown[]) => {
      played.push(key);
      return original(key, ...rest);
    };
  });
}

function playedSounds(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sfx: string[] }).__sfx ?? []);
}

test("every effect is loaded and ready before a level starts", async ({ page }) => {
  // BootScene preloads the set (see audio/sfx.ts). If a filename ever drifts
  // from the key, playSfx silently does nothing by design — which is right for
  // gameplay and useless for noticing, so it is checked here instead.
  await gotoApp(page);
  const missing = await page.evaluate(() => {
    const game = window.__debugGame!;
    const names = ["jump", "coin", "heart", "key", "chest", "hurt", "goal"];
    return names.filter((n) => !game.cache.audio.exists(`sfx-${n}`));
  });
  expect(missing, "these effects never loaded — check the filenames in public/assets/audio/sfx/").toEqual([]);
});

test("jumping, taking a coin and winning each make their own sound", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await clickByText(page, "Menu", "New Level");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));

  // A floor, a coin to run through, and a goal at the end — the same
  // paint-and-place path plain-level.spec.ts uses, plus one collectible.
  await clickIconWithLabel(page, "Editor", "Grass");
  const groundRow = 9;
  for (let x = 0; x <= 8; x++) {
    const { x: px, y: py } = tileCenter(x, groundRow);
    await clickScenePoint(page, px, py);
  }

  await selectPaletteCategory(page, "Editor", "Items");
  await clickIconWithLabel(page, "Editor", "Coin");
  const coinTile = tileCenter(4, groundRow - 1);
  await clickScenePoint(page, coinTile.x, coinTile.y);

  await selectPaletteCategory(page, "Editor", "Markers");
  await clickIconWithLabel(page, "Editor", "Spawn");
  const spawnTile = tileCenter(1, groundRow - 1);
  await clickScenePoint(page, spawnTile.x, spawnTile.y);

  await clickIconWithLabel(page, "Editor", "Goal");
  const goalTile = tileCenter(7, groundRow - 1);
  await clickScenePoint(page, goalTile.x, goalTile.y);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await recordSounds(page);

  // Jump on the spot first, so the jump sound is attributable to the jump
  // rather than to anything the run into the coin might trigger.
  await page.keyboard.press("Space");
  await expect.poll(() => playedSounds(page)).toContain("sfx-jump");

  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => readSceneField<string>(page, "Play", "outcome"), { timeout: 5000, intervals: [100] })
    .toBe("won");
  await page.keyboard.up("ArrowRight");

  const played = await playedSounds(page);
  expect(played, "running over a coin should have made the coin noise").toContain("sfx-coin");
  expect(played, "reaching the goal should have made the goal noise").toContain("sfx-goal");
  // Nothing bad happened in this level, so the hurt sound would mean a hit was
  // registered that should not have been.
  expect(played, "nothing hit the player, so nothing should have sounded like it").not.toContain("sfx-hurt");
});
