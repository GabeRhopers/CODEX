import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickByText, gotoApp, waitForGame } from "./support/coords";
import { makeWorld, seedLevels, seedWorlds } from "./support/worlds";
import { assertLayoutSound } from "./support/layout";
import { pngBuffer } from "./support/images";
import type { GameBundle } from "../../src/game/gameBundle";

/**
 * Cut scenes: an opening before the first world, a closing before the ending.
 *
 * Two things are worth proving here and neither is "the screen appears". The
 * first is that a cut scene actually sits **in the run** — that pressing Play
 * reaches the panels and then the map, and that Skip reaches the map straight
 * away, because a story you cannot get past is worse than no story. The second
 * is the regression that would be easiest to cause and hardest to notice: a game
 * with **no** cut scenes must start exactly as it always did.
 */

const PICTURE = "Painted Sky";

/**
 * A picture in the shared background library — the same pool Upload BG fills,
 * seeded through the real storage module against the mocked Drive.
 *
 * A **decodable** PNG, unlike the placeholder bytes the bundle spec can get away
 * with: the picker builds a real thumbnail texture from this, and `addBase64`
 * on data the browser cannot decode never fires its ADD_KEY event, so the
 * library read simply never resolves and the dropdown stays empty.
 */
async function seedPicture(page: Page): Promise<string> {
  const dataUrl = `data:image/png;base64,${pngBuffer(64, 32).toString("base64")}`;
  return page.evaluate(async (imageData) => {
    const backgrounds = (await import("/src/backgrounds/backgroundLibraryStorage.ts")) as {
      addBackgroundAsset(name: string, imageData: string, uploadedBy: string): Promise<string>;
    };
    return backgrounds.addBackgroundAsset("Painted Sky", imageData, "Mike");
  }, dataUrl);
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

/** A saved, valid game with one world — the state the Game Maker's cut-scene
 * buttons require, since they save before handing over. */
async function buildGame(page: Page, title = "Grampa's Quest"): Promise<void> {
  const levels = await seedLevels(page, ["Green Hill"]);
  await seedWorlds(page, [makeWorld("w1", "World One", [levels[0]])]);
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await page.getByPlaceholder("Grampa's Quest").fill(title);
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");
}

/** Writes `words` into the panel currently being edited. Blur rather than Enter:
 * Enter types a newline in a paragraph field, which is the whole point of it. */
async function typeWords(page: Page, words: string): Promise<void> {
  const field = page.getByPlaceholder("What happens here?");
  await field.fill(words);
  await field.blur();
  await expect.poll(() => labels(page, "CutSceneMaker").then((l) => l.join(" "))).toContain(words.split("\n")[0]);
}

async function addPanelWithWords(page: Page, words: string): Promise<void> {
  await clickByText(page, "CutSceneMaker", "+ Add panel");
  await typeWords(page, words);
}

test("an opening plays before the first world, and Skip gets past it", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await buildGame(page);

  await clickByText(page, "GameMaker", "Opening…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await addPanelWithWords(page, "Grampa lost his sheep.");
  await addPanelWithWords(page, "So off he went.");
  await clickByText(page, "CutSceneMaker", "Save");
  await expect.poll(() => labels(page, "CutSceneMaker")).toContain("Saved.");

  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await clickByText(page, "GameMaker", "Play Game ▶");

  // The panels, in order, then the map — not the map first.
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutScene"));
  await expect.poll(() => labels(page, "CutScene")).toContain("Grampa lost his sheep.");
  expect(await labels(page, "CutScene")).toContain("1 / 2");

  await clickByText(page, "CutScene", "Next ▸");
  await expect.poll(() => labels(page, "CutScene")).toContain("So off he went.");
  // The last panel says what pressing it does, rather than promising another one.
  expect(await labels(page, "CutScene")).toContain("Begin ▶");

  await clickByText(page, "CutScene", "Begin ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => labels(page, "WorldMap")).toContain("World One");
});

test("Skip leaves the cut scene at once", async ({ page }) => {
  test.slow();
  // A family game gets replayed, and sitting through the same panels every time
  // is how a cut scene turns into an obstacle.
  await gotoApp(page);
  await buildGame(page);
  await clickByText(page, "GameMaker", "Opening…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await addPanelWithWords(page, "Grampa lost his sheep.");
  await addPanelWithWords(page, "So off he went.");
  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));

  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutScene"));
  await clickByText(page, "CutScene", "Skip");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  // Skipped, not merely advanced: the second panel never showed.
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("CutScene"))).toBe(false);
});

test("a game with no cut scenes starts exactly as it always did", async ({ page }) => {
  test.slow();
  // The regression that would be easiest to cause and hardest to notice.
  await gotoApp(page);
  await buildGame(page);
  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("CutScene"))).toBe(false);
});

test("a cut scene of empty panels does not play", async ({ page }) => {
  test.slow();
  // Someone pressed Add panel twice and typed nothing. That is not a cut scene,
  // and making them click through two blank screens to reach their own game
  // would be the worst reading of it.
  await gotoApp(page);
  await buildGame(page);
  await clickByText(page, "GameMaker", "Opening…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await clickByText(page, "CutSceneMaker", "+ Add panel");
  await clickByText(page, "CutSceneMaker", "+ Add panel");
  // The screen says so before you find out by playing.
  await expect.poll(() => labels(page, "CutSceneMaker").then((l) => l.join(" "))).toContain("will not play");
  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));

  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("CutScene"))).toBe(false);
});

