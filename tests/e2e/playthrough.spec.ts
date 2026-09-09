import { expect, test, type Page } from "@playwright/test";
import { waitForGame } from "./support/coords";

/**
 * Play the shipped game the way somebody who was sent the link plays it.
 *
 * A developer aid, run by name, not part of the suite's guarantees — it
 * screenshots each stage so they can be looked at. Every visible bug this
 * project has had was found this way rather than by an assertion: the World Map
 * that was a murky rectangle, the cut-scene panels hunched at the bottom of an
 * empty screen, the demo whose levels were all floating slabs. None of those
 * broke a test, because none of them were wrong — they were just bad.
 *
 * `?game=` boots straight into the published bundle with no editor and no
 * sign-in (see publishedBundle.ts), which is exactly what the audience gets.
 */

const GAME = "grampa-and-the-lost-sheep";

const active = (page: Page, key: string): Promise<boolean> =>
  page.evaluate((k) => window.__debugGame!.scene.isActive(k), key);

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test-results/play-${name}.png` });
}

test("play the published game from the link", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);

  await page.goto(`/?game=${GAME}`);
  await waitForGame(page);

  // Title screen: no editor, no sign-in.
  await expect.poll(() => active(page, "GameTitle"), { timeout: 20_000 }).toBe(true);
  await shot(page, "01-title");

  // Play ▶ runs the opening cut scene before the first world.
  await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("GameTitle") as unknown as { children: { list: unknown[] } };
    type T = { type?: string; text?: string; emit?: (e: string) => void };
    const play = (scene.children.list as T[]).find((c) => c.type === "Text" && /play/i.test(c.text ?? ""));
    play?.emit?.("pointerdown");
  });
  await expect.poll(() => active(page, "CutScene"), { timeout: 20_000 }).toBe(true);
  await shot(page, "02-opening-cutscene");

  // Skip straight through; the panels themselves are what the shot is for.
  for (let i = 0; i < 6 && (await active(page, "CutScene")); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
  }

  await expect.poll(() => active(page, "WorldMap"), { timeout: 20_000 }).toBe(true);
  await shot(page, "03-world-map");

  // Each level, entered from the map and screenshotted at its spawn.
  for (let level = 0; level < 3; level++) {
    const entered = await page.evaluate((i) => {
      const scene = window.__debugGame!.scene.getScene("WorldMap") as unknown as { children: { list: unknown[] } };
      type Node = { type?: string; radius?: number; x?: number; input?: { enabled?: boolean }; emit?: (e: string) => void };
      const nodes = (scene.children.list as Node[])
        .filter((c) => c.type === "Arc" && c.radius === 18)
        .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      const node = nodes[i];
      if (!node?.input?.enabled) return false;
      node.emit?.("pointerdown");
      return true;
    }, level);
    if (!entered) break; // later levels stay locked until the one before is beaten

    await expect.poll(() => active(page, "Play"), { timeout: 30_000 }).toBe(true);
    await shot(page, `04-level-${level + 1}`);

    // Walk a little way in, so the shot after this shows the level in motion
    // rather than the spawn point every time.
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1500);
    await page.keyboard.up("ArrowRight");
    await shot(page, `05-level-${level + 1}-moving`);

    // Back to the map rather than finishing — completing three levels by
    // playing them properly is not something a script should pretend to do.
    await page.evaluate(() => window.__debugGame!.scene.start("WorldMap", { worldId: undefined }));
    await page.waitForTimeout(800);
    if (!(await active(page, "WorldMap"))) break;
  }

  await shot(page, "06-end");
});
