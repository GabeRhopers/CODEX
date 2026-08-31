import { Brush } from "./Palette";

/**
 * Splitting the palette's icon grid across pages.
 *
 * The grid has room for exactly five rows between the category chip and the
 * skin picker below it, and two of the five categories (Blocks, Decor) already
 * use all five. So the moment a player invents their own entity type there is
 * nowhere to draw it: it would land past the skin picker, off the panel, and be
 * unreachable. Custom entities are the point of the whole feature, so the grid
 * has to page.
 *
 * The wrapping rule is not "n per page" because it is not "n per row" either —
 * `Brush.groupEnd` forces a row break so related brushes stay visually grouped
 * (see Palette.ts), and a page that ignored it would put a group's tail on the
 * next page while leaving a hole behind. So pages are filled by *rows*, using
 * the same walk the renderer uses to place icons.
 *
 * Pure, no Phaser, so the wrapping is testable on its own — same split
 * ui/pager.ts uses for the row-based screens.
 */

/** Where one brush's icon sits: its column, and its row *within its page*. */
export interface BrushSlot {
  brush: Brush;
  col: number;
  row: number;
}

/**
 * Lays `brushes` out into pages of at most `maxRows` rows of `cols` columns.
 *
 * Always returns at least one page, so a caller can render `pages[page]`
 * without a length check — an empty category is an empty page, not a crash.
 */
export function paginateBrushes(brushes: readonly Brush[], maxRows: number, cols: number): BrushSlot[][] {
  const rows = Math.max(1, maxRows);
  const columns = Math.max(1, cols);
  const pages: BrushSlot[][] = [[]];
  let col = 0;
  let row = 0;

  for (const brush of brushes) {
    if (row >= rows) {
      pages.push([]);
      col = 0;
      row = 0;
    }
    pages[pages.length - 1].push({ brush, col, row });
    if (brush.groupEnd || col === columns - 1) {
      col = 0;
      row += 1;
    } else {
      col += 1;
    }
  }

  return pages;
}

/**
 * The layout to actually draw: five rows when the category fits in five, four
 * when it does not, because the pager itself needs the fifth row's space.
 *
 * Two passes rather than one, so that adding paging changed *nothing* about the
 * five categories that shipped before it — each still fills all five rows on a
 * single page, and no existing brush moved.
 */
export function layOutBrushes(brushes: readonly Brush[], maxRows: number, cols: number): BrushSlot[][] {
  const full = paginateBrushes(brushes, maxRows, cols);
  return full.length === 1 ? full : paginateBrushes(brushes, maxRows - 1, cols);
}

/** Which page a brush is on, or -1 when it is not in this layout at all (the
 * selected brush belongs to another category). */
export function pageOfBrush(pages: readonly BrushSlot[][], brushId: string): number {
  return pages.findIndex((page) => page.some((slot) => slot.brush.id === brushId));
}
