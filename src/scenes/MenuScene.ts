import Phaser from "phaser";
import { VolumeControl } from "../audio/VolumeControl";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LevelSummary } from "../level/LevelSchema";
import { pickResumeLevel } from "../level/recentLevels";
import { TEMPLATE_LEVELS } from "../level/templateLevels";
import { clearActiveProfile, loadActiveProfile } from "../profile/Profile";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";

// One margin for everything that spans the page — the card grid, the resume
// bar and the footer row all start here, so the whole page reads as a single
// column instead of three independently-centred blocks.
const SIDE_MARGIN = 33;
const CONTENT_WIDTH = GAME_WIDTH - SIDE_MARGIN * 2;

const CARD_WIDTH = 480;
const CARD_HEIGHT = 84;
const CARD_GAP_X = 24;
const CARD_GAP_Y = 18;
const GRID_TOP = 106;
const ROW2_TOP = GRID_TOP + CARD_HEIGHT + CARD_GAP_Y;
const GRID_BOTTOM = ROW2_TOP + CARD_HEIGHT;

const BAR_TOP = GRID_BOTTOM + 16;
const BAR_HEIGHT = 46;
const FOOTER_ROW_Y = 392;
// Narrow enough that a full-volume track reads as a control rather than as
// the loudest graphic in the footer, wide enough to still drag precisely.
const VOLUME_WIDTH = 150;

const ACCENT_WIDTH = 4;
const ICON_BOX = 40;
const TEXT_INSET = 82; // icon column (SIDE margin + ICON_BOX) plus breathing room

// Named so the highlight/focus states below read as states rather than as a
// scatter of hex literals. Base fill and hover fill are the same pair every
// other screen uses (see TemplateBrowserScene's buttons) — only the stroke,
// stripe and chevron are new here.
const CARD_FILL = 0x0f3460;
const CARD_FILL_ACTIVE = 0x3a5a9c;
const CARD_STROKE = 0x2a4a7c;
const CARD_STROKE_ACTIVE = 0x7aa6e8;
const BAR_FILL = 0x16213e;
const BAR_STROKE = 0x24345c;
const ACCENT_PRIMARY = 0xffd166;
const ACCENT_SECONDARY = 0x4a7ac8;
const CHEVRON_IDLE = "#6f7fa8";
const MUTED_TEXT = "#b0b0cc";
// 5.15:1 against the #1a1a2e page background. The previous #666688 was
// 3.10:1 — under the 4.5:1 small-text threshold, on the one line that
// explains the controls to a first-time player.
const FOOTER_TEXT = "#8a8ab0";

/** Anything on this page a pointer can hover or a key can focus. Cards, the
 * resume bar and the Skin Creator link all satisfy it, which is what lets a
 * single arrow-key handler drive the whole page without knowing what kind of
 * thing it is moving between. */
interface MenuTarget {
  /** Where this sits on the page, in rows and columns rather than pixels —
   * arrow keys move by this, so "down" always means the thing visually
   * below, even where a row holds one full-width item and its neighbour
   * holds two. */
  row: number;
  col: number;
  setHighlighted(on: boolean): void;
  activate(): void;
}

// The page's five rows, top to bottom, as the keyboard sees them.
const ROW_PROFILE = 0;
const ROW_CARDS_TOP = 1;
const ROW_CARDS_BOTTOM = 2;
const ROW_RESUME = 3;
const ROW_FOOTER = 4;

/**
 * Home page: the game's entry point after boot. A 2x2 card grid covers the
 * four things there are to do — start something new, browse ready-made
 * templates, pick up your own saved work, or chain levels into a course —
 * each with a live status line instead of a bare button label, so the whole
 * picture (how much you've built) is visible without navigating in.
 *
 * Below the grid sits one full-width bar that adapts to who's looking: a
 * returning builder gets their most recent level with a single click back
 * into it, and someone with nothing saved gets pointed at the templates
 * instead of at an empty shelf. That bar is deliberately *not* a fifth card
 * — the grid's four positions are hardcoded (leftX/rightX/row1Y/row2Y) and
 * sized so GAME_HEIGHT clears them, so a fifth card would mean a third row
 * cascading into gameConfig.ts constants every other scene also reads. A
 * full-width bar fills the space under the grid without touching that math,
 * and its "one thing, right now" shape suits a resume prompt better than a
 * peer of the four standing choices anyway.
 */
