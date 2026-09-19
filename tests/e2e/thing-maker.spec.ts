import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, clickScenePoint, gotoApp, openThings, pixelCanvasBox, readSceneField, selectPaletteCategory, startEditorWithLevel, tileCenter, waitForSkinCanvas } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { customDef, listCustomEntities, seedCustomEntities } from "./support/customEntities";
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

/**
 * Menu → Things → invent a new one.
 *
 * One door and, since 2026-09-19, one screen: the Things grid lists everything
 * paintable, and an invented thing opens with two tabs — **Draw** for its
 * pixels and **What it does** for its name, family, speed and sound. A new one
 * opens on the fields, because Save refuses a thing with no name.
 */
async function openNewThing(page: Page): Promise<void> {
  await openThings(page);
  await clickByText(page, "SkinEditor", "+ New Thing");
  await expect.poll(() => sceneMode(page)).toBe("thing");
}

/** Which mode the one screen is in: the grid, the drawing, or the fields. */
function sceneMode(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { mode?: string };
    return scene.mode;
  });
}

/** Menu → Things → the tile for an existing thing, then its fields tab. */
async function openThing(page: Page, label: string): Promise<void> {
  await openThings(page);
  await pickThing(page, label);
}

/** The tile, when the Things grid is already on screen. A tile opens the Draw
 * tab; the fields are one tap further, which is the shape of the merge. */
async function pickThing(page: Page, label: string): Promise<void> {
  await expect.poll(() => sceneMode(page)).toBe("pick-brush");
  await clickIconWithLabel(page, "SkinEditor", label);
  await expect.poll(() => sceneMode(page)).toBe("canvas");
  await clickByText(page, "SkinEditor", "What it does");
  await expect.poll(() => sceneMode(page)).toBe("thing");
}

/** Fills the name field and commits it, the way LevelNameInput expects. */
async function typeName(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder(NAME_FIELD).fill(name);
  await page.getByPlaceholder(NAME_FIELD).press("Enter");
}

/** Every definition currently in the library, read through storage. */
async function storedThings(page: Page): Promise<{ name: string; category: string; basedOn: string }[]> {
  const defs = await listCustomEntities(page);
  return defs.map((d) => ({ name: d.name, category: d.category, basedOn: d.basedOn }));
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
  await openNewThing(page);
  await typeName(page, "Star Fruit");
  // Items is the category a new thing opens on, and Coin the built-in it opens
  // pointed at — so this is the shortest real path to a custom coin.
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => storedThings(page)).toEqual([
    { name: "Star Fruit", category: "items", basedOn: "item-coin" },
  ]);

  // Now the half that matters: what the maker wrote is what the editor offers.
  // Save stays where you pressed it — one screen, and leaving is a thing you
  // choose — so this walks out: fields → grid → Menu. Left via the Back button
  // rather than scene.start from the test: Phaser's global ScenePlugin starts a
  // scene without stopping the current one, and a still-live scene draws its
  // own full-screen background over whatever comes next.
  await clickByText(page, "SkinEditor", "← Back");
  await expect.poll(() => sceneMode(page)).toBe("pick-brush");
  await clickByText(page, "SkinEditor", "← Back");
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
  await openNewThing(page);

  // Saving a blank one must not write anything, and must say why rather than
  // inventing an "Untitled" the way a level name would.
  await clickByText(page, "SkinEditor", "Save");
  await clickByText(page, "SkinEditor", "Give it a name.");
  expect(await storedThings(page)).toEqual([]);
});

test("switching family never leaves it copying something from the old one", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openNewThing(page);
  await typeName(page, "Zoom Ghost");

  // Items/Coin is where it starts. Switching to Enemy has to abandon the coin —
  // an enemy based on one is exactly what validationError refuses, so without
  // the reset this save would either fail or store nonsense.
  await clickByText(page, "SkinEditor", "Enemy");
  await clickByText(page, "SkinEditor", "Fast");
  await clickByText(page, "SkinEditor", "Save");

  await expect.poll(() => storedThings(page)).toEqual([
    { name: "Zoom Ghost", category: "enemies", basedOn: "enemy-ghost" },
  ]);
});

