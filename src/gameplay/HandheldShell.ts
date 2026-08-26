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

/** Where PlayScene mounts its volume control, and therefore where the shell
 * puts the recess it sits in. Kept here rather than in PlayScene so the plate
 * and the control cannot drift apart. */
export const VOLUME_CONTROL = { x: GAME_WIDTH / 2 - 90, y: 20, width: 180 };
const VOLUME_HOUSING = {
  x: VOLUME_CONTROL.x - 10,
  y: VOLUME_CONTROL.y - 14,
  width: VOLUME_CONTROL.width + 20,
  height: 28,
};

/**
 * The moulded-plastic look, in one place.
 *
 * Start, the Back button and the volume control all used to carry their own
 * copies of these — Back and the volume were still wearing the old flat
 * `#0f3460` web-panel blue while everything around them had become console
 * hardware. Exported so a restyle moves all of them at once instead of leaving
 * one behind, which is exactly how they drifted apart the first time.
 */
export const CONSOLE_BUTTON = {
  face: 0x3a3d55,
  faceDown: 0x5a6088,
  edge: 0x161826,
  label: "#c8cbe0",
  labelDown: "#ffffff",
};

export interface ConsoleButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  depth: number;
  fontSize?: string;
  /** Degrees. Start is tilted the way a real one is; Back sits square. */
  angle?: number;
  onPress: () => void;
}

/**
 * A pressable console button: filled rect, dark edge, centred label, and the
 * fill/colour swap on press. The rect is the hit area rather than the text, so
 * the target is the whole button — the Back button used to be a bare Text, so
 * only the glyphs themselves were clickable.
 */
export function makeConsoleButton(
  scene: Phaser.Scene,
  options: ConsoleButtonOptions,
): { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const { x, y, width, height, label, depth, angle = 0, onPress } = options;

  const rect = scene.add
    .rectangle(x, y, width, height, CONSOLE_BUTTON.face)
    .setStrokeStyle(2, CONSOLE_BUTTON.edge, 0.8)
    .setAngle(angle)
    .setScrollFactor(0)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y, label, { fontSize: options.fontSize ?? "10px", color: CONSOLE_BUTTON.label, fontStyle: "bold" })
    .setOrigin(0.5)
    .setAngle(angle)
    .setScrollFactor(0)
    .setDepth(depth + 1);

  const release = (): void => {
    rect.setFillStyle(CONSOLE_BUTTON.face);
    text.setColor(CONSOLE_BUTTON.label);
  };
  rect.on("pointerdown", () => {
    rect.setFillStyle(CONSOLE_BUTTON.faceDown);
    text.setColor(CONSOLE_BUTTON.labelDown);
    onPress();
  });
  rect.on("pointerup", release);
  rect.on("pointerout", release);

  return { rect, text };
}

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

    // Recessed housing for the volume control PlayScene mounts in the top
    // bezel (see its VolumeControl call) — without it the slider floats on the
    // shell instead of reading as moulded into it. Sized to the control, at
    // TRIM_DEPTH so it sits under the control's own depth 30.
    scene.add
      .graphics()
      .fillStyle(SURROUND_COLOR, 1)
      .fillRoundedRect(VOLUME_HOUSING.x, VOLUME_HOUSING.y, VOLUME_HOUSING.width, VOLUME_HOUSING.height, 9)
      .lineStyle(1, BODY_EDGE_COLOR, 0.9)
      .strokeRoundedRect(VOLUME_HOUSING.x, VOLUME_HOUSING.y, VOLUME_HOUSING.width, VOLUME_HOUSING.height, 9)
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

  /**
   * Start, at the top of the right band — angled slightly, like the real thing.
   * Pauses the game; see PlayScene.togglePause.
   *
   * It used to sit *below* the face buttons, which put its top edge 7px from
   * the bottom jump button: to a thumb that is one control, not two. The band
   * between the Score HUD (bottom ~29) and the face diamond (top 218) is
   * otherwise empty, so moving up buys ~87px of clearance for free. Under the
   * screen would be the authentic spot, but FOOTER_HEIGHT leaves only 16px
   * between the screen's bottom edge and the body's — not enough for a control.
   */
  private drawStartButton(scene: Phaser.Scene, onStart: () => void): void {
    makeConsoleButton(scene, {
      x: RIGHT_BAND.x + RIGHT_BAND.width / 2,
      y: SCREEN_RECT.y + 64,
      width: START_WIDTH,
      height: START_HEIGHT,
      label: "START",
      depth: TRIM_DEPTH,
      angle: -12,
      onPress: onStart,
    });
  }
}
