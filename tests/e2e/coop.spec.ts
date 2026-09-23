import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { BOUNCE_TILE, LAVA_TILE, type LevelEntity } from "../../src/level/LevelSchema";

/**
 * Two people, one keyboard, one screen.
 *
 * The claim is not "a second sprite exists" — it is that two people can
 * actually play at once: move independently, be hurt independently, and carry
 * on when one of them goes down.
 *
 * **Independence is the assertion that matters**, and it is the one that is
 * easy to write so it passes for the wrong reason. A co-op test that drives
 * both characters with the same keys is testing nothing, so the assertions
 * below always check *both* positions, never just "somebody moved". That was
 * mutation-checked by giving player two the `arrows` scheme and confirming the
 * independence tests fail.
 *
 * Solo play is covered by the eighteen specs that came before this file. What
 * is asserted here about one player is only the handful of rules that co-op
 * could plausibly have broken — losing instantly on a fatal hit, and losing on
 * falling off the level.
 */

/**
 * The markers every level here needs.
 *
 * The Editor refuses Test Play without both a spawn and a goal, so the goal
 * cannot simply be left out — but a goal on the floor would end half these
 * tests by accident, since most of them work by holding a direction for a
 * couple of seconds. It is parked eight rows above the ground instead, where
 * nothing standing on the floor can reach it.
 */
const MARKERS = (): LevelEntity[] => [
  { type: "player-spawn", x: 3, y: 9 },
  { type: "goal", x: 19, y: 2 },
];

/** A flat level with a floor the full width, wide enough for two people to get
 * away from each other. */
const FLAT = () => makeLevel(makeArea(20, 12, 10, MARKERS()));

/** The same, but the floor stops at column 12 — so walking right for long
 * enough is a fall off the level. */
const WITH_A_PIT = () => makeLevel(makeArea(20, 12, 10, MARKERS(), 0, 12));

interface Character {
  x: number;
  y: number;
  visible: boolean;
  tint: number;
  velocityY: number;
}

/** Every character the scene currently has, in join order. Read off `players`
 * rather than the `player` getter, since the whole point here is the ones that
 * getter cannot see. */
async function characters(page: Page): Promise<Character[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      players?: {
        sprite: { x: number; y: number; visible: boolean; tintTopLeft: number; body: { velocity: { y: number } } };
      }[];
    };
    return (scene.players ?? []).map((p) => ({
      x: p.sprite.x,
      y: p.sprite.y,
      visible: p.sprite.visible,
      tint: p.sprite.tintTopLeft,
      velocityY: p.sprite.body.velocity.y,
    }));
  });
}

const outcome = (page: Page): Promise<string> =>
  page.evaluate(() => (window.__debugGame!.scene.getScene("Play") as unknown as { outcome: string }).outcome);

/**
 * Waits until the level is actually ready, rather than for a fixed moment.
 *
 * **A level is not finished loading when the scene goes active.** PlayScene
 * hands off to `composeGroundTilesets` and builds the area in a callback,
 * bounded at ten seconds — so `areaBuilt` is the only honest answer to "can I
 * drive this yet". This was `waitForTimeout(300)`, which is enough on an idle
 * machine and is not under load, and it cost two unrelated tests in this file
 * a failure nobody could reproduce afterwards.
 */
const waitForLevel = (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () => (window.__debugGame!.scene.getScene("Play") as unknown as { areaBuilt?: boolean }).areaBuilt === true,
    undefined,
    { timeout: 20_000 },
  );

/** Straight into Test Play on `level`. */
async function play(page: Page, level = FLAT()): Promise<void> {
  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await waitForLevel(page);
}

/** Test Play, then Enter. */
async function playTwo(page: Page, level = FLAT()): Promise<void> {
  await play(page, level);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await characters(page)).length, { timeout: 5_000 }).toBe(2);
  await page.waitForTimeout(200);
}

/** Holds several keys at once for `ms`, then lets them all go — two people
 * pressing their own keys at the same time is the entire subject of this file,
 * so nothing here presses one key and waits.
 *
 * Only for *short* holds, where the question is "did this move at all". For
 * anything that has to reach somewhere, use `holdUntil`. */
