import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { LevelSummary } from "../level/LevelSchema";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";

const ROW_START_Y = 90;
const ROW_HEIGHT = 44;

/** Lists every saved level with Edit/Delete actions — the piece the MVP's
 * single-slot Save/Load never had. Persistence already supported this
 * (StorageAdapter.list/remove); this scene is purely the missing UI. */
export class LevelBrowserScene extends Phaser.Scene {
  private storage: StorageAdapter = getLevelStorage();
  private listContainer!: Phaser.GameObjects.Container;

  constructor() {
    super("LevelBrowser");
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
      .text(GAME_WIDTH - 24, 20, "New Level", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Editor"));

    this.add.text(GAME_WIDTH / 2, 24, "My Levels", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);

    this.listContainer = this.add.container(0, 0);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.listContainer.removeAll(true);
    const levels = await this.storage.list();

    if (levels.length === 0) {
      this.listContainer.add(
        this.add
          .text(GAME_WIDTH / 2, ROW_START_Y + 20, "No saved levels yet.", { fontSize: "14px", color: "#a6a6c8" })
          .setOrigin(0.5),
      );
      return;
    }

    levels.forEach((level, i) => this.addRow(level, ROW_START_Y + i * ROW_HEIGHT));
  }

  private addRow(level: LevelSummary, y: number): void {
    const rowBg = this.add.rectangle(40, y, GAME_WIDTH - 80, ROW_HEIGHT - 8, 0x16213e).setOrigin(0, 0);
    const name = this.add
      .text(56, y + (ROW_HEIGHT - 8) / 2, level.name || "Untitled Level", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    const updated = this.add
      .text(56, y + (ROW_HEIGHT - 8) / 2 + 16, `Updated ${this.formatDate(level.updatedAt)}`, {
        fontSize: "11px",
        color: "#a6a6c8",
      })
      .setOrigin(0, 0.5);

    const editBtn = this.makeSmallButton(GAME_WIDTH - 240, y + (ROW_HEIGHT - 8) / 2, "Edit", () =>
      this.editLevel(level.id),
    );
    const deleteBtn = this.makeSmallButton(GAME_WIDTH - 140, y + (ROW_HEIGHT - 8) / 2, "Delete", () =>
      this.deleteLevel(level.id),
    );

    this.listContainer.add([rowBg, name, updated, editBtn, deleteBtn]);
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

  private async editLevel(id: string): Promise<void> {
    const level = await this.storage.load(id);
    if (!level) return;
    this.scene.start("Editor", { level });
  }

  private async deleteLevel(id: string): Promise<void> {
    await this.storage.remove(id);
    void this.refresh();
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}
