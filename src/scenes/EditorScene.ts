import Phaser from "phaser";
import { GRID_ROWS, TILE_SIZE } from "../config/gameConfig";
import { Command } from "../editor/commands/Command";
import { CompositeCommand } from "../editor/commands/CompositeCommand";
import { HistoryStack } from "../editor/commands/HistoryStack";
import { PaintTileCommand } from "../editor/commands/PaintTileCommand";
import { PlaceEntityCommand } from "../editor/commands/PlaceEntityCommand";
import { EditorUI } from "../editor/EditorUI";
import { EntityPlacer } from "../editor/EntityPlacer";
import { Brush, PALETTE } from "../editor/Palette";
import { TilePainter } from "../editor/TilePainter";
import { StaticBackground } from "../gameplay/StaticBackground";
import { groundFrameAt } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { cloneLevel } from "../level/LevelSerializer";
import { createEmptyLevel, EntityType, LevelData } from "../level/LevelSchema";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

interface EditorSceneData {
  level?: LevelData;
}

/** How long to wait after the last edit before autosaving — long enough
 * that a fast paint drag or a burst of undo/redo doesn't trigger a storage
 * write per keystroke, short enough that a tab crash/power loss can't lose
 * much. Tab close/refresh/navigate-away are covered separately (by a
 * synchronous flush on "pagehide" and before leaving to Menu), so this
 * delay only bounds the "still actively editing" risk window, not the
 * "about to leave" one. */
const AUTOSAVE_DEBOUNCE_MS = 2000;

export class EditorScene extends Phaser.Scene {
  private initialLevel?: LevelData;
  private level!: LevelData;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private painter!: TilePainter;
  private entityPlacer!: EntityPlacer;
  private ui!: EditorUI;
  private highlight!: Phaser.GameObjects.Image;
  private currentBrush: Brush = PALETTE[0];
  private isPointerDown = false;
  private storage: StorageAdapter = new LocalStorageAdapter();
  private brushesByType = new Map<EntityType, Brush>();
  private history = new HistoryStack();
  private dragCommands: Command[] = [];
  private dragLastX = -1;
  private dragLastY = -1;
  private lastActionFrame = new Map<string, number>();
  private dirty = false;
  private autosaveTimer?: Phaser.Time.TimerEvent;
  // A stable bound reference so it can be removed on shutdown — an inline
  // arrow passed straight to addEventListener can never be un-registered.
  private readonly handlePageHide = (): void => {
    if (this.dirty) void this.persistLevel();
  };

  constructor() {
    super("Editor");
  }

  init(data: EditorSceneData): void {
    this.initialLevel = data?.level;
  }

  create(): void {
    this.level = this.initialLevel ?? createEmptyLevel();
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);
    // Bounded to the level's actual placeable width, not the (often wider,
    // to fit the toolbar) canvas — see StaticBackground's docstring. The
    // editor never updates or destroys it directly (no player position to
    // pan by, and a level-width change starts a fresh EditorScene instance
    // rather than mutating this one), so it's create-and-forget here.
    new StaticBackground(this, this.level.width * TILE_SIZE);
    for (const brush of PALETTE) {
      if (brush.entityType) this.brushesByType.set(brush.entityType, brush);
    }

