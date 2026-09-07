import { test } from "@playwright/test";
import { gotoApp } from "./support/coords";

/**
 * Screenshots of every screen whose header moved, for eyeballing.
 *
 * Not an assertion — a developer aid, run by name when the header changes.
 * `assertLayoutSound` compares only *interactive* text, so two plain labels
 * overlapping is invisible to it, and that blind spot has already cost two bugs
 * (the Menu's credits line running through the controls hint, and the empty
 * palette hint running through a heading). The taller back button is exactly
 * the sort of change that could land one of those, so it gets looked at.
 */

test.describe.configure({ mode: "serial" });

test("header screenshots", async ({ page }, testInfo) => {
  test.slow();
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(400);
    await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
    await page.screenshot({ path: `test-results/header-${name}.png` });
  };

  await gotoApp(page);
  await shot("menu");

  // Started directly rather than walked to. This is a screenshot aid, not a
  // navigation test — `menu.spec.ts` already covers which button goes where,
  // and clicking through five screens gives this five ways to fail for reasons
  // that have nothing to do with what it is looking at.
  for (const [key, name] of [
    ["LevelBrowser", "level-browser"],
    ["Templates", "template-browser"],
    ["WorldBrowser", "world-browser"],
    ["GameMaker", "game-maker"],
    ["Publish", "publish"],
  ] as const) {
    await page.evaluate((k) => {
      const manager = window.__debugGame!.scene;
      // Stop whatever is showing first. `game.scene.start(key)` is not the same
      // call as `this.scene.start(key)` from inside a scene: the manager's
      // version starts the new scene and leaves the old one running, so the
      // first version of this drew every screen on top of the Menu and the
      // screenshots were unreadable.
      for (const active of manager.getScenes(true)) {
        if (active.scene.key !== "Boot") manager.stop(active.scene.key);
      }
      manager.start(k);
    }, key);
    await page.waitForFunction((k) => window.__debugGame!.scene.isActive(k), key);
    await shot(name);
  }
});
