/**
 * How big a tappable thing has to be, in game pixels.
 *
 * The canvas is a fixed GAME_WIDTH x GAME_HEIGHT that Phaser's Scale Manager
 * letterboxes down to whatever viewport it opens in (see main.ts), so a control's
 * *drawn* size and its *on-screen* size are different numbers. On a phone held
 * sideways — 844x390, the case this is sized for — the scale is 0.80, so a 32px
 * palette icon meets a thumb as 25.7 CSS px against Apple's and Google's 44/48
 * guidance. Every interactive thing in the editor was drawn at desktop density
 * and lands short the same way.
 *
 * The fix is not to redraw everything bigger: a hit area does not have to match
 * the art. Phaser accepts an explicit hit rectangle, so a 32px icon sitting in an
 * 80x54 grid cell can accept taps across its whole cell — the guideline, for no
 * layout change at all.
 *
 * Pure, no Phaser, so the sizing rule is testable on its own — same split
 * worldLayout.ts and canvasZoom.ts use.
 */

/** Apple's Human Interface Guidelines minimum; Material's is 48. */
export const GUIDELINE_CSS_PX = 44;

/**
 * The scale the game renders at on a phone held sideways.
 *
 * Scale.FIT takes the *smaller* of the two ratios, and on an 844x390 viewport
 * that is the width one (844/1050 = 0.804) rather than the height (390/468 =
 * 0.833) — the canvas is 2.24:1 and the phone 2.16:1, so it is a touch too wide
 * and width binds. Worth writing down, because assuming the other axis makes
 * every target here come out ~4% smaller than the arithmetic promised, which is
 * exactly enough to miss the guideline while claiming to meet it.
 */
export const PHONE_LANDSCAPE_SCALE = Math.min(844 / 1050, 390 / 468);

/** The guideline expressed in the units every layout constant in this project is
 * written in. Written as the arithmetic rather than the answer, so it stays
 * honest if the canvas is ever resized.
 *
 * Not every cell can afford it: the palette's rows are 54 game px and this is
 * 55, so a brush lands at 43.4 CSS px rather than 44. Buying the last 0.6px
 * would mean a taller row, which collides with the skin picker below the grid —
 * so the shortfall is recorded here rather than designed around. */
export const MIN_TAP_PX = Math.ceil(GUIDELINE_CSS_PX / PHONE_LANDSCAPE_SCALE);

export interface Size {
  width: number;
  height: number;
}

/**
 * The hit rectangle for one control: at least `min` on each axis where its cell
 * allows, never larger than the cell, never smaller than the art.
 *
 * The cell cap is the load-bearing part. Grid neighbours sit exactly one cell
 * apart, so a hit area that overflowed its cell would sit on top of the next
 * control's and a tap aimed at one would land on the other — a worse bug than
 * the small target it set out to fix. Where the cell is too small to reach the
 * guideline the cell wins and the target is simply as big as it can be; callers
 * that care can ask `reachesGuideline`.
 *
 * Returned in the local, origin-centred coordinates Phaser's `setInteractive`
 * hit-area rectangles use, so `x`/`y` are the offset from the object's centre.
 */
export function hitRectFor(content: Size, cell: Size, min = MIN_TAP_PX): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = Math.max(content.width, Math.min(min, cell.width));
  const height = Math.max(content.height, Math.min(min, cell.height));
  return { x: -width / 2, y: -height / 2, width, height };
}

/** Whether a control of this size in this cell can actually reach the guideline
 * — the honest answer for list rows, which cannot without being redesigned. */
export function reachesGuideline(content: Size, cell: Size, min = MIN_TAP_PX): boolean {
  const rect = hitRectFor(content, cell, min);
  return rect.width >= min && rect.height >= min;
}

/** The same rule for a circular control, which is what map nodes are: the
 * diameter is what has to reach `min`. Phaser hit areas stay rectangles — a
 * square over a circle is the standard trade, and slightly generous at the
 * corners is the right direction to be wrong in for a finger. */
export function hitRectForCircle(radius: number, cell: Size, min = MIN_TAP_PX): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return hitRectFor({ width: radius * 2, height: radius * 2 }, cell, min);
}

/**
 * The same rectangle in Phaser's own hit-area space.
 *
 * `hitRectFor` returns a rectangle around a centre, which is how a layout thinks
 * about it. Phaser does not: a hit area is in the object's *local* space, where
 * (0,0) is the top-left of its `width` x `height` — an Arc of radius 15 has
 * size 30x30 and its centre at (15, 15), not (0, 0). Handing Phaser the
 * centre-relative rectangle directly shifts the whole target up and left by half
 * the object, which reads as taps near the middle simply not registering.
 *
 * (Objects whose own size already *is* the target — a Zone — need none of this,
 * which is why Zones are the better tool wherever the target does not have to be
 * the drawn object itself.)
 */
export function localHitRect(
  objectSize: Size,
  hit: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: (objectSize.width - hit.width) / 2,
    y: (objectSize.height - hit.height) / 2,
    width: hit.width,
    height: hit.height,
  };
}

/** Hit-area arguments for a circular shape, ready to spread into
 * `new Phaser.Geom.Rectangle(...)`. Bundles the two easy mistakes — sizing from
 * the radius instead of the diameter, and forgetting the local-space shift —
 * into one call. */
export function circleHitArgs(radius: number, cell: Size, min = MIN_TAP_PX): [number, number, number, number] {
  const size = { width: radius * 2, height: radius * 2 };
  const rect = localHitRect(size, hitRectFor(size, cell, min));
  return [rect.x, rect.y, rect.width, rect.height];
}
