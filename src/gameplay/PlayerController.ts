import Phaser from "phaser";
import { TouchControlState } from "./TouchControls";

const MOVE_SPEED = 200;
const JUMP_VELOCITY = -450;

export interface PlayerInputKeys {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; up: Phaser.Input.Keyboard.Key };
}

export function createPlayerInput(scene: Phaser.Scene): PlayerInputKeys {
  const cursors = scene.input.keyboard!.createCursorKeys();
  const wasd = {
    left: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    up: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
  };
  return { cursors, wasd };
}

export function updatePlayerMovement(
  player: Phaser.Physics.Arcade.Sprite,
  input: PlayerInputKeys,
  touch?: TouchControlState,
): void {
  const body = player.body as Phaser.Physics.Arcade.Body;
  const left = input.cursors.left.isDown || input.wasd.left.isDown || !!touch?.left;
  const right = input.cursors.right.isDown || input.wasd.right.isDown || !!touch?.right;
  const jumpPressed = input.cursors.up.isDown || input.wasd.up.isDown || input.cursors.space.isDown || !!touch?.jump;

  if (left && !right) {
    body.setVelocityX(-MOVE_SPEED);
  } else if (right && !left) {
    body.setVelocityX(MOVE_SPEED);
  } else {
    body.setVelocityX(0);
  }

  if (jumpPressed && body.blocked.down) {
    body.setVelocityY(JUMP_VELOCITY);
  }
}
