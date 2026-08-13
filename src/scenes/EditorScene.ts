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
import { ParallaxBackground } from "../gameplay/ParallaxBackground";
import { backgroundScene, BackgroundSceneId, nextBackgroundId, resolveBackground } from "../level/backgrounds";
import { groundFrameAt } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { cloneLevel } from "../level/LevelSerializer";
import { createEmptyLevel, EntityType, LevelData } from "../level/LevelSchema";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

interface EditorSceneData {
  level?: LevelData;
}

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
  private backgroundId!: BackgroundSceneId;
  private parallax!: ParallaxBackground;

  constructor() {
    super("Editor");
  }

  init(data: EditorSceneData): void {
    this.initialLevel = data?.level;
  }

  create(): void {
    this.level = this.initialLevel ?? createEmptyLevel();
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);
    this.backgroundId = resolveBackground(this.level);
    // Static (no per-frame update — there's no player position to track
    // while editing) so it just shows the level's parallax layers at rest.
    // Bounded to the level's actual placeable width, not the (often wider,
    // to fit the toolbar) canvas — see ParallaxBackground's docstring.
    this.parallax = new ParallaxBackground(this, this.backgroundId, this.level.width * TILE_SIZE);
    for (const brush of PALETTE) {
      if (brush.entityType) this.brushesByType.set(brush.entityType, brush);
    }

    this.createGroundLayer();
    this.painter = new TilePainter(this.level, this.groundLayer);
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);

    this.highlight = this.add.image(-100, -100, "highlight").setDepth(9);

    this.ui = new EditorUI(this, backgroundScene(this.backgroundId).label, {
      onSelectBrush: (brush) => (this.currentBrush = brush),
      onTestPlay: () => this.testPlay(),
      onSave: () => void this.saveLevel(),
      onMenu: () => this.scene.start("Menu"),
      onClear: () => this.clearLevel(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onCycleBackground: () => this.cycleBackground(),
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

  /** Swaps the live preview immediately (destroy + recreate, since scenes
   * can have different layer counts) and stores the choice on the level
   * so it round-trips through Save/Edit and Test Play. */
  private cycleBackground(): void {
    this.backgroundId = nextBackgroundId(this.backgroundId);
    this.level.background = this.backgroundId;
    this.parallax.destroy();
    this.parallax = new ParallaxBackground(this, this.backgroundId, this.level.width * TILE_SIZE);
    this.ui.setBackgroundLabel(backgroundScene(this.backgroundId).label);
  }

  private undo(): void {
    if (!this.history.undo()) this.ui.setStatus("Nothing to undo");
  }

  private redo(): void {
    if (!this.history.redo()) this.ui.setStatus("Nothing to redo");
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

  private async saveLevel(): Promise<void> {
    if (!this.level.id) this.level.id = crypto.randomUUID();
    this.level.updatedAt = new Date().toISOString();
    await this.storage.save(this.level);
    this.ui.setStatus("Saved");
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
