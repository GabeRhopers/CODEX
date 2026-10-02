import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForGame } from "./support/coords";

/**
 * Play every shipped game the way somebody who was sent the link plays it.
 *
 * A developer aid — it screenshots each stage so they can be looked at. Every
 * visible bug this project has had was found this way rather than by an
 * assertion: the World Map that was a murky rectangle, the cut-scene panels
 * hunched at the bottom of an empty screen, the demo whose levels were all
 * floating slabs, the player who walked off the right of a level and was never
 * seen again. None of those broke a test, because none of them were wrong —
 * they were just bad.
 *
 * `?game=` boots straight into the published bundle with no editor and no
 * sign-in (see publishedBundle.ts), which is exactly what the audience gets.
 *
 * One test per file in `public/games/`, rather than one hardcoded slug: a
 * second game was published on 2026-09-09 and the version of this that named
 * the first would have gone on screenshotting the first, forever, while looking
 * like it covered what shipped.
 */

const GAMES_DIR = fileURLToPath(new URL("../../public/games/", import.meta.url));

/** Slug and level count for each published game — the slug is the filename, by
 * the convention publishedBundle.ts reads and published-games.spec.ts asserts. */
function publishedGames(): { slug: string; levels: number }[] {
  return readdirSync(GAMES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      slug: name.replace(/\.json$/, ""),
      levels: (JSON.parse(readFileSync(join(GAMES_DIR, name), "utf8")) as { levels: unknown[] }).levels.length,
    }));
}

const active = (page: Page, key: string): Promise<boolean> =>
  page.evaluate((k) => window.__debugGame!.scene.isActive(k), key);

