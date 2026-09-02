import { expect, test } from "@playwright/test";
import { clickByText, gotoApp, selectPaletteCategory, startEditorWithLevel } from "./support/coords";
import { customDef, seedCustomEntities } from "./support/customEntities";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedLevels, seedWorld, seedWorlds } from "./support/worlds";
import { assertLayoutSound, boxes } from "./support/layout";

/**
 * Every editor screen, held to the three geometric invariants.
 *
 * The invariants themselves — and why they exist — live in `support/layout.ts`,
 * shared so a published game (which boots in its own browser context) is judged
 * by exactly the same rules.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  );

test("the Menu is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await assertLayoutSound(page, "Menu");
});

test("My Levels is laid out soundly, with more levels than fit on a page", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedLevels(page, Array.from({ length: 9 }, (_, i) => `Level ${String(i + 1).padStart(2, "0")}`));
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await assertLayoutSound(page, "LevelBrowser");
});

test("My Worlds is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  await seedWorlds(
    page,
    Array.from({ length: 9 }, (_, i) => makeWorld(`w${i + 1}`, `World ${String(i + 1).padStart(2, "0")}`, levels)),
  );
  await clickByText(page, "Menu", "Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));
  await assertLayoutSound(page, "WorldBrowser");
});

test("Templates is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  // The card, not the empty-state link ("Browse Templates →"), which only shows
  // when nothing is saved.
  await page.evaluate(() => window.__debugGame!.scene.start("Templates"));
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Templates"));
  await assertLayoutSound(page, "Templates");
});

test("the Editor is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await assertLayoutSound(page, "Editor");
});

test("the Editor is laid out soundly with a palette category that has to page", async ({ page }) => {
  test.slow();
  // Decor ships with exactly ten brushes and the grid holds exactly ten, so one
  // invented decor type is all it takes to need a pager — and the only place
  // the pager can go is a row the grid gives back. Drawn anywhere else it lands
  // on the skin picker, which is what invariant 3 is here to catch.
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: "custom:layout-totem", name: "Totem", category: "decor", basedOn: "decor-tree" }),
  ]);
  await startEditorWithLevel(page, LEVEL());
  await selectPaletteCategory(page, "Editor", "Decor");
  await expect
    .poll(() => boxes(page, "Editor").then((all) => all.some((b) => b.label === "1/2")))
    .toBe(true);
  await assertLayoutSound(page, "Editor");
});

test("the Thing Maker is laid out soundly, listing things and editing one", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: "custom:star", name: "Star Fruit" }),
    customDef({ id: "custom:zoom", name: "Zoom Ghost", category: "enemies", basedOn: "enemy-ghost" }),
  ]);
  await clickByText(page, "Menu", "Thing Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ThingMaker"));
  await expect.poll(() => boxes(page, "ThingMaker").then((all) => all.some((b) => b.label === "Star Fruit"))).toBe(true);
  await assertLayoutSound(page, "ThingMaker");

  // The form, on the widest family: Decor offers ten built-ins, which is what
  // made the "Acts like" grid wrap in the first place — at one row it ran under
  // the preview panel.
  await clickByText(page, "ThingMaker", "Edit");
  await clickByText(page, "ThingMaker", "Decoration");
  await assertLayoutSound(page, "ThingMaker");
});

test("the Skin Creator's target grid is laid out soundly once it has to page", async ({ page }) => {
  test.slow();
  // 38 built-in targets in a grid that holds 40, so three invented things push
  // it to two pages. Without paging the extras are simply drawn off the canvas.
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: "custom:a", name: "Star Fruit" }),
    customDef({ id: "custom:b", name: "Moon Fruit" }),
    customDef({ id: "custom:c", name: "Totem", category: "decor", basedOn: "decor-tree" }),
  ]);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await expect.poll(() => boxes(page, "SkinEditor").then((all) => all.some((b) => b.label === "Page 1 of 2"))).toBe(true);
  await assertLayoutSound(page, "SkinEditor");
});

test("the Game Maker is laid out soundly, with a paged list and a refusal showing", async ({ page }) => {
  test.slow();
  // The worst case the screen has: the available list needs a pager *and* a
  // save was refused, so the pager, the reason and both buttons stack below the
  // panels at once. Anything mis-spaced there reads as broken.
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  await seedWorlds(
    page,
    Array.from({ length: 9 }, (_, i) => makeWorld(`w${i + 1}`, `World ${String(i + 1).padStart(2, "0")}`, levels)),
  );
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await expect.poll(() => boxes(page, "GameMaker").then((all) => all.some((b) => b.label === "World 01"))).toBe(true);
  await clickByText(page, "GameMaker", "Save");
  await expect
    .poll(() => boxes(page, "GameMaker").then((all) => all.some((b) => b.label === "Give your game a title.")))
    .toBe(true);
  await assertLayoutSound(page, "GameMaker");

  // And with worlds in it, so the ordered column's rows and their buttons are up.
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");
  await assertLayoutSound(page, "GameMaker");
});

test("the Game Maker survives an export report long enough to wrap", async ({ page }) => {
  test.slow();
  // The status line is the one piece of this screen whose length is not under
  // the layout's control — it reports whatever is missing. Two worlds naming
  // deleted levels is what pushes it onto a second line, right above the
  // buttons.
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  await seedWorlds(page, [
    makeWorld("w1", "The Meadow of Beginnings", [...levels, "deleted-one", "deleted-two"]),
    makeWorld("w2", "The Caverns of Long Names", [...levels, "deleted-three"]),
  ]);
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await expect.poll(() => boxes(page, "GameMaker").then((all) => all.some((b) => b.label === "Add"))).toBe(true);
  await page.getByPlaceholder("Grampa's Quest").fill("Grampa's Quest");
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "GameMaker", "Download game file"),
  ]);
  await download.path();
  await expect
    .poll(() => boxes(page, "GameMaker").then((all) => all.some((b) => b.label.includes("+1 more"))))
    .toBe(true);
  await assertLayoutSound(page, "GameMaker");
});

test("the Ending is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await page.evaluate(() =>
    window.__debugGame!.scene.getScene("Menu").scene.start("Ending", {
      title: "Grampa's Quest",
      ending: { headline: "You did it!", message: "Thanks for playing. Love, Grampa." },
    }),
  );
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Ending"));
  await expect.poll(() => boxes(page, "Ending").then((b) => b.length)).toBeGreaterThan(3);
  await assertLayoutSound(page, "Ending");
});

test("the World Maker is laid out soundly, with a level added and selected", async ({ page }) => {
  test.slow();
  // The screen both regressions landed on, in the state the screenshot showed:
  // more levels than fit on a page, and a node selected so the toolbar is up.
  await gotoApp(page);
  const names = Array.from({ length: 9 }, (_, i) => `Level ${String(i + 1).padStart(2, "0")}`);
  await seedLevels(page, names);
  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));

  await clickByText(page, "WorldMaker", names[0]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
          world: { levelIds: string[] };
        };
        return scene.world.levelIds.length;
      }),
    )
    .toBe(1);

  await assertLayoutSound(page, "WorldMaker");
});

test("the World Map is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill", "Ice Cave"]);
  await seedWorld(page, makeWorld("w1", "Test World", levels));
  await page.evaluate(() => window.__debugGame!.scene.start("WorldMap", { worldId: "w1" }));
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => boxes(page, "WorldMap").then((b) => b.length)).toBeGreaterThan(3);
  await assertLayoutSound(page, "WorldMap");
});
