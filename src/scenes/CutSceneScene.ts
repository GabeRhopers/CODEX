import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { CutScene, CutScenePanel, playablePanels } from "../game/CutScene";
import { loadLibraryImageTexture } from "../gameplay/backgroundLoader";

/**
 * Playing a cut scene: a picture, some words, and a button you press.
 *
 * **Knows nothing about games.** It is handed the panels and an instruction for
 * what to start afterwards, so the same scene serves the opening (→ WorldMap)
 * and the closing (→ Ending) without either of those being named here. That is
 * what keeps a per-world cut scene, later, from needing anything in this file.
 *
 * Deliberately plain: no transitions, no timed auto-advance, no sound. Someone
 * reading at their own pace can, and a page that moves on by itself is a page
 * you cannot re-read. **Skip** is present from the start because a family game
 * gets replayed, and sitting through the same four panels every time is how a
 * cut scene turns into an obstacle.
 */

interface NextSceneInstruction {
  key: string;
  data?: object;
}

interface CutSceneSceneData {
  cutScene?: CutScene;
  next?: NextSceneInstruction;
}

const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
/** The words sit in a band across the bottom rather than over the middle of the
 * picture: a caption that lands on somebody's face is the usual way this looks
 * wrong, and a fixed band is also a fixed place for the eye to return to. */
const BAND_HEIGHT = 132;

export class CutSceneScene extends Phaser.Scene {
  private panels: CutScenePanel[] = [];
  private next: NextSceneInstruction = { key: "Menu" };
  private index = 0;
  /** Guards the one-way exit. Space repeats while the last panel's start is
   * still in flight, and two `scene.start` calls for the same destination leave
   * two scenes running — the class of bug WorldMapScene's own notes describe. */
  private leaving = false;

  constructor() {
    super("CutScene");
  }

  init(data?: CutSceneSceneData): void {
    // Only the panels worth showing: an author who added three panels and typed
    // nothing into two of them meant one panel, not three blank beats.
    this.panels = playablePanels(data?.cutScene);
    this.next = data?.next ?? { key: "Menu" };
    this.index = 0;
    this.leaving = false;
  }

  create(): void {
    // A cut scene with nothing in it is not an error and not a blank screen —
    // it is simply not a cut scene, so the run carries straight on. The seams
    // check `hasContent` before starting this at all; this is the second guard,
    // for a panel list that became empty some other way.
    if (this.panels.length === 0) {
      this.leave();
      return;
    }
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    this.input.keyboard?.on("keydown-ESC", () => this.leave());
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    const panel = this.panels[this.index];

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x12122a).setOrigin(0, 0);
    if (panel.imageId) void this.drawPicture(panel.imageId);
    if (panel.words?.trim()) this.drawWords(panel.words.trim());

    this.drawControls();
  }

  /**
   * Cover-fit, like `StaticBackground` — each library image is whatever size it
   * was uploaded at, so scaling by the larger ratio is what stops a letterbox
   * gap down one side.
   *
   * Async, and re-checked on arrival: a picture that resolves after the reader
   * has already pressed Next must not paint itself over the panel that replaced
   * it.
   */
  private async drawPicture(imageId: string): Promise<void> {
    const shownAt = this.index;
    const key = await loadLibraryImageTexture(this, imageId);
    if (!key || !this.scene.isActive() || this.index !== shownAt) return;
    const image = this.add.image(GAME_WIDTH / 2, (GAME_HEIGHT - BAND_HEIGHT) / 2, key).setDepth(-10);
    const scale = Math.max(GAME_WIDTH / image.width, (GAME_HEIGHT - BAND_HEIGHT) / image.height);
    image.setScale(scale);
    // Behind the words, which were drawn first: this arrives late, so it has to
    // say where it belongs rather than rely on the order things were added.
    this.children.sendToBack(image);
  }

  private drawWords(words: string): void {
    this.add.rectangle(0, GAME_HEIGHT - BAND_HEIGHT, GAME_WIDTH, BAND_HEIGHT, 0x0b0b1c, 0.82).setOrigin(0, 0);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - BAND_HEIGHT + 22, words, {
        fontSize: "16px",
        color: "#eeeeee",
        align: "center",
        lineSpacing: 6,
        wordWrap: { width: GAME_WIDTH - 220 },
      })
      .setOrigin(0.5, 0);
  }

  private drawControls(): void {
    const isLast = this.index === this.panels.length - 1;
    this.add
      .text(GAME_WIDTH / 2, 26, `${this.index + 1} / ${this.panels.length}`, { fontSize: "12px", color: "#a6a6c8" })
      .setOrigin(0.5);
    this.button(GAME_WIDTH - 130, GAME_HEIGHT - 34, isLast ? "Begin ▶" : "Next ▸", () => this.advance());
    // Always offered, including on the last panel, where it means the same
    // thing as Next — one control that always ends the scene is easier to find
    // in a hurry than one that appears and disappears.
    this.button(30, GAME_HEIGHT - 34, "Skip", () => this.leave());
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: BUTTON_HEX,
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: BUTTON_HOVER_HEX }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: BUTTON_HEX }));
  }

  private advance(): void {
    if (this.leaving) return;
    if (this.index + 1 >= this.panels.length) {
      this.leave();
      return;
    }
    this.index += 1;
    this.render();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(this.next.key, this.next.data);
  }
}
