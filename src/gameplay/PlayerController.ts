import Phaser from "phaser";
import { TouchControlState } from "./TouchControls";

const MOVE_SPEED = 200;
export const JUMP_VELOCITY = -450;

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

/** Shared by updatePlayerMovement (level-triggered — held jump auto-repeats
 * once grounded again) and PlayScene's double-jump handling (edge-triggered
 * — PlayScene tracks its own previous-frame value since a plain boolean
 * like this can't distinguish "just pressed" from "still held" on its own,
 * and Phaser's JustDown() only works on real Key objects, not the touch
 * button's boolean). One function so the two never drift on what counts as
 * "jump requested". */
export function isJumpPressed(input: PlayerInputKeys, touch?: TouchControlState): boolean {
  return input.cursors.up.isDown || input.wasd.up.isDown || input.cursors.space.isDown || !!touch?.jump;
}

export function updatePlayerMovement(
  player: Phaser.Physics.Arcade.Sprite,
  input: PlayerInputKeys,
  touch?: TouchControlState,
  speedMultiplier = 1,
): void {
  const body = player.body as Phaser.Physics.Arcade.Body;
  const left = input.cursors.left.isDown || input.wasd.left.isDown || !!touch?.left;
  const right = input.cursors.right.isDown || input.wasd.right.isDown || !!touch?.right;

  if (left && !right) {
    body.setVelocityX(-MOVE_SPEED * speedMultiplier);
  } else if (right && !left) {
    body.setVelocityX(MOVE_SPEED * speedMultiplier);
  } else {
    body.setVelocityX(0);
  }

  if (isJumpPressed(input, touch) && body.blocked.down) {
    body.setVelocityY(JUMP_VELOCITY);
  }
}
