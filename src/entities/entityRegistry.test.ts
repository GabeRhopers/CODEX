import { describe, expect, it } from "vitest";
import { BUILTIN_DECOR_TYPES, BUILTIN_ENEMY_DEFS, BUILTIN_ITEM_TYPES, builtinTextureKey } from "./builtins";
import { CustomEntityDef, DEFAULT_SPEED_SCALE, makeCustomEntityId } from "./customEntity";
import { collectAsFor, customBrushes, decorTypes, enemyDefs, findDef, itemTypes, textureKeyFor } from "./entityRegistry";

/**
 * The merge every consumer reads instead of the built-in constants.
 *
 * Two guarantees carry it: **built-ins keep their identity and order**, so an
 * existing level's spawn and draw order cannot shift just because a custom type
 * exists; and **invalid definitions never surface**, so no caller has to
 * remember to check one that was hand-edited or written by an older build.
 */

const def = (over: Partial<CustomEntityDef> = {}): CustomEntityDef => ({
  id: makeCustomEntityId("a"),
  name: "Star Fruit",
  category: "items",
  basedOn: "item-coin",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  ...over,
});

const broken = def({ id: makeCustomEntityId("bad"), name: "", basedOn: "goal" });

describe("with no custom types at all", () => {
  it("is exactly the built-ins", () => {
    expect(itemTypes()).toEqual([...BUILTIN_ITEM_TYPES]);
    expect(decorTypes()).toEqual([...BUILTIN_DECOR_TYPES]);
    expect(enemyDefs().map((d) => d.type)).toEqual(BUILTIN_ENEMY_DEFS.map((d) => d.type));
  });
});

