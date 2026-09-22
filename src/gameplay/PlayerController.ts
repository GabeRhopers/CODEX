import Phaser from "phaser";
import { TouchControlState } from "./TouchControls";

const MOVE_SPEED = 200;
export const JUMP_VELOCITY = -450;

export interface PlayerInputKeys {
  /** Left/right/up/down/space. Always created — `createCursorKeys` is cheap and
   * the predicates below read whichever halves this scheme actually uses. */
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; up: Phaser.Input.Keyboard.Key };
  /** PJ Thunder Hat's shock attack — X, chosen since it's unused by any
   * existing binding (WASD/arrows move, Space jumps, Esc/R/N are scene
   * controls — see PlayScene's create()). Q for the second player, for the
   * same reason: it is next to WASD and nothing else wants it. */
  attackKey: Phaser.Input.Keyboard.Key;
  /** Which halves of the keyboard this player answers to. `solo` is both, and
   * is what one player has always had. */
  scheme: InputScheme;
}

/**
 * Which keys drive a character.
 *
 * `solo` — arrows **and** WASD, Space, X. Exactly today's binding, and what a
 * single player keeps: nobody loses a key because a feature they have not used
 * exists. The split only happens at the moment a second player joins.
 *
 * `arrows` / `wasd` — one half each, so two people at one keyboard are not
 * fighting over W.
 */
export type InputScheme = "solo" | "arrows" | "wasd";

export function createPlayerInput(scene: Phaser.Scene, scheme: InputScheme = "solo"): PlayerInputKeys {
  const cursors = scene.input.keyboard!.createCursorKeys();
  const wasd = {
    left: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    up: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
  };
  // Q rather than X for the WASD player: X is across the keyboard from WASD,
  // and the point of the split is that two people can sit at one keyboard
  // without reaching across each other.
  const attackKey = scene.input.keyboard!.addKey(
    scheme === "wasd" ? Phaser.Input.Keyboard.KeyCodes.Q : Phaser.Input.Keyboard.KeyCodes.X,
  );
  return { cursors, wasd, attackKey, scheme };
}

/** Whether this scheme answers to the arrow keys (and Space, which rides with
 * them). `solo` answers to everything. */
const readsArrows = (input: PlayerInputKeys): boolean => input.scheme !== "wasd";
/** Whether this scheme answers to WASD. */
const readsWasd = (input: PlayerInputKeys): boolean => input.scheme !== "arrows";

/** Shared by updatePlayerMovement (level-triggered — held jump auto-repeats
 * once grounded again) and PlayScene's double-jump handling (edge-triggered
 * — PlayScene tracks its own previous-frame value since a plain boolean
 * like this can't distinguish "just pressed" from "still held" on its own,
 * and Phaser's JustDown() only works on real Key objects, not the touch
 * button's boolean). One function so the two never drift on what counts as
 * "jump requested". */
export function isJumpPressed(input: PlayerInputKeys, touch?: TouchControlState): boolean {
  const arrows = readsArrows(input) && (input.cursors.up.isDown || input.cursors.space.isDown);
  const wasd = readsWasd(input) && input.wasd.up.isDown;
  return arrows || wasd || !!touch?.jump;
}

/** Same edge-triggered shape as isJumpPressed above — PlayScene tracks its
 * own previous-frame value (see justPressedAttack there) since the
 * cooldown-gated shock should fire once per press, not repeat every frame
 * the key/button stays held. */
export function isAttackPressed(input: PlayerInputKeys, touch?: TouchControlState): boolean {
  return input.attackKey.isDown || !!touch?.attack;
}

export function updatePlayerMovement(
  player: Phaser.Physics.Arcade.Sprite,
  input: PlayerInputKeys,
  touch?: TouchControlState,
  speedMultiplier = 1,
): void {
  const body = player.body as Phaser.Physics.Arcade.Body;
  const left = (readsArrows(input) && input.cursors.left.isDown) || (readsWasd(input) && input.wasd.left.isDown) || !!touch?.left;
  const right =
    (readsArrows(input) && input.cursors.right.isDown) || (readsWasd(input) && input.wasd.right.isDown) || !!touch?.right;

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
