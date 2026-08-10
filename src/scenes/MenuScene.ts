import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { ensureSampleLevelsSeeded } from "../level/sampleLevels";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { LocalWorldStorageAdapter } from "../persistence/LocalWorldStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";

/**
 * Home page: the game's entry point after boot. Three ways in from here —
 * start a fresh level, browse/manage previously saved ones, or chain
 * levels into a World — rather than always dropping straight into an
 * empty editor.
 */
export class MenuScene extends Phaser.Scene {
  private levelStorage: StorageAdapter = new LocalStorageAdapter();
  private worldStorage: WorldStorageAdapter = new LocalWorldStorageAdapter();

  constructor() {
    super("Menu");
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add.image(cx - 260, 130, "wizard-idle").setScale(1.6);
    this.add.image(cx + 220, 150, "enemy-ghost-pillow").setScale(1.3);
    this.add.image(cx + 300, 100, "goal-portal").setScale(1.1);

    this.add
      .text(cx, 62, "Mario Maker–Style Level Editor", {
        fontSize: "26px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 98, "Paint a level, place a spawn and a goal, then play it — or chain a few into a World.", {
        fontSize: "13px",
        color: "#c8c8e0",
      })
      .setOrigin(0.5);

    this.makeMenuButton(cx, 192, "New Level", () => this.scene.start("Editor"));
    this.makeMenuButton(cx, 244, "My Levels", () => this.scene.start("LevelBrowser"));
    this.makeMenuButton(cx, 296, "Worlds", () => this.scene.start("WorldBrowser"));

    const levelStatusText = this.add
      .text(cx, 348, "Checking saved levels…", { fontSize: "13px", color: "#8888aa" })
      .setOrigin(0.5);
    const worldStatusText = this.add
      .text(cx, 366, "", { fontSize: "11px", color: "#666688" })
      .setOrigin(0.5);

    // First-ever visit seeds 3 ready-to-play sample levels, one per visual
    // theme (grass/desert/castle) so My Levels isn't empty; a flag in
    // localStorage makes this run once per browser, so deleting a sample
    // later doesn't bring it back.
    void ensureSampleLevelsSeeded(this.levelStorage)
      .then(() => this.levelStorage.list())
      .then((levels) => {
        levelStatusText.setText(
          levels.length === 0
            ? "No saved levels yet — start with New Level."
            : `${levels.length} saved level${levels.length === 1 ? "" : "s"} waiting in My Levels.`,
        );
      });

    void this.worldStorage.list().then((worlds) => {
      worldStatusText.setText(
        worlds.length === 0
          ? "No Worlds yet — chain a few levels together in Worlds."
          : `${worlds.length} World${worlds.length === 1 ? "" : "s"} saved.`,
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
