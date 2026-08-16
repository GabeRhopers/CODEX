import Phaser from "phaser";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y, TILE_SIZE } from "../config/gameConfig";
import { EnemySize, EntityType } from "../level/LevelSchema";

const PATROL_SPEED = 60;
const PATROL_RANGE_TILES = 2;
const BOB_AMPLITUDE = 18;
const BOB_SPEED = 300; // ms per radian-ish unit, tuned by feel
const STOMP_VELOCITY_Y = -260;

/** Every placeable enemy type — shared by EditorScene (deciding whether
 * the size selector applies to the current brush) and EntityPlacer (the
 * editor-preview scale). Kept as an explicit Set, matching this
 * codebase's existing MARKER_TYPES/ITEM_TYPES/DECOR_TYPES convention,
 * rather than an "enemy-" prefix check on EntityType — explicit reads
 * the same either way but doesn't depend on every future enemy type
 * happening to share that prefix. */
export const ENEMY_TYPES = new Set<EntityType>(["enemy-ghost", "enemy-spike", "enemy-bat", "enemy-golem"]);

export function isEnemyType(type: EntityType): boolean {
  return ENEMY_TYPES.has(type);
}

/** Small/Medium/Large as a relative multiplier on top of the *editor's*
 * own tile-fit baseline (EntityPlacer already scales every marker down
 * to fit one tile via fitWithinTile — see spriteFit.ts) — deliberately
 * not the same numbers PlayScene's ENEMY_SIZE_TARGET uses below, since
 * the two contexts start from different baselines (tile-fit vs. native
 * size, a discrepancy that predates this feature — see spriteFit.ts's
 * docstring). "Medium" is 1 (no change) in both, so old levels and
 * anyone who never touches the size selector see zero visual change. */
export const ENEMY_EDITOR_SIZE_SCALE: Record<EnemySize, number> = {
  small: 0.65,
  medium: 1,
  large: 1.4,
};

/** PlayScene's target size (the *longer* side, in world pixels) for each
 * size category — "medium" (40) matches every built-in enemy texture's
 * own native canvas size exactly (see the opaque-bbox measurements this
 * was tuned from), so a level with no enemies re-sized and no custom
 * skins renders pixel-identical to before this feature existed. Applied
 * via setDisplaySize rather than setScale specifically so it's
 * independent of whatever texture happens to be active — built-in art or
 * a custom skin of any uploaded resolution both land on the same target,
 * which is also what fixes a real, separate bug: PlayScene previously
 * never normalized a skinned enemy's size at all, so an uploaded image
 * anywhere up to skinUpload.ts's 128px cap would have rendered at its own
 * full native size instead of a tile-appropriate one. */
export const ENEMY_SIZE_TARGET: Record<EnemySize, number> = {
  small: 26,
  medium: 40,
  large: 58,
};

/** Each built-in enemy texture is a 40x40 canvas with the actual creature
 * occupying only part of it (measured directly from the source PNGs'
 * alpha channel) — Arcade Physics defaults a sprite's body to the *full*
 * texture frame, which for the bat in particular (a wide, flat shape
 * vertically centered in a much taller canvas) meant a hitbox roughly
 * twice as tall as the visible art. These fractions (of whichever
 * texture's current frame size — see applyEnemySize) trim the body back
 * down to roughly the creature's own silhouette, then get re-centered via
 * setSize's own `center: true` rather than a hand-computed per-species
 * offset — simpler, and it stays correct automatically as size/skin
 * change, at the cost of not hugging an asymmetric silhouette (like the
 * bat sitting low in its frame) quite as tightly as a hand-tuned offset
 * would. Reused as-is for a reskinned enemy of the same type: there's no
 * cheap way to know a user-uploaded image's own silhouette at runtime, so
 * every skin gets its base type's proportions rather than its own. */
const ENEMY_HITBOX_FRACTION: Record<string, { width: number; height: number }> = {
  "enemy-ghost": { width: 0.75, height: 0.68 },
  "enemy-bat": { width: 0.85, height: 0.55 },
  "enemy-spike": { width: 0.65, height: 0.72 },
  "enemy-golem": { width: 0.85, height: 0.85 },
};

export interface GhostState {
  minX: number;
  maxX: number;
  direction: 1 | -1;
}

/** Shared constructor for every floating-patrol enemy (ghost, bat, spike
 * crawler) — same movement, same bob, same stomp geometry; only the
 * texture (and, at the call site, whether it's stompable) differs. See
 * PlayScene's enemyDefs for the per-type wiring. */
