import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { getWorldStorage } from "../persistence/storage";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { WorldSummary } from "../world/WorldSchema";

const ROW_START_Y = 90;
const ROW_HEIGHT = 44;

/** Lists saved worlds with Play/Edit/Delete — the World equivalent of
 * LevelBrowserScene, same layout on purpose so the two screens feel like
 * one family rather than two different UIs. */
export class WorldBrowserScene extends Phaser.Scene {
  private worldStorage: WorldStorageAdapter = getWorldStorage();
  private listContainer!: Phaser.GameObjects.Container;

  constructor() {
    super("WorldBrowser");
  }

  create(): void {
    this.add
      .text(24, 20, "← Back", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Menu"));

    this.add
      .text(GAME_WIDTH - 24, 20, "New World", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("WorldMaker"));

    this.add.text(GAME_WIDTH / 2, 24, "My Worlds", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);

    this.listContainer = this.add.container(0, 0);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.listContainer.removeAll(true);
    const worlds = await this.worldStorage.list();

    if (worlds.length === 0) {
      this.listContainer.add(
        this.add
          .text(GAME_WIDTH / 2, ROW_START_Y + 20, "No worlds yet — chain a few levels together with New World.", {
            fontSize: "14px",
            color: "#a6a6c8",
          })
          .setOrigin(0.5),
      );
      return;
    }

    worlds.forEach((world, i) => this.addRow(world, ROW_START_Y + i * ROW_HEIGHT));
  }

  private addRow(world: WorldSummary, y: number): void {
    const rowBg = this.add.rectangle(40, y, GAME_WIDTH - 80, ROW_HEIGHT - 8, 0x16213e).setOrigin(0, 0);
    const name = this.add
      .text(56, y + (ROW_HEIGHT - 8) / 2, world.name || "Untitled World", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    const meta = this.add
      .text(56, y + (ROW_HEIGHT - 8) / 2 + 16, `${world.levelCount} level${world.levelCount === 1 ? "" : "s"}`, {
        fontSize: "11px",
        color: "#a6a6c8",
      })
      .setOrigin(0, 0.5);

    const playBtn = this.makeSmallButton(GAME_WIDTH - 320, y + (ROW_HEIGHT - 8) / 2, "Play", () =>
      this.playWorld(world.id),
    );
    const editBtn = this.makeSmallButton(GAME_WIDTH - 240, y + (ROW_HEIGHT - 8) / 2, "Edit", () =>
      void this.editWorld(world.id),
    );
    const deleteBtn = this.makeSmallButton(GAME_WIDTH - 140, y + (ROW_HEIGHT - 8) / 2, "Delete", () =>
      void this.deleteWorld(world.id),
    );

    this.listContainer.add([rowBg, name, meta, playBtn, editBtn, deleteBtn]);
  }

  private makeSmallButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
  }

  /**
   * Opens the world's map rather than launching its first level directly.
   *
   * The map is where progress lives, so entering through it is also what makes
   * "resume where I left off" work — going straight to level 1 would restart
   * every world on every visit, which is what this used to do. The map itself
   * handles an empty world and a since-deleted level, so neither needs checking
   * twice.
   */
  private playWorld(id: string): void {
    this.scene.start("WorldMap", { worldId: id });
  }

  private async editWorld(id: string): Promise<void> {
    const world = await this.worldStorage.load(id);
    if (!world) return;
    this.scene.start("WorldMaker", { world });
  }

  private async deleteWorld(id: string): Promise<void> {
    await this.worldStorage.remove(id);
    void this.refresh();
  }
}
