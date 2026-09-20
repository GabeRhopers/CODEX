import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * The character now shows a different pose for different situations, driven
 * by src/gameplay/characterState.ts on top of the five sprites the character
 * already had. These assert the situations a player actually sees — plus the
 * one guarantee that matters more than any of them: a pose can never move the
 * hitbox.
 */

// Every test here drives the character through real physics — walking a
// distance, falling off a ledge — and the headless browser renders through
// software WebGL, so the game loop runs behind wall-clock under sustained
// suite load. Passing in isolation but timing out in a full run is exactly
// that, not a product fault (the failing screenshot showed "You Lose"
// already on screen, just later than a 5s poll allowed). Generous ceilings
// here cost nothing when things are fast.
test.describe.configure({ timeout: 90_000 });

const OUTCOME_TIMEOUT = 25_000;

interface PlayerVisuals {
  texture: string;
  angle: number;
  tinted: boolean;
  tintTopLeft: number;
  bodyWidth: number;
  bodyHeight: number;
  outcome: string;
}

async function readPlayer(page: Page): Promise<PlayerVisuals> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      player: {
        texture: { key: string };
        angle: number;
        isTinted: boolean;
        tintTopLeft: number;
        body: { width: number; height: number };
      };
      outcome: string;
    };
    const p = scene.player;
    return {
      texture: p.texture.key,
      angle: p.angle,
      tinted: p.isTinted,
      tintTopLeft: p.tintTopLeft,
      bodyWidth: p.body.width,
      bodyHeight: p.body.height,
      outcome: scene.outcome,
    };
  });
}

/** Records, from inside the page and on every rendered frame, whether the
 * character ever struck the cast pose while the run was still in progress —
 * the only reliable way to observe a sub-half-second transient, since
 * anything polled from the test side samples on its own schedule and can
 * step straight over it. */
async function startCastPoseLatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const flag = window as unknown as { __sawCastPose?: boolean };
    flag.__sawCastPose = false;
    const tick = (): void => {
      const scene = window.__debugGame?.scene.getScene("Play") as unknown as
        | { player?: { texture: { key: string } }; outcome?: string }
        | undefined;
      if (scene?.player?.texture.key === "wizard-cast" && scene.outcome === "playing") {
        flag.__sawCastPose = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function sawCastPose(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __sawCastPose?: boolean }).__sawCastPose === true);
}

/**
 * Every colour the character wears, recorded per frame from inside the page.
 *
 * The same reasoning as `startCastPoseLatch` above, applied to the one test
 * that was still polling for a transient from the test side. `HURT_FLASH_MS`
 * is 220ms, and a poll from here samples over a round trip into the browser:
 * on a loaded machine two samples can straddle the whole red window and land
 * either side of it, in the much longer cyan grace period that follows. That
 * is not a hypothetical — it is how this test failed on CI on 2026-09-20,
 * reporting the shield cyan as though the flash had never happened.
 *
 * The game itself was measured innocent before this was changed: at 6x CPU
 * throttling it still shows the red on every run. What was wrong was the
 * observer, so the observer is what moved — and a set of every colour actually
 * worn is a *stronger* claim than one lucky sample, because it can assert the
 * red and the cyan were both shown and were different.
 */
async function startTintLatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = new Set<number>();
    (window as unknown as { __tints?: Set<number> }).__tints = seen;
    const tick = (): void => {
      const scene = window.__debugGame?.scene.getScene("Play") as unknown as
        | { player?: { tintTopLeft: number } }
        | undefined;
      if (scene?.player) seen.add(scene.player.tintTopLeft);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function tintsSeen(page: Page): Promise<number[]> {
  return page.evaluate(() => [...((window as unknown as { __tints?: Set<number> }).__tints ?? [])]);
}

async function testPlay(page: Page): Promise<void> {
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
}

test("losing gives the character a distinct slumped pose instead of freezing mid-stride", async ({ page }) => {
  // Ground stops at x=6, so walking right runs off a cliff — an
  // unconditional loss (see PlayScene's fall-off check in update()).
  const level = makeLevel(
    makeArea(
      14,
      8,
      6,
      [
        { type: "player-spawn", x: 1, y: 5 },
        { type: "goal", x: 12, y: 5 },
      ],
      0,
      6,
    ),
  );

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await testPlay(page);

  await page.keyboard.down("ArrowRight");
  // Mid-run: walking, upright, untinted.
  await expect.poll(async () => (await readPlayer(page)).texture, { timeout: OUTCOME_TIMEOUT }).toMatch(/wizard-walk[12]/);
  const running = await readPlayer(page);
  expect(running.angle).toBe(0);

  await expect.poll(async () => (await readPlayer(page)).outcome, { timeout: OUTCOME_TIMEOUT }).toBe("lost");
  await page.keyboard.up("ArrowRight");

  const lost = await readPlayer(page);
  // Before this change the character simply froze in whatever frame they
  // happened to be in, with no tint and no tilt — all three now differ.
  expect(lost.texture).toBe("wizard-idle");
  expect(lost.tinted).toBe(true);
  expect(Math.abs(lost.angle)).toBeGreaterThan(0);

  // The guarantee that protects the 2026-08-19 gravity retune: Arcade bodies
  // stay axis-aligned, so a tilted pose must not have resized the hitbox.
  expect(lost.bodyWidth).toBe(22);
  expect(lost.bodyHeight).toBe(40);
});

test("winning shows the celebratory pose, upright and untinted", async ({ page }) => {
  const level = makeLevel(
    makeArea(12, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 6, y: 5 },
    ]),
  );

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await testPlay(page);

  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => (await readPlayer(page)).outcome, { timeout: OUTCOME_TIMEOUT }).toBe("won");
  await page.keyboard.up("ArrowRight");

  const won = await readPlayer(page);
  expect(won.texture).toBe("wizard-cast");
  expect(won.angle).toBe(0);
  expect(won.bodyWidth).toBe(22);
  expect(won.bodyHeight).toBe(40);
});

