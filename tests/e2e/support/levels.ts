import type { LevelArea, LevelData, LevelEntity } from "../../../src/level/LevelSchema";

const GROUND_GRASS_TILE = 0;
const EMPTY_TILE = -1;

/** A flat ground strip on one row, matching PlayScene's own "player's feet
 * land one row below the marker tile" convention (see enterArea's
 * `spawnY`) — every marker/basket this file's callers place at
 * `groundRow - 1` lands correctly on the solid row built here. */
function makeGroundGrid(width: number, height: number, groundRow: number, fromX: number, toX: number): number[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (y === groundRow && x >= fromX && x <= toX ? GROUND_GRASS_TILE : EMPTY_TILE)),
  );
}

export function makeArea(width: number, height: number, groundRow: number, entities: LevelEntity[], fromX = 0, toX = width - 1): LevelArea {
  return {
    width,
    height,
    layers: { ground: makeGroundGrid(width, height, groundRow, fromX, toX) },
    entities,
  };
}

let nextTestLevelId = 1;

/** Builds a full LevelData for `scene.start("Editor", { level })` /
 * `scene.start("Play", { level })` — every field EditorScene/PlayScene
 * actually read is real, not stubbed; only the id is synthetic (and
 * unique per call, in case a spec ever starts more than one). */
export function makeLevel(mainArea: LevelArea, opts: { subArea?: LevelArea; upArea?: LevelArea } = {}): LevelData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: `e2e-test-${nextTestLevelId++}`,
    name: "E2E Test Level",
    createdAt: now,
    updatedAt: now,
    tileSize: 32,
    ...mainArea,
    ...opts,
  };
}
