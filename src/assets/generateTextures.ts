import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import { blockIconKey, groundIconKey, groundTilesetKey, SKIN_COLORS, SkinColors } from "../level/groundSkins";

/**
 * Procedurally generated pixel art for the pieces that still don't have a
 * real-art equivalent, plus pure UI chrome. Most tile/enemy art used to
 * live here as placeholders (the build sandbox's network proxy blocks
 * kenney.nl / OpenGameArt / unpkg / jsdelivr — only the npm registry and
 * github.com are reachable, so real Kenney assets couldn't be *fetched*
 * from here) — that changed once the user supplied Kenney's CC0 "Pixel
 * Platformer" pack directly as an upload. See BootScene.preload for what's
 * now real art loaded from public/assets/: the grass/desert/snow ground
 * tiles, brick, bounce, water, the bat, the spike crawler, the golem, and
 * a growing set of collectibles/decorations (all pre-composited to this
 * project's tile/entity sizes by a one-off `PIL` prep script, since the
 * pack's native tiles are 18px/24px, not this project's 32px/40px).
 *
 * What's still generated here:
 *   - **Castle**'s ground skin — the pack has no stone/castle-style
 *     ground cap, so castle keeps its original procedural grey look
 *     (including its own brick/bounce/lava frames — lava stands in for
 *     the real Water tile grass/desert/snow share, fitting the castle
 *     aesthetic better anyway), plus dedicated Palette icons for all
 *     three (see blockIconKey) — and, for the same "no matching real
 *     art" reason, its own procedural starfield parallax background
 *     (ParallaxBackground.ts) rather than Kenney's daytime sky art.
 *   - The **Feather** item's icon — the pack has no double-jump-shaped
 *     asset (or anything close), so it's a simple drawn badge instead.
 *   - Pure UI chrome with no asset-pack equivalent: the eraser icon, the
 *     spawn marker, the hover highlight, and the palette selection outline.
 *
 * The player, the goal, and the ghost-pillow enemy are hand-drawn (see
 * public/assets/) rather than from either source.
 */

/** Grass-capped dirt — used where a ground cell has open air above it. No
 * border: adjacent tiles need to read as one continuous strip of terrain,
 * not a grid of visibly separate squares. */
