import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";

const PATROL_SPEED = 60;
const PATROL_RANGE_TILES = 2;
const BOB_AMPLITUDE = 18;
const BOB_SPEED = 300; // ms per radian-ish unit, tuned by feel
const STOMP_VELOCITY_Y = -260;

export interface GhostState {
  minX: number;
  maxX: number;
  direction: 1 | -1;
}

export function createGhostEnemy(scene: Phaser.Scene, tileX: number, tileY: number): Phaser.Physics.Arcade.Sprite {
  const worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
  const worldY = tileY * TILE_SIZE + TILE_SIZE / 2;
  const ghost = scene.physics.add.sprite(worldX, worldY, "enemy-ghost-pillow");
  const body = ghost.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(false);
  return ghost;
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
 * the player. Mirrors the classic Mario-style "stomp from above" rule.
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
