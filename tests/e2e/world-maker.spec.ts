import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { GAME_WIDTH } from "../../src/config/gameConfig";
import { seedLevels } from "./support/worlds";

/**
 * The World Maker screen.
 *
 * `world-map.spec.ts` covers the *map* you play; the only thing it ever did in
 * the maker was add three levels and save, so dragging, removal, ordering, the
 * list and the name had no cover at all — and each of those was broken:
 *
 * - dragging one node re-derived every node that had not been dragged, so
 *   moving the third level teleported the first (see `placeNode`);
 * - removal was a bare click on the node, sharing a pointer with drag and told
 *   apart by a flag, against Phaser's zero drag threshold — a wobble swallowed
 *   the click, a still click destroyed the node with no confirm;
 * - the list ran off the canvas at ten levels, so the tenth could not be added;
 * - nothing ever set `world.name`, so every world was "Untitled World".
 */

const LEVELS = ["Green Hill", "Ice Cave", "Lava Keep"];

interface NodeInfo {
  x: number;
  y: number;
  fill: number;
  radius: number;
}

/** Every map node in the maker, keyed by the number drawn on it — which is its
 * position in play order, so this reads order and geometry at once. */
async function nodes(page: Page): Promise<Record<string, NodeInfo>> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      worldContainer: { list: unknown[] };
    };
    type Obj = { type?: string; x?: number; y?: number; radius?: number; fillColor?: number; text?: string };
    const list = scene.worldContainer.list as Obj[];
    const out: Record<string, { x: number; y: number; fill: number; radius: number }> = {};
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.type !== "Arc") continue;
      // drawMap adds [node, label, name] together, so the number is the very
      // next child. Reading it beats re-deriving order from coordinates.
      const label = list[i + 1];
      if (label?.type !== "Text" || !label.text) continue;
      out[label.text] = { x: o.x!, y: o.y!, fill: o.fillColor!, radius: o.radius! };
    }
    return out;
  });
}

/** The names under the nodes, in play order — what the map actually claims the
 * running order is. */
async function orderOnMap(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      world: { levelIds: string[] };
      worldContainer: { list: unknown[] };
    };
    type Obj = { type?: string; text?: string; style?: { fontSize?: string } };
    const list = scene.worldContainer.list as Obj[];
    const names: string[] = [];
    for (let i = 0; i < list.length; i++) {
      // [circle, number, name] — the third of each triple.
      if (list[i].type === "Arc") names.push(list[i + 2]?.text ?? "");
    }
    return names;
  });
}

/** The available-levels rows currently on screen — the fixed-width buttons in
 * the left column, minus the pager's own smaller ones. */
async function listedLevels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      availableContainer: { list: unknown[] };
    };
    type Obj = { type?: string; text?: string; style?: { fixedWidth?: number } };
    return (scene.availableContainer.list as Obj[])
      .filter((o) => o.type === "Text" && o.style?.fixedWidth)
      .map((o) => o.text ?? "");
  });
}

async function levelIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as { world: { levelIds: string[] } };
    return [...scene.world.levelIds];
  });
}

async function storedLayout(page: Page): Promise<Record<string, { col: number; row: number }> | undefined> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      world: { layout?: Record<string, { col: number; row: number }> };
    };
    return scene.world.layout ? JSON.parse(JSON.stringify(scene.world.layout)) : undefined;
  });
}

/** Scene coordinates -> page coordinates, the same conversion world-map.spec
 * uses. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
}

async function clickScene(page: Page, x: number, y: number): Promise<void> {
  const p = await toPage(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/**
 * Clicks a node and waits for the toolbar to actually show that selection.
 *
 * Selecting refreshes the scene asynchronously, and the refresh rebuilds the
 * toolbar — destroying whatever button was there. Reaching for a toolbar button
 * before the refresh for *this* click has landed arms a button that is about to
 * be thrown away, which reads as the arming having silently failed.
 */
async function selectNode(page: Page, node: { x: number; y: number }, expectLabel: string): Promise<void> {
  await clickScene(page, node.x, node.y);
  await expect.poll(() => sceneTexts(page)).toContain(expectLabel);
}

/** WorldMakerScene's own MAP_RECT, mirrored so a test can say where a cell is.
 * Kept next to `atRest` below, which is the only thing that needs it. */
const MAP = { x: 340, y: 84, width: GAME_WIDTH - 340 - 24, height: 280, cols: 8, rows: 5 };
const CELL_WIDTH = MAP.width / MAP.cols;

/**
 * Whether every node has snapped back onto a cell centre.
 *
 * Dropping a node is not the end of the move: `dragend` writes the layout and
 * kicks off an async refresh, and only that redraw puts the node on its cell.
 * Reading positions before it lands captures wherever the mouse happened to let
 * go — which is how this spec first "failed", comparing a raw drag position
 * against a cell centre twenty pixels away.
 */
