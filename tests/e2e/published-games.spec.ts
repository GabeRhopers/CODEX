import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleProblems, gameSlug, type GameBundle } from "../../src/game/gameBundle";
import { EMPTY_TILE } from "../../src/level/LevelSchema";

/**
 * The games actually published on this site still work.
 *
 * `public/games/` is the first thing this repo ships that is **content rather
 * than code**: a bundle exported by the editor, committed, and served to
 * whoever opens its link. Nothing else in the suite looks at it, so a schema
 * change that quietly stopped an already-published game from loading would be
 * discovered by a relative on a sofa rather than by CI.
 *
 * Deliberately a *file* test with no browser: what is being checked is that the
 * committed JSON still satisfies the rules the app will apply to it, and the
 * rules (`bundleProblems`, `gameSlug`) are pure. `published-game.spec.ts` is
 * where a bundle gets played in a real page; this is the cheap guard that runs
 * whether or not anyone remembers to.
 */

// Resolved from this module's own URL, not `__dirname` (undefined — the package
// is "type": "module") and not process.cwd() (whatever the runner happened to
// start in).
const GAMES_DIR = fileURLToPath(new URL("../../public/games/", import.meta.url));

function publishedGames(): string[] {
  return readdirSync(GAMES_DIR).filter((name) => name.endsWith(".json"));
}

test("every published game is complete and reachable at its own link", () => {
  const files = publishedGames();
  // Not an empty-directory pass: if the demo game ever vanishes from the build,
  // that is worth failing over rather than quietly reporting success on zero
  // files.
  expect(files.length, "public/games/ should carry at least the demo game").toBeGreaterThan(0);

  for (const file of files) {
    const bundle = JSON.parse(readFileSync(join(GAMES_DIR, file), "utf8")) as GameBundle;

    // Nothing dangling: every world, level, picture and invented thing the game
    // names is actually inside the file.
    expect(bundleProblems(bundle), `${file} has dangling references`).toEqual([]);

    // The filename *is* the ?game= value, so a rename that broke that would
    // leave a file present and a link dead — see publishedBundle.ts.
    expect(file, "filename must match the slug its title produces").toBe(`${gameSlug(bundle.game.title)}.json`);

    // A published game with no worlds is a title screen and nothing else.
    expect(bundle.game.worldIds.length, `${file} has no worlds`).toBeGreaterThan(0);
    expect(bundle.worlds.length).toBe(bundle.game.worldIds.length);
    expect(bundle.levels.length, `${file} has no levels`).toBeGreaterThan(0);

    // Every level is finishable in the only sense a file can be checked for:
    // there is a goal, there is a spawn, and neither is hanging in mid-air.
    // Not what caught the first demo — its goal did sit on its slab — but the
    // same family of defect, and cheap.
    for (const level of bundle.levels) {
      const ground = level.layers.ground;
      const solid = (x: number, y: number): boolean =>
        y >= 0 && y < ground.length && x >= 0 && x < ground[y].length && ground[y][x] !== EMPTY_TILE;
      const where = `${file}: "${level.name}"`;

      for (const type of ["player-spawn", "goal"] as const) {
        const marker = level.entities.find((entity) => entity.type === type);
        expect(marker, `${where} has no ${type}`).toBeDefined();
        expect(
          solid(marker!.x, marker!.y + 1),
          `${where}: the ${type} at (${marker!.x}, ${marker!.y}) has nothing under it`,
        ).toBe(true);
      }

      // **This is the one that would have caught the first demo.** All three of
      // its levels were 20 tiles — 640px against a 1050px canvas — so the whole
      // level was visible from the spawn point, including the void past its
      // right-hand edge, and nothing scrolled. They were also a single row of
      // ground with nothing under it, which no file check can call wrong on its
      // own (a floating platform is a legitimate thing to build); the width is
      // the proxy that fails on a level nobody walked through before shipping.
      expect(level.width, `${where} is only ${level.width} tiles — it fits on one screen`).toBeGreaterThan(33);
    }
  }
});
