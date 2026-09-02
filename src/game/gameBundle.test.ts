import { describe, expect, it } from "vitest";
import { LevelArea, LevelData } from "../level/LevelSchema";
import { createEmptyGame } from "./GameSchema";
import {
  bundleFileName,
  bundleProblems,
  bundleSizeBytes,
  bundleSummary,
  GameBundle,
  referencedBackgroundIds,
  referencedCustomEntityIds,
  referencedMusicIds,
} from "./gameBundle";

/**
 * What a game has to carry with it to be playable by someone who is not you.
 *
 * Two rules do the work. **Heavy assets are collected by reach** — a track is
 * capped at 4MB, so carrying unused ones is the difference between a few MB on a
 * link and tens of them; the walk therefore has to see all three areas of every
 * level, not just Main. And **every dangling reference is findable**, because a
 * bundle that quietly omits a level produces a game that ends early with no
 * explanation.
 */

const area = (over: Partial<LevelArea> = {}): LevelArea => ({
  width: 10,
  height: 8,
  layers: { ground: [] },
  entities: [],
  ...over,
});

const level = (id: string, over: Partial<LevelData> = {}): LevelData => ({
  schemaVersion: 2,
  id,
  name: id,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  tileSize: 32,
  ...area(),
  ...over,
});

const bundle = (over: Partial<GameBundle> = {}): GameBundle => ({
  format: 1,
  exportedAt: "2026-09-02T00:00:00.000Z",
  game: { ...createEmptyGame("g1"), title: "Quest", worldIds: ["w1"] },
  worlds: [{ id: "w1", name: "World One", levelIds: ["l1"], createdAt: "", updatedAt: "" }],
  levels: [level("l1")],
  skins: {},
  customEntities: [],
  backgrounds: [],
  music: [],
  ...over,
});

describe("referenced assets", () => {
  it("looks in all three areas, not just Main", () => {
    // Sub and Up carry their own background and music choice, so a walk that
    // only read the level's top-level fields would silently drop theirs.
    const l = level("l1", {
      customBackgroundId: "bg-main",
      customMusicId: "mus-main",
      subArea: area({ customBackgroundId: "bg-sub", customMusicId: "mus-sub" }),
      upArea: area({ customBackgroundId: "bg-up", customMusicId: "mus-up" }),
    });
    expect(referencedBackgroundIds([l]).sort()).toEqual(["bg-main", "bg-sub", "bg-up"]);
    expect(referencedMusicIds([l]).sort()).toEqual(["mus-main", "mus-sub", "mus-up"]);
  });

  it("counts each asset once however many areas share it", () => {
    const l = level("l1", { customMusicId: "mus", subArea: area({ customMusicId: "mus" }) });
    expect(referencedMusicIds([l])).toEqual(["mus"]);
  });

  it("ignores the legacy embedded fields, which travel inside the level already", () => {
    // customBackgroundData/customMusicData are data URLs on the level itself, so
    // there is nothing in a library to collect for them.
    const l = level("l1", { customBackgroundData: "data:image/jpeg;base64,AAA", customMusicData: "data:audio/mp3;base64,AAA" });
    expect(referencedBackgroundIds([l])).toEqual([]);
    expect(referencedMusicIds([l])).toEqual([]);
  });

  it("finds invented types wherever they are placed", () => {
    const l = level("l1", {
      entities: [{ type: "custom:star", x: 1, y: 1 }],
      subArea: area({ entities: [{ type: "item-coin", x: 2, y: 2 }, { type: "custom:ghost", x: 3, y: 3 }] }),
    });
    expect(referencedCustomEntityIds([l]).sort()).toEqual(["custom:ghost", "custom:star"]);
  });

  it("says nothing about a game with no uploads at all", () => {
    expect(referencedBackgroundIds([level("l1")])).toEqual([]);
    expect(referencedMusicIds([level("l1")])).toEqual([]);
    expect(referencedCustomEntityIds([level("l1")])).toEqual([]);
  });
});

describe("bundleProblems", () => {
  it("is silent on a sound bundle", () => {
    expect(bundleProblems(bundle())).toEqual([]);
  });

  it("names a world the game lists but has not got", () => {
    const b = bundle({ game: { ...createEmptyGame("g1"), title: "Q", worldIds: ["w1", "w2"] } });
    expect(bundleProblems(b)).toEqual([expect.stringContaining("w2")]);
  });

  it("names a level a world lists but has not got — the one that ends a world early", () => {
    const b = bundle({ worlds: [{ id: "w1", name: "World One", levelIds: ["l1", "gone"], createdAt: "", updatedAt: "" }] });
    const problems = bundleProblems(b);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("World One");
    expect(problems[0]).toContain("gone");
  });

  it("names a missing background, track and invented thing", () => {
    const b = bundle({
      levels: [
        level("l1", {
          customBackgroundId: "bg",
          customMusicId: "mus",
          entities: [{ type: "custom:star", x: 1, y: 1 }],
        }),
      ],
    });
    const problems = bundleProblems(b);
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toContain("bg");
    expect(problems.join(" ")).toContain("mus");
    expect(problems.join(" ")).toContain("custom:star");
  });

  it("is satisfied once the assets are present", () => {
    const b = bundle({
      levels: [level("l1", { customBackgroundId: "bg", customMusicId: "mus" })],
      backgrounds: [{ id: "bg", name: "Sky", imageData: "data:,", uploadedBy: "Mike", updatedAt: "" }],
      music: [{ id: "mus", name: "Tune", audioData: "data:,", uploadedBy: "Mike", updatedAt: "" }],
    });
    expect(bundleProblems(b)).toEqual([]);
  });
});

describe("size and summary", () => {
  it("measures the real serialisation, where the assets actually are", () => {
    const small = bundle();
    const withTrack = bundle({
      music: [{ id: "m", name: "Tune", audioData: "x".repeat(5000), uploadedBy: "Mike", updatedAt: "" }],
    });
    expect(bundleSizeBytes(withTrack)).toBeGreaterThan(bundleSizeBytes(small) + 4000);
  });

  it("says what it made, size included", () => {
    // The size is the point of showing a summary at all, so it has to be in
    // there — a 4MB track is otherwise invisible until someone tries to send
    // the file.
    expect(bundleSummary(bundle())).toMatch(/^1 world, 1 level, \d+(\.\d+)?(B|KB|MB)$/);
  });

  it("pluralises honestly", () => {
    const two = bundle({
      game: { ...createEmptyGame("g1"), title: "Q", worldIds: ["w1", "w2"] },
      worlds: [
        { id: "w1", name: "A", levelIds: [], createdAt: "", updatedAt: "" },
        { id: "w2", name: "B", levelIds: [], createdAt: "", updatedAt: "" },
      ],
      levels: [],
    });
    expect(bundleSummary(two)).toMatch(/^2 worlds, 0 levels, /);
  });
});

describe("bundleFileName", () => {
  it("turns a title into something safe to save", () => {
    expect(bundleFileName("Grampa's Quest")).toBe("grampa-s-quest.rhopers-game.json");
    expect(bundleFileName("  Ice   Cave!  ")).toBe("ice-cave.rhopers-game.json");
  });

  it("still gives a name when the title is unusable", () => {
    // Validation refuses an untitled game, but a title of only punctuation
    // passes it and would otherwise leave a file called ".rhopers-game.json".
    expect(bundleFileName("!!!")).toBe("game.rhopers-game.json");
    expect(bundleFileName("")).toBe("game.rhopers-game.json");
  });
});
