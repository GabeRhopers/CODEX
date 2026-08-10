import { TILE_SIZE } from "../config/gameConfig";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { EMPTY_TILE, GROUND_TILE, LevelData, LevelEntity, SCHEMA_VERSION } from "./LevelSchema";
import { LevelTheme } from "./themes";

/**
 * Three hand-authored, ready-to-play levels — one per theme — so a new
 * visitor has something to test-play immediately instead of facing a blank
 * grid. Ground layouts are written as ASCII rows ('#' = ground, '.' = air)
 * for readability; entities are listed separately since a spawn/goal/enemy
 * marker always sits in an air cell one row above the ground it stands on
 * (see PlayScene's spawnY math), not "on" a ground character itself.
 *
 * All three are gentle by design: gaps are at most 2 tiles wide and steps
 * are at most 2 tiles tall, comfortably inside the player's jump (max
 * height ~3.5 tiles, horizontal reach ~6 tiles at a full-speed running
 * jump — see PlayerController's MOVE_SPEED/JUMP_VELOCITY and
 * gameConfig's GRAVITY_Y).
 */
function levelFromRows(opts: {
  id: string;
  name: string;
  theme: LevelTheme;
  rows: string[];
  entities: LevelEntity[];
}): LevelData {
  const height = opts.rows.length;
  const width = opts.rows[0].length;
  const ground = opts.rows.map((row) => row.split("").map((ch) => (ch === "#" ? GROUND_TILE : EMPTY_TILE)));
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id,
    name: opts.name,
    theme: opts.theme,
    createdAt: now,
    updatedAt: now,
    width,
    height,
    tileSize: TILE_SIZE,
    layers: { ground },
    entities: opts.entities,
  };
}

const SUNNY_HILLS = levelFromRows({
  id: "sample-sunny-hills",
  name: "Sunny Hills (sample)",
  theme: "grass",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "............##....##",
    "...######........###",
    "#########..#########",
    "#########..#########",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 9 },
    { type: "enemy-ghost", x: 5, y: 8 },
    { type: "goal", x: 18, y: 7 },
  ],
});

const DESERT_CANYON = levelFromRows({
  id: "sample-desert-canyon",
  name: "Desert Canyon (sample)",
  theme: "desert",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "..........##........",
    "..........##.....###",
    "####..###.##.#######",
    "####..###.##.#######",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 9 },
    { type: "enemy-ghost", x: 10, y: 7 },
    { type: "goal", x: 19, y: 8 },
  ],
});

const CASTLE_ASCENT = levelFromRows({
  id: "sample-castle-ascent",
  name: "Castle Ascent (sample)",
  theme: "castle",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    ".................###",
    "...............#####",
    "............##.#####",
    "..........####.#####",
    ".......##.####.#####",
    "....#####.####.#####",
    "###.#####.####.#####",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 10 },
    { type: "enemy-ghost", x: 12, y: 6 },
    { type: "goal", x: 18, y: 4 },
  ],
});

export const SAMPLE_LEVELS: LevelData[] = [SUNNY_HILLS, DESERT_CANYON, CASTLE_ASCENT];

const SEED_FLAG_KEY = "mario-maker:samples-seeded";

/** Seeds the 3 sample levels into storage exactly once (tracked by a flag
 * separate from the levels themselves), so deleting a sample from My Levels
 * sticks instead of it reappearing on the next visit. */
export async function ensureSampleLevelsSeeded(storage: StorageAdapter): Promise<void> {
  if (localStorage.getItem(SEED_FLAG_KEY)) return;
  for (const level of SAMPLE_LEVELS) {
    await storage.save(level);
  }
  localStorage.setItem(SEED_FLAG_KEY, "1");
}
