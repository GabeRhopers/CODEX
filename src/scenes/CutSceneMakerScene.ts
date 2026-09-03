import Phaser from "phaser";
import { BackgroundThumbnail, resolveBackgroundThumbnails } from "../backgrounds/backgroundLibraryLoader";
import { addBackgroundAsset, removeBackgroundAsset } from "../backgrounds/backgroundLibraryStorage";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { AssetPickerItem, AssetPickerMenu } from "../editor/AssetPickerMenu";
import { readAndDownscaleImage } from "../editor/customBackgroundUpload";
import { ParagraphInput } from "../editor/ParagraphInput";
import {
  addPanel,
  CutScene,
  emptyCutScene,
  movePanel,
  panelHasContent,
  removePanel,
  updatePanel,
} from "../game/CutScene";
import { createEmptyGame, GameData } from "../game/GameSchema";
import { saveGame } from "../game/gameStorage";
import { loadActiveProfile } from "../profile/Profile";
import { ConfirmButton } from "../ui/confirmButton";

/**
 * Writing a cut scene: the panels, and what each one shows.
 *
 * **One panel at a time**, chosen from a strip of chips along the top — the
 * Thing Maker's shape, and for the same reason. A row-per-panel list would need
 * its own picture picker and its own paragraph field on every row, and the
 * dropdown from one would open over the next; editing one panel at a time needs
 * exactly one of each, and buys a preview big enough to actually judge.
 *
 * Owns no rules. What a panel is, what makes one worth showing, and what moving
 * one means all live in `game/CutScene.ts`, pure and tested without Phaser —
 * the same split the Game Maker has with `GameSchema.ts`.
 *
 * **Pictures come from the shared background library**, the same pool *Upload
 * BG* fills, through the same `AssetPickerMenu` and the same
 * upload/downscale/store path. A cut scene adds no asset store of its own; what
 * it adds is that the collector must now walk these references too, or a
 * published game's opening would be blank.
 */

const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
const MUTED = "#a6a6c8";
const PANEL_FILL = 0x0f1830;
const STATUS_COLORS = { good: "#8fd694", warn: "#ffc93c", bad: "#ff9d9d" } as const;

/** Not a real library id — those are `crypto.randomUUID()` — so a genuine
 * upload can never collide with it. The same sentinel trick EditorUI's own
 * pickers use for their built-in options. */
const NO_PICTURE_ID = "no-picture";

const CHIP_Y = 80;
const CHIP_SIZE = 30;
const CHIP_GAP = 7;
const CHIP_X = 24;

const PREVIEW = { x: 24, y: 124, width: 500, height: 224 };
const RIGHT_X = 548;
const RIGHT_WIDTH = GAME_WIDTH - RIGHT_X - 24;
const PICKER = { x: RIGHT_X, y: 124, width: 240, height: 32 };
// Measured against what each control actually occupies, not eyeballed: the
// first spacing tried put the "Words" label underneath the picture picker.
const WORDS_LABEL_Y = 176;
const WORDS_RECT = { x: RIGHT_X, y: 188, width: RIGHT_WIDTH, height: 110 };
const PANEL_TOOLS_Y = 322;
const ACTIONS_Y = GAME_HEIGHT - 24;
const STATUS_Y = GAME_HEIGHT - 62;

/** Which of the game's two cut scenes this screen is editing. */
export type CutSceneSlot = "opening" | "closing";

interface CutSceneMakerSceneData {
  game?: GameData;
  slot?: CutSceneSlot;
}

export class CutSceneMakerScene extends Phaser.Scene {
  private gameDoc: GameData = createEmptyGame("");
  private slot: CutSceneSlot = "opening";
  private cutScene: CutScene = emptyCutScene();
  private selected = 0;
  private status = "";
  private statusTone: "good" | "warn" | "bad" = "good";
  private thumbnails: BackgroundThumbnail[] = [];
  private wordsInput?: ParagraphInput;
  private picker?: AssetPickerMenu;

  constructor() {
    super("CutSceneMaker");
  }

  init(data?: CutSceneMakerSceneData): void {
    // The Game Maker saves before it starts this scene, so what arrives is what
    // is stored — the same hand-over the Publish screen gets.
    if (data?.game) this.gameDoc = data.game;
    this.slot = data?.slot ?? "opening";
    this.cutScene = this.gameDoc[this.slot] ?? emptyCutScene();
    this.selected = 0;
    this.status = "";
    this.statusTone = "good";
  }

