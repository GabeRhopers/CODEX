import { describe, expect, it } from "vitest";
import type { CustomEntityDef } from "../entities/customEntity";
import { CHARACTER_SKIN_ID } from "../skins/spriteFrames";
import { actorTextureKey, cutSceneCast } from "./cutSceneCast";

const bug: CustomEntityDef = {
  id: "custom:bug",
  name: "Grumble Bug",
  category: "enemies",
  basedOn: "enemy-ghost",
  createdAt: "2026-09-13T00:00:00.000Z",
  updatedAt: "2026-09-13T00:00:00.000Z",
};

describe("cutSceneCast", () => {
  it("offers the hero first — the most likely thing to want in a story", () => {
    expect(cutSceneCast([])[0]).toMatchObject({ id: CHARACTER_SKIN_ID, label: "Hero" });
  });

  /**
   * `spawn` is a palette brush and it draws the spawn *arrow* — a level-editing
   * marker, not somebody you would put in a story. Offering markers would put an
   * arrow and a goal flag in the cast list.
   */
  it("leaves the level-editing markers out", () => {
    const ids = cutSceneCast([]).map((member) => member.id);
    expect(ids).not.toContain("player-spawn");
    expect(ids).not.toContain("goal");
  });

  it("offers enemies, items and decor, since a scene is made of all three", () => {
    const ids = cutSceneCast([]).map((member) => member.id);
    expect(ids).toEqual(expect.arrayContaining(["enemy-ghost", "item-coin", "decor-tree"]));
  });

  it("includes whatever this child has invented, after the built-ins", () => {
    const cast = cutSceneCast([bug]);
    expect(cast[cast.length - 1]).toMatchObject({ id: "custom:bug", label: "Grumble Bug" });
  });

  it("gives every member something to draw with", () => {
    for (const member of cutSceneCast([bug])) {
      expect(member.textureKey, member.id).toBeTruthy();
    }
  });
});

describe("actorTextureKey", () => {
  const noSkins = new Map<string, string>();

  it("prefers a custom skin over the built-in art", () => {
    const skins = new Map([["enemy-ghost", "skin-ghost-1"]]);
    expect(actorTextureKey(skins, [], "enemy-ghost")).toBe("skin-ghost-1");
  });

  /** The branch that gives a child who redrew the hero *their* hero in the cut
   * scene, without this module knowing the Skin Creator exists. */
  it("uses a painted player skin for the hero when there is one", () => {
    const skins = new Map([[CHARACTER_SKIN_ID, "skin-player-7"]]);
    expect(actorTextureKey(skins, [], CHARACTER_SKIN_ID)).toBe("skin-player-7");
  });

  it("falls back to the hero's shipped pose, which is in no registry", () => {
    expect(actorTextureKey(noSkins, [], CHARACTER_SKIN_ID)).toBe("wizard-idle");
  });

  it("draws an invented thing with the art it was based on", () => {
    expect(actorTextureKey(noSkins, [bug], "custom:bug")).toBe(actorTextureKey(noSkins, [], "enemy-ghost"));
  });

  /**
   * Null rather than a guess, and it means here what it means in a level: the
   * actor stays in the saved story — dropping it would silently edit somebody's
   * work — and simply is not drawn.
   */
  it("returns null for an invented thing whose definition is gone", () => {
    expect(actorTextureKey(noSkins, [], "custom:vanished")).toBeNull();
  });
});