export function createPatrolEnemy(
  scene: Phaser.Scene,
  tileX: number,
  tileY: number,
  textureKey: string,
): Phaser.Physics.Arcade.Sprite {
  const worldX = GRID_ORIGIN_X + tileX * TILE_SIZE + TILE_SIZE / 2;
  const worldY = GRID_ORIGIN_Y + tileY * TILE_SIZE + TILE_SIZE / 2;
  const enemy = scene.physics.add.sprite(worldX, worldY, textureKey);
  const body = enemy.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(false);
  return enemy;
}

/** Sizes a spawned (or freshly reskinned) enemy sprite to its size
 * category and re-fits its physics body to match — see
 * ENEMY_SIZE_TARGET/ENEMY_HITBOX_FRACTION above for the reasoning.
 * `setDisplaySize` first (so scale reflects *this* call's target against
 * whichever texture is currently active), then `body.setSize` — Arcade
 * Physics multiplies setSize's arguments by the body's current
 * game-object scale, so expressing the body in the same "current frame's
 * native pixels" terms as the display-size call means the frame size
 * cancels out algebraically and the final world-space hitbox always lands
 * on `fraction × target`, regardless of the active texture's own
 * resolution. Must be re-called after any later `setTexture` (a skin
 * swap) for the same reason — PlayScene's skin-resolve pass does exactly
 * that, keyed off the size stashed via `sprite.setData` at spawn time. */
export function applyEnemySize(sprite: Phaser.Physics.Arcade.Sprite, type: EntityType, size: EnemySize): void {
  const frame = sprite.frame;
  const target = ENEMY_SIZE_TARGET[size];
  const scale = target / Math.max(frame.width, frame.height);
  sprite.setDisplaySize(frame.width * scale, frame.height * scale);
  const fraction = ENEMY_HITBOX_FRACTION[type] ?? { width: 0.8, height: 0.8 };
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(frame.width * fraction.width, frame.height * fraction.height, true);
}

/** The non-enemy equivalent of ENEMY_SIZE_TARGET's normalization, for
 * every other skinnable type (Goal/Chest/Items/Decor) — those have no
 * size selector and no physics body of their own to worry about (Items/
 * Chest/Goal are collected via a separate, always-tile-sized overlap
 * zone; Decor has no physics at all — see PlayScene's own comments on
 * each), so this only ever needs to fix *display* size, matching a
 * custom skin to roughly the same footprint its built-in art has (32px
 * for nearly every one of them, per BootScene's asset list, with Goal a
 * little bigger by design) rather than the skin's own, potentially much
 * larger, uploaded resolution. Only applied within the skin-swap path
 * below, so it never touches any built-in texture's own default size. */
const DEFAULT_SKIN_DISPLAY_TARGET = 36;

export function applyDefaultSkinSize(sprite: Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite): void {
  const frame = sprite.frame;
  const scale = DEFAULT_SKIN_DISPLAY_TARGET / Math.max(frame.width, frame.height);
  sprite.setDisplaySize(frame.width * scale, frame.height * scale);
}

export function createGhostState(ghost: Phaser.Physics.Arcade.Sprite): GhostState {
  return {
    minX: ghost.x - PATROL_RANGE_TILES * TILE_SIZE,
    maxX: ghost.x + PATROL_RANGE_TILES * TILE_SIZE,
    direction: 1,
  };
}

/** Floats side to side between patrol bounds with a gentle vertical bob. */
export function updateGhostPatrol(ghost: Phaser.Physics.Arcade.Sprite, state: GhostState, timeMs: number): void {
  const body = ghost.body as Phaser.Physics.Arcade.Body;

  if (ghost.x <= state.minX) state.direction = 1;
  else if (ghost.x >= state.maxX) state.direction = -1;

  body.setVelocityX(state.direction * PATROL_SPEED);
  body.setVelocityY(Math.sin(timeMs / BOB_SPEED) * BOB_AMPLITUDE);
  ghost.setFlipX(state.direction < 0);
}

/**
 * A falling player landing on top of the ghost stomps it; any other
 * contact (walking into its side, or touching it while rising/level) costs
 * the player. Mirrors the classic platformer "stomp from above" rule.
 */
export function isStompFromAbove(player: Phaser.Physics.Arcade.Sprite, ghost: Phaser.Physics.Arcade.Sprite): boolean {
  const playerBody = player.body as Phaser.Physics.Arcade.Body;
  const ghostBody = ghost.body as Phaser.Physics.Arcade.Body;
  return playerBody.velocity.y > 0 && playerBody.bottom <= ghostBody.top + ghostBody.height * 0.5;
}

export function applyStompBounce(player: Phaser.Physics.Arcade.Sprite): void {
  const body = player.body as Phaser.Physics.Arcade.Body;
  body.setVelocityY(STOMP_VELOCITY_Y);
}
