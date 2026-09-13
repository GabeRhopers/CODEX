import { describe, expect, it } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import {
  ACTOR_SCALES,
  actorScaleFor,
  BAND_HEIGHT,
  bandHeightOf,
  DEFAULT_ACTOR_SCALE,
  placementFor,
  stageHeightOf,
  stepActorScale,
} from "./cutSceneLayout";

/**
 * The point of this module is that two screens agree. `CutSceneScene` draws a
 * panel at full canvas size and the Cut Scene Maker draws the same panel in a
 * small box beside the fields — and the small box is where characters are
 * positioned. If the band is a different share of the height in each, an author
 * stands somebody on the ground and finds them behind the caption on the link.
 */
describe("panel geometry", () => {
  it("gives the full-size panel back the numbers it was built from", () => {
    expect(bandHeightOf(GAME_HEIGHT)).toBe(BAND_HEIGHT);
    expect(stageHeightOf(GAME_HEIGHT)).toBeCloseTo(GAME_HEIGHT - BAND_HEIGHT);
  });

  it("keeps the band the same share of the panel at any size", () => {
    const full = bandHeightOf(GAME_HEIGHT) / GAME_HEIGHT;
    for (const height of [196, 224, 120, 468]) {
      expect(bandHeightOf(height) / height, `at ${height}`).toBeCloseTo(full, 2);
    }
  });

  it("shrinks an actor by the same ratio as the panel it is drawn in", () => {
    expect(actorScaleFor(GAME_WIDTH, 1)).toBe(1);
    expect(actorScaleFor(GAME_WIDTH / 2, 1)).toBe(0.5);
    expect(actorScaleFor(GAME_WIDTH, 2)).toBe(2);
    // The maker's own stage, which is where this matters.
    expect(actorScaleFor(440, 2)).toBeCloseTo(2 * (440 / GAME_WIDTH));
  });

  it("treats a missing scale as 1", () => {
    expect(actorScaleFor(GAME_WIDTH)).toBe(1);
  });
});

describe("stepActorScale", () => {
  it("walks the ladder in both directions", () => {
    expect(stepActorScale(2, 1)).toBe(2.5);
    expect(stepActorScale(2, -1)).toBe(1.5);
  });

  /** Same convention as movePanel: nowhere further to go returns what it was
   * given, so a caller can skip a redraw on identity. */
  it("stops at both ends rather than wrapping", () => {
    const smallest = ACTOR_SCALES[0];
    const largest = ACTOR_SCALES[ACTOR_SCALES.length - 1];
    expect(stepActorScale(smallest, -1)).toBe(smallest);
    expect(stepActorScale(largest, 1)).toBe(largest);
  });

  /** A scale from before this ladder existed, or hand-written into a bundle,
   * still has to step somewhere sensible rather than jumping to the start. */
  it("steps from the nearest rung when handed a size not on the ladder", () => {
    expect(stepActorScale(2.4, 1)).toBe(3);
    expect(stepActorScale(0.2, 1)).toBe(1.5);
  });

  it("offers nothing smaller than a level-sized character", () => {
    // A panel is the full 1050 wide where a level shows 20 tiles across 640, so
    // anything under 1 is smaller than it looks in the game and too small to read.
    expect(Math.min(...ACTOR_SCALES)).toBe(1);
    expect(ACTOR_SCALES).toContain(DEFAULT_ACTOR_SCALE);
  });
});

describe("placementFor", () => {
  /**
   * The bug this exists for: every new character landed at x 0.5, so tapping a
   * second one put it exactly on the first and it read as nothing happening.
   */
  it("fans characters out instead of stacking them", () => {
    const xs = [0, 1, 2, 3, 4].map((n) => placementFor(n).x);
    expect(new Set(xs).size).toBe(5);
  });

  it("stands them on the floor of the stage", () => {
    expect(placementFor(0).y).toBe(1);
  });

  it("keeps every lane on screen, and wraps rather than walking off the edge", () => {
    for (let n = 0; n < 20; n += 1) {
      const { x } = placementFor(n);
      expect(x, `actor ${n}`).toBeGreaterThanOrEqual(0);
      expect(x, `actor ${n}`).toBeLessThanOrEqual(1);
    }
  });
});
