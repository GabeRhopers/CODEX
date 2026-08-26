import Phaser from "phaser";
import { LEFT_BAND, RIGHT_BAND, SCREEN_RECT } from "./HandheldShell";

export interface TouchControlState {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
}

/**
 * The handheld's controls: a D-pad left of the screen, four face buttons in a
 * diamond to its right (see HandheldShell for the body they sit in).
 *
 * These used to be four translucent circles floating *over* the playfield,
 * because the level looked like it filled the canvas. It doesn't: the camera
 * never scrolls and every level is exactly GRID_COLS wide, so there are ~190px
 * to the left of the screen and ~220px to the right that were simply empty.
 * Moving the controls there stops them covering the level at all, and is what
 * makes the console framing free rather than a trade.
 *
 * Still OR'd into keyboard input by PlayerController rather than replacing it,
 * and still genuinely clickable on a mouse, so there is no touch-vs-desktop
 * detection to get wrong. Each control tracks pointerup *and* pointerout so a
 * finger or cursor sliding off releases it.
 */

// --- D-pad, centred in the left band ---------------------------------------
const DPAD_CENTER = { x: LEFT_BAND.x + LEFT_BAND.width / 2, y: SCREEN_RECT.y + SCREEN_RECT.height - 130 };
const DPAD_ARM = 34; // both the length of an arm and the width of the cross
const DPAD_FACE = 0x3a3d55;
const DPAD_FACE_DOWN = 0x5a6088;

// --- face buttons, centred in the right band -------------------------------
const FACE_CENTER = { x: RIGHT_BAND.x + RIGHT_BAND.width / 2, y: DPAD_CENTER.y };
const FACE_RADIUS = 26;
const FACE_OFFSET = 44;
/** Jump sits on the two buttons nearest the thumb (right and bottom), the way
 * A and B both mean "act" on every SNES platformer; the shock takes the far
 * pair. Two actions across four buttons is mirroring, not padding — inventing
 * two more actions to fill the diamond would be the worse answer. */
const JUMP_COLOR = 0x3a5a9c;
const JUMP_COLOR_DOWN = 0x6d92e0;
const ATTACK_COLOR = 0xb8862b;
const ATTACK_COLOR_DOWN = 0xe8b45a;

const CONTROL_DEPTH = 40;
/** How faded the shock buttons are before the Thunder Hat is collected — they
 * are still drawn, so the diamond doesn't change shape mid-level, but they read
 * as unavailable and ignore presses. */
const DISABLED_ALPHA = 0.25;

export class TouchControls {
  private state: TouchControlState = { left: false, right: false, jump: false, attack: false };
  /** The two shock buttons' circles, so their fill can be reset when the
   * ability goes away mid-press. Their labels are tracked separately because a
   * Text has no setFillStyle — only the alpha applies to both. */
  private readonly attackCircles: { circle: Phaser.GameObjects.Arc; base: number }[] = [];
  private readonly attackLabels: Phaser.GameObjects.Text[] = [];
  private attackEnabled = true;

  constructor(scene: Phaser.Scene) {
    this.buildDpad(scene);
    this.buildFaceButtons(scene);
  }

  get(): TouchControlState {
    return this.state;
  }

  /**
   * Shows whether the shock is currently usable. Called each frame by PlayScene
   * from `stats.hasThunderHat`; cheap enough to set unconditionally, and it
   * also clears a held press the moment the ability goes away rather than
   * leaving `attack` stuck true.
   */
  setAttackEnabled(enabled: boolean): void {
    if (enabled === this.attackEnabled) return;
    this.attackEnabled = enabled;
    if (!enabled) this.state.attack = false;
    for (const { circle, base } of this.attackCircles) {
      circle.setAlpha(enabled ? 1 : DISABLED_ALPHA);
      circle.setFillStyle(base); // clears a held-down highlight
    }
    for (const label of this.attackLabels) label.setAlpha(enabled ? 1 : DISABLED_ALPHA);
  }

  private buildDpad(scene: Phaser.Scene): void {
    const { x, y } = DPAD_CENTER;
    // Drawn as five squares rather than a cross polygon so each arm is its own
    // hit area — a single polygon would need per-point maths to tell which arm
    // a press landed on.
    const arm = (dx: number, dy: number, label: string, set?: (down: boolean) => void): void => {
      const square = scene.add
        .rectangle(x + dx * DPAD_ARM, y + dy * DPAD_ARM, DPAD_ARM, DPAD_ARM, DPAD_FACE)
        .setScrollFactor(0)
        .setDepth(CONTROL_DEPTH);
      scene.add
        .text(x + dx * DPAD_ARM, y + dy * DPAD_ARM, label, { fontSize: "16px", color: "#c8cbe0" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(CONTROL_DEPTH + 1);
      if (!set) return; // Down: drawn so the cross looks like a cross, but this game has no duck
      square.setInteractive({ useHandCursor: true });
      const press = (down: boolean) => {
        set(down);
        square.setFillStyle(down ? DPAD_FACE_DOWN : DPAD_FACE);
      };
      square.on("pointerdown", () => press(true));
      square.on("pointerup", () => press(false));
      square.on("pointerout", () => press(false));
    };

    // Up jumps, matching the keyboard where Up/W already do.
    arm(0, -1, "▲", (down) => (this.state.jump = down));
    arm(-1, 0, "◀", (down) => (this.state.left = down));
    arm(1, 0, "▶", (down) => (this.state.right = down));
    arm(0, 1, "▼");
    // Centre pad, purely to make the five squares read as one cross.
    scene.add.rectangle(x, y, DPAD_ARM, DPAD_ARM, DPAD_FACE).setScrollFactor(0).setDepth(CONTROL_DEPTH);
  }

  private buildFaceButtons(scene: Phaser.Scene): void {
    const { x, y } = FACE_CENTER;
    const button = (
      dx: number,
      dy: number,
      label: string,
      base: number,
      downColor: number,
      set: (down: boolean) => void,
      isAttack: boolean,
    ): void => {
      const cx = x + dx * FACE_OFFSET;
      const cy = y + dy * FACE_OFFSET;
      const circle = scene.add
        .circle(cx, cy, FACE_RADIUS, base)
        .setStrokeStyle(2, 0x161826, 0.8)
        .setScrollFactor(0)
        .setDepth(CONTROL_DEPTH)
        .setInteractive({ useHandCursor: true });
      const text = scene.add
        .text(cx, cy, label, { fontSize: "20px", color: "#ffffff" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(CONTROL_DEPTH + 1);

      const press = (down: boolean): void => {
        if (isAttack && !this.attackEnabled) return;
        set(down);
        circle.setFillStyle(down ? downColor : base);
      };
      circle.on("pointerdown", () => press(true));
      circle.on("pointerup", () => press(false));
      circle.on("pointerout", () => press(false));

      if (isAttack) {
        this.attackCircles.push({ circle, base });
        this.attackLabels.push(text);
      }
    };

    const jump = (down: boolean): void => {
      this.state.jump = down;
    };
    const attack = (down: boolean): void => {
      this.state.attack = down;
    };

    // Diamond, SNES-style: the near pair jumps, the far pair fires.
    button(1, 0, "▲", JUMP_COLOR, JUMP_COLOR_DOWN, jump, false); // A
    button(0, 1, "▲", JUMP_COLOR, JUMP_COLOR_DOWN, jump, false); // B
    button(0, -1, "⚡", ATTACK_COLOR, ATTACK_COLOR_DOWN, attack, true); // X
    button(-1, 0, "⚡", ATTACK_COLOR, ATTACK_COLOR_DOWN, attack, true); // Y
  }
}
