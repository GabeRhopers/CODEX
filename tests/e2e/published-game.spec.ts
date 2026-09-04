import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
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

/**
 * The exported bundle, built once for the whole file.
 *
 * Producing it means a full editor session — boot, seed, arrange, download —
 * and every test here wants the same one. Exporting per test cost four of those
 * and pushed the whole suite's runtime up enough to tip the slowest unrelated
 * spec over its 90s budget. Cached at module scope, which is safe because this
 * project runs Playwright with a single worker.
 */
let cachedBundle: GameBundle | null = null;

/**
 * One clean context for every published visit, rather than one per test.
 *
 * **Measured, not guessed.** Opening and closing a browser context per test was
 * costing far more than the tests themselves: the three Skin Creator specs that
 * run straight after this file took 108s on their own, 120s after an equally
 * long spec that does not churn contexts, and **792s** after this one — a 6.6x
 * blow-up that produced the suite's recurring "passes alone, fails together"
 * failures. One context, a fresh page per test, and that disappears.
 *
 * **The isolation is unchanged, and it is the whole point of this file.** What
 * makes a published visit honest is that the mocked Drive and the seeded profile
 * were never installed — a mutation once proved a shared *editor* context hid
 * exactly that. This context is created by `browser.newContext()` and
 * `installMockDrive` is never called on it, so a visitor here still has nothing;
 * `openPublished` clears localStorage on top, so they do not even inherit the
 * previous test's progress.
 */
let cleanContext: BrowserContext | null = null;

async function publishedContext(browser: Browser): Promise<BrowserContext> {
  if (!cleanContext) cleanContext = await browser.newContext();
  return cleanContext;
}

test.afterAll(async () => {
  await cleanContext?.close();
  cleanContext = null;
});

async function realBundle(browser: Browser): Promise<GameBundle> {
  if (cachedBundle) return cachedBundle;
  const context = await browser.newContext();
  const page = await context.newPage();
  cachedBundle = await exportRealBundle(page);
  await context.close();
  return cachedBundle;
}

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

  await clickByText(page, "GameMaker", "Publish\u2026");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "Publish", "Download"),
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
  const page = await (await publishedContext(browser)).newPage();
  // Cleared at every navigation, which is what a *page* per test buys back from
  // sharing a context: localStorage is per-origin, so one test beating both
  // worlds would otherwise leave its progress banked for the next one. Nothing
  // here needs storage to persist — the game arrives from the route below.
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/game.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) }),
  );
  await page.goto("/");
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });
  return page;
}

/**
 * Opens a game the way publishing actually delivers one: `?game=<slug>`, served
 * from the `games/` folder the deployment carries, in a context of its own.
 *
 * The root-`game.json` case above is a whole site that is one game; this is the
 * shared site hosting many, and it is the path a real link takes. Both are
 * served here so neither can quietly stop working.
 */
async function openPublishedBySlug(browser: Browser, slug: string, bundle: GameBundle | null): Promise<Page> {
  const page = await (await publishedContext(browser)).newPage();
  await page.addInitScript(() => localStorage.clear());
  await page.route(`**/games/${slug}.json`, (route) =>
    bundle
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) })
      : route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }),
  );
  await page.goto(`/?game=${slug}`);
  await waitForGame(page);
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

