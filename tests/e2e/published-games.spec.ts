import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleProblems, gameSlug, type GameBundle } from "../../src/game/gameBundle";
import { GRID_COLS, GRID_ROWS } from "../../src/config/gameConfig";
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

      // **This assertion used to say the opposite, and the opposite was wrong.**
      //
      // It demanded `width > 33`, on the reasoning that a 20-tile level "fits on
      // one screen" and therefore showed the void past its own right-hand edge.
      // The first half was right and the conclusion was backwards: this game has
      // no scrolling camera. `PlayScene` never calls `startFollow` and never
      // moves `scrollX` — see ParallaxBackground's docstring, which says in as
      // many words that camera-follow is deferred, and HandheldShell's, which
      // depends on it ("every level the app can produce is exactly GRID_COLS
      // wide"). The console's screen *is* the viewport, permanently.
      //
      // So the old guard required exactly the shape the renderer cannot show,
      // and the hand-written demo obeyed it: three levels 40, 44 and 48 tiles
      // wide with their goals at tiles 37, 40 and 42. Walking the game on
      // 2026-09-09 found the player invisible from tile 20 onward — teleported
      // to the goal he triggered "Level Complete!" without the view ever moving.
      // The one link this project has shipped was played blind for two thirds of
      // every level, and no test said a word, because the test is what asked
      // for it.
      //
      // What is actually true: a published level must fit the screen it is
      // rendered on. Nothing here can check "somebody walked this" — the ground
      // under the spawn and the goal above is as close as a file gets.
      expect(level.width, `${where} is ${level.width} tiles — wider than the screen ever shows`).toBeLessThanOrEqual(
        GRID_COLS,
      );
      expect(level.height, `${where} is ${level.height} tiles tall — taller than the screen ever shows`).toBeLessThanOrEqual(
        GRID_ROWS,
      );
    }
  }
});
