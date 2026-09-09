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
async function playToTheGoal(page: Page, attempts = 4, seconds = 16): Promise<boolean> {
  const outcome = () =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
      return scene.outcome ?? "";
    });

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await page.keyboard.press("R");
      await page.waitForTimeout(600);
    }
    await page.keyboard.down("ArrowRight");
    try {
      for (let i = 0; i < seconds * 2; i++) {
        const now = await outcome();
        if (now === "won") return true;
        if (now === "lost") break;
        // Deliberately out of step with the half-second poll above, so repeated
        // attempts do not all meet the ghost at the same point in its patrol.
        await page.keyboard.press("Space");
        await page.waitForTimeout(370 + attempt * 90);
      }
    } finally {
      await page.keyboard.up("ArrowRight");
    }
    if ((await outcome()) === "won") return true;
  }
  return false;
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
      const won = await playToTheGoal(page);
      await shot(page, `05-level-${level + 1}-moving`);
      // eslint-disable-next-line no-console -- this spec exists to be read
      console.log(`${game.slug} level ${level + 1}: ${won ? "finished it" : "died before the goal"}`);

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
