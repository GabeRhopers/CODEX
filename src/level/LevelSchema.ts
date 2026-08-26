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

/** Which of a level's up-to-three grids something refers to — see
 * "Sub/Up areas" under Art. "main" always exists; "sub"/"up" may not.
 * Shared between EditorScene/EditorUI (which area is being edited) and
 * PlayScene (which area is currently being played) rather than each
 * defining its own copy — both are really talking about the same concept
 * defined right here alongside LevelArea. */
export type AreaKey = "main" | "sub" | "up";

export type EntityType =
  | "player-spawn"
  | "goal"
  | "checkpoint"
  | "basket-sub"
  | "basket-up"
  | "enemy-ghost"
  | "enemy-spike"
  | "enemy-bat"
  | "enemy-golem"
  | "item-coin"
  | "item-heart"
  | "item-speed"
  | "item-feather"
  | "item-thunder-hat"
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

/**
 * One playable grid's worth of level content — a ground layer, its
 * entities, and its own background/music choice. As of 2026-08-17 a level
 * can have up to three of these: the Main area (still the top-level
 * `width`/`height`/`layers`/`entities`/etc. fields on `LevelData` itself,
 * unchanged since before areas existed — `LevelData extends LevelArea`
 * below rather than nesting Main under its own key, specifically so an
 * existing saved level's JSON needs zero migration) plus two optional
 * satellite areas, `subArea` and `upArea` (see LevelData). Every area
 * shares the exact same editing tools — the same block/marker/enemy/item/
 * decor palette, its own independent Background/Music choice — so
 * `LevelArea` deliberately mirrors every per-area field `LevelData` used
 * to have all to itself; only the level-wide metadata (id/name/
 * timestamps/schemaVersion) stays exclusively on `LevelData`.
 */
export interface LevelArea {
  /** Which static background image shows behind this area (see
   * staticBackgrounds.ts). Optional so old saved levels (and
   * hand-authored template levels) with no field yet fall back to the
   * default via `resolveStaticBackground`, rather than needing a
   * migration. */
  background?: StaticBackgroundId;
  /** Which entry of the shared background library (backgrounds.json — see
   * backgrounds/backgroundLibraryStorage.ts) this area uses, present only
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
   * music/musicLibraryStorage.ts) this area plays, present only when it
   * has music (there's no built-in pool the way there is for
   * backgrounds; an area with none of these fields just plays silently).
   * Same shared-library treatment as customBackgroundId above, replacing
   * the old per-level embedded copy — see musicLoader.ts. */
  customMusicId?: string;
  /** Legacy per-level embedded music (a data URL) and its original
   * filename, from before music moved into the shared library above.
   * Kept only as a fallback for a level saved before that migration —
   * see musicLoader.ts. Nothing writes these fields anymore. */
  customMusicData?: string;
  customMusicName?: string;
  width: number;
  height: number;
  layers: {
    ground: number[][];
  };
  entities: LevelEntity[];
}

export interface LevelData extends LevelArea {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tileSize: number;
  /** A second area "below" Main, reached via a `basket-sub` marker placed
   * in each — touching either one teleports the player to wherever the
   * other one sits, and back. Undefined until the editor's Area switcher
   * creates one (capped at this single optional field, matching the
   * "limited to 1 sub area" scope — there's no array of areas to manage).
   * See "Sub/Up areas" under Art for the full teleport/pairing story. */
  subArea?: LevelArea;
  /** Same shape and story as `subArea`, but reached via `basket-up`
   * instead — "above" Main only by name/flavor (a level with both areas
   * doesn't render Sub/Main/Up as one continuous stacked space; each is
   * its own screen, swapped to instantly on touch, not scrolled into). */
  upArea?: LevelArea;
  /**
   * Which custom skin (see skins/skinSelection.ts) this level wears for each
   * Brush id. Level-wide rather than per-`LevelArea` on purpose: Sub/Up are the
   * same level, and a ghost that looked different after a basket teleport would
   * read as a bug, not a feature — unlike Background/Music, which are per-area
   * precisely so each screen can feel like its own place.
   *
   * Three-state per brush, which is the whole point: a missing key follows the
   * library default, a skin id pins that skin for this level whatever the
   * default becomes later, and an explicit `null` pins the *built-in* art
   * despite a default. See skinSelection.ts for the resolution order.
   *
   * Optional, and absent on every level saved before 2026-08-23 — which then
   * reads as "follow the default" for every brush, exactly the single global
   * `activeId` behaviour those levels were saved under. So there is nothing to
   * migrate and no level changes appearance.
   *
   * Stores ids, not art, unlike `customBackgroundData`/`customMusicData`: the
   * skin library lives in the same Drive account and already holds every PNG,
   * so a level shared with another account shows default art for its custom
   * skins — the same way it already degrades when a skin is deleted.
   */
  skins?: Record<string, string | null>;
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

/** A blank Sub/Up area — always sized to match Main's own current
 * `width`/`height` (areas don't get independent sizing; see "Sub/Up
 * areas" under Art) rather than the GRID_COLS/GRID_ROWS default
 * `createEmptyLevel` itself falls back to, since Main may well have
 * already been resized by the time a Sub/Up area is first created. */
export function createEmptyArea(width: number, height: number): LevelArea {
  return {
    width,
    height,
    layers: {
      ground: createEmptyGrid(width, height),
    },
    entities: [],
  };
}
