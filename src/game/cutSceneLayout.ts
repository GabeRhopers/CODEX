/**
 * Where things sit in a cut-scene panel, as fractions rather than pixels.
 *
 * Two screens draw the same panel at two sizes: `CutSceneScene` fills the canvas,
 * and the Cut Scene Maker shows a small preview beside the fields. They have to
 * agree, because the preview is where an author positions characters — if the
 * band is a different share of the height in each, somebody places a character
 * standing on the ground and finds them behind the caption on the link.
 *
 * So the shape lives here once, in fractions, and each screen multiplies by its
 * own box. Pure, and tested without a browser.
 */

import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";

/**
 * The words band, at full canvas size.
 *
 * A caption that lands on somebody's face is the usual way this looks wrong, and
 * a fixed band is also a fixed place for the eye to return to.
 */
export const BAND_HEIGHT = 132;

/** The share of a panel's height the words band takes. */
export const BAND_FRACTION = BAND_HEIGHT / GAME_HEIGHT;

/** The part of a panel a character can stand in: everything above the band. */
export function stageHeightOf(panelHeight: number): number {
  return panelHeight * (1 - BAND_FRACTION);
}

/** The band's height for a panel drawn at `panelHeight`. */
export function bandHeightOf(panelHeight: number): number {
  return Math.round(panelHeight * BAND_FRACTION);
}

/**
 * How much to shrink an actor drawn in a panel of `panelWidth`.
 *
 * An actor's `scale` is expressed at full canvas size — 1 means "the size it is
 * in a level" — so any smaller rendering has to shrink it by the same ratio as
 * the panel, or the preview shows a giant.
 */
export function actorScaleFor(panelWidth: number, scale = 1): number {
  return scale * (panelWidth / GAME_WIDTH);
}

/**
 * The sizes the −/+ buttons step through.
 *
 * A short list rather than free zoom: an author wants "a bit bigger", not a
 * number, and a fixed ladder means two characters set to the same step are
 * exactly the same size as each other.
 *
 * **The ladder starts at 1 and the default is 2**, which is not where it started.
 * 1 is "the size it is in a level", and a level shows 20 tiles across 640px while
 * a panel is the full 1050 — so a character who fills a twentieth of a level
 * fills a thirty-third of a panel, and the first screenshot of this was two
 * characters the size of a word. Nothing below 1 is offered: a story wants
 * somebody you can see.
 */
export const ACTOR_SCALES = [1, 1.5, 2, 2.5, 3, 4] as const;

export const DEFAULT_ACTOR_SCALE = 2;

/**
 * Where the *n*th character added to a panel starts.
 *
 * Not all in the middle, which is what this did first: tap two characters and
 * the second lands exactly on the first, hiding it, so it reads as nothing
 * having happened. They fan out across the middle of the stage instead, and
 * `y: 1` stands them on its floor. Wrapping after five is fine — by then the
 * author is dragging anyway, and five is more than any panel here has wanted.
 */
export function placementFor(existing: number): { x: number; y: number } {
  const lane = existing % 5;
  return { x: 0.3 + lane * 0.1, y: 1 };
}

/** The next size up or down, clamped at both ends. Returns the size it was given
 * when there is nowhere further to go, so a caller can skip a redraw. */
export function stepActorScale(scale: number, direction: -1 | 1): number {
  // Nearest rather than exact: a scale saved before this ladder existed, or
  // written by hand into a bundle, still steps somewhere sensible.
  let nearest = 0;
  for (let i = 1; i < ACTOR_SCALES.length; i += 1) {
    if (Math.abs(ACTOR_SCALES[i] - scale) < Math.abs(ACTOR_SCALES[nearest] - scale)) nearest = i;
  }
  const target = nearest + direction;
  if (target < 0 || target >= ACTOR_SCALES.length) return scale;
  return ACTOR_SCALES[target];
}
