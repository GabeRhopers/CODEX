import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import { groundIconKey, groundTilesetKey, ThemeColors, THEMES } from "../level/themes";

/**
 * Procedurally generated placeholder pixel art for tiles/markers/UI/basic
 * enemies. The build sandbox's network proxy blocks kenney.nl / OpenGameArt
 * / unpkg / jsdelivr (only the npm registry and github.com are reachable),
 * so real Kenney CC0 assets can't be fetched from here. These textures are
 * simple, deliberately blocky shapes drawn with Phaser's Graphics API and
 * baked via generateTexture — zero licensing risk, zero network
 * dependency, and (with `pixelArt: true` in the game config) they still
 * validate that nearest-neighbor rendering is crisp. Swap these for real
 * Kenney PNGs later by changing only the `scene.load.image(...)` calls
 * that would replace this module.
 *
 * The player, the goal, and the ghost-pillow enemy are the exceptions:
 * they're real drawn art (see public/assets/), loaded like any other
 * image asset rather than generated here.
 */

/** Grass-capped dirt — used where a ground cell has open air above it. No
 * border: adjacent tiles need to read as one continuous strip of terrain,
 * not a grid of visibly separate squares. */
function drawGroundTop(g: Phaser.GameObjects.Graphics, offsetX: number, colors: ThemeColors): void {
  g.fillStyle(colors.dirt, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(colors.cap, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, 8);
  g.fillStyle(colors.dot, 1);
  g.fillRect(offsetX + 2, 12, 4, 4);
  g.fillRect(offsetX + 20, 20, 4, 4);
  g.fillRect(offsetX + 10, 24, 5, 4);
}

/** Plain dirt, no grass cap — used where a ground cell is buried under
 * another ground cell (see groundAutotile.ts). Same dirt tone as the top
 * variant so a vertical stack reads as one uninterrupted mass. */
function drawGroundFill(g: Phaser.GameObjects.Graphics, offsetX: number, colors: ThemeColors): void {
  g.fillStyle(colors.dirt, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(colors.dot, 1);
  g.fillRect(offsetX + 6, 4, 4, 4);
  g.fillRect(offsetX + 22, 10, 4, 4);
  g.fillRect(offsetX + 2, 18, 4, 4);
  g.fillRect(offsetX + 18, 24, 5, 4);
}

const BRICK_COLOR = 0x8a8a94;
const BRICK_MORTAR = 0x53535c;
const BRICK_OUTLINE = 0x2c2c33;

/** A standalone solid block — unlike ground, its look never depends on
 * neighbors (see groundFrameAt), and it's the same across every theme
 * (masonry reads fine on grass, sand, or stone alike). */
function drawBrick(g: Phaser.GameObjects.Graphics, offsetX: number): void {
  g.fillStyle(BRICK_COLOR, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.lineStyle(2, BRICK_MORTAR, 1);
  g.lineBetween(offsetX, 11, offsetX + TILE_SIZE, 11);
  g.lineBetween(offsetX, 22, offsetX + TILE_SIZE, 22);
  g.lineBetween(offsetX + 16, 0, offsetX + 16, 11);
  g.lineBetween(offsetX + 8, 11, offsetX + 8, 22);
  g.lineBetween(offsetX + 24, 11, offsetX + 24, 22);
  g.lineBetween(offsetX + 16, 22, offsetX + 16, TILE_SIZE);
  g.lineStyle(2, BRICK_OUTLINE, 1);
  g.strokeRect(offsetX + 1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
}

const BOUNCE_BASE = 0xd98e2b;
const BOUNCE_PAD = 0xffd166;
const BOUNCE_OUTLINE = 0x5c3a12;

/** Spring pad — also theme-independent, and its "pad" band always sits at
 * the same offset from the tile top regardless of theme so the launch
 * point reads consistently. */
function drawBounce(g: Phaser.GameObjects.Graphics, offsetX: number): void {
  g.fillStyle(BOUNCE_BASE, 1);
  g.fillRect(offsetX, 10, TILE_SIZE, TILE_SIZE - 10);
  g.lineStyle(2, BOUNCE_OUTLINE, 1);
  g.strokeRect(offsetX + 1, 10, TILE_SIZE - 2, TILE_SIZE - 11);
  g.fillStyle(BOUNCE_PAD, 1);
  g.fillRect(offsetX + 3, 7, TILE_SIZE - 6, 8);
  g.lineStyle(2, BOUNCE_OUTLINE, 1);
  g.strokeRect(offsetX + 3, 7, TILE_SIZE - 6, 8);
  g.lineStyle(2, BOUNCE_OUTLINE, 0.9);
  g.lineBetween(offsetX + 16, 27, offsetX + 10, 34);
  g.lineBetween(offsetX + 16, 27, offsetX + 22, 34);
}

const SPIKE_BODY = 0x8d5b6b;
const SPIKE_BODY_DARK = 0x5c3a44;
const SPIKE_EYE = 0x1a1a2e;

/** Non-stompable ground enemy — a low, spiky silhouette (vs. the ghost's
 * round pillow shape) so its "don't jump on this one" rule reads visually
 * even before a player learns it the hard way. */
function drawSpikeCrawler(g: Phaser.GameObjects.Graphics): void {
  const cx = 20;
  const cy = 24;
  g.fillStyle(SPIKE_BODY_DARK, 1);
  for (const dx of [-10, -3, 4, 11]) {
    g.fillTriangle(cx + dx - 4, cy - 8, cx + dx + 4, cy - 8, cx + dx, cy - 18);
  }
  g.fillStyle(SPIKE_BODY, 1);
  g.fillEllipse(cx, cy, 34, 26);
  g.lineStyle(2, SPIKE_BODY_DARK, 1);
  g.strokeEllipse(cx, cy, 34, 26);
  g.fillStyle(SPIKE_EYE, 1);
  g.fillCircle(cx - 6, cy, 3);
  g.fillCircle(cx + 6, cy, 3);
}

const BAT_BODY = 0x3b3854;
const BAT_BODY_DARK = 0x1f1d33;
const BAT_EYE = 0xffe082;

/** Flies the same patrol+bob path as the ghost (see EnemyBehaviors.ts) —
 * winged silhouette reads as "airborne" at a glance, distinct from the
 * ghost's floating-pillow look even though the movement code is shared. */
function drawBat(g: Phaser.GameObjects.Graphics): void {
  const cx = 20;
  const cy = 20;
  g.fillStyle(BAT_BODY, 1);
  g.fillTriangle(cx - 4, cy - 2, cx - 20, cy - 10, cx - 6, cy + 10);
  g.fillTriangle(cx + 4, cy - 2, cx + 20, cy - 10, cx + 6, cy + 10);
  g.fillTriangle(cx - 6, cy - 8, cx - 2, cy - 8, cx - 4, cy - 15);
  g.fillTriangle(cx + 2, cy - 8, cx + 6, cy - 8, cx + 4, cy - 15);
  g.fillCircle(cx, cy, 9);
  g.lineStyle(2, BAT_BODY_DARK, 1);
  g.strokeCircle(cx, cy, 9);
  g.fillStyle(BAT_EYE, 1);
  g.fillCircle(cx - 3, cy, 2);
  g.fillCircle(cx + 3, cy, 2);
}

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // One ground tileset + palette icon per theme, all sharing the same four
  // frames (0 = grass-top, 1 = buried fill, 2 = brick, 3 = bounce pad) —
  // see groundAutotile.ts. Brick/bounce look identical across themes
  // (masonry/spring hardware, not terrain), so they're drawn once per
  // theme loop iteration but with theme-independent colors. Which texture
  // key a level actually uses is picked at scene-creation time from
  // LevelData.theme (see EditorScene/PlayScene), so this loop is the only
  // place that needs to know the full theme list.
  for (const themeId of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    const colors = THEMES[themeId];

    g.clear();
    drawGroundTop(g, 0, colors);
    g.generateTexture(groundIconKey(themeId), TILE_SIZE, TILE_SIZE);

    g.clear();
    drawGroundTop(g, 0, colors);
    drawGroundFill(g, TILE_SIZE, colors);
    drawBrick(g, TILE_SIZE * 2);
    drawBounce(g, TILE_SIZE * 3);
    g.generateTexture(groundTilesetKey(themeId), TILE_SIZE * 4, TILE_SIZE);
  }

  // Standalone palette icons for the two new blocks (theme-independent, so
  // one texture each rather than one per theme like the ground icon).
  g.clear();
  drawBrick(g, 0);
  g.generateTexture("tile-brick-icon", TILE_SIZE, TILE_SIZE);

  g.clear();
  drawBounce(g, 0);
  g.generateTexture("tile-bounce-icon", TILE_SIZE, TILE_SIZE);

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

  // Two new enemies, drawn at 40x40 to match the hand-drawn ghost-pillow's
  // native size (see public/assets/entities/) so they read at a
  // consistent scale next to it.
  g.clear();
  drawSpikeCrawler(g);
  g.generateTexture("enemy-spike-crawler", 40, 40);

  g.clear();
  drawBat(g);
  g.generateTexture("enemy-bat", 40, 40);

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
