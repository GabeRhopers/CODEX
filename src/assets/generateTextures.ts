import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import { blockIconKey, groundIconKey, groundTilesetKey, SKIN_COLORS, SkinColors } from "../level/groundSkins";
import { EDGE_FRAME_COUNT, edgeBandRects, GROUND_EDGE_TEXTURE_KEY } from "../level/groundEdges";

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
 *   - The **Chicken Slipper** (double jump, textureKey "item-feather") and
 *     **PJ Thunder Hat** power-up items — the pack has nothing close to
 *     either, so both get a simple drawn badge, plus a small un-badged
 *     accessory sprite each (worn on the equipped player) and, for the
 *     Thunder Hat, its shock bolt's own in-flight sprite.
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

const SLIPPER_BADGE = 0xffd66b;
const SLIPPER_OUTLINE = 0x8a5a1e;
const SLIPPER_SOLE = 0xffffff;
const SLIPPER_CLAW = 0xff8c3c;

/** Double-jump power-up icon — the "Chicken Slipper" (2026-08-19 rename of
 * what used to be a plain Feather; the underlying entityType/textureKey
 * stay "item-feather" so an already-saved level placing this item isn't
 * silently orphaned — see Palette.ts's own comment on this entry). Styled
 * as a rounded badge to match the real Kenney item icons' look (coin/
 * heart/shield/speed all read as an outlined badge with a symbol inside),
 * even though there's no source tile to match pixel-for-pixel: a white
 * slipper sole with three orange chicken-foot claws poking out the toe. */
/**
 * The ground-edge overlay strip: one 32x32 frame per exposed-side mask, drawn
 * over the ground layer so a mass has a visible silhouette (see
 * groundEdges.ts for why three bits are enough, and why the source art has no
 * border of its own to fall back on).
 *
 * One flat, translucent black rather than a colour per ground skin. That is not
 * only four fewer textures: a darkening reads as "a shadowed rim of whatever is
 * under it", so it works over grass, sand, stone, snow *and* over a skin
 * somebody painted themselves — which a hard-coded brown would not.
 *
 * The rectangles come from `edgeBandRects` rather than being drawn here, so the
 * shape the tests check is literally the shape that gets drawn, and the
 * non-overlap it guarantees is what keeps alpha from compounding into a darker
 * dot on every convex corner.
 */
function drawGroundEdges(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(GROUND_EDGE_COLOR, GROUND_EDGE_ALPHA);
  for (let mask = 0; mask < EDGE_FRAME_COUNT; mask++) {
    const offsetX = mask * TILE_SIZE;
    for (const rect of edgeBandRects(mask)) {
      g.fillRect(offsetX + rect.x, rect.y, rect.width, rect.height);
    }
  }
}

/** Black, and light enough to read as a shadowed rim rather than a drawn-on
 * frame. Tuned against the real tilesets — grass's dirt is the lightest of the
 * four, so it is the one that sets the floor for how strong this has to be. */
const GROUND_EDGE_COLOR = 0x000000;
const GROUND_EDGE_ALPHA = 0.34;

function drawChickenSlipperIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SLIPPER_BADGE, 1);
  g.fillRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.lineStyle(2, SLIPPER_OUTLINE, 1);
  g.strokeRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.fillStyle(SLIPPER_SOLE, 1);
  g.fillRoundedRect(7, 15, 18, 10, 4);
  g.fillStyle(SLIPPER_CLAW, 1);
  g.fillTriangle(9, 15, 12, 9, 14, 15);
  g.fillTriangle(14, 15, 17, 7, 19, 15);
  g.fillTriangle(19, 15, 22, 9, 24, 15);
}

const HAT_BADGE = 0x2e2a4a;
const HAT_OUTLINE = 0xffe066;
const HAT_CAP = 0x6a5acd;
const HAT_BOLT = 0xffe066;

/** PJ Thunder Hat power-up icon (2026-08-19) — same "no matching real art,
 * so it's a drawn badge instead" situation as the Chicken Slipper above. A
 * sleeping-cap silhouette (matching "Sleepy Grampa" wearing pajamas) with a
 * lightning bolt struck across it, reading as "night cap, but electric". */
function drawThunderHatIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(HAT_BADGE, 1);
  g.fillRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.lineStyle(2, HAT_OUTLINE, 1);
  g.strokeRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
  g.fillStyle(HAT_CAP, 1);
  g.fillTriangle(8, 24, 24, 24, 20, 8);
  g.fillCircle(20, 8, 3);
  g.fillStyle(HAT_BOLT, 1);
  g.beginPath();
  g.moveTo(17, 10);
  g.lineTo(12, 19);
  g.lineTo(16, 19);
  g.lineTo(13, 26);
  g.lineTo(21, 15);
  g.lineTo(17, 15);
  g.closePath();
  g.fillPath();
}

/** The shock bolt's own in-flight sprite (see gameplay/Bolt.ts) — authored
 * facing right, like every other directional art in this project (see
 * wizardAnimation.ts's own docstring); PlayScene flips it via setFlipX for
 * a leftward shot. Small and un-badged (unlike the pickup icons above)
 * since this renders directly in the level, not in a UI palette. */
const BOLT_WIDTH = 20;
const BOLT_HEIGHT = 14;

function drawBoltProjectile(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(HAT_BOLT, 1);
  g.beginPath();
  g.moveTo(2, 7);
  g.lineTo(10, 1);
  g.lineTo(8, 6);
  g.lineTo(18, 6);
  g.lineTo(10, 13);
  g.lineTo(12, 8);
  g.lineTo(2, 8);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xffffff, 0.8);
  g.fillRect(8, 6, 4, 2);
}

