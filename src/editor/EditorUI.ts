import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRID_ORIGIN_X, GRID_ROWS, LEFT_PANEL_WIDTH, RIGHT_PANEL_WIDTH, TILE_SIZE } from "../config/gameConfig";
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
}

const PANEL_DEPTH = 20;
const CONTENT_DEPTH = 21;
const OUTLINE_DEPTH = 22;
const STATUS_DEPTH = 25;

const PANEL_PADDING = 12;

// --- Left "Tools" panel: category tabs stacked above a 2-column palette grid.
const TAB_HEIGHT = 30;
const TAB_GAP = 4;
const TABS_START_Y = 16;

const ICON_COLS = 2;
const ICON_COL_X = [PANEL_PADDING + 42, PANEL_PADDING + 42 + 80]; // two column centers, 80px apart
const ICON_ROW_HEIGHT = 54; // icon + label + breathing room
const ICON_GRID_START_Y = TABS_START_Y + CATEGORIES.length * (TAB_HEIGHT + TAB_GAP) + 24;

// --- Right "Actions" panel: fixed-width buttons stacked top to bottom.
const RIGHT_BUTTON_WIDTH = RIGHT_PANEL_WIDTH - PANEL_PADDING * 2;
const RIGHT_BUTTON_HEIGHT = 32;
const RIGHT_BUTTON_GAP = 8;
const RIGHT_PANEL_START_Y = 16;
const RIGHT_PANEL_X = GAME_WIDTH - RIGHT_PANEL_WIDTH;

// --- Level name field: the unused strip below the grid (between the two
// panels, once the canvas grew taller than the grid to fit their content
// — see gameConfig.ts's GAME_HEIGHT comment). Nothing else renders there.
const NAME_ROW_Y = GRID_ROWS * TILE_SIZE + 26;
const NAME_LABEL_X = GRID_ORIGIN_X + 20;
const NAME_INPUT_X = NAME_LABEL_X + 100;
const NAME_INPUT_HEIGHT = 28;
const NAME_INPUT_WIDTH = GAME_WIDTH - RIGHT_PANEL_WIDTH - NAME_INPUT_X - 20;

