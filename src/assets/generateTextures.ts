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
const DIRT_COLOR = 0x8b5a2b;
const GRASS_COLOR = 0x4caf50;
const DOT_COLOR = 0x6b3f1d;

/** Grass-capped dirt — used where a ground cell has open air above it. No
 * border: adjacent tiles need to read as one continuous strip of terrain,
 * not a grid of visibly separate squares. */
function drawGroundTop(g: Phaser.GameObjects.Graphics, offsetX: number): void {
  g.fillStyle(DIRT_COLOR, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(GRASS_COLOR, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, 8);
  g.fillStyle(DOT_COLOR, 1);
  g.fillRect(offsetX + 2, 12, 4, 4);
  g.fillRect(offsetX + 20, 20, 4, 4);
  g.fillRect(offsetX + 10, 24, 5, 4);
}

/** Plain dirt, no grass cap — used where a ground cell is buried under
 * another ground cell (see groundAutotile.ts). Same dirt tone as the top
 * variant so a vertical stack reads as one uninterrupted mass. */
function drawGroundFill(g: Phaser.GameObjects.Graphics, offsetX: number): void {
  g.fillStyle(DIRT_COLOR, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(DOT_COLOR, 1);
  g.fillRect(offsetX + 6, 4, 4, 4);
  g.fillRect(offsetX + 22, 10, 4, 4);
  g.fillRect(offsetX + 2, 18, 4, 4);
  g.fillRect(offsetX + 18, 24, 5, 4);
}

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // Palette icon: always shows the grass-top look, regardless of what
  // actually renders in the level (that's decided per-cell by neighbors).
  g.clear();
  drawGroundTop(g, 0);
  g.generateTexture("tile-ground-icon", TILE_SIZE, TILE_SIZE);

  // Ground tileset for the tilemap: frame 0 = top (grass), frame 1 = fill
  // (buried). EditorScene/PlayScene pick the frame per cell via
  // groundAutotile.ts rather than always using frame 0.
  g.clear();
  drawGroundTop(g, 0);
  drawGroundFill(g, TILE_SIZE);
  g.generateTexture("tile-ground-tileset", TILE_SIZE * 2, TILE_SIZE);

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
