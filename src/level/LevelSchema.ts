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

// Hazard-shaped tiles: Water (grass/desert/snow, real art, non-solid,
// swimmable) vs. Lava (castle's procedural stand-in, non-solid, instant
// hazard) — same autotiled top/fill rendering (see groundAutotile.ts) but
// opposite gameplay: water never damages the player and can be swum
// through (see PlayScene's swim handling in update()), while lava keeps
// costing a hit on contact (see PlayScene's HAZARD_FRAMES check, which no
// longer includes water).
export const WATER_TILE = 8;
export const LAVA_TILE = 9;

export const SCHEMA_VERSION = 2 as const;

export type EntityType =
  | "player-spawn"
  | "goal"
  | "checkpoint"
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
  /** Which entry of the shared background library (backgrounds.json — see
   * backgrounds/backgroundLibraryStorage.ts) this level uses, present only
   * when `background === "custom"`. As of 2026-08-16, uploading a
   * background adds it to a library shared across every profile and every
   * level (the same "upload once, reuse everywhere, pick from a submenu
   * of thumbnails" workflow custom skins already had) instead of
   * embedding a one-off copy in just this level — see
   * backgroundLoader.ts for how an id resolves to a Phaser texture. */
  customBackgroundId?: string;
  /** Legacy per-level embedded background image (a downscaled JPEG data
   * URL), from before backgrounds moved into the shared library above.
   * Kept only as a fallback so a level saved before that migration still
   * renders its own uploaded background without needing to be re-uploaded
   * — see backgroundLoader.ts. Every new upload sets customBackgroundId
   * instead; nothing writes this field anymore. */
  customBackgroundData?: string;
  /** Which entry of the shared music library (music.json — see
   * music/musicLibraryStorage.ts) this level plays, present only when the
   * level has music (there's no built-in pool the way there is for
   * backgrounds; a level with none of these fields just plays silently).
   * Same shared-library treatment as customBackgroundId above, replacing
   * the old per-level embedded copy — see musicLoader.ts. */
  customMusicId?: string;
  /** Legacy per-level embedded music (a data URL) and its original
   * filename, from before music moved into the shared library above.
   * Kept only as a fallback for a level saved before that migration —
   * see musicLoader.ts. Nothing writes these fields anymore. */
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
