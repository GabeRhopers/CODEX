import { TILE_SIZE } from "../config/gameConfig";
import { GroundSkin } from "./groundSkins";
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
  LevelEntity,
  SCHEMA_VERSION,
  WATER_TILE,
} from "./LevelSchema";

/**
 * Six hand-authored, ready-to-play levels — one leaning on each ground
 * skin (grass/desert/castle/snow), plus two extra showcasing specific
 * real Kenney art content (Brick/Bounce/Bat/Spike Crawler, see README's
 * "Real art" section) — always available from the **Templates** screen
 * (TemplateBrowserScene), never stored in `localStorage`: unlike an
 * earlier version of this file, these are no longer copied into My Levels
 * on first visit. "Play" clones one into PlayScene directly; "Use This
 * Template" clones it into the editor with a blank id, so saving creates an
 * independent level rather than mutating the template. Either way the
 * constants below are never touched at runtime.
 *
 * Ground layouts are written as ASCII rows for readability ('#' = ground,
 * 'B' = brick, 'O' = bounce, 'W' = water/lava, '.' = air); entities are
 * listed separately since a spawn/goal/enemy marker always sits in an air
 * cell one row above the ground it stands on (see PlayScene's spawnY
 * math), not "on" a ground character itself.
 *
 * Each template picks one `skin` (see groundSkins.ts) baked into its own
 * ground tile values at construction time (see charToTileForSkin below) —
 * levels themselves have no notion of "one skin" any more (see
 * LevelSchema.ts), this is purely how each template gets its intended
 * look. Nothing stops you from repainting any of these with other skins
 * once loaded in the editor, same as any other level.
 *
 * Gaps/steps built from plain ground or brick are sized well within the
 * player's normal jump (max height ~3.5 tiles, ~6 tile horizontal reach —
 * see PlayerController's MOVE_SPEED/JUMP_VELOCITY and gameConfig's
 * GRAVITY_Y). Bounce-assisted sections are a different physics problem —
 * see the comment on SPRING_MEADOW for how those are placed.
 */
const GROUND_TILE_BY_SKIN: Record<GroundSkin, number> = {
  grass: GROUND_GRASS_TILE,
  desert: GROUND_DESERT_TILE,
  castle: GROUND_CASTLE_TILE,
  snow: GROUND_SNOW_TILE,
};

function charToTileForSkin(skin: GroundSkin): Record<string, number> {
  const isCastle = skin === "castle";
  return {
    "#": GROUND_TILE_BY_SKIN[skin],
    B: isCastle ? BRICK_CASTLE_TILE : BRICK_TILE,
    O: isCastle ? BOUNCE_CASTLE_TILE : BOUNCE_TILE,
    W: isCastle ? LAVA_TILE : WATER_TILE,
    ".": EMPTY_TILE,
  };
}

function levelFromRows(opts: {
  id: string;
  name: string;
  skin: GroundSkin;
  rows: string[];
  entities: LevelEntity[];
}): LevelData {
  const height = opts.rows.length;
  const width = opts.rows[0].length;
  const charToTile = charToTileForSkin(opts.skin);
  const ground = opts.rows.map((row) => row.split("").map((ch) => charToTile[ch] ?? EMPTY_TILE));
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id,
    name: opts.name,
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
  skin: "grass",
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
  skin: "desert",
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
  skin: "castle",
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
  skin: "grass",
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
  skin: "desert",
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

/**
 * Showcases the M2 content added in the 2026-08-12 pass: the Snow ground
 * skin, the Water hazard tile (a 3-tile-wide shallow gap in the floor at
 * cols 11-13 — non-solid, so walking into it drops the player one tile
 * onto the solid backing row and costs a hit, same as any other hazard;
 * jumping it clean at a run needs nowhere near this game's ~6-tile reach),
 * the Golem enemy, the Key→Chest mechanic (the key sits on the path before
 * the gap, the chest just after it), and a representative handful of the
 * new purely-cosmetic Decor entities (the full set is always available in
 * the editor's Decor tab regardless of what any one template shows).
 */
const FROZEN_CAVERN = levelFromRows({
  id: "template-frozen-cavern",
  name: "Frozen Cavern",
  skin: "snow",
  rows: [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "####..#####WWW######",
    "####################",
  ],
  entities: [
    { type: "player-spawn", x: 1, y: 9 },
    { type: "decor-bush", x: 3, y: 9 },
    { type: "enemy-golem", x: 6, y: 9 },
    { type: "decor-snowman", x: 8, y: 9 },
    { type: "item-key", x: 9, y: 9 },
    { type: "decor-rocks", x: 10, y: 9 },
    { type: "decor-cloud", x: 12, y: 3 },
    { type: "decor-bat", x: 17, y: 5 },
    { type: "chest", x: 15, y: 9 },
    { type: "decor-lamp", x: 17, y: 9 },
    { type: "goal", x: 18, y: 9 },
  ],
});

export const TEMPLATE_LEVELS: LevelData[] = [
  SUNNY_HILLS,
  DESERT_CANYON,
  CASTLE_ASCENT,
  SPRING_MEADOW,
  CRATE_CANYON,
  FROZEN_CAVERN,
];
