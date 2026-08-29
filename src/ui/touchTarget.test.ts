import { describe, expect, it } from "vitest";
import {
  circleHitArgs,
  GUIDELINE_CSS_PX,
  hitRectFor,
  hitRectForCircle,
  localHitRect,
  MIN_TAP_PX,
  PHONE_LANDSCAPE_SCALE,
  reachesGuideline,
} from "./touchTarget";

/**
 * The sizing rule behind every enlarged tap target.
 *
 * The cell cap is the one that matters: grid neighbours sit exactly one cell
 * apart, so a hit area allowed to overflow its cell would overlap the next
 * control's and a tap aimed at one would land on the other — trading a small
 * target for a wrong one.
 */

/** The real palette grid: a 32px icon in an 80x54 cell (EditorUI's ICON_COL_X
 * spacing and ICON_ROW_HEIGHT). */
const PALETTE_ICON = { width: 32, height: 32 };
const PALETTE_CELL = { width: 80, height: 54 };

describe("MIN_TAP_PX", () => {
  it("is the 44px guideline expressed in game pixels", () => {
    expect(MIN_TAP_PX).toBe(Math.ceil(GUIDELINE_CSS_PX / PHONE_LANDSCAPE_SCALE));
    // Sanity on the arithmetic itself: a phone held sideways renders the canvas
    // at ~0.80, so the guideline costs a little over 50 game pixels.
    expect(MIN_TAP_PX).toBeGreaterThan(GUIDELINE_CSS_PX);
    expect(MIN_TAP_PX).toBeLessThan(60);
  });

  it("really does land on the guideline once scaled back down", () => {
    expect(MIN_TAP_PX * PHONE_LANDSCAPE_SCALE).toBeGreaterThanOrEqual(GUIDELINE_CSS_PX);
  });
});