/**
 * Two docked vertical panels flanking the grid, both opaque and rendered
 * above the background (see PANEL_DEPTH vs StaticBackground's depth -100):
 * a left "Tools" panel (category tabs, then that category's palette as a
 * 2-column icon grid) and a right "Actions" panel (fixed-width stacked
 * buttons, so a longer label never pushes into the next row the way the old
 * single-row toolbar's variable-width buttons could — see the save-status/
 * background-button overlap bug this replaced).
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

export class EditorUI {
  private selectedOutline: Phaser.GameObjects.Image;
  private statusText: Phaser.GameObjects.Text;
  // Persistent, unlike statusText above (which auto-clears after 2.5s and
  // is reused for one-off messages like "Cleared") — always shows whether
  // the level in memory currently matches what's in storage. See
  // EditorScene's `dirty` flag/autosave for what drives it. Occupies its own
  // fixed row in the Actions panel, right after the button stack.
  private saveStatusText: Phaser.GameObjects.Text;
  private backgroundButton!: PanelButton;
  private musicButton!: PanelButton;
  private skinButton!: PanelButton;
  private uploadSkinButton!: PanelButton;
  private iconGrid: Phaser.GameObjects.Container;
  private tabButtons = new Map<BrushCategory, PanelButton>();
  private activeCategory: BrushCategory;
  private selectedBrushId: string;
  // brushId -> texture key for every brush with a custom skin uploaded
  // (see skinLoader.ts) — empty until EditorScene's async resolve pass
  // finishes and calls applySkins, same "pop in a moment later" tolerance
  // as a custom background/music.
  private skinTextureKeys = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    initialBackgroundLabel: string,
    initialMusicLabel: string | null,
    initialLevelName: string,
    private readonly callbacks: EditorUICallbacks,
  ) {
    this.activeCategory = PALETTE[0].category;
    this.selectedBrushId = PALETTE[0].id;

    scene.add.rectangle(0, 0, LEFT_PANEL_WIDTH, GAME_HEIGHT, 0x16213e).setOrigin(0, 0).setDepth(PANEL_DEPTH);
    scene.add.rectangle(RIGHT_PANEL_X, 0, RIGHT_PANEL_WIDTH, GAME_HEIGHT, 0x16213e).setOrigin(0, 0).setDepth(PANEL_DEPTH);

    // Category tabs, stacked top to bottom, each spanning the panel's full
    // content width so they read as one clear vertical list.
    CATEGORIES.forEach((category, i) => {
      const y = TABS_START_Y + i * (TAB_HEIGHT + TAB_GAP);
      const button = this.makeFixedWidthButton(
        PANEL_PADDING,
        y,
        LEFT_PANEL_WIDTH - PANEL_PADDING * 2,
        TAB_HEIGHT,
        category.label,
        () => this.setActiveCategory(category.id),
      );
      button.bg.on("pointerover", () => button.bg.setFillStyle(BUTTON_HOVER_COLOR));
      button.bg.on("pointerout", () => this.refreshTabStyles());
      this.tabButtons.set(category.id, button);
    });
    this.refreshTabStyles();

    this.iconGrid = scene.add.container(0, 0).setDepth(CONTENT_DEPTH);
    this.selectedOutline = scene.add.image(-100, -100, "selected-outline").setDepth(OUTLINE_DEPTH);
    this.renderIconGrid();

    // Right panel: one fixed-width button per row.
    let rowY = RIGHT_PANEL_START_Y;
    const addActionButton = (label: string, onClick: () => void) => {
      const button = this.makeFixedWidthButton(RIGHT_PANEL_X + PANEL_PADDING, rowY, RIGHT_BUTTON_WIDTH, RIGHT_BUTTON_HEIGHT, label, onClick);
      button.bg.on("pointerover", () => button.bg.setFillStyle(BUTTON_HOVER_COLOR));
      button.bg.on("pointerout", () => button.bg.setFillStyle(BUTTON_COLOR));
      rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;
    };
    addActionButton("Test Play (Space)", () => this.callbacks.onTestPlay());
    addActionButton("Save", () => this.callbacks.onSave());
    addActionButton("Menu", () => this.callbacks.onMenu());
    addActionButton("Clear", () => this.callbacks.onClear());
    addActionButton("Undo (Ctrl+Z)", () => this.callbacks.onUndo());
    addActionButton("Redo (Ctrl+Y)", () => this.callbacks.onRedo());

    // Clicking cycles to the next background in the small static pool,
    // wrapping around; the label always names whichever one is currently
    // showing. Same fixed width as every other Actions button — no more
    // reflow-on-cycle, since the button doesn't grow with the label.
    this.backgroundButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      this.backgroundLabelText(initialBackgroundLabel),
      () => this.callbacks.onCycleBackground(),
    );
    this.backgroundButton.bg.on("pointerover", () => this.backgroundButton.bg.setFillStyle(BUTTON_HOVER_COLOR));
    this.backgroundButton.bg.on("pointerout", () => this.backgroundButton.bg.setFillStyle(BUTTON_COLOR));
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Upload BG: rendered like every other Actions button, but a real,
    // invisible HTML file input sits on top of it (see FileInputOverlay
    // for why) rather than this button opening a picker itself — a
    // one-way action, not part of the "BG: ▶" cycle (see
    // staticBackgrounds.ts's nextStaticBackgroundId docstring). The
    // button's own pointerdown never actually fires from a real click
    // (the overlay catches it first); FileInputOverlay's hover
    // callback drives this button's highlight instead.
    const uploadBgButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      "Upload BG",
      () => {},
    );
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
    this.musicButton.bg.on("pointerover", () => this.musicButton.bg.setFillStyle(BUTTON_HOVER_COLOR));
    this.musicButton.bg.on("pointerout", () => this.musicButton.bg.setFillStyle(BUTTON_COLOR));
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

    // Skin: reskins whichever brush is currently selected in the palette
    // (see "Custom skins" under Art) — the selection itself doubles as
    // "which type", so there's no separate type-picker UI. Clicking the
    // status button clears an existing custom skin (same pattern as the
    // Music button above); Upload Skin (with its own file-input overlay)
    // sets one. Both labels are refreshed on every brush selection change
    // (see selectBrush) and after applySkins, since which brush is
    // selected — not anything level-specific — decides what they show.
    this.skinButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      this.skinStatusLabel(),
      () => this.callbacks.onClearSkin(),
    );
    this.skinButton.bg.on("pointerover", () => this.skinButton.bg.setFillStyle(BUTTON_HOVER_COLOR));
    this.skinButton.bg.on("pointerout", () => this.skinButton.bg.setFillStyle(BUTTON_COLOR));
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    this.uploadSkinButton = this.makeFixedWidthButton(
      RIGHT_PANEL_X + PANEL_PADDING,
      rowY,
      RIGHT_BUTTON_WIDTH,
      RIGHT_BUTTON_HEIGHT,
      this.uploadSkinLabel(),
      () => {},
    );
    new FileInputOverlay(
      scene,
      { x: RIGHT_PANEL_X + PANEL_PADDING, y: rowY, width: RIGHT_BUTTON_WIDTH, height: RIGHT_BUTTON_HEIGHT },
      "image/*",
      (file) => this.callbacks.onUploadSkin(file),
      (hovering) => this.uploadSkinButton.bg.setFillStyle(hovering ? BUTTON_HOVER_COLOR : BUTTON_COLOR),
    );
    rowY += RIGHT_BUTTON_HEIGHT + RIGHT_BUTTON_GAP;

    // Plain text, not a button (no interactivity, no hover/click) — this is
    // a status readout, not an action. Starts "saved" since a level with no
    // edits yet has nothing at risk, regardless of whether it's a freshly
    // loaded save or a brand-new blank one; the first edit flips it. Its own
    // fixed row below the button stack, so it never overlaps a button label.
    this.saveStatusText = scene.add
      .text(RIGHT_PANEL_X + PANEL_PADDING, rowY, SAVE_STATE_DISPLAY.saved.text, {
        fontSize: "13px",
        color: SAVE_STATE_DISPLAY.saved.color,
      })
      .setOrigin(0, 0)
      .setDepth(CONTENT_DEPTH);

    this.statusText = scene.add
      .text(GAME_WIDTH / 2, 8, "", {
        fontSize: "13px",
        color: "#ffeb3b",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(STATUS_DEPTH);

    // Level name: a real DOM text input (see LevelNameInput — Phaser has no
    // native text-entry widget), sitting in the otherwise-empty strip below
    // the grid between the two panels.
    scene.add
      .text(NAME_LABEL_X, NAME_ROW_Y + NAME_INPUT_HEIGHT / 2, "Level Name:", { fontSize: "13px", color: "#c8c8e0" })
      .setOrigin(0, 0.5)
      .setDepth(CONTENT_DEPTH);
    new LevelNameInput(
      scene,
      { x: NAME_INPUT_X, y: NAME_ROW_Y, width: NAME_INPUT_WIDTH, height: NAME_INPUT_HEIGHT },
      initialLevelName,
      (name) => this.callbacks.onRenameLevel(name),
    );
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

  private setActiveCategory(category: BrushCategory): void {
    if (category === this.activeCategory) return;
    this.activeCategory = category;
    this.renderIconGrid();
    this.refreshTabStyles();
  }

  /** Tab buttons restyle on both selection and hover-out (rather than a
   * plain pointerout reset) so the active tab stays visibly highlighted
   * even after the pointer leaves it — a tab is a persistent state, not a
   * momentary hover. */
  private refreshTabStyles(): void {
    for (const [id, button] of this.tabButtons) {
      button.bg.setFillStyle(id === this.activeCategory ? BUTTON_HOVER_COLOR : BUTTON_COLOR);
    }
  }

  /** Icon center (x, y) for each brush in the active category, laid out
   * into a 2-column grid. A `groupEnd` brush (see Palette.ts) still ends
   * its cluster like it did in the old single-row layout, but here that
   * means "force the next brush to start a new row" rather than "add a
   * horizontal gap" — so the Blocks category's ground-skin/block-kind/
   * hazard/erase clusters still read as visually separate groups, just
   * stacked instead of spread sideways. renderIconGrid and
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
   * currently showing — there's nothing in the visible grid to outline,
   * but the selection itself is untouched (switching back shows it again). */
  private updateSelectedOutlinePosition(): void {
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

  private backgroundLabelText(label: string): string {
    return `BG: ${label} ▶`;
  }

  /** Called by EditorScene right after cycling — the button's own text is
   * the only place the current background is displayed. Fixed-width, so
   * unlike the old toolbar's version this never needs to reposition
   * anything else on the panel. */
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
   * skinnable — the same `entityType !== undefined` check EditorScene
   * uses to route clicks, which happens to also exclude every category's
   * own Erase brush (kind "entity" but no entityType) for free. Blocks
   * render through Phaser's tilemap system (a shared, GID-indexed
   * spritesheet per ground skin — see groundAutotile.ts) rather than one
   * swappable image per brush the way every entity does, so reskinning
   * them isn't a "just upload an image" change and isn't supported here. */
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
