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
  LevelData,
  SCHEMA_VERSION,
  WATER_TILE,
} from "./LevelSchema";

/**
 * Single source of truth for turning a LevelData object into a JSON string
 * (for persistence) and back. EditorScene and PlayScene both consume
 * LevelData directly — this module exists so "level as it will be saved"
 * and "level as it is saved" never drift apart from ad hoc stringify calls
 * scattered across the codebase.
 */
export function cloneLevel(level: LevelData): LevelData {
  return {
    ...level,
    layers: { ground: level.layers.ground.map((row) => [...row]) },
    entities: level.entities.map((e) => ({ ...e })),
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
  return parsed as unknown as LevelData;
}
