import { expect, test } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, readStatusText, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Priority Matrix, "01 · TEST NEXT": basket round-trip (both directions)
 * and the missing-pair Test-Play gate (EditorScene.testPlay/
 * hasMatchingBasketPair) — both halves of "Sub/Up basket pairing gated at
 * Test Play, not just a runtime toast" (Tier 2, Core gameplay loop).
 */

async function testPlayAndWaitForPlayScene(page: import("@playwright/test").Page): Promise<void> {
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
}

test.describe("basket round-trip", () => {
  test("basket-sub teleports Main <-> Sub and back", async ({ page }) => {
    const mainArea = makeArea(12, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 10, y: 5 },
      { type: "basket-sub", x: 4, y: 5 },
    ]);
    const subArea = makeArea(12, 8, 6, [{ type: "basket-sub", x: 4, y: 5 }]);
    const level = makeLevel(mainArea, { subArea });

    await gotoApp(page);
    await startEditorWithLevel(page, level);
    await testPlayAndWaitForPlayScene(page);

    // Walk right from Spawn (tile 1) onto the Main basket (tile 4).
    await page.keyboard.down("ArrowRight");
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 5000 }).toBe("sub");
    await page.keyboard.up("ArrowRight");

    // Landed standing on (or, since input kept running for however long
    // the poll above took to notice the area change, just past) Sub's own
    // basket-sub tile — see enterArea's landingTile handling. Wait out
    // TELEPORT_COOLDOWN_MS (500ms — a fresh landing is briefly immune so
    // it can't immediately bounce back the way it arrived), then walk
    // left to (re-)approach the basket for the return trip.
    await page.waitForTimeout(600);
    await page.keyboard.down("ArrowLeft");
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 5000 }).toBe("main");
    await page.keyboard.up("ArrowLeft");
  });

  test("basket-up teleports Main <-> Up and back", async ({ page }) => {
    const mainArea = makeArea(12, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 10, y: 5 },
      { type: "basket-up", x: 4, y: 5 },
    ]);
    const upArea = makeArea(12, 8, 6, [{ type: "basket-up", x: 4, y: 5 }]);
    const level = makeLevel(mainArea, { upArea });

    await gotoApp(page);
    await startEditorWithLevel(page, level);
    await testPlayAndWaitForPlayScene(page);

    await page.keyboard.down("ArrowRight");
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 5000 }).toBe("up");
    await page.keyboard.up("ArrowRight");

    await page.waitForTimeout(600);
    await page.keyboard.down("ArrowLeft");
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 5000 }).toBe("main");
    await page.keyboard.up("ArrowLeft");
  });
});

test.describe("missing basket pair gates Test Play", () => {
  test("a Sub area with no matching Main basket-sub blocks Test Play with the right message", async ({ page }) => {
    const mainArea = makeArea(12, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 10, y: 5 },
      // deliberately no basket-sub here
    ]);
    const subArea = makeArea(12, 8, 6, [{ type: "basket-sub", x: 4, y: 5 }]);
    const level = makeLevel(mainArea, { subArea });

    await gotoApp(page);
    await startEditorWithLevel(page, level);
    await clickByText(page, "Editor", "Test Play (Space)");

    await expect
      .poll(() => readStatusText(page, "Editor", "Place a matching Basket"))
      .toBe("Place a matching Basket (Down) in Main and Sub before Test Play");
    expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Play"))).toBe(false);
  });

  test("an Up area with no matching Main basket-up blocks Test Play with the right message", async ({ page }) => {
    const mainArea = makeArea(12, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 10, y: 5 },
      // deliberately no basket-up here
    ]);
    const upArea = makeArea(12, 8, 6, [{ type: "basket-up", x: 4, y: 5 }]);
    const level = makeLevel(mainArea, { upArea });

    await gotoApp(page);
    await startEditorWithLevel(page, level);
    await clickByText(page, "Editor", "Test Play (Space)");

    await expect
      .poll(() => readStatusText(page, "Editor", "Place a matching Basket"))
      .toBe("Place a matching Basket (Up) in Main and Up before Test Play");
    expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Play"))).toBe(false);
  });
});
