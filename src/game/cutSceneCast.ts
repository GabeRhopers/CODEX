/**
 * Who can stand in a cut-scene panel, and what art each of them draws with.
 *
 * Two questions with one answer, kept together because the Cut Scene Maker asks
 * the first and `CutSceneScene` asks the second, and a cast the maker offers but
 * playback cannot draw is the worst outcome available — art that was plainly
 * there while authoring and silently gone on the link.
 *
 * Pure: `PALETTE` is data and `entityRegistry` is pure, so the whole cast is
 * testable without a browser. Only `actorTextureKey`'s *skins* argument comes
 * from Phaser, and it arrives as a plain map.
 */

import type { CustomEntityDef, PlaceableType } from "../entities/customEntity";
import { customBrushes, textureKeyFor } from "../entities/entityRegistry";
import { PALETTE } from "../editor/Palette";
import { CHARACTER_SKIN_ID, HERO_TEXTURE_KEY } from "../skins/spriteFrames";

/**
 * The hero's resting pose.
 *
 * The player is not a palette brush — `spawn` is, and it draws the spawn *arrow*,
 * which is a level-editing marker and not a character anybody would want standing
 * in their story. So the hero is added to the cast by hand, under the id the Skin
 * Creator already uses for them (`CHARACTER_SKIN_ID`), which is also the id a
 * painted player skin is stored against. That means a child who redrew the hero
 * gets *their* hero in the cut scene for free.
 */

export interface CastMember {
  id: string;
  label: string;
  textureKey: string;
}

/**
 * Everyone who can be placed, in the order they are offered.
 *
 * The hero first — the most likely thing to want in a story — then the built-in
 * entities, then whatever this child has invented. Tiles are excluded: a cut
 * scene is a picture with characters in it, and a single floating brick is
 * scenery the backdrop already does better.
 */
export function cutSceneCast(defs: readonly CustomEntityDef[]): CastMember[] {
  const hero: CastMember = { id: CHARACTER_SKIN_ID, label: "Hero", textureKey: HERO_TEXTURE_KEY };
  const builtins = PALETTE.filter((brush) => brush.kind === "entity" && brush.category !== "markers").map((brush) => ({
    id: brush.entityType ?? brush.id,
    label: brush.label,
    textureKey: brush.textureKey,
  }));
  const invented = customBrushes(defs).map((brush) => ({
    id: brush.id,
    label: brush.label,
    textureKey: brush.textureKey,
  }));
  return [hero, ...builtins, ...invented];
}

/**
 * The texture one actor should draw with, or null when nothing can be drawn.
 *
 * Order matters, and it is the same order the rest of the app resolves art in:
 *
 * 1. **A custom skin**, if this id is wearing one. `skins` is the library-default
 *    map (`resolveSkinTextureKeys` with no level), because a cut scene belongs to
 *    a game rather than to any one level and so has no level choices to honour.
 *    This is the branch that gives a repainted hero or a reskinned ghost their
 *    own art without this module knowing either feature exists.
 * 2. **The hero's shipped pose**, which is not in the entity registry at all.
 * 3. **Built-in or invented base art**, via `textureKeyFor`.
 *
 * Null is the deleted-invented-thing case, and it means the same here as it does
 * in a level: the actor stays in the saved data, because dropping it would
 * silently edit somebody's story, and simply is not drawn.
 */
export function actorTextureKey(skins: Map<string, string>, defs: readonly CustomEntityDef[], id: string): string | null {
  const skinned = skins.get(id);
  if (skinned) return skinned;
  if (id === CHARACTER_SKIN_ID) return HERO_TEXTURE_KEY;
  return textureKeyFor(defs, id as PlaceableType);
}
