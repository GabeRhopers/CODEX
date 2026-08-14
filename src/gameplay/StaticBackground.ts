import Phaser from "phaser";
import { GRID_ORIGIN_X, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

const VIEWPORT_HEIGHT = GRID_ROWS * TILE_SIZE;

/**
 * A plain, non-scrolling background: one Image, scaled to cover the
 * level's placeable viewport (like CSS `background-size: cover`) and
 * centered, masked to *exactly* that viewport (`GRID_ORIGIN_X` across,
 * `VIEWPORT_HEIGHT` down — see gameConfig.ts) exactly like
 * ParallaxBackground was — see that file for why the mask matters
 * (painting past the level's placeable area recreates the "looks like
 * part of the level but clicks there are rejected" bug). Masking both
 * axes, not just width, matters more now than it used to: the canvas is
 * taller than the grid too (room for the editor's side panels), so
 * without a height-bounded mask the background would bleed into the dead
 * space below the grid the same way it used to bleed into the margin
 * beside it. No zoom slack, no per-frame pan needed since nothing is
 * meant to move; `update()` is a no-op kept only so PlayScene's call site
 * doesn't need to change if/when the fuller parallax version comes back.
 * Which image renders is a level-level choice (see
 * level/staticBackgrounds.ts for the small pool and its default) — the
 * caller resolves that and passes the texture key straight in.
 */
export class StaticBackground {
  private image: Phaser.GameObjects.Image;
  private maskShape: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, viewportWidth: number, textureKey: string) {
    this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskShape.fillRect(GRID_ORIGIN_X, 0, viewportWidth, VIEWPORT_HEIGHT);
    const mask = this.maskShape.createGeometryMask();

    this.image = scene.add
      .image(GRID_ORIGIN_X + viewportWidth / 2, VIEWPORT_HEIGHT / 2, textureKey)
      .setScrollFactor(0)
      .setDepth(-100)
      .setMask(mask);

    // Cover-fit: scale by whichever axis needs it more so the image never
    // falls short of the viewport on either dimension — each source in the
    // pool is its own native size/aspect, none pre-cropped to any
    // particular canvas.
    const scale = Math.max(viewportWidth / this.image.width, VIEWPORT_HEIGHT / this.image.height);
    this.image.setScale(scale);
  }

  /** No-op — see class docstring. */
  update(_playerX: number): void {}

  destroy(): void {
    this.image.destroy();
    this.maskShape.destroy();
  }
}