test("a published bundle plays start to finish with no editor and no sign-in", async ({ browser }) => {
  test.slow();
  const page = await openPublished(browser, await realBundle(browser));
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

test("the level content itself comes from the bundle, not from storage", async ({ browser }) => {
  test.slow();
  // The load-bearing check: in a context with no mocked Drive and no profile, a
  // level that renders at all can only have come from the file.
  const page = await openPublished(browser, await realBundle(browser));
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

test("leaving a world in a published game goes to the title, not the editor", async ({ browser }) => {
  test.slow();
  const page = await openPublished(browser, await realBundle(browser));
  await clickByText(page, "GameTitle", "Play ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  await expect.poll(() => labels(page, "WorldMap")).toContain("← Title");
  await clickByText(page, "WorldMap", "← Title");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"));
});

test("the published screens are laid out soundly too", async ({ browser }) => {
  test.slow();
  // A published game is a new screen family, and it gets no free pass on the
  // geometry the editor's screens are held to.
  const published = await openPublished(browser, await realBundle(browser));
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

test("a link with ?game= plays the game that slug names", async ({ browser }) => {
  test.slow();
  // The published link's own path, end to end: the slug names a file under
  // games/, the boot fetches exactly that, and a visitor with no Drive and no
  // profile reaches the title.
  const page = await openPublishedBySlug(browser, "grampa-s-quest", await realBundle(browser));
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });
  expect(await labels(page, "GameTitle")).toContain("Grampa's Quest");

  await clickByText(page, "GameTitle", "Play \u25b6");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => labels(page, "WorldMap")).toContain("World One");
});

test("a link to a game that is not there says so, rather than showing the editor", async ({ browser }) => {
  test.slow();
  // The failure a stranger actually hits — a stale or mistyped link. Answering
  // it with the editor's sign-in explains nothing and asks for something they
  // have no reason to give, so the boot has to distinguish "no game was asked
  // for" from "the game asked for is missing".
  const page = await openPublishedBySlug(browser, "no-such-game", null);
  await expect.poll(() => labels(page, "Boot")).toContain("That game could not be found.");
  expect((await labels(page, "Boot")).join(" ")).toContain("no-such-game");
  // The load-bearing negative: not the editor, and not a game either.
  for (const key of ["ProfileGate", "Menu", "GameTitle"]) {
    expect(await page.evaluate((k) => window.__debugGame!.scene.isActive(k), key)).toBe(false);
  }
});

test("a ?game= value that could point elsewhere is refused outright", async ({ browser }) => {
  test.slow();
  // `new URL("games/../../x", base)` resolves happily, so the slug pattern is
  // the only thing stopping a crafted link from making the page fetch somewhere
  // else. Refused before any request: the route below must never be hit.
  const page = await (await publishedContext(browser)).newPage();
  await page.addInitScript(() => localStorage.clear());
  // Every request the page makes, watched rather than intercepted: the boot's
  // own game.json fetch is legitimate and must still happen, so what is checked
  // is that nothing reaching for the crafted path is ever asked for.
  //
  // Judged on the **path**, not the whole URL. The navigation itself carries the
  // crafted name in its query string — matching on the URL flags that and calls
  // it a traversal, which is how the first version of this test failed against a
  // perfectly sound guard. A traversal that worked would show up as a path:
  // `games/../../secret` resolves to `/secret`, outside the games folder.
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/?game=..%2F..%2Fsecret");
  await waitForGame(page);
  // A refused slug means no game was asked for, so this is an ordinary editor
  // visit — and nothing climbed out of the games folder to get there.
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ProfileGate"), undefined, { timeout: 20_000 });
  expect(paths.filter((path) => path.includes("secret"))).toEqual([]);
});

// The `page` fixture, not a hand-rolled context: this is an ordinary *editor*
// session — `gotoApp` installs the mocked Drive — so it must stay off the clean
// context the published visits share, and Playwright already gives the fixture a
// fresh context of its own per test.
test("the Publish screen is laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  await seedWorlds(page, [makeWorld("w1", "World One", [levels[0]])]);
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await page.getByPlaceholder("Grampa's Quest").fill("Grampa's Quest");
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");
  await clickByText(page, "GameMaker", "Publish\u2026");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));

  const shown = await labels(page, "Publish");
  // The three steps are one string each — the file, where it goes, and the
  // link — and they have to agree, or every step reads plausibly and the
  // result is dead.
  expect(shown.join("\n")).toContain("public/games/grampa-s-quest.json");
  expect(shown.some((t) => t.endsWith("/?game=grampa-s-quest"))).toBe(true);
  await assertLayoutSound(page, "Publish");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "Publish", "Download"),
  ]);
  expect(download.suggestedFilename()).toBe("grampa-s-quest.json");
  // The report of what was written must not run into the step below it.
  await expect.poll(() => labels(page, "Publish").then((l) => l.join(" "))).toContain("Saved 1 world");
  await assertLayoutSound(page, "Publish");
});
