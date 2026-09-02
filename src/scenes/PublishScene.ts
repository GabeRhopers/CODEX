import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { createEmptyGame, GameData } from "../game/GameSchema";
import { collectGameBundle } from "../game/collectBundle";
import {
  bundleFileName,
  bundleProblems,
  bundleSummary,
  gameSlug,
  PUBLISHED_GAMES_DIR,
  publishedGamePath,
} from "../game/gameBundle";
import { publishedGameLink } from "../game/publishedBundle";
import { downloadTextFile } from "../ui/downloadFile";

/**
 * How a finished game becomes a link somebody else can open.
 *
 * The whole arc — collect a game into one file (2a), play a page from that file
 * (2b) — ended with the file sitting in a Downloads folder. This screen is the
 * last part: it writes the file, says where to put it, and shows the link that
 * results.
 *
 * **Three steps, none of them a command line.** The site is built by CI onto one
 * GitHub Pages deployment, and a deployment is something only CI can make — but
 * a *file in a folder* is something a person can upload from a phone. So
 * publishing is "add a file to `public/games/`", and the player finds it by
 * `?game=<slug>` (see `publishedBundle.ts`). Nothing here needs a build script,
 * a second deployment, or a token.
 *
 * **The file's name is the slug is the link.** `bundleFileName` emits
 * `<slug>.json` and `publishedGamePath` puts it under the same folder the player
 * fetches from, so the three steps below refer to one string that cannot drift
 * between them.
 *
 * A screen of its own rather than a fourth button on the Game Maker: two of the
 * three steps are things to *read*, and that screen's single status line has room
 * for neither the folder nor the URL.
 */

const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
const MUTED = "#a6a6c8";
const PANEL_FILL = 0x0f1830;
const STATUS_COLORS = { good: "#8fd694", warn: "#ffc93c", bad: "#ff9d9d" } as const;

const STEP_X = 40;
const STEP_TEXT_X = STEP_X + 34;
// Three steps in 468px with a header above and a note below. Measured against
// the tallest each one gets — two lines of prose plus a control — rather than
// eyeballed: the first spacing tried put step 2's path chip through step 3's
// heading, which no assertion would have caught and a screenshot did.
const STEP_ONE_Y = 106;
const STEP_TWO_Y = 216;
const STEP_THREE_Y = 352;

/**
 * The problems tacked onto the export's status line.
 *
 * Trimmed to the first two: the line has room for two rendered lines before it
 * reaches the next step, and a report that overflows tells you less than one
 * that does not. The count stays honest about how many there are, and the file
 * is written either way — which is the point of not blocking on problems.
 *
 * Moved here with `exportBundle` when publishing got its own screen; the wording
 * is unchanged.
 */
function describeProblems(problems: string[]): string {
  if (problems.length === 0) return "";
  const shown = problems.slice(0, 2).join(" ");
  const rest = problems.length - 2;
  return rest > 0 ? ` — ${shown} (+${rest} more)` : ` — ${shown}`;
}

export class PublishScene extends Phaser.Scene {
  private gameDoc: GameData = createEmptyGame("");
  private status = "";
  private statusTone: "good" | "warn" | "bad" = "good";
  /** Step 3's own line. Separate from `status` because they report different
   * steps: "Link copied." appearing beside the Download button would be a
   * message about one thing shown as if it were about another. */
  private linkStatus = "";
  private linkTone: "good" | "warn" | "bad" = "good";
  /** Set once the file has actually been written, so the two steps that only
   * make sense afterwards are dimmed until then rather than reading as things
   * you could already have done. */
  private exported = false;

  constructor() {
    super("Publish");
  }

  init(data: { game?: GameData }): void {
    // Saved by the Game Maker before it starts this scene, so what is published
    // is what is stored.
    if (data.game) this.gameDoc = data.game;
    this.status = "";
    this.statusTone = "good";
    this.linkStatus = "";
    this.linkTone = "good";
    this.exported = false;
  }

  create(): void {
    this.rebuild();
  }

