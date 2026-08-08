import { GRID_COLS, GRID_ROWS, MAX_GRID_COLS, MAX_GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

export const EMPTY_TILE = -1;
export const GROUND_TILE = 0;

export const SCHEMA_VERSION = 1 as const;

export type EntityType = "player-spawn" | "goal";

export interface LevelEntity {
  type: EntityType;
  x: number;
  y: number;
}

export interface LevelData {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  tileSize: number;
  layers: {
    ground: number[][];
  };
  entities: LevelEntity[];
}

export interface LevelSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export function createEmptyGrid(width: number, height: number): number[][] {
  return Array.from({ length: height }, () => Array<number>(width).fill(EMPTY_TILE));
}

export function createEmptyLevel(name = "Untitled Level", width = GRID_COLS, height = GRID_ROWS): LevelData {
  const clampedWidth = Math.min(Math.max(width, 4), MAX_GRID_COLS);
  const clampedHeight = Math.min(Math.max(height, 4), MAX_GRID_ROWS);
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "",
    name,
    createdAt: now,
    updatedAt: now,
    width: clampedWidth,
    height: clampedHeight,
    tileSize: TILE_SIZE,
    layers: {
      ground: createEmptyGrid(clampedWidth, clampedHeight),
    },
    entities: [],
  };
}
