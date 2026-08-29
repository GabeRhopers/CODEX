import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { cloneLevel } from "../level/LevelSerializer";
import { LevelData } from "../level/LevelSchema";
import { TEMPLATE_LEVELS } from "../level/templateLevels";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";
import { makePagerControls } from "../ui/PagerControls";

const ROW_START_Y = 90;
/** Same as the other two browsers. There are six bundled templates today, so
 * nothing overflows yet — but the layout had the identical unchecked
 * `start + i * height` that broke My Levels at nine, and a seventh template
 * would have found it. */
const ROW_HEIGHT = 52;
const PAGER_Y = GAME_HEIGHT - 44;
const ROWS_PER_PAGE = rowsPerPage(ROW_START_Y, PAGER_Y, ROW_HEIGHT);

/** Browses the always-available, never-mutated TEMPLATE_LEVELS — distinct
 * from My Levels (which is the user's own saved work). "Play" clones one
 * straight into PlayScene; "Use This Template" clones one into the editor
 * with a blank id, so Save there creates an independent level rather than
 * touching the template. Same list/row layout as LevelBrowserScene/
 * WorldBrowserScene on purpose, for a consistent family of browser screens. */
export class TemplateBrowserScene extends Phaser.Scene {
  private listContainer!: Phaser.GameObjects.Container;
  private page = 0;

  constructor() {
    super("Templates");
  }

  create(): void {
    this.add
      .text(24, 20, "← Back", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Menu"));

    this.add.text(GAME_WIDTH / 2, 24, "Templates", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);
    this.add
      .text(GAME_WIDTH / 2, 50, "Pre-built levels — play one, or use it as a starting point in the editor.", {
        fontSize: "12px",
        color: "#a6a6c8",
      })
      .setOrigin(0.5, 0);

    this.listContainer = this.add.container(0, 0);
    this.renderPage();
  }

  private renderPage(): void {
    this.listContainer.removeAll(true);
    this.page = clampPage(this.page, TEMPLATE_LEVELS.length, ROWS_PER_PAGE);
    pageSlice(TEMPLATE_LEVELS, this.page, ROWS_PER_PAGE).forEach((level, i) =>
      this.addRow(level, ROW_START_Y + i * ROW_HEIGHT),
    );
    this.listContainer.add(
      makePagerControls({
        scene: this,
        x: 40,
        y: PAGER_Y,
        page: this.page,
        total: TEMPLATE_LEVELS.length,
        perPage: ROWS_PER_PAGE,
        onChange: (page) => {
          this.page = page;
          this.renderPage();
        },
      }),
    );
  }

  private addRow(level: LevelData, y: number): void {
    const rowBg = this.add.rectangle(40, y, GAME_WIDTH - 80, ROW_HEIGHT - 8, 0x16213e).setOrigin(0, 0);
    const name = this.add
      .text(56, y + (ROW_HEIGHT - 8) / 2, level.name, { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);

    const playBtn = this.makeSmallButton(GAME_WIDTH - 280, y + (ROW_HEIGHT - 8) / 2, "Play", () => this.play(level));
    const useBtn = this.makeSmallButton(GAME_WIDTH - 200, y + (ROW_HEIGHT - 8) / 2, "Use This Template", () =>
      this.useTemplate(level),
    );

    this.listContainer.add([rowBg, name, playBtn, useBtn]);
  }

  private makeSmallButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        // See LevelBrowserScene's makeSmallButton.
        padding: { x: 10, y: 12 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
  }

  private play(level: LevelData): void {
    this.scene.start("Play", { level: cloneLevel(level), returnScene: "Templates" });
  }

  private useTemplate(level: LevelData): void {
    const copy = cloneLevel(level);
    copy.id = "";
    this.scene.start("Editor", { level: copy });
  }
}
