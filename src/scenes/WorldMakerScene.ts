import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { SAVE_STATE_DISPLAY } from "../persistence/saveState";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { createEmptyWorld, WorldData } from "../world/WorldSchema";
import { cellAt, cellCenter, MAP_COLS, MAP_ROWS, MAX_NODES, orderedCells, resolveLayout, type Cell, type MapRect } from "../world/worldLayout";
import { BuiltinStaticBackgroundId, STATIC_BACKGROUNDS, resolveWorldBackground } from "../level/staticBackgrounds";

interface WorldMakerSceneData {
  world?: WorldData;
}

const LIST_START_Y = 90;
const ROW_HEIGHT = 34;
const LEFT_X = 40;
const COLUMN_WIDTH = 380;

/** The map grid, in the space the "this world, in order" list used to occupy.
 * Its own rect — the map *screen* uses the full canvas — which is exactly why
 * worldLayout speaks in cells and converts with a caller-supplied rect. */
const MAP_RECT: MapRect = { x: 460, y: 88, width: GAME_WIDTH - 460 - 24, height: 300 };
const NODE_RADIUS = 15;

// Same debounce as EditorScene's autosave — see that file's comment on why
// this length and why tab-close/navigate-away are handled separately.
const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Course maker v1: click a saved level on the left to append it to the
 * world's play order on the right, click an entry on the right to remove
 * it. No drag-reorder, no renaming — same "very simple first" cut the rest
 * of this project makes elsewhere (levels don't get an in-app rename UI
 * either); reordering can be layered on later without touching WorldData. */
export class WorldMakerScene extends Phaser.Scene {
  private levelStorage: StorageAdapter = getLevelStorage();
  private worldStorage: WorldStorageAdapter = getWorldStorage();
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

