/**
 * Which skin a brush actually wears, resolved from the two places a choice can
 * live. Pure — no Drive, no Phaser — so the rule can be tested directly rather
 * than through a browser.
 *
 * Before 2026-08-23 there was only one place: `activeId` in the shared
 * `skins.json`. That made every skin choice global, "for every profile, in
 * every level, immediately" — so picking a skin while editing one level
 * restyled every other level, and the choice was not part of what Save wrote.
 * Worse, uploading or painting a skin *set* `activeId`, so merely making a skin
 * changed how every existing level looked, with no confirmation and no separate
 * step. That is the behaviour this module exists to replace.
 *
 * Now there are two layers and the level wins:
 *
 *     level override  →  library default  →  built-in art
 *
 * The level's value is deliberately three-state, which is the part that makes
 * "defaults stay put" expressible at all:
 *
 *   | value       | meaning                                                  |
 *   |-------------|----------------------------------------------------------|
 *   | `undefined` | follow whatever the default is, now and later            |
 *   | a skin id   | this level wears that skin whatever the default becomes  |
 *   | `null`      | this level wears built-in art *despite* a default        |
 *
 * Every level saved before this has no `skins` field at all, so every brush
 * reads `undefined` and defers to the default — which still holds exactly the
 * `activeId` it always did. Nothing anyone has already made changes appearance,
 * and there is nothing to migrate.
 */

/** A level's own choices, keyed by Brush id (see Palette.ts). Absent keys mean
 * "follow the default" — see the table above for why a missing key and a `null`
 * are deliberately not the same thing. */
export type LevelSkins = Record<string, string | null>;

/** Where the skin currently on screen came from. Drives the picker's trigger
 * label, so the UI never re-derives this rule and drifts from it. */
export type SkinSource = "level" | "default" | "builtin";

/**
 * The skin id to render with, or null for the brush's built-in art.
 *
 * Takes the three facts rather than the whole library so it stays pure and
 * trivially testable: the level's own value for this brush, the library's
 * default for it, and which ids that brush actually still has.
 *
 * `availableIds` is what makes a deleted skin safe. A level can name a skin
 * that has since been removed from the library — nothing stops someone deleting
 * one — and the answer is to fall through to the next layer rather than render
 * nothing or throw. That matches how `removeCustomSkin` already degrades: it
 * drops `activeId` to null rather than silently promoting some other skin.
 */
export function resolveSkinId(
  levelChoice: string | null | undefined,
  defaultId: string | null | undefined,
  availableIds: readonly string[],
): string | null {
  // An explicit null is a decision, not an absence: this level wants the
  // built-in art and must not pick up a default set later.
  if (levelChoice === null) return null;
  if (levelChoice !== undefined && availableIds.includes(levelChoice)) return levelChoice;
  if (defaultId && availableIds.includes(defaultId)) return defaultId;
  return null;
}

/** Which layer `resolveSkinId` ended up answering from. A level that pinned
 * built-in art reports "level" — it did decide, it just decided on nothing —
 * while a level that named a since-deleted skin reports whatever layer actually
 * supplied the answer, because that is what is on screen. */
export function skinSource(
  levelChoice: string | null | undefined,
  defaultId: string | null | undefined,
  availableIds: readonly string[],
): SkinSource {
  if (levelChoice === null) return "level";
  if (levelChoice !== undefined && availableIds.includes(levelChoice)) return "level";
  if (defaultId && availableIds.includes(defaultId)) return "default";
  return "builtin";
}

/**
 * The level's next skin map after choosing `choice` for `brushId`.
 *
 * `undefined` deletes the key rather than storing a sentinel — "follow the
 * default" is the absence of a decision, and writing something to mean nothing
 * would put a value in every saved level for every brush anyone ever opened the
 * picker on. Returns a new object; never mutates its input, so callers can
 * compare against the old one to decide whether the level is dirty.
 */
export function withLevelSkin(
  levelSkins: LevelSkins | undefined,
  brushId: string,
  choice: string | null | undefined,
): LevelSkins {
  const next: LevelSkins = { ...levelSkins };
  if (choice === undefined) delete next[brushId];
  else next[brushId] = choice;
  return next;
}

/** Drops anything a hand-edited or corrupt file might hold that isn't a skin id
 * or an explicit null, so one bad entry can't reach the resolver. Returns
 * undefined for "nothing worth keeping", matching the field being optional. */
export function sanitizeLevelSkins(value: unknown): LevelSkins | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const clean: LevelSkins = {};
  for (const [brushId, choice] of Object.entries(value as Record<string, unknown>)) {
    if (choice === null || typeof choice === "string") clean[brushId] = choice;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}
