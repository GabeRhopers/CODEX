import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleProblems, gameSlug, type GameBundle } from "../../src/game/gameBundle";

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
  }
});
