import { EntityType } from "../level/LevelSchema";

/**
 * The built-in placeable entities, as data.
 *
 * These lived as module constants inside PlayScene, which meant anything that
 * wanted to reason about them — validation, an editor palette, a registry —
 * had to import Phaser to get at them. They are plain data and nothing here
 * needs a renderer, so they live in their own pure module and PlayScene reads
 * them from here instead. Same "palette is data, not branching code" idea
 * Palette.ts already states.
 *
 * This is also what makes a *custom* entity definable: a custom type says which
 * built-in it copies, and these lists are what "which built-in" is checked
 * against (see customEntity.ts).
 */

/** Every item brush's textureKey equals its EntityType (see Palette.ts), so
 * spawning just needs the type list — no separate texture lookup like
 * BUILTIN_ENEMY_DEFS needs. Items are collected via a static overlap zone. */
export const BUILTIN_ITEM_TYPES: readonly EntityType[] = [
  "item-coin",
  "item-heart",
  "item-speed",
  "item-feather",
  "item-thunder-hat",
  "item-shield",
  "item-key",
];

/** Purely cosmetic — spawned as plain static images with no collision or
 * overlap logic, so a level looks the same in Play as it does in the editor
 * with zero gameplay effect. */
export const BUILTIN_DECOR_TYPES: readonly EntityType[] = [
  "decor-bush",
  "decor-tree",
  "decor-cactus",
  "decor-lamp",
  "decor-cloud",
  "decor-snowman",
  "decor-sprout",
  "decor-mushroom",
  "decor-rocks",
  "decor-bat",
];

export interface EnemyDef {
  type: EntityType;
  /** Unlike items and decor, an enemy's texture is *not* its type — the ghost
   * renders as "enemy-ghost-pillow". Anything resolving enemy art has to go
   * through this rather than assuming the convention. */
  textureKey: string;
  stompable: boolean;
}

/** One entry per placeable enemy type. All four share the same patrol/bob
 * movement (EnemyBehaviors.ts); only the texture and whether a from-above hit
 * stomps it (vs. costing the player no matter how it's touched) differ. */
export const BUILTIN_ENEMY_DEFS: readonly EnemyDef[] = [
  { type: "enemy-ghost", textureKey: "enemy-ghost-pillow", stompable: true },
  { type: "enemy-bat", textureKey: "enemy-bat", stompable: true },
  { type: "enemy-spike", textureKey: "enemy-spike-crawler", stompable: false },
  { type: "enemy-golem", textureKey: "enemy-golem", stompable: true },
];

export const BUILTIN_ENEMY_TYPES: readonly EntityType[] = BUILTIN_ENEMY_DEFS.map((d) => d.type);

/** The def for a built-in enemy, or undefined for anything that isn't one. */
export function builtinEnemyDef(type: EntityType): EnemyDef | undefined {
  return BUILTIN_ENEMY_DEFS.find((d) => d.type === type);
}