async function atRest(page: Page): Promise<boolean> {
  const all = await nodes(page);
  return Object.values(all).every(({ x, y }) => {
    const col = (x - MAP.x) / CELL_WIDTH - 0.5;
    const row = (y - MAP.y) / (MAP.height / MAP.rows) - 0.5;
    return Math.abs(col - Math.round(col)) < 0.001 && Math.abs(row - Math.round(row)) < 0.001;
  });
}

/** A real press-move-release, so Phaser's own drag machinery runs — the point
 * of several of these tests is what that machinery does. Returns once the drop
 * has actually been resolved and redrawn. */
async function dragScene(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const a = await toPage(page, from.x, from.y);
  const b = await toPage(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // Intermediate steps: a single jump can outrun Phaser's drag start.
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => atRest(page)).toBe(true);
}

/** Opens the maker with `names` saved, and adds `addCount` of them in order. */
async function openMaker(page: Page, names: string[], addCount = names.length): Promise<string[]> {
  await gotoApp(page);
  const ids = await seedLevels(page, names);
  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));

  // Each add rebuilds the available list, so wait for the exact ids before
  // reaching for the next row — see world-map.spec's own note on why a length
  // check is not enough.
  for (const [i, name] of names.slice(0, addCount).entries()) {
    await clickByText(page, "WorldMaker", name);
    await expect.poll(() => levelIds(page)).toEqual(ids.slice(0, i + 1));
  }
  return ids;
}

test("dragging a node moves that node and leaves every other one alone", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);

  const before = await nodes(page);
  expect(Object.keys(before).sort()).toEqual(["1", "2", "3"]);

  // Onto an empty cell in the top row, well clear of the auto-arranged middle.
  await dragScene(page, { x: before["3"].x, y: before["3"].y }, { x: 560, y: 115 });

  const after = await nodes(page);
  // The one that was dragged moved, and the two that were not are where they
  // were. A regression floor for the drag itself rather than a test of the
  // freeze rule — dropping onto an *empty* cell leaves the others' preferred
  // cells free, so they would sit still even without freezing. The two tests
  // below are the ones that fail if the board stops being frozen.
  expect(after["3"].x).not.toBeCloseTo(before["3"].x, 0);
  expect(after["1"]).toMatchObject({ x: before["1"].x, y: before["1"].y });
  expect(after["2"]).toMatchObject({ x: before["2"].x, y: before["2"].y });
});

test("once arranged, removing a level leaves the arranged nodes alone", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);

  const start = await nodes(page);
  await dragScene(page, { x: start["3"].x, y: start["3"].y }, { x: 560, y: 115 });
  const arranged = await nodes(page);

  // Remove the *first* level. Auto-arrangement depends on how many levels there
  // are and where each sits in the order, so dropping one re-spreads everything
  // that is not pinned: without the freeze, the second level slides from the
  // middle of the map to the left edge, having never been touched.
  await selectNode(page, arranged["1"], `#1 ${LEVELS[0]}`);
  await clickByText(page, "WorldMaker", "Remove");
  await clickByText(page, "WorldMaker", "Remove? Tap again");
  await expect.poll(() => levelIds(page).then((ids) => ids.length)).toBe(2);

  // The survivors renumber, so what was node 2 is now node 1.
  const after = await nodes(page);
  expect(after["1"]).toMatchObject({ x: arranged["2"].x, y: arranged["2"].y });
  expect(after["2"]).toMatchObject({ x: arranged["3"].x, y: arranged["3"].y });
});

test("once arranged, adding another level moves nothing that was already placed", async ({ page }) => {
  test.slow();
  await openMaker(page, [...LEVELS, "Sky Fort"], 3);

  const start = await nodes(page);
  await dragScene(page, { x: start["3"].x, y: start["3"].y }, { x: 560, y: 115 });
  const arranged = await nodes(page);

  await clickByText(page, "WorldMaker", "Sky Fort");
  await expect.poll(() => levelIds(page).then((ids) => ids.length)).toBe(4);

  const after = await nodes(page);
  for (const n of ["1", "2", "3"]) {
    expect(after[n], `node ${n}`).toMatchObject({ x: arranged[n].x, y: arranged[n].y });
  }
  expect(after["4"]).toBeDefined();
});

test("a world nobody has arranged keeps re-spreading as it grows", async ({ page }) => {
  test.slow();
  // The other half of the freeze rule, and the behaviour the old
  // "deliberate placements only" design existed to protect: until someone drags
  // something, no layout is stored at all and the whole set re-arranges.
  await openMaker(page, LEVELS, 2);
  expect(await storedLayout(page)).toBeUndefined();
  const two = await nodes(page);

  await clickByText(page, "WorldMaker", LEVELS[2]);
  await expect.poll(() => levelIds(page).then((ids) => ids.length)).toBe(3);

  const three = await nodes(page);
  expect(three["2"].x).not.toBeCloseTo(two["2"].x, 0);
  expect(await storedLayout(page)).toBeUndefined();
});

