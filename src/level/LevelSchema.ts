import { GRID_COLS, GRID_ROWS, MAX_GRID_COLS, MAX_GRID_ROWS, TILE_SIZE } from "../config/gameConfig";
import { BackgroundSceneId } from "./backgrounds";
import { DEFAULT_THEME, LevelTheme } from "./themes";

export const EMPTY_TILE = -1;
export const GROUND_TILE = 0;
export const BRICK_TILE = 1;
export const BOUNCE_TILE = 2;
export const WATER_TILE = 3;

export const SCHEMA_VERSION = 1 as const;

export type EntityType =
  | "player-spawn"
  | "goal"
  | "enemy-ghost"
  | "enemy-spike"
  | "enemy-bat"
  | "enemy-golem"
  | "item-coin"
  | "item-heart"
  | "item-speed"
  | "item-feather"
  | "item-shield"
  | "item-key"
  | "chest"
  | "decor-bush"
  | "decor-tree"
  | "decor-cactus"
  | "decor-lamp"
  | "decor-cloud"
  | "decor-snowman"
  | "decor-sprout"
  | "decor-mushroom"
  | "decor-rocks"
  | "decor-bat";

export interface LevelEntity {
  type: EntityType;
  x: number;
  y: number;
}

export interface LevelData {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  theme: LevelTheme;
  /** Which parallax scene shows behind the level — independent of `theme`
   * (see backgrounds.ts). Optional so old saved levels (and hand-authored
   * template levels) with no field yet fall back to the theme's matching
   * scene via `resolveBackground`, rather than needing a migration. */
  background?: BackgroundSceneId;
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
    theme: DEFAULT_THEME,
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
