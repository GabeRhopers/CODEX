import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRID_COLS, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

/**
 * The console body Test Play sits inside — a horizontal handheld: screen in
 * the middle, D-pad to its left, face buttons to its right (see TouchControls
 * for those).
 *
 * This costs nothing in playable space, which is the reason it works at all.
 * PlayScene's camera never scrolls, and every level the app can produce is
 * exactly GRID_COLS wide — `createEmptyLevel` defaults to it and nothing passes
 * anything else, and all six bundled templates measure 20 columns — so the
 * level always occupies exactly the same rectangle, and the bands to either
 * side of it were already empty. The old on-screen buttons floated *over* the
 * playfield precisely because nobody had noticed there was room beside it.
 *
 * SCREEN_RECT is asserted against those constants rather than hardcoded, so if
 * the grid or the origins ever move, the bezel moves with them instead of
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
/** The band right of the screen, where the face buttons live. */
export const RIGHT_BAND = { x: SCREEN_RECT.x + SCREEN_RECT.width, width: GAME_WIDTH - (SCREEN_RECT.x + SCREEN_RECT.width) };

// Deliberately lighter than CANVAS_BACKGROUND_COLOR (0x1a1a2e), which the
// letterbox around the canvas also uses: at the first attempt the body was
// within a few points of it and the console read as more page rather than as an
// object with a screen set into it.
const BODY_COLOR = 0x2b2f4c;
const BODY_EDGE_COLOR = 0x3d4268;
const BEZEL_COLOR = 0x14161f;
/** Above the level and its own overlays, below the HUD/controls (depth 40+). */
const SHELL_DEPTH = 30;

/**
 * Draws the body and bezel. Purely decorative — it adds no input handlers and
 * never covers SCREEN_RECT, so nothing about gameplay or hit-testing changes.
 */
export class HandheldShell {
  constructor(scene: Phaser.Scene) {
    const screenRight = SCREEN_RECT.x + SCREEN_RECT.width;
    const screenBottom = SCREEN_RECT.y + SCREEN_RECT.height;

    // Four bands around the screen rather than one full-canvas rectangle with a
    // hole in it: Phaser has no "rectangle minus rectangle", and covering the
    // screen even for one frame would hide the level.
    const bands: [number, number, number, number][] = [
      [0, 0, GAME_WIDTH, SCREEN_RECT.y], // top
      [0, screenBottom, GAME_WIDTH, GAME_HEIGHT - screenBottom], // bottom
      [0, SCREEN_RECT.y, SCREEN_RECT.x, SCREEN_RECT.height], // left
      [screenRight, SCREEN_RECT.y, GAME_WIDTH - screenRight, SCREEN_RECT.height], // right
    ];
    for (const [x, y, w, h] of bands) {
      scene.add.rectangle(x, y, w, h, BODY_COLOR).setOrigin(0, 0).setScrollFactor(0).setDepth(SHELL_DEPTH);
    }

    // A darker recess right around the screen, so it reads as inset glass
    // rather than as a hole in a flat colour. Stroke-only, drawn just outside
    // the screen so it never overlaps a pixel of level.
    scene.add
      .rectangle(SCREEN_RECT.x - 4, SCREEN_RECT.y - 4, SCREEN_RECT.width + 8, SCREEN_RECT.height + 8)
      .setOrigin(0, 0)
      .setStrokeStyle(8, BEZEL_COLOR)
      .setScrollFactor(0)
      .setDepth(SHELL_DEPTH + 1);
    scene.add
      .rectangle(SCREEN_RECT.x - 9, SCREEN_RECT.y - 9, SCREEN_RECT.width + 18, SCREEN_RECT.height + 18)
      .setOrigin(0, 0)
      .setStrokeStyle(2, BODY_EDGE_COLOR)
      .setScrollFactor(0)
      .setDepth(SHELL_DEPTH + 1);

    // The power LED, top-left of the bezel — the one detail that makes the
    // whole thing read as a handheld rather than a picture frame.
    scene.add
      .circle(SCREEN_RECT.x - 26, SCREEN_RECT.y + 10, 4, 0x4ade80)
      .setScrollFactor(0)
      .setDepth(SHELL_DEPTH + 2);
    scene.add
      .text(SCREEN_RECT.x - 26, SCREEN_RECT.y + 22, "ON", { fontSize: "8px", color: "#4a4e68" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(SHELL_DEPTH + 2);
  }
}