  private rebuild(): void {
    this.children.removeAll(true);
    this.drawHeader();
    this.drawStepOne();
    this.drawStepTwo();
    this.drawStepThree();
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

  private stepNumber(y: number, n: number, done: boolean): void {
    this.add.circle(STEP_X, y, 13, done ? 0x2f6b46 : PANEL_FILL).setStrokeStyle(1, 0x3a5a9c);
    this.add
      .text(STEP_X, y, done ? "✓" : String(n), { fontSize: "13px", color: done ? "#8fd694" : MUTED })
      .setOrigin(0.5);
  }

  private stepHeading(y: number, text: string, dimmed: boolean): void {
    this.add.text(STEP_TEXT_X, y, text, { fontSize: "16px", color: dimmed ? MUTED : "#ffffff" }).setOrigin(0, 0.5);
  }

  private drawHeader(): void {
    this.add
      .text(24, 20, "← Back", { fontSize: "14px", color: "#ffffff", backgroundColor: BUTTON_HEX, padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("GameMaker"));
    this.add.text(GAME_WIDTH / 2, 30, "Publish", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 58, `"${this.gameDoc.title}" — three steps to a link you can send.`, {
        fontSize: "12px",
        color: MUTED,
      })
      .setOrigin(0.5);
  }

  // --- step 1: the file ----------------------------------------------------

  private drawStepOne(): void {
    this.stepNumber(STEP_ONE_Y, 1, this.exported);
    this.stepHeading(STEP_ONE_Y, "Download the game file", false);
    this.add
      .text(STEP_TEXT_X, STEP_ONE_Y + 22, "Everything the game needs — worlds, levels, art, music,\ninvented things — written into one file.", {
        fontSize: "12px",
        color: MUTED,
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
    this.makeButton(STEP_TEXT_X, STEP_ONE_Y + 74, this.exported ? "Download again" : "Download", () =>
      void this.exportBundle(),
    );

    if (this.status) {
      // Wrapped and top-anchored: a report of what is missing runs to two lines
      // easily, and an unwrapped one simply leaves the canvas.
      this.add
        .text(STEP_TEXT_X + 150, STEP_ONE_Y + 62, this.status, {
          fontSize: "12px",
          color: STATUS_COLORS[this.statusTone],
          wordWrap: { width: GAME_WIDTH - STEP_TEXT_X - 190 },
        })
        .setOrigin(0, 0);
    }
  }

  /**
   * Writes the whole game into one file you keep.
   *
   * Problems are *reported* rather than blocking, because a missing background
   * falls back and a missing track plays silence — while refusing to write the
   * file would leave you unable to inspect the very thing you need to see in
   * order to fix it.
   */
  private async exportBundle(): Promise<void> {
    let bundle;
    try {
      bundle = await collectGameBundle(this.gameDoc);
    } catch {
      this.status = "Could not read everything this game needs — check your connection.";
      this.statusTone = "bad";
      this.rebuild();
      return;
    }
    downloadTextFile(bundleFileName(this.gameDoc.title), JSON.stringify(bundle));
    const problems = bundleProblems(bundle);
    this.exported = true;
    this.status = `Saved ${bundleSummary(bundle)}${describeProblems(problems)}`;
    // Amber, not green: the file was written, but a game missing a level is not
    // something to report as simply fine.
    this.statusTone = problems.length ? "warn" : "good";
    this.rebuild();
  }

  // --- step 2: where it goes -----------------------------------------------

  private drawStepTwo(): void {
    this.stepNumber(STEP_TWO_Y, 2, false);
    this.stepHeading(STEP_TWO_Y, `Put it in the site's ${PUBLISHED_GAMES_DIR} folder`, !this.exported);
    this.add
      .text(
        STEP_TEXT_X,
        STEP_TWO_Y + 22,
        `On GitHub, open public/${PUBLISHED_GAMES_DIR}/ and use Add file → Upload files.\n` +
          "Upload it exactly as it is — the name is what the link looks for:",
        { fontSize: "12px", color: MUTED, lineSpacing: 4 },
      )
      .setOrigin(0, 0);
    this.add
      .text(STEP_TEXT_X, STEP_TWO_Y + 64, `public/${publishedGamePath(gameSlug(this.gameDoc.title))}`, {
        fontSize: "12px",
        color: "#8fd694",
        backgroundColor: "#101a30",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 0);
    this.add
      .text(STEP_TEXT_X, STEP_TWO_Y + 96, "The site rebuilds itself; a few minutes later the link below is live.", {
        fontSize: "12px",
        color: MUTED,
      })
      .setOrigin(0, 0);
  }

  // --- step 3: the link ----------------------------------------------------

  private get link(): string {
    return publishedGameLink(location.href, gameSlug(this.gameDoc.title));
  }

  private drawStepThree(): void {
    this.stepNumber(STEP_THREE_Y, 3, false);
    this.stepHeading(STEP_THREE_Y, "Send this link", !this.exported);
    this.add
      .text(STEP_TEXT_X, STEP_THREE_Y + 24, this.link, {
        fontSize: "13px",
        color: "#9ec5ff",
        backgroundColor: "#101a30",
        padding: { x: 8, y: 8 },
        wordWrap: { width: GAME_WIDTH - STEP_TEXT_X - 160 },
      })
      .setOrigin(0, 0);
    this.makeButton(GAME_WIDTH - 130, STEP_THREE_Y + 34, "Copy link", () => void this.copyLink());
    // The bottom line does double duty: normally what the link is worth, and
    // after a copy, whether the copy worked. One line, full width — the column
    // beside the Copy button is 110px wide, which turns "Could not copy — write
    // it down instead." into four wrapped lines running off the canvas.
    this.add
      .text(
        STEP_TEXT_X,
        GAME_HEIGHT - 24,
        this.linkStatus || "Whoever opens it plays the game — no sign-in, no editor, nothing to install.",
        { fontSize: "11px", color: this.linkStatus ? STATUS_COLORS[this.linkTone] : MUTED },
      )
      .setOrigin(0, 0.5);
  }

  /**
   * The canvas has no selectable text, so the link cannot be picked up by hand —
   * a copy button is the only way off this screen with it.
   *
   * Guarded rather than assumed: `navigator.clipboard` is absent on insecure
   * origins and can be refused outright, and a link you were told was copied but
   * was not is worse than one you were told to type.
   */
  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link);
      this.linkStatus = "Link copied.";
      this.linkTone = "good";
    } catch {
      this.linkStatus = "Could not copy — write it down instead.";
      this.linkTone = "bad";
    }
    this.rebuild();
  }
}
