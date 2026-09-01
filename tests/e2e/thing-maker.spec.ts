import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, clickScenePoint, gotoApp, readSceneField, selectPaletteCategory, startEditorWithLevel, tileCenter } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { customDef, seedCustomEntities } from "./support/customEntities";
import type { PlayerStats } from "../../src/gameplay/PlayerStats";

/**
 * Inventing a thing, through the screen a person actually uses.
 *
 * `custom-entities.spec.ts` already proves the runtime — placed, played, scored
 * — by seeding definitions through the debug hook. This proves the half that
 * hook was standing in for: that the Thing Maker can produce one at all, that
 * what it writes is what the editor and Play then read, and that drawing its
 * sprite is reachable from making it.
 *
 * The end-to-end assertion is deliberately the same one: **the score rises.**
 * A thing invented here is not really an item until the coin's own collect path
 * runs for it.
 */

const NAME_FIELD = "Star Fruit"; // the field's placeholder, and the name we type

async function openThingMaker(page: Page): Promise<void> {
  await clickByText(page, "Menu", "Thing Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ThingMaker"));
}

/** Fills the name field and commits it, the way LevelNameInput expects. */
async function typeName(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder(NAME_FIELD).fill(name);
  await page.getByPlaceholder(NAME_FIELD).press("Enter");
}

/** Every definition currently in the library, read back through the scene. */
function storedThings(page: Page): Promise<{ name: string; category: string; basedOn: string }[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("ThingMaker") as unknown as {
      defs: { name: string; category: string; basedOn: string }[];
    };
    return scene.defs.map((d) => ({ name: d.name, category: d.category, basedOn: d.basedOn }));
  });
}

const RUNWAY = () =>
  makeLevel(
    makeArea(14, 10, 8, [
      { type: "player-spawn", x: 1, y: 7 },
      { type: "goal", x: 12, y: 7 },
    ]),
  );

test("a thing invented here can be placed, and scores as what it copies", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openThingMaker(page);

  await clickByText(page, "ThingMaker", "+ New Thing");
  await typeName(page, "Star Fruit");
  // Items is the category a new thing opens on, and Coin the built-in it opens
  // pointed at — so this is the shortest real path to a custom coin.
  await clickByText(page, "ThingMaker", "Save");
  await expect.poll(() => storedThings(page)).toEqual([
    { name: "Star Fruit", category: "items", basedOn: "item-coin" },
  ]);

  // Now the half that matters: what the maker wrote is what the editor offers.
  // Left via the Back button rather than scene.start from the test: Phaser's
  // global ScenePlugin starts a scene without stopping the current one, and a
  // still-live Thing Maker draws its own full-screen background over whatever
  // comes next.
  await clickByText(page, "ThingMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await startEditorWithLevel(page, RUNWAY());
  await selectPaletteCategory(page, "Editor", "Items");
  await clickIconWithLabel(page, "Editor", "Star Fruit");
  const target = tileCenter(5, 7);
  await clickScenePoint(page, target.x, target.y);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  expect((await readSceneField<PlayerStats>(page, "Play", "stats")).score).toBe(0);
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() => readSceneField<PlayerStats>(page, "Play", "stats").then((s) => s.score), { timeout: 20_000 })
    .toBe(1);
  await page.keyboard.up("ArrowRight");
});

test("a thing with no name is refused, with the reason validation gives", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openThingMaker(page);
  await clickByText(page, "ThingMaker", "+ New Thing");

  // Saving a blank one must not write anything, and must say why rather than
  // inventing an "Untitled" the way a level name would.
  await clickByText(page, "ThingMaker", "Save");
  await clickByText(page, "ThingMaker", "Give it a name.");
  expect(await storedThings(page)).toEqual([]);
});

test("switching family never leaves it copying something from the old one", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openThingMaker(page);
  await clickByText(page, "ThingMaker", "+ New Thing");
  await typeName(page, "Zoom Ghost");

  // Items/Coin is where it starts. Switching to Enemy has to abandon the coin —
  // an enemy based on one is exactly what validationError refuses, so without
  // the reset this save would either fail or store nonsense.
  await clickByText(page, "ThingMaker", "Enemy");
  await clickByText(page, "ThingMaker", "Fast");
  await clickByText(page, "ThingMaker", "Save");

  await expect.poll(() => storedThings(page)).toEqual([
    { name: "Zoom Ghost", category: "enemies", basedOn: "enemy-ghost" },
  ]);
});

test("editing one changes it, and deleting one takes two taps", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [customDef({ id: "custom:star", name: "Star Fruit" })]);
  await openThingMaker(page);
  await expect.poll(() => storedThings(page).then((t) => t.length)).toBe(1);

  await clickByText(page, "ThingMaker", "Edit");
  await typeName(page, "Moon Fruit");
  await clickByText(page, "ThingMaker", "Save");
  await expect.poll(() => storedThings(page).then((t) => t.map((d) => d.name))).toEqual(["Moon Fruit"]);

  // One tap only arms it — the same discipline every other destructive action
  // in this app follows.
  await clickByText(page, "ThingMaker", "Delete");
  expect(await storedThings(page)).toHaveLength(1);
  await clickByText(page, "ThingMaker", "Delete? Tap again");
  await expect.poll(() => storedThings(page)).toEqual([]);
});

test("Save & draw sprite lands on the canvas for the thing just made", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openThingMaker(page);
  await clickByText(page, "ThingMaker", "+ New Thing");
  await typeName(page, "Star Fruit");
  await clickByText(page, "ThingMaker", "Save & draw sprite →");

  // Straight to painting, not to the 40-tile pick grid — which is the whole
  // point of the handoff.
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await expect.poll(() => readSceneField<string>(page, "SkinEditor", "mode"), { timeout: 20_000 }).toBe("canvas");
  const brushId = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      target?: { brush: { id: string; label: string } };
    };
    return scene.target?.brush.id ?? null;
  });
  expect(brushId).toMatch(/^custom:/);
});

test("the Skin Creator's grid pages rather than drawing an invented thing off the canvas", async ({ page }) => {
  test.slow();
  // 38 built-in targets and room for exactly 40, so three invented things is
  // more than one page — the case that made paging necessary at all.
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: "custom:a", name: "Star Fruit" }),
    customDef({ id: "custom:b", name: "Moon Fruit" }),
    customDef({ id: "custom:c", name: "Totem", category: "decor", basedOn: "decor-tree" }),
  ]);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");

  await expect.poll(() => visibleLabels(page)).toContain("Page 1 of 2");
  expect(await visibleLabels(page)).not.toContain("Totem");
  await clickByText(page, "SkinEditor", "Next ›");
  await expect.poll(() => visibleLabels(page)).toContain("Totem");
});

/** Every string currently drawn in a scene. */
function visibleLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type Obj = { type?: string; text?: string; visible?: boolean; list?: Obj[] };
    const out: string[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.visible === false) continue;
        if (child.type === "Text" && child.text) out.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return out;
  });
}
