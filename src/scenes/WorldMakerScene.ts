import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { LocalWorldStorageAdapter } from "../persistence/LocalWorldStorageAdapter";
import { SAVE_STATE_DISPLAY } from "../persistence/saveState";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { createEmptyWorld, WorldData } from "../world/WorldSchema";

interface WorldMakerSceneData {
  world?: WorldData;
}

const LIST_START_Y = 90;
const ROW_HEIGHT = 34;
const LEFT_X = 40;
const RIGHT_X = 480;
const COLUMN_WIDTH = 400;

// Same debounce as EditorScene's autosave — see that file's comment on why
// this length and why tab-close/navigate-away are handled separately.
const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Course maker v1: click a saved level on the left to append it to the
 * world's play order on the right, click an entry on the right to remove
 * it. No drag-reorder, no renaming — same "very simple first" cut the rest
 * of this project makes elsewhere (levels don't get an in-app rename UI
 * either); reordering can be layered on later without touching WorldData. */
export class WorldMakerScene extends Phaser.Scene {
  private levelStorage: StorageAdapter = new LocalStorageAdapter();
  private worldStorage: WorldStorageAdapter = new LocalWorldStorageAdapter();
  private world!: WorldData;
  private availableContainer!: Phaser.GameObjects.Container;
  private worldContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private saveStatusText!: Phaser.GameObjects.Text;
  private dirty = false;
  private autosaveTimer?: Phaser.Time.TimerEvent;
  private readonly handlePageHide = (): void => {
    if (this.dirty) void this.persistWorld();
  };

  constructor() {
    super("WorldMaker");
  }

  init(data: WorldMakerSceneData): void {
    this.world = data?.world ?? createEmptyWorld();
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
      .on("pointerdown", () => void this.leaveToBrowser());

    this.add
      .text(GAME_WIDTH - 24, 20, "Save World", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => void this.save());

    // Persistent, unlike statusText below — see EditorUI's saveStatusText
    // for the same pattern and why it's a separate label.
    this.saveStatusText = this.add
      .text(GAME_WIDTH - 24, 50, SAVE_STATE_DISPLAY.saved.text, {
        fontSize: "12px",
        color: SAVE_STATE_DISPLAY.saved.color,
      })
      .setOrigin(1, 0);

    this.add.text(GAME_WIDTH / 2, 24, "World Maker", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);

    this.add.text(LEFT_X, 62, "Available levels (click to add)", { fontSize: "12px", color: "#8888aa" });
    this.add.text(RIGHT_X, 62, "This world, in order (click to remove)", { fontSize: "12px", color: "#8888aa" });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, "", { fontSize: "11px", color: "#8888aa" })
      .setOrigin(0.5);

    this.availableContainer = this.add.container(0, 0);
    this.worldContainer = this.add.container(0, 0);

    void this.refresh();

    // Same tab-close/refresh safety net as EditorScene — see its comment
    // on why "pagehide" and why the underlying write must stay synchronous.
    window.addEventListener("pagehide", this.handlePageHide);
    this.events.once("shutdown", () => {
      window.removeEventListener("pagehide", this.handlePageHide);
      this.autosaveTimer?.remove(false);
    });
  }

  private async refresh(): Promise<void> {
    const levels = await this.levelStorage.list();
    const levelNames = new Map(levels.map((l) => [l.id, l.name || "Untitled Level"]));

    this.availableContainer.removeAll(true);
    const available = levels.filter((l) => !this.world.levelIds.includes(l.id));
    available.forEach((level, i) => {
      const y = LIST_START_Y + i * ROW_HEIGHT;
      const row = this.makeRow(LEFT_X, y, level.name || "Untitled Level", () => {
        this.world.levelIds.push(level.id);
        this.markDirty();
        void this.refresh();
      });
      this.availableContainer.add(row);
    });
    if (available.length === 0) {
      this.availableContainer.add(
        this.add.text(LEFT_X, LIST_START_Y, "No more saved levels to add.", { fontSize: "12px", color: "#666688" }),
      );
    }

    this.worldContainer.removeAll(true);
    this.world.levelIds.forEach((id, i) => {
      const y = LIST_START_Y + i * ROW_HEIGHT;
      const label = `${i + 1}. ${levelNames.get(id) ?? "(deleted level)"}`;
      const row = this.makeRow(RIGHT_X, y, label, () => {
        this.world.levelIds.splice(i, 1);
        this.markDirty();
        void this.refresh();
      });
      this.worldContainer.add(row);
    });
    if (this.world.levelIds.length === 0) {
      this.worldContainer.add(
        this.add.text(RIGHT_X, LIST_START_Y, "Empty — add levels from the left.", {
          fontSize: "12px",
          color: "#666688",
        }),
      );
    }

    this.statusText.setText(`${this.world.levelIds.length} level${this.world.levelIds.length === 1 ? "" : "s"} in this world.`);
  }

  private makeRow(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#16213e",
        padding: { x: 10, y: 6 },
      })
      .setFixedSize(COLUMN_WIDTH, 22)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#16213e" }));
    return text;
  }

  /** The one place that actually writes to storage — shared by the manual
   * Save World button, autosave, and the leave/pagehide flushes. Silently
   * no-ops on an empty world (nothing meaningful to persist, and an empty
   * `levelIds` would just mint a pointless storage entry) — the manual
   * `save()` wrapper below is what surfaces that as a message, since only
   * an explicit click deserves to be told "add a level first." */
  private async persistWorld(): Promise<void> {
    if (this.world.levelIds.length === 0) return;
    if (!this.world.id) this.world.id = crypto.randomUUID();
    this.world.updatedAt = new Date().toISOString();
    try {
      await this.worldStorage.save(this.world);
      this.dirty = false;
      this.saveStatusText.setText(SAVE_STATE_DISPLAY.saved.text).setColor(SAVE_STATE_DISPLAY.saved.color);
    } catch (err) {
      this.saveStatusText.setText(SAVE_STATE_DISPLAY.error.text).setColor(SAVE_STATE_DISPLAY.error.color);
      this.statusText.setText("Save failed — your browser may be out of storage space");
      console.error("World save failed:", err);
    }
  }

  private async autosave(): Promise<void> {
    if (!this.dirty || this.world.levelIds.length === 0) return;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.saving.text).setColor(SAVE_STATE_DISPLAY.saving.color);
    await this.persistWorld();
  }

  /** Same debounce pattern as EditorScene.markDirty — see that file. */
  private markDirty(): void {
    this.dirty = true;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.unsaved.text).setColor(SAVE_STATE_DISPLAY.unsaved.color);
    this.autosaveTimer?.remove(false);
    this.autosaveTimer = this.time.delayedCall(AUTOSAVE_DEBOUNCE_MS, () => void this.autosave());
  }

  private async leaveToBrowser(): Promise<void> {
    this.autosaveTimer?.remove(false);
    if (this.dirty) await this.persistWorld();
    this.scene.start("WorldBrowser");
  }

  /** The explicit "Save World" button — unlike autosave, a validation
   * failure and a successful save both deserve visible feedback here, and
   * success navigates back to the browser (the button means "I'm done"). */
  private async save(): Promise<void> {
    if (this.world.levelIds.length === 0) {
      this.statusText.setText("Add at least one level before saving.");
      return;
    }
    this.autosaveTimer?.remove(false);
    await this.persistWorld();
    if (!this.dirty) this.scene.start("WorldBrowser");
  }
}
