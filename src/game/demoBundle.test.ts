/**
 * Every game this site actually publishes still satisfies the app's own rules.
 *
 * `public/games/` is content, not code. Its files are written by hand or dropped
 * in from an export, so nothing was checking them: a dangling `custom:`
 * reference, a background id that does not exist, a world that fails to parse —
 * all of them are silent in the editor and only show up as a blank or broken
 * screen for whoever opened the link, which is the one audience that cannot
 * report a stack trace.
 *
 * Cheap, and it runs against the app's own rules rather than a second opinion —
 * `bundleProblems`, `parseGame`, `parseWorld`, `validationError` are the same
 * functions the running game uses.
 *
 * **Reads the whole directory** rather than naming a file. It used to check only
 * the Grampa demo, which was fine while that was the only game; the moment a
 * second one was published it would have been covered by nothing at all, and
 * nobody would have noticed, because this file would still have been green.
 * `published-games.spec.ts` takes the same stance for the same reason, and
 * checks the things that need level geometry rather than the schema.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleProblems } from "./gameBundle";
import { validationError as gameError, parseGame } from "./GameSchema";
import { parseWorld } from "../world/WorldSchema";
import { validationError as entityError } from "../entities/customEntity";
import { STATIC_BACKGROUNDS } from "../level/staticBackgrounds";

const GAMES_DIR = fileURLToPath(new URL("../../public/games/", import.meta.url));

const games = readdirSync(GAMES_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, raw: JSON.parse(readFileSync(join(GAMES_DIR, name), "utf8")) }));

describe("the published games", () => {
  it("are actually there", () => {
    // Not an empty-directory pass: every `it.each` below would report success on
    // no files at all, which is the one way a guard like this quietly stops
    // guarding anything.
    expect(games.length, "public/games/ should carry at least the demo game").toBeGreaterThan(0);
  });

  describe.each(games)("$name", ({ raw }) => {
    it("has no problems the app would report", () => {
      expect(bundleProblems(raw)).toEqual([]);
    });
    it("parses as a game and a world", () => {
      expect(parseGame(raw.game)).not.toBeNull();
      expect(gameError(raw.game)).toBeNull();
      for (const w of raw.worlds) expect(parseWorld(w), w.name).not.toBeNull();
    });
    it("has valid invented things", () => {
      for (const d of raw.customEntities) expect(entityError(d), d.name).toBeNull();
    });
    it("uses only real background ids", () => {
      const ids = new Set(STATIC_BACKGROUNDS.map((b: { id: string }) => b.id));
      for (const l of raw.levels) expect(ids.has(l.background), `${l.name}: ${l.background}`).toBe(true);
      for (const w of raw.worlds) expect(ids.has(w.background), `${w.name}: ${w.background}`).toBe(true);
    });
    it("places only entity types that exist in the bundle", () => {
      const known = new Set(raw.customEntities.map((d: { id: string }) => d.id));
      for (const l of raw.levels)
        for (const e of l.entities)
          if (String(e.type).startsWith("custom:")) expect(known.has(e.type), `${l.name}: ${e.type}`).toBe(true);
    });
  });
});
