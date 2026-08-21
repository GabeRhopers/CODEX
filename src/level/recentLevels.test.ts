import { describe, expect, it } from "vitest";
import { LevelSummary } from "./LevelSchema";
import { pickResumeLevel } from "./recentLevels";

function summary(id: string, updatedAt: string, name = id): LevelSummary {
  return { id, name, updatedAt };
}

describe("pickResumeLevel", () => {
  it("has nothing to offer an empty library", () => {
    expect(pickResumeLevel([])).toBeNull();
  });

  it("offers the only level there is", () => {
    expect(pickResumeLevel([summary("a", "2026-01-01T00:00:00.000Z")])?.id).toBe("a");
  });

  it("offers the most recently updated level, not the newest in list order", () => {
    const picked = pickResumeLevel([
      summary("old", "2026-01-01T00:00:00.000Z"),
      summary("newest", "2026-08-20T12:00:00.000Z"),
      summary("middle", "2026-04-04T00:00:00.000Z"),
    ]);
    expect(picked?.id).toBe("newest");
  });

  it("sorts a level with an unusable timestamp last instead of returning NaN", () => {
    const picked = pickResumeLevel([summary("broken", "not-a-date"), summary("real", "2020-01-01T00:00:00.000Z")]);
    expect(picked?.id).toBe("real");
  });

  it("still offers something when every timestamp is unusable", () => {
    expect(pickResumeLevel([summary("a", ""), summary("b", "???")])?.id).toBe("a");
  });

  it("resolves a tie the same way every time, so Continue does not shuffle between visits", () => {
    const tied = [summary("first", "2026-05-05T00:00:00.000Z"), summary("second", "2026-05-05T00:00:00.000Z")];
    expect(pickResumeLevel(tied)?.id).toBe("first");
    expect(pickResumeLevel(tied)?.id).toBe("first");
  });
});
