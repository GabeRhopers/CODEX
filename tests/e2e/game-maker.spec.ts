import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { makeWorld, seedLevels, seedWorlds } from "./support/worlds";

/**
 * A game: a title, worlds in order, and an ending.
 *
 * The test that matters plays one from end to end — build it, press Play Game,
 * finish both worlds, and read the author's own words off the ending. Every
 * other assertion here is about a way that run could go wrong: the order not
 * being the order, a world that was removed still playing, or a game with
 * nothing in it being savable.
 *
 * Worlds get one level each on purpose. This spec is about the layer *above* a
 * world, and a five-level world would only make it slower at proving the same
 * thing.
 */

/** Every node circle on the map. Read off the live display list so the test
 * follows the layout rather than pinning coordinates — same helper shape as
 * world-map.spec.ts. */
async function nodes(page: Page): Promise<{ x: number; y: number; interactive: boolean }[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMap");
    const out: { x: number; y: number; interactive: boolean }[] = [];
    for (const child of scene.children.list) {
      const o = child as unknown as { type?: string; radius?: number; x?: number; y?: number; input?: { enabled?: boolean } };
      if (o.type === "Arc" && o.radius === 18) out.push({ x: o.x!, y: o.y!, interactive: !!o.input?.enabled });
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  });
}

async function clickScene(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
  await page.mouse.click(p.x, p.y);
}

/** Plays the first open node of whatever map is showing, wins it, and comes
 * back — the whole "beat this world" loop for a one-level world. */
async function beatCurrentWorld(page: Page): Promise<void> {
  await expect.poll(() => nodes(page).then((n) => n.length)).toBeGreaterThan(0);
  const open = (await nodes(page)).find((n) => n.interactive);
  if (!open) throw new Error("no open node on the map");
  await clickScene(page, open.x, open.y);

  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
          return scene.outcome ?? "";
        }),
      { timeout: 20_000 },
    )
    .toBe("won");
  await page.keyboard.up("ArrowRight");

  // Esc is how a finished world returns to its map — see PlayScene's own hint.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
}

/** Every string currently drawn in a scene. */
function labels(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
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
  }, sceneKey);
}

/** The game document as stored, read back through the maker. */
function storedGame(page: Page): Promise<{ title: string; worldIds: string[] } | null> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("GameMaker") as unknown as {
      gameDoc?: { title: string; worldIds: string[] };
    };
    return scene.gameDoc ? { title: scene.gameDoc.title, worldIds: scene.gameDoc.worldIds } : null;
  });
}

async function openMakerWithWorlds(page: Page, count: number): Promise<string[]> {
  const levels = await seedLevels(page, Array.from({ length: count }, (_, i) => `Level ${i + 1}`));
  const worldIds = Array.from({ length: count }, (_, i) => `w${i + 1}`);
  await seedWorlds(
    page,
    worldIds.map((id, i) => makeWorld(id, `World ${String(i + 1).padStart(2, "0")}`, [levels[i]])),
  );
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await expect.poll(() => labels(page, "GameMaker")).toContain("World 01");
  return worldIds;
}

async function typeTitle(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder("Grampa's Quest").fill(title);
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
}

test("a game plays its worlds in order and ends with the author's own words", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 2);

  await typeTitle(page, "Grampa's Quest");
  await clickByText(page, "GameMaker", "Add");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds.length)).toBe(1);
  await clickByText(page, "GameMaker", "Add");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds.length)).toBe(2);

  await page.getByPlaceholder("The End").fill("You did it!");
  await page.getByPlaceholder("The End").press("Enter");
  await page.getByPlaceholder("Thanks for playing!").fill("Love, Grampa.");
  await page.getByPlaceholder("Thanks for playing!").press("Enter");

  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  // World one. Finishing it must offer the *next world*, not the world browser
  // — that offer is the whole difference between a pile of worlds and a game.
  await beatCurrentWorld(page);
  await expect.poll(() => labels(page, "WorldMap")).toContain("World 1 of 2 complete!");
  await clickByText(page, "WorldMap", "Next world →");

  // World two, the last one — so the offer becomes the ending.
  await beatCurrentWorld(page);
  await expect.poll(() => labels(page, "WorldMap")).toContain("World 2 of 2 complete!");
  await clickByText(page, "WorldMap", "Finish →");

  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Ending"));
  const shown = await labels(page, "Ending");
  expect(shown).toContain("You did it!");
  expect(shown).toContain("Love, Grampa.");
  expect(shown).toContain("Grampa's Quest");
});

test("the order in the list is the order that plays", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 2);
  await typeTitle(page, "Quest");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds)).toEqual(["w1", "w2"]);

  // Send the second world to the front, then check the map that opens is
  // *that* world rather than the one that was first a moment ago.
  await clickByText(page, "GameMaker", "↓");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds)).toEqual(["w2", "w1"]);

  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => labels(page, "WorldMap")).toContain("World 02");
});

test("reordering stops at the ends rather than wrapping", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 2);
  await typeTitle(page, "Quest");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");

  // Up on the first row must do nothing. Wrapping would send the opening world
  // to the end of the game, which is the opposite of what the arrow means.
  await clickByText(page, "GameMaker", "↑");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds)).toEqual(["w1", "w2"]);
});

test("removing a world takes two taps", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 2);
  await typeTitle(page, "Quest");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");

  await clickByText(page, "GameMaker", "Remove");
  expect((await storedGame(page))?.worldIds).toHaveLength(2);
  await clickByText(page, "GameMaker", "Sure?");
  await expect.poll(() => storedGame(page).then((g) => g?.worldIds.length)).toBe(1);
});

test("a game with no worlds is refused, with the reason validation gives", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 1);
  await typeTitle(page, "Quest");

  await clickByText(page, "GameMaker", "Save");
  await clickByText(page, "GameMaker", "Add at least one world.");
});

test("an untitled game is refused too, rather than quietly becoming Untitled", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 1);
  await clickByText(page, "GameMaker", "Add");

  await clickByText(page, "GameMaker", "Save");
  await clickByText(page, "GameMaker", "Give your game a title.");
});

test("a game survives leaving the maker and coming back", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openMakerWithWorlds(page, 2);
  await typeTitle(page, "Grampa's Quest");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Save");
  await expect.poll(() => labels(page, "GameMaker")).toContain("Saved.");

  await clickByText(page, "GameMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));

  await expect.poll(() => storedGame(page).then((g) => g?.title)).toBe("Grampa's Quest");
  expect((await storedGame(page))?.worldIds).toEqual(["w1", "w2"]);
});

test("playing a world outside a game still returns to the world browser", async ({ page }) => {
  test.slow();
  // The regression the optional game context could most easily cause: every
  // existing path through a world must behave exactly as it did before.
  await gotoApp(page);
  await openMakerWithWorlds(page, 1);
  await clickByText(page, "GameMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  await clickByText(page, "Menu", "Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));
  await clickByText(page, "WorldBrowser", "Play");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  await expect.poll(() => labels(page, "WorldMap")).toContain("← Worlds");
  await beatCurrentWorld(page);
  // Polled, not read once: the map redraws from an async load, so a bare read
  // can catch it with only the header on screen.
  await expect.poll(() => labels(page, "WorldMap")).toContain("World complete! Click any node to replay it.");
  const shown = await labels(page, "WorldMap");
  expect(shown).not.toContain("Next world →");
  expect(shown).not.toContain("Finish →");
});
