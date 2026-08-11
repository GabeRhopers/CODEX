import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LevelTheme } from "../level/themes";

interface ParallaxLayerDef {
  textureKey: string;
  /** Fraction of the player's X movement this layer shifts by — smaller
   * reads as "further away". 0 would be a fixed backdrop. */
  factor: number;
  tileScale: number;
}

/** Grass/desert use Kenney's real sky art (see BootScene.preload); castle
 * gets a procedural starfield in generateTextures.ts, same "real art where
 * it fits, procedural where it doesn't" split as the ground tileset. */
const PARALLAX_LAYERS: Record<LevelTheme, ParallaxLayerDef[]> = {
  grass: [
    { textureKey: "bg-grass-far", factor: 0.05, tileScale: 4 },
    { textureKey: "bg-grass-near", factor: 0.15, tileScale: 4 },
  ],
  desert: [
    { textureKey: "bg-desert-far", factor: 0.05, tileScale: 4 },
    { textureKey: "bg-desert-near", factor: 0.15, tileScale: 4 },
  ],
  castle: [
    { textureKey: "bg-castle-far", factor: 0.04, tileScale: 1 },
    { textureKey: "bg-castle-near", factor: 0.12, tileScale: 1 },
  ],
};

/**
 * A depth illusion for an otherwise single-screen, non-scrolling level (see
 * plan doc M3 — real camera-follow scrolling is still deferred): each layer
 * is a full-canvas TileSprite behind everything else, and its horizontal
 * texture offset is shifted by its own fraction of the player's X position
 * every frame, rather than the camera actually panning. Two layers per
 * theme (a plain-sky "far" layer, a hills/dunes-silhouette "near" layer)
 * moving at different rates is what sells the depth, the same trick 2D
 * platformers have used forever.
 */
export class ParallaxBackground {
  private layers: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];

  constructor(scene: Phaser.Scene, theme: LevelTheme) {
    PARALLAX_LAYERS[theme].forEach((def, i) => {
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
}
