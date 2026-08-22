import { expect, test } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Priority Matrix, "01 · TEST NEXT": checkpoint restart reopening in its
 * own area (Tier 2, Core gameplay loop) — a checkpoint touched in Sub
 * must still be respected after a loss + Restart, reopening PlayScene
 * directly in Sub rather than defaulting back to Main's own Spawn.
 *
 * Known gameplay issue this spec can trip over on a badly loaded machine,
 * recorded here because it is real and not a test artifact: a teleport
 * lands the player standing on the paired basket (arriving in Sub at
 * x=248, with Sub's basket at x=238), and TELEPORT_COOLDOWN_MS gives them
 * 500ms of game time to walk clear of it. Normally they cover ~100px in
 * that window and are long gone. If the loop stalls hard enough that they
 * are still overlapping when the cooldown lapses, the basket fires again
 * and sends them straight back — traced once in five runs under load:
 * Sub at game-time 9010ms, back in Main by 9410ms. Holding a direction
 * through a teleport can therefore bounce a real player back and forth.
 * Worth fixing in PlayScene (the cooldown should arguably not re-arm
 * while the player has never left the zone), but that is a gameplay
 * change with its own verification, not something to smuggle into a test.
 */

test("restarting after a checkpoint touched in Sub reopens in Sub, not Main", async ({ page }) => {
  const mainArea = makeArea(10, 8, 6, [
    { type: "player-spawn", x: 1, y: 5 },
    { type: "goal", x: 8, y: 5 },
    { type: "basket-sub", x: 3, y: 5 },
  ]);
  // Ground only spans x=0..6 — past the checkpoint at x=4 there's a cliff
  // (x=7+ is open air), so walking past it falls off and loses.
  const subArea = makeArea(
    12,
    8,
    6,
    [
      { type: "basket-sub", x: 1, y: 5 },
      { type: "checkpoint", x: 4, y: 5 },
    ],
    0,
    6,
  );
  const level = makeLevel(mainArea, { subArea });

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // Walk onto the Main basket to reach Sub.
  //
  // The generous timeouts here are wall-clock, but everything being waited
  // on is measured in *game* time, and the two only track each other on an
  // unloaded machine. Under software WebGL — CI always, a busy dev box
  // sometimes — the loop falls behind, so a walk that takes ~2s of game
  // time can take well over 5s of wall clock. Traced it: the same walk
  // measured 1.8s wall when the box was idle and over 6s when it was not.
  // This is headroom for a slow clock, not a slackened assertion; the
  // outcome asserted below is still exactly "lost".
  await expect.poll(() => readSceneField<string>(page, "Play", "currentAreaKey"), { timeout: 15_000 }).toBe("sub");

  // Keep walking right through the checkpoint (x=4) and off the cliff
  // past x=6 — falling off is an unconditional loss (see PlayScene's
  // fall-off-bottom check in update()).
  await expect.poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 15_000 }).toBe("lost");
  await page.keyboard.up("ArrowRight");

  // Restart — PlayScene.restart() carries `this.checkpoint` (set by
  // activateCheckpoint while touching the Sub checkpoint bell above)
  // through scene.restart(), and create() resolves the starting area from
  // it ahead of Spawn's own area.
  await page.keyboard.press("r");
  await expect.poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 15_000 }).toBe("playing");

  expect(await readSceneField<string>(page, "Play", "currentAreaKey")).toBe("sub");
});
