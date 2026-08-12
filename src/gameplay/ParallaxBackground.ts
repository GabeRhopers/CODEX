import Phaser from "phaser";
import { GAME_HEIGHT } from "../config/gameConfig";
import { backgroundScene, BackgroundSceneId } from "../level/backgrounds";

/** How much larger than the viewport each layer's image is scaled — the
 * "fake parallax" trick: because the image is always bigger than what's
 * shown, there's slack to pan it a little as the player moves without ever
 * uncovering an edge, unlike the old tiling TileSprite this replaced. */
const ZOOM = 1.2;

/**
 * A depth illusion for an otherwise single-screen, non-scrolling level (see
 * plan doc M3 — real camera-follow scrolling is still deferred): each layer
 * is one large Image (see backgrounds.ts — every scene's layers are baked
 * to a fixed 2048x476 canvas) held at `ZOOM`x the viewport height, so it's
 * always wider than the viewport too. Panning it by a clamped fraction of
 * the player's X position — never further than the image's actual excess
 * width allows — is what sells the depth; because the clamp is derived
 * from the image's own size rather than assumed, an edge is *structurally*
 * impossible to reveal, not just unlikely at today's size caps.
 *
 * Rendered only across `viewportWidth` (the level's real placeable pixel
 * width), not the full canvas — the canvas is often wider than that to fit
 * the editor toolbar (see gameConfig.ts's GAME_WIDTH), and painting scenery
 * into that unplaceable margin is what made it look like part of the level
 * even though clicks there were always silently rejected.
 */
export class ParallaxBackground {
  private layers: { image: Phaser.GameObjects.Image; factor: number; maxOffset: number }[] = [];
  private viewportCenterX: number;
  // The zoomed image is deliberately much wider than the viewport (that's
  // where the pan room comes from) — without this, it would render past
  // the viewport's right edge and straight into the canvas's unplaceable
  // toolbar margin, recreating the exact bug this class exists to fix. One
  // rectangular mask, shared by every layer, clips each to just the
  // viewport regardless of how far the image itself extends either side.
  private maskShape: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, backgroundId: BackgroundSceneId, viewportWidth: number) {
    this.viewportCenterX = viewportWidth / 2;
    this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskShape.fillRect(0, 0, viewportWidth, GAME_HEIGHT);
    const mask = this.maskShape.createGeometryMask();

    backgroundScene(backgroundId).layers.forEach((def, i) => {
      const image = scene.add
        .image(this.viewportCenterX, GAME_HEIGHT / 2, def.textureKey)
        .setScrollFactor(0)
        .setDepth(-100 + i)
        .setMask(mask);
      // Scale so the image's height covers the viewport with ZOOM to
      // spare; every source is a wide (~4:1+) landscape image at a fixed
      // 476px-tall canvas (matching GAME_HEIGHT), so this always leaves
      // displayWidth comfortably greater than viewportWidth too.
      image.setScale((GAME_HEIGHT * ZOOM) / image.height);
      const maxOffset = Math.max(0, (image.displayWidth - viewportWidth) / 2);
      this.layers.push({ image, factor: def.factor, maxOffset });
    });
    this.update(0);
  }

  /** Pass the player's world X each frame in Play mode; pass 0 in the
   * editor, where there's no player to track — the layers still render,
   * just centered and at rest. */
  update(playerX: number): void {
    for (const layer of this.layers) {
      const offset = Phaser.Math.Clamp(playerX * layer.factor, -layer.maxOffset, layer.maxOffset);
      layer.image.x = this.viewportCenterX - offset;
    }
  }

  /** Torn down when the editor's background picker cycles to a different
   * scene — a fresh instance replaces it rather than swapping textures in
   * place, since different scenes can have different layer counts. */
  destroy(): void {
    for (const layer of this.layers) layer.image.destroy();
    this.layers = [];
    this.maskShape.destroy();
  }
}
