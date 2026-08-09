import { describe, expect, it } from "vitest";
import { isStompFromAbove } from "./EnemyBehaviors";

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
