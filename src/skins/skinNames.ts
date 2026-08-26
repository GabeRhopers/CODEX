import { SkinAsset } from "./CustomSkins";

/**
 * What a skin is called.
 *
 * Skins were the only asset library without a name. `BackgroundAsset` and
 * `MusicAsset` have carried `name: string` since they were built, and their
 * pickers show it; a skin had `{id, imageData, uploadedBy, updatedAt}` and
 * nothing else, so the level editor's picker labelled every entry `Skin 1`,
 * `Skin 2`, and the Skin Creator's browse list showed the *brush* label on
 * every row — three Ghost skins were three rows all reading "Ghost". Choosing
 * between them meant picking one and looking at what happened, which made the
 * per-level skin selection much less useful than it should have been.
 *
 * The rules live here, pure, for the same reason `skinSelection.ts` does: the
 * browse list, both pickers and the level editor all have to agree on what a
 * skin is called, and the cheapest way to guarantee that is one function they
 * all call.
 */

/** Long enough for "Grampa in his winter coat", short enough not to run into
 * the browse row's Edit/Copy/Delete buttons. Matches LevelNameInput's own cap. */
export const MAX_SKIN_NAME_LENGTH = 60;

/**
 * The name to show for a skin, falling back to the brush's own label.
 *
 * The fallback is what makes `SkinAsset.name` optional rather than required
 * (unlike backgrounds and music, which never existed without one): every skin
 * saved before names shows "Ghost" exactly as it did before, so nothing has to
 * be migrated and no library entry changes appearance on upgrade.
 */
export function displaySkinName(asset: Pick<SkinAsset, "name">, brushLabel: string): string {
  return asset.name?.trim() || brushLabel;
}

/**
 * The name a newly-created skin starts with: the brush label plus the lowest
 * number not already taken — "Ghost 1", "Ghost 2", and so on.
 *
 * Lowest-free rather than count-plus-one, so deleting "Ghost 1" and making
 * another doesn't produce a second "Ghost 2". Two skins that are born
 * indistinguishable are precisely the problem names exist to solve, so the
 * default has to be distinct without anyone typing anything.
 */
export function defaultSkinName(brushLabel: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = `${brushLabel} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * What actually gets stored when someone commits the name field: trimmed,
 * length-capped, and replaced by `fallback` when they've left it blank.
 *
 * Same discipline `LevelNameInput` already applies ("" commits as "Untitled
 * Level") — a blank name would otherwise render as an empty row, which reads as
 * a broken list rather than as a deliberate choice.
 */
export function sanitizeSkinName(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, MAX_SKIN_NAME_LENGTH);
}
