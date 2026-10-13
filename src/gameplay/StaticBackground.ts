import Phaser from "phaser";
import { coverFit } from "../ui/coverFit";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

const VIEWPORT_HEIGHT = GRID_ROWS * TILE_SIZE;

/**
 * A plain, non-scrolling background: one Image, scaled to cover the
 * level's placeable viewport (like CSS `background-size: cover`) and
 * centered, cropped to *exactly* that viewport (`GRID_ORIGIN_X` across,
 * starting at `GRID_ORIGIN_Y` down for `VIEWPORT_HEIGHT` — see
 * gameConfig.ts) exactly like ParallaxBackground was — see that file for
 * why the mask matters (painting past the level's placeable area
 * recreates the "looks like part of the level but clicks there are
 * rejected" bug). Masking both axes, not just width, matters more now
 * than it used to: the canvas is both wider and taller than the grid
 * (room for the editor's header/footer/side panels), so without a
 * height-bounded mask starting at GRID_ORIGIN_Y the background would
 * bleed into the header the same way it used to bleed into the margin
 * beside it. No zoom slack, no per-frame pan needed since nothing is
 * meant to move; `update()` is a no-op kept only so PlayScene's call site
 * doesn't need to change if/when the fuller parallax version comes back.
 * Which image renders is a level-level choice (see
 * level/staticBackgrounds.ts for the small pool and its default) — the
 * caller resolves that and passes the texture key straight in.
 */
export class StaticBackground {
  private image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, viewportWidth: number, textureKey: string) {
    this.image = scene.add
      .image(GRID_ORIGIN_X + viewportWidth / 2, GRID_ORIGIN_Y + VIEWPORT_HEIGHT / 2, textureKey)
      .setScrollFactor(0)
      .setDepth(-100);

    // Cropped rather than masked (2026-10-12). This was a Graphics object whose
    // whole content was one fillRect, turned into a geometry mask — a general
    // mechanism doing a rectangle's job. See ui/coverFit.ts for the arithmetic
    // and for why removing it mattered beyond tidiness.
    const fit = coverFit(this.image.width, this.image.height, viewportWidth, VIEWPORT_HEIGHT);
    this.image.setCrop(fit.crop.x, fit.crop.y, fit.crop.width, fit.crop.height).setScale(fit.scale);
  }

  /** No-op — see class docstring. */
  update(_playerX: number): void {}

  destroy(): void {
    this.image.destroy();
  }
}