export class MenuScene extends Phaser.Scene {
  private levelStorage: StorageAdapter = getLevelStorage();
  private worldStorage: WorldStorageAdapter = getWorldStorage();
  private theme?: Phaser.Sound.BaseSound;

  private targets: MenuTarget[] = [];
  // Phaser's keyboard queue re-delivers a keydown that has already been
  // handled — see EditorScene's onceThisFrame for the same quirk. Measured
  // against Phaser 3.90 by logging DOM events, scene emissions and focus
  // moves side by side: three ArrowDown presses produced three DOM keydown
  // events but six scene-level emissions, walking the focus ring four steps
  // instead of three.
  //
  // Two things that trace ruled out, both tried first:
  //   * A frame guard (EditorScene's approach) also swallows a genuine
  //     second press landing in the same frame. Fine for undo/redo, wrong
  //     for a focus ring — measured, it turned those three presses into one
  //     step.
  //   * Remembering the last timestamp *per key* fails too, because the
  //     replays are not in order: the trace showed an older ArrowDown
  //     re-delivered after a newer one had already been handled, so a
  //     single slot ping-pongs between the two and treats both as new.
  //
  // A high-water mark is immune to both. Every key event carries a
  // timestamp from one monotonic clock, so a genuinely new press is always
  // strictly later than anything handled so far, and a replay never is.
  // Two distinct presses would have to land in the same sub-millisecond
  // tick to collide, which no hand can do.
  private lastHandledKeyTime = -1;
  private hoverIndex = -1;
  /** -1 until the first arrow key, so a pointer user never sees a focus
   * ring they didn't ask for. */
  private focusIndex = -1;

  private myLevelsSubtitle!: Phaser.GameObjects.Text;
  private worldsSubtitle!: Phaser.GameObjects.Text;
  private barEyebrow!: Phaser.GameObjects.Text;
  private barTitle!: Phaser.GameObjects.Text;
  private barAction!: Phaser.GameObjects.Text;
  private barBg!: Phaser.GameObjects.Rectangle;
  private barStripe!: Phaser.GameObjects.Rectangle;
  private onBarActivate: (() => void) | null = null;

  constructor() {
    super("Menu");
  }

  create(): void {
    this.targets = [];
    this.hoverIndex = -1;
    this.focusIndex = -1;
    this.lastHandledKeyTime = -1;
    this.onBarActivate = null;

    this.buildHeader();
    this.buildCards();
    this.buildResumeBar();
    this.buildFooter();
    this.bindKeyboard();
    this.clearHoverOnExit();
    this.startTheme();

    void this.refreshStatuses();
  }

  // ---------------------------------------------------------------- header

