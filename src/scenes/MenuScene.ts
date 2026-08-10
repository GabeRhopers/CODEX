import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

/**
 * Home page: the game's entry point after boot. Two ways in from here —
 * start a fresh level, or browse/manage previously saved ones — rather
 * than always dropping straight into an empty editor.
 */
export class MenuScene extends Phaser.Scene {
  private storage: StorageAdapter = new LocalStorageAdapter();

  constructor() {
    super("Menu");
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add.image(cx - 260, 130, "wizard-idle").setScale(1.6);
    this.add.image(cx + 220, 150, "enemy-ghost-pillow").setScale(1.3);
    this.add.image(cx + 300, 100, "goal-portal").setScale(1.1);

    this.add
      .text(cx, 70, "Mario Maker–Style Level Editor", {
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 108, "Paint a level, place a spawn and a goal, then play it.", {
        fontSize: "14px",
        color: "#c8c8e0",
      })
      .setOrigin(0.5);

    this.makeMenuButton(cx, 210, "New Level", () => this.scene.start("Editor"));
    this.makeMenuButton(cx, 270, "My Levels", () => this.scene.start("LevelBrowser"));

    const statusText = this.add
      .text(cx, 330, "Checking saved levels…", { fontSize: "13px", color: "#8888aa" })
      .setOrigin(0.5);

    void this.storage.list().then((levels) => {
      statusText.setText(
        levels.length === 0
          ? "No saved levels yet — start with New Level."
          : `${levels.length} saved level${levels.length === 1 ? "" : "s"} waiting in My Levels.`,
      );
    });

    this.add
      .text(cx, GAME_HEIGHT - 20, "Arrow keys / WASD to move, Space to jump, once you're playing", {
        fontSize: "11px",
        color: "#666688",
      })
      .setOrigin(0.5);
  }

  private makeMenuButton(cx: number, y: number, label: string, onClick: () => void): void {
    const text = this.add
      .text(cx, y, label, {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
  }
}
