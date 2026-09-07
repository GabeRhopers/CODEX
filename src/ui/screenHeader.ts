import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { BUTTON_COLOR, BUTTON_HOVER_COLOR, MUTED_COLOR, TEXT_COLOR } from "./theme";

/**
 * The strip across the top of every screen that is not the game itself: a way
 * back, a title, and usually a line saying what you are looking at.
 *
 * Eleven scenes drew this by hand, with every coordinate written out again each
 * time — five of the back buttons were single expressions identical to the
 * character. Nothing was broken by that, but the top of the app was eleven
 * independent opinions about where a title goes, and they had already drifted:
 * titles sat at y=20, y=24 and y=30, subtitles at 46, 50 and 58, and the back
 * button existed at two different heights.
 *
 * **The heights are the reason this is more than tidying.** Five screens padded
 * the back button by 6px and five by 12px, for the same control doing the same
 * job. `ui/touchTarget.ts` already argues the case for the larger one — at the
 * scale a phone held sideways renders this canvas, the short version met a
 * thumb as about 19 CSS pixels — and there was never a reason for half the app
 * to disagree, only the fact that nobody was comparing. They are all the taller
 * one now.
 *
 * **Not in `gameConfig.ts`.** That file's `HEADER_HEIGHT = 56` is the *grid
 * origin* for the editor and PlayScene — how far down the tilemap starts — and
 * none of the headers here reference it or should. Two different things that
 * would both like to be called "the header height", kept apart deliberately.
 */

/** Left edge of the back button, and the margin the title block sits inside. */
const BACK_X = 24;
const BACK_Y = 20;
/** Top-right actions ("New Level", "Save World") mirror the back button. */
const ACTION_X = GAME_WIDTH - 24;
const TITLE_Y = 22;
const SUBTITLE_Y = 50;

/**
 * Vertical padding on the header's buttons — the taller of the two the app had.
 * See the note above; this is the one visible change this module makes.
 */
export const HEADER_BUTTON_PADDING_Y = 12;

const BUTTON_FONT = "14px";

export interface ScreenHeaderOptions {
  scene: Phaser.Scene;
  title: string;
  subtitle?: string;
  /** Omit for a root screen that has nowhere to go back to. */
  onBack?: () => void;
  /** For the screens whose "back" is not the word Back — the World Map's
   * "← Worlds" / "← Game" / "← Title", which name where they actually go. */
  backLabel?: string;
  /** One action at the top right: "New Level", "New World", "Save World". */
  action?: { label: string; onClick: () => void };
}

export interface ScreenHeader {
  back?: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  subtitle?: Phaser.GameObjects.Text;
  action?: Phaser.GameObjects.Text;
}

/** One header button — back or action. Same shape, different corner. */
function headerButton(
  scene: Phaser.Scene,
  x: number,
  label: string,
  onClick: () => void,
  originX: 0 | 1,
): Phaser.GameObjects.Text {
  const text = scene.add
    .text(x, BACK_Y, label, {
      fontSize: BUTTON_FONT,
      color: TEXT_COLOR,
      backgroundColor: BUTTON_COLOR,
      padding: { x: 10, y: HEADER_BUTTON_PADDING_Y },
    })
    .setOrigin(originX, 0)
    .setInteractive({ useHandCursor: true });
  text.on("pointerdown", onClick);
  // Hover feedback the hand-written copies mostly lacked — the back button was
  // the one control on these screens that did not respond to the pointer.
  text.on("pointerover", () => text.setStyle({ backgroundColor: BUTTON_HOVER_COLOR }));
  text.on("pointerout", () => text.setStyle({ backgroundColor: BUTTON_COLOR }));
  return text;
}

export function drawScreenHeader(options: ScreenHeaderOptions): ScreenHeader {
  const { scene, title, subtitle, onBack, backLabel = "← Back", action } = options;

  const header: ScreenHeader = {
    title: scene.add.text(GAME_WIDTH / 2, TITLE_Y, title, { fontSize: "20px", color: TEXT_COLOR }).setOrigin(0.5, 0),
  };
  if (onBack) header.back = headerButton(scene, BACK_X, backLabel, onBack, 0);
  if (action) header.action = headerButton(scene, ACTION_X, action.label, action.onClick, 1);
  if (subtitle) {
    header.subtitle = scene.add
      .text(GAME_WIDTH / 2, SUBTITLE_Y, subtitle, { fontSize: "12px", color: MUTED_COLOR })
      .setOrigin(0.5, 0);
  }
  return header;
}
