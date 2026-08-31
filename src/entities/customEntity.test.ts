import { describe, expect, it } from "vitest";
import { BUILTIN_DECOR_TYPES, BUILTIN_ENEMY_DEFS, BUILTIN_ENEMY_TYPES, BUILTIN_ITEM_TYPES } from "./builtins";
import {
  clonableTypes,
  CustomEntityCategory,
  CustomEntityDef,
  DEFAULT_SPEED_SCALE,
  isCustomEntityId,
  makeCustomEntityId,
  MAX_SPEED_SCALE,
  MIN_SPEED_SCALE,
  resolveBehaviour,
  validationError,
} from "./customEntity";

/**
 * The rules behind "make a new thing that acts like an existing thing".
 *
 * Two of these carry most of the weight. **Behaviour is borrowed, never
 * described** — a custom item resolves to "collect me as a coin", so the single
 * place that knows what a coin does stays single. And **a bad definition
 * resolves to null rather than throwing**, which is what lets a level survive
 * referencing a custom type that was deleted or hand-edited afterwards.
 */

const def = (over: Partial<CustomEntityDef> = {}): CustomEntityDef => ({
  id: makeCustomEntityId("abc"),
  name: "Star Fruit",
  category: "items",
  basedOn: "item-coin",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  ...over,
});

describe("custom entity ids", () => {
  it("are distinguishable from every built-in type", () => {
    // The whole reason for the prefix: EntityType stays a closed union, so no
    // existing switch loses its exhaustiveness and no custom id can be mistaken
    // for a built-in.
    for (const builtin of [...BUILTIN_ITEM_TYPES, ...BUILTIN_DECOR_TYPES, ...BUILTIN_ENEMY_TYPES]) {
      expect(isCustomEntityId(builtin), builtin).toBe(false);
    }
    expect(isCustomEntityId(makeCustomEntityId("abc"))).toBe(true);
  });

  it("rejects the bare prefix, which carries no identity", () => {
    expect(isCustomEntityId("custom:")).toBe(false);
    expect(isCustomEntityId("")).toBe(false);
    expect(isCustomEntityId("customary")).toBe(false);
  });
});

describe("clonableTypes", () => {
  it("offers exactly the built-ins of that family", () => {
    expect(clonableTypes("items")).toEqual(BUILTIN_ITEM_TYPES);
    expect(clonableTypes("decor")).toEqual(BUILTIN_DECOR_TYPES);
    expect(clonableTypes("enemies")).toEqual(BUILTIN_ENEMY_TYPES);
  });

  it("never offers a marker", () => {
    // Markers are singleton per area and carry level structure — a level with
    // two goals or two spawns is not a thing the rest of the code can mean.
    const markers = ["player-spawn", "goal", "checkpoint", "basket-sub", "basket-up", "chest"];
    for (const category of ["items", "enemies", "decor"] as CustomEntityCategory[]) {
      for (const marker of markers) {
        expect(clonableTypes(category), `${category}/${marker}`).not.toContain(marker);
      }
    }
  });
});

describe("validationError", () => {
  it("accepts a well-formed definition", () => {
    expect(validationError(def())).toBeNull();
  });

  it("rejects a definition based on something from another family", () => {
    // The mistake this catches is a real one to make in a UI: pick "enemies",
    // then a coin.
    expect(validationError(def({ category: "enemies", basedOn: "item-coin" }))).toContain("cannot be based on");
    expect(validationError(def({ category: "items", basedOn: "enemy-ghost" }))).toContain("cannot be based on");
  });

  it("rejects a definition based on a marker", () => {
    expect(validationError(def({ basedOn: "goal" }))).toContain("cannot be based on");
    expect(validationError(def({ category: "enemies", basedOn: "player-spawn" }))).toContain("cannot be based on");
  });

  it("insists on a name", () => {
    expect(validationError(def({ name: "   " }))).toBe("Give it a name.");
  });

  it("rejects an id that is not a custom id", () => {
    expect(validationError(def({ id: "item-coin" as never }))).toContain("not a custom entity id");
  });

  it("holds speed inside its bounds, including the nonsense values", () => {
    const enemy = { category: "enemies" as const, basedOn: "enemy-ghost" as const };
    expect(validationError(def({ ...enemy, params: { speedScale: MIN_SPEED_SCALE } }))).toBeNull();
    expect(validationError(def({ ...enemy, params: { speedScale: MAX_SPEED_SCALE } }))).toBeNull();
    for (const bad of [0, -1, MAX_SPEED_SCALE + 0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validationError(def({ ...enemy, params: { speedScale: bad } })), String(bad)).toContain("Speed has to be");
    }
  });
});

describe("resolveBehaviour", () => {
  it("resolves an item to the built-in's own collect path", () => {
    // Not an effect name: the built-in type itself, handed straight back to the
    // existing collect code, so nothing about what a coin does is duplicated.
    for (const basedOn of BUILTIN_ITEM_TYPES) {
      expect(resolveBehaviour(def({ basedOn })), basedOn).toEqual({ kind: "item", collectAs: basedOn });
    }
  });

  it("resolves decor to something inert", () => {
    for (const basedOn of BUILTIN_DECOR_TYPES) {
      expect(resolveBehaviour(def({ category: "decor", basedOn })), basedOn).toEqual({ kind: "decor" });
    }
  });

  it("inherits each enemy's own stompability rather than guessing one", () => {
    // enemy-spike is the odd one out: touching it costs a hit however you land.
    // A custom enemy based on it has to keep that, or the copy is a lie.
    for (const builtin of BUILTIN_ENEMY_DEFS) {
      expect(resolveBehaviour(def({ category: "enemies", basedOn: builtin.type })), builtin.type).toEqual({
        kind: "enemy",
        stompable: builtin.stompable,
        speedScale: DEFAULT_SPEED_SCALE,
      });
    }
  });

  it("carries a speed tweak through, and defaults it when absent", () => {
    const enemy = { category: "enemies" as const, basedOn: "enemy-bat" as const };
    expect(resolveBehaviour(def({ ...enemy, params: { speedScale: 1.5 } }))).toMatchObject({ speedScale: 1.5 });
    expect(resolveBehaviour(def(enemy))).toMatchObject({ speedScale: DEFAULT_SPEED_SCALE });
  });

  it("returns null for anything invalid instead of throwing", () => {
    // The load-bearing half. A level referencing a since-deleted or
    // hand-corrupted custom type has to still open — the caller renders it
    // inert, exactly as backgroundLoader and musicLoader already fall back.
    for (const bad of [
      def({ name: "" }),
      def({ basedOn: "goal" }),
      def({ category: "enemies", basedOn: "item-coin" }),
      def({ category: "enemies", basedOn: "enemy-bat", params: { speedScale: 99 } }),
    ]) {
      expect(resolveBehaviour(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("does not mutate the definition it was given", () => {
    const original = def({ category: "enemies", basedOn: "enemy-ghost" });
    const copy = JSON.parse(JSON.stringify(original)) as CustomEntityDef;
    resolveBehaviour(original);
    expect(original).toEqual(copy);
  });
});
