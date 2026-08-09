import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";

/**
 * Procedurally generated placeholder pixel art for tiles/markers/UI. The
 * build sandbox's network proxy blocks kenney.nl / OpenGameArt / unpkg /
 * jsdelivr (only the npm registry and github.com are reachable), so real
 * Kenney CC0 assets can't be fetched from here. These textures are simple,
 * deliberately blocky shapes drawn with Phaser's Graphics API and baked via
 * generateTexture — zero licensing risk, zero network dependency, and
 * (with `pixelArt: true` in the game config) they still validate that
 * nearest-neighbor rendering is crisp. Swap these for real Kenney PNGs
 * later by changing only the `scene.load.image(...)` calls that would
 * replace this module.
 *
 * The player, the goal, and the ghost-pillow enemy are the exceptions:
 * they're real drawn art (see public/assets/), loaded like any other
 * image asset rather than generated here.
 */
export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // Ground tile: grass-top dirt block.
  g.clear();
  g.fillStyle(0x8b5a2b, 1);
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(0x4caf50, 1);
  g.fillRect(0, 0, TILE_SIZE, 8);
  g.fillStyle(0x6b3f1d, 1);
  g.fillRect(2, 12, 4, 4);
  g.fillRect(20, 20, 4, 4);
  g.fillRect(10, 24, 5, 4);
  g.lineStyle(1, 0x000000, 0.35);
  g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.generateTexture("tile-ground", TILE_SIZE, TILE_SIZE);

  // Eraser palette icon: red X on light gray.
  g.clear();
  g.fillStyle(0xdddddd, 1);
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.lineStyle(4, 0xd32f2f, 1);
  g.lineBetween(6, 6, TILE_SIZE - 6, TILE_SIZE - 6);
  g.lineBetween(TILE_SIZE - 6, 6, 6, TILE_SIZE - 6);
  g.lineStyle(1, 0x000000, 0.35);
  g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.generateTexture("tile-eraser", TILE_SIZE, TILE_SIZE);

  // Spawn marker: downward blue arrow.
  g.clear();
  g.fillStyle(0x2196f3, 1);
  g.fillRect(TILE_SIZE / 2 - 3, 4, 6, 14);
  g.fillTriangle(TILE_SIZE / 2 - 9, 16, TILE_SIZE / 2 + 9, 16, TILE_SIZE / 2, 28);
  g.generateTexture("marker-spawn", TILE_SIZE, TILE_SIZE);

  // Player character, the goal (dream cloud portal), and the ghost-pillow
  // enemy are all loaded from public/assets/ rather than generated here —
  // see BootScene.preload, gameplay/wizardAnimation.ts, and
  // gameplay/EnemyBehaviors.ts.

  // Hover highlight overlay for the editor grid.
  g.clear();
  g.fillStyle(0xffffff, 0.25);
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.lineStyle(2, 0xffffff, 0.9);
  g.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  g.generateTexture("highlight", TILE_SIZE, TILE_SIZE);

  // Selected-brush outline for the palette bar.
  g.clear();
  g.lineStyle(3, 0xffeb3b, 1);
  g.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  g.generateTexture("selected-outline", TILE_SIZE, TILE_SIZE);

  g.destroy();
}
