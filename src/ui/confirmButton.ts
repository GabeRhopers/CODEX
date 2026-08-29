import Phaser from "phaser";

/**
 * A destructive button that needs two taps.
 *
 * First tap arms it — the label changes to say so and it turns red — and a
 * second tap within the timeout actually does the thing. Anything slower
 * disarms and nothing happens.
 *
 * This exists because the browsers' Delete was a *single* click sitting right
 * next to Edit, permanently removing a saved level or world with no undo, while
 * every other destructive action in the app (the editor's Clear and Delete
 * Area, the Skin Creator's Clear and Set as default) was already two-tap. A
 * two-tap confirm rather than a native `confirm()` for the same reason those
 * are: a browser dialog looks nothing like the rest of this UI.
 *
 * Deliberately **not** retrofitted onto `EditorUI`'s Clear. That button is a
 * `PanelButton` — a separate background rectangle plus a label — where these
 * are plain `Text` objects with their own background. Generalising over both
 * shapes would cost more than the copy saves, and the two behave identically
 * anyway, so the next person should leave it alone rather than "finish the job".
 */

/** Long enough not to feel like a hair-trigger double-click, short enough that
 * a stray first tap doesn't leave the button armed for the rest of the session.
 * Matches EditorUI's CLEAR_ARM_TIMEOUT_MS. */
export const CONFIRM_ARM_TIMEOUT_MS = 3000;

export const CONFIRM_IDLE_COLOR = "#0f3460";
export const CONFIRM_HOVER_COLOR = "#3a5a9c";
export const CONFIRM_ARMED_COLOR = "#aa3333";
export const CONFIRM_ARMED_HOVER_COLOR = "#d14f4f";

export interface ConfirmButtonOptions {
  scene: Phaser.Scene;
  x: number;
  /** Vertical centre — these buttons use origin (0, 0.5), like the browsers'
   * existing rows. */
  y: number;
  label: string;
  /** Shown while armed. Says what the next tap will do. */
  armedLabel: string;
  /** Runs on the *second* tap only. */
  onConfirm: () => void;
}

export class ConfirmButton {
  readonly text: Phaser.GameObjects.Text;
  private armed = false;
  private timer?: Phaser.Time.TimerEvent;

  constructor(private readonly options: ConfirmButtonOptions) {
    const { scene, x, y, label } = options;
    this.text = scene.add
      .text(x, y, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: CONFIRM_IDLE_COLOR,
        // y-padding raised from 6 (2026-08-29): at the scale a phone held
        // sideways renders this canvas, the old height met a thumb as ~19 CSS
        // px. Padding rather than a separate hit area, so the button looks
        // exactly as big as it is. See ui/touchTarget.ts.
        padding: { x: 10, y: 12 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    this.text.on("pointerdown", () => this.onTap());
    // Both hover handlers consult `armed`, so hovering an armed button doesn't
    // quietly reset it to looking safe — the same bug the Sprite editor's tool
    // row had.
    this.text.on("pointerover", () =>
      this.text.setStyle({ backgroundColor: this.armed ? CONFIRM_ARMED_HOVER_COLOR : CONFIRM_HOVER_COLOR }),
    );
    this.text.on("pointerout", () =>
      this.text.setStyle({ backgroundColor: this.armed ? CONFIRM_ARMED_COLOR : CONFIRM_IDLE_COLOR }),
    );

    // A rebuilt list destroys these Texts; a timer still holding one would fire
    // against a dead object.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.timer?.remove(false));
  }

  get isArmed(): boolean {
    return this.armed;
  }

  private onTap(): void {
    if (this.armed) {
      this.disarm();
      this.options.onConfirm();
      return;
    }
    this.armed = true;
    this.text.setText(this.options.armedLabel).setStyle({ backgroundColor: CONFIRM_ARMED_COLOR });
    this.timer = this.options.scene.time.delayedCall(CONFIRM_ARM_TIMEOUT_MS, () => this.disarm());
  }

  /** Public so a caller can stand every other button down when one is armed —
   * two buttons both reading "Delete? Tap again" would be a way to delete the
   * wrong thing. */
  disarm(): void {
    this.timer?.remove(false);
    this.timer = undefined;
    if (!this.armed) return;
    this.armed = false;
    this.text.setText(this.options.label).setStyle({ backgroundColor: CONFIRM_IDLE_COLOR });
  }
}