test("a node cannot be dropped onto a cell another level already holds", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);

  const before = await nodes(page);
  // Straight onto node 1's cell. Before `placeNode` checked the *resolved*
  // layout rather than only the stored one, this was allowed and silently
  // bumped node 1 somewhere else.
  await dragScene(page, { x: before["3"].x, y: before["3"].y }, { x: before["1"].x, y: before["1"].y });

  const after = await nodes(page);
  expect(after["1"]).toMatchObject({ x: before["1"].x, y: before["1"].y });
  expect(after["3"]).toMatchObject({ x: before["3"].x, y: before["3"].y });
});

test("a node grabbed off-centre lands where the node is, not where the cursor is", async ({ page }) => {
  test.slow();
  const ids = await openMaker(page, LEVELS);
  const before = await nodes(page);

  // Grab node 3 off-centre and park it so the node sits just inside one column
  // while the cursor is just inside the next. `dragend` used to read
  // `pointer.x/y`, so a node grabbed near its edge landed a whole cell away
  // from where it was let go.
  //
  // The offset is *measured* rather than assumed: Phaser captures the grab
  // offset when the drag actually starts, which — now that there is a distance
  // threshold — is after the pointer has already travelled, so it is not the
  // 12px this presses at.
  const grab = { x: before["3"].x + 12, y: before["3"].y };
  const press = await toPage(page, grab.x, grab.y);
  await page.mouse.move(press.x, press.y);
  await page.mouse.down();

  const settleX = grab.x - 40; // well past the 6px threshold, so the drag is live
  const settle = await toPage(page, settleX, grab.y);
  await page.mouse.move(settle.x, settle.y, { steps: 5 });
  const mid = await nodes(page);
  const offset = settleX - mid["3"].x; // how far right of the node the cursor sits
  expect(offset, "the drag must actually be offset for this test to mean anything").toBeGreaterThan(2);

  const boundary = MAP.x + 2 * CELL_WIDTH; // between column 1 and column 2
  const target = await toPage(page, boundary - 2 + offset, 115);
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();

  // Node just left of the boundary, cursor just right of it: column 1 is the
  // node's answer, column 2 was the cursor's.
  const layout = await storedLayout(page);
  expect(layout?.[ids[2]]).toEqual({ col: 1, row: 0 });
});

test("a click with a little hand tremor still selects rather than doing nothing", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);
  const before = await nodes(page);

  // Phaser's dragDistanceThreshold defaults to 0, so without raising it *any*
  // movement between press and release is a drag. That no longer costs the
  // click — selection happens on pointerup either way — but it does end in a
  // drop, and a drop freezes the whole board. A world that had merely been
  // clicked would quietly stop re-spreading as levels were added to it.
  const from = await toPage(page, before["2"].x, before["2"].y);
  const to = await toPage(page, before["2"].x + 3, before["2"].y + 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();

  await expect.poll(() => nodes(page).then((n) => n["2"].fill)).toBe(0xffc93c);
  // Three pixels is a tremor, not an arrangement.
  expect(await storedLayout(page)).toBeUndefined();
});

test("leaving the maker takes its name field with it", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS, 1);
  expect(await page.locator('input[placeholder="World name"]').count()).toBe(1);

  await clickByText(page, "WorldMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));

  // A DOM element, not a Phaser one: without an explicit destroy on shutdown it
  // would keep floating over whatever screen came next.
  expect(await page.locator('input[placeholder="World name"]').count()).toBe(0);
});

test("clicking a node selects it instead of deleting it", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);
  const before = await nodes(page);

  await clickScene(page, before["2"].x, before["2"].y);

  // Still three levels — a click used to remove one outright, with no confirm.
  await expect.poll(() => levelIds(page).then((ids) => ids.length)).toBe(3);
  await expect.poll(() => nodes(page).then((n) => n["2"].fill)).toBe(0xffc93c);
  // And the toolbar names what is selected.
  expect(await sceneTexts(page)).toContain(`#2 ${LEVELS[1]}`);
});

test("removing a selected level takes two taps", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS);
  const before = await nodes(page);
  await selectNode(page, before["2"], `#2 ${LEVELS[1]}`);

  // First tap only arms it. Both facts are read in one round trip, and polled
  // well inside ConfirmButton's 3s arm window — a slower check here would let
  // the button disarm and the second tap below would have nothing to hit.
  await clickByText(page, "WorldMaker", "Remove");
  await expect
    .poll(
      async () => ({ armed: (await sceneTexts(page)).includes("Remove? Tap again"), count: (await levelIds(page)).length }),
      { timeout: 1500 },
    )
    .toEqual({ armed: true, count: 3 });

  await clickByText(page, "WorldMaker", "Remove? Tap again");
  await expect.poll(() => levelIds(page).then((ids) => ids.length)).toBe(2);
  // The removed level goes back to the list on the left, and the numbering
  // closes up behind it.
  await expect.poll(() => orderOnMap(page)).toEqual([LEVELS[0], LEVELS[2]]);
});

