import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";

/**
 * The PJ Thunder Hat's shock bolt — a fixed-speed, gravity-free projectile
 * fired straight left/right from the player (see PlayScene's
 * fireThunderBolt). No acceleration, no arc: it travels in a straight line
 * until it exceeds its own range (isBoltExpired), overlaps solid ground, or
 * overlaps an enemy — all three checked per-frame by PlayScene's
 * updateBolts rather than via persistent Colliders, since a bolt is a
 * short-lived, dynamically-spawned object and per-frame manual checks (the
 * same style PlayScene already uses for its water/hazard tile checks) avoid
 * having to track and explicitly tear down a Collider for every shot fired.
 */
const BOLT_SPEED = 500;
const BOLT_RANGE_TILES = 5;
export const BOLT_RANGE_PX = BOLT_RANGE_TILES * TILE_SIZE;

/** Spawns a bolt at (x, y) travelling in `direction` (1 = right, -1 = left).
 * Its own launch x is stashed via setData (matching PlayScene's existing
 * `sprite.setData("enemySize", size)` convention) so isBoltExpired can
 * measure distance travelled without PlayScene needing a parallel map. */
export function createBolt(scene: Phaser.Scene, x: number, y: number, direction: 1 | -1, textureKey: string): Phaser.Physics.Arcade.Sprite {
  const bolt = scene.physics.add.sprite(x, y, textureKey);
  const body = bolt.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(false);
  body.setVelocityX(BOLT_SPEED * direction);
  bolt.setFlipX(direction < 0);
  bolt.setData("boltStartX", x);
  return bolt;
}

export function isBoltExpired(bolt: Phaser.Physics.Arcade.Sprite): boolean {
  const startX = bolt.getData("boltStartX") as number;
  return Math.abs(bolt.x - startX) >= BOLT_RANGE_PX;
}
