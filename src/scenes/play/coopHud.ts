import Phaser from "phaser";
import { LEFT_BAND, makeConsoleButton } from "../../gameplay/HandheldShell";
import { padApiAvailable, padStatusLine } from "../../gameplay/gamepad";

/**
 * The strip of co-op chrome in the console's left band: the join button, the
 * line naming who holds what once two people are playing, and the line saying
 * whether the console can see a controller at all.
 *
 * All three live in the same empty stretch — between the back button (y 8–34)
 * and the D-pad (`CONTROL_ROW_Y`) — which is the one part of the console with
 * room for them, and they are built together because their positions only make
 * sense relative to each other. PlayScene keeps the handles and decides what
 * they say; this file decides where they sit and what they look like.
 *
 * Two wires, and that is the whole reason this could be lifted out of the scene
 * when `enterArea` next door could not: a scene to draw into, and what to do
 * when somebody presses the button.
 */
export interface CoopHud {
  /** Hidden once a second player has joined — nothing that looks pressable
   * should be inert. */
  button: { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };
  /** Who is holding what. Blank, and hidden, until there are two of them. */
  hint: Phaser.GameObjects.Text;
  /** Whether a controller can be seen, and if not, what to do about it. */
  status: Phaser.GameObjects.Text;
}

/** Centre line of the band, shared by all three so they cannot drift apart. */
const BAND_MID_X = LEFT_BAND.x + LEFT_BAND.width / 2;

export function makeCoopHud(scene: Phaser.Scene, onJoin: () => void): CoopHud {
  const button = makeConsoleButton(scene, {
    x: BAND_MID_X,
    y: 62,
    // Narrower than the back button above it, which is 164. It cannot match:
    // the power LED and its "ON" label sit at x = SCREEN_RECT.x - 18 = 172
    // (see HandheldShell), and a 164-wide button centred in the band reaches
    // x=177 and swallows them. 140 stops at 165. Tried the matching width for
    // tidiness, looked at it, and put it back — the layout invariants compare
    // only interactive *Text*, so a button sitting on top of a lamp is
    // something only a person looking at the screen will ever notice.
    width: 140,
    height: 26,
    label: "+ PLAYER 2",
    depth: 30,
    fontSize: "11px",
    onPress: onJoin,
  });

  // Below the join button, clear of the D-pad further down. Two lines in
  // every state (see padStatusLine) so it never reflows against them.
  const status = scene.add
    .text(BAND_MID_X, 96, padStatusLine(padApiAvailable(), 0), {
      fontSize: "9px",
      color: "#5a5f85",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 3,
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(30);

  // Sits where the button is and only shows once it is gone.
  const hint = scene.add
    .text(BAND_MID_X, 52, "", {
      fontSize: "10px",
      color: "#5a5f85",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 3,
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(30)
    .setVisible(false);

  return { button, hint, status };
}
