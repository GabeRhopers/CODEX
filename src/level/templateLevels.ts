import { TILE_SIZE } from "../config/gameConfig";
import { BOUNCE_TILE, BRICK_TILE, EMPTY_TILE, GROUND_TILE, LevelData, LevelEntity, SCHEMA_VERSION } from "./LevelSchema";
import { LevelTheme } from "./themes";

/**
 * Five hand-authored, ready-to-play levels — one per theme, plus two extra
 * showcasing the real Kenney art content (Brick/Bounce/Bat/Spike Crawler,
 * see README's "Real art" section) — always available from the **Templates**
 * screen (TemplateBrowserScene), never stored in `localStorage`: unlike an
 * earlier version of this file, these are no longer copied into My Levels
 * on first visit. "Play" clones one into PlayScene directly; "Use This
 * Template" clones it into the editor with a blank id, so saving creates an
 * independent level rather than mutating the template. Either way the
 * constants below are never touched at runtime.
 *
 * Ground layouts are written as ASCII rows for readability ('#' = ground,
 * 'B' = brick, 'O' = bounce, '.' = air); entities are listed separately
 * since a spawn/goal/enemy marker always sits in an air cell one row above
 * the ground it stands on (see PlayScene's spawnY math), not "on" a ground
 * character itself.
 *
 * Gaps/steps built from plain ground or brick are sized well within the
 * player's normal jump (max height ~3.5 tiles, ~6 tile horizontal reach —
 * see PlayerController's MOVE_SPEED/JUMP_VELOCITY and gameConfig's
 * GRAVITY_Y). Bounce-assisted sections are a different physics problem —
 * see the comment on SPRING_MEADOW for how those are placed.
 */
const CHAR_TO_TILE: Record<string, number> = {
  "#": GROUND_TILE,
  B: BRICK_TILE,
  O: BOUNCE_TILE,
  ".": EMPTY_TILE,
};

function levelFromRows(opts: {
  id: string;
  name: string;
  theme: LevelTheme;
  rows: string[];
  entities: LevelEntity[];
}): LevelData {
  const height = opts.rows.length;
  const width = opts.rows[0].length;
  const ground = opts.rows.map((row) => row.split("").map((ch) => CHAR_TO_TILE[ch] ?? EMPTY_TILE));
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
  id: "template-sunny-hills",
  name: "Sunny Hills",
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
  id: "template-desert-canyon",
  name: "Desert Canyon",
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
  id: "template-castle-ascent",
  name: "Castle Ascent",
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

/**
 * Bounce launches the player ~7.3 tiles up (BOUNCE_VELOCITY_Y=-650 vs.
 * gravity=900 in PlayScene/gameConfig — h = v²/2g), far past a normal
 * jump. The easy mistake is placing the landing platform directly above
 * the pad: the player is still *rising* when they first reach that
 * height, so they'd hit its underside like a ceiling, not land on it.
 * Instead the platform sits several tiles to the right, at a height
 * comfortably *below* the max reach (so a descending player sinks onto
 * it rather than needing to time a peak exactly), wide enough to catch
 * the range of horizontal drift a held-right input produces during the
 * ~1.4s the bounce is airborne — verified by an actual autoplay, not
 * just this math (see the session notes for exact figures if this ever
 * needs re-tuning).
 */
const SPRING_MEADOW = levelFromRows({
  id: "template-spring-meadow",
  name: "Spring Meadow",
  theme: "grass",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    ".............BBBBBBB",
    "....................",
    "....................",
    "....................",
    "....................",
    "####..##.###########",
    "####..##O###########",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 9 },
    { type: "goal", x: 16, y: 4 },
    { type: "enemy-bat", x: 15, y: 4 },
  ],
});

const CRATE_CANYON = levelFromRows({
  id: "template-crate-canyon",
  name: "Crate Canyon",
  theme: "desert",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    ".............BBBBBBB",
    "....................",
    "....................",
    "....................",
    "....BB..............",
    "###.BB.##.##########",
    "###.BB.##O##########",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 9 },
    { type: "enemy-spike", x: 8, y: 9 },
    { type: "goal", x: 16, y: 4 },
  ],
});

export const TEMPLATE_LEVELS: LevelData[] = [SUNNY_HILLS, DESERT_CANYON, CASTLE_ASCENT, SPRING_MEADOW, CRATE_CANYON];
