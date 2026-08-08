import Phaser from "phaser";
import { GRID_ROWS, TILE_SIZE, TOOLBAR_HEIGHT } from "../config/gameConfig";
import { Brush, PALETTE } from "./Palette";

export interface EditorUICallbacks {
  onSelectBrush: (brush: Brush) => void;
  onTestPlay: () => void;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
}

const TOOLBAR_Y = GRID_ROWS * TILE_SIZE;

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

    let x = 16;
    PALETTE.forEach((brush, i) => {
      const cx = x + TILE_SIZE / 2;
      const cy = TOOLBAR_Y + 22;
      const icon = scene.add.image(cx, cy, brush.textureKey).setDepth(21).setInteractive({ useHandCursor: true });
      icon.on("pointerdown", () => this.selectBrush(brush));
      scene.add
        .text(cx, cy + 20, brush.label, { fontSize: "10px", color: "#eeeeee" })
        .setOrigin(0.5, 0)
        .setDepth(21);
      x += TILE_SIZE + 14;
      if (i === 0) this.firstBrushX = cx;
    });

    this.selectedOutline = scene.add.image(this.firstBrushX, TOOLBAR_Y + 22, "selected-outline").setDepth(22);

    const buttonsStartX = x + 24;
    this.makeButton(buttonsStartX, "Test Play (Space)", () => this.callbacks.onTestPlay());
    this.makeButton(buttonsStartX + 150, "Save", () => this.callbacks.onSave());
    this.makeButton(buttonsStartX + 220, "Load", () => this.callbacks.onLoad());
    this.makeButton(buttonsStartX + 290, "Clear", () => this.callbacks.onClear());

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

  private firstBrushX = 0;

  private makeButton(x: number, label: string, onClick: () => void): void {
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
  }

  selectBrush(brush: Brush): void {
    const index = PALETTE.findIndex((b) => b.id === brush.id);
    const cx = 16 + TILE_SIZE / 2 + index * (TILE_SIZE + 14);
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