function shotter(slug: string) {
  return async (page: Page, name: string): Promise<void> => {
    // Letting the scene settle before photographing it. Nothing is asserted on
    // the result, so there is no race to lose.
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/play-${slug}-${name}.png` });
  };
}

/**
 * Holds Right and jumps until the goal is reached, dying as often as it takes.
 *
 * Returns whether the level was actually finished — the one fact about a level
 * that a screenshot cannot show, and the only way this file can tell "a lovely
 * meadow" from "a lovely meadow with no way through it".
 *
 * The retries are the point rather than a workaround. Jumping on a fixed timer
 * against a patrolling ghost is luck, and losing is the correct outcome of
 * walking into one; a run that gave up after the first death would report a
 * perfectly fair level as impassable. `R` is restart, straight off PlayScene's
 * own lose screen.
 */
/**
 * How far the best of four attempts must get before this file calls a level
 * passable — a fraction of the distance from the Spawn marker to the Goal.
 *
 * **A floor, deliberately not a win.** Asserting the win would be red today on
 * two perfectly fair levels: `playToTheGoal` holds Right and jumps on a fixed
 * timer, and `enemy-ghost` is stompable, so getting past one is luck rather
 * than something the level owes the player. What this catches instead is the
 * failure no screenshot and no log line would ever make somebody notice — a
 * level that cannot be *left*: walled in at the spawn, no ground under it, the
 * goal sealed behind blocks. Those give a progress near zero.
 *
 * Measured 2026-10-02, twelve runs across the five shipped levels:
 *
 *   | level                        | best-of-four, per run |
 *   |------------------------------|-----------------------|
 *   | grampa-and-the-lost-sheep 1  | 42, 99, 99, 99        |
 *   | grampa-and-the-lost-sheep 2  | 57, 58, 86, 87        |
 *   | grampa-and-the-lost-sheep 3  | 53, 56, 99, 99        |
 *   | grumble-bug-goes-walking 1   | 55, 55, 55, 55        |
 *   | grumble-bug-goes-walking 2   | 100, 100, 100, 100    |
 *
 * The spread on a single level runs 42 to 99, which is the whole argument for a
 * generous floor: 20 sits twenty-two points under the worst of twelve. A flaky
 * assertion here would be worse than none, because the next person would delete
 * it rather than read it.
 */
const MIN_PROGRESS = 0.2;

/**
 * Where the goal is, and where the player is, in world pixels.
 *
 * `LevelData extends LevelArea`, so the scene's own level carries the main
 * area's entities directly. Converted to world space exactly as `enterArea`
 * does, so "how far across is he" is measured against the same grid the level
 * was built on.
 */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const TILE = 32;
    const ORIGIN_X = 230; // GRID_ORIGIN_X
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      level: { entities: { type: string; x: number }[] };
      currentAreaKey: string;
      player?: { x: number };
    };
    const at = (type: string) => scene.level.entities.find((e) => e.type === type);
    const goal = at("goal");
    const spawn = at("player-spawn");
    return {
      goalX: goal ? ORIGIN_X + goal.x * TILE + TILE / 2 : null,
      spawnX: spawn ? ORIGIN_X + spawn.x * TILE + TILE / 2 : null,
      playerX: scene.player?.x ?? null,
      area: scene.currentAreaKey,
    };
  });

/** How far the best attempt got, as a fraction of the distance from the Spawn
 * marker to the Goal. 1 means he stood on it; 0 means he never left. */
export interface Run {
  won: boolean;
  progress: number;
}

/**
 * Holds Right and jumps until the goal is reached, dying as often as it takes.
 *
 * Returns whether the level was finished **and how far the best attempt got** —
 * the first is the honest account of whether a clumsy player could do it, the
 * second is the only part worth asserting. See MIN_PROGRESS.
 *
 * The retries are the point rather than a workaround. Jumping on a fixed timer
 * against a patrolling ghost is luck, and losing is the correct outcome of
 * walking into one; a run that gave up after the first death would report a
 * perfectly fair level as impassable. `R` is restart, straight off PlayScene's
 * own lose screen.
 */
async function playToTheGoal(page: Page, attempts = 4, seconds = 16): Promise<Run> {
  const outcome = () =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
      return scene.outcome ?? "";
    });

  const start = await geometry(page);
  // No goal, or no spawn, means there is nothing to measure against. The editor
  // refuses to launch a level missing either (see EditorScene.testPlay), so this
  // is unreachable from a published bundle; returning 1 keeps a hypothetical
  // one from failing on a measurement that was never taken.
  const measurable = start.goalX !== null && start.spawnX !== null;
  const span = measurable ? Math.abs(start.spawnX! - start.goalX!) : 0;
  let best = 0;

  /** Closest approach so far, as a fraction of the distance he started at. */
  const note = async (): Promise<void> => {
    if (!measurable || span === 0) return;
    const now = await geometry(page);
    // Leaving the starting area is a basket teleport — he went through a door,
    // which is conclusive proof he was not walled in, and the goal he is being
    // measured against may not even be in this area any more.
    if (now.area !== start.area) {
      best = 1;
      return;
    }
    if (now.playerX === null) return;
    best = Math.max(best, 1 - Math.abs(now.playerX - start.goalX!) / span);
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await page.keyboard.press("R");
      // A settle before driving again, not before asserting: Restart rebuilds
      // the scene asynchronously, and if this is short the attempt simply
      // fails and the loop takes another.
      await page.waitForTimeout(600);
    }
    await page.keyboard.down("ArrowRight");
    try {
      for (let i = 0; i < seconds * 2; i++) {
        await note();
        const now = await outcome();
        if (now === "won") return { won: true, progress: 1 };
        if (now === "lost") break;
        // Deliberately out of step with the half-second poll above, so repeated
        // attempts do not all meet the ghost at the same point in its patrol.
        await page.keyboard.press("Space");
        await page.waitForTimeout(370 + attempt * 90);
      }
    } finally {
      await page.keyboard.up("ArrowRight");
    }
    if ((await outcome()) === "won") return { won: true, progress: 1 };
  }
  return { won: false, progress: measurable ? best : 1 };
}

for (const game of publishedGames())
  test(`play "${game.slug}" from its link`, async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    const shot = shotter(game.slug);

    await page.goto(`/?game=${game.slug}`);
    await waitForGame(page);

    // Title screen: no editor, no sign-in.
    await expect.poll(() => active(page, "GameTitle"), { timeout: 20_000 }).toBe(true);
    await shot(page, "01-title");

    // Play ▶ runs the opening cut scene before the first world.
    await page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("GameTitle") as unknown as { children: { list: unknown[] } };
      type T = { type?: string; text?: string; emit?: (e: string) => void };
      const play = (scene.children.list as T[]).find((c) => c.type === "Text" && /play/i.test(c.text ?? ""));
      play?.emit?.("pointerdown");
    });
    await expect.poll(() => active(page, "CutScene"), { timeout: 20_000 }).toBe(true);
    await shot(page, "02-opening-cutscene");

    // Skip straight through; the panels themselves are what the shot is for.
    for (let i = 0; i < 6 && (await active(page, "CutScene")); i++) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(400);
    }

    await expect.poll(() => active(page, "WorldMap"), { timeout: 20_000 }).toBe(true);
    await shot(page, "03-world-map");

    // Each level, entered from the map and screenshotted at its spawn.
    for (let level = 0; level < game.levels; level++) {
      const entered = await page.evaluate((i) => {
        const scene = window.__debugGame!.scene.getScene("WorldMap") as unknown as { children: { list: unknown[] } };
        type Node = { type?: string; radius?: number; x?: number; input?: { enabled?: boolean }; emit?: (e: string) => void };
        const nodes = (scene.children.list as Node[])
          .filter((c) => c.type === "Arc" && c.radius === 18)
          .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const node = nodes[i];
        if (!node?.input?.enabled) return false;
        node.emit?.("pointerdown");
        return true;
      }, level);
      if (!entered) break; // later levels stay locked until the one before is beaten

      await expect.poll(() => active(page, "Play"), { timeout: 30_000 }).toBe(true);
      await shot(page, `04-level-${level + 1}`);

      // Right, and jump. Holding Right alone is not playing: the player is about
      // a tile and a half tall, so a platform on the row above the ground is a
      // wall at head height rather than a ceiling to stroll under, and every
      // staircase in this game opens with one. A run that only walked stopped
      // dead at the first step and screenshotted the same six feet of meadow
      // whatever the level was.
      //
      // Jumping on a timer, deliberately, rather than jumping when blocked: this
      // is meant to be a clumsy player, and a clumsy player is what finds out
      // whether a level can be finished by somebody who is not its author. It
      // does overshoot — a jump carried over the goal in the first run of this,
      // which is why the loop keeps going rather than reading the outcome once.
      const run = await playToTheGoal(page);
      await shot(page, `05-level-${level + 1}-moving`);
      // eslint-disable-next-line no-console -- this spec exists to be read
      console.log(
        `${game.slug} level ${level + 1}: ${run.won ? "finished it" : "died before the goal"}` +
          ` (got ${Math.round(run.progress * 100)}% of the way)`,
      );

      // **The one thing asserted about playing.** Not that he won — see
      // MIN_PROGRESS — but that the level could be travelled at all.
      expect(
        run.progress,
        `${game.slug} level ${level + 1} could not be travelled: the best of four attempts got ` +
          `${Math.round(run.progress * 100)}% of the way from the Spawn marker to the Goal. ` +
          `Dying to an enemy is fine and expected; this is about a level that cannot be left.`,
      ).toBeGreaterThanOrEqual(MIN_PROGRESS);

      // Unlocked by hand, whether or not it was won, because this file's job is
      // to *look at* every level and later nodes stay locked until the one before
      // is beaten. Deliberately separate from the line above: banking progress is
      // how the screenshots get taken, and the log line is the honest account of
      // whether a clumsy player could actually get through. A level with a ghost
      // patrolling the only path reliably kills this one, which is the level
      // working rather than the level being wrong.
      await page.evaluate((i) => {
        const scene = window.__debugGame!.scene.getScene("Play") as unknown as { world?: { worldId?: string } };
        const worldId = scene.world?.worldId;
        if (!worldId) return undefined;
        return import("/src/world/worldProgress.ts").then((m) => {
          (m as { recordCompletion(id: string, index: number): void }).recordCompletion(worldId, i);
        });
      }, level);

      // Esc, not `scene.start("WorldMap")`. This file used to do the latter with
      // `worldId: undefined`, which drew a map saying "That world could not be
      // loaded" on top of the still-running level — so the node lookup found
      // nothing, the loop broke, and every run of this aid since it was written
      // screenshotted level one and stopped. Esc is the way back PlayScene itself
      // offers, and it carries the world (and the game) with it.
      await page.keyboard.press("Escape");
      await expect.poll(() => active(page, "WorldMap"), { timeout: 20_000 }).toBe(true);
      await page.waitForTimeout(600);
    }

    await shot(page, "06-end");
  });
