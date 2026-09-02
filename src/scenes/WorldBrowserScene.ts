import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { getWorldStorage } from "../persistence/storage";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { ConfirmButton } from "../ui/confirmButton";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";
import { makePagerControls } from "../ui/PagerControls";
import { WorldSummary } from "../world/WorldSchema";

const ROW_START_Y = 90;
/** Same reasoning as LevelBrowserScene's — see that file. */
const ROW_HEIGHT = 52;
const PAGER_Y = GAME_HEIGHT - 44;
const ROWS_PER_PAGE = rowsPerPage(ROW_START_Y, PAGER_Y, ROW_HEIGHT);

/** Lists saved worlds with Play/Edit/Delete — the World equivalent of
 * LevelBrowserScene, same layout on purpose so the two screens feel like
 * one family rather than two different UIs. */
export class WorldBrowserScene extends Phaser.Scene {
  private get worldStorage(): WorldStorageAdapter {
    return getWorldStorage();
  }
  private page = 0;
  private listContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  /** See LevelBrowserScene's own field — arming one row stands the rest down. */
  private deleteButtons: ConfirmButton[] = [];

  constructor() {
    super("WorldBrowser");
  }

  create(): void {
    this.add
      .text(24, 20, "← Back", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Menu"));

    this.add
      .text(GAME_WIDTH - 24, 20, "New World", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 12 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("WorldMaker"));

    this.add.text(GAME_WIDTH / 2, 24, "My Worlds", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);

    // Back after Play moved to the map, which took the old one with it — a
    // failed delete needs somewhere to say so.
    this.statusText = this.add
      .text(GAME_WIDTH / 2, ROW_START_Y - 22, "", { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0.5);

    this.listContainer = this.add.container(0, 0);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.listContainer.removeAll(true);
    this.deleteButtons = [];
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

    // Eight rows fitted and nothing checked; a ninth world was drawn off the
    // bottom of the canvas. See ui/pager.ts.
    this.page = clampPage(this.page, worlds.length, ROWS_PER_PAGE);
    pageSlice(worlds, this.page, ROWS_PER_PAGE).forEach((world, i) =>
      this.addRow(world, ROW_START_Y + i * ROW_HEIGHT),
    );
    this.listContainer.add(
      makePagerControls({
        scene: this,
        x: 40,
        y: PAGER_Y,
        page: this.page,
        total: worlds.length,
        perPage: ROWS_PER_PAGE,
        onChange: (page) => {
          this.page = page;
          void this.refresh();
        },
      }),
    );
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
    // Two taps, matching My Levels and every other destructive action.
    const deleteBtn = new ConfirmButton({
      scene: this,
      x: GAME_WIDTH - 140,
      y: y + (ROW_HEIGHT - 8) / 2,
      label: "Delete",
      armedLabel: "Delete? Tap again",
      onConfirm: () => void this.deleteWorld(world.id),
    });
    deleteBtn.text.on("pointerdown", () => {
      for (const other of this.deleteButtons) if (other !== deleteBtn) other.disarm();
    });
    this.deleteButtons.push(deleteBtn);

    this.listContainer.add([rowBg, name, meta, playBtn, editBtn, deleteBtn.text]);
  }

  private makeSmallButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        // See LevelBrowserScene's makeSmallButton.
        padding: { x: 10, y: 12 },
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
    try {
      await this.worldStorage.remove(id);
    } catch (err) {
      // Same unguarded shape My Levels had — see LevelBrowserScene.deleteLevel.
      this.statusText.setText("Couldn't delete that world — check your connection and try again.").setColor("#ff6666");
      console.error("World delete failed:", err);
      return;
    }
    this.statusText.setText("").setColor("#a6a6c8");
    void this.refresh();
  }
}
