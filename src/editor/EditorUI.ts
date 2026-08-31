import Phaser from "phaser";
import {
  FOOTER_HEIGHT,
  GAME_WIDTH,
  GRID_ORIGIN_Y,
  GRID_ROWS,
  HEADER_HEIGHT,
  LEFT_PANEL_WIDTH,
  RIGHT_PANEL_WIDTH,
  TILE_SIZE,
} from "../config/gameConfig";
import { AreaKey, EnemySize } from "../level/LevelSchema";
import { SAVE_STATE_DISPLAY, SaveState } from "../persistence/saveState";
import { AssetPickerItem, AssetPickerMenu } from "./AssetPickerMenu";
import { LevelNameInput } from "./LevelNameInput";
import { Brush, BrushCategory, CATEGORIES, isSkinnable, PALETTE, UP_BASKET_TINT_COLOR } from "./Palette";
import { BrushSlot, layOutBrushes, pageOfBrush } from "./paletteLayout";
import { CustomEntityDef } from "../entities/customEntity";
import { customBrushes } from "../entities/entityRegistry";
import { clampPage, rowsPerPage } from "../ui/pager";
import { fitWithinTile } from "./spriteFit";
import { hitRectFor } from "../ui/touchTarget";

export interface EditorUICallbacks {
  onSelectBrush: (brush: Brush) => void;
  onTestPlay: () => void;
  onSave: () => void;
  onMenu: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRenameLevel: (name: string) => void;
  onToggleEraser: () => void;
  onToggleHand: () => void;
  onSelectSize: (size: EnemySize) => void;

  // Sub/Up areas (see "Sub/Up areas" under Art): switching to "sub"/"up"
  // when that area doesn't exist yet creates it (a blank grid matching
  // Main's own size) as part of switching, rather than needing a separate
  // "create" step — EditorScene's onSelectArea handles both. Deleting is
  // scoped to whichever area is currently selected (never "main", see the
  // Delete button's own visibility in setAreaState) and needs no argument
  // for the same reason.
  onSelectArea: (key: AreaKey) => void;
  onDeleteArea: () => void;

  // Skin/background/music each follow the same shape now — see
  // AssetPickerMenu: an "open" hook that resolves and pushes the
  // relevant library's items (async, a Drive read), a "select" hook for
  // picking one, an "upload" hook that adds to the shared library, and a
  // "delete" hook for removing a library entry. Skin's picker always
  // targets whichever brush is currently selected (see selectBrush), so
  // its callbacks don't need a brush id parameter.
  onSkinPickerOpen: () => void;
  /** A library skin id, `null` for "built-in art", or `undefined` for "follow
   * the library default" — the level's three states, see skinSelection.ts. */
  onSelectSkin: (skinId: string | null | undefined) => void;
  onUploadSkin: (file: File) => void;
  onDeleteSkin: (skinId: string) => void;
  /** The deliberate, confirmed act of moving the library default to whatever
   * this level currently uses for the selected brush. Separated from
   * onSelectSkin precisely so no ordinary edit can reach every other level. */
  onSetSkinAsDefault: () => void;

  onBackgroundPickerOpen: () => void;
  onSelectBackground: (id: string) => void;
  onUploadBackground: (file: File) => void;
  onDeleteBackground: (id: string) => void;

  onMusicPickerOpen: () => void;
  onSelectMusic: (id: string | null) => void;
  onUploadMusic: (file: File) => void;
  onDeleteMusic: (id: string) => void;
}

// Sentinel ids for a picker's non-deletable built-in options — never a real
// skin/track id (those are crypto.randomUUID()), so there's no risk of an
// actual upload colliding with one.
//
// The skin picker has *two* because a level's choice is three-state (see
// skinSelection.ts): "follow whatever the library default is" and "use the
// built-in art" were one option until 2026-08-23, and had to stop being, or a
// level could not say "I want Grampa's own art here" in a way that survives
// someone setting a default later. They map to `undefined` and `null`
// respectively before reaching onSelectSkin. The music picker's NO_MUSIC_ID has
// no such split — silence is silence — and still maps to plain `null`.
export const USE_DEFAULT_SKIN_ID = "__default__";
export const BUILTIN_SKIN_ID = "__builtin__";
export const NO_MUSIC_ID = "__none__";

