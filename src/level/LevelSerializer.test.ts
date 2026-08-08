import { describe, expect, it } from "vitest";
import { createEmptyLevel } from "./LevelSchema";
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
});
