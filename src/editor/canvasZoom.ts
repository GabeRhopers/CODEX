/**
 * The Skin Creator's zoom/pan arithmetic, kept pure and away from the DOM.
 *
 * Why this exists at all: the painting canvas is square, its top is pinned at
 * y=132, and the scene is a fixed 468px tall (GAME_HEIGHT) — so there are 336
 * vertical pixels to spend and no more. The pre-2026-08-23 zoom grew the canvas
 * itself within that band, which capped it at a 1.6x range (200px to 320px, or
 * 4.2 to 6.7 screen pixels per cell on the 48-cell character grid). That is not
 * enough magnification to place one pixel with confidence, and no amount of
 * layout reshuffling fixes it: reclaiming every row above the canvas would buy
 * about 10%.
 *
 * So the canvas is allowed to grow *past* a fixed window instead, and the
 * window pans — the ordinary model every pixel-art tool uses. This module owns
 * the two things that then have to be right (which zoom level, and where the
 * content sits inside the window) so they can be tested without a browser.
 */

/**
 * The window the drawing is seen through, in game units. 320 is exactly the old
 * maximum: at fit zoom the canvas is as large as the largest it could ever be
 * before, so this change costs nobody anything at the default. 132 + 320 = 452
 * leaves 16px before the scene's floor.
 */
export const VIEWPORT_SIZE = 320;

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
 * a 16x range against the old 1.6x.
 */
export const ZOOM_FACTORS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

/** Index of 1.0 — the whole sprite, exactly filling the window. */
export const FIT_INDEX = 2;

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

/** The readout beside the zoom buttons — "×1" at fit, "×0.5" zoomed out. */
export function formatZoom(index: number): string {
  return `×${zoomFactorAt(index)}`;
}
