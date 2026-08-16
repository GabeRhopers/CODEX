import { describe, expect, it } from "vitest";
import { createGhostState, isStompFromAbove } from "./EnemyBehaviors";

type FakeBody = { velocity: { y: number }; bottom: number; top: number; height: number };
type FakeSprite = { body: FakeBody };

function fakeSprite(body: FakeBody): FakeSprite {
  return { body };
}

describe("isStompFromAbove", () => {
  it("is a stomp when the player is falling and lands on the ghost's top half", () => {
    const player = fakeSprite({ velocity: { y: 200 }, bottom: 100, top: 0, height: 0 });
    const ghost = fakeSprite({ velocity: { y: 0 }, bottom: 140, top: 100, height: 40 });
    expect(isStompFromAbove(player as never, ghost as never)).toBe(true);
  });

  it("is NOT a stomp when the player is moving upward (mid-jump ascent)", () => {
    const player = fakeSprite({ velocity: { y: -200 }, bottom: 100, top: 0, height: 0 });
    const ghost = fakeSprite({ velocity: { y: 0 }, bottom: 140, top: 100, height: 40 });
    expect(isStompFromAbove(player as never, ghost as never)).toBe(false);
  });

  it("is NOT a stomp when the player is falling but touches the ghost's lower half (a side/front hit)", () => {
    const player = fakeSprite({ velocity: { y: 50 }, bottom: 125, top: 25, height: 0 });
    const ghost = fakeSprite({ velocity: { y: 0 }, bottom: 140, top: 100, height: 40 });
    expect(isStompFromAbove(player as never, ghost as never)).toBe(false);
  });

  it("is NOT a stomp when grounded and walking into the ghost (velocity.y === 0)", () => {
    const player = fakeSprite({ velocity: { y: 0 }, bottom: 140, top: 40, height: 0 });
    const ghost = fakeSprite({ velocity: { y: 0 }, bottom: 140, top: 100, height: 40 });
    expect(isStompFromAbove(player as never, ghost as never)).toBe(false);
  });
});

describe("createGhostState", () => {
  it("defaults to the spawn-relative patrol range when no level bounds are given", () => {
    const ghost = { x: 500 } as never;
    const state = createGhostState(ghost);
    expect(state).toEqual({ minX: 500 - 64, maxX: 500 + 64, direction: 1 });
  });

  it("clamps the patrol range so it never extends past a nearby level edge", () => {
    // Spawned 1 tile (32px) from the left edge — the un-clamped range
    // would start 32px before the edge (500-64=436, edge at 468).
    const ghost = { x: 500 } as never;
    const state = createGhostState(ghost, 468, 2000);
    expect(state.minX).toBe(468);
    expect(state.maxX).toBe(500 + 64);
  });

  it("clamps both sides at once for an enemy spawned near a narrow level", () => {
    const ghost = { x: 500 } as never;
    const state = createGhostState(ghost, 480, 520);
    expect(state.minX).toBe(480);
    expect(state.maxX).toBe(520);
  });
});