function drawGroundTop(g: Phaser.GameObjects.Graphics, offsetX: number, colors: SkinColors): void {
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
function drawGroundFill(g: Phaser.GameObjects.Graphics, offsetX: number, colors: SkinColors): void {
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

const LAVA_BASE = 0xd94e1f;
const LAVA_DEEP = 0x8a2a10;
const LAVA_GLOW = 0xffb347;

/** Castle's own hazard block — grass/desert/snow share a real Kenney water
 * tile (see prepare-kenney-assets.py), but castle's tileset is entirely
 * procedural (no stone tile in the pack), so it gets its own hazard frame
 * too rather than mixing real and procedural art within one theme. Lava
 * fits the castle aesthetic better than water anyway. */
function drawLava(g: Phaser.GameObjects.Graphics, offsetX: number): void {
  g.fillStyle(LAVA_BASE, 1);
  g.fillRect(offsetX, 0, TILE_SIZE, TILE_SIZE);
  g.fillStyle(LAVA_DEEP, 1);
  g.fillRect(offsetX, TILE_SIZE - 10, TILE_SIZE, 10);
  g.fillStyle(LAVA_GLOW, 1);
  g.fillRect(offsetX + 4, 5, 6, 6);
  g.fillRect(offsetX + 19, 11, 5, 5);
  g.fillRect(offsetX + 11, 19, 6, 6);
  g.fillRect(offsetX + 23, 23, 4, 4);
}

const FEATHER_BADGE = 0x7ee8fa;
const FEATHER_OUTLINE = 0x0e5a66;
const FEATHER_MARK = 0xffffff;

/** Double-jump power-up icon — styled as a rounded badge to match the real
 * Kenney item icons' look (coin/heart/shield/speed all read as an outlined
 * badge with a symbol inside), even though there's no source tile to match
 * pixel-for-pixel. Two stacked chevrons read as "up, again". */
function drawFeatherIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(FEATHER_BADGE, 1);
  g.fillRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.lineStyle(2, FEATHER_OUTLINE, 1);
  g.strokeRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.lineStyle(3, FEATHER_MARK, 1);
  g.beginPath();
  g.moveTo(9, 19);
  g.lineTo(16, 12);
  g.lineTo(23, 19);
  g.strokePath();
  g.beginPath();
  g.moveTo(9, 26);
  g.lineTo(16, 19);
  g.lineTo(23, 26);
  g.strokePath();
}

const STAR_COLOR = 0xffffff;
// Matches the painted scenes' baked-background format (see
// ParallaxBackground.ts) — large and fixed rather than a small tile, so the
// new zoom+pan renderer never has to stretch a small source image.
const BG_SCENE_WIDTH = 2048;
const BG_SCENE_HEIGHT = 476;

/** Deterministic pseudo-random star scatter (a plain LCG, not
 * `Math.random`) so regenerating this texture on every boot always
 * produces the same pattern — otherwise the "far" and "near" starfield
 * layers would visibly jump every time a scene reloads. */
function drawStarfield(g: Phaser.GameObjects.Graphics, skyColor: number, starCount: number, starAlpha: number, seed: number): void {
  g.fillStyle(skyColor, 1);
  g.fillRect(0, 0, BG_SCENE_WIDTH, BG_SCENE_HEIGHT);
  g.fillStyle(STAR_COLOR, starAlpha);
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 10000) / 10000;
  };
  for (let i = 0; i < starCount; i++) {
    const x = Math.floor(rand() * BG_SCENE_WIDTH);
    const y = Math.floor(rand() * BG_SCENE_HEIGHT);
    const size = rand() > 0.8 ? 2 : 1;
    g.fillRect(x, y, size, size);
  }
}

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // Castle only — grass/desert ground tilesets are real art, loaded in
  // BootScene.preload (see groundTilesetKey/groundIconKey there).
  const castleColors = SKIN_COLORS.castle;
  g.clear();
  drawGroundTop(g, 0, castleColors);
  g.generateTexture(groundIconKey("castle"), TILE_SIZE, TILE_SIZE);

  g.clear();
  drawGroundTop(g, 0, castleColors);
  drawGroundFill(g, TILE_SIZE, castleColors);
  drawBrick(g, TILE_SIZE * 2);
  drawBounce(g, TILE_SIZE * 3);
  drawLava(g, TILE_SIZE * 4);
  g.generateTexture(groundTilesetKey("castle"), TILE_SIZE * 5, TILE_SIZE);

  // Single-frame Palette icons matching castle's own procedural brick/
  // bounce/lava above — without these the palette would keep showing the
  // shared real-art Brick/Bounce/Water icons even while castle is active,
  // which for Water in particular is actively misleading (a blue water
  // icon that actually paints orange lava when placed).
  g.clear();
  drawBrick(g, 0);
  g.generateTexture(blockIconKey("castle", "brick"), TILE_SIZE, TILE_SIZE);

  g.clear();
  drawBounce(g, 0);
  g.generateTexture(blockIconKey("castle", "bounce"), TILE_SIZE, TILE_SIZE);

  g.clear();
  drawLava(g, 0);
  g.generateTexture(blockIconKey("castle", "water"), TILE_SIZE, TILE_SIZE);

  // Castle's parallax background (see ParallaxBackground.ts) — grass/desert
  // use real Kenney sky art loaded in BootScene.preload instead.
  g.clear();
  drawStarfield(g, 0x0d0d1a, 900, 0.5, 7);
  g.generateTexture("bg-castle-far", BG_SCENE_WIDTH, BG_SCENE_HEIGHT);

  g.clear();
  drawStarfield(g, 0x14142a, 1500, 0.85, 42);
  g.generateTexture("bg-castle-near", BG_SCENE_WIDTH, BG_SCENE_HEIGHT);

  // Feather item icon (double jump) — see drawFeatherIcon's comment for why
  // this one's drawn rather than sourced from the asset pack.
  g.clear();
  drawFeatherIcon(g);
  g.generateTexture("item-feather", TILE_SIZE, TILE_SIZE);

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
  // gameplay/EnemyBehaviors.ts. The bat and spike crawler are now real
  // Kenney art too (also loaded in BootScene.preload).

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
