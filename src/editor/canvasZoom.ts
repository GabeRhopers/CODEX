/**
 * The Skin Creator's zoom/pan arithmetic, kept pure and away from the DOM.
 *
 * Why this exists at all: the painting canvas is square and the scene is a fixed
 * 468px tall (GAME_HEIGHT). The pre-2026-08-23 zoom grew the canvas itself
 * within the space left over, which capped it at a 1.6x range (200px to 320px,
 * or 4.2 to 6.7 screen pixels per cell on the 48-cell character grid). That is
 * not enough magnification to place one pixel with confidence, and no amount of
 * layout reshuffling fixes it: reclaiming every row above the canvas would buy
 * about 10%.
 *
 * So the canvas is allowed to grow *past* a fixed window instead, and the
 * window pans — the ordinary model every pixel-art tool uses. This module owns
 * the two things that then have to be right (which zoom level, and where the
 * content sits inside the window) so they can be tested without a browser.
 */

/**
 * The window the drawing is seen through, in game units.
 *
 * **448 is not a preference, it is the ceiling.** The scene is a fixed 468px
 * tall (GAME_HEIGHT) and the drawing is square, so the largest window that can
 * exist is the screen height less a margin at each end — 10 + 448 + 10. There
 * is no layout cleverness left after this one; the only way past it would be a
 * taller scene.
 *
 * Getting there took the last row off the screen. 320 became 384 on 2026-09-05
 * when four stacked full-width rows above the canvas collapsed into one footer
 * line plus two side columns; 384 became this on 2026-09-24 when that footer
 * went too, its name field, Back, Undo/Redo/Save and status line moving into
 * the side columns, which had run out of things to hold long before they ran
 * out of room. A cell at fit zoom on the 32 grid goes 12.19px → 14.63px →
 * 17.07px across those two changes: 96% more area than the original.
 *
 * The horizontal fit is the tighter one and was measured rather than assumed:
 * the left column's widest control is the 190px palette chip at x=120, ending
 * at 310, and the right rail starts at 778, which leaves 468 for a 448 window
 * and a 10px gutter either side. See SkinEditorScene's canvas-mode layout.
 */
export const VIEWPORT_SIZE = 448;

/**
 * Zoom as a multiple of "the whole sprite exactly fills the window", rather
 * than as an absolute pixel size — the meaningful unit here is "how much bigger
 * than the whole thing", and it stays meaningful across both the 32-cell and
 * 48-cell grids without a second ladder.
 *
 * Geometric, not linear: the old +40px step was a 20% change at the bottom of
 * its range and 12% at the top, so clicks did progressively less. Every step
 * here is a real jump. The ends give 3.3px per cell (48 grid, zoomed out to see
 * the silhouette small) up to 53px per cell (zoomed in to place one pixel) —
 * a 20x range against the old 1.6x.
 *
 * **0.4 exists because the window grew.** The bottom of this ladder has to
 * leave the drawing smaller than the old grow-the-canvas floor of 200px, or
 * zooming out would mean less than it used to — and a 448 window at 0.5 is
 * 224px, above that floor. One more step down restores it at 179px.
 *
 * 0.4 rather than the 0.375 the geometric pattern points at, because this
 * number is *read out on screen* (see formatZoom, and the ×1 under the zoom
 * buttons). "×0.4" is a number a child can read; "×0.375" is three decimal
 * places of arithmetic nobody asked for. A x1.25 step is still a real jump,
 * which is the property the ladder actually cares about — the +40px step it
 * replaced did 20% at one end and 12% at the other.
 */
