import { Brush, BrushCategory } from "../editor/Palette";
import { EntityType } from "../level/LevelSchema";
import {
  BUILTIN_DECOR_TYPES,
  BUILTIN_ENEMY_DEFS,
  BUILTIN_ITEM_TYPES,
  builtinTextureKey,
  EnemyDef,
} from "./builtins";
import {
  CustomEntityDef,
  DEFAULT_SPEED_SCALE,
  isCustomEntityId,
  isValid,
  PlaceableType,
  resolveBehaviour,
} from "./customEntity";

/**
 * The built-in entities and the invented ones, as one list.
 *
 * Every consumer — the editor's palette, PlayScene's three spawn loops — asks
 * here rather than reading the built-in constants, so adding a custom type is a
 * matter of it appearing in this merge rather than of new branches at each site.
 *
 * **Invalid definitions are dropped here**, once, so no caller has to remember
 * to check. A definition can be invalid because it was hand-edited in Drive or
 * written by an older build; the level that referenced it still opens, with the
 * entity inert (see PlayScene) rather than the level failing to load.
 *
 * Built-ins always come first and keep their original order, so nothing about
 * existing levels — spawn order, draw order — shifts when a custom type exists.
 *
 * Pure, no Phaser, so the merge is testable on its own.
 */

export function validDefs(defs: readonly CustomEntityDef[]): CustomEntityDef[] {
  return defs.filter(isValid);
}

function idsOfCategory(defs: readonly CustomEntityDef[], category: "items" | "decor"): PlaceableType[] {
  return validDefs(defs)
    .filter((d) => d.category === category)
    .map((d) => d.id);
}

export function itemTypes(defs: readonly CustomEntityDef[] = []): PlaceableType[] {
  return [...BUILTIN_ITEM_TYPES, ...idsOfCategory(defs, "items")];
}

export function decorTypes(defs: readonly CustomEntityDef[] = []): PlaceableType[] {
  return [...BUILTIN_DECOR_TYPES, ...idsOfCategory(defs, "decor")];
}

/** An enemy the spawner can build. Widened from the built-in `EnemyDef` with the
 * one knob a custom enemy may turn, defaulted for built-ins so the spawn loop
 * needs no special case. */
export interface SpawnableEnemy extends Omit<EnemyDef, "type"> {
  type: PlaceableType;
  speedScale: number;
  /** Which built-in's hitbox tuning to use. Its own type for a built-in, the
   * copied one for an invented enemy — `ENEMY_HITBOX_FRACTION` is keyed by
   * built-in type and a custom id would find nothing there. */
  sizeAs: EntityType;
}

export function enemyDefs(defs: readonly CustomEntityDef[] = []): SpawnableEnemy[] {
  const builtins: SpawnableEnemy[] = BUILTIN_ENEMY_DEFS.map((d) => ({
    ...d,
    speedScale: DEFAULT_SPEED_SCALE,
    sizeAs: d.type,
  }));
  const customs: SpawnableEnemy[] = [];
  for (const def of validDefs(defs)) {
    if (def.category !== "enemies") continue;
    const behaviour = resolveBehaviour(def);
    if (behaviour?.kind !== "enemy") continue;
    customs.push({
      type: def.id,
      // The art it wears *until* someone draws one: PlayScene's existing skin
      // pass replaces this by brush id when a skin exists for the custom id.
      textureKey: builtinTextureKey(def.basedOn) ?? "",
      stompable: behaviour.stompable,
      speedScale: behaviour.speedScale,
      sizeAs: def.basedOn,
    });
  }
  return [...builtins, ...customs];
}

/** The definition behind a placed entity, or undefined when it is a built-in or
 * the definition has gone away. */
export function findDef(defs: readonly CustomEntityDef[], type: PlaceableType): CustomEntityDef | undefined {
  return validDefs(defs).find((d) => d.id === type);
}

/** Which built-in an item should be collected as — the whole of a custom item's
 * behaviour. Undefined when `type` is not a valid custom item, which is the
 * caller's cue to leave it inert. */
export function collectAsFor(defs: readonly CustomEntityDef[], type: PlaceableType): EntityType | undefined {
  const def = findDef(defs, type);
  if (!def) return undefined;
  const behaviour = resolveBehaviour(def);
  return behaviour?.kind === "item" ? behaviour.collectAs : undefined;
}

/**
 * The texture a placed entity should draw with, or `null` when nothing can be
 * drawn for it.
 *
 * Null is the deleted-definition case: a level keeps the entity in its data
 * (removing it would silently edit someone else's level) but there is no record
 * of what it looked like, so it simply is not spawned. That is what "renders
 * inert" means in practice — preserved on disk, absent on screen.
 *
 * This is the *base* art only. A skin registered against the custom id replaces
 * it later, through the same brush-id pass PlayScene already runs for built-ins.
 */
export function textureKeyFor(defs: readonly CustomEntityDef[], type: PlaceableType): string | null {
  if (!isCustomEntityId(type)) return builtinTextureKey(type);
  const def = findDef(defs, type);
  return def ? builtinTextureKey(def.basedOn) : null;
}

/** Palette entries for the invented types, in the shape the editor already
 * understands — a custom brush is an ordinary entry whose id happens not to be
 * one of the built-in literals. */
export function customBrushes(defs: readonly CustomEntityDef[]): Brush[] {
  return validDefs(defs).map((def) => ({
    id: def.id,
    category: def.category as BrushCategory,
    kind: "entity" as const,
    label: def.name,
    textureKey: builtinTextureKey(def.basedOn) ?? "",
    entityType: def.id,
  }));
}
