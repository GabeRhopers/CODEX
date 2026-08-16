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
import { EnemySize } from "../level/LevelSchema";
import { SAVE_STATE_DISPLAY, SaveState } from "../persistence/saveState";
import { FileInputOverlay } from "./FileInputOverlay";
import { LevelNameInput } from "./LevelNameInput";
import { Brush, BrushCategory, CATEGORIES, PALETTE } from "./Palette";
import { fitWithinTile } from "./spriteFit";

export interface EditorUICallbacks {
  onSelectBrush: (brush: Brush) => void;
  onTestPlay: () => void;
  onSave: () => void;
  onMenu: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCycleBackground: () => void;
  onUploadBackground: (file: File) => void;
  onUploadMusic: (file: File) => void;
  onClearMusic: () => void;
  onRenameLevel: (name: string) => void;
  onUploadSkin: (file: File) => void;
  onClearSkin: () => void;
  onToggleEraser: () => void;
  onSelectSize: (size: EnemySize) => void;
}

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

// --- Header: Level Name anchored to the left edge, Undo/Redo/Eraser follow
// it; Save status/Save/Test Play/Menu anchor to the right edge instead of
// following the left-hand cluster, so neither the variable-length save
// status text nor the level name ever shifts them — see the constructor.
const HEADER_BUTTON_HEIGHT = 32;
const HEADER_BUTTON_Y = (HEADER_HEIGHT - HEADER_BUTTON_HEIGHT) / 2;
const NAME_LABEL_X = PANEL_PADDING;
const NAME_INPUT_X = NAME_LABEL_X + 46;
const NAME_INPUT_WIDTH = 200;
const NAME_INPUT_HEIGHT = 28;
const NAME_INPUT_Y = (HEADER_HEIGHT - NAME_INPUT_HEIGHT) / 2;

// --- Left "Palette" panel: a chip that expands into the 5 categories, a
// 2-column icon grid for whichever one is active, and the Skin/Upload Skin
// buttons pinned to a fixed spot below the grid (not "wherever the grid
// happens to end") so they don't jump up and down as the active category's
// row count changes between categories.
const CHIP_Y = PANEL_TOP + 10;
const CHIP_HEIGHT = 30;
const CHIP_WIDTH = LEFT_PANEL_WIDTH - PANEL_PADDING * 2;
const DROPDOWN_ROW_HEIGHT = 30;
const DROPDOWN_ROW_GAP = 2;

const ICON_COLS = 2;
const ICON_COL_X = [PANEL_PADDING + 42, PANEL_PADDING + 42 + 80]; // two column centers, 80px apart
const ICON_ROW_HEIGHT = 54; // icon + label + breathing room
const ICON_GRID_START_Y = CHIP_Y + CHIP_HEIGHT + 10;

// Fixed regardless of the active category's row count — sized for the
// worst case (Blocks/Decor, 5 rows) so switching categories never moves
// these buttons. See gameConfig.ts's vertical-budget comment for the math.
const SKIN_BUTTON_HEIGHT = 26;
const SKIN_SECTION_Y = PANEL_TOP + 328;
const SKIN_BUTTON_GAP = 4;

// --- Right "Level Settings" panel: a title, then one fixed-width button
// per row (Background/Upload BG/Music/Upload Music/Clear).
const RIGHT_BUTTON_WIDTH = RIGHT_PANEL_WIDTH - PANEL_PADDING * 2;
const RIGHT_BUTTON_HEIGHT = 32;
const RIGHT_BUTTON_GAP = 8;
const RIGHT_TITLE_Y = PANEL_TOP + 12;
const RIGHT_ROWS_START_Y = RIGHT_TITLE_Y + 24;

