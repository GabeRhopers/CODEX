import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import type { LevelData } from "../../src/level/LevelSchema";

/**
 * Asking for a second player before the level has finished loading.
 *
 * **A level is not ready when its screen appears.** PlayScene hands off to
 * `composeGroundTilesets` and builds the area in a callback, on a promise
 * bounded at ten seconds — so the console, the HUD and the `+ PLAYER 2` button
 * are all drawn and sitting there while `areaBuilt` is still false. `addPlayer`
 * cannot run before the area exists, and it used to simply return: the press
 * went nowhere, silently, for as long as the load took.
 *
 * That cost two unrelated tests in `coop.spec.ts` a failure under parallel load
 * that never reproduced afterwards — their helper waited a fixed 300ms and
 * pressed Enter once, and on a slow run the press landed early and vanished.
 * The dropped press was the bug; the flaky tests were the symptom.
 *
 * The same mistake as the key bindings in `soloInput`, from the other end: that
 * one read input too early, this one threw it away.
 *
 * **Why these reach into the scene rather than pressing a key.** The unbuilt
 * window is real but short on this path — in Test Play the tilesets are already
 * warm, and the build finishes in a microtask. Two attempts to race it from
 * outside failed for instructive reasons, both recorded here so nobody spends
 * the afternoon again:
 *
 *  - Pressing Enter the instant the scene goes active, even at 6x CPU
 *    throttling, arrives *after* the build — the precondition assertion caught
 *    that and refused to pass vacuously, which is the only reason it is known.
 *  - Dispatching a synthetic keydown from inside the page does not help either:
 *    Phaser's keyboard manager queues events and drains them on the next update
 *    step, by which time the build's microtask has long since run.
 *
 * So the press is made where the window is *guaranteed* rather than likely:
 * inside the scene's own `create` event, which fires on the synchronous stack
 * that started the build. That `players`, `outcome` and `areaBuilt` are read
 * the same way throughout this suite is the existing convention; that Enter and
 * the button both reach `addPlayer` is already covered by `coop.spec.ts` and
 * `coop-controllers.spec.ts`. What is left for this file is the queue itself.
 */

const LEVEL = (): LevelData =>
  makeLevel(
    makeArea(20, 12, 10, [
      { type: "player-spawn", x: 6, y: 9 },
      { type: "goal", x: 19, y: 2 },
    ]),
  );

const playerCount = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window.__debugGame!.scene.getScene("Play") as unknown as { players?: unknown[] }).players?.length ?? 0,
  );

const areaBuilt = (page: Page): Promise<boolean> =>
  page.evaluate(
    () => (window.__debugGame!.scene.getScene("Play") as unknown as { areaBuilt?: boolean }).areaBuilt === true,
  );

/**
 * Arms a listener on the Play scene's `create` event, then walks into Test Play
 * the ordinary way.
 *
 * Registered *before* the scene starts, which is not a style choice: a listener
 * added after `manager.start` misses the event. And Test Play rather than
 * starting "Play" directly, because a direct start throws a `drawImage` error
 * from the tileset compose that has nothing to do with this and would sit in
 * the log looking like it did.
 */
async function joinDuringCreate(page: Page): Promise<boolean> {
  await startEditorWithLevel(page, LEVEL());

  await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      events: { once(event: string, fn: () => void): void };
      areaBuilt?: boolean;
      addPlayer(): void;
    };
    (window as unknown as { __joinProbe?: { fired: boolean; built: boolean } }).__joinProbe = {
      fired: false,
      built: false,
    };
    scene.events.once("create", () => {
      const probe = (window as unknown as { __joinProbe: { fired: boolean; built: boolean } }).__joinProbe;
      probe.built = scene.areaBuilt === true;
      scene.addPlayer();
      probe.fired = true;
    });
  });

  await clickByText(page, "Editor", "Test Play (Space)");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __joinProbe: { fired: boolean } }).__joinProbe.fired), {
      timeout: 20_000,
    })
    .toBe(true);
  return page.evaluate(() => (window as unknown as { __joinProbe: { built: boolean } }).__joinProbe.built);
}

test("a join asked for while the level is still loading still happens", async ({ page }) => {
  test.slow();
  await gotoApp(page);

  const builtAtPress = await joinDuringCreate(page);

  // **The precondition, asserted rather than assumed.** If the area were
  // already built this would be checking the ordinary path and passing for the
  // wrong reason — which is exactly how the bug survived being "covered" by ten
  // co-op tests.
  expect(builtAtPress, "the level must still be loading, or this proves nothing").toBe(false);

  // And when the level does arrive, the request that was waiting is honoured.
  await expect.poll(() => areaBuilt(page), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => playerCount(page), { timeout: 10_000 }).toBe(2);
});

test("a level that loads normally is still one player until somebody asks", async ({ page }) => {
  test.slow();
  // The other half, and what would catch a flag left permanently set: the queue
  // must only ever fire for somebody who actually asked.
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");

  await expect.poll(() => areaBuilt(page), { timeout: 20_000 }).toBe(true);
  // An absence again: giving a join that should not exist every chance to
  // appear before asserting it did not.
  await page.waitForTimeout(600);

  expect(await playerCount(page)).toBe(1);
});

test("a join remembered in one run does not leak into the next", async ({ page }) => {
  test.slow();
  // The failure mode the flag introduces, and the reason it is cleared in
  // `init()`: Phaser reuses this scene instance across a Restart, so a request
  // outstanding when a run ends would otherwise hand the *next* run a second
  // player nobody asked for. Set directly, because the whole claim is about
  // what happens to that field across a restart.
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await expect.poll(() => areaBuilt(page), { timeout: 20_000 }).toBe(true);
  expect(await playerCount(page), "one player to begin with").toBe(1);

  await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      joinWhenReady: boolean;
      restart(): void;
    };
    scene.joinWhenReady = true;
    scene.restart();
  });

  await expect.poll(() => areaBuilt(page), { timeout: 20_000 }).toBe(true);
  // Settled, so a leaked join would have had every chance to appear.
  await page.waitForTimeout(600);

  expect(await playerCount(page), "the new run starts with one player").toBe(1);
});
