import {
  BOUNCE_CASTLE_TILE,
  BOUNCE_TILE,
  BRICK_CASTLE_TILE,
  BRICK_TILE,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  GROUND_SNOW_TILE,
  LAVA_TILE,
  LevelArea,
  LevelData,
  SCHEMA_VERSION,
  WATER_TILE,
} from "./LevelSchema";
import { sanitizeLevelSkins } from "../skins/skinSelection";

/**
 * Single source of truth for turning a LevelData object into a JSON string
 * (for persistence) and back. EditorScene and PlayScene both consume
 * LevelData directly — this module exists so "level as it will be saved"
 * and "level as it is saved" never drift apart from ad hoc stringify calls
 * scattered across the codebase.
 */
function cloneArea<T extends LevelArea>(area: T): T {
  return {
    ...area,
    layers: { ground: area.layers.ground.map((row) => [...row]) },
    entities: area.entities.map((e) => ({ ...e })),
  };
}

/** Deep-clones every area, not just Main — `...level`'s own shallow spread
 * would otherwise leave `subArea`/`upArea` (see "Sub/Up areas" under Art)
 * pointing at the exact same nested objects as the original, defeating
 * the whole point of a clone for those two areas specifically. */
export function cloneLevel(level: LevelData): LevelData {
  return {
    ...cloneArea(level),
    subArea: level.subArea ? cloneArea(level.subArea) : undefined,
    upArea: level.upArea ? cloneArea(level.upArea) : undefined,
    // Level-wide rather than per-area (see LevelData.skins), so it sits here
    // beside the areas rather than inside cloneArea. Copied rather than shared
    // for the same reason the areas are: the editor mutates this map as the
    // skin picker is used, and a clone that aliased it would write through to
    // whatever it was cloned from.
    skins: level.skins ? { ...level.skins } : undefined,
  };
}

export function serializeLevel(level: LevelData): string {
  return JSON.stringify(level);
}

const OLD_GROUND_TILE = 0;
const OLD_BRICK_TILE = 1;
const OLD_BOUNCE_TILE = 2;
const OLD_WATER_TILE = 3;

const OLD_GROUND_BY_THEME: Record<string, number> = {
  grass: GROUND_GRASS_TILE,
  desert: GROUND_DESERT_TILE,
  castle: GROUND_CASTLE_TILE,
  snow: GROUND_SNOW_TILE,
};

/** Levels saved before ground skins were separate blocks (schema v1)
 * stored one generic Ground/Brick/Bounce/Water value per cell plus a
 * level-wide `theme` field that picked which tileset rendered all of
 * them. Remaps each cell to the skin-specific constant that `theme`
 * always rendered as, so an old save keeps its exact old appearance
 * under the new per-block-skin model (see LevelSchema.ts) instead of
 * silently turning into a mix of default skins the moment it's loaded. */
function migrateV1ToV2(parsed: Record<string, unknown>): void {
  const theme = typeof parsed.theme === "string" ? parsed.theme : "grass";
  const groundTile = OLD_GROUND_BY_THEME[theme] ?? GROUND_GRASS_TILE;
  const isCastle = theme === "castle";
  const brickTile = isCastle ? BRICK_CASTLE_TILE : BRICK_TILE;
  const bounceTile = isCastle ? BOUNCE_CASTLE_TILE : BOUNCE_TILE;
  const hazardTile = isCastle ? LAVA_TILE : WATER_TILE;

  const grid = (parsed.layers as { ground?: number[][] } | undefined)?.ground ?? [];
  for (const row of grid) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === OLD_GROUND_TILE) row[x] = groundTile;
      else if (row[x] === OLD_BRICK_TILE) row[x] = brickTile;
      else if (row[x] === OLD_BOUNCE_TILE) row[x] = bounceTile;
      else if (row[x] === OLD_WATER_TILE) row[x] = hazardTile;
      // Anything else (EMPTY_TILE = -1) is left untouched.
    }
  }

  delete parsed.theme;
  parsed.schemaVersion = SCHEMA_VERSION;
}

export function deserializeLevel(json: string): LevelData {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (parsed.schemaVersion === 1) migrateV1ToV2(parsed);
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported level schema version ${String(parsed.schemaVersion)}; expected ${SCHEMA_VERSION}`,
    );
  }
  // Skin choices are the one field here whose values are neither numbers nor
  // fixed enums, so a hand-edited or half-written file could put anything in
  // them. Filtered to ids and explicit nulls rather than trusted, so one bad
  // entry can't reach the resolver — every other field on a level is either
  // structural (and would already have failed above) or re-derived on load.
  const skins = sanitizeLevelSkins(parsed.skins);
  if (skins) parsed.skins = skins;
  else delete parsed.skins;
  return parsed as unknown as LevelData;
}
