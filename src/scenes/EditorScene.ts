import Phaser from "phaser";
import { GAME_WIDTH, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, RIGHT_PANEL_WIDTH, TILE_SIZE } from "../config/gameConfig";
import { AddEntityCommand } from "../editor/commands/AddEntityCommand";
import { Command } from "../editor/commands/Command";
import { CompositeCommand } from "../editor/commands/CompositeCommand";
import { EraseEntityCommand } from "../editor/commands/EraseEntityCommand";
import { HistoryStack } from "../editor/commands/HistoryStack";
import { PaintTileCommand } from "../editor/commands/PaintTileCommand";
import { EditorUI } from "../editor/EditorUI";
import { readAndDownscaleImage } from "../editor/customBackgroundUpload";
import { EntityPlacer } from "../editor/EntityPlacer";
import { MusicTooLargeError, readAudioAsDataUrl } from "../editor/musicUpload";
import { Brush, PALETTE } from "../editor/Palette";
import { TilePainter } from "../editor/TilePainter";
import { isEnemyType } from "../gameplay/EnemyBehaviors";
import { resolveBackgroundTextureKey } from "../gameplay/backgroundLoader";
import { StaticBackground } from "../gameplay/StaticBackground";
import { groundFrameAt } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { cloneLevel } from "../level/LevelSerializer";
import { createEmptyLevel, DEFAULT_ENEMY_SIZE, EMPTY_TILE, EnemySize, EntityType, LevelData } from "../level/LevelSchema";
import { backgroundDisplayLabel, nextStaticBackgroundId, resolveStaticBackground, StaticBackgroundId } from "../level/staticBackgrounds";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { loadActiveProfile } from "../profile/Profile";
import { resolveSkinTextureKeys } from "../skins/skinLoader";
import { removeCustomSkin, saveCustomSkin } from "../skins/skinStorage";
import { readAndDownscaleSkinImage } from "../skins/skinUpload";

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

/** Entity types kept singleton per level (see EntityPlacer's docstring) —
 * placing one moves the existing instance rather than adding another,
 * unlike Enemies/Items/Decor which have no such limit. */
