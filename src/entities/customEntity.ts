import { EntityType } from "../level/LevelSchema";
import { BUILTIN_DECOR_TYPES, BUILTIN_ENEMY_TYPES, BUILTIN_ITEM_TYPES, builtinEnemyDef } from "./builtins";

/**
 * Entities the player invents: a name, a sprite they drew, and the behaviour of
 * something that already exists.
 *
 * The editor can reskin any brush but cannot add one, so a game made here is
 * bounded by 28 built-in entity types. This is what lifts that ceiling — without
 * becoming a scripting language, which is the failure mode it is scoped against.
 *
 * **Behaviour is borrowed, never described.** A custom entity names the built-in
 * it copies (`basedOn`) and inherits everything that goes with it. For an item
 * that means the effect is literally "run the built-in's own collect path", so
 * no effect table is duplicated and no new `switch` appears; for an enemy it
 * means the same patrol movement and the same stompability. The only things a
 * definition may change are its name, its art, and at most a couple of numbers.
 * If a behaviour would need an `if`, it is a code change, not content.
 *
 * Pure, no Phaser, so the rules are testable on their own — same split
 * worldLayout.ts and touchTarget.ts use.
 */

/** Custom ids are deliberately distinguishable from built-in `EntityType`s.
 *
 * `EntityType` stays a closed union, so every existing `switch` over it keeps
 * the exhaustiveness checking this codebase leans on; a custom id can never be
 * mistaken for one, and each dispatch site takes an explicit custom branch
 * instead of silently widening. */
export type CustomEntityId = `custom:${string}`;

export function isCustomEntityId(type: string): type is CustomEntityId {
  return type.startsWith("custom:") && type.length > "custom:".length;
}

export function makeCustomEntityId(uuid: string): CustomEntityId {
  return `custom:${uuid}`;
}

/** Anything that can be placed in a level: a built-in type or an invented one.
 * Written once here so the union does not have to be spelled out at every site
 * that holds or looks up an entity's type. */
export type PlaceableType = EntityType | CustomEntityId;

/** Which of the three clonable families this belongs to. Markers
 * (spawn/goal/checkpoint/basket/chest) are deliberately absent: they are
 * singleton per area and carry level-structure meaning, so copying one would
 * produce a level with two endings or two starts. */
export type CustomEntityCategory = "items" | "enemies" | "decor";

/** Enemy patrol speed, as a multiple of the built-in's own. Bounded rather than
 * free: past roughly double, a patrolling enemy outruns the player's ability to
 * read it, and at zero it stops being an enemy and becomes decor that hurts. */
export const MIN_SPEED_SCALE = 0.25;
export const MAX_SPEED_SCALE = 2;
export const DEFAULT_SPEED_SCALE = 1;

export interface CustomEntityParams {
  /** Enemies only. Ignored for items and decor. */
  speedScale?: number;
}

/**
 * Art is deliberately *not* a field here.
 *
 * The skins library is keyed by brush id — an arbitrary string — and
 * `resolveSkinTextureKeys` returns a `brushId -> textureKey` map by iterating
 * whatever keys it holds. So a custom entity's sprite is simply "the active skin
 * for its own id", which needs no new art plumbing, makes it reskinnable exactly
 * like a built-in (per-level overrides included), and removes a second reference
 * that could dangle. Until someone draws one it falls back to the art of the
 * thing it copies — see builtinTextureKey — so a custom entity is always
 * renderable.
 */
export interface CustomEntityDef {
  id: CustomEntityId;
  name: string;
  category: CustomEntityCategory;
  /** The built-in whose behaviour this copies. Must belong to `category`. */
  basedOn: EntityType;
  params?: CustomEntityParams;
  createdAt: string;
  updatedAt: string;
}

/** What a custom entity actually does, once its `basedOn` is resolved.
 *
 * `item` carries the *built-in item type* rather than an effect name on purpose:
 * the caller hands it straight back to the existing collect path, so there is
 * exactly one place that knows what a coin or a heart does. */
export type ResolvedBehaviour =
  | { kind: "item"; collectAs: EntityType }
  | { kind: "enemy"; stompable: boolean; speedScale: number }
  | { kind: "decor" };

/** The built-ins a given category is allowed to copy. */
export function clonableTypes(category: CustomEntityCategory): readonly EntityType[] {
  if (category === "items") return BUILTIN_ITEM_TYPES;
  if (category === "decor") return BUILTIN_DECOR_TYPES;
  return BUILTIN_ENEMY_TYPES;
}

/**
 * Why a definition is unusable, or `null` when it is fine.
 *
 * A reason string rather than a thrown error: these are shown to whoever is
 * building the thing, and a definition arriving from storage (hand-edited, or
 * written by an older build) has to be *rejected*, not allowed to take the app
 * down. Same "never trust what comes back out of storage" stance Profile.ts and
 * resolveLayout already take.
 */
export function validationError(def: CustomEntityDef): string | null {
  if (!isCustomEntityId(def.id)) return "That id is not a custom entity id.";
  if (!def.name.trim()) return "Give it a name.";
  if (!clonableTypes(def.category).includes(def.basedOn)) {
    return `A custom ${def.category.replace(/s$/, "")} cannot be based on "${def.basedOn}".`;
  }
  const speed = def.params?.speedScale;
  if (speed !== undefined && (!Number.isFinite(speed) || speed < MIN_SPEED_SCALE || speed > MAX_SPEED_SCALE)) {
    return `Speed has to be between ${MIN_SPEED_SCALE} and ${MAX_SPEED_SCALE}.`;
  }
  return null;
}

export function isValid(def: CustomEntityDef): boolean {
  return validationError(def) === null;
}

/**
 * The behaviour a definition resolves to, or `null` if it does not describe
 * anything runnable.
 *
 * Returning null rather than throwing is what lets a level that references a
 * since-deleted or since-corrupted type still open — the caller renders it
 * inert, exactly as backgroundLoader and musicLoader already fall back for a
 * missing asset. A level must never fail to load because a custom type went
 * away.
 */
export function resolveBehaviour(def: CustomEntityDef): ResolvedBehaviour | null {
  if (!isValid(def)) return null;

  if (def.category === "items") return { kind: "item", collectAs: def.basedOn };
  if (def.category === "decor") return { kind: "decor" };

  const builtin = builtinEnemyDef(def.basedOn);
  if (!builtin) return null; // unreachable while validation holds; cheap to keep honest
  return {
    kind: "enemy",
    stompable: builtin.stompable,
    speedScale: def.params?.speedScale ?? DEFAULT_SPEED_SCALE,
  };
}