test("a closing plays after the last world, before the ending", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await buildGame(page);
  await clickByText(page, "GameMaker", "Closing…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await addPanelWithWords(page, "The sheep were home.");
  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  // "Finish →" only appears once the world is actually complete — the map draws
  // it from `worldProgress`, not from having arrived. Banking the completion
  // directly rather than driving the level: what is under test is the seam
  // between the last world and the ending, and playing a level here would be
  // testing PlayScene.
  await page.evaluate(async () => {
    const progress = (await import("/src/world/worldProgress.ts")) as {
      recordCompletion(worldId: string, index: number): void;
    };
    progress.recordCompletion("w1", 0);
  });
  await page.evaluate(() => {
    const map = window.__debugGame!.scene.getScene("WorldMap") as unknown as { scene: { restart(): void } };
    map.scene.restart();
  });
  await expect.poll(() => labels(page, "WorldMap")).toContain("Finish →");
  await clickByText(page, "WorldMap", "Finish →");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutScene"));
  await expect.poll(() => labels(page, "CutScene")).toContain("The sheep were home.");

  await clickByText(page, "CutScene", "Begin ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Ending"));
  expect(await labels(page, "Ending")).toContain("The End");
});

test("a cut scene picture travels in the published file", async ({ page }) => {
  test.slow();
  // The defect this guards against is invisible in the editor: a picture that is
  // plainly there while authoring and silently gone on the link, because the
  // collector only walked the *levels'* references.
  await gotoApp(page);
  const pictureId = await seedPicture(page);
  await buildGame(page);

  await clickByText(page, "GameMaker", "Opening…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await clickByText(page, "CutSceneMaker", "+ Add panel");
  // Through the real picker, not by calling the scene: the dropdown listing the
  // shared library is the thing an author actually uses, and a test that skipped
  // it would not notice the library read never happening.
  await clickByText(page, "CutSceneMaker", "Picture: None ▾");
  await expect.poll(() => labels(page, "CutSceneMaker")).toContain(PICTURE);
  await clickByText(page, "CutSceneMaker", PICTURE);
  await expect.poll(() => labels(page, "CutSceneMaker").then((l) => l.join(" "))).toContain(`Picture: ${PICTURE}`);
  await clickByText(page, "CutSceneMaker", "Save");
  await expect.poll(() => labels(page, "CutSceneMaker")).toContain("Saved.");
  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));

  await clickByText(page, "GameMaker", "Publish…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "Publish", "Download"),
  ]);
  const bundle = JSON.parse(readFileSync(await download.path(), "utf8")) as GameBundle;

  expect(bundle.game.opening?.panels[0].imageId).toBe(pictureId);
  // The load-bearing one: the picture itself, not merely its id.
  expect(bundle.backgrounds.map((b) => b.id)).toContain(pictureId);
  expect(bundle.backgrounds.find((b) => b.id === pictureId)?.name).toBe(PICTURE);
});

test("the cut-scene screens are laid out soundly", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await buildGame(page);
  await clickByText(page, "GameMaker", "Opening…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await assertLayoutSound(page, "CutSceneMaker");

  await addPanelWithWords(page, "Grampa lost his sheep, and the night was coming in fast.");
  await assertLayoutSound(page, "CutSceneMaker");
  // The Game Maker's own row grew two buttons and has to still fit.
  await clickByText(page, "CutSceneMaker", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await assertLayoutSound(page, "GameMaker");

  await clickByText(page, "GameMaker", "Play Game ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutScene"));
  await assertLayoutSound(page, "CutScene");
});

test("the published game plays its opening, with no Drive at all", async ({ browser }) => {
  test.slow();
  // Authored in one context, played in a clean one: a published visitor has no
  // token and no profile, so a cut scene that renders there can only have come
  // from the bundle.
  const authorContext = await browser.newContext();
  const authorPage = await authorContext.newPage();
  await gotoApp(authorPage);
  await buildGame(authorPage);
  await clickByText(authorPage, "GameMaker", "Opening…");
  await authorPage.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
  await addPanelWithWords(authorPage, "Grampa lost his sheep.");
  await clickByText(authorPage, "CutSceneMaker", "← Back");
  await authorPage.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await clickByText(authorPage, "GameMaker", "Publish…");
  await authorPage.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  const [download] = await Promise.all([
    authorPage.waitForEvent("download"),
    clickByText(authorPage, "Publish", "Download"),
  ]);
  const bundle = JSON.parse(readFileSync(await download.path(), "utf8")) as GameBundle;
  await authorContext.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/game.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) }),
  );
  await page.goto("/");
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });

  await clickByText(page, "GameTitle", "Play ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutScene"));
  await expect.poll(() => labels(page, "CutScene")).toContain("Grampa lost his sheep.");
  await clickByText(page, "CutScene", "Begin ▶");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await context.close();
});
