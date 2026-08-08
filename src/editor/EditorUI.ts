import Phaser from "phaser";
import { GRID_ROWS, TILE_SIZE, TOOLBAR_HEIGHT } from "../config/gameConfig";
import { Brush, PALETTE } from "./Palette";

export interface EditorUICallbacks {
  onSelectBrush: (brush: Brush) => void;
  onTestPlay: () => void;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOLBAR_Y = GRID_ROWS * TILE_SIZE;
const PALETTE_START_X = 16;
const PALETTE_ICON_SPACING = TILE_SIZE + 14;
const BUTTON_GAP = 8;

export class EditorUI {
  private selectedOutline: Phaser.GameObjects.Image;
  private statusText: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: EditorUICallbacks,
  ) {
    const bg = scene.add.rectangle(0, TOOLBAR_Y, scene.scale.width, TOOLBAR_HEIGHT, 0x16213e);
    bg.setOrigin(0, 0);
    bg.setDepth(20);

    PALETTE.forEach((brush, i) => {
      const cx = PALETTE_START_X + i * PALETTE_ICON_SPACING + TILE_SIZE / 2;
      const cy = TOOLBAR_Y + 22;
      const icon = scene.add.image(cx, cy, brush.textureKey).setDepth(21).setInteractive({ useHandCursor: true });
      icon.on("pointerdown", () => this.selectBrush(brush));
      scene.add
        .text(cx, cy + 20, brush.label, { fontSize: "10px", color: "#eeeeee" })
        .setOrigin(0.5, 0)
        .setDepth(21);
    });

    this.selectedOutline = scene.add
      .image(PALETTE_START_X + TILE_SIZE / 2, TOOLBAR_Y + 22, "selected-outline")
      .setDepth(22);

    let buttonX = PALETTE_START_X + PALETTE.length * PALETTE_ICON_SPACING + 20;
    const addButton = (label: string, onClick: () => void) => {
      const button = this.makeButton(buttonX, label, onClick);
      buttonX += button.width + BUTTON_GAP;
    };
    addButton("Test Play (Space)", () => this.callbacks.onTestPlay());
    addButton("Save", () => this.callbacks.onSave());
    addButton("Load", () => this.callbacks.onLoad());
    addButton("Clear", () => this.callbacks.onClear());
    addButton("Undo (Ctrl+Z)", () => this.callbacks.onUndo());
    addButton("Redo (Ctrl+Y)", () => this.callbacks.onRedo());

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

  private makeButton(x: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.scene.add
      .text(x, TOOLBAR_Y + 22, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
  }

  selectBrush(brush: Brush): void {
    const index = PALETTE.findIndex((b) => b.id === brush.id);
    const cx = PALETTE_START_X + index * PALETTE_ICON_SPACING + TILE_SIZE / 2;
    this.selectedOutline.setPosition(cx, TOOLBAR_Y + 22);
    this.callbacks.onSelectBrush(brush);
  }

  setStatus(message: string): void {
    this.statusText.setText(message);
    this.scene.time.delayedCall(2500, () => {
      if (this.statusText.text === message) this.statusText.setText("");
    });
  }
}
