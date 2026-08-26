import Phaser from "phaser";
import { GAME_WIDTH, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, RIGHT_PANEL_WIDTH, TILE_SIZE } from "../config/gameConfig";
import { AssetPickerItem } from "../editor/AssetPickerMenu";
import { AddEntityCommand } from "../editor/commands/AddEntityCommand";
import { Command } from "../editor/commands/Command";
import { CompositeCommand } from "../editor/commands/CompositeCommand";
import { EraseEntityCommand } from "../editor/commands/EraseEntityCommand";
import { HistoryStack } from "../editor/commands/HistoryStack";
import { MoveEntityCommand } from "../editor/commands/MoveEntityCommand";
import { PaintTileCommand } from "../editor/commands/PaintTileCommand";
import { readAndDownscaleImage } from "../editor/customBackgroundUpload";
import { BUILTIN_SKIN_ID, EditorUI, NO_MUSIC_ID, USE_DEFAULT_SKIN_ID } from "../editor/EditorUI";
import { EntityPlacer, TileCoord } from "../editor/EntityPlacer";
import { MusicTooLargeError, readAudioAsDataUrl } from "../editor/musicUpload";
import { Brush, PALETTE } from "../editor/Palette";
import { TilePainter } from "../editor/TilePainter";
import { BackgroundThumbnail, resolveBackgroundThumbnails } from "../backgrounds/backgroundLibraryLoader";
import { addBackgroundAsset, loadBackgroundLibrary, removeBackgroundAsset } from "../backgrounds/backgroundLibraryStorage";
import { isEnemyType } from "../gameplay/EnemyBehaviors";
import { resolveBackgroundTextureKey } from "../gameplay/backgroundLoader";
import { StaticBackground } from "../gameplay/StaticBackground";
import { groundFrameAt } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { cloneLevel } from "../level/LevelSerializer";
import { AreaKey, createEmptyArea, createEmptyLevel, DEFAULT_ENEMY_SIZE, EMPTY_TILE, EnemySize, EntityType, LevelArea, LevelData } from "../level/LevelSchema";
import { backgroundDisplayLabel, resolveStaticBackground, STATIC_BACKGROUNDS, StaticBackgroundId } from "../level/staticBackgrounds";
import { MusicAsset } from "../music/MusicLibrary";
import { addMusicAsset, loadMusicLibrary, removeMusicAsset } from "../music/musicLibraryStorage";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { loadActiveProfile } from "../profile/Profile";
import { loadActiveSkinId, resolveSkinTextureKeys, resolveSkinThumbnails } from "../skins/skinLoader";
import { addCustomSkin, removeCustomSkin, setActiveSkin } from "../skins/skinStorage";
import { withLevelSkin } from "../skins/skinSelection";
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

/** Entity types kept singleton per *area* (see EntityPlacer's docstring)
 * — placing one moves the existing instance rather than adding another,
 * unlike Enemies/Items/Decor which have no such limit. "Per area," not
 * per level, now that Sub/Up areas exist (see "Sub/Up areas" under Art):
 * this check runs against whichever area is currently being edited (see
 * `area()`), so Main/Sub/Up can each independently have their own Spawn/
 * Goal/Chest/basket — a deliberate simplification over a true cross-level
 * singleton, which would need erasing an existing marker in a *different*
 * area than the one currently open. `basket-sub`/`basket-up` need this
 * for a different reason than their siblings: the teleport pairing (see
 * PlayScene) only makes sense with at most one of each per area. */
const MARKER_TYPES = new Set<EntityType>(["player-spawn", "goal", "chest", "basket-sub", "basket-up"]);

export class EditorScene extends Phaser.Scene {
  private initialLevel?: LevelData;
  private level!: LevelData;
  // Which of Main/Sub/Up is currently being edited — see area() and
  // "Sub/Up areas" under Art. Every field below that used to describe
  // "the level" (groundLayer/painter/entityPlacer/backgroundId/background)
  // now describes "whichever area is currently open," rebuilt from scratch
  // by switchArea whenever this changes.
  private currentAreaKey: AreaKey = "main";
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
  // Header-level toggle, mutually exclusive with eraserActive (see
  // toggleHand/toggleEraser) — while active, pointerdown on an occupied
  // tile grabs that entity instead of erasing or placing; see beginGrab/
  // endGrab. Independent of currentBrush, same as eraserActive.
  private handActive = false;
  // Set for the duration of a Hand-tool drag (pointerdown on an occupied
  // tile through pointerup) — the tile the grab started on, so endGrab/
  // onPointerMove know what EntityPlacer/TilePainter's preview/cancel/
  // commit calls are about. `null` whenever no drag is in progress.
  private grabbedFromTile: TileCoord | null = null;
  // Non-null exactly when the current grab picked up a ground block rather
  // than an entity — the block's own tile value, so endGrab knows what to
  // paint back in if the drop is invalid, or at the destination if it's
  // not. `null` for an entity grab (entities carry their own identity via
  // EntityPlacer, so no separate value needs threading through) and
  // whenever no drag is in progress.
  private grabbedTileValue: number | null = null;
  // The right panel's "Enemy Size" selector — meaningful only when the
  // brush being placed is an enemy (see applyEntityBrushAt); persists
  // across brush/category switches like currentBrush itself does, rather
  // than resetting to "medium" every time, so picking Large once and then
  // browsing other categories doesn't lose the choice. Level-wide tool
  // state, same as currentBrush/eraserActive — unaffected by switching
  // which area is being edited.
  private currentSize: EnemySize = DEFAULT_ENEMY_SIZE;
  private storage: StorageAdapter = getLevelStorage();
  private brushesByType = new Map<EntityType, Brush>();
  // One stack per area rather than one shared stack — undoing while
  // editing Sub shouldn't reach back and undo something done in Main
  // earlier, which sharing one HistoryStack across differently-scoped
  // TilePainter/EntityPlacer instances would risk getting subtly wrong.
  // `history` below always resolves to whichever one matches
  // currentAreaKey, so every existing `this.history.xxx` call site needed
  // no change at all.
  private histories: Record<AreaKey, HistoryStack> = { main: new HistoryStack(), sub: new HistoryStack(), up: new HistoryStack() };
  private get history(): HistoryStack {
    return this.histories[this.currentAreaKey];
  }
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
  // Last-resolved contents of the shared background/music libraries — kept
  // around purely so onSelectBackground/onSelectMusic (given only the
  // picked item's id, per AssetPickerMenu's callback shape) can look up its
  // display name without a redundant Drive read; refreshed every time
  // onBackgroundPickerOpen/onMusicPickerOpen runs.
  private backgroundLibrary: BackgroundThumbnail[] = [];
  private musicLibrary: MusicAsset[] = [];
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

