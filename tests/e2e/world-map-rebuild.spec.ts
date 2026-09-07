import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./support/coords";
import { delayDriveRead } from "./support/mockDrive";
import { makeWorld, seedLevels, seedWorld } from "./support/worlds";

/**
 * Re-entering a world map while the last one is still loading must not draw it
 * twice.
 *
 * `WorldMapScene.build()` makes two sequential reads — the world, then every
 * level's name — before it draws anything, and what it draws is a backdrop, a
 * node per level and the paths between them. So a chain that outlives its
 * screen does not merely set a stale label: it lays a second complete map over
 * the live one, node for node.
 *
 * The reason this needs a build counter rather than the captured-key check used
 * elsewhere in the app is the case below. Play a level and come back, or simply
 * reopen the same world, and the world id is *identical* — an id comparison
 * sees two builds of the same screen as the same build and waves the stale one
 * through. Only "which build is on display now" can tell them apart.
 *
 * Sibling of skin-browse-rebuild.spec.ts, which caught the same bug shape in
 * the Skin Creator's browse list.
 */

const LEVELS = ["Green Hill", "Ice Cave", "Lava Keep"];

/** Every node circle on the map. Read off the live display list rather than by
 * coordinate, exactly as world-map.spec.ts does — a doubled map shows up here
 * as twice the nodes. */
async function nodeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMap");
    let count = 0;
    for (const child of scene.children.list) {
      const o = child as unknown as { type?: string; radius?: number };
      if (o.type === "Arc" && o.radius === 18) count++;
    }
    return count;
  });
}

async function openMap(page: Page, worldId: string): Promise<void> {
  // The braces matter: `scene.start` returns the SceneManager, and returning it
  // from an evaluate makes Playwright try to serialise the whole thing back.
  await page.evaluate((id) => {
    window.__debugGame!.scene.start("WorldMap", { worldId: id });
  }, worldId);
}

test("reopening a world map mid-load doesn't draw the map twice", async ({ page }) => {
  test.slow();

  await gotoApp(page);
  const levelIds = await seedLevels(page, LEVELS);
  await seedWorld(page, makeWorld("w1", "Test World", levelIds));

  // After gotoApp and after seeding, never before: gotoApp installs the base
  // Drive mock itself and Playwright matches routes last-registered-first, so a
  // delay registered earlier is simply shadowed and nothing waits. (That cost a
  // confusing run the first time.) Seeding before the delay also keeps the
  // writes fast — only the read below is slowed.
  await delayDriveRead(page, "world-", 4000);

  await openMap(page, "w1");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  // Nothing is drawn yet — that is the window this test lives in.
  expect(await nodeCount(page), "the map drew before its world could have loaded").toBe(0);

  // Straight back in, same world, while the first read is still outstanding.
  await openMap(page, "w1");

  // Both reads resolve; only the live build may draw.
  await expect.poll(() => nodeCount(page), { timeout: 20_000 }).toBe(LEVELS.length);

  // And it stays that way: a chain that was going to draw late has had every
  // chance by now.
  await page.waitForTimeout(500);
  expect(await nodeCount(page), "a stale build drew a second map").toBe(LEVELS.length);
});
