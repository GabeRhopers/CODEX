import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { activeBundle } from "../game/contentSource";
import { firstSceneOfGame } from "../game/gameRun";

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

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 42, "Arrow keys or WASD to move, Space to jump", {
        fontSize: "12px",
        color: "#a6a6c8",
      })
      .setOrigin(0.5);
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