async function holdKeys(page: Page, keys: string[], ms: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

/**
 * Holds keys until something is true, then lets go.
 *
 * **Not a fixed duration**, and that is the whole point. The first version of
 * these tests held a direction for 2500ms and asserted afterwards, which was a
 * frame-rate race: measured, a character covers only ~30px in the first 250ms
 * of a run while the scene is still warming up, against ~100px once it is
 * going. A 2500ms hold was just barely enough on an idle machine and not enough
 * under two workers — the same class of bug TELEPORT_COOLDOWN_MS documents, and
 * it failed exactly the way that one did.
 *
 * Asking the question instead of timing it means these pass on a loaded CI box
 * and fail only when the behaviour is actually wrong.
 */
async function holdUntil(page: Page, keys: string[], done: () => Promise<boolean>, timeout = 15_000): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  try {
    await expect.poll(done, { timeout }).toBe(true);
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
  await page.waitForTimeout(120);
}

/** Whether the character at `index` is currently down (waiting to pop back). */
const isDown = (page: Page, index: number): Promise<boolean> =>
  page.evaluate(
    (i) => ((window.__debugGame!.scene.getScene("Play") as unknown as { players: { downUntil: number }[] }).players[i]?.downUntil ?? 0) > 0,
    index,
  );

test("Enter brings in a second character, in a colour you can tell apart", async ({ page }) => {
  test.slow();
  await play(page);

  expect(await characters(page), "one player until somebody asks for two").toHaveLength(1);

  await page.keyboard.press("Enter");
  await expect.poll(async () => (await characters(page)).length, { timeout: 5_000 }).toBe(2);

  const [one, two] = await characters(page);
  expect(one.visible && two.visible, "both are on screen — there is nowhere else to be").toBe(true);
  // The whole answer to "which one am I": player one is untinted and player
  // two is not. `tintTopLeft` reads 0xffffff for an untinted sprite, which is
  // exactly why player one's base tint is spelled `clearTint()` rather than a
  // white tint — see updateCharacterVisuals.
  expect(one.tint, "player one is untinted, as in a solo game").toBe(0xffffff);
  expect(two.tint, "player two wears a colour of its own").not.toBe(0xffffff);
  // Beside each other, not inside each other: two Arcade bodies on the same
  // pixel get shoved apart by the separation pass and one of them appears to
  // be flung. See SPAWN_SPACING_X.
  expect(Math.abs(one.x - two.x)).toBeGreaterThan(0);
});

test("a third Enter does nothing — there are two sets of keys, not three", async ({ page }) => {
  test.slow();
  await playTwo(page);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);

  expect(await characters(page)).toHaveLength(2);
});

test("the arrows drive one character and WASD the other, at the same time", async ({ page }) => {
  test.slow();
  await playTwo(page);
  const [startOne, startTwo] = await characters(page);

  // Opposite directions at once, which is the only way to tell two independent
  // characters from one character being driven by both sets of keys: if the
  // bindings were shared, left and right would cancel and *neither* would move.
  await holdKeys(page, ["ArrowRight", "KeyA"], 400);

  const [one, two] = await characters(page);
  expect(one.x, "the arrows moved player one right").toBeGreaterThan(startOne.x + 20);
  expect(two.x, "WASD moved player two left, at the same time").toBeLessThan(startTwo.x - 20);
});

test("W jumps player two without lifting player one", async ({ page }) => {
  test.slow();
  await playTwo(page);
  const before = await characters(page);
  expect(before[0].y, "both start on the floor").toBe(before[1].y);

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(160);
  const mid = await characters(page);
  await page.keyboard.up("KeyW");

  expect(mid[1].y, "player two is in the air").toBeLessThan(before[1].y - 10);
  expect(mid[0].y, "player one has not moved a pixel").toBe(before[0].y);
});

test("once two are playing, player one answers to the arrows and not to WASD", async ({ page }) => {
  test.slow();
  // The split happens at the moment of joining and not before — a solo game
  // keeps arrows *and* WASD, which is what the eighteen specs before this one
  // rely on. This is the other half of that: after joining, W must not lift
  // both of them, or the two people are fighting over one key.
  await playTwo(page);
  const before = await characters(page);

  await holdKeys(page, ["KeyD"], 400);

  const after = await characters(page);
  expect(after[1].x, "D still moves player two").toBeGreaterThan(before[1].x + 20);
  expect(after[0].x, "D no longer moves player one").toBe(before[0].x);
});