test("collecting a power-up flashes the cast pose; a coin does not", async ({ page }) => {
  // Deliberately a long run-up to the goal. Winning also shows the cast
  // frame (it's the victory pose), so a short level would let the player
  // reach the goal mid-assertion and make a *win* look like a stuck
  // power-up flash — which is exactly what the first draft of this test
  // did. 30+ tiles of clearance keeps the two situations distinguishable.
  const level = makeLevel(
    makeArea(40, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 38, y: 5 },
      { type: "item-coin", x: 3, y: 5 },
      { type: "item-speed", x: 6, y: 5 },
    ]),
  );

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await testPlay(page);

  // The flash is ~260ms — far too brief to catch reliably by polling from
  // the test side, which samples on its own cadence and will happily step
  // right over it (it did, twice, while this test was being written). Latch
  // it inside the page on requestAnimationFrame instead: every rendered
  // frame is checked, so a quarter-second pose can't be missed. Gated on
  // `outcome === "playing"` so the *win* pose — which is also the cast
  // frame — can never produce a false positive.
  await startCastPoseLatch(page);

  await page.keyboard.down("ArrowRight");

  // The coin should raise the score without ever triggering the pose.
  await expect
    .poll(async () => readSceneField<{ score: number }>(page, "Play", "stats").then((s) => s.score), { timeout: OUTCOME_TIMEOUT })
    .toBe(1);
  expect(await sawCastPose(page)).toBe(false);

  // The Speed Potion should — and should actually apply its buff.
  await expect.poll(() => sawCastPose(page), { timeout: OUTCOME_TIMEOUT }).toBe(true);
  await expect
    .poll(async () => readSceneField<{ speedBoostUntil: number }>(page, "Play", "stats").then((s) => s.speedBoostUntil), { timeout: 2000 })
    .toBeGreaterThan(0);
  await page.keyboard.up("ArrowRight");

  // And it's a flash, not a stuck pose — it resolves back to a normal frame
  // while the run is still going.
  await expect
    .poll(async () => {
      const p = await readPlayer(page);
      return `${p.outcome}:${p.texture === "wizard-cast" ? "cast" : "other"}`;
    }, { timeout: 3000 })
    .toBe("playing:other");

  const after = await readPlayer(page);
  expect(after.bodyWidth).toBe(22);
  expect(after.bodyHeight).toBe(40);
});

test("a survived hit flashes a different colour than a Shield", async ({ page }) => {
  const level = makeLevel(
    makeArea(16, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 15, y: 5 },
      { type: "item-heart", x: 3, y: 5 },
      { type: "enemy-spike", x: 7, y: 5 },
    ]),
  );

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await testPlay(page);
  // Before anything moves: the flash is 220ms and must be watched from inside
  // the page, not sampled from out here. See startTintLatch.
  await startTintLatch(page);

  await page.keyboard.down("ArrowRight");
  // Bank the heart so the spike is survivable rather than instantly fatal.
  await expect
    .poll(async () => readSceneField<{ extraHits: number }>(page, "Play", "stats").then((s) => s.extraHits), { timeout: OUTCOME_TIMEOUT })
    .toBe(1);

  const HURT_TINT = 0xff6b6b;
  const SHIELD_TINT = 0x66e0ff;

  // The bug this closes: an absorbed hit only set invincibleUntil, so being
  // hurt showed the *same* cyan as holding a Shield for over a second. So the
  // claim is not "red appeared" on its own — it is that **both** colours were
  // worn and they were different, which is the thing a player would notice and
  // the thing the old behaviour could not do.
  await expect
    .poll(() => tintsSeen(page), { timeout: OUTCOME_TIMEOUT, intervals: [100] })
    .toContain(HURT_TINT);
  await page.keyboard.up("ArrowRight");

  expect(await tintsSeen(page), "the post-hit grace period should still be cyan").toContain(SHIELD_TINT);
  expect(HURT_TINT).not.toBe(SHIELD_TINT);

  const after = await readPlayer(page);
  expect(after.outcome).toBe("playing");
  expect(after.bodyWidth).toBe(22);
  expect(after.bodyHeight).toBe(40);

  // Once the flash ends the ordinary invincibility tint takes over for the
  // rest of the grace period — the two states are now distinguishable.
  await expect
    .poll(async () => (await readPlayer(page)).tintTopLeft, { timeout: 3000, intervals: [40] })
    .toBe(SHIELD_TINT);
});
