/**
 * Filling a rectangle with an image, and clipping what hangs over the edges.
 *
 * Four screens wanted exactly this and each wrote it out again: the level
 * background, the world map's backdrop, a cut-scene panel's picture, and the
 * dormant parallax layers. Every one scaled by `Math.max(w/iw, h/ih)` — cover,
 * not contain, so the image never falls short on either axis — centred the
 * result on the rectangle, and then **clipped the overflow with a rectangular
 * geometry mask**: a `Graphics` object whose entire content was one `fillRect`.
 *
 * A crop does the same job without the mask. That is worth something beyond
 * tidiness: Phaser 4's migration guide says "GeometryMask remains available in
 * Canvas only" and names no WebGL replacement, and this game runs `Phaser.AUTO`.
 * Those four masks were the whole of the project's exposure to that change.
 *
 * Phaser-free on purpose, and the reason is the failure mode. `setCrop` works in
 * the texture's **own unscaled pixels**, while every number the callers have is
 * in screen pixels — so the conversion is a division that is easy to get subtly
 * wrong, and getting it wrong does not throw. It shows a background zoomed into
 * one corner, which is a defect this project has actually shipped and found by
 * looking rather than by asserting. Arithmetic that can fail quietly belongs
 * somewhere a unit test can reach it.
 */

export interface CoverFit {
  /** Uniform scale for the image, so the crop below exactly fills the rect. */
  scale: number;
  /** The visible region, in the texture's own unscaled pixels — straight into
   * `setCrop(x, y, width, height)`. */
  crop: { x: number; y: number; width: number; height: number };
}

/**
 * How to scale and crop a `textureWidth` x `textureHeight` image so it covers a
 * `rectWidth` x `rectHeight` rectangle with no gaps and nothing spilling out.
 *
 * The crop is centred, which is what makes this a drop-in for the masks it
 * replaces: those centred the image on the rect and clipped symmetrically, so
 * the same middle of the picture stays on screen.
 *
 * A non-positive dimension returns a scale of 1 and an empty crop rather than
 * dividing by zero — a texture that has not finished loading reports width 0,
 * and the honest answer there is "nothing to show yet", not `Infinity`.
 */
export function coverFit(
  textureWidth: number,
  textureHeight: number,
  rectWidth: number,
  rectHeight: number,
): CoverFit {
  if (!(textureWidth > 0) || !(textureHeight > 0) || !(rectWidth > 0) || !(rectHeight > 0)) {
    return { scale: 1, crop: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const scale = Math.max(rectWidth / textureWidth, rectHeight / textureHeight);
  // Clamped to the texture because the axis that *drove* the scale divides back
  // to exactly its own size, and floating point can land a hair above it — a
  // crop wider than the frame is a Phaser error rather than a wrong picture.
  const width = Math.min(textureWidth, rectWidth / scale);
  const height = Math.min(textureHeight, rectHeight / scale);

  return {
    scale,
    crop: { x: (textureWidth - width) / 2, y: (textureHeight - height) / 2, width, height },
  };
}