  /** Resolves to whichever of Main/Sub/Up is currently being edited — see
   * `currentAreaKey`'s docstring. Only ever called once `switchArea` (or
   * `create`'s own initial setup) has confirmed the area actually exists;
   * Main always does. */
  private area(): LevelArea {
    if (this.currentAreaKey === "sub") return this.level.subArea!;
    if (this.currentAreaKey === "up") return this.level.upArea!;
    return this.level;
  }

  create(): void {
    this.level = this.initialLevel ?? createEmptyLevel();
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);
    this.backgroundId = resolveStaticBackground(this.level);
    // Bounded to the area's actual placeable width, not the (often wider,
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
      // A library-backed track's real name lives in music.json, not on the
      // level — leave the initial label blank and let it pop in a moment
      // later (see resolveAreaLabels below), same tolerance as every other
      // Drive-backed value here. A level with only the legacy embedded
      // field (no customMusicId) still has its name on hand already, so
      // shows it immediately.
      this.level.customMusicId ? null : this.level.customMusicName ?? null,
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
        onRenameLevel: (name) => this.renameLevel(name),
        onToggleEraser: () => this.toggleEraser(),
        onToggleHand: () => this.toggleHand(),
        onSelectSize: (size) => (this.currentSize = size),
        onSelectArea: (key) => this.switchArea(key),
        onDeleteArea: () => this.deleteCurrentArea(),
        onSkinPickerOpen: () => this.onSkinPickerOpen(),
        onSelectSkin: (skinId) => this.onSelectSkin(skinId),
        onUploadSkin: (file) => this.uploadSkin(file),
        onDeleteSkin: (skinId) => this.onDeleteSkin(skinId),
        onSetSkinAsDefault: () => this.setAsDefaultSkin(),
        onBackgroundPickerOpen: () => this.onBackgroundPickerOpen(),
        onSelectBackground: (id) => this.onSelectBackground(id),
        onUploadBackground: (file) => this.uploadBackground(file),
        onDeleteBackground: (id) => this.onDeleteBackground(id),
        onMusicPickerOpen: () => this.onMusicPickerOpen(),
        onSelectMusic: (id) => this.onSelectMusic(id),
        onUploadMusic: (file) => this.uploadMusic(file),
        onDeleteMusic: (id) => this.onDeleteMusic(id),
      },
    );
    this.ui.setAreaState({ sub: !!this.level.subArea, up: !!this.level.upArea }, this.currentAreaKey);
    this.resolveAreaLabels(this.level, this.backgroundId);

    if (this.initialLevel) this.rebuildVisualsFromLevel();

    // The skin *library* is shared across all 3 profiles, but which skin this
    // level wears is the level's own (see LevelData.skins) — so unlike before
    // 2026-08-23 this resolve reads level data, and every re-resolve below has
    // to pass it too. Palette icons and already-placed entities show built-in
    // art until it lands, then swap in place.
    void this.reresolveSkins();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.isOverGrid(pointer)) return; // Palette/Level Settings panel, header, footer, or the dead space below the grid
      const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
      const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
      if (this.handActive) {
        this.beginGrab(tileX, tileY);
      } else if (this.eraserActive) {
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
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.isPointerDown = false;
      this.flushDragCommands();
      if (this.grabbedFromTile) this.endGrab(pointer);
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

  /** A library-backed background/track's real display name lives in
   * backgrounds.json/music.json, not on the area itself (only its id
   * does) — resolves it once for whichever area is now current so the
   * trigger label reads the actual name instead of a generic "Custom" the
   * whole time it's open. Shared by create()'s initial resolve and every
   * switchArea call. `area`/`backgroundId` are captured by value (not
   * re-read from `this.area()`/`this.backgroundId` once the Drive read
   * finishes) so a user switching areas again before either resolve lands
   * can't have a stale result overwrite whatever the *new* area's own
   * trigger should be showing — the `this.area() !== area` guard is what
   * actually enforces that. */
  private resolveAreaLabels(area: LevelArea, backgroundId: StaticBackgroundId): void {
    if (backgroundId === "custom" && area.customBackgroundId) {
      const wantedId = area.customBackgroundId;
      void loadBackgroundLibrary().then((library) => {
        if (this.area() !== area) return;
        const asset = library.find((item) => item.id === wantedId);
        if (asset) this.ui.setBackgroundLabel(asset.name);
      });
    }
    if (area.customMusicId) {
      const wantedId = area.customMusicId;
      void loadMusicLibrary().then((library) => {
        if (this.area() !== area) return;
        const asset = library.find((item) => item.id === wantedId);
        if (asset) this.ui.setMusicLabel(asset.name);
      });
    }
  }

  /** Switches which of Main/Sub/Up is being edited — creating a blank one
   * first (matching Main's current size, see "Sub/Up areas" under Art)
   * the first time Sub or Up is ever selected. Tears down and rebuilds
   * every area-scoped piece of editor state (ground tilemap, painter/
   * entityPlacer, background preview, background/music trigger labels) —
   * currentBrush/eraserActive/currentSize and every skin stay untouched,
   * since those are level-wide tool state, not per-area data. A no-op if
   * already on the requested area. */
  private switchArea(key: AreaKey): void {
    if (key === this.currentAreaKey) return;
    let created = false;
    if (key === "sub" && !this.level.subArea) {
      this.level.subArea = createEmptyArea(this.level.width, this.level.height);
      created = true;
    } else if (key === "up" && !this.level.upArea) {
      this.level.upArea = createEmptyArea(this.level.width, this.level.height);
      created = true;
    }
    this.currentAreaKey = key;
    this.dragCommands = [];
    this.dragLastX = -1;
    this.dragLastY = -1;
    this.grabbedFromTile = null; // any in-progress Hand-tool drag refers to the area being left; nothing to reconcile it against in the new one
    this.grabbedTileValue = null;

    const area = this.area();
    this.backgroundId = resolveStaticBackground(area);
    this.background?.destroy();
    this.background = undefined;
    void resolveBackgroundTextureKey(this, area).then((textureKey) => {
      if (this.area() !== area) return; // switched away again before this resolved
      this.background = new StaticBackground(this, area.width * TILE_SIZE, textureKey);
    });

    this.createGroundLayer();
    this.rebuildVisualsFromLevel();

    this.ui.setBackgroundLabel(this.backgroundId === "custom" ? "Custom" : backgroundDisplayLabel(this.backgroundId));
    this.ui.setMusicLabel(area.customMusicId ? null : area.customMusicName ?? null);
    this.resolveAreaLabels(area, this.backgroundId);
    this.ui.setAreaState({ sub: !!this.level.subArea, up: !!this.level.upArea }, key);
    this.ui.setEntityCount(area.entities.length);

    if (created) this.markDirty();
  }

  /** Called by EditorUI's Delete button — only ever reachable while a
   * non-Main area is selected (Main has no delete affordance at all, see
   * EditorUI.setAreaState). Discards that area's content entirely and
   * switches back to Main; there's no undo for this the way there is for
   * a paint stroke, matching Clear's own irreversible-after-confirm
   * behavior (and reusing the same two-tap arm/confirm gesture on the
   * EditorUI side to guard against a stray click). */
  private deleteCurrentArea(): void {
    if (this.currentAreaKey === "main") return; // defensive; shouldn't be reachable
    const deletedKey = this.currentAreaKey;
    if (deletedKey === "sub") this.level.subArea = undefined;
    else this.level.upArea = undefined;
    this.switchArea("main");
    this.markDirty();
    this.ui.setStatus(`${deletedKey === "sub" ? "Sub" : "Up"} area deleted`);
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
    // A Hand-tool entity drag in progress: the grabbed marker follows the
    // raw pointer (not snapped to a tile) for a natural "holding it" feel,
    // regardless of whether the pointer is currently over the grid — the
    // highlight/cursor-text logic below still runs afterward so the
    // destination tile stays visible while dragging. A block drag has no
    // sprite of its own to move (see beginGrab) — the already-cleared
    // source cell plus the ordinary hover highlight below are its only
    // visual feedback, so there's nothing to do here for that case.
    if (this.grabbedFromTile && this.grabbedTileValue === null) {
      this.entityPlacer.previewDragTo(this.grabbedFromTile.x, this.grabbedFromTile.y, pointer.x, pointer.y);
    }
    if (!this.isOverGrid(pointer)) {
      this.highlight.setPosition(-100, -100);
      return;
    }
    const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
    const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
    const area = this.area();
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height) {
      this.highlight.setPosition(-100, -100);
    } else {
      this.highlight.setPosition(
        GRID_ORIGIN_X + tileX * TILE_SIZE + TILE_SIZE / 2,
        GRID_ORIGIN_Y + tileY * TILE_SIZE + TILE_SIZE / 2,
      );
    }
    this.ui.setCursorTile(tileX >= 0 && tileY >= 0 && tileX < area.width && tileY < area.height ? { x: tileX, y: tileY } : null);
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

    const prevIndex = this.area().layers.ground[tileY]?.[tileX];
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
   * (Spawn/Goal/Chest/basket-sub/basket-up) stay singleton per *area* (see
   * MARKER_TYPES) — placing one clears any earlier instance of that same
   * type first within the area currently being edited, wherever it was
   * there, same as before multi-instance support (and before Sub/Up areas)
   * existed. Enemies/Items/Decor have no such
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
    const area = this.area();
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height) return;
    const size = isEnemyType(type) ? this.currentSize : undefined;

    const commands: Command[] = [];

    if (MARKER_TYPES.has(type)) {
      const existingOfType = area.entities.find((e) => e.type === type);
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
    if (this.eraserActive) this.handActive = false;
    this.ui.setEraserActive(this.eraserActive);
    this.ui.setHandActive(this.handActive);
  }

  /** Header-level Hand toggle — mutually exclusive with Eraser (turning one
   * on turns the other off), same "flip a flag, hand it to the UI" shape as
   * toggleEraser. Doesn't touch currentBrush, so switching Hand back off
   * leaves whatever brush was selected before untouched, same as Eraser. */
  private toggleHand(): void {
    this.handActive = !this.handActive;
    if (this.handActive) this.eraserActive = false;
    this.ui.setHandActive(this.handActive);
    this.ui.setEraserActive(this.eraserActive);
  }

  /** Starts a Hand-tool drag: grabs whatever occupies (tileX, tileY) — an
   * entity first (any category, same "entity before ground" priority the
   * universal Eraser already uses in applyEraseAt), falling back to the
   * ground block itself if there's no entity there. A no-op with a status
   * message on a genuinely empty tile. Just records which tile the drag
   * started from (and, for a block grab, the block's own tile value — see
   * grabbedTileValue); the actual visual feedback happens in
   * onPointerMove, and the data mutation only commits once endGrab
   * resolves the drop — nothing about the level's *final* state changes
   * here, so an aborted drag needs no cleanup beyond snapping/painting
   * back to how it started.
   *
   * A block grab is the one exception to "nothing changes here": unlike
   * an entity (a real sprite that can just be repositioned mid-drag via
   * EntityPlacer.previewDragTo), a ground block has no sprite of its own
   * — it's one cell's value in `layers.ground`, rendered by the shared
   * tilemap layer. The only way to show "you're holding this" is to
   * actually clear the source cell immediately (`this.painter.paint(...,
   * EMPTY_TILE)`), live, before the drag resolves — endGrab either paints
   * the same value back at the source (canceled) or at the destination
   * (committed), so from the undo history's perspective this in-between
   * state never happened either way. */
  private beginGrab(tileX: number, tileY: number): void {
    const area = this.area();
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height) return;

    if (this.entityPlacer.entityAt(tileX, tileY)) {
      this.grabbedFromTile = { x: tileX, y: tileY };
      this.grabbedTileValue = null;
      return;
    }

    const tileValue = area.layers.ground[tileY][tileX];
    if (tileValue === EMPTY_TILE) {
      this.ui.setStatus("Nothing to grab there");
      return;
    }
    this.grabbedFromTile = { x: tileX, y: tileY };
    this.grabbedTileValue = tileValue;
    this.painter.paint(tileX, tileY, EMPTY_TILE);
  }

  /** Ends a Hand-tool drag, committing the move if the drop is valid or
   * reverting it (snapping an entity marker back, or repainting a block
   * back at its origin) otherwise. A drop is invalid when it lands outside
   * the grid, back on its own origin tile (nothing to do), or on a tile
   * something else already occupies (blocked rather than swapped or
   * displaced, the same "very simple first" cut this project takes
   * elsewhere — see WorldMakerScene's own no-drag-reorder choice) —
   * "something else" means an entity for an entity grab, and any non-empty
   * ground cell for a block grab; the two never check against each other,
   * since an entity sitting on a block and a block underneath an entity
   * are both completely normal, independent states. */
  private endGrab(pointer: Phaser.Input.Pointer): void {
    const from = this.grabbedFromTile;
    if (!from) return;
    const tileValue = this.grabbedTileValue;
    this.grabbedFromTile = null;
    this.grabbedTileValue = null;

    if (tileValue !== null) this.endTileGrab(from, tileValue, pointer);
    else this.endEntityGrab(from, pointer);
  }

  private endEntityGrab(from: TileCoord, pointer: Phaser.Input.Pointer): void {
    if (!this.isOverGrid(pointer)) {
      this.entityPlacer.cancelDrag(from.x, from.y);
      return;
    }
    const area = this.area();
    const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
    const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height || (tileX === from.x && tileY === from.y)) {
      this.entityPlacer.cancelDrag(from.x, from.y);
      return;
    }
    if (this.entityPlacer.entityAt(tileX, tileY)) {
      this.entityPlacer.cancelDrag(from.x, from.y);
      this.ui.setStatus("Tile occupied");
      return;
    }

    const command = new MoveEntityCommand(this.entityPlacer, from, { x: tileX, y: tileY });
    command.execute();
    this.history.push(command);
    this.markDirty();
  }

  /** Commits or reverts a block grab. The source cell is already
   * (visually and in `layers.ground`) cleared by beginGrab — a revert just
   * repaints `tileValue` back there; a commit paints it at the destination
   * instead and records the whole move as one undo step, composed from two
   * ordinary PaintTileCommands (source: tileValue → empty, destination:
   * empty → tileValue) rather than a new Command class — `CompositeCommand`
   * already undoes in reverse order, which for these two unwinds exactly
   * right (destination back to empty, then source back to tileValue). Both
   * paints are applied directly first, same "already applied, then
   * recorded" convention every other drag/placement command in this file
   * follows — see flushDragCommands. */
  private endTileGrab(from: TileCoord, tileValue: number, pointer: Phaser.Input.Pointer): void {
    const area = this.area();
    const revert = () => this.painter.paint(from.x, from.y, tileValue);

    if (!this.isOverGrid(pointer)) {
      revert();
      return;
    }
    const tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE);
    const tileY = Math.floor((pointer.y - GRID_ORIGIN_Y) / TILE_SIZE);
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height || (tileX === from.x && tileY === from.y)) {
      revert();
      return;
    }
    if (area.layers.ground[tileY][tileX] !== EMPTY_TILE) {
      revert();
      this.ui.setStatus("Tile occupied");
      return;
    }

    this.painter.paint(tileX, tileY, tileValue);
    const command = new CompositeCommand([
      new PaintTileCommand(this.painter, from.x, from.y, tileValue, EMPTY_TILE),
      new PaintTileCommand(this.painter, tileX, tileY, EMPTY_TILE, tileValue),
    ]);
    this.history.push(command);
    this.markDirty();
  }

  /** Erases whatever occupies (tileX, tileY): an entity first (any
   * category — unlike the old per-category erase brushes, the header
   * eraser isn't scoped to whichever tab happens to be open), or failing
   * that the ground tile itself. A no-op on an already-empty tile. Mirrors
   * applyTileBrushAt's drag-debounce (dragLastX/dragLastY) and
   * applyEntityBrushAt's immediate-execute command pattern, so both erase
   * paths can share one dragCommands array with flushDragCommands. */
  private applyEraseAt(tileX: number, tileY: number): void {
    const area = this.area();
    if (tileX < 0 || tileY < 0 || tileX >= area.width || tileY >= area.height) return;

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
    const prevIndex = area.layers.ground[tileY]?.[tileX];
    if (prevIndex === undefined || prevIndex === EMPTY_TILE) return; // out of bounds, or already empty
    if (!this.painter.paint(tileX, tileY, EMPTY_TILE)) return;
    this.dragCommands.push(new PaintTileCommand(this.painter, tileX, tileY, prevIndex, EMPTY_TILE));
  }

  /** Builds the tilemap layer against all 4 ground skins at once — each
   * skin's 6-frame image (top/fill/brick/bounce/hazard-top/hazard-fill) is
   * registered as its own Phaser Tileset, claiming a 6-wide gid range in
   * GROUND_SKINS order (grass 0-5, desert 6-11, castle 12-17, snow 18-23 —
   * see groundAutotile.ts, which is the single source of truth for that
   * layout). A tile's stored value picks both its skin and its frame, so
   * one level can freely mix all four skins; there's no level-wide
   * "active" tileset to rebuild when nothing's just been placed.
   *
   * Destroys any previous tilemap first — no-op the very first time
   * (nothing to destroy yet), but switchArea calls this again every time
   * the area being edited changes, and a stale tilemap's own layer would
   * otherwise leak (and, worse, `this.groundLayer` would end up pointing
   * at whichever one was created last while the old one's GPU resources
   * never got released). */
  private createGroundLayer(): void {
    // Both `?.`s matter, not just the first: on a *second* "New Level"/
    // Load in the same browser session, Phaser reruns create() on this
    // same singleton EditorScene instance (see PlayScene's areaBuilt for
    // the sibling version of this issue) rather than constructing a fresh
    // one, so `this.groundLayer` itself can be a stale-but-truthy
    // reference to a TilemapLayer the *previous* session's scene teardown
    // already destroyed — and a destroyed TilemapLayer nulls out its own
    // `.tilemap` property, so `.tilemap.destroy()` alone still throws
    // reading `.destroy` off `undefined` (found via a real crash starting
    // a second level in one mocked-Drive Playwright session).
    this.groundLayer?.tilemap?.destroy();
    const area = this.area();
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: area.width,
      height: area.height,
    });
    const tilesets = GROUND_SKINS.map((skin, i) => {
      const key = groundTilesetKey(skin);
      return map.addTilesetImage(key, key, TILE_SIZE, TILE_SIZE, 0, 0, i * 6)!;
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

  /** Called by EditorUI once its background picker's "Upload" tile has a
   * file (see FileInputOverlay) — downscales/re-encodes it, adds it to the
   * shared library (see backgrounds/backgroundLibraryStorage.ts — visible
   * to every profile and every level from now on, not just this one), and
   * points whichever area is currently being edited at the new entry. */
  private uploadBackground(file: File): void {
    const uploadedBy = loadActiveProfile() ?? "unknown";
    readAndDownscaleImage(file)
      .then((dataUrl) => addBackgroundAsset(file.name, dataUrl, uploadedBy))
      .then(
        (id) => {
          this.area().customBackgroundId = id;
          this.applyBackground("custom", file.name);
          this.ui.setStatus("Background uploaded");
        },
        (err: unknown) => {
          console.error("Background upload failed:", err);
          this.ui.setStatus("Couldn't load that image");
        },
      );
  }

  /** Called by EditorUI when the background picker opens — resolves the
   * shared library's thumbnails (a Drive read) and combines them with the
   * 4 built-ins into one item list, right when the user is about to see
   * it rather than on every level load/brush switch. */
  private onBackgroundPickerOpen(): void {
    void resolveBackgroundThumbnails(this).then((thumbnails) => {
      this.backgroundLibrary = thumbnails;
      const items: AssetPickerItem[] = [
        ...STATIC_BACKGROUNDS.map((bg) => ({ id: bg.id, label: bg.label, textureKey: bg.textureKey })),
        ...thumbnails.map((t) => ({ id: t.id, label: t.name, textureKey: t.textureKey, deletable: true })),
      ];
      const activeId = this.backgroundId === "custom" ? this.area().customBackgroundId ?? "" : this.backgroundId;
      this.ui.setBackgroundPickerItems(items, activeId);
    });
  }

  /** Called by EditorUI once a background picker item is picked — `id` is
   * either one of the 4 built-in ids or a library uuid; `backgroundLibrary`
   * (refreshed on every onBackgroundPickerOpen) tells the two apart and
   * supplies the chosen entry's display name. */
  private onSelectBackground(id: string): void {
    const builtin = STATIC_BACKGROUNDS.find((bg) => bg.id === id);
    if (builtin) {
      this.applyBackground(builtin.id);
      return;
    }
    const asset = this.backgroundLibrary.find((item) => item.id === id);
    this.area().customBackgroundId = id;
    this.applyBackground("custom", asset?.name);
  }

  /** Called by EditorUI's background picker delete badge — removes a
   * background from the shared library and refreshes the open picker's
   * item list so the deleted thumbnail disappears immediately. Doesn't
   * touch this (or any other) level's own `customBackgroundId` even if it
   * was the one just deleted — backgroundLoader.ts already falls back to
   * the default built-in the next time such a level is opened, matching
   * removeBackgroundAsset's own documented behavior. */
  private onDeleteBackground(id: string): void {
    removeBackgroundAsset(id).then(
      () => {
        this.ui.setStatus("Background removed");
        this.onBackgroundPickerOpen();
      },
      (err: unknown) => {
        console.error("Background removal failed:", err);
        this.ui.setStatus("Couldn't remove that background");
      },
    );
  }

  /** Called by EditorUI once its music picker's "Upload" tile has a file
   * — no re-encoding is possible for audio the way there is for images
   * (see musicUpload.ts's MusicTooLargeError for the one check that does
   * apply), adds it to the shared library, and points whichever area is
   * currently being edited at it. */
  private uploadMusic(file: File): void {
    const uploadedBy = loadActiveProfile() ?? "unknown";
    readAudioAsDataUrl(file)
      .then((dataUrl) => addMusicAsset(file.name, dataUrl, uploadedBy))
      .then(
        (id) => {
          this.area().customMusicId = id;
          this.ui.setMusicLabel(file.name);
          this.markDirty();
          this.ui.setStatus("Music uploaded");
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

  /** Called by EditorUI when the music picker opens — resolves the shared
   * library (a Drive read) and prepends the "None" option, right when the
   * user is about to see it. */
  private onMusicPickerOpen(): void {
    void loadMusicLibrary().then((tracks) => {
      this.musicLibrary = tracks;
      const items: AssetPickerItem[] = [
        { id: NO_MUSIC_ID, label: "None", textureKey: "music-note-muted" },
        ...tracks.map((t) => ({ id: t.id, label: t.name, textureKey: "music-note", deletable: true })),
      ];
      const activeId = this.area().customMusicId ?? NO_MUSIC_ID;
      this.ui.setMusicPickerItems(items, activeId);
    });
  }

  /** Called by EditorUI once a music picker item is picked — `null` (from
   * the "None" option, see EditorUI's own NO_MUSIC_ID -> null mapping)
   * clears every music field on whichever area is currently being edited
   * (there's no built-in fallback track the way backgrounds have, so
   * "None" is a real, explicit state, not just "point at nothing and fall
   * back"); otherwise points that area at the chosen library entry. */
  private onSelectMusic(id: string | null): void {
    const area = this.area();
    if (id === null) {
      area.customMusicId = undefined;
      area.customMusicData = undefined;
      area.customMusicName = undefined;
      this.ui.setMusicLabel(null);
      this.markDirty();
      this.ui.setStatus("Music removed");
      return;
    }
    const asset = this.musicLibrary.find((track) => track.id === id);
    area.customMusicId = id;
    this.ui.setMusicLabel(asset?.name ?? "Custom");
    this.markDirty();
  }

  /** Called by EditorUI's music picker delete badge — removes a track from
   * the shared library and refreshes the open picker's item list. Unlike
   * background deletion, explicitly clears the current area's own
   * reference too when it was the deleted track — there's no built-in
   * fallback track for musicLoader.ts to silently land on, so leaving a
   * dangling `customMusicId` would otherwise leave the trigger showing a
   * name for a track that no longer exists anywhere. */
  private onDeleteMusic(id: string): void {
    removeMusicAsset(id).then(
      () => {
        this.ui.setStatus("Track removed");
        if (this.area().customMusicId === id) {
          this.area().customMusicId = undefined;
          this.ui.setMusicLabel(null);
          this.markDirty();
        }
        this.onMusicPickerOpen();
      },
      (err: unknown) => {
        console.error("Music removal failed:", err);
        this.ui.setStatus("Couldn't remove that track");
      },
    );
  }

  /** Shared by the initial resolve pass and every upload/clear — hands the
   * current brushId->textureKey map to the UI (re-renders the palette
   * icons) and EntityPlacer (re-syncs every already-placed marker), so a
   * skin change is visible everywhere in the editor immediately, not just
   * for brushes placed afterward. */
  private applySkinTextureKeys(skinTextureKeys: Map<string, string>): void {
    this.skinTextureKeys = skinTextureKeys;
    this.ui.applySkins(skinTextureKeys);
    // Paired with applySkins rather than pushed separately: together they are
    // what the trigger label needs to say whether the look on screen is this
    // level's own choice or one inherited from the default.
    this.ui.setLevelSkins(this.level.skins);
    this.entityPlacer.setSkinTextureKeys(skinTextureKeys);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }

  /** Re-reads what every brush should be wearing *in this level* and pushes it
   * everywhere. Every path that can change the answer — the initial load, the
   * picker, an upload, a delete, Set as default — goes through here, so none of
   * them can forget to pass `this.level.skins` and silently resolve against the
   * defaults instead. */
  private async reresolveSkins(): Promise<void> {
    this.applySkinTextureKeys(await resolveSkinTextureKeys(this, this.level.skins));
  }

  /** Called by EditorUI once its skin picker's "Upload" tile has a file —
   * reskins whichever brush is currently selected (the palette selection
   * doubles as "which type", so there's no separate type-picker UI).
   * Downscales to a small PNG (see skinUpload.ts) and adds it to the brush's
   * library in the shared, non-profile-scoped skins.json.
   *
   * The upload is then selected **for this level only**. "I just uploaded this"
   * plainly means "show it to me", but it does not mean "restyle every level I
   * have" — which is what it used to mean, because addCustomSkin set the global
   * default. Set as default is how that happens now. */
  private uploadSkin(file: File): void {
    const brush = this.currentBrush;
    if (!brush.entityType) {
      this.ui.setStatus("Only Markers/Enemies/Items/Decor can be reskinned");
      return;
    }
    const uploadedBy = loadActiveProfile() ?? "unknown";
    readAndDownscaleSkinImage(file)
      .then((dataUrl) => addCustomSkin(brush.id, dataUrl, uploadedBy))
      .then((id) => {
        this.setLevelSkin(brush.id, id);
        return this.reresolveSkins();
      })
      .then(
        () => this.ui.setStatus(`${brush.label} skin set for this level`),
        (err: unknown) => {
          console.error("Skin upload failed:", err);
          this.ui.setStatus("Couldn't upload that skin");
        },
      );
  }

  /** Called by EditorUI when the skin picker opens — scoped to whichever brush
   * is currently selected (canOpen already blocked this for a non-skinnable
   * one), resolving that brush's library (a Drive read) right when the user is
   * about to see it.
   *
   * Two built-in entries lead the list where there used to be one, because
   * "follow the default" and "built-in art" stopped being the same thing on
   * 2026-08-23: a level that wants Grampa's own art has to be able to say so in
   * a way that a default set later cannot overrule. The highlighted entry is
   * the level's own choice, not the default — that is what the picker now
   * edits. */
  private onSkinPickerOpen(): void {
    const brush = this.currentBrush;
    if (!brush.entityType) return; // EditorUI's canOpen already guards this; defensive no-op
    void Promise.all([resolveSkinThumbnails(this, brush.id), loadActiveSkinId(brush.id)]).then(([thumbnails, defaultId]) => {
      const defaultLabel = defaultId ? "Use default" : "Use default (built-in)";
      const items: AssetPickerItem[] = [
        { id: USE_DEFAULT_SKIN_ID, label: defaultLabel, textureKey: brush.textureKey },
        { id: BUILTIN_SKIN_ID, label: "Built-in art", textureKey: brush.textureKey },
        ...thumbnails.map((t, i) => ({ id: t.id, label: `Skin ${i + 1}`, textureKey: t.textureKey, deletable: true })),
      ];
      const choice = this.level.skins?.[brush.id];
      const selected = choice === undefined ? USE_DEFAULT_SKIN_ID : (choice ?? BUILTIN_SKIN_ID);
      this.ui.setSkinPickerItems(items, selected);
    });
  }

  /** Writes a skin choice onto the level being edited and marks it dirty, so it
   * is saved with the level like the background and music already are. Never
   * touches the shared library — that is setAsDefaultSkin's job alone. */
  private setLevelSkin(brushId: string, choice: string | null | undefined): void {
    this.level.skins = withLevelSkin(this.level.skins, brushId, choice);
    this.markDirty();
  }

  /**
   * Called by EditorUI once a skin picker item is picked. Applies to whichever
   * brush is currently selected, same as uploadSkin — but to **this level**,
   * not to the shared library, which is the whole 2026-08-23 change. `undefined`
   * is the "Use default" entry, `null` the "Built-in art" one, and a string a
   * library skin; see skinSelection.ts for how the three differ.
   */
  private onSelectSkin(choice: string | null | undefined): void {
    const brush = this.currentBrush;
    if (!brush.entityType) return;
    this.setLevelSkin(brush.id, choice);
    void this.reresolveSkins().catch((err: unknown) => {
      console.error("Skin selection failed:", err);
      this.ui.setStatus("Couldn't switch that skin");
    });
  }

  /**
   * The one deliberate way to move a default: makes this level's current choice
   * for the selected brush the library default, so every level that has *not*
   * chosen for itself picks it up. Two-tap confirmed in EditorUI, since it
   * reaches every other level — the same treatment Clear gets.
   */
  private setAsDefaultSkin(): void {
    const brush = this.currentBrush;
    if (!brush.entityType) return;
    // Whatever this level resolves to right now, including "built-in art",
    // which is a legitimate thing to make the default.
    const choice = this.level.skins?.[brush.id];
    const target = choice === undefined ? null : choice;
    void setActiveSkin(brush.id, target)
      .then(() => this.reresolveSkins())
      .then(
        () => this.ui.setStatus(`${brush.label}: default set for every level`),
        (err: unknown) => {
          console.error("Setting the default skin failed:", err);
          this.ui.setStatus("Couldn't set that default");
        },
      );
  }

  /** Called by EditorUI's skin picker delete badge — removes one skin from
   * the currently-selected brush's library. If it was the active one,
   * skinStorage.ts already reverts the brush to its built-in art
   * (activeId -> null) as part of the removal, so re-resolving here picks
   * that up immediately everywhere (palette icons, placed entities), not
   * just the next time the picker happens to reopen — unlike background/
   * music deletion, which have no such per-brush "active" concept to
   * revert. Also refreshes the open picker's own item list so the deleted
   * thumbnail disappears right away. */
  private onDeleteSkin(skinId: string): void {
    const brush = this.currentBrush;
    if (!brush.entityType) return;
    removeCustomSkin(brush.id, skinId)
      .then(() => this.reresolveSkins())
      .then(
        () => {
          this.ui.setStatus(`${brush.label} skin removed`);
          this.onSkinPickerOpen();
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
   * image takes to decode if that destroy happened afterward instead.
   *
   * `customLabel` is the library entry's own name — used only when `id`
   * is "custom" (built-ins get their label from backgroundDisplayLabel
   * instead, which has nothing else to go on); omitted falls back to the
   * generic "Custom" for the rare case a caller doesn't have a name handy.
   *
   * Applies to whichever area is currently being edited, not necessarily
   * Main — each area has its own independent background choice (see
   * "Sub/Up areas" under Art). Guards the async resolve against a
   * since-switched-away area the same way switchArea's own resolve does,
   * for the same reason. */
  private applyBackground(id: StaticBackgroundId, customLabel?: string): void {
    const area = this.area();
    this.backgroundId = id;
    area.background = id;
    this.background?.destroy();
    this.background = undefined;
    void resolveBackgroundTextureKey(this, area).then((textureKey) => {
      if (this.area() !== area) return;
      this.background = new StaticBackground(this, area.width * TILE_SIZE, textureKey);
    });
    this.ui.setBackgroundLabel(id === "custom" ? customLabel ?? "Custom" : backgroundDisplayLabel(id));
    this.markDirty();
  }

  /** Spawn/Goal need to exist *somewhere* across the level — any area, not
   * just whichever one happens to be open right now — since either could
   * legitimately live in Sub or Up instead of Main (see "Sub/Up areas"
   * under Art on why Markers are per-area singletons, not cross-level
   * ones). The Test Play snapshot itself (`cloneLevel`) already carries
   * every area along regardless, so nothing else here needs to change
   * depending on which one is currently selected. */
  private testPlay(): void {
    const areas = [this.level, this.level.subArea, this.level.upArea].filter((a): a is LevelArea => !!a);
    const hasSpawn = areas.some((a) => a.entities.some((e) => e.type === "player-spawn"));
    const hasGoal = areas.some((a) => a.entities.some((e) => e.type === "goal"));
    if (!hasSpawn || !hasGoal) {
      this.ui.setStatus("Place a Spawn and a Goal before Test Play");
      return;
    }
    // A Sub/Up area is only reachable through a matching basket pair — one
    // of each type in Main *and* in its own satellite area (see useBasket/
    // basketDestination in PlayScene). Existing purely to make a broken
    // pairing impossible to ship rather than a silent no-op discovered
    // later in Test Play (see PlayScene's "No matching basket" toast,
    // which stays as a safety net for cases this can't catch — e.g. a
    // basket placed in the *wrong* area entirely). Checked here, not on
    // Save, matching Spawn/Goal above: in-progress levels can still be
    // saved half-built, only Test Play needs the level to actually work.
    if (this.level.subArea && !this.hasMatchingBasketPair(this.level.subArea, "basket-sub")) {
      this.ui.setStatus("Place a matching Basket (Down) in Main and Sub before Test Play");
      return;
    }
    if (this.level.upArea && !this.hasMatchingBasketPair(this.level.upArea, "basket-up")) {
      this.ui.setStatus("Place a matching Basket (Up) in Main and Up before Test Play");
      return;
    }
    const snapshot = cloneLevel(this.level);
    this.scene.launch("Play", { level: snapshot });
    this.scene.pause();
  }

  /** True once `satelliteArea` (Sub or Up) has a matching pair with Main
   * for `basketType` — Main and the satellite area each need at least one
   * (see testPlay's own docstring above). Multiple of the same basket type
   * in one area are allowed (PlayScene's own useBasket just `.find`s the
   * first match in the destination), so this only checks presence, not
   * count or exact placement. */
  private hasMatchingBasketPair(satelliteArea: LevelArea, basketType: "basket-sub" | "basket-up"): boolean {
    const mainHas = this.level.entities.some((e) => e.type === basketType);
    const satelliteHas = satelliteArea.entities.some((e) => e.type === basketType);
    return mainHas && satelliteHas;
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
    this.ui.setEntityCount(this.area().entities.length);
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

  /** Clears whichever area is currently being edited — Main, Sub, or Up —
   * not the whole level; switching to a different area afterward finds it
   * untouched. */
  private clearLevel(): void {
    const area = this.area();
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        area.layers.ground[y][x] = -1;
      }
    }
    area.entities = [];
    this.rebuildVisualsFromLevel();
    this.history.clear();
    this.markDirty();
    this.ui.setStatus("Cleared");
  }

  /** Rebuilds the ground tilemap + entity markers from whichever area is
   * currently being edited (see area()) — used after Clear, after loading
   * an existing level, and by switchArea every time which area that is
   * changes. */
  private rebuildVisualsFromLevel(): void {
    const area = this.area();
    this.painter = new TilePainter(area, this.groundLayer);
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        const index = area.layers.ground[y][x];
        if (index === -1) this.groundLayer.removeTileAt(x, y);
        else this.groundLayer.putTileAt(groundFrameAt(area.layers.ground, x, y), x, y);
      }
    }
    // Destroys the *previous* entityPlacer's marker sprites before
    // abandoning it — without this, switching areas (or Clear/Load, which
    // also route through here) would leave every marker it ever placed
    // stuck on the display list, since a freshly constructed EntityPlacer
    // only knows how to clear its own (empty) markers map, not a
    // completely different instance's (see EntityPlacer.destroy's own
    // docstring — found via a real accumulation bug switching Main→Sub→Up
    // in a mocked-Drive Playwright session).
    this.entityPlacer?.destroy();
    this.entityPlacer = new EntityPlacer(this, area, TILE_SIZE);
    this.entityPlacer.setSkinTextureKeys(this.skinTextureKeys);
    this.entityPlacer.syncFromLevel(this.brushesByType);
  }
}
