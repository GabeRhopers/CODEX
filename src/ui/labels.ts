/**
 * Cutting a label down to the room it has.
 *
 * The World Maker draws a level's name under its map node, in a cell about 86px
 * wide. Names are whatever someone typed — "Goly moly fluded temple" is a real
 * one — so untruncated they simply overlap the neighbouring node's label and the
 * row stops being readable at all.
 *
 * Truncating rather than wrapping is deliberate: a wrapped name on the bottom
 * row grows downward into the toolbar under the map, and the thing being fixed
 * is names running into each other, which only cutting them solves.
 *
 * Pure, no Phaser, so the rule is testable on its own.
 */

/** The character Phaser's default font renders for an ellipsis. A real "…" is
 * one glyph rather than three dots, so it costs less of the width it is there
 * to save. */
const ELLIPSIS = "…";

/**
 * `text` if it fits in `maxChars`, otherwise cut to fit *including* the
 * ellipsis, so the result is never longer than the budget it was given.
 *
 * Trailing whitespace is dropped before the ellipsis is added — "Green …" reads
 * as a mistake where "Green…" reads as a name that continues.
 */
export function ellipsize(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars === 1) return ELLIPSIS;
  return text.slice(0, maxChars - 1).trimEnd() + ELLIPSIS;
}
