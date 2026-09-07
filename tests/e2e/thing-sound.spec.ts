import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, clickScenePoint, gotoApp, selectPaletteCategory, startEditorWithLevel, tileCenter } from "./support/coords";
import { customDef, seedCustomEntities } from "./support/customEntities";
import { makeArea, makeLevel } from "./support/levels";

/**
 * An invented thing makes its own noise, instead of the one it borrows.
 *
 * A custom entity copies a built-in's behaviour — an invented item "based on a
 * coin" runs the coin's own collect path — and until now it also inherited the
 * coin's *sound*. So a hand-drawn coin sounded exactly like a built-in one,
 * which is the single part of "I made this" the tool could not deliver.
 *
 * The assertion is about replacement, not merely about noise: the thing's own
 * key must play **and** the coin's must not. Layering the two was the other
 * plausible design, so "it made a sound" alone would pass either way and prove
 * nothing about the choice that was actually made.
 *
 * Sounds are recorded rather than heard. Playwright cannot listen, but
 * `sound.play(key)` is the one call every path funnels through, so patching it
 * to push its key onto an array captures exactly what the game asked for —
 * including, crucially, what it did *not* ask for.
 */

const THING_ID = "custom:noisy";
const THING_SFX = "thing-sfx-custom:noisy";
const COIN_SFX = "sfx-coin";

/** Records every `sound.play(key)` from here on. Installed after boot, so the
 * menu theme's own start is not in the list. */
async function recordSounds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const manager = window.__debugGame!.sound as unknown as {
      play: (key: string, extra?: unknown) => boolean;
      __played?: string[];
    };
    manager.__played = [];
    const original = manager.play.bind(manager);
    manager.play = (key: string, extra?: unknown) => {
      manager.__played!.push(key);
      return original(key, extra);
    };
  });
}

const playedSounds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const manager = window.__debugGame!.sound as unknown as { __played?: string[] };
    return manager.__played ?? [];
  });

/** A flat runway with one invented item sitting just ahead of the spawn. */
const levelWithThing = () =>
  makeLevel(
    makeArea(14, 10, 8, [
      { type: "player-spawn", x: 1, y: 7 },
      { type: "goal", x: 12, y: 7 },
    ]),
  );

async function walkInto(page: Page, tileX: number): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { x: number } };
          return scene.player?.x ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(tileX * 32);
  await page.keyboard.up("ArrowRight");
}

test("an invented item's own sound replaces the one it borrows", async ({ page }) => {
  test.slow();

  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: THING_ID, name: "Noisy Fruit", sound: { preset: "pickup", seed: 4242 } }),
  ]);

  await startEditorWithLevel(page, levelWithThing());
  await selectPaletteCategory(page, "Editor", "Items");
  await clickIconWithLabel(page, "Editor", "Noisy Fruit");
  const at = tileCenter(4, 7);
  await clickScenePoint(page, at.x, at.y);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await recordSounds(page);

  await walkInto(page, 5);

  // The thing's own noise, and only it. `sfx-coin` appearing here would mean
  // the built-in fallback fired as well, which is the layering design this one
  // deliberately is not.
  await expect.poll(() => playedSounds(page), { timeout: 10_000 }).toContain(THING_SFX);
  expect(await playedSounds(page), "the borrowed coin noise played too").not.toContain(COIN_SFX);
});

test("an invented item with no sound of its own still sounds like what it copies", async ({ page }) => {
  test.slow();
  // The other half of the contract, and the one that would break quietly: if
  // "has a sound" were resolved wrongly, every custom item would go silent
  // rather than falling back, and nothing about the game would look broken.
  await gotoApp(page);
  await seedCustomEntities(page, [customDef({ id: "custom:quiet", name: "Quiet Fruit" })]);

  await startEditorWithLevel(page, levelWithThing());
  await selectPaletteCategory(page, "Editor", "Items");
  await clickIconWithLabel(page, "Editor", "Quiet Fruit");
  const at = tileCenter(4, 7);
  await clickScenePoint(page, at.x, at.y);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await recordSounds(page);

  await walkInto(page, 5);

  await expect.poll(() => playedSounds(page), { timeout: 10_000 }).toContain(COIN_SFX);
});
