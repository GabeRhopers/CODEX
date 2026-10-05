import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { activeBundle } from "../game/contentSource";
import { firstSceneOfGame } from "../game/gameRun";
import { padConnected } from "../gameplay/gamepad";
import { installPadNavigation } from "../gameplay/padNavigation";

/**
 * The controls line under the Play button.
 *
 * **It named three things a tablet does not have.** Until 2026-10-05 this read
 * "Arrow keys or WASD to move, Space to jump" — unconditionally, on the one
 * screen somebody who was *sent a link* actually arrives at. The audience for a
 * published game is a family opening it on a phone or an iPad, where there is no
 * keyboard at all, and it said nothing about the D-pad and face buttons that
 * `HandheldShell` draws around every level. The game was perfectly playable; the
 * title simply described a different machine.
 *
 * Nothing failed and nothing looked broken, so no assertion could have caught
 * it. It was found by screenshotting the published game and reading it.
 *
 * The wording is `MenuScene`'s, which already named all three on the editor
 * side, minus its "once you're playing" tail — on this screen you are about to.
 * Deliberately *not* shared as one constant with it: that tail is true there and
 * false here, and one string forced on both would have to be a little untrue
 * somewhere. Matching the vocabulary is the point, not the identity.
 *
 * No touch detection, deliberately — see `TouchControls`, which has none "to get
 * wrong" and whose buttons are genuinely clickable with a mouse too. Naming all
 * three is true on every device and needs no branch.
 *
 * Held as a constant because the controller notice is appended to it rather than
 * replacing it — a pad joins these exactly as it does in gameplay.
 */
const CONTROLS_HINT = "Arrow keys/WASD/on-screen buttons to move, Space/▲ to jump";

/**
 * The front door of a published game.
 *
 * A game has a title, and this is the one place it is ever shown at full size —
 * the editor's Game Maker only ever shows it as a field to fill in. It also
 * gives a player somewhere to arrive that is not the middle of a level.
 *
 * Only ever reached in a play-only boot, so there is deliberately nothing here
 * about editing, signing in, or picking a profile: those are the whole
 * difference between this and the Menu.
 */
export class GameTitleScene extends Phaser.Scene {
  constructor() {
    super("GameTitle");
  }

  create(): void {
    const bundle = activeBundle();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x12122a).setOrigin(0, 0);

    if (!bundle || bundle.worlds.length === 0) {
      // Reachable only if a bundle was published with nothing playable in it.
      // Saying so beats a blank screen with a dead button on it.
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "This game has no worlds in it yet.", {
          fontSize: "16px",
          color: "#ff9d9d",
        })
        .setOrigin(0.5);
      return;
    }

    const grampa = this.add.image(GAME_WIDTH / 2, 168, "wizard-idle");
    grampa.setScale(Math.min(3, 120 / Math.max(grampa.width, grampa.height)));

    this.add
      .text(GAME_WIDTH / 2, 258, bundle.game.title || "Untitled Game", {
        fontSize: "36px",
        color: "#ffc93c",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 160 },
      })
      .setOrigin(0.5, 0);

    const play = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 96, "Play ▶", {
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#2e7d32",
        padding: { x: 26, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    play.on("pointerover", () => play.setStyle({ backgroundColor: "#3f9d44" }));
    play.on("pointerout", () => play.setStyle({ backgroundColor: "#2e7d32" }));
    play.on("pointerdown", () => this.start());
    this.input.keyboard?.on("keydown-SPACE", () => this.start());
    this.input.keyboard?.on("keydown-ENTER", () => this.start());
    installPadNavigation(this, { onConfirm: () => this.start() });

    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 42, CONTROLS_HINT, { fontSize: "12px", color: "#a6a6c8" })
      .setOrigin(0.5);

    /**
     * Tell the player their controller was seen.
     *
     * **Cannot be answered once in `create()`.** Browsers deliberately hide
     * gamepads until a button is pressed on one, so a pad plugged in before the
     * page loaded is invisible until the player touches it — checking at build
     * time would say "no controller" to somebody holding one.
     *
     * Watching instead turns that constraint into the feature: the line
     * changing under your thumb *is* the confirmation that the press
     * registered, which is the one thing a player cannot otherwise tell before
     * committing to a level.
     */
    const watchPad = (): void => {
      const text = padConnected() ? `${CONTROLS_HINT} · Controller ready` : CONTROLS_HINT;
      if (hint.text !== text) hint.setText(text);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, watchPad);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, watchPad));
  }

  private start(): void {
    const bundle = activeBundle();
    if (!bundle || bundle.worlds.length === 0) return;
    // `firstSceneOfGame` decides whether an opening cut scene comes first, and
    // builds the hand-over the Game Maker's own Play Game uses too — a published
    // run and a tested one go down one code path rather than two.
    const first = firstSceneOfGame(bundle.game);
    this.scene.start(first.key, first.data);
  }
}