test("Earlier and Later change play order, which is what the paths follow", async ({ page }) => {
  test.slow();
  const ids = await openMaker(page, LEVELS);
  expect(await orderOnMap(page)).toEqual(LEVELS);

  const before = await nodes(page);
  await selectNode(page, before["3"], `#3 ${LEVELS[2]}`);

  await clickByText(page, "WorldMaker", "◀ Earlier");
  await expect.poll(() => levelIds(page)).toEqual([ids[0], ids[2], ids[1]]);
  expect(await orderOnMap(page)).toEqual([LEVELS[0], LEVELS[2], LEVELS[1]]);

  // Selection follows the level, not the slot: the same one is still selected,
  // now numbered 2, so Earlier again keeps walking it forward.
  expect(await sceneTexts(page)).toContain(`#2 ${LEVELS[2]}`);
  await clickByText(page, "WorldMaker", "◀ Earlier");
  await expect.poll(() => levelIds(page)).toEqual([ids[2], ids[0], ids[1]]);
  // First in order now, so there is nothing earlier to go to.
  expect(await sceneTexts(page)).not.toContain("◀ Earlier");
});

test("a tenth saved level is still reachable, through the pager", async ({ page }) => {
  test.slow();
  // Ten rows at 34px from y=90 ran off a 468px canvas: row 10 landed on top of
  // the "Map backdrop" button and row 12 was past the bottom edge, so the last
  // levels could not be clicked at all. Nine fit; the rest page.
  const names = Array.from({ length: 12 }, (_, i) => `Level ${String(i + 1).padStart(2, "0")}`);
  await openMaker(page, names, 0);

  await expect.poll(() => sceneTexts(page)).toContain("Page 1 of 2");

  // Which levels land on which page depends on the order storage lists them in,
  // so this asserts the split rather than specific names: nine on the first
  // page, the remaining three on the second, and no overlap.
  // Counted rather than pinned: how many rows fit is a layout constant that has
  // already changed once, and what actually matters is that the pages between
  // them account for every level exactly once.
  const firstPage = await listedLevels(page);
  expect(firstPage.length).toBeGreaterThan(0);
  expect(firstPage.length).toBeLessThan(names.length);

  await clickByText(page, "WorldMaker", "Next ›");
  await expect.poll(() => sceneTexts(page)).toContain("Page 2 of 2");
  const secondPage = await listedLevels(page);
  expect([...firstPage, ...secondPage].sort()).toEqual([...names].sort());

  // The point of the pager: a level that only exists on the second page can be
  // added at all. Every one of these used to be off the bottom of the canvas.
  await clickByText(page, "WorldMaker", secondPage[2]);
  await expect.poll(() => orderOnMap(page)).toEqual([secondPage[2]]);
});

test("a world can be named, and the name is what the browser and map show", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS, 1);

  // The maker's own field — distinct placeholder from the level and skin
  // inputs, which is also how this test finds it.
  await page.getByPlaceholder("World name").fill("Volcano Run");
  await page.getByPlaceholder("World name").press("Enter");

  await clickByText(page, "WorldMaker", "Save World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));

  // Every world used to be called "Untitled World", so saved worlds were
  // indistinguishable from one another in this list.
  await expect.poll(() => sceneTexts(page, "WorldBrowser")).toContain("Volcano Run");

  await clickByText(page, "WorldBrowser", "Play");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => sceneTexts(page, "WorldMap")).toContain("Volcano Run");
});

test("the name survives a save and reopening the world for editing", async ({ page }) => {
  test.slow();
  await openMaker(page, LEVELS, 1);
  await page.getByPlaceholder("World name").fill("Volcano Run");
  await page.getByPlaceholder("World name").press("Enter");
  await clickByText(page, "WorldMaker", "Save World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));

  await clickByText(page, "WorldBrowser", "Edit");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));
  await expect.poll(() => page.getByPlaceholder("World name").inputValue()).toBe("Volcano Run");
});

/** Every Text on a scene — enough to assert what a screen is showing without
 * pinning its layout. Same helper shape as profile.spec's. */
async function sceneTexts(page: Page, sceneKey = "WorldMaker"): Promise<string[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
    type Listable = { list?: Listable[]; type?: string; text?: string };
    const found: string[] = [];
    const walk = (list: Listable[]) => {
      for (const child of list) {
        if (child.type === "Text" && child.text) found.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Listable[]) ?? []);
    return found;
  }, sceneKey);
}
