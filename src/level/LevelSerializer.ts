import { LevelData, SCHEMA_VERSION } from "./LevelSchema";

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

export function deserializeLevel(json: string): LevelData {
  const parsed = JSON.parse(json) as LevelData;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported level schema version ${String(parsed.schemaVersion)}; expected ${SCHEMA_VERSION}`,
    );
  }
  return parsed;
}
