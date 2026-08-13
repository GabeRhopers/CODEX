import { describe, expect, it } from "vitest";
import {
  BOUNCE_CASTLE_TILE,
  BRICK_CASTLE_TILE,
  createEmptyLevel,
  GROUND_CASTLE_TILE,
  GROUND_SNOW_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "./LevelSchema";
import { cloneLevel, deserializeLevel, serializeLevel } from "./LevelSerializer";

describe("LevelSerializer", () => {
  it("round-trips a level through serialize/deserialize with no data loss", () => {
    const level = createEmptyLevel("Test Level", 10, 6);
    level.id = "abc-123";
    level.layers.ground[5][0] = 0;
    level.layers.ground[5][1] = 0;
    level.entities.push({ type: "player-spawn", x: 0, y: 4 });
    level.entities.push({ type: "goal", x: 9, y: 4 });

    const restored = deserializeLevel(serializeLevel(level));

    expect(restored).toEqual(level);
  });

  it("clones a level deeply so mutating the clone never touches the original", () => {
    const level = createEmptyLevel("Original", 4, 4);
    level.layers.ground[0][0] = 0;
    level.entities.push({ type: "player-spawn", x: 0, y: 0 });

    const clone = cloneLevel(level);
    clone.layers.ground[0][0] = -1;
    clone.entities[0].x = 3;

    expect(level.layers.ground[0][0]).toBe(0);
    expect(level.entities[0].x).toBe(0);
  });

  it("rejects a level JSON with an unsupported schema version", () => {
    const level = createEmptyLevel();
    const bad = { ...level, schemaVersion: 999 };
    expect(() => deserializeLevel(JSON.stringify(bad))).toThrow(/schema version/);
  });

  it("migrates a v1 save (level-wide theme, generic tile values) to the new per-block skin encoding", () => {
    const v1Castle = {
      schemaVersion: 1,
      id: "old-castle-level",
      name: "Old Castle Level",
      theme: "castle",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      width: 4,
      height: 2,
      tileSize: 32,
      layers: {
        // old encoding: -1 empty, 0 ground, 1 brick, 2 bounce, 3 water
        ground: [
          [-1, -1, -1, -1],
          [0, 1, 2, 3],
        ],
      },
      entities: [],
    };
    const migrated = deserializeLevel(JSON.stringify(v1Castle));
    expect(migrated.schemaVersion).toBe(2);
    expect("theme" in migrated).toBe(false);
    expect(migrated.layers.ground[1]).toEqual([GROUND_CASTLE_TILE, BRICK_CASTLE_TILE, BOUNCE_CASTLE_TILE, LAVA_TILE]);
  });

  it("migrates a v1 save on a non-castle theme to the shared (non-castle) brick/bounce/water tiles", () => {
    const v1Snow = {
      schemaVersion: 1,
      id: "old-snow-level",
      name: "Old Snow Level",
      theme: "snow",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      width: 2,
      height: 1,
      tileSize: 32,
      layers: { ground: [[0, 3]] },
      entities: [],
    };
    const migrated = deserializeLevel(JSON.stringify(v1Snow));
    expect(migrated.layers.ground[0]).toEqual([GROUND_SNOW_TILE, WATER_TILE]);
  });
});
