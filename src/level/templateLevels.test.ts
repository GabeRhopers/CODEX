import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "../config/gameConfig";
import { cloneLevel } from "./LevelSerializer";
import {
  BOUNCE_CASTLE_TILE,
  BOUNCE_TILE,
  BRICK_CASTLE_TILE,
  BRICK_TILE,
  EMPTY_TILE,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  GROUND_SNOW_TILE,
  LAVA_TILE,
  LevelData,
  SCHEMA_VERSION,
  WATER_TILE,
} from "./LevelSchema";
import { TEMPLATE_LEVELS } from "./templateLevels";

/**
 * The six bundled templates are the first thing a new player opens — MenuScene
 * points anyone with nothing saved straight at "Browse Templates". They are
 * also the least defended data in the project: `levelFromRows` builds each one
 * from hand-edited ASCII art, taking the level's width from `rows[0].length`
 * alone and mapping any character it doesn't recognise to empty air. Every way
 * that can go wrong is silent, and until now nothing checked any of it.
 *
 * So these are integrity tests over the shipped data rather than tests of a
 * function: they run over all six, and over a seventh the day someone adds one.
 */

/** Guards the loops below. Without it, emptying or renaming TEMPLATE_LEVELS
 * would turn every `for` in this file into a no-op that still passes — the
 * vacuous-test trap skin-erase.spec.ts fell into once already. */
const EXPECTED_TEMPLATE_COUNT = 6;

const KNOWN_TILES = new Set([
  EMPTY_TILE,
  GROUND_GRASS_TILE,
  GROUND_DESERT_TILE,
  GROUND_CASTLE_TILE,
  GROUND_SNOW_TILE,
  BRICK_TILE,
  BRICK_CASTLE_TILE,
  BOUNCE_TILE,
  BOUNCE_CASTLE_TILE,
  WATER_TILE,
  LAVA_TILE,
]);

/** What a player can land on. Water and lava are deliberately excluded — they
 * are not floors, and a spawn "standing" on either is a spawn in a hazard. */
const STANDABLE = new Set([
  GROUND_GRASS_TILE,
  GROUND_DESERT_TILE,
  GROUND_CASTLE_TILE,
  GROUND_SNOW_TILE,
  BRICK_TILE,
  BRICK_CASTLE_TILE,
  BOUNCE_TILE,
  BOUNCE_CASTLE_TILE,
]);

function tileAt(level: LevelData, x: number, y: number): number | undefined {
  return level.layers.ground[y]?.[x];
}

describe("TEMPLATE_LEVELS", () => {
  it("ships the expected number of templates", () => {
    expect(TEMPLATE_LEVELS).toHaveLength(EXPECTED_TEMPLATE_COUNT);
  });

  it("gives every template a unique id and name", () => {
    // TemplateBrowserScene renders one row per entry and labels it by name;
    // two templates sharing either is a row a player cannot tell apart.
    const ids = TEMPLATE_LEVELS.map((l) => l.id);
    const names = TEMPLATE_LEVELS.map((l) => l.name);
    expect(new Set(ids).size).toBe(TEMPLATE_LEVELS.length);
    expect(new Set(names).size).toBe(TEMPLATE_LEVELS.length);
    for (const id of ids) expect(id).toMatch(/^template-/);
  });

  for (const level of TEMPLATE_LEVELS) {
    describe(level.name, () => {
      it("is a rectangle whose declared size is the truth", () => {
        // `levelFromRows` takes width from the *first row only*, so a row one
        // character short or long produces a ragged grid that claims to be
        // rectangular. Nothing downstream re-checks it.
        expect(level.layers.ground).toHaveLength(level.height);
        for (const [y, row] of level.layers.ground.entries()) {
          expect(row, `row ${y} is a different length`).toHaveLength(level.width);
        }
      });

      it("is built only from real tiles, and is not empty", () => {
        for (const [y, row] of level.layers.ground.entries()) {
          for (const [x, value] of row.entries()) {
            expect(KNOWN_TILES.has(value), `unknown tile ${value} at ${x},${y}`).toBe(true);
          }
        }
        // An all-air map would satisfy every other check here while being
        // unplayable, and is exactly what a badly broken ASCII edit produces.
        const solid = level.layers.ground.flat().filter((t) => t !== EMPTY_TILE);
        expect(solid.length).toBeGreaterThan(0);
      });

      it("carries exactly one spawn and one goal", () => {
        // Test Play refuses to start without both (see EditorScene's gate), so
        // a template missing either is a dead menu item.
        const of = (type: string) => level.entities.filter((e) => e.type === type);
        expect(of("player-spawn")).toHaveLength(1);
        expect(of("goal")).toHaveLength(1);
      });

      it("places every entity inside the grid", () => {
        for (const entity of level.entities) {
          expect(entity.x, `${entity.type} x`).toBeGreaterThanOrEqual(0);
          expect(entity.y, `${entity.type} y`).toBeGreaterThanOrEqual(0);
          expect(entity.x, `${entity.type} x`).toBeLessThan(level.width);
          expect(entity.y, `${entity.type} y`).toBeLessThan(level.height);
        }
      });

      it("starts the player on solid ground, in open air", () => {
        // The convention the file's own docstring states: a marker sits in an
        // air cell one row above the ground it stands on. Getting it wrong
        // means spawning inside a wall, or falling straight into a pit before
        // the player has touched a key — which is what this catches.
        const spawn = level.entities.find((e) => e.type === "player-spawn")!;
        expect(tileAt(level, spawn.x, spawn.y), "spawn is inside a block").toBe(EMPTY_TILE);
        const below = tileAt(level, spawn.x, spawn.y + 1);
        expect(below !== undefined && STANDABLE.has(below), "nothing under the spawn").toBe(true);
      });

      it("does not bury the goal inside a block", () => {
        // Deliberately weaker than the spawn check: a goal can legitimately sit
        // at the apex of a jump with nothing directly beneath it, so only
        // "reachable at all" is asserted here.
        const goal = level.entities.find((e) => e.type === "goal")!;
        expect(tileAt(level, goal.x, goal.y)).toBe(EMPTY_TILE);
      });

      it("declares the current schema and tile size", () => {
        expect(level.schemaVersion).toBe(SCHEMA_VERSION);
        expect(level.tileSize).toBe(TILE_SIZE);
      });
    });
  }

  it("hands out copies, so playing or editing one can never edit the original", () => {
    // TemplateBrowserScene's whole contract: Play clones, and Use This Template
    // clones with a blank id. If cloneLevel ever went shallow, a player editing
    // a template would silently rewrite the shipped one for the rest of the
    // session.
    const original = TEMPLATE_LEVELS[0];
    const copy = cloneLevel(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.layers.ground).not.toBe(original.layers.ground);

    const before = original.layers.ground[original.height - 1][0];
    copy.layers.ground[original.height - 1][0] = EMPTY_TILE;
    copy.entities.push({ type: "item-coin", x: 0, y: 0 });
    expect(original.layers.ground[original.height - 1][0]).toBe(before);
    expect(original.entities.some((e) => e.type === "item-coin" && e.x === 0 && e.y === 0)).toBe(false);
  });
});
