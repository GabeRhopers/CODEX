/**
 * Where a row of variable-width buttons goes.
 *
 * The thing form's Sound row placed eight buttons on a fixed 62px step while
 * the buttons are text-width, so the *gap* between them varied with how long
 * each label happened to be. Measured on 2026-10-19: 10, 4, 6, 25, 21, 12 and
 * 2 scene px, in one row. The 2px was between 🎲 Roll and ▶ Play — the two
 * buttons that are not sound choices at all — while "Hit" and "Blip", which are
 * alternatives in the same set, sat 25px apart. The eye groups by whitespace,
 * so the row read as the opposite of its own structure.
 *
 * Phaser-free on purpose. Measuring a rendered label needs a scene; deciding
 * where the next one starts does not, and it is the half that can be wrong
 * without anybody noticing — a layout bug looks like a layout, not like a
 * crash. The scene measures, this decides.
 */

export interface RowItem {
  /** The rendered width of the thing being placed. */
  width: number;
  /**
   * True when this item begins a new group — it gets `groupGap` in front of it
   * instead of `gap`. The Sound row has exactly one: 🎲 Roll, where the row
   * stops offering choices and starts offering actions.
   */
  startsGroup?: boolean;
}

export interface RowSpacing {
  /** Between items in the same group. */
  gap: number;
  /** Before an item that starts a new one. Wider, or the grouping is invisible. */
  groupGap: number;
}

/**
 * The left edge of each item, in order, starting at `startX`.
 *
 * Every item's own width is taken into account, so the gap between any two
 * neighbours is exactly `gap` (or `groupGap`) whatever their labels say. A
 * zero-width item is not special-cased: it still consumes its gap, because an
 * empty label is a bug upstream and hiding it here would make that harder to
 * see, not easier.
 */
export function rowPositions(items: readonly RowItem[], startX: number, spacing: RowSpacing): number[] {
  const xs: number[] = [];
  let x = startX;
  for (const [i, item] of items.entries()) {
    if (i > 0) x += item.startsGroup ? spacing.groupGap : spacing.gap;
    xs.push(x);
    x += item.width;
  }
  return xs;
}

/** Where the row ends — the right edge of its last item. Callers use it to
 * check the row still finishes clear of whatever sits beside it, which is the
 * constraint the old fixed step was tuned for and the one most easily lost when
 * spacing changes. */
export function rowEnd(items: readonly RowItem[], startX: number, spacing: RowSpacing): number {
  if (items.length === 0) return startX;
  const xs = rowPositions(items, startX, spacing);
  return xs[xs.length - 1] + items[items.length - 1].width;
}
