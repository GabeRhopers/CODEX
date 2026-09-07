import Phaser from "phaser";
import { BUTTON_COLOR, BUTTON_HOVER_COLOR, SELECTED_COLOR, SELECTED_HOVER_COLOR, TEXT_COLOR } from "./theme";

/**
 * A text button: a label with a coloured background that lights up under the
 * pointer.
 *
 * Thirteen scenes had written this themselves. Not thirteen *similar* things —
 * two groups of three were character-for-character identical, comment included,
 * and two of those files even said so (`// See LevelBrowserScene's
 * makeSmallButton.`). The shape never varied: `add.text` with a style object,
 * origin (0, 0.5), `setInteractive`, then the same three handlers — pointerdown
 * to act, pointerover and pointerout to swap the background.
 *
 * That is the whole of what this does. It is not a widget framework and it does
 * not try to cover every button in the app: the ones that are genuinely a
 * different shape are listed below and deliberately left alone.
 *
 * **Not for**:
 *   - `EditorUI.makeFixedWidthButton` — a Rectangle with a separate Text label
 *     on top, because the panels need a fixed width the text does not control.
 *   - `PlayScene.makeOverlayButton` — no hover at all (it is over gameplay),
 *     and it carries its own depth and scroll factor.
 *   - `PagerControls`' private one — it has a disabled state nothing else has.
 *   - `CutSceneScene`'s — returns void and is called once.
 * Pulling those in would mean options that only one caller ever sets, which is
 * how a helper stops being simpler than the thing it replaced.
 */

export interface TextButtonOptions {
  scene: Phaser.Scene;
  x: number;
  /** Vertical centre — these use origin (0, 0.5), as every copy did. */
  y: number;
  label: string;
  onClick: () => void;
  /**
   * Vertical padding. The one thing the copies genuinely disagreed on: the
   * maker screens used 6, the browsers 12. Both are still reachable, but see
   * `TALL_PADDING_Y` for which one new code should pick.
   */
  paddingY?: number;
  fontSize?: string;
  /**
   * Whether this button represents the currently-chosen thing, re-read on every
   * repaint rather than captured — a button whose selected-ness changes while
   * it is on screen (a frame in the Skin Creator, a tool) needs the *current*
   * answer at hover time, not the answer when it was built.
   */
  isActive?: () => boolean;
}

/**
 * The vertical padding a new button should use.
 *
 * `ui/touchTarget.ts` already argues this case for the editor's icons — "tall
 * enough to aim at on a phone held sideways" — and it applies just as well
 * here. The 6px copies predate that reasoning rather than disagreeing with it.
 */
export const TALL_PADDING_Y = 12;

export function makeTextButton(options: TextButtonOptions): Phaser.GameObjects.Text {
  const { scene, x, y, label, onClick, paddingY = TALL_PADDING_Y, fontSize = "12px", isActive } = options;

  // Functions rather than values, because `isActive` can change between the
  // build and the hover — which is exactly what the Skin Creator's frame
  // buttons rely on.
  const idle = (): string => (isActive?.() ? SELECTED_COLOR : BUTTON_COLOR);
  const hover = (): string => (isActive?.() ? SELECTED_HOVER_COLOR : BUTTON_HOVER_COLOR);

  const text = scene.add
    .text(x, y, label, {
      fontSize,
      color: TEXT_COLOR,
      backgroundColor: idle(),
      padding: { x: 10, y: paddingY },
    })
    .setOrigin(0, 0.5)
    .setInteractive({ useHandCursor: true });

  text.on("pointerdown", onClick);
  text.on("pointerover", () => text.setStyle({ backgroundColor: hover() }));
  text.on("pointerout", () => text.setStyle({ backgroundColor: idle() }));
  return text;
}

/** Repaints a stateful button to its resting look. Needed because the button
 * only re-reads `isActive` on hover, so a change made while the pointer is
 * elsewhere would otherwise not show until you happened to touch it. */
export function refreshTextButton(button: Phaser.GameObjects.Text, active: boolean): void {
  button.setStyle({ backgroundColor: active ? SELECTED_COLOR : BUTTON_COLOR });
}