// --- Footer: read-only stats, left-aligned in fixed-width slots (nothing
// here is interactive, so unlike the header's buttons a slot's exact width
// doesn't matter — there's nothing downstream of it to keep from shifting).
const FOOTER_TEXT_Y = FOOTER_Y + FOOTER_HEIGHT / 2;
const FOOTER_LEVEL_SIZE_X = PANEL_PADDING;
const FOOTER_CURSOR_X = 220;
const FOOTER_ENTITIES_X = 420;

// How long the Clear button stays "armed" (a second tap actually clears)
// before silently reverting to its normal label — long enough to not feel
// like a hair-trigger double-click, short enough that an accidental first
// tap doesn't leave the button armed for the rest of the session.
const CLEAR_ARM_TIMEOUT_MS = 3000;

/**
 * Header (Level Name/Undo/Redo/Eraser/Save/Test Play/Menu) above, a stats
 * footer (level size/cursor tile/entity count) below, and two docked
 * vertical panels flanking the grid in between — all opaque and rendered
 * above the background (see PANEL_DEPTH vs StaticBackground's depth -100):
 * a left "Palette" panel (category chip + that category's icon grid +
 * Skin/Upload Skin) and a right "Level Settings" panel (Background/Music/
 * Clear). Erasing lives in the header now, not the palette — see
 * EditorScene's `eraserActive` — so unlike the palette's old Erase brushes
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
const ERASER_ACTIVE_COLOR = 0xaa3333;
const ERASER_ACTIVE_HOVER_COLOR = 0xd14f4f;
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
  // EditorScene's `dirty` flag/autosave for what drives it. Anchored to the
  // header's right-hand cluster, just left of the Save button.
  private saveStatusText: Phaser.GameObjects.Text;
  private backgroundButton!: PanelButton;
  private musicButton!: PanelButton;
  private skinButton!: PanelButton;
  private uploadSkinButton!: PanelButton;
  private eraserButton!: PanelButton;
  private clearButton!: PanelButton;
  private sizeButtons = new Map<EnemySize, PanelButton>();
  private currentSize: EnemySize = "medium";
  private iconGrid: Phaser.GameObjects.Container;
  private chipButton!: PanelButton;
  private dropdownContainer: Phaser.GameObjects.Container;
  private dropdownOpen = false;
  private eraserActive = false;
  private clearArmed = false;
  private clearArmTimer?: Phaser.Time.TimerEvent;
  private activeCategory: BrushCategory;
  private selectedBrushId: string;
  // brushId -> texture key for every brush with a custom skin uploaded
  // (see skinLoader.ts) — empty until EditorScene's async resolve pass
  // finishes and calls applySkins, same "pop in a moment later" tolerance
  // as a custom background/music.
  private skinTextureKeys = new Map<string, string>();
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
    this.wireHoverStyles(addHeaderButton("Undo", 56, () => this.callbacks.onUndo()).bg);
    this.wireHoverStyles(addHeaderButton("Redo", 56, () => this.callbacks.onRedo()).bg);
    this.eraserButton = addHeaderButton("Eraser", 64, () => this.callbacks.onToggleEraser());
    this.refreshEraserStyle();

    // --- Header: right-anchored cluster (Menu, Test Play, Save, status) ---
    const menuWidth = 60;
    const testPlayWidth = 110;
    const saveWidth = 56;
    const menuX = GAME_WIDTH - PANEL_PADDING - menuWidth;
    const testPlayX = menuX - 8 - testPlayWidth;
    const saveX = testPlayX - 8 - saveWidth;

    this.saveStatusText = scene.add
      .text(saveX - 8, HEADER_HEIGHT / 2, SAVE_STATE_DISPLAY.saved.text, {
        fontSize: "12px",
        color: SAVE_STATE_DISPLAY.saved.color,
      })
      .setOrigin(1, 0.5)
      .setDepth(CONTENT_DEPTH);

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
      button.bg.on("pointerout", () => button.bg.setFillStyle(category.id === this.activeCategory ? BUTTON_HOVER_COLOR : BUTTON_COLOR));
      this.dropdownContainer.add([button.bg, button.label]);
    });

    this.iconGrid = scene.add.container(0, 0).setDepth(CONTENT_DEPTH);
    this.selectedOutline = scene.add.image(-100, -100, "selected-outline").setDepth(OUTLINE_DEPTH);
    this.renderIconGrid();

    // Skin/Upload Skin: fixed position below the grid (see SKIN_SECTION_Y)
    // regardless of the active category's row count — reskins whichever
    // brush is currently selected (see "Custom skins" under Art); the
    // palette selection doubles as "which type", so there's no separate
    // type-picker UI.
    this.skinButton = this.makeFixedWidthButton(
      PANEL_PADDING,
      SKIN_SECTION_Y,
      CHIP_WIDTH,
      SKIN_BUTTON_HEIGHT,
      this.skinStatusLabel(),
      () => this.callbacks.onClearSkin(),
    );
    this.wireHoverStyles(this.skinButton.bg);

    const uploadSkinY = SKIN_SECTION_Y + SKIN_BUTTON_HEIGHT + SKIN_BUTTON_GAP;
    this.uploadSkinButton = this.makeFixedWidthButton(PANEL_PADDING, uploadSkinY, CHIP_WIDTH, SKIN_BUTTON_HEIGHT, this.uploadSkinLabel(), () => {});
    new FileInputOverlay(
      scene,
      { x: PANEL_PADDING, y: uploadSkinY, width: CHIP_WIDTH, height: SKIN_BUTTON_HEIGHT },
      "image/*",
      (file) => this.callbacks.onUploadSkin(file),
      (hovering) => this.uploadSkinButton.bg.setFillStyle(hovering ? BUTTON_HOVER_COLOR : BUTTON_COLOR),
    );

    // --- Right "Level Settings" panel ---
    scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, RIGHT_TITLE_Y, "Level Settings", { fontSize: "13px", color: "#8b8bb0", fontStyle: "bold" })
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);

    let rowY = RIGHT_ROWS_START_Y;

    // Clicking cycles to the next background in the small static pool,
    // wrapping around; the label always names whichever one is currently
    // showing.
    this.backgroundButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      this.backgroundLabelText(initialBackgroundLabel),
      () => this.callbacks.onCycleBackground(),
    );
    this.wireHoverStyles(this.backgroundButton.bg);
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Upload BG: rendered like every other panel button, but a real,
    // invisible HTML file input sits on top of it (see FileInputOverlay
    // for why) rather than this button opening a picker itself — a
    // one-way action, not part of the "BG: ▶" cycle. The button's own
    // pointerdown never actually fires from a real click (the overlay
    // catches it first); FileInputOverlay's hover callback drives this
    // button's highlight instead.
    const uploadBgButton = this.makeFixedWidthButton(RIGHT_PANEL_X + PANEL_PADDING, rowY, RIGHT_BUTTON_WIDTH, RIGHT_BUTTON_HEIGHT, "Upload BG", () => {});
    new FileInputOverlay(
      scene,
      { x: RIGHT_PANEL_X + PANEL_PADDING, y: rowY, width: RIGHT_BUTTON_WIDTH, height: RIGHT_BUTTON_HEIGHT },
      "image/*",
      (file) => this.callbacks.onUploadBackground(file),
      (hovering) => uploadBgButton.bg.setFillStyle(hovering ? BUTTON_HOVER_COLOR : BUTTON_COLOR),
    );
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Music: <name/None> — clicking it clears the level's music if one is
    // set (a no-op, via EditorScene's own guard, if none is); there's no
    // pool to cycle through the way there is for backgrounds, just "has
    // one" or "doesn't".
    this.musicButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      this.musicLabelText(initialMusicLabel),
      () => this.callbacks.onClearMusic(),
    );
    this.wireHoverStyles(this.musicButton.bg);
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Upload Music: same real-file-input-overlay trick as Upload BG.
    const uploadMusicButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      "Upload Music",
      () => {},
    );
    new FileInputOverlay(
      scene,
      { x: RIGHT_PANEL_X + PANEL_PADDING, y: rowY, width: RIGHT_BUTTON_WIDTH, height: RIGHT_BUTTON_HEIGHT },
      "audio/*",
      (file) => this.callbacks.onUploadMusic(file),
      (hovering) => uploadMusicButton.bg.setFillStyle(hovering ? BUTTON_HOVER_COLOR : BUTTON_COLOR),
    );
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Clear: two-tap arm/confirm rather than a native confirm() popup, to
    // stay visually consistent with the rest of this UI — see
    // CLEAR_ARM_TIMEOUT_MS and armClear/disarmClear below.
    this.clearButton = this.makeFixedWidthButton(RIGHT_PANEL_X + PANEL_PADDING, rowY, RIGHT_BUTTON_WIDTH, RIGHT_BUTTON_HEIGHT, "Clear", () =>
      this.onClearClicked(),
    );
    this.clearButton.bg.on("pointerover", () => this.clearButton.bg.setFillStyle(this.clearArmed ? CLEAR_ARMED_HOVER_COLOR : BUTTON_HOVER_COLOR));
    this.clearButton.bg.on("pointerout", () => this.clearButton.bg.setFillStyle(this.clearArmed ? CLEAR_ARMED_COLOR : BUTTON_COLOR));
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Enemy Size: a placement-time preference (like the palette selection
    // itself), not a property of anything currently selected — it applies
    // whenever an enemy brush is next placed, regardless of which brush
    // happens to be active right now, so unlike Skin there's no "N/A"
    // state to show; all 3 stay clickable and "Medium" starts highlighted
    // to match every enemy's unscaled, pre-this-feature look.
    rowY += 8;
    scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, rowY, "Enemy Size", { fontSize: "13px", color: "#8b8bb0", fontStyle: "bold" })
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

    // --- Footer: read-only stats ---
    scene.add
      .text(FOOTER_LEVEL_SIZE_X, FOOTER_TEXT_Y, `Level: ${initialLevelWidth}×${initialLevelHeight}`, { fontSize: "11px", color: "#8b8bb0" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    this.footerCursorText = scene.add
      .text(FOOTER_CURSOR_X, FOOTER_TEXT_Y, "Cursor: –", { fontSize: "11px", color: "#8b8bb0" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    this.footerEntitiesText = scene.add
      .text(FOOTER_ENTITIES_X, FOOTER_TEXT_Y, `Entities: ${initialEntityCount}`, { fontSize: "11px", color: "#8b8bb0" })
      .setOrigin(0, 0.5)
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
      this.renderIconGrid();
    } else {
      this.updateSelectedOutlinePosition();
    }
    this.chipButton.label.setText(this.chipLabel());
  }

  /** Icon center (x, y) for each brush in the active category, laid out
   * into a 2-column grid. A `groupEnd` brush (see Palette.ts) still ends
   * its cluster like it did in the old single-row layout, but here that
   * means "force the next brush to start a new row" rather than "add a
   * horizontal gap" — so the Blocks category's ground-skin/block-kind/
   * hazard clusters still read as visually separate groups, just stacked
   * instead of spread sideways. renderIconGrid and
   * updateSelectedOutlinePosition both need this same layout, so it's
   * computed once here rather than twice. */
  private iconPositions(brushes: Brush[]): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    let col = 0;
    let row = 0;
    for (const brush of brushes) {
      positions.push({ x: ICON_COL_X[col], y: ICON_GRID_START_Y + row * ICON_ROW_HEIGHT });
      if (brush.groupEnd) {
        col = 0;
        row += 1;
      } else if (col === ICON_COLS - 1) {
        col = 0;
        row += 1;
      } else {
        col += 1;
      }
    }
    return positions;
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
    const brushes = PALETTE.filter((brush) => brush.category === this.activeCategory);
    const positions = this.iconPositions(brushes);
    brushes.forEach((brush, i) => {
      const { x, y } = positions[i];
      const icon = this.scene.add.image(x, y, this.textureKeyFor(brush)).setDepth(CONTENT_DEPTH).setInteractive({ useHandCursor: true });
      fitWithinTile(icon);
      icon.on("pointerdown", () => this.selectBrush(brush));
      const label = this.scene.add
        .text(x, y + TILE_SIZE / 2 + 2, brush.label, { fontSize: "9px", color: "#eeeeee" })
        .setOrigin(0.5, 0)
        .setDepth(CONTENT_DEPTH);
      this.iconGrid.add([icon, label]);
    });
    this.updateSelectedOutlinePosition();
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
    const brushes = PALETTE.filter((brush) => brush.category === this.activeCategory);
    const index = brushes.findIndex((brush) => brush.id === this.selectedBrushId);
    if (index === -1) {
      this.selectedOutline.setVisible(false);
      return;
    }
    const { x, y } = this.iconPositions(brushes)[index];
    this.selectedOutline.setPosition(x, y).setVisible(true);
  }

  selectBrush(brush: Brush): void {
    this.selectedBrushId = brush.id;
    this.updateSelectedOutlinePosition();
    this.refreshSkinButtons();
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
      button.bg.setFillStyle(id === this.currentSize ? BUTTON_HOVER_COLOR : BUTTON_COLOR);
    }
  }

  private backgroundLabelText(label: string): string {
    return `BG: ${label} ▶`;
  }

  /** Called by EditorScene right after cycling — the button's own text is
   * the only place the current background is displayed. Fixed-width, so
   * this never needs to reposition anything else on the panel. */
  setBackgroundLabel(label: string): void {
    this.backgroundButton.label.setText(this.backgroundLabelText(label));
  }

  private musicLabelText(name: string | null): string {
    return `Music: ${name ?? "None"}`;
  }

  /** Called by EditorScene after an upload or a clear — `name` is the
   * uploaded file's own name (LevelData.customMusicName), or `null` when
   * the level has no music. */
  setMusicLabel(name: string | null): void {
    this.musicButton.label.setText(this.musicLabelText(name));
  }

  private selectedBrush(): Brush | undefined {
    return PALETTE.find((brush) => brush.id === this.selectedBrushId);
  }

  /** Only Markers/Enemies/Items/Decor's real placeable brushes are
   * skinnable. Blocks render through Phaser's tilemap system (a shared,
   * GID-indexed spritesheet per ground skin — see groundAutotile.ts)
   * rather than one swappable image per brush the way every entity does,
   * so reskinning them isn't a "just upload an image" change and isn't
   * supported here. */
  private isSkinnable(brush: Brush): boolean {
    return brush.entityType !== undefined;
  }

  private skinStatusLabel(): string {
    const brush = this.selectedBrush();
    if (!brush || !this.isSkinnable(brush)) return "Skin: N/A";
    return this.skinTextureKeys.has(brush.id) ? "Skin: Custom (tap to clear)" : "Skin: Default";
  }

  private uploadSkinLabel(): string {
    const brush = this.selectedBrush();
    if (!brush || !this.isSkinnable(brush)) return "Upload Skin";
    return `Upload Skin: ${brush.label}`;
  }

  private refreshSkinButtons(): void {
    this.skinButton.label.setText(this.skinStatusLabel());
    this.uploadSkinButton.label.setText(this.uploadSkinLabel());
  }

  /** Called by EditorScene once its async skin-resolution pass (see
   * skinLoader.ts) finishes — re-renders the icon grid so every skinned
   * brush's icon picks up its custom texture, and refreshes the Skin/
   * Upload Skin button labels for whichever brush is currently selected. */
  applySkins(skinTextureKeys: Map<string, string>): void {
    this.skinTextureKeys = skinTextureKeys;
    this.renderIconGrid();
    this.refreshSkinButtons();
  }
}
