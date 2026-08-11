import Phaser from "phaser";
import { GRID_ROWS, TILE_SIZE, TOOLBAR_HEIGHT } from "../config/gameConfig";
import { groundIconKey, LevelTheme } from "../level/themes";
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
}

const TOOLBAR_Y = GRID_ROWS * TILE_SIZE;
const ROW1_Y = TOOLBAR_Y + 15; // category tabs + action buttons
const ICON_ROW_Y = TOOLBAR_Y + 52; // the active category's brushes
const PALETTE_START_X = 16;
const PALETTE_ICON_SPACING = TILE_SIZE + 14;
const BUTTON_GAP = 8;

/** The palette used to be one flat, ever-widening row of every brush at
 * once. Now it's tabbed by BrushCategory (Blocks/Markers/Enemies/Items):
 * one row of small category buttons, and below it only the brushes for
 * whichever category is active — the icon row stays a manageable width no
 * matter how many items get added to any one category later. */
export class EditorUI {
  private selectedOutline: Phaser.GameObjects.Image;
  private statusText: Phaser.GameObjects.Text;
  private iconRow: Phaser.GameObjects.Container;
  private tabButtons = new Map<BrushCategory, Phaser.GameObjects.Text>();
  private activeCategory: BrushCategory;
  private selectedBrushId: string;
  private backgroundButton!: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: LevelTheme,
    initialBackgroundLabel: string,
    private readonly callbacks: EditorUICallbacks,
  ) {
    this.activeCategory = PALETTE[0].category;
    this.selectedBrushId = PALETTE[0].id;

    const bg = scene.add.rectangle(0, TOOLBAR_Y, scene.scale.width, TOOLBAR_HEIGHT, 0x16213e);
    bg.setOrigin(0, 0);
    bg.setDepth(20);

    let tabX = PALETTE_START_X;
    for (const category of CATEGORIES) {
      const button = this.makeRowButton(tabX, ROW1_Y, category.label, () => this.setActiveCategory(category.id));
      button.on("pointerover", () => button.setStyle({ backgroundColor: "#3a5a9c" }));
      button.on("pointerout", () => this.refreshTabStyles());
      this.tabButtons.set(category.id, button);
      tabX += button.width + BUTTON_GAP;
    }
    this.refreshTabStyles();

    let buttonX = tabX + 20;
    const addActionButton = (label: string, onClick: () => void) => {
      const button = this.makeRowButton(buttonX, ROW1_Y, label, onClick);
      button.on("pointerover", () => button.setStyle({ backgroundColor: "#3a5a9c" }));
      button.on("pointerout", () => button.setStyle({ backgroundColor: "#0f3460" }));
      buttonX += button.width + BUTTON_GAP;
    };
    addActionButton("Test Play (Space)", () => this.callbacks.onTestPlay());
    addActionButton("Save", () => this.callbacks.onSave());
    addActionButton("Menu", () => this.callbacks.onMenu());
    addActionButton("Clear", () => this.callbacks.onClear());
    addActionButton("Undo (Ctrl+Z)", () => this.callbacks.onUndo());
    addActionButton("Redo (Ctrl+Y)", () => this.callbacks.onRedo());

    // Independent of theme (see level/backgrounds.ts) — clicking cycles to
    // the next parallax scene in the pool, wrapping around; the label
    // always names whichever scene is currently showing.
    this.backgroundButton = this.makeRowButton(buttonX, ROW1_Y, this.backgroundLabelText(initialBackgroundLabel), () =>
      this.callbacks.onCycleBackground(),
    );
    this.backgroundButton.on("pointerover", () => this.backgroundButton.setStyle({ backgroundColor: "#3a5a9c" }));
    this.backgroundButton.on("pointerout", () => this.backgroundButton.setStyle({ backgroundColor: "#0f3460" }));

    // A Container is one entry in the scene's display list — its own depth
    // (not its children's) decides where it sits relative to siblings like
    // the toolbar background rectangle below, so it must be set explicitly
    // or the whole row renders behind that opaque bg and never appears.
    this.iconRow = scene.add.container(0, 0).setDepth(21);
    this.selectedOutline = scene.add.image(-100, -100, "selected-outline").setDepth(22);
    this.renderIconRow();

    this.statusText = scene.add
      .text(scene.scale.width / 2, 8, "", {
        fontSize: "13px",
        color: "#ffeb3b",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(25);
  }

  private makeRowButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.scene.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    return text;
  }

  private setActiveCategory(category: BrushCategory): void {
    if (category === this.activeCategory) return;
    this.activeCategory = category;
    this.renderIconRow();
    this.refreshTabStyles();
  }

  /** Tab buttons restyle on both selection and hover-out (rather than a
   * plain pointerout reset) so the active tab stays visibly highlighted
   * even after the pointer leaves it — a tab is a persistent state, not a
   * momentary hover. */
  private refreshTabStyles(): void {
    for (const [id, button] of this.tabButtons) {
      button.setStyle({ backgroundColor: id === this.activeCategory ? "#3a5a9c" : "#0f3460" });
    }
  }

  private renderIconRow(): void {
    this.iconRow.removeAll(true);
    const brushes = PALETTE.filter((brush) => brush.category === this.activeCategory);
    brushes.forEach((brush, i) => {
      const cx = PALETTE_START_X + i * PALETTE_ICON_SPACING + TILE_SIZE / 2;
      // The Ground brush's icon reflects the level's own theme rather than
      // a fixed texture, so the palette always matches what painting
      // Ground actually looks like in this level.
      const textureKey = brush.id === "ground" ? groundIconKey(this.theme) : brush.textureKey;
      const icon = this.scene.add.image(cx, ICON_ROW_Y, textureKey).setDepth(21).setInteractive({ useHandCursor: true });
      fitWithinTile(icon);
      icon.on("pointerdown", () => this.selectBrush(brush));
      const label = this.scene.add
        .text(cx, ICON_ROW_Y + 20, brush.label, { fontSize: "10px", color: "#eeeeee" })
        .setOrigin(0.5, 0)
        .setDepth(21);
      this.iconRow.add([icon, label]);
    });
    this.updateSelectedOutlinePosition();
  }

  /** Hidden when the selected brush belongs to a category that isn't
   * currently showing — there's nothing in the visible row to outline,
   * but the selection itself is untouched (switching back shows it again). */
  private updateSelectedOutlinePosition(): void {
    const brushes = PALETTE.filter((brush) => brush.category === this.activeCategory);
    const index = brushes.findIndex((brush) => brush.id === this.selectedBrushId);
    if (index === -1) {
      this.selectedOutline.setVisible(false);
      return;
    }
    const cx = PALETTE_START_X + index * PALETTE_ICON_SPACING + TILE_SIZE / 2;
    this.selectedOutline.setPosition(cx, ICON_ROW_Y).setVisible(true);
  }

  selectBrush(brush: Brush): void {
    this.selectedBrushId = brush.id;
    this.updateSelectedOutlinePosition();
    this.callbacks.onSelectBrush(brush);
  }

  private backgroundLabelText(label: string): string {
    return `Background: ${label} ▶`;
  }

  /** Called by EditorScene right after cycling — the button's own text is
   * the only place the current background scene is displayed. */
  setBackgroundLabel(label: string): void {
    this.backgroundButton.setText(this.backgroundLabelText(label));
  }

  setStatus(message: string): void {
    this.statusText.setText(message);
    this.scene.time.delayedCall(2500, () => {
      if (this.statusText.text === message) this.statusText.setText("");
    });
  }
}
