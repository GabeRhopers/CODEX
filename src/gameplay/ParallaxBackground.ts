import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { backgroundScene, BackgroundSceneId } from "../level/backgrounds";

/**
 * A depth illusion for an otherwise single-screen, non-scrolling level (see
 * plan doc M3 — real camera-follow scrolling is still deferred): each layer
 * is a full-canvas TileSprite behind everything else, and its horizontal
 * texture offset is shifted by its own fraction of the player's X position
 * every frame, rather than the camera actually panning. Two layers per
 * scene (a slow "far" layer, a faster "near" layer) moving at different
 * rates is what sells the depth, the same trick 2D platformers have used
 * forever. Which scene renders is a level-level choice independent of its
 * theme — see backgrounds.ts.
 */
export class ParallaxBackground {
  private layers: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];

  constructor(scene: Phaser.Scene, backgroundId: BackgroundSceneId) {
    backgroundScene(backgroundId).layers.forEach((def, i) => {
      const sprite = scene.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, def.textureKey)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-100 + i)
        .setTileScale(def.tileScale, def.tileScale);
      this.layers.push({ sprite, factor: def.factor });
    });
  }

  /** Pass the player's world X each frame in Play mode; pass a fixed value
   * (0 is fine) in the editor, where there's no player to track — the
   * layers still render, just without the motion. */
  update(playerX: number): void {
    for (const layer of this.layers) {
      layer.sprite.tilePositionX = playerX * layer.factor;
    }
  }

  /** Torn down when the editor's background picker cycles to a different
   * scene — a fresh instance replaces it rather than swapping textures in
   * place, since different scenes can have different layer counts. */
  destroy(): void {
    for (const layer of this.layers) layer.sprite.destroy();
    this.layers = [];
  }
}
