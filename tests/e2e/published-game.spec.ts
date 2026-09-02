import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickByText, gotoApp, waitForGame } from "./support/coords";
import { makeWorld, seedLevels, seedWorlds } from "./support/worlds";
import type { GameBundle } from "../../src/game/gameBundle";
import { assertLayoutSound } from "./support/layout";

/**
 * A published game: no editor, no sign-in, no Drive.
 *
 * This is the half that proves the bundle was worth making. Everything the
 * editor reads comes from the author's Drive through the author's own OAuth
 * token, and a visitor has neither.
 *
 * **The published page therefore opens in its own browser context.** Playwright's
 * `route` handlers and `addInitScript` survive navigation, so exporting in one
 * page and then visiting "/" in that same page leaves the mocked Drive and the
 * seeded profile installed — and a published boot that was still quietly reading
 * Drive would pass anyway. A mutation proved exactly that: removing the bundle
 * branch from `getLevelStorage` left this suite green. A second context is what
 * makes "a visitor has nothing" true in the test as well as in the claim.
 *
 * The bundle it serves is a real one, exported through the real Game Maker, so
 * what is published is what the editor actually produces rather than a fixture
 * that agrees with nothing.
 */

/** Builds a two-world game in the editor and exports it, exactly as an author
 * would, returning the file's contents. */
async function exportRealBundle(page: Page): Promise<GameBundle> {
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill", "Ice Cave"]);
  await seedWorlds(page, [
    makeWorld("w1", "World One", [levels[0]]),
    makeWorld("w2", "World Two", [levels[1]]),
  ]);
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await page.getByPlaceholder("Grampa's Quest").fill("Grampa's Quest");
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Add");
  await page.getByPlaceholder("The End").fill("You did it!");
  await page.getByPlaceholder("The End").press("Enter");
  await page.getByPlaceholder("Thanks for playing!").fill("Love, Grampa.");
  await page.getByPlaceholder("Thanks for playing!").press("Enter");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "GameMaker", "Download game file"),
  ]);
  return JSON.parse(readFileSync(await download.path(), "utf8")) as GameBundle;
}

/**
 * Opens the app as a *published game*, in a context of its own: the bundle
 * served at game.json and deliberately nothing else — no mocked Drive, no
 * seeded profile, no token. Anything that loads can only have come from the
 * file.
 */
async function openPublished(browser: Browser, bundle: GameBundle): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/game.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) }),
  );
  await page.goto("/");
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });
  return page;
}

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
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
}

test("a published bundle plays start to finish with no editor and no sign-in", async ({ page, browser }) => {
  test.slow();
  const bundle = await exportRealBundle(page);

  const published = await openPublished(browser, bundle);
  page = published;
  // The title, not a profile picker and not the Menu — the two things a visitor
  // could not get past.
  expect(await labels(page, "GameTitle")).toContain("Grampa's Quest");
  expect(await labels(page, "GameTitle")).toContain("Play ▶");
  expect(page.url()).not.toContain("game.json");

  await clickByText(page, "GameTitle", "Play ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => labels(page, "WorldMap")).toContain("World One");

  await beatCurrentWorld(page);
  await clickByText(page, "WorldMap", "Next world →");
  await expect.poll(() => labels(page, "WorldMap")).toContain("World Two");

  await beatCurrentWorld(page);
  await clickByText(page, "WorldMap", "Finish →");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Ending"));

  const ending = await labels(page, "Ending");
  expect(ending).toContain("You did it!");
  expect(ending).toContain("Love, Grampa.");
  // "Menu" is an editor word; a published game has none to go back to.
  expect(ending).toContain("Back to Title");
  expect(ending).not.toContain("Back to Menu");
});

test("the level content itself comes from the bundle, not from storage", async ({ page, browser }) => {
  test.slow();
  // The load-bearing check: in a context with no mocked Drive and no profile, a
  // level that renders at all can only have come from the file.
  const bundle = await exportRealBundle(page);
  page = await openPublished(browser, bundle);
  await clickByText(page, "GameTitle", "Play ▶");
  await expect.poll(() => nodes(page).then((n) => n.length)).toBe(1);

  const open = (await nodes(page)).find((n) => n.interactive)!;
  await clickScene(page, open.x, open.y);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  const tiles = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      level: { id: string; entities: { type: string }[] };
    };
    return { id: scene.level.id, types: scene.level.entities.map((e) => e.type) };
  });
  expect(tiles.types).toContain("player-spawn");
  expect(tiles.types).toContain("goal");
});

test("leaving a world in a published game goes to the title, not the editor", async ({ page, browser }) => {
  test.slow();
  const bundle = await exportRealBundle(page);
  page = await openPublished(browser, bundle);
  await clickByText(page, "GameTitle", "Play ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  await expect.poll(() => labels(page, "WorldMap")).toContain("← Title");
  await clickByText(page, "WorldMap", "← Title");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"));
});

test("the published screens are laid out soundly too", async ({ page, browser }) => {
  test.slow();
  // A published game is a new screen family, and it gets no free pass on the
  // geometry the editor's screens are held to.
  const bundle = await exportRealBundle(page);
  const published = await openPublished(browser, bundle);
  await assertLayoutSound(published, "GameTitle");

  await clickByText(published, "GameTitle", "Play ▶");
  await published.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => labels(published, "WorldMap")).toContain("World One");
  await assertLayoutSound(published, "WorldMap");
});

test("without a game.json the same page is still the editor", async ({ page }) => {
  test.slow();
  // The other half of the boot test: nothing about publishing may change what
  // an ordinary visit to the editor does.
  await gotoApp(page);
  expect(await labels(page, "Menu")).toContain("New Level");
  await expect
    .poll(() => page.evaluate(() => window.__debugGame!.scene.isActive("GameTitle")))
    .toBe(false);
});
