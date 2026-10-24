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
import { gamesUploadLink } from "../game/uploadLink";
import { downloadTextFile } from "../ui/downloadFile";
import { MUTED_COLOR } from "../ui/theme";
import { makeTextButton } from "../ui/textButton";
import { drawScreenHeader } from "../ui/screenHeader";

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
  /** An export is in flight. Distinct from `exported`, which means one has
   * already finished — see the note in `exportBundle`. */
  private exporting = false;

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
    return makeTextButton({ scene: this, x, y: yMid, label, onClick, paddingY: 10 });
  }

  private stepNumber(y: number, n: number, done: boolean): void {
    this.add.circle(STEP_X, y, 13, done ? 0x2f6b46 : PANEL_FILL).setStrokeStyle(1, 0x3a5a9c);
    this.add
      .text(STEP_X, y, done ? "✓" : String(n), { fontSize: "13px", color: done ? "#8fd694" : MUTED_COLOR })
      .setOrigin(0.5);
  }

  private stepHeading(y: number, text: string, dimmed: boolean): void {
    this.add.text(STEP_TEXT_X, y, text, { fontSize: "16px", color: dimmed ? MUTED_COLOR : "#ffffff" }).setOrigin(0, 0.5);
  }

  private drawHeader(): void {
    drawScreenHeader({
      scene: this,
      title: "Publish",
      subtitle: `"${this.gameDoc.title}" — three steps to a link you can send.`,
      onBack: () => this.scene.start("GameMaker"),
    });
  }

  // --- step 1: the file ----------------------------------------------------

  private drawStepOne(): void {
    this.stepNumber(STEP_ONE_Y, 1, this.exported);
    this.stepHeading(STEP_ONE_Y, "Download the game file", false);
    this.add
      .text(STEP_TEXT_X, STEP_ONE_Y + 22, "Everything the game needs — worlds, levels, art, music,\ninvented things — written into one file.", {
        fontSize: "12px",
        color: MUTED_COLOR,
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
    // Collecting a bundle reads every level, background and track the game
    // uses, so on a slow connection the button stays live for seconds while
    // nothing visibly happens — and the natural response to that is to press it
    // again. Each press wrote its own file and rebuilt the screen underneath
    // the other, so you got two downloads and whichever status line lost the
    // race. One at a time.
    if (this.exporting) return;
    this.exporting = true;
    let bundle;
    try {
      bundle = await collectGameBundle(this.gameDoc);
    } catch {
      this.exporting = false;
      this.status = "Could not read everything this game needs — check your connection.";
      this.statusTone = "bad";
      this.rebuild();
      return;
    }
    this.exporting = false;
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
    // **Said to be a grown-up's step.** Everything else on this screen is
    // something the person who made the game can do; this one is not, and the
    // tool is honest everywhere else about what it cannot do.
    this.add
      .text(
        STEP_TEXT_X,
        STEP_TWO_Y + 22,
        "A grown-up does this bit. Upload the file exactly as it is —\n" +
          "its name is what the link looks for:",
        { fontSize: "12px", color: MUTED_COLOR, lineSpacing: 4 },
      )
      .setOrigin(0, 0);
    const pathChip = this.add
      .text(STEP_TEXT_X, STEP_TWO_Y + 64, `public/${publishedGamePath(gameSlug(this.gameDoc.title))}`, {
        fontSize: "12px",
        color: "#8fd694",
        backgroundColor: "#101a30",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 0);
    // A link rather than the old sentence naming the folder. Finding a folder
    // on GitHub was never the hard part — being on the right *branch* was, and
    // nothing said so: the web UI opens on the repository's default, which is
    // not the branch that deploys, so a correct-looking upload would never
    // appear. `gamesUploadLink` carries that branch; see its own comment.
    //
    // **Beside the path, not under it**, and that is forced rather than
    // chosen. Three steps already fill 468px: a button on its own row here
    // overlapped the path chip above it by about 1.5px and left as little
    // under it before step 3's number — seen in a screenshot on 2026-10-24,
    // and invisible to `assertLayoutSound`, which compares only interactive
    // Text and never sees a button this deployment does not draw at all. On
    // the chip's own line there is room to spare, and the folder's name ends
    // up beside the button that opens it.
    const uploadHref = gamesUploadLink(location.href);
    if (uploadHref) {
      this.makeButton(pathChip.x + pathChip.width + 12, pathChip.y + pathChip.height / 2, "Open this folder →", () =>
        window.open(uploadHref, "_blank", "noopener"),
      );
    }
    this.add
      .text(STEP_TEXT_X, STEP_TWO_Y + 96, "The site rebuilds itself; a few minutes later the link below is live.", {
        fontSize: "12px",
        color: MUTED_COLOR,
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
    const link = this.add
      .text(STEP_TEXT_X, STEP_THREE_Y + 24, this.link, {
        fontSize: "13px",
        color: "#9ec5ff",
        backgroundColor: "#101a30",
        padding: { x: 8, y: 8 },
        wordWrap: { width: GAME_WIDTH - STEP_TEXT_X - 160 },
      })
      .setOrigin(0, 0);
    // **Beside the link, not at the right margin.** This button used to be
    // pinned at GAME_WIDTH - 130 = 920 while the link starts at 74, so for any
    // realistic link — the one measured on 2026-10-19 was 40 characters and
    // about 250px — some 600px of empty canvas separated a value from the
    // button that acts on it, with nothing in between to connect them.
    //
    // The margin was not arbitrary: the link wraps at 816px, so a long enough
    // game name really can reach x = 890. So measure instead of reserving —
    // follow the link when it is short, and fall back to the old position when
    // it is long enough to need it. There is no room to drop below the link
    // instead: step three sits at y 352 of 468 with the closing note under it.
    const copyX = Math.min(link.x + link.width + 12, GAME_WIDTH - 130);
    const copy = this.makeButton(copyX, STEP_THREE_Y + 34, "Copy link", () => void this.copyLink());
    // **Check answers the only question this screen could not.** The link is
    // drawn the moment a file is exported, but it is dead until an upload
    // lands and the site rebuilds — and dead forever if the upload went to a
    // branch that does not deploy. Until now the screen showed the same link
    // either way and had no way to tell them apart, which invites sending a
    // link that does not work.
    this.makeButton(copyX + copy.width + 10, STEP_THREE_Y + 34, "Check", () => void this.checkLink());
    // The bottom line does double duty: normally what the link is worth, and
    // after a copy, whether the copy worked. One line, full width — the column
    // beside the Copy button is 110px wide, which turns "Could not copy — write
    // it down instead." into four wrapped lines running off the canvas.
    this.add
      .text(
        STEP_TEXT_X,
        GAME_HEIGHT - 24,
        this.linkStatus || "Whoever opens it plays the game — no sign-in, no editor, nothing to install.",
        { fontSize: "11px", color: this.linkStatus ? STATUS_COLORS[this.linkTone] : MUTED_COLOR },
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
  /**
   * Asks the site whether the game is actually there.
   *
   * Fetches the file the player would fetch — `publishedGamePath` against this
   * page's own origin, so it is the same request `fetchPublishedBundle` makes
   * and same-origin besides, with no CORS to arrange.
   *
   * `cache: "no-store"` is load-bearing: the answer changes from 404 to 200
   * minutes after an upload, and a cached 404 would keep saying no long after
   * the game went live — which is the exact moment somebody gives up.
   *
   * Three outcomes, not two. "Could not check" is its own answer because a
   * network failure is not evidence the game is missing, and saying it is
   * would send an author back to re-upload a file that was already there.
   */
  private async checkLink(): Promise<void> {
    this.linkStatus = "Checking…";
    this.linkTone = "good";
    this.rebuild();
    const path = publishedGamePath(gameSlug(this.gameDoc.title));
    try {
      const res = await fetch(new URL(path, location.href).toString(), { cache: "no-store" });
      if (res.ok) {
        this.linkStatus = "The game is there — the link works.";
        this.linkTone = "good";
      } else {
        this.linkStatus = "Not there yet. If you just uploaded it, give the site a few minutes.";
        this.linkTone = "warn";
      }
    } catch {
      this.linkStatus = "Could not check just now — that does not mean the game is missing.";
      this.linkTone = "warn";
    }
    this.rebuild();
  }

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
