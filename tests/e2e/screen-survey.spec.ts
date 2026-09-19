import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, startEditorWithLevel, waitForSkinCanvas } from "./support/coords";
import { customDef, seedCustomEntities } from "./support/customEntities";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedLevels, seedWorlds } from "./support/worlds";

/**
 * Every authoring screen, at the size this app is actually used, in one command.
 *
 * Grew out of `header-shots.spec.ts`, which shot six screens at the default
 * 1280x720 desktop viewport when the shared header changed. The reason to widen
 * it: on 2026-09-11 somebody opened the Skin Creator on an iPad and one
 * screenshot found four defects in five minutes — a hint telling a tablet to
 * hold Ctrl, frames labelled `0 1 2 3`, a text field painted like a button, and
 * a checkerboard louder than the artwork on it. None had ever failed a test.
 * Nobody had looked at the other eleven screens.
 *
 * **An aid, not an assertion**, and deliberately so. `assertLayoutSound`
 * compares only *interactive* text, so two plain labels overlapping is invisible
 * to it — a blind spot that has already cost two bugs (the Menu's credits line
 * through the controls hint, the empty-palette hint through a heading). Every
 * visible defect this project has had was found by looking: the World Map that
 * was a murky rectangle, the cut-scene panels hunched at the bottom of an empty
 * screen, the demo nobody could finish, the Meadow background zoomed to one
 * tree, the swatch row that sat below the floor of the scene.
 *
 * It does assert one thing: that it managed to *reach* every screen. A survey
 * that quietly shot eleven of twelve would be worse than no survey, because the
 * twelfth is exactly where a bug would be hiding. Failures are collected rather
 * than thrown, so one unreachable screen still leaves you eleven pictures and a
 * message naming the one that is missing.
 */

// iPad Pro 11" landscape — the device the 2026-09-11 screenshot came from. The
// canvas is 1050x468 (2.24:1) against this 1.43:1, so roughly a third of the
// height is letterbox; that is not a bug in any screen below, it is the fixed
// canvas aspect, and it is why every shot has a dark band.
test.use({ viewport: { width: 1194, height: 834 } });

test.describe.configure({ mode: "serial" });

/** Enough content that lists are not empty — an empty list is its own screen,
 * and not the one being surveyed. */
async function seedEverything(page: Page): Promise<string[]> {
  const levels = await seedLevels(page, ["Meadow Path", "The Long Climb", "Sky Fort"]);
  await seedWorlds(page, [makeWorld("w1", "Green Fields", levels.slice(0, 2))]);
  await seedCustomEntities(page, [
    customDef({ id: "custom:bug", name: "Grumble Bug", category: "enemies", basedOn: "enemy-ghost" }),
    customDef({ id: "custom:fruit", name: "Star Fruit" }),
  ]);
  return levels;
}

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 10, [
      { type: "player-spawn", x: 1, y: 9 },
      { type: "goal", x: 18, y: 9 },
    ]),
  );

test("every authoring screen, on an iPad", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  const missed: string[] = [];

  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(500);
    await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
    await page.screenshot({ path: `test-results/survey-${name}.png` });
  };

  /** One screen. Records and carries on rather than ending the run, so a screen
   * that cannot be reached costs its own picture and not the other eleven. */
  const survey = async (name: string, reach: () => Promise<void>): Promise<void> => {
    try {
      await reach();
      await shot(name);
    } catch (error) {
      missed.push(`${name}: ${String(error).split("\n")[0]}`);
    }
  };

  /**
   * Starts a scene directly instead of walking to it.
   *
   * `menu.spec.ts` already covers which button goes where, and clicking through
   * five screens would give this five ways to fail for reasons that have nothing
   * to do with what it is looking at. Everything active is stopped first:
   * `game.scene.start(key)` is not `this.scene.start(key)` — the manager's
   * version leaves the old scene running, and the first version of this drew
   * every screen on top of the Menu.
   */
  const open = async (key: string): Promise<void> => {
    await page.evaluate((k) => {
      const manager = window.__debugGame!.scene;
      for (const active of manager.getScenes(true)) {
        if (active.scene.key !== "Boot") manager.stop(active.scene.key);
      }
      manager.start(k);
    }, key);
    await page.waitForFunction((k) => window.__debugGame!.scene.isActive(k), key);
  };

  await gotoApp(page);
  await seedEverything(page);

  await survey("01-menu", async () => {
    await open("Menu");
  });
  await survey("02-my-levels", async () => {
    await open("LevelBrowser");
  });
  await survey("03-templates", async () => {
    await open("Templates");
  });
  await survey("04-my-worlds", async () => {
    await open("WorldBrowser");
  });
  await survey("05-world-maker", async () => {
    await open("WorldMaker");
  });
  await survey("06-editor", async () => {
    await open("Menu");
    await startEditorWithLevel(page, LEVEL());
  });
  // One list of everything paintable, built-in and invented, since 2026-09-15 —
  // there is no second list of things to photograph any more.
  await survey("07-things", async () => {
    await open("SkinEditor");
    await expect.poll(() => sceneHas(page, "SkinEditor", "Grumble Bug"), { timeout: 20_000 }).toBe(true);
  });
  await survey("08-thing-form", async () => {
    await clickByText(page, "SkinEditor", "+ New Thing");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
    await expect.poll(() => sceneHas(page, "SkinEditor", "Save"), { timeout: 20_000 }).toBe(true);
  });
  await survey("09-skin-browse", async () => {
    await open("SkinEditor");
    await clickByText(page, "SkinEditor", "My skins");
  });
  await survey("10-skin-canvas", async () => {
    await open("SkinEditor");
    await clickIconWithLabel(page, "SkinEditor", "Ghost");
    await waitForSkinCanvas(page);
  });

  // The last two need a game that exists, so they are walked to rather than
  // started: the Game Maker saves and hands the game over, and neither screen
  // has anything to show without one.
  await survey("11-game-maker", async () => {
    await open("GameMaker");
    await expect.poll(() => sceneHas(page, "GameMaker", "Green Fields"), { timeout: 20_000 }).toBe(true);
    await page.getByPlaceholder("Grampa's Quest").fill("Survey Quest");
    await page.getByPlaceholder("Grampa's Quest").press("Enter");
    await clickByText(page, "GameMaker", "Add");
  });
  await survey("12-cut-scene-maker", async () => {
    await clickByText(page, "GameMaker", "Opening…");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("CutSceneMaker"));
    await clickByText(page, "CutSceneMaker", "+ Add panel");
  });
  await survey("13-publish", async () => {
    await clickByText(page, "CutSceneMaker", "← Back");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
    await clickByText(page, "GameMaker", "Publish…");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  });

  expect(missed, "these screens could not be reached, so nobody looked at them").toEqual([]);
});

/** Whether a scene is currently drawing some text — used to wait for a list
 * that loads asynchronously before photographing it empty. */
const sceneHas = (page: Page, sceneKey: string, text: string): Promise<boolean> =>
  page.evaluate(
    ({ sceneKey, text }) => {
      const scene = window.__debugGame!.scene.getScene(sceneKey);
      type Obj = { type?: string; text?: string; list?: Obj[] };
      let found = false;
      const walk = (list: Obj[]) => {
        for (const child of list) {
          if (child.type === "Text" && child.text === text) found = true;
          if (child.list) walk(child.list);
        }
      };
      walk((scene.children.list as unknown as Obj[]) ?? []);
      return found;
    },
    { sceneKey, text },
  );