describe("hitRectFor", () => {
  it("grows a small control to the minimum where the cell allows", () => {
    const rect = hitRectFor(PALETTE_ICON, PALETTE_CELL);
    // The 80px column has room for the full minimum; the 54px row is one pixel
    // short of it, so width reaches it and height stops at the cell.
    expect(rect.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect(rect.height).toBe(PALETTE_CELL.height);
  });

  it("nearly trebles a palette brush's reach, and stops exactly where the row does", () => {
    // The number the whole change exists for: 25.7 CSS px before, 43.4 after,
    // with the icon still drawn at 32 and the layout untouched.
    //
    // 43.4, not 44: the row is 54 game px and the guideline costs 55, so the
    // cell caps it 0.6px short. Buying that back means a taller row, which runs
    // the grid into the skin picker beneath it. Asserted as the real number
    // rather than rounded up to the one that sounds better.
    const rect = hitRectFor(PALETTE_ICON, PALETTE_CELL);
    const before = PALETTE_ICON.height * PHONE_LANDSCAPE_SCALE;
    const after = rect.height * PHONE_LANDSCAPE_SCALE;
    expect(before).toBeLessThan(26);
    expect(after).toBeGreaterThan(43);
    expect(after).toBeLessThan(GUIDELINE_CSS_PX);
  });

  it("never exceeds its cell, whatever the minimum asks for", () => {
    // The mis-tap guarantee. A 54px-tall cell cannot give a target any more
    // room, and taking it would come out of the neighbour's.
    for (const min of [MIN_TAP_PX, 80, 500]) {
      const rect = hitRectFor(PALETTE_ICON, PALETTE_CELL, min);
      expect(rect.width, `min=${min}`).toBeLessThanOrEqual(PALETTE_CELL.width);
      expect(rect.height, `min=${min}`).toBeLessThanOrEqual(PALETTE_CELL.height);
    }
  });

  it("never shrinks below the art it covers", () => {
    // A cell smaller than its own content would otherwise produce a hit area
    // that misses part of the thing you can see.
    const rect = hitRectFor({ width: 40, height: 40 }, { width: 10, height: 10 });
    expect(rect.width).toBe(40);
    expect(rect.height).toBe(40);
  });

  it("centres on the object, which is what Phaser hit areas expect", () => {
    const rect = hitRectFor(PALETTE_ICON, PALETTE_CELL);
    expect(rect.x).toBe(-rect.width / 2);
    expect(rect.y).toBe(-rect.height / 2);
  });

  it("leaves an already-large control alone", () => {
    const big = { width: 200, height: 60 };
    const rect = hitRectFor(big, { width: 200, height: 60 });
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(60);
  });

  it("tiles without overlap across a real grid", () => {
    // Two neighbouring cells, one cell apart: their hit areas must not meet.
    const rect = hitRectFor(PALETTE_ICON, PALETTE_CELL);
    const firstRight = 0 + rect.x + rect.width;
    const secondLeft = PALETTE_CELL.width + rect.x;
    expect(firstRight).toBeLessThanOrEqual(secondLeft);
  });
});

describe("reachesGuideline", () => {
  it("says yes when the cell really has the room", () => {
    expect(reachesGuideline(PALETTE_ICON, { width: 80, height: 80 })).toBe(true);
  });

  it("says no for the palette, which misses by a single pixel", () => {
    // Honest rather than flattering: the row is 54 and the minimum is 55, so a
    // brush lands at 43.4 CSS px instead of 44. This assertion is what stops
    // that shortfall from being quietly forgotten — if the row ever grows, it
    // fails and the comment gets revisited.
    expect(reachesGuideline(PALETTE_ICON, PALETTE_CELL)).toBe(false);
    expect(PALETTE_CELL.height).toBe(MIN_TAP_PX - 1);
  });

  it("says no for a list row, which does not", () => {
    // Recorded rather than worked around: a 48px row body cannot reach the
    // guideline however the hit area is drawn, and pretending otherwise would
    // be the kind of claim this project has been bitten by.
    expect(reachesGuideline({ width: 60, height: 24 }, { width: 970, height: 48 })).toBe(false);
  });
});

describe("hitRectForCircle", () => {
  it("sizes from the diameter, not the radius", () => {
    const rect = hitRectForCircle(15, { width: 200, height: 200 });
    expect(rect.width).toBeGreaterThanOrEqual(30);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
  });

  it("still respects a tight cell", () => {
    // A World Maker map cell is ~71x54, so a node's target is capped by the row.
    const rect = hitRectForCircle(15, { width: 71, height: 54 });
    expect(rect.height).toBeLessThanOrEqual(54);
    expect(rect.width).toBeLessThanOrEqual(71);
  });
});

describe("localHitRect", () => {
  it("centres the target on the object, not on the origin", () => {
    // The bug this exists to stop, found the hard way: a Phaser Arc of radius 15
    // has size 30x30 with its centre at (15, 15) in hit-area space, so handing
    // it a centre-relative rectangle shifted the whole target up and left by a
    // radius. Presses near the middle of the node stopped registering, and the
    // symptom was a drag that silently never started.
    const rect = localHitRect({ width: 30, height: 30 }, { width: 53, height: 53 });
    expect(rect.x).toBe(-11.5);
    expect(rect.y).toBe(-11.5);
    // The object's centre (15, 15) has to sit at the centre of the target.
    expect(rect.x + rect.width / 2).toBe(15);
    expect(rect.y + rect.height / 2).toBe(15);
  });

  it("leaves a target the same size as its object exactly covering it", () => {
    const rect = localHitRect({ width: 40, height: 40 }, { width: 40, height: 40 });
    expect(rect).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  });
});

describe("circleHitArgs", () => {
  it("keeps the node's centre at the centre of its target", () => {
    const [x, y, w, h] = circleHitArgs(15, { width: 71, height: 54 });
    expect(x + w / 2).toBe(15);
    expect(y + h / 2).toBe(15);
  });

  it("grows the target well past the circle it covers", () => {
    const [, , w, h] = circleHitArgs(15, { width: 121, height: 72 });
    expect(w).toBeGreaterThan(30);
    expect(h).toBeGreaterThan(30);
    expect(w).toBeGreaterThanOrEqual(MIN_TAP_PX);
  });

  it("still refuses to spill outside a tight cell", () => {
    const [, , w, h] = circleHitArgs(15, { width: 71, height: 40 });
    expect(w).toBeLessThanOrEqual(71);
    expect(h).toBeLessThanOrEqual(40);
  });
});
