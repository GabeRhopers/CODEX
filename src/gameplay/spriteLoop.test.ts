import { describe, expect, it } from "vitest";
import { advanceLoop, advanceOnce, createLoopState, LOOP_FRAME_INTERVAL_MS } from "./spriteLoop";

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

describe("advanceLoop at a caller's own interval", () => {
  // The character has walked at 140ms since before this module existed
  // (WALK_FRAME_INTERVAL_MS in wizardAnimation.ts). Sharing one timer must not
  // quietly re-time his stride to an enemy's 180ms.
  const WALK_MS = 140;

  it("steps on the interval it is given, not the default", () => {
    const state = createLoopState();
    expect(advanceLoop(state, WALK_MS - 1, 2, WALK_MS)).toBe(0);
    expect(advanceLoop(state, 1, 2, WALK_MS)).toBe(1);
  });

  it("is slower at the default than at a walk interval, for the same elapsed time", () => {
    // Guards the direction of the two constants: if LOOP_FRAME_INTERVAL_MS ever
    // drops below the walk cadence, the comment on it is wrong.
    expect(LOOP_FRAME_INTERVAL_MS).toBeGreaterThan(WALK_MS);
    const slow = createLoopState();
    const fast = createLoopState();
    advanceLoop(slow, WALK_MS, 4);
    advanceLoop(fast, WALK_MS, 4, WALK_MS);
    expect(slow.frame).toBe(0);
    expect(fast.frame).toBe(1);
  });
});

describe("advanceOnce", () => {
  it("plays through and then holds the last frame instead of cycling", () => {
    const state = createLoopState();
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS, 3)).toBe(1);
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS, 3)).toBe(2);
    // The whole reason this function exists: advanceLoop would be back at 0 here.
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS, 3)).toBe(2);
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 10, 3)).toBe(2);
  });

  it("differs from advanceLoop only at the wrap", () => {
    const once = createLoopState();
    const loop = createLoopState();
    for (let i = 0; i < 2; i++) {
      expect(advanceOnce(once, LOOP_FRAME_INTERVAL_MS, 3)).toBe(advanceLoop(loop, LOOP_FRAME_INTERVAL_MS, 3));
    }
    expect(advanceOnce(once, LOOP_FRAME_INTERVAL_MS, 3)).toBe(2);
    expect(advanceLoop(loop, LOOP_FRAME_INTERVAL_MS, 3)).toBe(0);
  });

  it("holds frame 0 until the interval elapses", () => {
    const state = createLoopState();
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS - 1, 2)).toBe(0);
    expect(advanceOnce(state, 1, 2)).toBe(1);
  });

  it("skips ahead to the end when one frame took several intervals, without overshooting", () => {
    const state = createLoopState();
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 7, 3)).toBe(2);
  });

  it("treats one frame or none as a still, with no timer running", () => {
    const state = createLoopState();
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 5, 1)).toBe(0);
    expect(state.elapsedMs).toBe(0);
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 5, 0)).toBe(0);
  });

  it("stops accumulating once it is holding, so a long hold cannot bank time", () => {
    // A held pose can last the rest of a run. If elapsedMs kept growing, a skin
    // swapped mid-hold for one with more frames would jump straight to its end.
    const state = createLoopState();
    advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 4, 2);
    expect(state.frame).toBe(1);
    expect(state.elapsedMs).toBe(0);
    advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 100, 2);
    expect(state.elapsedMs).toBe(0);
  });

  it("clamps rather than overshoots when a skin is swapped for one with fewer frames mid-hold", () => {
    const state = createLoopState();
    advanceOnce(state, LOOP_FRAME_INTERVAL_MS * 3, 4);
    expect(state.frame).toBe(3);
    expect(advanceOnce(state, LOOP_FRAME_INTERVAL_MS, 2)).toBe(1);
  });

  it("honours a caller's interval the same way advanceLoop does", () => {
    const state = createLoopState();
    expect(advanceOnce(state, 140, 3, 140)).toBe(1);
  });

  it("never returns a negative or fractional frame", () => {
    const state = createLoopState();
    for (const delta of [0, 1, 16.7, LOOP_FRAME_INTERVAL_MS * 2.5]) {
      const frame = advanceOnce(state, delta, 3);
      expect(Number.isInteger(frame)).toBe(true);
      expect(frame).toBeGreaterThanOrEqual(0);
    }
  });
});