const ENEMY_SIZES: { id: EnemySize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const PANEL_DEPTH = 20;
const CONTENT_DEPTH = 21;
const OUTLINE_DEPTH = 22;
const DROPDOWN_DEPTH = 23;
const STATUS_DEPTH = 25;

const PANEL_PADDING = 12;

const PANEL_TOP = GRID_ORIGIN_Y; // side panels flank the grid only, not the header/footer bands
const PANEL_HEIGHT = GRID_ROWS * TILE_SIZE;
const RIGHT_PANEL_X = GAME_WIDTH - RIGHT_PANEL_WIDTH;
const FOOTER_Y = GRID_ORIGIN_Y + GRID_ROWS * TILE_SIZE;

// --- Header: Level Name anchored to the left edge, Undo/Redo/Eraser/Hand
// follow it; Save/Test Play/Menu anchor to the right edge instead of
// following the left-hand cluster, so the level name never shifts them —
// see the constructor. The save-state readout used to sit here too (just
// left of Save) but moved to the footer as of 2026-08-17 — see FOOTER_SAVE_STATUS_X.
const HEADER_BUTTON_HEIGHT = 32;
const HEADER_BUTTON_Y = (HEADER_HEIGHT - HEADER_BUTTON_HEIGHT) / 2;
const NAME_LABEL_X = PANEL_PADDING;
const NAME_INPUT_X = NAME_LABEL_X + 46;
const NAME_INPUT_WIDTH = 200;
const NAME_INPUT_HEIGHT = 28;
const NAME_INPUT_Y = (HEADER_HEIGHT - NAME_INPUT_HEIGHT) / 2;

// --- Left "Palette" panel: a chip that expands into the 5 categories, a
// 2-column icon grid for whichever one is active, and the skin picker
// trigger pinned to a fixed spot below the grid (not "wherever the grid
// happens to end") so it doesn't jump up and down as the active category's
// row count changes between categories.
const CHIP_Y = PANEL_TOP + 10;
const CHIP_HEIGHT = 30;
const CHIP_WIDTH = LEFT_PANEL_WIDTH - PANEL_PADDING * 2;
const DROPDOWN_ROW_HEIGHT = 30;
const DROPDOWN_ROW_GAP = 2;

const ICON_COLS = 2;
const ICON_COL_X = [PANEL_PADDING + 42, PANEL_PADDING + 42 + 80]; // two column centers, 80px apart
const ICON_ROW_HEIGHT = 54; // icon + label + breathing room
/** One brush's share of the grid: the column pitch by the row pitch. A tap
 * target may fill this and no more — see ui/touchTarget.ts for why the cap is
 * the load-bearing half. */
const ICON_HIT = hitRectFor(
  { width: TILE_SIZE, height: TILE_SIZE },
  { width: ICON_COL_X[1] - ICON_COL_X[0], height: ICON_ROW_HEIGHT },
);
const ICON_GRID_START_Y = CHIP_Y + CHIP_HEIGHT + 10;

// Fixed regardless of the active category's row count — sized for the
// worst case (Blocks/Decor, 5 rows) so switching categories never moves
// this trigger. See gameConfig.ts's vertical-budget comment for the math.
const SKIN_TRIGGER_HEIGHT = 26;
const SKIN_SECTION_Y = PANEL_TOP + 328;
/** How many icon rows fit between the category chip and the skin picker. Five,
 * which every built-in category was sized to fill exactly — see
 * paletteLayout.ts for what happens when an invented type pushes past that. */
const ICON_ROWS = rowsPerPage(ICON_GRID_START_Y, SKIN_SECTION_Y, ICON_ROW_HEIGHT);
/** The pager sits in the row the grid gives up when a category needs more than
 * one page, so it costs nothing while every category still fits. */
const ICON_PAGER_Y = ICON_GRID_START_Y + (ICON_ROWS - 1) * ICON_ROW_HEIGHT - 8;
const SKIN_PICKER_COLUMNS = 3;
const SKIN_PICKER_ITEM_SIZE = 26;

// --- Right "Level Settings" panel: a title, then one fixed-width button
// per row (Background/Music/Clear).
const RIGHT_BUTTON_WIDTH = RIGHT_PANEL_WIDTH - PANEL_PADDING * 2;
const RIGHT_BUTTON_HEIGHT = 32;
const RIGHT_BUTTON_GAP = 8;
const RIGHT_TITLE_Y = PANEL_TOP + 12;
const RIGHT_ROWS_START_Y = RIGHT_TITLE_Y + 24;
// Backgrounds have real image thumbnails (built-ins' own textures, or a
// custom upload's) that read fine small, so 3 narrow columns fit; music
// tracks are told apart by filename label alone (see AssetPickerItem's
// docstring), which needs more per-row width to avoid heavy wrapping, so
// 2 wider columns instead.
const BACKGROUND_PICKER_COLUMNS = 3;
const BACKGROUND_PICKER_ITEM_SIZE = 30;
const MUSIC_PICKER_COLUMNS = 2;
const MUSIC_PICKER_ITEM_SIZE = 24;

// --- Footer: read-only stats, left-aligned in fixed-width slots (nothing
// here is interactive, so unlike the header's buttons a slot's exact width
// doesn't matter — there's nothing downstream of it to keep from shifting).
// The save-state readout is the one exception — right-aligned to the
// footer's own right edge (as of 2026-08-17, moved down from the header —
// see the constructor) rather than another fixed left-hand slot, since
// unlike the other three stats it's not "read whenever you happen to look
// down here," it's the one thing worth a dedicated, always-in-the-same-
// corner spot the way it had next to Save before.
const FOOTER_TEXT_Y = FOOTER_Y + FOOTER_HEIGHT / 2;
const FOOTER_LEVEL_SIZE_X = PANEL_PADDING;
const FOOTER_CURSOR_X = 220;
const FOOTER_ENTITIES_X = 420;
const FOOTER_SAVE_STATUS_X = GAME_WIDTH - PANEL_PADDING;

// How long the Clear button stays "armed" (a second tap actually clears)
// before silently reverting to its normal label — long enough to not feel
// like a hair-trigger double-click, short enough that an accidental first
// tap doesn't leave the button armed for the rest of the session.
const CLEAR_ARM_TIMEOUT_MS = 3000;

/**
 * Header (Level Name/Undo/Redo/Eraser/Hand/Save/Test Play/Menu) above, a
 * stats footer (level size/cursor tile/entity count/save status) below,
 * and two docked vertical panels flanking the grid in between — all opaque
 * and rendered above the background (see PANEL_DEPTH vs StaticBackground's
 * depth -100): a left "Palette" panel (category chip + that category's
 * icon grid + Skin/Upload Skin) and a right "Level Settings" panel
 * (Background/Music/Clear). Erasing lives in the header now, not the
 * palette — see EditorScene's `eraserActive` — so unlike the palette's old
 * Erase brushes
 * it applies no matter which category tab happens to be open.
 */
/** A fixed-size button = an interactive background rect (the hit area and
 * hover/active color) plus a centered label on top — two separate display
 * objects rather than Phaser Text's own fixedWidth/fixedHeight, since Text
 * doesn't vertically center its content within a fixed box on its own. */
interface PanelButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

const BUTTON_COLOR = 0x0f3460;
const BUTTON_HOVER_COLOR = 0x3a5a9c;
/** "This is the selected member of a set" — the open palette category, the
 * current area, the chosen enemy size. Deliberately distinct from
 * BUTTON_HOVER_COLOR, which all three used to share, so "this one is selected"
 * never reads as "your pointer is here". Matches the Sprite editor's
 * SELECTED_COLOR so the two screens speak the same language. */
const SELECTED_COLOR = 0x8a6d1f;
const ERASER_ACTIVE_COLOR = 0xaa3333;
const ERASER_ACTIVE_HOVER_COLOR = 0xd14f4f;
const HAND_ACTIVE_COLOR = 0x6a3fa0;
const HAND_ACTIVE_HOVER_COLOR = 0x8c5bc9;
const TEST_PLAY_COLOR = 0x2e7d32;
const TEST_PLAY_HOVER_COLOR = 0x43a047;
const CLEAR_ARMED_COLOR = 0xaa3333;
const CLEAR_ARMED_HOVER_COLOR = 0xd14f4f;

export class EditorUI {
  private selectedOutline: Phaser.GameObjects.Image;
  private statusText: Phaser.GameObjects.Text;
  // Persistent, unlike statusText above (which auto-clears after 2.5s and
  // is reused for one-off messages like "Cleared") — always shows whether
  // the level in memory currently matches what's in storage. See
  // EditorScene's `dirty` flag/autosave for what drives it. Lives in the
  // footer, right-aligned to its own edge (as of 2026-08-17 — it sat in the
  // header just left of Save before that; see FOOTER_SAVE_STATUS_X).
  private saveStatusText: Phaser.GameObjects.Text;
  private backgroundPicker!: AssetPickerMenu;
  private musicPicker!: AssetPickerMenu;
  private skinPicker!: AssetPickerMenu;
  private setDefaultSkinButton!: Phaser.GameObjects.Text;
  private setDefaultArmed = false;
  private setDefaultArmTimer?: Phaser.Time.TimerEvent;
  /** The level's own skin choices, pushed in by EditorScene. Held here only so
   * the trigger can say *where* the current look came from — which matters now
   * that "Custom" alone can't distinguish a choice this level made from one it
   * inherited and would lose if the default moved. */
  private levelSkins: Record<string, string | null> | undefined;
  private eraserButton!: PanelButton;
  private handButton!: PanelButton;
  private clearButton!: PanelButton;
  private areaButtons = new Map<AreaKey, PanelButton>();
  private deleteAreaButton!: PanelButton;
  private deleteAreaArmed = false;
  private deleteAreaArmTimer?: Phaser.Time.TimerEvent;
  private currentAreaKey: AreaKey = "main";
  private subAreaExists = false;
  private upAreaExists = false;
  private sizeButtons = new Map<EnemySize, PanelButton>();
  private currentSize: EnemySize = "medium";
  private readonly categoryButtons = new Map<BrushCategory, PanelButton>();
  private iconGrid: Phaser.GameObjects.Container;
  private chipButton!: PanelButton;
  private dropdownContainer: Phaser.GameObjects.Container;
  private dropdownOpen = false;
  private eraserActive = false;
  private handActive = false;
  private clearArmed = false;
  private clearArmTimer?: Phaser.Time.TimerEvent;
  private activeCategory: BrushCategory;
  private selectedBrushId: string;
  // brushId -> texture key for every brush with a custom skin uploaded
  // (see skinLoader.ts) — empty until EditorScene's async resolve pass
  // finishes and calls applySkins, same "pop in a moment later" tolerance
  // as a custom background/music.
  private skinTextureKeys = new Map<string, string>();

  /** The palette this editor is actually offering: the built-in brushes plus
   * whatever entity types the player has invented (see
   * entities/customEntity.ts). Held rather than read from PALETTE at each site
   * so that setCustomBrushes has one thing to replace. Built-ins always come
   * first, so no existing brush moves when an invented one exists. */
  private brushes: Brush[] = [...PALETTE];

  /** Which page of the active category's grid is showing. Reset whenever the
   * category changes — a page index only means anything relative to one list. */
  private iconPage = 0;
  private footerCursorText: Phaser.GameObjects.Text;
  private footerEntitiesText: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    initialBackgroundLabel: string,
    initialMusicLabel: string | null,
    initialLevelName: string,
    initialLevelWidth: number,
    initialLevelHeight: number,
    initialEntityCount: number,
    private readonly callbacks: EditorUICallbacks,
  ) {
    this.activeCategory = PALETTE[0].category;
    this.selectedBrushId = PALETTE[0].id;

    // Header and footer bands span the full canvas width; the two side
    // panels only span the grid's own height, not the header/footer strips.
    scene.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, 0x16213e).setOrigin(0, 0).setDepth(PANEL_DEPTH);
    scene.add.rectangle(0, FOOTER_Y, GAME_WIDTH, FOOTER_HEIGHT, 0x16213e).setOrigin(0, 0).setDepth(PANEL_DEPTH);
    scene.add.rectangle(0, PANEL_TOP, LEFT_PANEL_WIDTH, PANEL_HEIGHT, 0x1a1a2e).setOrigin(0, 0).setDepth(PANEL_DEPTH);
    scene.add.rectangle(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_WIDTH, PANEL_HEIGHT, 0x1a1a2e).setOrigin(0, 0).setDepth(PANEL_DEPTH);

    // --- Header: left-anchored cluster (Name, Undo, Redo, Eraser) ---
    scene.add
      .text(NAME_LABEL_X, HEADER_HEIGHT / 2, "Name:", { fontSize: "12px", color: "#c8c8e0" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    new LevelNameInput(
      scene,
      { x: NAME_INPUT_X, y: NAME_INPUT_Y, width: NAME_INPUT_WIDTH, height: NAME_INPUT_HEIGHT },
      initialLevelName,
      (name) => this.callbacks.onRenameLevel(name),
    );

    let headerX = NAME_INPUT_X + NAME_INPUT_WIDTH + 16;
    const addHeaderButton = (label: string, width: number, onClick: () => void): PanelButton => {
      const button = this.makeFixedWidthButton(headerX, HEADER_BUTTON_Y, width, HEADER_BUTTON_HEIGHT, label, onClick);
      headerX += width + 8;
      return button;
    };
    this.wireHoverStyles(addHeaderButton("↶ Undo", 72, () => this.callbacks.onUndo()).bg);
    this.wireHoverStyles(addHeaderButton("↷ Redo", 72, () => this.callbacks.onRedo()).bg);
    this.eraserButton = addHeaderButton("Eraser", 64, () => this.callbacks.onToggleEraser());
    this.refreshEraserStyle();
    // Mutually exclusive with Eraser (EditorScene.toggleHand/toggleEraser
    // each clear the other's flag and call both setters here) — grabbing an
    // entity to drag it and erasing whatever's clicked are two different
    // things to do with a pointerdown on the grid, so only one can own it
    // at a time. Grab-and-drag itself (pointerdown on an occupied tile,
    // drag, pointerup on an empty one) lives in EditorScene's beginGrab/
    // endGrab; this button only flips the mode.
    this.handButton = addHeaderButton("Hand", 54, () => this.callbacks.onToggleHand());
    this.refreshHandStyle();

    // Area switcher (see "Sub/Up areas" under Art): Main always exists;
    // Sub/Up show "+Sub"/"+Up" until first switched to, at which point
    // EditorScene creates a blank one and setAreaState relabels the
    // button plain "Sub"/"Up" — same button, no separate create step.
    const AREA_KEYS: AreaKey[] = ["main", "sub", "up"];
    const AREA_BUTTON_WIDTH: Record<AreaKey, number> = { main: 40, sub: 40, up: 34 };
    for (const key of AREA_KEYS) {
      const button = addHeaderButton(this.areaButtonLabel(key), AREA_BUTTON_WIDTH[key], () => this.callbacks.onSelectArea(key));
      button.bg.on("pointerover", () => button.bg.setFillStyle(BUTTON_HOVER_COLOR));
      button.bg.on("pointerout", () => this.refreshAreaButtonStyles());
      this.areaButtons.set(key, button);
    }
    headerX += 6; // a little extra breathing room before the (usually hidden) Delete button
    this.deleteAreaButton = addHeaderButton("Delete", 68, () => this.onDeleteAreaClicked());
    this.deleteAreaButton.bg.on("pointerover", () =>
      this.deleteAreaButton.bg.setFillStyle(this.deleteAreaArmed ? CLEAR_ARMED_HOVER_COLOR : BUTTON_HOVER_COLOR),
    );
    this.deleteAreaButton.bg.on("pointerout", () =>
      this.deleteAreaButton.bg.setFillStyle(this.deleteAreaArmed ? CLEAR_ARMED_COLOR : BUTTON_COLOR),
    );
    this.refreshAreaButtonStyles();
    this.deleteAreaButton.bg.setVisible(false);
    this.deleteAreaButton.label.setVisible(false);

    // --- Header: right-anchored cluster (Menu, Test Play, Save) ---
    const menuWidth = 60;
    const testPlayWidth = 110;
    const saveWidth = 56;
    const menuX = GAME_WIDTH - PANEL_PADDING - menuWidth;
    const testPlayX = menuX - 8 - testPlayWidth;
    const saveX = testPlayX - 8 - saveWidth;

    const saveButton = this.makeFixedWidthButton(saveX, HEADER_BUTTON_Y, saveWidth, HEADER_BUTTON_HEIGHT, "Save", () => this.callbacks.onSave());
    this.wireHoverStyles(saveButton.bg);

    const testPlayButton = this.makeFixedWidthButton(testPlayX, HEADER_BUTTON_Y, testPlayWidth, HEADER_BUTTON_HEIGHT, "Test Play (Space)", () =>
      this.callbacks.onTestPlay(),
    );
    testPlayButton.bg.setFillStyle(TEST_PLAY_COLOR);
    testPlayButton.bg.on("pointerover", () => testPlayButton.bg.setFillStyle(TEST_PLAY_HOVER_COLOR));
    testPlayButton.bg.on("pointerout", () => testPlayButton.bg.setFillStyle(TEST_PLAY_COLOR));

    const menuButton = this.makeFixedWidthButton(menuX, HEADER_BUTTON_Y, menuWidth, HEADER_BUTTON_HEIGHT, "Menu", () => this.callbacks.onMenu());
    this.wireHoverStyles(menuButton.bg);

    this.chipButton = this.makeFixedWidthButton(PANEL_PADDING, CHIP_Y, CHIP_WIDTH, CHIP_HEIGHT, this.chipLabel(), () => this.toggleDropdown());
    this.chipButton.bg.on("pointerover", () => this.chipButton.bg.setFillStyle(BUTTON_HOVER_COLOR));
    this.chipButton.bg.on("pointerout", () => this.chipButton.bg.setFillStyle(BUTTON_COLOR));

    this.dropdownContainer = scene.add.container(0, 0).setDepth(DROPDOWN_DEPTH).setVisible(false);
    CATEGORIES.forEach((category, i) => {
      const y = CHIP_Y + CHIP_HEIGHT + 4 + i * (DROPDOWN_ROW_HEIGHT + DROPDOWN_ROW_GAP);
      const button = this.makeFixedWidthButton(PANEL_PADDING, y, CHIP_WIDTH, DROPDOWN_ROW_HEIGHT, category.label, () =>
        this.selectCategory(category.id),
      );
      button.bg.on("pointerover", () => button.bg.setFillStyle(BUTTON_HOVER_COLOR));
      button.bg.on("pointerout", () => this.refreshCategoryStyles());
      this.categoryButtons.set(category.id, button);
      this.dropdownContainer.add([button.bg, button.label]);
    });
    this.refreshCategoryStyles();

    this.iconGrid = scene.add.container(0, 0).setDepth(CONTENT_DEPTH);
    this.selectedOutline = scene.add.image(-100, -100, "selected-outline").setDepth(OUTLINE_DEPTH);
    this.renderIconGrid();

    // Skin picker: fixed position below the grid (see SKIN_SECTION_Y)
    // regardless of the active category's row count — reskins whichever
    // brush is currently selected (see "Skin/background/music libraries"
    // under Art); the palette selection doubles as "which type", so
    // there's no separate type-picker UI. Opening it resolves (a Drive
    // read) and pushes that brush's own skin library via
    // setSkinPickerItems — see onSkinPickerOpen below.
    this.skinPicker = new AssetPickerMenu({
      scene,
      trigger: { x: PANEL_PADDING, y: SKIN_SECTION_Y, width: CHIP_WIDTH, height: SKIN_TRIGGER_HEIGHT },
      columns: SKIN_PICKER_COLUMNS,
      itemSize: SKIN_PICKER_ITEM_SIZE,
      uploadAccept: "image/*",
      triggerDepth: CONTENT_DEPTH,
      dropdownDepth: DROPDOWN_DEPTH,
      canOpen: () => {
        const brush = this.selectedBrush();
        if (brush && isSkinnable(brush)) return true;
        this.setStatus("That brush can't be reskinned");
        return false;
      },
      onToggleOpen: (isOpen) => {
        if (!isOpen) return;
        this.backgroundPicker.close();
        this.musicPicker.close();
        this.callbacks.onSkinPickerOpen();
      },
      onSelect: (id) => {
        if (id === USE_DEFAULT_SKIN_ID) this.callbacks.onSelectSkin(undefined);
        else if (id === BUILTIN_SKIN_ID) this.callbacks.onSelectSkin(null);
        else this.callbacks.onSelectSkin(id);
      },
      onDelete: (id) => this.callbacks.onDeleteSkin(id),
      onUploadFile: (file) => this.callbacks.onUploadSkin(file),
    });

    // Created *before* the first setSkinPickerLabel() below, which shows and
    // hides it — the two are coupled, and building the button afterwards threw
    // on the very first editor open.
    //
    // Directly under the picker, in the ~30px between it and the panel floor.
    // Two-tap confirmed, same shape as Clear/Delete Area, because unlike every
    // other control in this panel it reaches *other levels* — it is the only
    // way a default moves now, and it should feel like the deliberate act it
    // is. See EditorScene.setAsDefaultSkin.
    this.setDefaultSkinButton = scene.add
      .text(PANEL_PADDING, SKIN_SECTION_Y + SKIN_TRIGGER_HEIGHT + 4, "Set as default", {
        fontSize: "11px",
        color: "#a6a6c8",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 4 },
      })
      .setDepth(CONTENT_DEPTH)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onSetDefaultClicked());
    this.setSkinPickerLabel();

    // --- Right "Level Settings" panel ---
    scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, RIGHT_TITLE_Y, "Level Settings", { fontSize: "13px", color: "#a6a6c8", fontStyle: "bold" })
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);

    let rowY = RIGHT_ROWS_START_Y;

    // Background picker: built-ins and every uploaded background share one
    // submenu (see AssetPickerMenu) — opening it resolves the shared
    // library's thumbnails via onBackgroundPickerOpen below.
    this.backgroundPicker = new AssetPickerMenu({
      scene,
      trigger: { x: RIGHT_PANEL_X + PANEL_PADDING, y: rowY, width: RIGHT_BUTTON_WIDTH, height: RIGHT_BUTTON_HEIGHT },
      columns: BACKGROUND_PICKER_COLUMNS,
      itemSize: BACKGROUND_PICKER_ITEM_SIZE,
      uploadAccept: "image/*",
      triggerDepth: CONTENT_DEPTH,
      dropdownDepth: DROPDOWN_DEPTH,
      onToggleOpen: (isOpen) => {
        if (!isOpen) return;
        this.skinPicker.close();
        this.musicPicker.close();
        this.callbacks.onBackgroundPickerOpen();
      },
      onSelect: (id) => this.callbacks.onSelectBackground(id),
      onDelete: (id) => this.callbacks.onDeleteBackground(id),
      onUploadFile: (file) => this.callbacks.onUploadBackground(file),
    });
    this.backgroundPicker.setTriggerLabel(this.backgroundLabelText(initialBackgroundLabel));
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Music picker: "None" plus every uploaded track share one submenu,
    // same shape as the background picker above — see
    // onMusicPickerOpen below.
    this.musicPicker = new AssetPickerMenu({
      scene,
      trigger: { x: RIGHT_PANEL_X + PANEL_PADDING, y: rowY, width: RIGHT_BUTTON_WIDTH, height: RIGHT_BUTTON_HEIGHT },
      columns: MUSIC_PICKER_COLUMNS,
      itemSize: MUSIC_PICKER_ITEM_SIZE,
      uploadAccept: "audio/*",
      triggerDepth: CONTENT_DEPTH,
      dropdownDepth: DROPDOWN_DEPTH,
      onToggleOpen: (isOpen) => {
        if (!isOpen) return;
        this.skinPicker.close();
        this.backgroundPicker.close();
        this.callbacks.onMusicPickerOpen();
      },
      onSelect: (id) => this.callbacks.onSelectMusic(id === NO_MUSIC_ID ? null : id),
      onDelete: (id) => this.callbacks.onDeleteMusic(id),
      onUploadFile: (file) => this.callbacks.onUploadMusic(file),
    });
    this.musicPicker.setTriggerLabel(this.musicLabelText(initialMusicLabel));
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Enemy Size: a placement-time preference (like the palette selection
    // itself), not a property of anything currently selected — it applies
    // whenever an enemy brush is next placed, regardless of which brush
    // happens to be active right now, so unlike Skin there's no "N/A"
    // state to show; all 3 stay clickable and "Medium" starts highlighted
    // to match every enemy's unscaled, pre-this-feature look.
    rowY += 8;
    scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, rowY, "Enemy Size", { fontSize: "13px", color: "#a6a6c8", fontStyle: "bold" })
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);
    rowY += 24;
    const sizeButtonGap = 6;
    const sizeButtonWidth = (RIGHT_BUTTON_WIDTH - sizeButtonGap * 2) / 3;
    ENEMY_SIZES.forEach(({ id, label }, i) => {
      const x = RIGHT_PANEL_X + PANEL_PADDING + i * (sizeButtonWidth + sizeButtonGap);
      const button = this.makeFixedWidthButton(x, rowY, sizeButtonWidth, RIGHT_BUTTON_HEIGHT, label, () => this.selectSize(id));
      button.bg.on("pointerover", () => button.bg.setFillStyle(BUTTON_HOVER_COLOR));
      button.bg.on("pointerout", () => this.refreshSizeStyles());
      this.sizeButtons.set(id, button);
    });
    this.refreshSizeStyles();
    rowY += RIGHT_BUTTON_HEIGHT;

    // Clear used to sit between the Music picker and Enemy Size, styled
    // identically to both — a button that erases every tile you have placed,
    // grouped and coloured as if it were a third asset setting. It is not a
    // setting, so it now sits last, under its own heading and a rule, with
    // nothing beneath it to reach for by accident.
    //
    // Its resting colour stays BUTTON_COLOR deliberately: the two-tap arm is
    // what signals danger (CLEAR_ARMED_COLOR), and tinting the resting state
    // red as well would blunt the difference between "this is destructive" and
    // "this is armed and the next tap does it".
    rowY += 12;
    scene.add
      .rectangle(RIGHT_PANEL_X + PANEL_PADDING, rowY, RIGHT_BUTTON_WIDTH, 1, 0x2b3350)
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);
    rowY += 12;
    scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, rowY, "Level content", { fontSize: "13px", color: "#a6a6c8", fontStyle: "bold" })
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);
    rowY += 24;
    this.clearButton = this.makeFixedWidthButton(RIGHT_PANEL_X + PANEL_PADDING, rowY, RIGHT_BUTTON_WIDTH, RIGHT_BUTTON_HEIGHT, "Clear", () =>
      this.onClearClicked(),
    );
    this.clearButton.bg.on("pointerover", () => this.clearButton.bg.setFillStyle(this.clearArmed ? CLEAR_ARMED_HOVER_COLOR : BUTTON_HOVER_COLOR));
    this.clearButton.bg.on("pointerout", () => this.clearButton.bg.setFillStyle(this.clearArmed ? CLEAR_ARMED_COLOR : BUTTON_COLOR));

    // --- Footer: read-only stats ---
    scene.add
      .text(FOOTER_LEVEL_SIZE_X, FOOTER_TEXT_Y, `Level: ${initialLevelWidth}×${initialLevelHeight}`, { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    this.footerCursorText = scene.add
      .text(FOOTER_CURSOR_X, FOOTER_TEXT_Y, "Cursor: –", { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    this.footerEntitiesText = scene.add
      .text(FOOTER_ENTITIES_X, FOOTER_TEXT_Y, `Entities: ${initialEntityCount}`, { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    this.saveStatusText = scene.add
      .text(FOOTER_SAVE_STATUS_X, FOOTER_TEXT_Y, SAVE_STATE_DISPLAY.saved.text, {
        fontSize: "11px",
        color: SAVE_STATE_DISPLAY.saved.color,
      })
      .setOrigin(1, 0.5)
      .setDepth(CONTENT_DEPTH);

    this.statusText = scene.add
      .text(GAME_WIDTH / 2, HEADER_HEIGHT + 8, "", {
        fontSize: "13px",
        color: "#ffeb3b",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(STATUS_DEPTH);
  }

  /** Unlike the old toolbar's makeRowButton (a single auto-sized Text),
   * every panel button here gets an explicit width/height rectangle so a
   * row's position never depends on what any other row's label happens to
   * say — see the class docstring for the bug class this eliminates. The
   * label is a second, non-interactive Text centered on top; the rect
   * (not the label) owns the click/hover handlers and hit area. */
  private makeFixedWidthButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void): PanelButton {
    const bg = this.scene.add
      .rectangle(x, y, width, height, BUTTON_COLOR)
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH)
      .setInteractive({ useHandCursor: true });
    bg.on("pointerdown", onClick);
    const text = this.scene.add
      .text(x + width / 2, y + height / 2, label, {
        fontSize: "12px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: width - 8 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(CONTENT_DEPTH);
    return { bg, label: text };
  }

  /** The plain hover/unhover styling every non-toggle, non-accented button
   * shares — factored out since most of the header/right-panel buttons use
   * it verbatim. */
  private wireHoverStyles(bg: Phaser.GameObjects.Rectangle): void {
    bg.on("pointerover", () => bg.setFillStyle(BUTTON_HOVER_COLOR));
    bg.on("pointerout", () => bg.setFillStyle(BUTTON_COLOR));
  }

  private chipLabel(): string {
    const category = CATEGORIES.find((c) => c.id === this.activeCategory);
    return `${category?.label ?? ""} ▾`;
  }

  /**
   * Paints the open category.
   *
   * Two bugs in one: the fill was only ever set by the hover handlers, so
   * opening the dropdown showed *no* category as open until you hovered one and
   * left — and when it did paint, it used BUTTON_HOVER_COLOR, which is what a
   * category you are merely pointing at looks like. Same "restyle on both
   * selection and hover-out" treatment the area and Enemy Size rows already use.
   */
  private refreshCategoryStyles(): void {
    for (const [id, button] of this.categoryButtons) {
      button.bg.setFillStyle(id === this.activeCategory ? SELECTED_COLOR : BUTTON_COLOR);
    }
  }

  private toggleDropdown(): void {
    this.dropdownOpen = !this.dropdownOpen;
    this.dropdownContainer.setVisible(this.dropdownOpen);
    this.iconGrid.setVisible(!this.dropdownOpen);
    this.selectedOutline.setVisible(!this.dropdownOpen && this.selectedOutline.visible);
    if (!this.dropdownOpen) this.updateSelectedOutlinePosition();
  }

  private selectCategory(category: BrushCategory): void {
    this.dropdownOpen = false;
    this.dropdownContainer.setVisible(false);
    this.iconGrid.setVisible(true);
    if (category !== this.activeCategory) {
      this.activeCategory = category;
      this.iconPage = 0;
      this.refreshCategoryStyles();
      this.renderIconGrid();
    } else {
      this.updateSelectedOutlinePosition();
    }
    this.chipButton.label.setText(this.chipLabel());
  }

  /** One laid-out slot's icon center, in panel pixels. The column/row walk
   * itself lives in paletteLayout.ts (pure, and it has to page); this is only
   * the arithmetic that turns a slot into a position. */
  private iconPosition(slot: BrushSlot): { x: number; y: number } {
    return { x: ICON_COL_X[slot.col], y: ICON_GRID_START_Y + slot.row * ICON_ROW_HEIGHT };
  }

  /** The active category's brushes, split into pages.
   *
   * A `groupEnd` brush (see Palette.ts) forces the next one onto a new row —
   * so the Blocks category's ground-skin/block-kind/hazard clusters read as
   * separate groups, stacked rather than spread sideways. renderIconGrid and
   * updateSelectedOutlinePosition both need this same layout, so it is computed
   * here rather than twice. Recomputed rather than cached: it depends on the
   * brush list, which setCustomBrushes can replace at any time, and the walk is
   * over at most a couple of dozen entries. */
  private iconPages(): BrushSlot[][] {
    const brushes = this.brushes.filter((brush) => brush.category === this.activeCategory);
    return layOutBrushes(brushes, ICON_ROWS, ICON_COLS);
  }

  /** The texture a brush's icon (and, via EntityPlacer/PlayScene using
   * this same lookup, every placed/spawned instance of it) should render
   * with right now — the custom skin if one's been uploaded for this
   * brush id, else its own built-in art. */
  private textureKeyFor(brush: Brush): string {
    return this.skinTextureKeys.get(brush.id) ?? brush.textureKey;
  }

  private renderIconGrid(): void {
    this.iconGrid.removeAll(true);
    const pages = this.iconPages();
    this.iconPage = clampPage(this.iconPage, pages.length, 1);
    pages[this.iconPage].forEach((slot) => {
      const brush = slot.brush;
      const { x, y } = this.iconPosition(slot);
      // The tap target is an invisible Zone rather than the icon itself.
      //
      // A hit-area rectangle set on the Image would be measured in *texture*
      // space, and fitWithinTile scales each icon by whatever its own source art
      // needs — so the same rectangle would come out a different size per brush.
      // A Zone is sized in game pixels directly, which is the space every layout
      // constant here is written in.
      //
      // It goes in *before* the icon so the display list stays [Image, Text] for
      // each brush, which is what the e2e helper `clickIconWithLabel` looks for.
      const hit = this.scene.add
        .zone(x, y, ICON_HIT.width, ICON_HIT.height)
        .setDepth(CONTENT_DEPTH)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.selectBrush(brush));

      const icon = this.scene.add.image(x, y, this.textureKeyFor(brush)).setDepth(CONTENT_DEPTH);
      fitWithinTile(icon);
      // See UP_BASKET_TINT_COLOR's own docstring — only while the default
      // art (not a custom skin override) is what's actually showing.
      if (brush.id === "basket-up" && !this.skinTextureKeys.has(brush.id)) icon.setTint(UP_BASKET_TINT_COLOR);
      const label = this.scene.add
        .text(x, y + TILE_SIZE / 2 + 2, brush.label, { fontSize: "10px", color: "#eeeeee" })
        .setOrigin(0.5, 0)
        .setDepth(CONTENT_DEPTH);
      this.iconGrid.add([hit, icon, label]);
    });
    // Appended *after* every [Zone, Image, Text] triple so the display list a
    // brush occupies stays [Image, Text]-adjacent, which is what the e2e helper
    // clickIconWithLabel matches on.
    this.iconGrid.add(this.makeIconPager(pages.length));
    this.updateSelectedOutlinePosition();
  }

  /** The compact "‹ 2/3 ›" row under the grid. Nothing at all while the
   * category fits on one page, which is every built-in category — the shared
   * PagerControls row is far too wide for a 190px panel, so this is its own
   * two-arrow version rather than a reuse. */
  private makeIconPager(pages: number): Phaser.GameObjects.GameObject[] {
    if (pages <= 1) return [];
    const arrow = (x: number, label: string, to: number, enabled: boolean): Phaser.GameObjects.Text => {
      const text = this.scene.add
        .text(x, ICON_PAGER_Y, label, {
          fontSize: "13px",
          // Greyed rather than removed, so the other arrow never jumps sideways
          // under a finger already reaching for it.
          color: enabled ? "#ffffff" : "#6a6f90",
          backgroundColor: "#0f3460",
          padding: { x: 10, y: 8 },
        })
        .setDepth(CONTENT_DEPTH);
      if (enabled) {
        text.setInteractive({ useHandCursor: true });
        text.on("pointerdown", () => {
          this.iconPage = to;
          this.renderIconGrid();
        });
      }
      return text;
    };
    const current = clampPage(this.iconPage, pages, 1);
    const prev = arrow(ICON_COL_X[0] - 42, "‹", current - 1, current > 0);
    const label = this.scene.add
      .text(ICON_COL_X[0] + 40, ICON_PAGER_Y + 8, `${current + 1}/${pages}`, {
        fontSize: "11px",
        color: "#a6a6c8",
      })
      .setOrigin(0.5, 0)
      .setDepth(CONTENT_DEPTH);
    const next = arrow(ICON_COL_X[1] + 12, "\u203a", current + 1, current < pages - 1);
    return [prev, label, next];
  }

  /**
   * Replaces the invented half of the palette and redraws.
   *
   * Called by EditorScene once the custom-entity library resolves, mirroring
   * setSkinTextureKeys: the editor opens usable with built-ins only and the
   * invented types pop in a moment later, rather than the whole screen waiting
   * on a Drive read.
   */
  setCustomBrushes(defs: CustomEntityDef[]): void {
    this.brushes = [...PALETTE, ...customBrushes(defs)];
    this.renderIconGrid();
  }

  /** Hidden when the selected brush belongs to a category that isn't
   * currently showing, or while the category dropdown is open — there's
   * nothing in the visible grid to outline, but the selection itself is
   * untouched (switching back shows it again). */
  private updateSelectedOutlinePosition(): void {
    if (this.dropdownOpen) {
      this.selectedOutline.setVisible(false);
      return;
    }
    const pages = this.iconPages();
    // Not on the page being shown — either another category, or another page of
    // this one. Either way there is nothing in the visible grid to outline; the
    // selection itself is untouched and reappears on the way back.
    if (pageOfBrush(pages, this.selectedBrushId) !== this.iconPage) {
      this.selectedOutline.setVisible(false);
      return;
    }
    const slot = pages[this.iconPage].find((s) => s.brush.id === this.selectedBrushId)!;
    const { x, y } = this.iconPosition(slot);
    this.selectedOutline.setPosition(x, y).setVisible(true);
  }

  selectBrush(brush: Brush): void {
    this.selectedBrushId = brush.id;
    this.updateSelectedOutlinePosition();
    // The skin picker's dropdown sits well below the icon grid (see
    // SKIN_SECTION_Y), not overlaying it, so it's reachable to switch
    // brushes while the picker is still open showing the *previous*
    // brush's skins — close it rather than leave a stale, wrong-brush
    // list (and wrong active highlight) on screen.
    this.skinPicker.close();
    this.setSkinPickerLabel();
    this.callbacks.onSelectBrush(brush);
  }

  setStatus(message: string): void {
    this.statusText.setText(message);
    this.scene.time.delayedCall(2500, () => {
      if (this.statusText.text === message) this.statusText.setText("");
    });
  }

  setSaveState(state: SaveState): void {
    const { text, color } = SAVE_STATE_DISPLAY[state];
    this.saveStatusText.setText(text).setColor(color);
  }

  /** Called by EditorScene on every pointer move over the grid — `null`
   * once the pointer leaves it (or is over an out-of-bounds tile), same
   * "nothing to show" convention as the hover highlight. */
  setCursorTile(tile: { x: number; y: number } | null): void {
    this.footerCursorText.setText(tile ? `Cursor: ${tile.x}, ${tile.y}` : "Cursor: –");
  }

  /** Called by EditorScene whenever the entity count could have changed
   * (placement, erase, Clear, Load) — cheapest to just call on every
   * markDirty rather than threading a "did the count change" check
   * through every call site. */
  setEntityCount(count: number): void {
    this.footerEntitiesText.setText(`Entities: ${count}`);
  }

  /** Called by EditorScene's toggleEraser — restyles the header button so
   * it stays visibly engaged even after the pointer leaves it, same
   * "persistent state, not momentary hover" treatment the old category
   * tabs used for their own active state. */
  setEraserActive(active: boolean): void {
    this.eraserActive = active;
    this.refreshEraserStyle();
  }

  private refreshEraserStyle(): void {
    this.eraserButton.bg.setFillStyle(this.eraserActive ? ERASER_ACTIVE_COLOR : BUTTON_COLOR);
    this.eraserButton.bg.off("pointerover");
    this.eraserButton.bg.off("pointerout");
    this.eraserButton.bg.on("pointerover", () => this.eraserButton.bg.setFillStyle(this.eraserActive ? ERASER_ACTIVE_HOVER_COLOR : BUTTON_HOVER_COLOR));
    this.eraserButton.bg.on("pointerout", () => this.eraserButton.bg.setFillStyle(this.eraserActive ? ERASER_ACTIVE_COLOR : BUTTON_COLOR));
  }

  /** Called by EditorScene's toggleHand — same "persistent state, not
   * momentary hover" treatment as setEraserActive/refreshEraserStyle. A
   * distinct color (not ERASER_ACTIVE_COLOR) so the two toggles read as
   * different tools at a glance even though only one can ever be active. */
  setHandActive(active: boolean): void {
    this.handActive = active;
    this.refreshHandStyle();
  }

  private refreshHandStyle(): void {
    this.handButton.bg.setFillStyle(this.handActive ? HAND_ACTIVE_COLOR : BUTTON_COLOR);
    this.handButton.bg.off("pointerover");
    this.handButton.bg.off("pointerout");
    this.handButton.bg.on("pointerover", () => this.handButton.bg.setFillStyle(this.handActive ? HAND_ACTIVE_HOVER_COLOR : BUTTON_HOVER_COLOR));
    this.handButton.bg.on("pointerout", () => this.handButton.bg.setFillStyle(this.handActive ? HAND_ACTIVE_COLOR : BUTTON_COLOR));
  }

  /** First tap arms the button (distinct color + revised label) and starts
   * a revert timer; a second tap while armed actually clears. Any other
   * button click doesn't disarm it early — only the timeout or a second
   * Clear tap resolves the armed state, so a stray click elsewhere can't
   * be mistaken for a deliberate confirm. */
  private onClearClicked(): void {
    if (this.clearArmed) {
      this.clearArmTimer?.remove(false);
      this.disarmClear();
      this.callbacks.onClear();
      return;
    }
    this.clearArmed = true;
    this.clearButton.label.setText("Clear? Tap again");
    this.clearButton.bg.setFillStyle(CLEAR_ARMED_COLOR);
    this.clearArmTimer = this.scene.time.delayedCall(CLEAR_ARM_TIMEOUT_MS, () => this.disarmClear());
  }

  private disarmClear(): void {
    this.clearArmed = false;
    this.clearButton.label.setText("Clear");
    this.clearButton.bg.setFillStyle(BUTTON_COLOR);
  }

  private areaButtonLabel(key: AreaKey): string {
    if (key === "main") return "Main";
    if (key === "sub") return this.subAreaExists ? "Sub" : "+Sub";
    return this.upAreaExists ? "Up" : "+Up";
  }

  /** Persistent highlight on whichever area is currently selected, same
   * "restyle on both selection and hover-out" treatment as Enemy Size's
   * own refreshSizeStyles. */
  private refreshAreaButtonStyles(): void {
    for (const [key, button] of this.areaButtons) {
      button.bg.setFillStyle(key === this.currentAreaKey ? SELECTED_COLOR : BUTTON_COLOR);
    }
  }

  /** Called by EditorScene right after construction (a loaded level may
   * already have Sub and/or Up areas) and again after every area create/
   * switch/delete — relabels the Main/Sub/Up switcher (+Sub/+Up vs. plain
   * Sub/Up), moves the persistent highlight, and shows the Delete button
   * only once there's actually a non-Main area selected to delete (Main
   * itself is permanent). Also disarms any pending Delete confirmation —
   * switching areas (or the area just having been deleted out from under
   * it) means whatever was armed no longer applies. */
  setAreaState(existing: { sub: boolean; up: boolean }, current: AreaKey): void {
    this.subAreaExists = existing.sub;
    this.upAreaExists = existing.up;
    this.currentAreaKey = current;
    for (const [key, button] of this.areaButtons) {
      button.label.setText(this.areaButtonLabel(key));
    }
    this.refreshAreaButtonStyles();
    this.deleteAreaButton.bg.setVisible(current !== "main");
    this.deleteAreaButton.label.setVisible(current !== "main");
    this.deleteAreaArmTimer?.remove(false);
    this.disarmDeleteArea();
  }

  /** Same two-tap arm/confirm shape as onClearClicked/disarmClear — kept
   * as its own copy rather than a shared helper since the two buttons'
   * labels/targets differ enough (and there are only two) that factoring
   * out "generic armed button" would be more indirection than the
   * duplication it'd save. */
  private onDeleteAreaClicked(): void {
    if (this.deleteAreaArmed) {
      this.deleteAreaArmTimer?.remove(false);
      this.disarmDeleteArea();
      this.callbacks.onDeleteArea();
      return;
    }
    this.deleteAreaArmed = true;
    this.deleteAreaButton.label.setText("Delete?");
    this.deleteAreaButton.bg.setFillStyle(CLEAR_ARMED_COLOR);
    this.deleteAreaArmTimer = this.scene.time.delayedCall(CLEAR_ARM_TIMEOUT_MS, () => this.disarmDeleteArea());
  }

  private disarmDeleteArea(): void {
    this.deleteAreaArmed = false;
    this.deleteAreaButton.label.setText("Delete");
    this.deleteAreaButton.bg.setFillStyle(BUTTON_COLOR);
  }

  private selectSize(size: EnemySize): void {
    this.currentSize = size;
    this.refreshSizeStyles();
    this.callbacks.onSelectSize(size);
  }

  /** Same "restyle on both selection and hover-out" treatment as the old
   * category tabs used (see the 2026-08-14 layout pass) — a size is a
   * persistent choice, not a momentary hover, so it needs to stay
   * highlighted after the pointer leaves it. */
  private refreshSizeStyles(): void {
    for (const [id, button] of this.sizeButtons) {
      button.bg.setFillStyle(id === this.currentSize ? SELECTED_COLOR : BUTTON_COLOR);
    }
  }

  private backgroundLabelText(label: string): string {
    return `BG: ${label} ▾`;
  }

  /** Called by EditorScene after a background is picked (or an upload
   * lands) — the trigger's own text is the only place the current
   * background is displayed. Fixed-width, so this never needs to
   * reposition anything else on the panel. */
  setBackgroundLabel(label: string): void {
    this.backgroundPicker.setTriggerLabel(this.backgroundLabelText(label));
  }

  /** Called by EditorScene once onBackgroundPickerOpen's async resolve
   * (a Drive read of the shared library) finishes — `items` already
   * includes the 4 built-ins alongside any uploaded ones; `activeId`
   * matches whichever built-in id or library uuid the level currently
   * uses. */
  setBackgroundPickerItems(items: AssetPickerItem[], activeId: string): void {
    this.backgroundPicker.setItems(items, activeId);
  }

  private musicLabelText(name: string | null): string {
    return `Music: ${name ?? "None"} ▾`;
  }

  /** Called by EditorScene after a track is picked (or an upload lands)
   * — `name` is the track's own library name (LevelData.customMusicId
   * resolved against music.json), or `null` when the level has none. */
  setMusicLabel(name: string | null): void {
    this.musicPicker.setTriggerLabel(this.musicLabelText(name));
  }

  /** Called by EditorScene once onMusicPickerOpen's async resolve
   * finishes — `items` is "None" plus every uploaded track; `activeId`
   * is NO_MUSIC_ID when the level has none. */
  setMusicPickerItems(items: AssetPickerItem[], activeId: string): void {
    this.musicPicker.setItems(items, activeId);
  }

  private selectedBrush(): Brush | undefined {
    return this.brushes.find((brush) => brush.id === this.selectedBrushId);
  }

  /** Reports *where the look came from*, not merely whether it is custom: with
   * two layers, "Custom" alone can't tell a choice this level made from one it
   * inherited, and inheriting means it changes if the default does. */
  private skinTriggerLabel(): string {
    const brush = this.selectedBrush();
    if (!brush || !isSkinnable(brush)) return "Skin: N/A";
    // Nothing resolved means built-in art, whichever layer decided that.
    if (!this.skinTextureKeys.has(brush.id)) return "Skin: Built-in ▾";
    // Something resolved: this level's own pick, or one it inherited.
    return this.levelSkins?.[brush.id] ? "Skin: Custom ▾" : "Skin: Default ▾";
  }

  private setSkinPickerLabel(): void {
    this.skinPicker.setTriggerLabel(this.skinTriggerLabel());
    const skinnable = !!this.selectedBrush() && isSkinnable(this.selectedBrush()!);
    this.setDefaultSkinButton.setVisible(skinnable);
    this.disarmSetDefault();
  }

  /** Pushed in by EditorScene alongside every applySkins, so the trigger can
   * distinguish a look this level chose from one it inherited. */
  setLevelSkins(levelSkins: Record<string, string | null> | undefined): void {
    this.levelSkins = levelSkins;
    this.setSkinPickerLabel();
  }

  private onSetDefaultClicked(): void {
    if (this.setDefaultArmed) {
      this.disarmSetDefault();
      this.callbacks.onSetSkinAsDefault();
      return;
    }
    this.setDefaultArmed = true;
    this.setDefaultSkinButton.setText("For every level?").setStyle({ backgroundColor: "#aa3333", color: "#ffffff" });
    this.setDefaultArmTimer = this.scene.time.delayedCall(CLEAR_ARM_TIMEOUT_MS, () => this.disarmSetDefault());
  }

  private disarmSetDefault(): void {
    this.setDefaultArmTimer?.remove(false);
    this.setDefaultArmTimer = undefined;
    this.setDefaultArmed = false;
    this.setDefaultSkinButton.setText("Set as default").setStyle({ backgroundColor: "#0f3460", color: "#a6a6c8" });
  }

  /** Called by EditorScene once onSkinPickerOpen's async resolve (a Drive
   * read scoped to just the currently-selected brush — see
   * skinLoader.ts's resolveSkinThumbnails) finishes — `items` is the brush's
   * "Use default" and "Built-in art" options plus every skin uploaded for it;
   * `activeId` is whichever of those this *level* currently chooses. */
  setSkinPickerItems(items: AssetPickerItem[], activeId: string): void {
    this.skinPicker.setItems(items, activeId);
  }

  /** Called by EditorScene once its async active-skin-resolution pass
   * (see skinLoader.ts's resolveSkinTextureKeys) finishes — re-renders
   * the icon grid so every skinned brush's icon picks up its active
   * texture, and refreshes the skin trigger's label for whichever brush
   * is currently selected. */
  applySkins(skinTextureKeys: Map<string, string>): void {
    this.skinTextureKeys = skinTextureKeys;
    this.renderIconGrid();
    this.setSkinPickerLabel();
  }
}