export const ZOOM_FACTORS = [0.4, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

/** Index of 1.0 — the whole sprite, exactly filling the window. Read
 * symbolically everywhere, which is why adding a step below it costs nothing. */
export const FIT_INDEX = 3;

export function clampZoomIndex(index: number): number {
  if (!Number.isFinite(index)) return FIT_INDEX;
  return Math.min(ZOOM_FACTORS.length - 1, Math.max(0, Math.round(index)));
}

export function stepZoomIndex(index: number, delta: number): number {
  return clampZoomIndex(clampZoomIndex(index) + delta);
}

export function zoomFactorAt(index: number): number {
  return ZOOM_FACTORS[clampZoomIndex(index)];
}

/** How big the drawing is on screen, in game units, at a given zoom level. */
export function contentSizeFor(viewportSize: number, index: number): number {
  return viewportSize * zoomFactorAt(index);
}

/**
 * Where the content's top-left corner sits inside the window, in game units —
 * negative once the content is bigger than the window.
 *
 * Two regimes, and conflating them is the bug this function exists to prevent:
 * when the content *fits*, there is nothing to pan and it is centred (so
 * zooming out leaves the sprite in the middle of the window rather than pinned
 * to a corner); when it does not fit, the offset is clamped so the content
 * always covers the window edge to edge. No empty gutters at high zoom, and no
 * way to lose the drawing off-screen entirely.
 */
export function clampPan(pan: number, contentSize: number, viewportSize: number): number {
  if (contentSize <= viewportSize) return (viewportSize - contentSize) / 2;
  return Math.min(0, Math.max(viewportSize - contentSize, pan));
}

/**
 * The pan that keeps whatever content point currently sits under `anchor`
 * sitting under it after a zoom change — `anchor` being a position inside the
 * window (0..viewportSize).
 *
 * This is what makes Ctrl+wheel zoom at the pointer feel like zooming rather
 * than teleporting, and what the +/- buttons use with the window's own centre
 * so the thing you were looking at stays the thing you are looking at.
 */
export function panForAnchor(
  pan: number,
  oldContentSize: number,
  newContentSize: number,
  anchor: number,
  viewportSize: number,
): number {
  // Guard a zero-size content rather than dividing by it — reachable only if a
  // caller passes a nonsense viewport, but the fallback (centre on the anchor)
  // is at least sane.
  const fraction = oldContentSize > 0 ? (anchor - pan) / oldContentSize : 0.5;
  return clampPan(anchor - fraction * newContentSize, newContentSize, viewportSize);
}

/**
 * Below this many screen pixels a checkerboard square stops reading as "this
 * area is empty" and starts being visual noise. 8 is what the board was fixed
 * at before it was made cell-aware, so the busiest case it can reach now is the
 * one that always shipped.
 */
const MIN_CHECKER_PX = 8;

/**
 * On-screen size of one square of the transparency checkerboard, in CSS pixels
 * — always a **whole number of cells**.
 *
 * The board used to be a flat 16px tile (two 8px squares) at every zoom, on the
 * reasoning that it answers "is this transparent", a question about what you can
 * see rather than about the grid. That reasoning is sound and the result was
 * still wrong, because of what an empty canvas actually is: nothing *but* this
 * board, with the grid lines off by default. Its squares are therefore the only
 * grid a first-time user has, and they were not the grid. At fit zoom on the 32
 * canvas a cell is 12.19px against an 8px square, so the squares you count are
 * two thirds of the cells you paint and every stroke straddles them. Reported
 * from use, in those words.
 *
 * Whole cells rather than one-square-per-cell: at the bottom of the zoom ladder
 * a cell is 3.3px, and a board that fine is a shimmer. Grouping cells keeps the
 * squares comfortable to look at while every square boundary stays on a cell
 * boundary, which is the property that was missing.
 *
 * Deliberately *not* clamped from above. One square per cell at ×8 zoom is a
 * board of 97px squares, which looks like a lot until you notice it is telling
 * you exactly where each pixel you are placing begins and ends — the reason to
 * be zoomed in that far at all.
 */
export function checkerSquarePx(contentPx: number, gridSize: number): number {
  // A zero-width content box happens for real: reposition() runs before the
  // game canvas has been laid out. Returning the floor keeps the CSS valid
  // rather than writing NaN into background-size.
  if (!(contentPx > 0) || !(gridSize > 0)) return MIN_CHECKER_PX;
  const cellPx = contentPx / gridSize;
  const cellsPerSquare = Math.min(gridSize, Math.max(1, Math.ceil(MIN_CHECKER_PX / cellPx)));
  return cellsPerSquare * cellPx;
}

/** The readout beside the zoom buttons — "×1" at fit, "×0.5" zoomed out. */
export function formatZoom(index: number): string {
  return `×${zoomFactorAt(index)}`;
}