  create(): void {
    this.rebuild();
  }

  private get panelCount(): number {
    return this.cutScene.panels.length;
  }

  private rebuild(): void {
    // DOM overlays are not Phaser children, so they are torn down explicitly or
    // they float over whatever is drawn next — the same care the Game Maker and
    // Skin Creator take with theirs.
    this.wordsInput?.destroy();
    this.wordsInput = undefined;
    this.picker = undefined;
    for (const child of [...this.children.list]) child.destroy();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e).setOrigin(0, 0);
    this.drawHeader();
    this.drawChips();
    if (this.panelCount === 0) {
      this.drawEmpty();
    } else {
      this.selected = Math.min(this.selected, this.panelCount - 1);
      this.drawPreview();
      this.drawPictureRow();
      this.drawWordsField();
      this.drawPanelTools();
    }
    this.drawActions();
  }

  // --- chrome --------------------------------------------------------------

  private makeButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: BUTTON_HEX,
        // Tall enough to aim at on a phone held sideways — see ui/touchTarget.ts.
        padding: { x: 10, y: 10 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: BUTTON_HOVER_HEX }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: BUTTON_HEX }));
    return text;
  }

  private drawHeader(): void {
    this.add
      .text(24, 20, "← Back", { fontSize: "14px", color: "#ffffff", backgroundColor: BUTTON_HEX, padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => void this.saveAndLeave());
    const which = this.slot === "opening" ? "Opening" : "Closing";
    this.add.text(GAME_WIDTH / 2, 20, `${which} cut scene`, { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);
    const when =
      this.slot === "opening"
        ? "Shown when someone presses Play, before the first world."
        : "Shown after the last world, just before the ending.";
    this.add.text(GAME_WIDTH / 2, 46, when, { fontSize: "12px", color: MUTED }).setOrigin(0.5, 0);
  }

  /** The strip of panels, and the button that adds one. Chips rather than a
   * paged list: a cut scene is a handful of panels, and seeing all of them at
   * once is most of what tells you whether the order reads right. */
  private drawChips(): void {
    let x = CHIP_X;
    for (let i = 0; i < this.panelCount; i += 1) {
      const isSelected = i === this.selected;
      const filled = panelHasContent(this.cutScene.panels[i]);
      const chip = this.add
        .rectangle(x, CHIP_Y, CHIP_SIZE, CHIP_SIZE, isSelected ? 0x3a5a9c : PANEL_FILL)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      // A hollow outline marks a panel with nothing in it yet — the thing that
      // would silently not play, said before you press Preview.
      chip.setStrokeStyle(1, filled ? 0x8fd694 : 0x66668a);
      chip.on("pointerdown", () => {
        this.selected = i;
        this.rebuild();
      });
      this.add
        .text(x + CHIP_SIZE / 2, CHIP_Y, String(i + 1), { fontSize: "12px", color: isSelected ? "#ffffff" : MUTED })
        .setOrigin(0.5);
      x += CHIP_SIZE + CHIP_GAP;
    }
    this.makeButton(x + 4, CHIP_Y, "+ Add panel", () => {
      this.cutScene = addPanel(this.cutScene);
      this.selected = this.panelCount - 1;
      this.rebuild();
    });
  }

  private drawEmpty(): void {
    this.add.rectangle(PREVIEW.x, PREVIEW.y, GAME_WIDTH - 48, PREVIEW.height, PANEL_FILL).setOrigin(0, 0);
    this.add
      .text(
        GAME_WIDTH / 2,
        PREVIEW.y + PREVIEW.height / 2,
        "No panels yet.\nAdd one, give it a picture or some words, and it plays before the game.",
        { fontSize: "13px", color: MUTED, align: "center", lineSpacing: 6 },
      )
      .setOrigin(0.5);
  }

  // --- the selected panel --------------------------------------------------

  /** What the panel will look like, at a readable size. Cover-fit inside the
   * box, exactly as `CutSceneScene` fits it to the canvas, so what is shown here
   * is what plays rather than an approximation of it. */
  private drawPreview(): void {
    const panel = this.cutScene.panels[this.selected];
    this.add.rectangle(PREVIEW.x, PREVIEW.y, PREVIEW.width, PREVIEW.height, 0x12122a).setOrigin(0, 0);

    const thumb = panel.imageId ? this.thumbnails.find((t) => t.id === panel.imageId) : undefined;
    if (thumb) {
      const image = this.add.image(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height / 2, thumb.textureKey);
      const scale = Math.max(PREVIEW.width / image.width, PREVIEW.height / image.height);
      image.setScale(scale);
      const shape = this.make.graphics({ x: 0, y: 0 }, false);
      shape.fillRect(PREVIEW.x, PREVIEW.y, PREVIEW.width, PREVIEW.height);
      image.setMask(shape.createGeometryMask());
    } else if (panel.imageId) {
      // A picture is chosen but its thumbnail is not resolved yet (the library
      // read happens when the picker first opens) or has been deleted since.
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + 40, "Picture chosen", { fontSize: "12px", color: MUTED })
        .setOrigin(0.5);
    }

    if (panel.words?.trim()) {
      const bandHeight = 74;
      this.add
        .rectangle(PREVIEW.x, PREVIEW.y + PREVIEW.height - bandHeight, PREVIEW.width, bandHeight, 0x0b0b1c, 0.82)
        .setOrigin(0, 0);
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height - bandHeight + 10, panel.words.trim(), {
          fontSize: "11px",
          color: "#eeeeee",
          align: "center",
          lineSpacing: 3,
          wordWrap: { width: PREVIEW.width - 40 },
        })
        .setOrigin(0.5, 0);
    }

    if (!panelHasContent(panel)) {
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height / 2, "This panel is empty,\nso it will not play.", {
          fontSize: "12px",
          color: MUTED,
          align: "center",
          lineSpacing: 5,
        })
        .setOrigin(0.5);
    }
  }

  /** The trigger carries its own label ("Picture: Barn ▾"), so there is no
   * separate caption above it — one less thing to collide with the field below,
   * and the same shape EditorUI's own BG and Music triggers have. */
  private drawPictureRow(): void {
    this.picker = new AssetPickerMenu({
      scene: this,
      trigger: PICKER,
      columns: 3,
      itemSize: 30,
      uploadAccept: "image/*",
      triggerDepth: 10,
      dropdownDepth: 60,
      onToggleOpen: (open) => {
        if (open) this.refreshThumbnails();
      },
      onSelect: (id) => this.choosePicture(id),
      onUploadFile: (file) => void this.uploadPicture(file),
      onDelete: (id) => void this.deletePicture(id),
    });
    // Labelled before the library read returns, so the control never renders as
    // an unexplained empty box while a Drive round trip is in flight.
    this.picker.setTriggerLabel(this.pictureLabel());
    this.refreshThumbnails();
  }

  /** What the picture trigger says. Falls back to "Chosen" for an id whose name
   * is not known yet — the library read has not landed, or the picture was
   * deleted from the library after this panel named it. */
  private pictureLabel(): string {
    const imageId = this.cutScene.panels[this.selected]?.imageId;
    if (!imageId) return "Picture: None ▾";
    const known = this.thumbnails.find((t) => t.id === imageId);
    return `Picture: ${known?.name ?? "Chosen"} ▾`;
  }

  /** Reads the shared library and hands the picker its items — the same
   * open-time read `EditorScene.onBackgroundPickerOpen` does, rather than a read
   * on every redraw of a screen most of whose redraws are a keystroke. */
  private refreshThumbnails(): void {
    void resolveBackgroundThumbnails(this).then((thumbnails) => {
      if (!this.scene.isActive()) return;
      this.thumbnails = thumbnails;
      const chosen = this.cutScene.panels[this.selected]?.imageId ?? NO_PICTURE_ID;
      const items: AssetPickerItem[] = [
        { id: NO_PICTURE_ID, label: "No picture", textureKey: "tile-brick-icon" },
        ...thumbnails.map((t) => ({ id: t.id, label: t.name, textureKey: t.textureKey, deletable: true })),
      ];
      this.picker?.setItems(items, chosen);
      this.picker?.setTriggerLabel(this.pictureLabel());
    });
  }

  private choosePicture(id: string): void {
    this.cutScene = updatePanel(this.cutScene, this.selected, {
      imageId: id === NO_PICTURE_ID ? undefined : id,
    });
    this.rebuild();
  }

  private async uploadPicture(file: File): Promise<void> {
    try {
      const imageData = await readAndDownscaleImage(file);
      const id = await addBackgroundAsset(file.name, imageData, loadActiveProfile() ?? "unknown");
      this.cutScene = updatePanel(this.cutScene, this.selected, { imageId: id });
      this.setStatus("Picture added.", "good");
    } catch {
      this.setStatus("That picture could not be read.", "bad");
    }
    this.rebuild();
  }

  private async deletePicture(id: string): Promise<void> {
    try {
      await removeBackgroundAsset(id);
      this.setStatus("Picture removed from the library.", "good");
    } catch {
      this.setStatus("Could not remove that picture.", "bad");
    }
    this.rebuild();
  }

  private drawWordsField(): void {
    this.add.text(RIGHT_X, WORDS_LABEL_Y, "Words", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
    this.wordsInput = new ParagraphInput(
      this,
      WORDS_RECT,
      this.cutScene.panels[this.selected].words ?? "",
      (value) => {
        this.cutScene = updatePanel(this.cutScene, this.selected, { words: value || undefined });
        this.rebuild();
      },
      { placeholder: "What happens here?" },
    );
  }

  private drawPanelTools(): void {
    let x = RIGHT_X;
    const move = (direction: -1 | 1, label: string): void => {
      this.makeButton(x, PANEL_TOOLS_Y, label, () => {
        const moved = movePanel(this.cutScene, this.selected, direction);
        // The same object back means nothing moved — the end of the list — so
        // there is nothing to redraw either.
        if (moved === this.cutScene) return;
        this.cutScene = moved;
        this.selected += direction;
        this.rebuild();
      });
      x += 44;
    };
    move(-1, "←");
    move(1, "→");

    new ConfirmButton({
      scene: this,
      x: x + 12,
      y: PANEL_TOOLS_Y,
      label: "Remove panel",
      armedLabel: "Really remove?",
      onConfirm: () => {
        this.cutScene = removePanel(this.cutScene, this.selected);
        this.selected = Math.max(0, this.selected - 1);
        this.rebuild();
      },
    });
  }

  // --- saving and leaving --------------------------------------------------

  private setStatus(text: string, tone: "good" | "warn" | "bad"): void {
    this.status = text;
    this.statusTone = tone;
  }

  private drawActions(): void {
    if (this.status) {
      this.add
        .text(24, STATUS_Y, this.status, {
          fontSize: "12px",
          color: STATUS_COLORS[this.statusTone],
          wordWrap: { width: GAME_WIDTH - 48 },
        })
        .setOrigin(0, 0);
    }
    this.makeButton(24, ACTIONS_Y, "Save", () => void this.save());
    this.makeButton(90, ACTIONS_Y, "Preview ▶", () => void this.preview());
  }

  /**
   * Writes the cut scene back onto the game.
   *
   * Safe to do unconditionally because the Game Maker validates and saves before
   * it ever starts this screen — so the document being edited here is already
   * one that passes, and there is no way to reach this with an untitled game.
   */
  private async save(): Promise<boolean> {
    this.gameDoc = { ...this.gameDoc, [this.slot]: this.cutScene, updatedAt: new Date().toISOString() };
    try {
      await saveGame(this.gameDoc);
    } catch {
      this.setStatus("Could not save — check your connection.", "bad");
      this.rebuild();
      return false;
    }
    this.setStatus("Saved.", "good");
    this.rebuild();
    return true;
  }

  /** Back saves rather than discarding: there is no separate "are you sure",
   * and losing a paragraph someone just typed to a stray click on ← Back would
   * be the worst thing this screen could do. */
  private async saveAndLeave(): Promise<void> {
    await this.save();
    this.scene.start("GameMaker");
  }

  private async preview(): Promise<void> {
    if (!(await this.save())) return;
    this.scene.start("CutScene", {
      cutScene: this.cutScene,
      // Straight back here afterwards, with the same game and slot — a preview
      // that dumped you on the Game Maker would cost a click to resume editing.
      next: { key: "CutSceneMaker", data: { game: this.gameDoc, slot: this.slot } },
    });
  }
}
