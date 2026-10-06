import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * The editor's keyboard, while you are playing on top of it.
 *
 * **Jumping restarted the level.** Test Play launches Play and pauses the
 * editor; pausing stops `update` and does nothing at all to Phaser's keyboard
 * plugin, which goes on delivering events to every scene that ever registered a
 * handler. The editor binds Space to Test Play — and Space is the jump key — so
 * every jump called `testPlay()` again, `scene.launch("Play")` re-ran `init()`
 * on the scene already playing, and the character reappeared at the Spawn
 * marker with fresh `stats` mid-arc.
 *
 * It reads exactly like "he won't jump forward any more", which is how it was
 * reported: he does jump, and then the level is rebuilt under him. A collected
 * Feather or Thunder Hat went with it.
 *
 * Present since the MVP commit and invisible for as long, because a tablet
 * plays with the on-screen D-pad and never sends a Space. Only a keyboard hits
 * it, and only in Test Play — a published game never starts the editor at all.
 *
 * Only Space. Ctrl+Z was the obvious second suspect and was measured rather
 * than assumed: painting a tile, test playing and pressing it leaves the edited
 * level at 21 tiles, unchanged. It does not leak, so there is no test for it
 * here — a test that passes with the fix removed is not a test. The fix is
 * still scene-wide, because what that guards against is the *next* binding.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 10, [
      { type: "player-spawn", x: 2, y: 9 },
      { type: "item-coin", x: 4, y: 9 },
      { type: "goal", x: 19, y: 2 },
    ]),
  );

const play = (page: Page) =>
  page.evaluate(() => {
    const s = window.__debugGame!.scene.getScene("Play") as unknown as {
      stats: { score: number };
      player: { x: number; y: number; body: { blocked: { down: boolean } } };
    };
    return { score: s.stats.score, x: Math.round(s.player.x), y: Math.round(s.player.y), grounded: s.player.body.blocked.down };
  });

async function testPlay(page: Page): Promise<void> {
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(
    () => (window.__debugGame!.scene.getScene("Play") as unknown as { areaBuilt?: boolean }).areaBuilt === true,
    undefined,
    { timeout: 20_000 },
  );
}

/**
 * Holds a key down until the game loop has certainly seen it.
 *
 * A hold measured in milliseconds is not a hold measured in frames. A key is
 * only observed on an update tick, and under a starved loop — software WebGL,
 * three shards sharing loaded CI runners — a wall-clock 80ms can span zero of
 * them, so the press never happens as far as the game is concerned. That is not
 * hypothetical: an 80ms hold here failed CI shard 3 on 2026-10-06, twice
 * including the retry, while passing in isolation locally. `loop.frame` is the
 * game's own count and the only thing that answers "has this been seen"; the
 * same counter is what waitForInputReady in support/coords.ts gates on.
 *
 * Two frames rather than one, so the key is down across a whole tick instead of
 * straddling the boundary of one.
 */
async function holdKeyForFrames(page: Page, key: string, frames = 2): Promise<void> {
  const start = await page.evaluate(() => window.__debugGame!.loop.frame);
  await page.keyboard.down(key);
  await page.waitForFunction((until) => window.__debugGame!.loop.frame > until, start + frames, { timeout: 10_000 });
  await page.keyboard.up(key);
}

/** Walks right onto the coin, so there is a piece of progress that a restart
 * would visibly throw away. */
async function takeTheCoin(page: Page): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => (await play(page)).score, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => (await play(page)).grounded, { timeout: 10_000 }).toBe(true);
}

test("jumping with Space does not restart the level", async ({ page }) => {
  test.slow();
  await testPlay(page);
  await takeTheCoin(page);
  const before = await play(page);

  // Held until the game itself says he left the ground, rather than for a fixed
  // number of milliseconds. This is one gesture doing two jobs, and both matter:
  // the hold cannot be too short to register (see holdKeyForFrames for why that
  // is not theoretical), and it **is the precondition** — if he never leaves the
  // ground, this times out here saying exactly that, instead of letting the
  // score check below pass vacuously over a jump that never happened.
  await page.keyboard.down("Space");
  await expect.poll(async () => (await play(page)).grounded, { timeout: 10_000 }).toBe(false);
  await page.keyboard.up("Space");

  // A second jump, mid-air, because that is the press the fault appears on — a
  // player jumping repeatedly, which is what anybody does. He is airborne right
  // now by the assertion above, so this press lands mid-arc by construction
  // rather than by waiting a guessed 200ms for it to.
  await holdKeyForFrames(page, "Space");

  // An absence, so a fixed wait is the tool: `scene.launch` is *queued* and
  // lands on a later scene-manager step, so asserting the instant he leaves the
  // ground passes whether or not a restart is already on its way. Measured: the
  // first version of this test did exactly that and survived its own mutation
  // check, which is the only reason the gap was found.
  await page.waitForTimeout(500);

  const after = await play(page);
  expect(after.score, "the coin is still collected — the level did not restart").toBe(before.score);
  expect(after.x, "and he is where he jumped from, not back at the Spawn marker").toBeGreaterThan(before.x - 8);
});