describe("merging", () => {
  it("appends customs after the built-ins, leaving their order alone", () => {
    // Order is load-bearing: PlayScene spawns and draws in list order, so a
    // custom type must not reshuffle what a level already looks like.
    const merged = itemTypes([def()]);
    expect(merged.slice(0, BUILTIN_ITEM_TYPES.length)).toEqual([...BUILTIN_ITEM_TYPES]);
    expect(merged[merged.length - 1]).toBe(makeCustomEntityId("a"));
  });

  it("files each custom under its own family and nowhere else", () => {
    const defs = [
      def({ id: makeCustomEntityId("i"), category: "items", basedOn: "item-coin" }),
      def({ id: makeCustomEntityId("d"), category: "decor", basedOn: "decor-bush" }),
      def({ id: makeCustomEntityId("e"), category: "enemies", basedOn: "enemy-bat" }),
    ];
    expect(itemTypes(defs)).toContain(makeCustomEntityId("i"));
    expect(itemTypes(defs)).not.toContain(makeCustomEntityId("d"));
    expect(decorTypes(defs)).toContain(makeCustomEntityId("d"));
    expect(enemyDefs(defs).map((d) => d.type)).toContain(makeCustomEntityId("e"));
  });

  it("drops an invalid definition from every list", () => {
    expect(itemTypes([broken])).toEqual([...BUILTIN_ITEM_TYPES]);
    expect(decorTypes([broken])).toEqual([...BUILTIN_DECOR_TYPES]);
    expect(enemyDefs([broken])).toHaveLength(BUILTIN_ENEMY_DEFS.length);
    expect(customBrushes([broken])).toEqual([]);
    expect(findDef([broken], broken.id)).toBeUndefined();
  });

  it("never produces two entries with the same id", () => {
    const defs = [def(), def({ id: makeCustomEntityId("b"), name: "Moon Fruit" })];
    const ids = itemTypes(defs);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("enemyDefs", () => {
  it("gives built-ins their own texture and no speed change", () => {
    for (const builtin of BUILTIN_ENEMY_DEFS) {
      const entry = enemyDefs().find((d) => d.type === builtin.type)!;
      expect(entry.textureKey).toBe(builtin.textureKey);
      expect(entry.stompable).toBe(builtin.stompable);
      expect(entry.speedScale).toBe(DEFAULT_SPEED_SCALE);
    }
  });

  it("gives a custom enemy the art of what it copies, until one is drawn", () => {
    // The fallback that makes a custom entity always renderable: it looks like
    // the thing it acts like until someone gives it a face.
    const entry = enemyDefs([def({ category: "enemies", basedOn: "enemy-ghost" })])[BUILTIN_ENEMY_DEFS.length];
    expect(entry.textureKey).toBe(builtinTextureKey("enemy-ghost"));
  });

  it("inherits stompability and carries a speed tweak", () => {
    const [spikey] = enemyDefs([
      def({ category: "enemies", basedOn: "enemy-spike", params: { speedScale: 1.5 } }),
    ]).slice(BUILTIN_ENEMY_DEFS.length);
    // enemy-spike is the one that hurts however you land on it.
    expect(spikey.stompable).toBe(false);
    expect(spikey.speedScale).toBe(1.5);
  });
});

describe("collectAsFor", () => {
  it("answers with the built-in whose collect path should run", () => {
    const defs = [def({ basedOn: "item-heart" })];
    expect(collectAsFor(defs, makeCustomEntityId("a"))).toBe("item-heart");
  });

  it("is undefined for a built-in, a stranger, and a non-item", () => {
    const defs = [def({ id: makeCustomEntityId("e"), category: "enemies", basedOn: "enemy-bat" })];
    expect(collectAsFor(defs, "item-coin")).toBeUndefined();
    expect(collectAsFor(defs, makeCustomEntityId("nobody"))).toBeUndefined();
    expect(collectAsFor(defs, makeCustomEntityId("e"))).toBeUndefined();
  });
});

describe("customBrushes", () => {
  it("produces palette entries the editor already understands", () => {
    expect(customBrushes([def({ name: "Star Fruit" })])).toEqual([
      {
        id: makeCustomEntityId("a"),
        category: "items",
        kind: "entity",
        label: "Star Fruit",
        textureKey: builtinTextureKey("item-coin"),
        entityType: makeCustomEntityId("a"),
      },
    ]);
  });

  it("keeps id and entityType the same, which is what placement relies on", () => {
    const [brush] = customBrushes([def()]);
    expect(brush.entityType).toBe(brush.id);
  });
});

describe("enemyDefs", () => {
  it("sizes an invented enemy like the one it copies", () => {
    // `sizeAs` exists because hitbox proportions are keyed by built-in type; a
    // custom id would find nothing there and fall back to a generic box, which
    // would make a copied spike quietly a different shape from a spike.
    const spikeling = def({ id: makeCustomEntityId("s"), category: "enemies", basedOn: "enemy-spike" });
    const custom = enemyDefs([spikeling]).find((d) => d.type === spikeling.id)!;
    expect(custom.sizeAs).toBe("enemy-spike");
    expect(custom.stompable).toBe(false); // inherited, not assumed
    for (const builtin of enemyDefs()) expect(builtin.sizeAs, builtin.type).toBe(builtin.type);
  });
});

describe("textureKeyFor", () => {
  it("gives a built-in its own art", () => {
    for (const type of [...BUILTIN_ITEM_TYPES, ...BUILTIN_DECOR_TYPES]) {
      expect(textureKeyFor([], type), type).toBe(builtinTextureKey(type));
    }
    // The ghost is the one that proves this is a lookup and not the convention:
    // its texture is "enemy-ghost-pillow", not its type.
    expect(textureKeyFor([], "enemy-ghost")).toBe("enemy-ghost-pillow");
  });

  it("dresses an invented type as the thing it copies", () => {
    const ghostling = def({ id: makeCustomEntityId("g"), category: "enemies", basedOn: "enemy-ghost" });
    expect(textureKeyFor([ghostling], ghostling.id)).toBe("enemy-ghost-pillow");
  });

  it("gives nothing for a definition that has gone away", () => {
    // Null is the whole deleted-definition contract: the level keeps the entity
    // in its data, and it simply is not drawn. There is no record of what it
    // looked like, so drawing *something* would be an invention.
    expect(textureKeyFor([], makeCustomEntityId("deleted"))).toBeNull();
    expect(textureKeyFor([broken], broken.id)).toBeNull();
  });
});
