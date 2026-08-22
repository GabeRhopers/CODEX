import { expect, test } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * A teleport lands the player standing exactly on the destination area's own
 * basket. Until 2026-08-22 the only thing stopping that from firing again was
 * TELEPORT_COOLDOWN_MS — a wall-clock timer, while the player's movement is
 * integrated per physics step. On a starved loop the two diverge: the timer
 * lapses on schedule but the player has barely moved, so they are still on the
 * pad and get sent straight back, over and over, for as long as the direction
 * is held.
 *
 * That is not a hypothetical. It is what a slow phone does — this game ships
 * touch controls and a rotate-to-landscape tip, so slow phones are the target
 * — and it is what took CI red. This test reproduces the starved loop
 * deterministically with CPU throttling rather than waiting for a slow machine
 * to happen along, and asserts the player leaves Main once and stays gone.
 */

// Enough to starve the loop well past what any CI runner does, so this fails
// loudly if the exit latch in PlayScene.useBasket regresses. Measured on the
// broken build at this rate: the player oscillated around x=245 (the pad sits
// at x=238) for 5-7 seconds, bouncing between areas, and ended on the wrong
// outcome in a third of runs.
const CPU_THROTTLE_RATE = 6;

test("a held direction through a teleport does not bounce the player back and forth", async ({ page }) => {
  test.slow();

  const mainArea = makeArea(10, 8, 6, [
    { type: "player-spawn", x: 1, y: 5 },
    { type: "goal", x: 8, y: 5 },
    { type: "basket-sub", x: 3, y: 5 },
  ]);
  // Ground only spans x=0..6, so continuing right past the pad falls off and
  // loses — an unambiguous "they actually kept moving" signal.
  const subArea = makeArea(12, 8, 6, [{ type: "basket-sub", x: 1, y: 5 }], 0, 6);
  const level = makeLevel(mainArea, { subArea });

  const client = await page.context().newCDPSession(page);
  await gotoApp(page);
  await startEditorWithLevel(page, level);

  // Throttle only once the level is loaded and about to be played — starving
  // the editor build too would just make the test slow for no added coverage.
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  await page.keyboard.down("ArrowRight");
  await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 30_000 }).toBe("sub");

  // The bug: having arrived in Sub, the player is teleported back to Main. Watch
  // for that directly rather than inferring it from the final outcome, which
  // came out "won" only some of the time even when the bounce did happen.
  const areasSeen = new Set<string>();
  const deadline = Date.now() + 20_000;
  let outcome = "playing";
  while (Date.now() < deadline && outcome === "playing") {
    areasSeen.add(await readSceneField<string>(page, "Play", "currentAreaKey"));
    outcome = await readSceneField<string>(page, "Play", "outcome");
  }
  await page.keyboard.up("ArrowRight");
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  expect([...areasSeen]).toEqual(["sub"]);
  expect(outcome).toBe("lost");
});
