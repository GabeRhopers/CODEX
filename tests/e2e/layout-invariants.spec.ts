import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, selectPaletteCategory, startEditorWithLevel } from "./support/coords";
import { customDef, seedCustomEntities } from "./support/customEntities";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedLevels, seedWorld, seedWorlds } from "./support/worlds";
import { GAME_HEIGHT, GAME_WIDTH } from "../../src/config/gameConfig";

/**
 * Three geometric facts that must hold on every screen.
 *
 * This exists because a whole class of defect was invisible to the rest of the
 * suite. On 2026-08-29 a padding change left every row in the World Maker with
 * the bottom half of its letters cut off, and put the "Save World" button on top
 * of the save-state readout. Both shipped. Both were obvious in a screenshot.
 * Neither failed a test — `clickByText` finds a Text by its `text` property and
 * the phone-landscape spec measures `input.hitArea`, and a clipped or
 * overlapping control still reports the right string and the right hit box.
 *
 * Geometric invariants rather than screenshot baselines: these are
 * deterministic, they say *which* object is wrong and by how much, and they
 * never need re-approving when a layout deliberately changes.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  );

interface Box {
  label: string;
  type: string;
  interactive: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Set only on Text: the height its own font and padding need, and the fixed
   * height it was forced into (0 when it was left to size itself). */
  needsHeight?: number;
  fixedHeight?: number;
}

/** Every drawn object on a scene, with the geometry these invariants judge. */
async function boxes(page: Page, sceneKey: string): Promise<Box[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
    type Style = {
      fixedHeight?: number;
      metrics?: { fontSize?: number };
      padding?: { top?: number; bottom?: number };
    };
    type Obj = {
      type?: string;
      text?: string;
      name?: string;
      visible?: boolean;
      list?: Obj[];
      style?: Style;
      input?: { enabled?: boolean };
      getBounds?: () => { x: number; y: number; width: number; height: number };
    };
    const out: Box[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.visible === false) continue;
        const b = child.getBounds?.();
        if (b) {
          const box: Box = {
            label: child.text || child.name || child.type || "?",
            type: child.type ?? "?",
            interactive: !!child.input?.enabled,
            left: b.x,
            right: b.x + b.width,
            top: b.y,
            bottom: b.y + b.height,
          };
          if (child.type === "Text") {
            const st = child.style ?? {};
            box.fixedHeight = st.fixedHeight ?? 0;
            // Phaser measures the font once and caches it on the style; a single
            // line needs that plus its own vertical padding.
            box.needsHeight = (st.metrics?.fontSize ?? 0) + (st.padding?.top ?? 0) + (st.padding?.bottom ?? 0);
          }
          out.push(box);
        }
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return out;
  }, sceneKey) as Promise<Box[]>;
}

/** Invariant 1 — no Text is squeezed into a box smaller than its own content. */
function clipped(all: Box[]): Box[] {
  return all.filter((b) => b.type === "Text" && (b.fixedHeight ?? 0) > 0 && (b.fixedHeight ?? 0) < (b.needsHeight ?? 0));
}

/** Invariant 2 — nothing a player is meant to touch is drawn off the canvas. */
function offCanvas(all: Box[]): Box[] {
  return all.filter(
    (b) => b.interactive && (b.left < -1 || b.top < -1 || b.right > GAME_WIDTH + 1 || b.bottom > GAME_HEIGHT + 1),
  );
}

/**
 * Invariant 3 — no interactive Text sits on top of another Text.
 *
 * Text against Text specifically. A dropdown panel is meant to cover what is
 * beneath it, and the asset picker's delete badge is meant to sit on its tile —
 * both are Rectangles over Images, so neither trips this. Every scene here is
 * checked with no menu open, which is the state the rule describes.
 */
function overlappingText(all: Box[]): [Box, Box][] {
  const texts = all.filter((b) => b.type === "Text");
  const hits: [Box, Box][] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (!a.interactive && !b.interactive) continue;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // A pixel of touching is rounding, not a collision.
      if (overlapX > 1 && overlapY > 1) hits.push([a, b]);
    }
  }
  return hits;
}

function describe(b: Box): string {
  return `${b.type} "${b.label}" @(${Math.round(b.left)},${Math.round(b.top)})-(${Math.round(b.right)},${Math.round(b.bottom)})`;
}

/** Runs all three against one scene, reporting every offender by name. */
async function assertLayoutSound(page: Page, sceneKey: string): Promise<void> {
  const all = await boxes(page, sceneKey);
  expect(all.length, `${sceneKey} drew nothing`).toBeGreaterThan(0);

  expect(
    clipped(all).map((b) => `${describe(b)} fixed at ${b.fixedHeight} but needs ${b.needsHeight}`),
    `${sceneKey}: text clipped by a fixed height smaller than its content`,
  ).toEqual([]);

  expect(
    offCanvas(all).map(describe),
    `${sceneKey}: interactive object drawn outside the ${GAME_WIDTH}x${GAME_HEIGHT} canvas`,
  ).toEqual([]);

  expect(
    overlappingText(all).map(([a, b]) => `${describe(a)} over ${describe(b)}`),
    `${sceneKey}: interactive text overlapping other text`,
  ).toEqual([]);
}

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
