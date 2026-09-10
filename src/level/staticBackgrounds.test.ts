import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";
import { STATIC_BACKGROUNDS } from "./staticBackgrounds";

/**
 * The shipped backgrounds are the shape they are rendered in.
 *
 * `StaticBackground.ts` cover-fits each of these into the console's screen, so
 * an image whose aspect ratio is far from the screen's loses whichever axis is
 * proportionally too long. Nothing was checking that, and on 2026-09-10
 * `meadow.png` turned out to be **1120x1120** where the other three are
 * 1120x625: cover-fit into 640x384 it showed as 640x640, with 40% of its height
 * cropped away and two enormous trees filling what was left, their trunks
 * running behind the level's ground strip and reappearing below it.
 *
 * It survived for as long as it did because it is the *default* background and
 * nothing had ever selected it — the demo game picks `sunny-valley`, so the one
 * image everybody's first level wears was the one nobody had looked at.
 *
 * A file test, deliberately: what is wrong is the asset, not any code that
 * reads it, and the PNG header is enough to say so. It reads dimensions
 * directly rather than through Pillow or a canvas — an IHDR is at a fixed
 * offset and this needs no more than that.
 */

const STATIC_DIR = fileURLToPath(new URL("../../public/assets/backgrounds/static/", import.meta.url));

/** Width and height out of a PNG's IHDR chunk, which is always the first one:
 * an 8-byte signature, a 4-byte length, "IHDR", then the two dimensions. */
function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(0, 24);
  expect(header.subarray(12, 16).toString("ascii"), `${path} is not a PNG`).toBe("IHDR");
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** What the images are cover-fit into — the level's viewport, from the same
 * constants StaticBackground uses. */
const SCREEN = (GRID_COLS * TILE_SIZE) / (GRID_ROWS * TILE_SIZE);

describe("the shipped static backgrounds", () => {
  it("all exist", () => {
    for (const bg of STATIC_BACKGROUNDS) {
      expect(existsSync(`${STATIC_DIR}${bg.id}.png`), `${bg.id}.png is missing`).toBe(true);
    }
  });

  it("are all the same shape as each other", () => {
    // The cheapest possible statement of "one of these is not like the others",
    // and the one that would have caught meadow on the day it was committed.
    const shapes = STATIC_BACKGROUNDS.map((bg) => {
      const { width, height } = pngSize(`${STATIC_DIR}${bg.id}.png`);
      return `${bg.id}: ${width}x${height}`;
    });
    const sizes = new Set(shapes.map((s) => s.split(": ")[1]));
    expect(sizes.size, `these are not all one size — ${shapes.join(", ")}`).toBe(1);
  });

  it("are close enough to the screen's shape to survive a cover-fit", () => {
    // Not an exact match — a little overhang is what gives a cover-fit
    // something to trim, and the three good images are 1.79 against the
    // screen's 1.67. A third again either way is the point at which a
    // noticeable part of the picture stops being visible at all.
    for (const bg of STATIC_BACKGROUNDS) {
      const { width, height } = pngSize(`${STATIC_DIR}${bg.id}.png`);
      const ratio = width / height;
      expect(ratio, `${bg.id}.png is ${width}x${height} — too tall for the screen it renders in`).toBeGreaterThan(
        SCREEN / 1.33,
      );
      expect(ratio, `${bg.id}.png is ${width}x${height} — too wide for the screen it renders in`).toBeLessThan(
        SCREEN * 1.33,
      );
    }
  });
});
