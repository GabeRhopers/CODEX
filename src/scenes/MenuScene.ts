import Phaser from "phaser";
import { VolumeControl } from "../audio/VolumeControl";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { TEMPLATE_LEVELS } from "../level/templateLevels";
import { clearActiveProfile, loadActiveProfile } from "../profile/Profile";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";

const CARD_WIDTH = 480;
const CARD_HEIGHT = 72;
const CARD_GAP_X = 24;
const CARD_GAP_Y = 16;
const GRID_TOP = 112;

/**
 * Home page: the game's entry point after boot. A 2x2 card grid covers the
 * four things there are to do — start something new, browse ready-made
 * templates, pick up your own saved work, or chain levels into a course —
 * each with a live status line instead of a bare button label, so the
 * whole picture (how much you've built) is visible without navigating in.
 */
export class MenuScene extends Phaser.Scene {
  private levelStorage: StorageAdapter = getLevelStorage();
  private worldStorage: WorldStorageAdapter = getWorldStorage();
  private theme?: Phaser.Sound.BaseSound;

  constructor() {
    super("Menu");
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add.image(50, 34, "wizard-idle").setScale(1.1);
    this.add.image(GAME_WIDTH - 66, 34, "enemy-ghost-pillow").setScale(0.9);
    this.add.image(GAME_WIDTH - 34, 34, "goal-portal").setScale(0.75);

    // Not a real account switch — see Profile.ts's docstring — just clears
    // the name-tag and sends whoever's at the device back through
    // ProfileGateScene to pick a different one; the Drive connection
    // itself (one shared sign-in behind all three profiles) is untouched.
    const activeProfile = loadActiveProfile();
    const profileText = this.add
      .text(8, 6, `${activeProfile ?? "?"} · Switch profile`, { fontSize: "11px", color: "#a6a6c8" })
      .setInteractive({ useHandCursor: true });
    profileText.on("pointerover", () => profileText.setColor("#ffffff"));
    profileText.on("pointerout", () => profileText.setColor("#a6a6c8"));
    profileText.on("pointerdown", () => {
      clearActiveProfile();
      this.scene.start("ProfileGate");
    });

    this.add
      .text(cx, 26, "Rhopers Game Maker", {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 56, "Paint a level, place a spawn and a goal, then play it — or chain a few into a World.", {
        fontSize: "12px",
        color: "#c8c8e0",
      })
      .setOrigin(0.5);

    const leftX = cx - CARD_WIDTH - CARD_GAP_X / 2;
    const rightX = cx + CARD_GAP_X / 2;
    const row1Y = GRID_TOP;
    const row2Y = GRID_TOP + CARD_HEIGHT + CARD_GAP_Y;

    this.makeCard(leftX, row1Y, "marker-spawn", "New Level", "Start from a blank grid", () =>
      this.scene.start("Editor"),
    );

    const templateSubtitle = this.makeCard(
      rightX,
      row1Y,
      "tile-brick-icon",
      "Templates",
      "Checking templates…",
      () => this.scene.start("Templates"),
    );
    templateSubtitle.setText(
      `${TEMPLATE_LEVELS.length} pre-built levels — play one, or use it as a starting point`,
    );

    const myLevelsSubtitle = this.makeCard(leftX, row2Y, "wizard-idle", "My Levels", "Checking saved levels…", () =>
      this.scene.start("LevelBrowser"),
    );
    const worldsSubtitle = this.makeCard(rightX, row2Y, "goal-portal", "Worlds", "Checking Worlds…", () =>
      this.scene.start("WorldBrowser"),
    );

    void this.levelStorage.list().then((levels) => {
      myLevelsSubtitle.setText(
        levels.length === 0
          ? "No saved levels yet — start with New Level or a Template"
          : `${levels.length} saved level${levels.length === 1 ? "" : "s"}`,
      );
    });

    void this.worldStorage.list().then((worlds) => {
      worldsSubtitle.setText(
        worlds.length === 0
          ? "No Worlds yet — chain a few levels together"
          : `${worlds.length} World${worlds.length === 1 ? "" : "s"} saved`,
      );
    });

    this.add
      .text(cx, GAME_HEIGHT - 20, "Arrow keys/WASD/on-screen buttons to move, Space/▲ to jump, once you're playing", {
        fontSize: "11px",
        color: "#666688",
      })
      .setOrigin(0.5);

    // The game's internal resolution is landscape (920x448); on a phone
    // held in portrait that gets letterboxed quite small by Scale.FIT (see
    // main.ts). Playable either way — touch buttons still work — but a
    // one-time nudge toward landscape is worth it for how much bigger
    // everything gets. window.innerWidth/innerHeight reflect the actual
    // device viewport, unlike this.scale's always-landscape internal size.
    if (window.innerWidth < window.innerHeight) {
      this.add
        .text(cx, row2Y + CARD_HEIGHT + 20, "Tip: rotate your phone sideways for a bigger view", {
          fontSize: "12px",
          color: "#ffd166",
          backgroundColor: "#000000aa",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5);
    }

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

    new VolumeControl(this, cx - 90, row2Y + CARD_HEIGHT + 48, 180);

    // A text link, not a 5th card — the 2x2 grid above is laid out with
    // hardcoded pixel positions (leftX/rightX/row1Y/row2Y), sized so
    // GAME_HEIGHT barely clears it; a real 5th card would mean a new row,
    // cascading into gameConfig.ts constants every other scene also reads.
    // Skin Creator is also a much lighter-weight destination than the
    // other four (no "how much you've built" status line worth surfacing
    // here), so a link fits its actual weight better anyway.
    const skinCreatorLink = this.add
      .text(cx, row2Y + CARD_HEIGHT + 80, "Skin Creator", { fontSize: "13px", color: "#a6a6c8" })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skinCreatorLink.on("pointerover", () => skinCreatorLink.setColor("#ffffff"));
    skinCreatorLink.on("pointerout", () => skinCreatorLink.setColor("#a6a6c8"));
    skinCreatorLink.on("pointerdown", () => this.scene.start("SkinEditor"));
  }

  /** Returns the subtitle Text object so callers can swap in a live status
   * line once an async list() resolves, instead of a separate footer row. */
  private makeCard(
    x: number,
    y: number,
    iconKey: string,
    title: string,
    subtitle: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const bg = this.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0x0f3460)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const icon = this.add.image(x + 38, y + CARD_HEIGHT / 2, iconKey).setOrigin(0.5);
    const scale = Math.min(1, 38 / icon.width, 38 / icon.height);
    icon.setScale(scale);

    this.add.text(x + 76, y + 14, title, { fontSize: "18px", color: "#ffffff", fontStyle: "bold" });
    const subtitleText = this.add.text(x + 76, y + 40, subtitle, {
      fontSize: "11px",
      color: "#b8b8d0",
      wordWrap: { width: CARD_WIDTH - 92 },
    });

    bg.on("pointerdown", onClick);
    bg.on("pointerover", () => bg.setFillStyle(0x3a5a9c));
    bg.on("pointerout", () => bg.setFillStyle(0x0f3460));

    return subtitleText;
  }
}
