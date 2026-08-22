import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, readStatusText, startEditorWithLevel, tileCenter } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Priority Matrix, "01 · TEST NEXT": basket round-trip (both directions)
 * and the missing-pair Test-Play gate (EditorScene.testPlay/
 * hasMatchingBasketPair) — both halves of "Sub/Up basket pairing gated at
 * Test Play, not just a runtime toast" (Tier 2, Core gameplay loop).
 */

async function testPlayAndWaitForPlayScene(page: Page): Promise<void> {
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
}

async function playerX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { x: number } };
    return scene.player?.x ?? -1;
  });
}

/**
 * Drives the return leg of a round trip, and is where this spec changed on
 * 2026-08-22. A teleport leaves the player standing on the destination area's
 * own pad. This used to wait out TELEPORT_COOLDOWN_MS *without moving* and
 * let the pad fire again underneath them — which was the bounce-back bug
 * (see PlayScene's latchedBasketTile, and basket-bounce.spec.ts, which now
 * pins it). A pad no longer re-fires until the player has genuinely left it,
 * so the real interaction is: step clear, then walk back on. Leaves
 * ArrowRight held; the caller polls for the area change and releases it.
 */
async function stepOffPadAndWalkBackOn(page: Page, padTileX: number): Promise<void> {
  const padCentre = tileCenter(padTileX, 0).x;
  await page.keyboard.down("ArrowLeft");
  // A full tile clear of the pad's centre, so the 32px trigger zone is
  // definitely no longer overlapped whatever the frame pacing.
  await expect.poll(() => playerX(page), { timeout: 10_000 }).toBeLessThan(padCentre - 32);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.down("ArrowRight");
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

    // Landed on Sub's own basket-sub tile (tile 4) — see enterArea's
    // landingTile handling. Step off it, then walk back on to go home.
    await stepOffPadAndWalkBackOn(page, 4);
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 10_000 }).toBe("main");
    await page.keyboard.up("ArrowRight");
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

    await stepOffPadAndWalkBackOn(page, 4);
    await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 10_000 }).toBe("main");
    await page.keyboard.up("ArrowRight");
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