const MARKER_TYPES = new Set<EntityType>(["player-spawn", "goal", "chest"]);

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
  // Header-level toggle, independent of currentBrush — see applyEraseAt's
  // docstring for why erasing stopped being a per-category brush.
  private eraserActive = false;
  // The right panel's "Enemy Size" selector — meaningful only when the
  // brush being placed is an enemy (see applyEntityBrushAt); persists
  // across brush/category switches like currentBrush itself does, rather
  // than resetting to "medium" every time, so picking Large once and then
  // browsing other categories doesn't lose the choice.
  private currentSize: EnemySize = DEFAULT_ENEMY_SIZE;
  private storage: StorageAdapter = getLevelStorage();
  private brushesByType = new Map<EntityType, Brush>();
  private history = new HistoryStack();
  private dragCommands: Command[] = [];
  private dragLastX = -1;
  private dragLastY = -1;
  private lastActionFrame = new Map<string, number>();
  private dirty = false;
  private autosaveTimer?: Phaser.Time.TimerEvent;
  private backgroundId!: StaticBackgroundId;
  // Optional (not `!`), unlike every other field constructed synchronously
  // in create() — a "custom" background's texture is registered async (see
  // backgroundLoader.ts), so nothing can rely on this existing until that
  // promise resolves.
  private background?: StaticBackground;
  // brushId -> texture key for every brush with a custom skin uploaded —
  // see skinLoader.ts. Resolved async in create() (Drive round trip, same
  // "pop in a moment later" tolerance as a custom background/music), then
  // handed to the UI/EntityPlacer; rebuildVisualsFromLevel re-applies it
  // to whatever fresh EntityPlacer it creates so Clear/Load never lose it.
  private skinTextureKeys = new Map<string, string>();
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
    this.backgroundId = resolveStaticBackground(this.level);
    // Bounded to the level's actual placeable width, not the (often wider,
    // to fit the side panels) canvas — see StaticBackground's docstring.
    // Async because a "custom" background's texture isn't preloaded by
    // BootScene like every built-in one is — see backgroundLoader.ts. The
    // rest of create() doesn't wait on it; the image just pops in a frame
    // later (imperceptibly so for the already-instant built-in case).
    void resolveBackgroundTextureKey(this, this.level).then((textureKey) => {
      this.background = new StaticBackground(this, this.level.width * TILE_SIZE, textureKey);
    });
    for (const brush of PALETTE) {
      if (brush.entityType) this.brushesByType.set(brush.entityType, brush);
    }

    this.createGroundLayer();
    this.painter = new TilePainter(this.level, this.groundLayer);
    this.entityPlacer = new EntityPlacer(this, this.level, TILE_SIZE);

    this.highlight = this.add.image(-100, -100, "highlight").setDepth(9);

    this.ui = new EditorUI(
      this,
      backgroundDisplayLabel(this.backgroundId),
      this.level.customMusicName ?? null,
      this.level.name,
      this.level.width,
      this.level.height,
      this.level.entities.length,
      {
        onSelectBrush: (brush) => (this.currentBrush = brush),
        onTestPlay: () => this.testPlay(),
        onSave: () => void this.saveLevel(),
        onMenu: () => void this.leaveToMenu(),
        onClear: () => this.clearLevel(),
        onUndo: () => this.undo(),
        onRedo: () => this.redo(),
        onCycleBackground: () => this.cycleBackground(),
        onUploadBackground: (file) => this.uploadBackground(file),
        onUploadMusic: (file) => this.uploadMusic(file),
        onClearMusic: () => this.clearMusic(),
        onRenameLevel: (name) => this.renameLevel(name),
        onUploadSkin: (file) => this.uploadSkin(file),
        onClearSkin: () => this.clearSkin(),
        onToggleEraser: () => this.toggleEraser(),
        onSelectSize: (size) => (this.currentSize = size),
      },
    );

    if (this.initialLevel) this.rebuildVisualsFromLevel();

    // Custom skins (see "Custom skins" under Art) are shared across all 3
    // profiles and every level, so there's no level data to wait on the
    // way backgrounds/music have — just one Drive read, kicked off once
    // per Editor visit. Palette icons and any already-placed entities show
    // their built-in art until this resolves, then swap in place.
    void resolveSkinTextureKeys(this).then((skinTextureKeys) => this.applySkinTextureKeys(skinTextureKeys));

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.isOverGrid(pointer)) return; // Palette/Level Settings panel, header, footer, or the dead space below the grid
      const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
      const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
      if (this.eraserActive) {
        this.isPointerDown = true;
        this.dragCommands = [];
        this.dragLastX = -1;
        this.dragLastY = -1;
        this.applyEraseAt(tileX, tileY);
      } else if (this.currentBrush.kind === "tile") {
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

  /** True when the pointer is over the grid's own screen area — not the
   * Palette panel on the left, the Level Settings panel on the right, the
   * header above, the stats footer below, or the dead space beside the
   * grid (within its y-range) that exists now that the canvas is wider
   * than GRID_COLS tiles to fit those panels' content. Used to gate both
   * painting and the hover highlight; doesn't check against
   * `level.width`/`level.height` (narrower than the panel-to-panel gap for
   * most levels) — `applyTileBrushAt`/`applyEntityBrushAt`/`applyEraseAt`
   * already no-op on an out-of-bounds tile, same as before this layout
   * existed. */
  private isOverGrid(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= GRID_ORIGIN_X &&
      pointer.x < GAME_WIDTH - RIGHT_PANEL_WIDTH &&
      pointer.y >= GRID_ORIGIN_Y &&
      pointer.y < GRID_ORIGIN_Y + GRID_ROWS * TILE_SIZE
    );
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isOverGrid(pointer)) {
      this.highlight.setPosition(-100, -100);
      return;
    }
    const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
    const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) {
      this.highlight.setPosition(-100, -100);
    } else {
      this.highlight.setPosition(
        GRID_ORIGIN_X + tileX * TILE_SIZE + TILE_SIZE / 2,
        GRID_ORIGIN_Y + tileY * TILE_SIZE + TILE_SIZE / 2,
      );
    }
    this.ui.setCursorTile(tileX >= 0 && tileY >= 0 && tileX < this.level.width && tileY < this.level.height ? { x: tileX, y: tileY } : null);
    if (this.isPointerDown) {
      if (this.eraserActive) this.applyEraseAt(tileX, tileY);
      else if (this.currentBrush.kind === "tile") this.applyTileBrushAt(tileX, tileY);
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

  /** Places the current brush's entity at (tileX, tileY). Marker types
   * (Spawn/Goal/Chest) stay singleton per level — placing one clears any
   * earlier instance of that same type first, wherever it was, same as
   * before multi-instance support existed. Enemies/Items/Decor have no such
   * limit; only the target tile itself needs clearing, and only if
   * something else already occupies it (EntityPlacer's "one entity per
   * tile" invariant). Whatever gets displaced is erased via its own
   * EraseEntityCommand rather than PlaceEntityCommand's old
   * move-in-place trick, so undo can restore each displaced entity
   * independently — see CompositeCommand for why running them in one
   * array undoes correctly in reverse order.
   *
   * For an enemy brush, `this.currentSize` (the header's Enemy Size
   * selector) rides along on the new AddEntityCommand — and, since
   * clicking an already-placed *same-type* enemy would otherwise be a
   * silent no-op, re-clicking it with a *different* size selected is
   * treated as a real change (erase the old instance, add the new-sized
   * one) rather than doing nothing, so resizing an existing enemy doesn't
   * require erasing it by hand first. */
  private applyEntityBrushAt(tileX: number, tileY: number): void {
    const type = this.currentBrush.entityType;
    if (!type) return;
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) return;
    const size = isEnemyType(type) ? this.currentSize : undefined;

    const commands: Command[] = [];

    if (MARKER_TYPES.has(type)) {
      const existingOfType = this.level.entities.find((e) => e.type === type);
      if (existingOfType && existingOfType.x === tileX && existingOfType.y === tileY) return; // no-op, same spot
      if (existingOfType) commands.push(new EraseEntityCommand(this.entityPlacer, this.brushesByType, existingOfType));
    }

    const occupant = this.entityPlacer.entityAt(tileX, tileY);
    if (occupant) {
      const sameType = occupant.type === type;
      const sameSize = (occupant.size ?? DEFAULT_ENEMY_SIZE) === (size ?? DEFAULT_ENEMY_SIZE);
      if (sameType && sameSize) return; // no-op, this exact entity (type + size) is already here
      commands.push(new EraseEntityCommand(this.entityPlacer, this.brushesByType, occupant));
    }

    commands.push(new AddEntityCommand(this.entityPlacer, this.currentBrush, tileX, tileY, size));
    const command = commands.length === 1 ? commands[0] : new CompositeCommand(commands);
    command.execute();
    this.history.push(command);
    this.markDirty();
  }

  /** Header-level Eraser toggle (replacing the old 5 per-category Erase
   * brushes) — flips `eraserActive` and hands the new state to the UI so
   * the header button can show it's engaged. Turning the eraser on doesn't
   * touch `currentBrush`, so switching it back off leaves whatever brush
   * was selected before untouched. */
  private toggleEraser(): void {
    this.eraserActive = !this.eraserActive;
    this.ui.setEraserActive(this.eraserActive);
  }

  /** Erases whatever occupies (tileX, tileY): an entity first (any
   * category — unlike the old per-category erase brushes, the header
   * eraser isn't scoped to whichever tab happens to be open), or failing
   * that the ground tile itself. A no-op on an already-empty tile. Mirrors
   * applyTileBrushAt's drag-debounce (dragLastX/dragLastY) and
   * applyEntityBrushAt's immediate-execute command pattern, so both erase
   * paths can share one dragCommands array with flushDragCommands. */
  private applyEraseAt(tileX: number, tileY: number): void {
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) return;

    const occupant = this.entityPlacer.entityAt(tileX, tileY);
    if (occupant) {
      if (tileX === this.dragLastX && tileY === this.dragLastY) return;
      this.dragLastX = tileX;
      this.dragLastY = tileY;
      const command = new EraseEntityCommand(this.entityPlacer, this.brushesByType, occupant);
      command.execute();
      this.dragCommands.push(command);
      return;
    }

    if (tileX === this.dragLastX && tileY === this.dragLastY) return;
    this.dragLastX = tileX;
    this.dragLastY = tileY;
    const prevIndex = this.level.layers.ground[tileY]?.[tileX];
    if (prevIndex === undefined || prevIndex === EMPTY_TILE) return; // out of bounds, or already empty
    if (!this.painter.paint(tileX, tileY, EMPTY_TILE)) return;
    this.dragCommands.push(new PaintTileCommand(this.painter, tileX, tileY, prevIndex, EMPTY_TILE));
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
    this.groundLayer = map.createBlankLayer("ground", tilesets, GRID_ORIGIN_X, GRID_ORIGIN_Y)!;
  }

  private undo(): void {
    if (this.history.undo()) this.markDirty();
    else this.ui.setStatus("Nothing to undo");
  }

  private redo(): void {
    if (this.history.redo()) this.markDirty();
    else this.ui.setStatus("Nothing to redo");
  }

  /** Cycles through the built-in pool only — see nextStaticBackgroundId's
   * docstring for why a currently-custom background isn't part of that
   * cycle. */
  private cycleBackground(): void {
    this.applyBackground(nextStaticBackgroundId(this.backgroundId));
  }

  /** Called by EditorUI once its Upload BG file input has a file (see
   * FileInputOverlay) — downscales/re-encodes it, stores the result on
   * the level, and swaps to it as a "custom" background. */
  private uploadBackground(file: File): void {
    readAndDownscaleImage(file).then(
      (dataUrl) => {
        this.level.customBackgroundData = dataUrl;
        this.applyBackground("custom");
        this.ui.setStatus("Background updated");
      },
      (err: unknown) => {
        console.error("Background upload failed:", err);
        this.ui.setStatus("Couldn't load that image");
      },
    );
  }

  /** Called by EditorUI once its Upload Music file input has a file — no
   * re-encoding is possible for audio the way there is for images, so
   * this just validates size (see musicUpload.ts's MusicTooLargeError)
   * and stores the file as-is. */
  private uploadMusic(file: File): void {
    readAudioAsDataUrl(file).then(
      (dataUrl) => {
        this.level.customMusicData = dataUrl;
        this.level.customMusicName = file.name;
        this.ui.setMusicLabel(file.name);
        this.markDirty();
        this.ui.setStatus("Music updated");
      },
      (err: unknown) => {
        if (err instanceof MusicTooLargeError) {
          this.ui.setStatus(err.message);
        } else {
          console.error("Music upload failed:", err);
          this.ui.setStatus("Couldn't load that file");
        }
      },
    );
  }

  /** Called by the Music button itself — a no-op (not even a status
   * toast) when the level has no music, since there's nothing to remove. */
  private clearMusic(): void {
    if (!this.level.customMusicData) return;
    this.level.customMusicData = undefined;
    this.level.customMusicName = undefined;
    this.ui.setMusicLabel(null);
    this.markDirty();
    this.ui.setStatus("Music removed");
  }

  /** Shared by the initial resolve pass and every upload/clear — hands the
   * current brushId->textureKey map to the UI (re-renders the palette
   * icons) and EntityPlacer (re-syncs every already-placed marker), so a
   * skin change is visible everywhere in the editor immediately, not just
   * for brushes placed afterward. */
  private applySkinTextureKeys(skinTextureKeys: Map<string, string>): void {
    this.skinTextureKeys = skinTextureKeys;
    this.ui.applySkins(skinTextureKeys);
    this.entityPlacer.setSkinTextureKeys(skinTextureKeys);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }

  /** Called by EditorUI once its Upload Skin file input has a file —
   * reskins whichever brush is currently selected (see EditorUI's Skin/
   * Upload Skin buttons; the palette selection doubles as "which type",
   * no separate picker). Downscales to a small PNG (see skinUpload.ts),
   * saves it to the shared, non-profile-scoped skins.json (see
   * skinStorage.ts — every one of the 3 profiles sees this immediately,
   * not just the one who uploaded it), then re-resolves so this and every
   * other open level picks it up. */
  private uploadSkin(file: File): void {
    const brush = this.currentBrush;
    if (!brush.entityType) {
      this.ui.setStatus("Only Markers/Enemies/Items/Decor can be reskinned");
      return;
    }
    const uploadedBy = loadActiveProfile() ?? "unknown";
    readAndDownscaleSkinImage(file)
      .then((dataUrl) => saveCustomSkin(brush.id, dataUrl, uploadedBy))
      .then(() => resolveSkinTextureKeys(this))
      .then(
        (skinTextureKeys) => {
          this.applySkinTextureKeys(skinTextureKeys);
          this.ui.setStatus(`${brush.label} skin updated`);
        },
        (err: unknown) => {
          console.error("Skin upload failed:", err);
          this.ui.setStatus("Couldn't upload that skin");
        },
      );
  }

  /** Called by the Skin status button — clears whichever brush is
   * currently selected, a no-op (matching clearMusic's own guard) if it
   * isn't skinnable or has no custom skin uploaded. */
  private clearSkin(): void {
    const brush = this.currentBrush;
    if (!brush.entityType || !this.skinTextureKeys.has(brush.id)) return;
    removeCustomSkin(brush.id)
      .then(() => resolveSkinTextureKeys(this))
      .then(
        (skinTextureKeys) => {
          this.applySkinTextureKeys(skinTextureKeys);
          this.ui.setStatus(`${brush.label} skin removed`);
        },
        (err: unknown) => {
          console.error("Skin removal failed:", err);
          this.ui.setStatus("Couldn't remove that skin");
        },
      );
  }

  /** Called by LevelNameInput on commit (blur/Enter) — already trimmed
   * and defaulted to "Untitled Level" if left blank, and already
   * deduplicated against the last committed value, so this only runs on
   * an actual change. Counts as an edit like any other, so it autosaves. */
  private renameLevel(name: string): void {
    this.level.name = name;
    this.markDirty();
  }

  /** Shared by cycling and uploading — swaps the live preview (destroy +
   * recreate; two backgrounds can be different textures/aspect ratios, not
   * just a re-scale), stores the choice on the level so it round-trips
   * through Save/Edit and Test Play, and updates the Actions panel label.
   * Counts as an edit like any other, so it autosaves same as a paint
   * stroke. Callers are responsible for setting `level.customBackgroundData`
   * themselves first when `id` is "custom" — this only resolves and swaps
   * the texture.
   *
   * Destroys the old background's Image *before* resolving the new
   * texture, not after — when swapping between two different "custom"
   * uploads, resolveBackgroundTextureKey's texture-add necessarily
   * `remove()`s the previous custom texture first (same shared key, see
   * backgroundLoader.ts), which would leave the still-alive old Image
   * pointing at a just-destroyed GPU texture for however long the new
   * image takes to decode if that destroy happened afterward instead. */
  private applyBackground(id: StaticBackgroundId): void {
    this.backgroundId = id;
    this.level.background = id;
    this.background?.destroy();
    this.background = undefined;
    void resolveBackgroundTextureKey(this, this.level).then((textureKey) => {
      this.background = new StaticBackground(this, this.level.width * TILE_SIZE, textureKey);
    });
    this.ui.setBackgroundLabel(backgroundDisplayLabel(id));
    this.markDirty();
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
   * id-minting/error-handling/dirty-clearing only exist once. Always flips
   * the persistent save-state indicator to "saving" first (not just
   * autosave's own tick) so every path — including a manual Save click or
   * the pre-Menu flush — gives the same immediate "something is happening"
   * feedback rather than sitting on a stale "Unsaved changes" while a slow
   * Drive round trip is in flight. Callers decide their own UI feedback on
   * top of that (a toast for an explicit click, nothing for a silent
   * autosave tick) and whether `this.dirty` staying true afterward (a
   * failed save never clears it) should block whatever they were about to
   * do next — see leaveToMenu. */
  private async persistLevel(): Promise<void> {
    this.ui.setSaveState("saving");
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
    this.ui.setEntityCount(this.level.entities.length);
    this.autosaveTimer?.remove(false);
    this.autosaveTimer = this.time.delayedCall(AUTOSAVE_DEBOUNCE_MS, () => void this.autosave());
  }

  /** Flushes a pending edit to Drive before leaving, same as the pagehide
   * flush but able to actually wait for it (a real navigation, not a tab
   * close). Critically, only actually navigates once that flush has
   * genuinely succeeded — `persistLevel` catches its own errors and leaves
   * `dirty` true rather than throwing, so checking it here (not just
   * awaiting) is what stops a failed Drive write from being silently
   * discarded by leaving the scene out from under it; the "● Save failed"
   * indicator and status toast persistLevel already set stay on screen so
   * the user can see what happened and retry (Menu, Save, or just editing
   * again all try again). */
  private async leaveToMenu(): Promise<void> {
    this.autosaveTimer?.remove(false);
    if (this.dirty) await this.persistLevel();
    if (this.dirty) return; // save failed — stay put rather than lose the edit
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
    this.entityPlacer.setSkinTextureKeys(this.skinTextureKeys);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }
}