  private buildHeader(): void {
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 22, "Rhopers Game Maker", { fontSize: "26px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5, 0);

    this.add
      .text(cx, 58, "Paint a level, place a spawn and a goal, then play it — or chain a few into a World.", {
        fontSize: "12px",
        color: "#c8c8e0",
      })
      .setOrigin(0.5, 0);

    // Decoration only, and deliberately *not* any of the four card icons:
    // when the same picture is both a mascot in the corner and the
    // identifier on a card, the card icons stop reading as identifiers.
    this.placeDecoration(GAME_WIDTH - 76, 34, "enemy-ghost-pillow");
    this.placeDecoration(GAME_WIDTH - 34, 32, "enemy-bat");

    // Not a real account switch — see Profile.ts's docstring — just clears
    // the name-tag and sends whoever's at the device back through
    // ProfileGateScene to pick a different one; the Drive connection itself
    // (one shared sign-in behind all three profiles) is untouched.
    //
    // Rendered as a chip at the grid's own left margin. It used to sit at
    // (8, 6) with the wizard mascot drawn at (50, 34) directly over it, so
    // the page's only identity affordance was illegible; the mascot has
    // moved to the footer and this now has the corner to itself.
    const activeProfile = loadActiveProfile();
    const profileChip = this.add
      .text(SIDE_MARGIN, 14, `${activeProfile ?? "?"} · Switch profile`, {
        fontSize: "11px",
        color: MUTED_TEXT,
        backgroundColor: "#16213e",
        padding: { x: 10, y: 5 },
      })
      .setInteractive({ useHandCursor: true });
    this.register(profileChip, {
      row: ROW_PROFILE,
      col: 0,
      setHighlighted: (on) => {
        profileChip.setColor(on ? "#ffffff" : MUTED_TEXT);
        profileChip.setStyle({ backgroundColor: on ? "#3a5a9c" : "#16213e" });
      },
      activate: () => {
        clearActiveProfile();
        this.scene.start("ProfileGate");
      },
    });
  }

  /** Scales a decorative sprite into a fixed box from its own measured size,
   * so swapping in a differently-sized asset can't blow up the header. */
  private placeDecoration(x: number, y: number, key: string): void {
    const image = this.add.image(x, y, key);
    image.setScale(Math.min(0.9, ICON_BOX / image.width, ICON_BOX / image.height));
  }

  // ----------------------------------------------------------------- cards

  private buildCards(): void {
    const cx = GAME_WIDTH / 2;
    const leftX = cx - CARD_WIDTH - CARD_GAP_X / 2;
    const rightX = cx + CARD_GAP_X / 2;

    // New Level carries the one gold stripe on the page. With nothing saved
    // yet it is the only card that leads anywhere with content in it, so the
    // page needs exactly one obvious first move — and once there *is* saved
    // work, the resume bar below takes over as the loudest thing here.
    this.makeCard(leftX, GRID_TOP, {
      iconKey: "marker-spawn",
      title: "New Level",
      subtitle: "Start from a blank grid",
      accent: ACCENT_PRIMARY,
      row: ROW_CARDS_TOP,
      col: 0,
      onClick: () => this.scene.start("Editor"),
    });

    this.makeCard(rightX, GRID_TOP, {
      iconKey: "tile-brick-icon",
      title: "Templates",
      subtitle: `${TEMPLATE_LEVELS.length} pre-built levels — play one, or use it as a starting point`,
      accent: ACCENT_SECONDARY,
      row: ROW_CARDS_TOP,
      col: 1,
      onClick: () => this.scene.start("Templates"),
    });

    // A chest rather than the wizard: the wizard is the mascot in the
    // footer, and "your saved things" needs its own picture.
    this.myLevelsSubtitle = this.makeCard(leftX, ROW2_TOP, {
      iconKey: "chest",
      title: "My Levels",
      subtitle: "Checking saved levels…",
      accent: ACCENT_SECONDARY,
      row: ROW_CARDS_BOTTOM,
      col: 0,
      onClick: () => this.scene.start("LevelBrowser"),
    });

    this.worldsSubtitle = this.makeCard(rightX, ROW2_TOP, {
      iconKey: "goal-portal",
      title: "Worlds",
      subtitle: "Checking Worlds…",
      accent: ACCENT_SECONDARY,
      row: ROW_CARDS_BOTTOM,
      col: 1,
      onClick: () => this.scene.start("WorldBrowser"),
    });
  }

  /** Returns the subtitle Text object so callers can swap in a live status
   * line once an async list() resolves, instead of a separate footer row. */
  private makeCard(
    x: number,
    y: number,
    options: {
      iconKey: string;
      title: string;
      subtitle: string;
      accent: number;
      row: number;
      col: number;
      onClick: () => void;
    },
  ): Phaser.GameObjects.Text {
    const bg = this.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, CARD_FILL)
      .setOrigin(0, 0)
      .setStrokeStyle(1, CARD_STROKE)
      .setInteractive({ useHandCursor: true });

    // The stripe, the border and the chevron all exist for one reason: a
    // flat filled rectangle with text on it doesn't look like anything you
    // can click until you happen to hover it.
    this.add.rectangle(x, y, ACCENT_WIDTH, CARD_HEIGHT, options.accent).setOrigin(0, 0);

    const icon = this.add.image(x + ACCENT_WIDTH + 40, y + CARD_HEIGHT / 2, options.iconKey).setOrigin(0.5);
    icon.setScale(Math.min(1, ICON_BOX / icon.width, ICON_BOX / icon.height));

    this.add.text(x + TEXT_INSET, y + 18, options.title, {
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    const subtitleText = this.add.text(x + TEXT_INSET, y + 46, options.subtitle, {
      fontSize: "11px",
      color: "#b8b8d0",
      wordWrap: { width: CARD_WIDTH - TEXT_INSET - 34 },
    });

    const chevron = this.add
      .text(x + CARD_WIDTH - 22, y + CARD_HEIGHT / 2, "›", { fontSize: "22px", color: CHEVRON_IDLE })
      .setOrigin(0.5);

    this.register(bg, {
      row: options.row,
      col: options.col,
      setHighlighted: (on) => {
        bg.setFillStyle(on ? CARD_FILL_ACTIVE : CARD_FILL);
        bg.setStrokeStyle(on ? 2 : 1, on ? CARD_STROKE_ACTIVE : CARD_STROKE);
        chevron.setColor(on ? "#ffffff" : CHEVRON_IDLE);
      },
      activate: options.onClick,
    });

    return subtitleText;
  }

  // ------------------------------------------------------------ resume bar

  private buildResumeBar(): void {
    this.barBg = this.add
      .rectangle(SIDE_MARGIN, BAR_TOP, CONTENT_WIDTH, BAR_HEIGHT, BAR_FILL)
      .setOrigin(0, 0)
      .setStrokeStyle(1, BAR_STROKE);
    this.barStripe = this.add
      .rectangle(SIDE_MARGIN, BAR_TOP, ACCENT_WIDTH, BAR_HEIGHT, BAR_STROKE)
      .setOrigin(0, 0);

    this.barEyebrow = this.add.text(SIDE_MARGIN + 18, BAR_TOP + 8, "", { fontSize: "11px", color: "#9aa8c8" });
    this.barTitle = this.add.text(SIDE_MARGIN + 18, BAR_TOP + 23, "Checking your saved levels…", {
      fontSize: "14px",
      color: MUTED_TEXT,
    });
    this.barAction = this.add
      .text(SIDE_MARGIN + CONTENT_WIDTH - 18, BAR_TOP + BAR_HEIGHT / 2, "", {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setVisible(false);

    // Interactive from the start so it holds its place in the focus order,
    // but `onBarActivate` stays null until the level list settles: a bar
    // that changed destination under a cursor mid-click would be worse than
    // a bar that briefly does nothing.
    this.barBg.setInteractive({ useHandCursor: true });
    this.register(this.barBg, {
      row: ROW_RESUME,
      col: 0,
      setHighlighted: (on) => {
        this.barBg.setFillStyle(on && this.onBarActivate ? 0x22345f : BAR_FILL);
        this.barBg.setStrokeStyle(on && this.onBarActivate ? 2 : 1, on && this.onBarActivate ? CARD_STROKE_ACTIVE : BAR_STROKE);
        this.barAction.setStyle({ backgroundColor: on && this.onBarActivate ? "#3a5a9c" : "#0f3460" });
      },
      activate: () => this.onBarActivate?.(),
    });
  }

  private showResumeBar(eyebrow: string, title: string, action: string, accent: number, onActivate: () => void): void {
    this.barEyebrow.setText(eyebrow);
    this.barTitle.setText(title).setColor("#ffffff");
    this.barAction.setText(action).setVisible(true);
    this.barStripe.setFillStyle(accent);
    this.onBarActivate = onActivate;
  }

  // ---------------------------------------------------------------- footer

  private buildFooter(): void {
    const cx = GAME_WIDTH / 2;

    // Skin Creator earns a chip rather than the bare text link it used to
    // be: it is a real destination, and as a dim 13px link under a bright
    // green volume slider it was the least prominent thing on the page
    // despite being the only other place you can actually go.
    const skinChip = this.add
      .text(SIDE_MARGIN, FOOTER_ROW_Y, "Skin Creator", {
        fontSize: "13px",
        color: MUTED_TEXT,
        backgroundColor: "#16213e",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    this.register(skinChip, {
      row: ROW_FOOTER,
      col: 0,
      setHighlighted: (on) => {
        skinChip.setColor(on ? "#ffffff" : MUTED_TEXT);
        skinChip.setStyle({ backgroundColor: on ? "#3a5a9c" : "#16213e" });
      },
      activate: () => this.scene.start("SkinEditor"),
    });

    // Grampa, front and centre at the bottom — the mascot the whole game is
    // about, and the piece of art that fills what used to be ~90px of empty
    // page between the last control and the footer line.
    this.add.image(cx, FOOTER_ROW_Y, "wizard-idle").setScale(1.1);

    new VolumeControl(this, GAME_WIDTH - SIDE_MARGIN - VOLUME_WIDTH, FOOTER_ROW_Y, VOLUME_WIDTH);

    this.add
      .text(cx, GAME_HEIGHT - 18, "Arrow keys/WASD/on-screen buttons to move, Space/▲ to jump, once you're playing", {
        fontSize: "11px",
        color: FOOTER_TEXT,
      })
      .setOrigin(0.5);

    // The game's internal resolution is landscape; on a phone held in
    // portrait that gets letterboxed quite small by Scale.FIT (see main.ts).
    // Playable either way — touch buttons still work — but a one-time nudge
    // toward landscape is worth it for how much bigger everything gets.
    // window.innerWidth/innerHeight reflect the actual device viewport,
    // unlike this.scale's always-landscape internal size. Sits just under
    // the subtitle, the one gap on the page nothing else claims.
    if (window.innerWidth < window.innerHeight) {
      this.add
        .text(cx, 88, "Tip: rotate your phone sideways for a bigger view", {
          fontSize: "12px",
          color: "#ffd166",
          backgroundColor: "#000000aa",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5);
    }
  }

  private startTheme(): void {
    // Plays only while the home page is up — stopped on shutdown below, not
    // left running behind the editor/gameplay. Starting it before any user
    // gesture has occurred is fine: Phaser's SoundManager queues playback
    // until the browser's autoplay-unlock happens on the first click/tap,
    // same as it would for any other sound.
    this.theme = this.sound.add("menu-theme", { loop: true });
    this.theme.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.theme?.stop();
      this.theme?.destroy();
    });
  }

  // -------------------------------------------------------- live statuses

  private async refreshStatuses(): Promise<void> {
    await Promise.all([this.refreshLevels(), this.refreshWorlds()]);
  }

  private async refreshLevels(): Promise<void> {
    let levels: LevelSummary[];
    try {
      levels = await this.levelStorage.list();
    } catch {
      // Previously an unhandled rejection: both status lines sat on
      // "Checking…" forever with nothing telling the player why, and the
      // resume bar would have done the same. An offline/consent failure is
      // the most likely reason someone lands here confused.
      this.myLevelsSubtitle.setText("Couldn't reach Drive — open to try again");
      this.showResumeBar("Offline?", "Couldn't load your saved levels", "Try again", ACCENT_SECONDARY, () => {
        this.barTitle.setText("Checking your saved levels…").setColor(MUTED_TEXT);
        this.barAction.setVisible(false);
        this.onBarActivate = null;
        void this.refreshLevels();
      });
      return;
    }

    this.myLevelsSubtitle.setText(
      levels.length === 0
        ? "No saved levels yet — start with New Level or a Template"
        : `${levels.length} saved level${levels.length === 1 ? "" : "s"}`,
    );

    const resume = pickResumeLevel(levels);
    if (resume) {
      this.showResumeBar("Jump back in", resume.name || "Untitled Level", "Continue →", ACCENT_PRIMARY, () =>
        this.openLevel(resume.id),
      );
    } else {
      this.showResumeBar(
        "New here?",
        "Play a ready-made level, then remix it into your own",
        "Browse Templates →",
        ACCENT_PRIMARY,
        () => this.scene.start("Templates"),
      );
    }
  }

  private async refreshWorlds(): Promise<void> {
    try {
      const worlds = await this.worldStorage.list();
      this.worldsSubtitle.setText(
        worlds.length === 0
          ? "No Worlds yet — chain a few levels together"
          : `${worlds.length} World${worlds.length === 1 ? "" : "s"} saved`,
      );
    } catch {
      this.worldsSubtitle.setText("Couldn't reach Drive — open to try again");
    }
  }

  /** Same three lines LevelBrowserScene's Edit button runs. Falls back to
   * the browser rather than dead-ending if the level vanished between the
   * list() that offered it and this click. */
  private async openLevel(id: string): Promise<void> {
    let level = null;
    try {
      level = await this.levelStorage.load(id);
    } catch {
      level = null;
    }
    if (level) this.scene.start("Editor", { level });
    else this.scene.start("LevelBrowser");
  }

  // --------------------------------------------------- hover + focus model

  /** Wires one game object into the shared hover/focus model. Hover and
   * keyboard focus are two inputs to one highlight rather than two competing
   * ones, so moving the mouse over a card while another is key-focused
   * doesn't leave two things lit. */
  private register(hitArea: Phaser.GameObjects.GameObject, target: MenuTarget): void {
    const index = this.targets.length;
    this.targets.push(target);
    hitArea.on("pointerover", () => {
      this.hoverIndex = index;
      this.refreshHighlights();
    });
    hitArea.on("pointerout", () => {
      if (this.hoverIndex === index) this.hoverIndex = -1;
      this.refreshHighlights();
    });
    hitArea.on("pointerdown", () => target.activate());
  }

  /** Phaser only sees pointer moves that land on the canvas, so a cursor
   * flicked off the page never fires the pointerout that would clear the
   * last hovered card — leaving it lit next to whatever the keyboard is
   * focusing. GAME_OUT is the one event that does fire on the way out. */
  private clearHoverOnExit(): void {
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      if (this.hoverIndex < 0) return;
      this.hoverIndex = -1;
      this.refreshHighlights();
    });
  }

  private refreshHighlights(): void {
    this.targets.forEach((target, i) => target.setHighlighted(i === this.hoverIndex || i === this.focusIndex));
  }

  /** True the first time a physical keypress is seen, false for Phaser's
   * re-delivery of one — the fix documented on `lastHandledKeyTime` above. */
  private isFirstDelivery(event: KeyboardEvent): boolean {
    if (event.timeStamp <= this.lastHandledKeyTime) return false;
    this.lastHandledKeyTime = event.timeStamp;
    return true;
  }

  /**
   * Arrow keys to move, Enter/Space to open. Everything on this page is
   * drawn into a canvas, so there is no DOM tab order to inherit — without
   * this the home page is reachable by pointer only, which is the deferred
   * "keyboard path through the menus" item, closed here for the home page.
   */
  private bindKeyboard(): void {
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      const first = this.isFirstDelivery(event);
      switch (event.key) {
        case "ArrowLeft":
          if (first) this.moveFocus(0, -1);
          break;
        case "ArrowRight":
          if (first) this.moveFocus(0, 1);
          break;
        case "ArrowUp":
          if (first) this.moveFocus(-1, 0);
          break;
        case "ArrowDown":
          if (first) this.moveFocus(1, 0);
          break;
        case "Enter":
        case " ":
          if (this.focusIndex < 0) return;
          if (first) this.targets[this.focusIndex].activate();
          break;
        default:
          return;
      }
      // Only for keys actually handled above, so a stray keystroke still
      // behaves normally — this stops Space from scrolling the host page
      // and the arrows from fighting it, without touching Phaser's global
      // capture config (which outlives this scene).
      event.preventDefault();
    });
  }

  /**
   * Moves the focus ring by one step in row/column space. Horizontal moves
   * look for the exact neighbouring column in the same row; vertical moves
   * take whichever target in the next row sits closest to the current
   * column, which is what makes "down" from the right-hand Worlds card land
   * on the full-width resume bar rather than nowhere. A step with no target
   * to land on is a no-op — the ring stays put at the edges instead of
   * wrapping around to the far side of the page.
   */
  private moveFocus(rowDelta: number, colDelta: number): void {
    // The first arrow press lands on the first card regardless of direction,
    // rather than making someone guess which key wakes the page up — and
    // deliberately not on the profile chip above it, which is chrome.
    if (this.focusIndex < 0) {
      const firstCard = this.targets.findIndex((target) => target.row === ROW_CARDS_TOP);
      this.focusIndex = firstCard >= 0 ? firstCard : 0;
      this.refreshHighlights();
      return;
    }

    const from = this.targets[this.focusIndex];
    let next = -1;
    if (colDelta !== 0) {
      next = this.targets.findIndex((target) => target.row === from.row && target.col === from.col + colDelta);
    } else {
      let bestDistance = Infinity;
      this.targets.forEach((target, index) => {
        if (target.row !== from.row + rowDelta) return;
        const distance = Math.abs(target.col - from.col);
        if (distance < bestDistance) {
          bestDistance = distance;
          next = index;
        }
      });
    }

    if (next < 0) return;
    this.focusIndex = next;
    this.refreshHighlights();
  }
}
