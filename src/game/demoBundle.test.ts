/**
 * The game that actually ships at `?game=grampa-and-the-lost-sheep`.
 *
 * That file is content, not code, and it is written by hand — so nothing was
 * checking it. A dangling `custom:` reference, a background id that does not
 * exist, a world that fails to parse: all of them are silent in the editor and
 * only show up as a blank or broken screen for whoever opened the link, which is
 * the one audience that cannot report a stack trace.
 *
 * Cheap, and it runs against the app's own rules rather than a second opinion —
 * `bundleProblems`, `parseGame`, `parseWorld`, `validationError` are the same
 * functions the running game uses.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleProblems } from "./gameBundle";
import { validationError as gameError, parseGame } from "./GameSchema";
import { parseWorld } from "../world/WorldSchema";
import { validationError as entityError } from "../entities/customEntity";
import { STATIC_BACKGROUNDS } from "../level/staticBackgrounds";

const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../public/games/grampa-and-the-lost-sheep.json", import.meta.url)), "utf8"));

describe("the shipped demo bundle", () => {
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
