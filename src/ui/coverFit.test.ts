import { describe, expect, it } from "vitest";
import { coverFit } from "./coverFit";

/** What the caller actually puts on screen: the crop, scaled. If this does not
 * equal the rectangle, the picture has a gap or an overhang. */
const displayed = (fit: ReturnType<typeof coverFit>) => ({
  width: fit.crop.width * fit.scale,
  height: fit.crop.height * fit.scale,
});

describe("coverFit", () => {
  it("fills the rectangle exactly, with no gap and no overhang", () => {
    // The property that matters, stated once and then checked across shapes.
    for (const [tw, th] of [
      [1920, 1080],
      [100, 400],
      [640, 640],
      [4000, 300],
      [37, 91],
    ] as const) {
      const fit = coverFit(tw, th, 640, 384);
      const shown = displayed(fit);
      expect(shown.width, `${tw}x${th} width`).toBeCloseTo(640);
      expect(shown.height, `${tw}x${th} height`).toBeCloseTo(384);
    }
  });

  it("crops the long axis and keeps all of the short one", () => {
    // A wide picture in a squarer hole: the full height shows, the sides go.
    const fit = coverFit(1000, 500, 400, 400);
    expect(fit.scale).toBe(400 / 500);
    expect(fit.crop.height).toBe(500);
    expect(fit.crop.width).toBe(500);
    expect(fit.crop.y).toBe(0);
    expect(fit.crop.x).toBe(250);
  });

  it("crops the other way round for a tall picture", () => {
    const fit = coverFit(500, 1000, 400, 400);
    expect(fit.crop.width).toBe(500);
    expect(fit.crop.height).toBe(500);
    expect(fit.crop.x).toBe(0);
    expect(fit.crop.y).toBe(250);
  });

  it("stays centred, which is what the masks it replaces did", () => {
    // The masks centred the image on the rect and clipped symmetrically, so the
    // same middle of the picture has to survive or every background shifts.
    const fit = coverFit(900, 600, 300, 300);
    expect(fit.crop.x + fit.crop.width / 2).toBeCloseTo(450);
    expect(fit.crop.y + fit.crop.height / 2).toBeCloseTo(300);
  });

  it("crops nothing when the aspect ratios already match", () => {
    const fit = coverFit(800, 480, 400, 240);
    expect(fit.crop).toEqual({ x: 0, y: 0, width: 800, height: 480 });
    expect(fit.scale).toBe(0.5);
  });

  it("never asks for a crop larger than the frame", () => {
    // Phaser errors on a crop outside the frame rather than drawing something
    // odd, and the driving axis divides back to exactly its own size — so
    // floating point is the only thing between this and a crash.
    for (const [tw, th, rw, rh] of [
      [1920, 1080, 1050, 468],
      [333, 777, 190, 420],
      [7, 3, 1000, 1],
    ] as const) {
      const fit = coverFit(tw, th, rw, rh);
      expect(fit.crop.width, `${tw}x${th}`).toBeLessThanOrEqual(tw);
      expect(fit.crop.height, `${tw}x${th}`).toBeLessThanOrEqual(th);
      expect(fit.crop.x).toBeGreaterThanOrEqual(0);
      expect(fit.crop.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("scales up a small picture rather than leaving a gap", () => {
    // Cover, not contain: spriteFit.ts's fitWithinTile deliberately never
    // enlarges, and this is the opposite case — a backdrop with a hole in it is
    // worse than a soft one.
    const fit = coverFit(50, 50, 400, 300);
    expect(fit.scale).toBe(8);
    expect(displayed(fit).width).toBeCloseTo(400);
  });

  it("answers harmlessly for a texture that has not loaded", () => {
    // An Image reports width 0 before its texture arrives. Dividing by that
    // yields Infinity and a crop of NaN, which Phaser takes without complaint
    // and draws as nothing at all.
    for (const [tw, th] of [
      [0, 0],
      [0, 100],
      [100, 0],
      [-5, 10],
    ] as const) {
      const fit = coverFit(tw, th, 640, 384);
      expect(fit.scale).toBe(1);
      expect(fit.crop).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  it("answers harmlessly for a rectangle with no area", () => {
    expect(coverFit(100, 100, 0, 50).crop.width).toBe(0);
    expect(coverFit(100, 100, 50, 0).scale).toBe(1);
  });
});