/** Small equipped-accessory sprites PlayScene attaches to the player once
 * the matching stat flag is set (hasDoubleJump/hasThunderHat) — see
 * updateAccessoryVisuals there. Un-badged, like the bolt above: these sit
 * directly on top of the player sprite in the level, not in a UI list, so
 * the rounded-badge chrome the pickup icons use would just look like a
 * floating card stuck to the character. */
const ACCESSORY_SLIPPER_WIDTH = 22;
const ACCESSORY_SLIPPER_HEIGHT = 14;

function drawSlipperAccessory(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SLIPPER_SOLE, 1);
  g.fillRoundedRect(2, 6, 18, 8, 3);
  g.fillStyle(SLIPPER_CLAW, 1);
  g.fillTriangle(4, 6, 7, 1, 9, 6);
  g.fillTriangle(9, 6, 12, 0, 15, 6);
  g.fillTriangle(14, 6, 17, 2, 19, 6);
}

const ACCESSORY_HAT_WIDTH = 22;
const ACCESSORY_HAT_HEIGHT = 18;

function drawHatAccessory(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(HAT_CAP, 1);
  g.fillTriangle(3, 16, 19, 16, 15, 2);
  g.fillCircle(15, 2, 3);
  g.fillStyle(HAT_BOLT, 1);
  g.beginPath();
  g.moveTo(13, 5);
  g.lineTo(8, 12);
  g.lineTo(11, 12);
  g.lineTo(9, 17);
  g.lineTo(16, 9);
  g.lineTo(13, 9);
  g.closePath();
  g.fillPath();
}

/** A simple double eighth-note glyph, for the music picker submenu's
 * per-track rows (see EditorUI's AssetPickerMenu / "Skin/background/music
 * libraries" under Art) — audio has no visual thumbnail the way an
 * uploaded image does, so every track row shows this same icon and relies
 * on its label (the uploaded filename) to tell tracks apart, same as a
 * plain file-list UI would. `muted` draws it desaturated/greyed out, used
 * for the picker's "None" row so it doesn't read as "a track named
 * None." */
function drawMusicNoteIcon(g: Phaser.GameObjects.Graphics, muted: boolean): void {
  const noteColor = muted ? 0x666680 : 0xffd166;
  g.fillStyle(noteColor, 1);
  g.fillCircle(11, 24, 5);
  g.fillCircle(21, 21, 5);
  g.fillRect(14, 8, 3, 16);
  g.fillRect(24, 6, 3, 15);
  g.fillRect(14, 8, 13, 4);
  if (muted) {
    g.lineStyle(3, 0xd32f2f, 0.9);
    g.lineBetween(6, 27, 26, 5);
  }
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
  // A second lava frame, pixel-identical to the first, purely so castle's
  // tileset has the same 6-frame stride every other skin's now has (see
  // groundAutotile.ts's HAZARD_KIND_FRAMES — water gained a real top/fill
  // distinction, but lava deliberately didn't: it's still meant to be an
  // instant hazard regardless of depth, not something to swim through, so
  // there's no "deeper lava" look to draw here).
  drawLava(g, TILE_SIZE * 5);
  g.generateTexture(groundTilesetKey("castle"), TILE_SIZE * 6, TILE_SIZE);

  // Shared by all four ground skins and by every custom block skin — see
  // drawGroundEdges. Registered here rather than shipped as art because it is
  // pure geometry, and because keeping it derived from edgeBandRects means the
  // texture cannot drift from the masks the editor and runtime compute.
  g.clear();
  drawGroundEdges(g);
  g.generateTexture(GROUND_EDGE_TEXTURE_KEY, TILE_SIZE * EDGE_FRAME_COUNT, TILE_SIZE);

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

  // Chicken Slipper (double jump) item icon — see drawChickenSlipperIcon's
  // comment for why this one's drawn rather than sourced from the asset
  // pack, and why the texture key stays "item-feather".
  g.clear();
  drawChickenSlipperIcon(g);
  g.generateTexture("item-feather", TILE_SIZE, TILE_SIZE);

  // PJ Thunder Hat item icon — see drawThunderHatIcon's comment.
  g.clear();
  drawThunderHatIcon(g);
  g.generateTexture("item-thunder-hat", TILE_SIZE, TILE_SIZE);

  // Shock bolt in-flight sprite and the two equipped-accessory overlays —
  // see their own comments above for why these are un-badged.
  g.clear();
  drawBoltProjectile(g);
  g.generateTexture("bolt-projectile", BOLT_WIDTH, BOLT_HEIGHT);

  g.clear();
  drawSlipperAccessory(g);
  g.generateTexture("accessory-slippers", ACCESSORY_SLIPPER_WIDTH, ACCESSORY_SLIPPER_HEIGHT);

  g.clear();
  drawHatAccessory(g);
  g.generateTexture("accessory-hat", ACCESSORY_HAT_WIDTH, ACCESSORY_HAT_HEIGHT);

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

  // Music picker icons (see drawMusicNoteIcon) — every uploaded track's
  // row uses "music-note", the picker's own "None" row uses the muted
  // variant.
  g.clear();
  drawMusicNoteIcon(g, false);
  g.generateTexture("music-note", TILE_SIZE, TILE_SIZE);

  g.clear();
  drawMusicNoteIcon(g, true);
  g.generateTexture("music-note-muted", TILE_SIZE, TILE_SIZE);

  g.destroy();
}
