import { describe, expect, it } from "vitest";
import { advanceLoop, createLoopState, LOOP_FRAME_INTERVAL_MS } from "./spriteLoop";

describe("advanceLoop", () => {
  it("holds frame 0 until the interval elapses", () => {
    const state = createLoopState();
    expect(advanceLoop(state, LOOP_FRAME_INTERVAL_MS - 1, 2)).toBe(0);
    expect(advanceLoop(state, 1, 2)).toBe(1);
  });

  it("cycles back to the start", () => {
    const state = createLoopState();
    const seen = [0, 1, 2, 3].map(() => advanceLoop(state, LOOP_FRAME_INTERVAL_MS, 2));
    expect(seen).toEqual([1, 0, 1, 0]);
  });

  it("keeps the remainder instead of resetting the clock, so the cycle can't drift slow", () => {
    // Two steps of 3/4 of an interval is 1.5 intervals: one frame now, and
    // half an interval already banked toward the next. Resetting to zero on
    // each advance would throw that half away and run the animation slower
    // than it is supposed to be — subtly wrong rather than obviously broken.
    const drifting = createLoopState();
    const threeQuarters = LOOP_FRAME_INTERVAL_MS * 0.75;
    expect(advanceLoop(drifting, threeQuarters, 4)).toBe(0);
    expect(advanceLoop(drifting, threeQuarters, 4)).toBe(1);
    expect(drifting.elapsedMs).toBeCloseTo(LOOP_FRAME_INTERVAL_MS * 0.5);
  });

  it("skips ahead correctly when one frame took several intervals", () => {
    // A stalled loop should land where the clock says, not one frame on.
    const state = createLoopState();
    expect(advanceLoop(state, LOOP_FRAME_INTERVAL_MS * 3, 4)).toBe(3);
    expect(advanceLoop(state, LOOP_FRAME_INTERVAL_MS * 2, 4)).toBe(1);
  });

  it("treats one frame or none as a still, with no timer running", () => {
    const single = createLoopState();
    expect(advanceLoop(single, LOOP_FRAME_INTERVAL_MS * 10, 1)).toBe(0);
    expect(single.elapsedMs).toBe(0);
    expect(advanceLoop(single, LOOP_FRAME_INTERVAL_MS * 10, 0)).toBe(0);
  });

  it("stays in range when a skin is swapped for one with fewer frames mid-level", () => {
    const state = createLoopState();
    advanceLoop(state, LOOP_FRAME_INTERVAL_MS * 3, 4);
    expect(state.frame).toBe(3);
    expect(advanceLoop(state, 0, 2)).toBeLessThan(2);
  });

  it("never returns a negative or fractional frame", () => {
    const state = createLoopState();
    for (let i = 0; i < 50; i++) {
      const frame = advanceLoop(state, 37, 3);
      expect(Number.isInteger(frame)).toBe(true);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(3);
    }
  });
});
