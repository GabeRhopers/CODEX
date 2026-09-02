import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { DEFAULT_ENDING_HEADLINE, DEFAULT_ENDING_MESSAGE, GameEnding } from "../game/GameSchema";

/**
 * The screen after the last world.
 *
 * Small on purpose. A game needs *an ending* — a moment that says you finished
 * rather than dumping you back on a menu — and the author's own words over the
 * trophy is a real one you can write and test today. Cut scenes are a later
 * step, and this is the surface they would extend rather than replace.
 *
 * Takes the words as scene data instead of re-reading the game document: the
 * only thing that starts this already has the game in hand (WorldMapScene), and
 * a second read is a second chance for the two to disagree about what the
 * ending says.
 */

interface EndingSceneData {
  ending?: GameEnding;
  title?: string;
}

export class EndingScene extends Phaser.Scene {
  private ending: GameEnding = { headline: DEFAULT_ENDING_HEADLINE, message: DEFAULT_ENDING_MESSAGE };
  private gameTitle = "";

  constructor() {
    super("Ending");
  }

  init(data?: EndingSceneData): void {
    // Falls back rather than showing blanks: an ending reached with nothing to
    // say should still read as an ending. Empty strings are treated as absent
    // for the same reason — a cleared field is not an instruction to show a
    // gap where the headline goes.
    this.ending = {
      headline: data?.ending?.headline?.trim() || DEFAULT_ENDING_HEADLINE,
      message: data?.ending?.message?.trim() || DEFAULT_ENDING_MESSAGE,
    };
    this.gameTitle = data?.title?.trim() ?? "";
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x12122a).setOrigin(0, 0);

    if (this.gameTitle) {
      this.add
        .text(GAME_WIDTH / 2, 66, this.gameTitle, { fontSize: "14px", color: "#a6a6c8" })
        .setOrigin(0.5, 0.5);
    }

    const trophy = this.add.image(GAME_WIDTH / 2, 150, "trophy");
    trophy.setScale(Math.min(3, 96 / Math.max(trophy.width, trophy.height)));

    this.add
      .text(GAME_WIDTH / 2, 236, this.ending.headline, { fontSize: "34px", color: "#ffc93c" })
      .setOrigin(0.5, 0.5);

    // wordWrap rather than a fixed width, so a long sign-off wraps instead of
    // running off the canvas — the field is one line, but nothing stops someone
    // typing sixty words into it.
    this.add
      .text(GAME_WIDTH / 2, 300, this.ending.message, {
        fontSize: "16px",
        color: "#eeeeee",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 240 },
      })
      .setOrigin(0.5, 0);

    const back = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 64, "Back to Menu", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    back.on("pointerdown", () => this.scene.start("Menu"));
    back.on("pointerover", () => back.setStyle({ backgroundColor: "#3a5a9c" }));
    back.on("pointerout", () => back.setStyle({ backgroundColor: "#0f3460" }));
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("Menu"));
  }
}