test("a fallen player comes back, and the run carries on without them", async ({ page }) => {
  test.slow();
  // A pit at the right-hand end, so walking into it is a fall off the level —
  // instant loss in a solo game, and the clearest way to put exactly one
  // character down.
  const level = WITH_A_PIT();
  await playTwo(page, level);

  // Only player two walks off the edge. Player one stays put — and the key is
  // released the moment player two is down, or they would simply walk off again
  // the instant they came back.
  await holdUntil(page, ["KeyD"], () => isDown(page, 1));

  expect(await outcome(page), "one down is not a loss when somebody is still up").toBe("playing");
  expect((await characters(page))[0].visible, "player one never left").toBe(true);

  await expect
    .poll(async () => (await characters(page))[1].visible, { timeout: 8_000 })
    .toBe(true);

  const [, two] = await characters(page);
  expect(two.x, "player two is back where this area starts people").toBeLessThan(400);
});

test("the run ends when both are down at once", async ({ page }) => {
  test.slow();
  const level = WITH_A_PIT();
  await playTwo(page, level);

  // Both walk off the same edge together. The second one to go is the one that
  // ends it — "everybody is down" is the whole rule.
  await holdUntil(page, ["ArrowRight", "KeyD"], async () => (await outcome(page)) === "lost");

  expect(await outcome(page)).toBe("lost");
});

test("solo still loses the instant it falls, with nobody to wait for", async ({ page }) => {
  test.slow();
  // The property the whole design rests on: with one player, "everybody is
  // down" is true the moment that player falls, so onLose fires exactly where
  // it always did. No respawn delay, no second chance.
  const level = WITH_A_PIT();
  await play(page, level);

  await holdUntil(page, ["ArrowRight"], async () => (await outcome(page)) === "lost");

  expect(await outcome(page)).toBe("lost");
  expect(await characters(page), "and there is still only one of them").toHaveLength(1);
});

test("a bounce block launches whoever stood on it", async ({ page }) => {
  test.slow();
  // **The bug this refactor was always going to surface.** `onGroundCollide`
  // was handed the colliding sprite and threw it away, bouncing the scene's
  // one player instead — invisible with one character, and with two it means
  // player two landing on a pad launches player one across the level.
  //
  // Fails before the fix: player one's velocity goes sharply negative while
  // player two stays flat on the floor.
  const level = FLAT();
  const ground = level.layers.ground;
  // A bounce pad well to the right of the spawn, in the floor row, so the only
  // way onto it is to walk there.
  for (let x = 10; x <= 12; x += 1) ground[10][x] = BOUNCE_TILE;
  await playTwo(page, level);

  const before = await characters(page);
  // Only player two walks. Player one is not touching a key, so anything that
  // happens to player one here happened because somebody else's collision was
  // applied to them.
  let airborne = before;
  await holdUntil(page, ["KeyD"], async () => {
    airborne = await characters(page);
    return airborne[1].y < before[1].y - 20;
  });

  expect(airborne[1].y, "player two — who stood on it — went up").toBeLessThan(before[1].y - 20);
  expect(airborne[0].y, "player one, who never moved, stayed on the floor").toBe(before[0].y);
});

test("lava takes down whoever walked into it, and only them", async ({ page }) => {
  test.slow();
  // `takeHit` takes the character who was hurt, the same way `onGroundCollide`
  // takes the character who landed. Hearts and the shock cooldown are one
  // shared pool on purpose — but *going down* is not poolable, and a hazard
  // that knocked out the wrong person would be the same bug the bounce block
  // had, on a different code path.
  //
  // Lava replaces the floor for three tiles, as in skin-ground.spec.ts, so
  // walking right is walking into it.
  const level = FLAT();
  const ground = level.layers.ground;
  for (let x = 8; x <= 10; x += 1) ground[10][x] = LAVA_TILE;
  await playTwo(page, level);

  await holdUntil(page, ["KeyD"], () => isDown(page, 1));

  expect(await isDown(page, 0), "player one was standing still on solid grass").toBe(false);
  expect(await outcome(page), "and the run goes on, because one of them is still up").toBe("playing");
});