test("editing one changes it, and deleting one takes two taps", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [customDef({ id: "custom:star", name: "Star Fruit" })]);
  await expect.poll(() => storedThings(page).then((t) => t.length)).toBe(1);
  await openThing(page, "Star Fruit");
  await typeName(page, "Moon Fruit");
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => storedThings(page).then((t) => t.map((d) => d.name))).toEqual(["Moon Fruit"]);

  // Delete lives on the "What it does" tab rather than on a per-row button,
  // because the one list also holds built-ins and those cannot be deleted.
  await clickByText(page, "SkinEditor", "← Back");
  await pickThing(page, "Moon Fruit");
  // One tap only arms it — the same discipline every other destructive action
  // in this app follows.
  await clickByText(page, "SkinEditor", "Delete");
  expect(await storedThings(page)).toHaveLength(1);
  await clickByText(page, "SkinEditor", "Delete? Tap again");
  await expect.poll(() => storedThings(page)).toEqual([]);
});

test("the sprite is drawn on the same screen, and saving keeps it", async ({ page }) => {
  test.slow();
  // Inventing a thing and drawing it are one act, and since 2026-09-12 they are
  // one screen. This used to be "Save & draw sprite →", a button that left for
  // the Skin Creator and came back; the box it sat beside said "until you draw
  // it", which was a promise the next screen had to keep.
  await gotoApp(page);
  await openNewThing(page);
  await typeName(page, "Star Fruit");

  // Over to the drawing. A new thing opens on its fields, because Save refuses
  // one with no name; the pixels are the other tab of the same screen.
  await clickByText(page, "SkinEditor", "Draw");
  await expect.poll(() => sceneMode(page)).toBe("canvas");

  // The canvas is a real DOM <canvas>, sized one buffer pixel per cell, so the
  // 32x32 one is the drawing surface — see pixelCanvasBox's own note.
  const box = await pixelCanvasBox(page, 32);
  const cell = box.width / 32;
  for (const [x, y] of [
    [10, 10],
    [11, 10],
    [10, 11],
  ]) {
    await page.mouse.click(box.left + (x + 0.5) * cell, box.top + (y + 0.5) * cell);
  }

  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => storedThings(page).then((t) => t.map((d) => d.name))).toEqual(["Star Fruit"]);

  // The load-bearing half: the drawing was saved *as this thing's skin*, and is
  // its default, so the thing wears it rather than the ghost it copies. Without
  // the second assertion this would pass on art that saved and was never used —
  // which is exactly the bug adoptsFirstSkin was written for.
  const skin = await page.evaluate(async () => {
    const storage = (await import("/src/skins/skinStorage.ts")) as {
      loadCustomSkins(): Promise<Record<string, { activeId: string | null; items: { id: string }[] }>>;
    };
    const all = await storage.loadCustomSkins();
    const key = Object.keys(all).find((k) => k.startsWith("custom:"));
    return key ? all[key] : null;
  });
  expect(skin, "nothing was saved for the invented thing").not.toBeNull();
  expect(skin!.items).toHaveLength(1);
  expect(skin!.activeId).toBe(skin!.items[0].id);
});

test("re-opening a thing shows the sprite already drawn for it", async ({ page }) => {
  test.slow();
  // The other half, and the one that fails quietly: a PNG is all that is stored
  // (a skin keeps no second copy of its cells), so re-opening means decoding it
  // back. Get that wrong and the canvas is blank — and saving then writes the
  // blank over the artwork.
  await gotoApp(page);
  await openNewThing(page);
  await typeName(page, "Star Fruit");
  await clickByText(page, "SkinEditor", "Draw");
  await expect.poll(() => sceneMode(page)).toBe("canvas");
  const box = await pixelCanvasBox(page, 32);
  const cell = box.width / 32;
  await page.mouse.click(box.left + 10.5 * cell, box.top + 10.5 * cell);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => storedThings(page).then((t) => t.length)).toBe(1);

  // Out to the grid and back in through the tile. This is the path that would
  // have opened a blank canvas over the artwork — `openCanvasFor` starts a
  // *new* skin, which is right for a built-in (many skins per brush) and wrong
  // for a thing (exactly one) — and written the blank back on the next Save.
  await clickByText(page, "SkinEditor", "← Back");
  await expect.poll(() => sceneMode(page)).toBe("pick-brush");
  await clickIconWithLabel(page, "SkinEditor", "Star Fruit");
  await waitForSkinCanvas(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
            pixelCanvas?: { getCells(): (string | null)[] };
          };
          return (scene.pixelCanvas?.getCells() ?? []).filter((c) => c !== null).length;
        }),
      { timeout: 20_000 },
    )
    .toBe(1);
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
  await openThings(page);

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
