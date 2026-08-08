import Phaser from "phaser";
import { GRID_ROWS, TILE_SIZE } from "../config/gameConfig";
import { EditorUI } from "../editor/EditorUI";
import { EntityPlacer } from "../editor/EntityPlacer";
import { Brush, PALETTE } from "../editor/Palette";
import { TilePainter } from "../editor/TilePainter";
import { cloneLevel } from "../level/LevelSerializer";
import { createEmptyLevel, EntityType, LevelData } from "../level/LevelSchema";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

export class EditorScene extends Phaser.Scene {
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

  constructor() {
    super("Editor");
  }

  create(): void {
    this.level = createEmptyLevel();
    for (const brush of PALETTE) {
      if (brush.entityType) this.brushesByType.set(brush.entityType, brush);
    }

    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: this.level.width,
      height: this.level.height,
    });
    const tileset = map.addTilesetImage("tile-ground", "tile-ground", TILE_SIZE, TILE_SIZE, 0, 0)!;
    this.groundLayer = map.createBlankLayer("ground", tileset, 0, 0)!;

    this.painter = new TilePainter(this.level, this.groundLayer);
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);

    this.highlight = this.add.image(-100, -100, "highlight").setDepth(9);

    this.ui = new EditorUI(this, {
      onSelectBrush: (brush) => (this.currentBrush = brush),
      onTestPlay: () => this.testPlay(),
      onSave: () => void this.saveLevel(),
      onLoad: () => void this.loadLevel(),
      onClear: () => this.clearLevel(),
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= GRID_ROWS * TILE_SIZE) return; // toolbar area, not the grid
      this.isPointerDown = true;
      this.painter.resetDrag();
      this.applyBrushAt(pointer);
    });
    this.input.on("pointerup", () => {
      this.isPointerDown = false;
      this.painter.resetDrag();
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));

    this.input.keyboard?.on("keydown-SPACE", () => this.testPlay());

    this.events.on("resume", () => {
      // Coming back from Test Play: nothing to rebuild, `this.level` and
      // all rendered tiles/markers were untouched while this scene slept.
    });
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
      this.applyBrushAt(pointer);
    }
  }

  private applyBrushAt(pointer: Phaser.Input.Pointer): void {
    const tileX = Math.floor(pointer.x / TILE_SIZE);
    const tileY = Math.floor(pointer.y / TILE_SIZE);
    if (this.currentBrush.kind === "tile" && this.currentBrush.tileIndex !== undefined) {
      this.painter.paintIfNewCell(tileX, tileY, this.currentBrush.tileIndex);
    } else if (this.currentBrush.kind === "entity") {
      this.entityPlacer.place(this.currentBrush, tileX, tileY);
    }
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

  private async loadLevel(): Promise<void> {
    const levels = await this.storage.list();
    if (levels.length === 0) {
      this.ui.setStatus("No saved levels yet");
      return;
    }
    const loaded = await this.storage.load(levels[0].id);
    if (!loaded) {
      this.ui.setStatus("Load failed");
      return;
    }
    this.level = loaded;
    this.rebuildVisualsFromLevel();
    this.ui.setStatus(`Loaded "${loaded.name}"`);
  }

  private clearLevel(): void {
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        this.level.layers.ground[y][x] = -1;
      }
    }
    this.level.entities = [];
    this.rebuildVisualsFromLevel();
    this.ui.setStatus("Cleared");
  }

  private rebuildVisualsFromLevel(): void {
    this.painter = new TilePainter(this.level, this.groundLayer);
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const index = this.level.layers.ground[y][x];
        if (index === -1) this.groundLayer.removeTileAt(x, y);
        else this.groundLayer.putTileAt(index, x, y);
      }
    }
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }
}