    this.createGroundLayer();
    this.painter = new TilePainter(this.level, this.groundLayer);
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);

    this.highlight = this.add.image(-100, -100, "highlight").setDepth(9);

    this.ui = new EditorUI(this, {
      onSelectBrush: (brush) => (this.currentBrush = brush),
      onTestPlay: () => this.testPlay(),
      onSave: () => void this.saveLevel(),
      onMenu: () => void this.leaveToMenu(),
      onClear: () => this.clearLevel(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
    });

    if (this.initialLevel) this.rebuildVisualsFromLevel();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= GRID_ROWS * TILE_SIZE) return; // toolbar area, not the grid
      const tileX = Math.floor(pointer.x / TILE_SIZE);
      const tileY = Math.floor(pointer.y / TILE_SIZE);
      if (this.currentBrush.kind === "tile") {
        this.isPointerDown = true;
        this.dragCommands = [];
        this.dragLastX = -1;
        this.dragLastY = -1;
        this.applyTileBrushAt(tileX, tileY);
      } else {
        this.applyEntityBrushAt(tileX, tileY);
      }
    });
    this.input.on("pointerup", () => {
      this.isPointerDown = false;
      this.flushDragCommands();
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));

    this.input.keyboard?.on("keydown-SPACE", () => this.onceThisFrame("testPlay", () => this.testPlay()));
    this.input.keyboard?.on("keydown-Z", (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.shiftKey) this.onceThisFrame("redo", () => this.redo());
      else this.onceThisFrame("undo", () => this.undo());
    });
    this.input.keyboard?.on("keydown-Y", (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.onceThisFrame("redo", () => this.redo());
    });

    // Best-effort save on tab close/refresh/navigate-away, independent of
    // Phaser's scene lifecycle (still fires even if this scene is merely
    // paused behind Test Play, unlike a delayedCall — see AUTOSAVE_DEBOUNCE_MS
    // above). Relies on LocalStorageAdapter.save's write actually being
    // synchronous under its `async` signature (see StorageAdapter.ts) —
    // "pagehide" gives no guarantee that awaited work after it completes.
    window.addEventListener("pagehide", this.handlePageHide);
    this.events.once("shutdown", () => {
      window.removeEventListener("pagehide", this.handlePageHide);
      this.autosaveTimer?.remove(false);
    });
  }

  /** Phaser's keyboard queue can re-emit the same physical keydown more
   * than once within a single rendered frame under frame stalls (observed
   * with software-rendered WebGL) even though the browser only dispatched
   * one native event. Since a single physical keypress can't legitimately
   * produce two independent actions within one frame, only the first
   * invocation per (action, frame) pair runs. */
  private onceThisFrame(action: string, fn: () => void): void {
    const frame = this.game.loop.frame;
    if (this.lastActionFrame.get(action) === frame) return;
    this.lastActionFrame.set(action, frame);
    fn();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.y >= GRID_ROWS * TILE_SIZE) {
      this.highlight.setPosition(-100, -100);
      return;
    }
    const tileX = Math.floor(pointer.x / TILE_SIZE);
    const tileY = Math.floor(pointer.y / TILE_SIZE);
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) {
      this.highlight.setPosition(-100, -100);
    } else {
      this.highlight.setPosition(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
    }
    if (this.isPointerDown && this.currentBrush.kind === "tile") {
      this.applyTileBrushAt(tileX, tileY);
    }
  }

  /** Applies the current tile brush at one cell, debounced to "new cell
   * since the drag started", and records a PaintTileCommand for it. The
   * command is collected in dragCommands (not pushed to history yet) so a
   * whole drag becomes one undo step — see flushDragCommands. */
  private applyTileBrushAt(tileX: number, tileY: number): void {
    if (this.currentBrush.tileIndex === undefined) return;
    if (tileX === this.dragLastX && tileY === this.dragLastY) return;
    this.dragLastX = tileX;
    this.dragLastY = tileY;

    const prevIndex = this.level.layers.ground[tileY]?.[tileX];
    if (prevIndex === undefined) return; // out of bounds

    const newIndex = this.currentBrush.tileIndex;
    if (!this.painter.paint(tileX, tileY, newIndex)) return; // no-op (already this value)

    this.dragCommands.push(new PaintTileCommand(this.painter, tileX, tileY, prevIndex, newIndex));
  }

  private flushDragCommands(): void {
    if (this.dragCommands.length === 0) return;
    const command =
      this.dragCommands.length === 1 ? this.dragCommands[0] : new CompositeCommand(this.dragCommands);
    this.history.push(command);
    this.dragCommands = [];
    this.markDirty();
  }

  private applyEntityBrushAt(tileX: number, tileY: number): void {
    const type = this.currentBrush.entityType;
    if (!type) return;
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) return;

    const prev = this.entityPlacer.getPosition(type);
    if (prev && prev.x === tileX && prev.y === tileY) return; // no-op, same spot

    const command = new PlaceEntityCommand(this.entityPlacer, this.currentBrush, prev, { x: tileX, y: tileY });
    command.execute();
    this.history.push(command);
    this.markDirty();
  }

  /** Builds the tilemap layer against all 4 ground skins at once — each
   * skin's 5-frame image (top/fill/brick/bounce/hazard) is registered as
   * its own Phaser Tileset, claiming a 5-wide gid range in GROUND_SKINS
   * order (grass 0-4, desert 5-9, castle 10-14, snow 15-19 — see
   * groundAutotile.ts, which is the single source of truth for that
   * layout). A tile's stored value picks both its skin and its frame, so
   * one level can freely mix all four skins; there's no level-wide
   * "active" tileset to rebuild when nothing's just been placed. */
  private createGroundLayer(): void {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: this.level.width,
      height: this.level.height,
    });
    const tilesets = GROUND_SKINS.map((skin, i) => {
      const key = groundTilesetKey(skin);
      return map.addTilesetImage(key, key, TILE_SIZE, TILE_SIZE, 0, 0, i * 5)!;
    });
    this.groundLayer = map.createBlankLayer("ground", tilesets, 0, 0)!;
  }

  private undo(): void {
    if (this.history.undo()) this.markDirty();
    else this.ui.setStatus("Nothing to undo");
  }

  private redo(): void {
    if (this.history.redo()) this.markDirty();
    else this.ui.setStatus("Nothing to redo");
  }

  private testPlay(): void {
    const hasSpawn = this.level.entities.some((e) => e.type === "player-spawn");
    const hasGoal = this.level.entities.some((e) => e.type === "goal");
    if (!hasSpawn || !hasGoal) {
      this.ui.setStatus("Place a Spawn and a Goal before Test Play");
      return;
    }
    const snapshot = cloneLevel(this.level);
    this.scene.launch("Play", { level: snapshot });
    this.scene.pause();
  }

  /** The one place that actually writes to storage — shared by the manual
   * Save button, autosave, the pre-Menu flush, and the pagehide flush, so
   * id-minting/error-handling/dirty-clearing only exist once. Callers
   * decide their own UI feedback on top (a toast for an explicit click,
   * nothing for a silent autosave tick). */
  private async persistLevel(): Promise<void> {
    if (!this.level.id) this.level.id = crypto.randomUUID();
    this.level.updatedAt = new Date().toISOString();
    try {
      await this.storage.save(this.level);
      this.dirty = false;
      this.ui.setSaveState("saved");
    } catch (err) {
      // Left dirty on purpose — nothing was actually persisted. Surfaces
      // once here rather than retrying on a timer: if storage is genuinely
      // full/unavailable, retrying every couple seconds would just be
      // noise. The next edit (via markDirty) or another manual Save click
      // will try again.
      this.ui.setSaveState("error");
      this.ui.setStatus("Save failed — your browser may be out of storage space");
      console.error("Level save failed:", err);
    }
  }

  private async saveLevel(): Promise<void> {
    this.autosaveTimer?.remove(false);
    await this.persistLevel();
    // Only toast on success — persistLevel already surfaced a "Save
    // failed" status in the failure case, and dirty stays true then.
    if (!this.dirty) this.ui.setStatus("Saved");
  }

  private async autosave(): Promise<void> {
    if (!this.dirty) return; // a manual Save (or an even newer edit) may have already handled it
    this.ui.setSaveState("saving");
    await this.persistLevel();
  }

  /** Marks the level as having edits storage doesn't know about yet, and
   * (re)starts the autosave debounce — called on every paint drag, entity
   * move, undo, and redo. Any call while a timer is already pending cancels
   * and replaces it, so autosave fires a fixed delay after the *last* edit
   * in a burst, not the first. */
  private markDirty(): void {
    this.dirty = true;
    this.ui.setSaveState("unsaved");
    this.autosaveTimer?.remove(false);
    this.autosaveTimer = this.time.delayedCall(AUTOSAVE_DEBOUNCE_MS, () => void this.autosave());
  }

  private async leaveToMenu(): Promise<void> {
    this.autosaveTimer?.remove(false);
    if (this.dirty) await this.persistLevel();
    this.scene.start("Menu");
  }

  private clearLevel(): void {
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        this.level.layers.ground[y][x] = -1;
      }
    }
    this.level.entities = [];
    this.rebuildVisualsFromLevel();
    this.history.clear();
    this.markDirty();
    this.ui.setStatus("Cleared");
  }

  private rebuildVisualsFromLevel(): void {
    this.painter = new TilePainter(this.level, this.groundLayer);
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const index = this.level.layers.ground[y][x];
        if (index === -1) this.groundLayer.removeTileAt(x, y);
        else this.groundLayer.putTileAt(groundFrameAt(this.level.layers.ground, x, y), x, y);
      }
    }
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }
}
