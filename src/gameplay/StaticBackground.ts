import Phaser from "phaser";
import { GAME_HEIGHT } from "../config/gameConfig";

/**
 * A plain, non-scrolling background: one Image, scaled to cover the
 * level's placeable viewport (like CSS `background-size: cover`) and
 * centered, masked to that viewport exactly like ParallaxBackground was —
 * see that file for why the mask matters (painting past the level's
 * placeable width recreates the "looks like part of the level but clicks
 * there are rejected" bug). No zoom slack, no per-frame pan needed since
 * nothing is meant to move; `update()` is a no-op kept only so PlayScene's
 * call site doesn't need to change if/when the fuller parallax version
 * comes back. Which image renders is a level-level choice (see
 * level/staticBackgrounds.ts for the small pool and its default) — the
 * caller resolves that and passes the texture key straight in.
 */
export class StaticBackground {
  private image: Phaser.GameObjects.Image;
  private maskShape: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, viewportWidth: number, textureKey: string) {
    this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskShape.fillRect(0, 0, viewportWidth, GAME_HEIGHT);
    const mask = this.maskShape.createGeometryMask();

    this.image = scene.add
      .image(viewportWidth / 2, GAME_HEIGHT / 2, textureKey)
      .setScrollFactor(0)
      .setDepth(-100)
      .setMask(mask);

    // Cover-fit: scale by whichever axis needs it more so the image never
    // falls short of the viewport on either dimension — each source in the
    // pool is its own native size/aspect, none pre-cropped to any
    // particular canvas.
    const scale = Math.max(viewportWidth / this.image.width, GAME_HEIGHT / this.image.height);
    this.image.setScale(scale);
  }

  /** No-op — see class docstring. */
  update(_playerX: number): void {}

  destroy(): void {
    this.image.destroy();
    this.maskShape.destroy();
  }
}
