import { GRID_COLS, GRID_ROWS, MAX_GRID_COLS, MAX_GRID_ROWS, TILE_SIZE } from "../config/gameConfig";
import { StaticBackgroundId } from "./staticBackgrounds";

export const EMPTY_TILE = -1;

// Ground blocks: one distinct value per skin (grass/desert/castle/snow —
// see groundSkins.ts). Each auto-tiles between a "top"/"fill" look
// depending on whether it's exposed to open air above it or buried under
// another ground cell — see groundAutotile.ts. A level can freely mix
// all four; nothing here ties a level to a single skin.
export const GROUND_GRASS_TILE = 0;
export const GROUND_DESERT_TILE = 1;
export const GROUND_CASTLE_TILE = 2;
export const GROUND_SNOW_TILE = 3;

// Brick/Bounce: a fixed look, never auto-tiled. Grass/desert/snow share
// one identical real-art frame each; castle draws its own procedural
// version of both (see generateTextures.ts).
export const BRICK_TILE = 4;
export const BRICK_CASTLE_TILE = 5;
export const BOUNCE_TILE = 6;
export const BOUNCE_CASTLE_TILE = 7;

// Hazard: Water (grass/desert/snow, real art, non-solid) vs. Lava
// (castle's procedural stand-in for it) — same hazard behavior, see
// PlayScene's HAZARD_FRAMES check.
export const WATER_TILE = 8;
export const LAVA_TILE = 9;

export const SCHEMA_VERSION = 2 as const;

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

/** Placement-time size modifier for enemies only (see EnemyBehaviors.ts
 * for the actual scale factors/hitboxes) — chosen via EditorUI's "Enemy
 * Size" selector at the moment an enemy is placed, not editable in place
 * afterward (erase and re-place to change one). Absent on every non-enemy
 * entity, and absent on enemies placed before this feature existed —
 * both cases mean "medium," the original, unscaled look, so old saves
 * render identically to before with zero migration needed. */
export type EnemySize = "small" | "medium" | "large";
export const DEFAULT_ENEMY_SIZE: EnemySize = "medium";

export interface LevelEntity {
  type: EntityType;
  x: number;
  y: number;
  size?: EnemySize;
}

export interface LevelData {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  /** Which static background image shows behind the level (see
   * staticBackgrounds.ts). Optional so old saved levels (and
   * hand-authored template levels) with no field yet fall back to the
   * default via `resolveStaticBackground`, rather than needing a
   * migration. */
  background?: StaticBackgroundId;
  /** The level's own uploaded background image (a downscaled JPEG data
   * URL — see editor/customBackgroundUpload.ts), present only when
   * `background === "custom"`. Lives inline in the level's own JSON
   * (rather than, say, a separate asset store) since localStorage is the
   * only persistence this project has — see backgroundLoader.ts for how
   * it becomes a Phaser texture at runtime. */
  customBackgroundData?: string;
  /** The level's own uploaded background music, as a data URL — present
   * only when the level has one (there's no built-in music pool the way
   * there is for backgrounds; a level with neither field just plays
   * silently). Lives inline in the level's own JSON for the same
   * localStorage-is-the-only-persistence reason as customBackgroundData —
   * see gameplay/musicLoader.ts for how it becomes a playable Phaser sound
   * at runtime. `customMusicName` is the original filename, shown on
   * EditorUI's music button so the level author can tell what's uploaded
   * without re-opening the file picker. */
  customMusicData?: string;
  customMusicName?: string;
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
