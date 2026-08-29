/**
 * Splitting a list across pages, for screens whose rows would otherwise run off
 * the bottom of a fixed-height canvas.
 *
 * Every browser screen in this project lays its rows out as `start + i * height`
 * with nothing checking that the last one is still on screen, and the canvas is
 * 468px tall: My Levels and My Worlds fit exactly **eight** rows, so a ninth
 * saved level was drawn past the bottom edge and could not be reached at all.
 * The World Maker had the same bug against its own list (fixed 2026-08-28) —
 * this is that fix, extracted so all four screens share one copy rather than
 * four subtly different ones.
 *
 * Pure, no Phaser, so the paging rules are testable on their own.
 */

/** How many rows fit between `startY` and `bottomY` at `rowHeight`. At least
 * one, so a cramped layout still shows something rather than an empty page. */
export function rowsPerPage(startY: number, bottomY: number, rowHeight: number): number {
  return Math.max(1, Math.floor((bottomY - startY) / rowHeight));
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * Clamps a page index to one that still exists.
 *
 * Pages empty out from under you: deleting the only level on page 3, or adding
 * the last available one to a world, leaves you looking at a page that no longer
 * has anything on it. Without this the screen goes blank and looks broken rather
 * than showing the new end of the list.
 */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(0, page), pageCount(total, perPage) - 1);
}

/** The slice of `items` shown on `page`. */
export function pageSlice<T>(items: readonly T[], page: number, perPage: number): T[] {
  const safe = clampPage(page, items.length, perPage);
  return items.slice(safe * perPage, safe * perPage + perPage);
}

/** What the pager reads, e.g. "Page 2 of 3". Only worth showing at all when
 * there is more than one page — `pageCount` of 1 means the list fits. */
export function pageLabel(page: number, total: number, perPage: number): string {
  return `Page ${clampPage(page, total, perPage) + 1} of ${pageCount(total, perPage)}`;
}