    this.add.text(LEFT_X, 62, "Available levels (click to add)", { fontSize: "12px", color: "#a6a6c8" });
    this.add.text(MAP_RECT.x, 62, "The map — drag a node to move it, click it to remove", {
      fontSize: "12px",
      color: "#a6a6c8",
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, "", { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0.5);

    this.availableContainer = this.add.container(0, 0);
    this.worldContainer = this.add.container(0, 0);
    this.buildBackgroundPicker();

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
        // One level per cell, so the map has a hard ceiling — say so rather
        // than accepting a level that would have nowhere to stand.
        if (this.world.levelIds.length >= MAX_NODES) {
          this.statusText.setText(`A world holds at most ${MAX_NODES} levels.`);
          return;
        }
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

    this.drawMap(levelNames);

    const count = this.world.levelIds.length;
    this.statusText.setText(
      count === 0
        ? "Click a level on the left to drop it on the map."
        : `${count} level${count === 1 ? "" : "s"} — paths follow the order you added them.`,
    );
  }

  /**
   * The map: a faint cell grid, the path following play order, and one node per
   * level.
   *
   * Drag moves a node to another cell; a click without a drag removes it. The
   * two share a pointer, so `dragged` is what tells them apart — without it,
   * every drag would end by deleting the node you just placed.
   */
  private drawMap(levelNames: Map<string, string>): void {
    this.worldContainer.removeAll(true);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x2b3350, 0.8);
    for (let col = 0; col <= MAP_COLS; col++) {
      const x = MAP_RECT.x + (col * MAP_RECT.width) / MAP_COLS;
      grid.lineBetween(x, MAP_RECT.y, x, MAP_RECT.y + MAP_RECT.height);
    }
    for (let row = 0; row <= MAP_ROWS; row++) {
      const y = MAP_RECT.y + (row * MAP_RECT.height) / MAP_ROWS;
      grid.lineBetween(MAP_RECT.x, y, MAP_RECT.x + MAP_RECT.width, y);
    }
    this.worldContainer.add(grid);

    // Resolved for drawing but deliberately **not** written back. Only a drag
    // stores a cell.
    //
    // Writing the resolved layout back on every refresh froze each
    // intermediate auto-arrangement: adding a second level pinned the first
    // where it had been centred on its own, so by the third the newcomer had
    // nowhere sensible left and fell back to a corner, with the path cutting
    // right across the map. Keeping `layout` to *deliberate* placements only
    // lets auto-arrange see the whole set every time, and is what the field's
    // "absent means auto" contract meant in the first place.
    const layout = resolveLayout(this.world.levelIds, this.world.layout);

    const points = orderedCells(this.world.levelIds, layout).map((cell) => cellCenter(cell, MAP_RECT));
    const paths = this.add.graphics();
    paths.lineStyle(4, 0x4a5480, 1);
    for (let i = 1; i < points.length; i++) {
      paths.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    this.worldContainer.add(paths);

    this.world.levelIds.forEach((id, index) => {
      const point = points[index];
      if (!point) return;
      const node = this.add
        .circle(point.x, point.y, NODE_RADIUS, 0x3a5a9c)
        .setStrokeStyle(2, 0xffffff, 0.9)
        .setInteractive({ useHandCursor: true, draggable: true });
      const label = this.add.text(point.x, point.y, `${index + 1}`, { fontSize: "12px", color: "#ffffff" }).setOrigin(0.5);
      const name = this.add
        .text(point.x, point.y + NODE_RADIUS + 4, levelNames.get(id) ?? "(deleted level)", {
          fontSize: "9px",
          color: "#a6a6c8",
        })
        .setOrigin(0.5, 0);

      let dragged = false;
      node.on("dragstart", () => {
        dragged = false;
      });
      node.on("drag", (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        dragged = true;
        node.setPosition(dragX, dragY);
        label.setPosition(dragX, dragY);
        name.setPosition(dragX, dragY + NODE_RADIUS + 4);
      });
      node.on("dragend", (pointer: Phaser.Input.Pointer) => {
        const cell = cellAt(pointer.x, pointer.y, MAP_RECT);
        // Dropped off the grid, or onto a cell someone else holds: snap back
        // rather than silently swallowing the move or stacking two nodes.
        if (cell && !this.cellTakenBy(cell, id)) {
          this.world.layout = { ...this.world.layout, [id]: cell };
          this.markDirty();
        }
        void this.refresh();
      });
      node.on("pointerup", () => {
        if (dragged) return; // a drag, not a click
        this.removeLevel(index);
      });

      this.worldContainer.add([node, label, name]);
    });

    if (this.world.levelIds.length === 0) {
      this.worldContainer.add(
        this.add
          .text(MAP_RECT.x + MAP_RECT.width / 2, MAP_RECT.y + MAP_RECT.height / 2, "Empty — add levels from the left.", {
            fontSize: "12px",
            color: "#666688",
          })
          .setOrigin(0.5),
      );
    }
  }

  private cellTakenBy(cell: Cell, exceptId: string): boolean {
    return Object.entries(this.world.layout ?? {}).some(
      ([id, taken]) => id !== exceptId && taken.col === cell.col && taken.row === cell.row,
    );
  }

  private removeLevel(index: number): void {
    const [removed] = this.world.levelIds.splice(index, 1);
    if (removed && this.world.layout) delete this.world.layout[removed];
    this.markDirty();
    void this.refresh();
  }

  /** Cycles the map backdrop through the four built-ins. A one-button cycle
   * rather than a dropdown: there are only four, and a whole AssetPickerMenu
   * for a four-way choice is more UI than the choice deserves. */
  private buildBackgroundPicker(): void {
    const button = this.makeRow(LEFT_X, GAME_HEIGHT - 60, "", () => {
      const ids = STATIC_BACKGROUNDS.map((bg) => bg.id);
      const next = ids[(ids.indexOf(resolveWorldBackground(this.world)) + 1) % ids.length];
      this.world.background = next as BuiltinStaticBackgroundId;
      this.markDirty();
      setLabel();
    });
    const setLabel = (): void => {
      const current = resolveWorldBackground(this.world);
      const label = STATIC_BACKGROUNDS.find((bg) => bg.id === current)?.label ?? current;
      button.setText(`Map backdrop: ${label} ▸`);
    };
    setLabel();
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
   * an explicit click deserves to be told "add a level first." Flips the
   * save-state indicator to "saving" first (after the empty-world no-op
   * check, so an empty world's indicator isn't touched by a click that did
   * nothing) so every path — not just autosave's own tick — shows
   * immediate feedback rather than a stale "Unsaved changes" during a slow
   * Drive round trip. */
  private async persistWorld(): Promise<void> {
    if (this.world.levelIds.length === 0) return;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.saving.text).setColor(SAVE_STATE_DISPLAY.saving.color);
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
    await this.persistWorld();
  }

  /** Same debounce pattern as EditorScene.markDirty — see that file. */
  private markDirty(): void {
    this.dirty = true;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.unsaved.text).setColor(SAVE_STATE_DISPLAY.unsaved.color);
    this.autosaveTimer?.remove(false);
    this.autosaveTimer = this.time.delayedCall(AUTOSAVE_DEBOUNCE_MS, () => void this.autosave());
  }

  /** Same "only navigate once the flush genuinely succeeded" guard as
   * EditorScene.leaveToMenu — see its docstring for why checking `dirty`
   * again after the await (not just awaiting) is what stops a failed Drive
   * write from being silently discarded by leaving the scene. */
  private async leaveToBrowser(): Promise<void> {
    this.autosaveTimer?.remove(false);
    if (this.dirty) await this.persistWorld();
    if (this.dirty) return; // save failed — stay put rather than lose the edit
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
