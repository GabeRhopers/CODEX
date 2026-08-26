import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRID_COLS, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

/**
 * The console Test Play sits inside — a horizontal handheld: screen in the
 * middle, D-pad to its left, face buttons to its right (see TouchControls for
 * those), Start below them.
 *
 * This costs nothing in playable space, which is the reason it works at all.
 * PlayScene's camera never scrolls and every level the app can produce is
 * exactly GRID_COLS wide — `createEmptyLevel` defaults to it, nothing passes
 * anything else, and all six bundled templates measure 20 columns — so the
 * level always occupies exactly the same rectangle, and the bands to either
 * side of it were already empty.
 *
 * *Drawn behind the level, not around it.* The body is one rounded rectangle at
 * depth -200, under StaticBackground's -100. That is what lets it be a shape
 * with rounded ends and an inset screen surround rather than four rectangles
 * tiled into the gaps: the level's background is cover-fitted and masked to
 * exactly SCREEN_RECT, so it paints over the middle of the body completely and
 * only the console's outline is ever visible. The first version filled the
 * bands edge to edge and read as a picture frame for precisely this reason —
 * there was no silhouette, because every pixel of the canvas was body.
 *
 * SCREEN_RECT is derived from the grid constants rather than hardcoded, so if
 * the grid or the origins ever move, the console moves with them instead of
 * quietly cropping the level.
 */

/** Where the level actually renders — the "screen". */
export const SCREEN_RECT = {
  x: GRID_ORIGIN_X,
  y: GRID_ORIGIN_Y,
  width: GRID_COLS * TILE_SIZE,
  height: GRID_ROWS * TILE_SIZE,
};

/** The band left of the screen, where the D-pad lives. */
export const LEFT_BAND = { x: 0, width: SCREEN_RECT.x };
/** The band right of the screen, where the face buttons and Start live. */
export const RIGHT_BAND = { x: SCREEN_RECT.x + SCREEN_RECT.width, width: GAME_WIDTH - (SCREEN_RECT.x + SCREEN_RECT.width) };

/** Vertical centre of both control clusters, and the line the lower details
 * hang below. Shared so the D-pad and the face diamond can't drift apart. */
export const CONTROL_ROW_Y = SCREEN_RECT.y + SCREEN_RECT.height - 152;

// Deliberately lighter than CANVAS_BACKGROUND_COLOR (0x1a1a2e), which the
// camera paints behind everything and which now reads as the surface the
// console is lying on.
const BODY_COLOR = 0x2b2f4c;
const BODY_EDGE_COLOR = 0x3d4268;
const SURROUND_COLOR = 0x20243c;
const BEZEL_COLOR = 0x14161f;
const DETAIL_COLOR = 0x4a4e68;

/** Below StaticBackground's -100, so the level paints over the middle. */
const BODY_DEPTH = -200;
/** Above the level, below the HUD (30) and controls (40). */
const TRIM_DEPTH = 20;

const START_WIDTH = 74;
const START_HEIGHT = 22;

export interface HandheldShellOptions {
  /** Fired by the Start button. PlayScene pauses on it. */
  onStart: () => void;
}

export class HandheldShell {
  constructor(scene: Phaser.Scene, options: HandheldShellOptions) {
    this.drawBody(scene);
    this.drawTrim(scene);
    this.drawStartButton(scene, options.onStart);
  }

  /** One Graphics for the whole silhouette: the shell outline, plus the darker
   * panel the screen is set into. Both sit under the level. */
  private drawBody(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(BODY_DEPTH);

    // The shell. Generous corner radius on all four corners is most of what
    // separates "handheld" from "rectangle"; the margin leaves the camera's
    // background visible around it so it reads as an object.
    g.fillStyle(BODY_COLOR, 1);
    g.fillRoundedRect(10, 8, GAME_WIDTH - 20, GAME_HEIGHT - 20, 56);
    g.lineStyle(2, BODY_EDGE_COLOR, 1);
    g.strokeRoundedRect(10, 8, GAME_WIDTH - 20, GAME_HEIGHT - 20, 56);

    // The screen surround — a darker inset panel wider and taller than the
    // screen itself, so the glass looks recessed into the shell rather than
    // painted onto it.
    g.fillStyle(SURROUND_COLOR, 1);
    g.fillRoundedRect(SCREEN_RECT.x - 32, SCREEN_RECT.y - 28, SCREEN_RECT.width + 64, SCREEN_RECT.height + 56, 18);
  }

  /** The details that sell it: the bezel right around the glass, a power LED, a
   * speaker grille and a wordmark. All outside SCREEN_RECT, so none of it can
   * cover a pixel of level. */
  private drawTrim(scene: Phaser.Scene): void {
    scene.add
      .rectangle(SCREEN_RECT.x - 4, SCREEN_RECT.y - 4, SCREEN_RECT.width + 8, SCREEN_RECT.height + 8)
      .setOrigin(0, 0)
      .setStrokeStyle(8, BEZEL_COLOR)
      .setScrollFactor(0)
      .setDepth(TRIM_DEPTH);

    // Power LED, on the surround beside the glass.
    scene.add.circle(SCREEN_RECT.x - 18, SCREEN_RECT.y + 8, 4, 0x4ade80).setScrollFactor(0).setDepth(TRIM_DEPTH);
    scene.add
      .text(SCREEN_RECT.x - 18, SCREEN_RECT.y + 18, "ON", { fontSize: "8px", color: "#5a5f85" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(TRIM_DEPTH);

    // Wordmark under the D-pad.
    scene.add
      .text(LEFT_BAND.x + LEFT_BAND.width / 2, CONTROL_ROW_Y + 78, "RHOPERS", {
        fontSize: "11px",
        color: "#5a5f85",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TRIM_DEPTH);

    // Speaker grille, angled the way a handheld's usually is.
    for (let i = 0; i < 4; i++) {
      scene.add
        .circle(LEFT_BAND.x + LEFT_BAND.width / 2 - 24 + i * 16, CONTROL_ROW_Y + 100 + i * 3, 3, DETAIL_COLOR)
        .setScrollFactor(0)
        .setDepth(TRIM_DEPTH);
    }
  }

  /** Start, below the face buttons — a pill, angled slightly like the real
   * thing. Pauses the game; see PlayScene.togglePause. */
  private drawStartButton(scene: Phaser.Scene, onStart: () => void): void {
    const x = RIGHT_BAND.x + RIGHT_BAND.width / 2;
    const y = CONTROL_ROW_Y + 88;

    const pill = scene.add
      .rectangle(x, y, START_WIDTH, START_HEIGHT, 0x3a3d55)
      .setStrokeStyle(2, 0x161826, 0.8)
      .setAngle(-12)
      .setScrollFactor(0)
      .setDepth(TRIM_DEPTH)
      .setInteractive({ useHandCursor: true });
    const label = scene.add
      .text(x, y, "START", { fontSize: "10px", color: "#c8cbe0", fontStyle: "bold" })
      .setOrigin(0.5)
      .setAngle(-12)
      .setScrollFactor(0)
      .setDepth(TRIM_DEPTH + 1);

    pill.on("pointerdown", () => {
      pill.setFillStyle(0x5a6088);
      label.setColor("#ffffff");
      onStart();
    });
    const release = (): void => {
      pill.setFillStyle(0x3a3d55);
      label.setColor("#c8cbe0");
    };
    pill.on("pointerup", release);
    pill.on("pointerout", release);
  }
}
