import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickScenePoint, gotoApp, readSceneField } from "./support/coords";
import { TEMPLATE_LEVELS } from "../../src/level/templateLevels";

/**
 * The Templates screen — six pre-built levels that are the first thing a new
 * player opens (MenuScene's empty state points anyone with nothing saved
 * straight here), and until now the only major screen with no test at all.
 *
 * templateLevels.test.ts checks the *data* is well-formed. This checks the two
 * things only a browser can: that each one actually starts and is survivable,
 * and that "Use This Template" hands the editor a **copy** rather than the
 * shipped level itself.
 *
 * TEMPLATE_LEVELS is imported rather than having its names retyped here, so
 * adding a seventh template extends this spec instead of quietly bypassing it.
 */

const TEMPLATE_NAMES = TEMPLATE_LEVELS.map((level) => level.name);

/** The row buttons all read the same, so they can't be told apart by label.
 * Collects every one of them in render order (top to bottom, which is
 * TEMPLATE_LEVELS order — see TemplateBrowserScene.create) and clicks the
 * `index`-th. */
async function clickRowButton(page: Page, label: string, index: number): Promise<void> {
  const point = await page.evaluate(
    ({ label, index }) => {
      type Bounds = { x: number; y: number; width: number; height: number };
      type Listable = { list?: Listable[]; type?: string; text?: string; getBounds?: () => Bounds };
      const found: { x: number; y: number }[] = [];
      const walk = (list: Listable[]) => {
        for (const child of list) {
          if (child.type === "Text" && child.text === label && child.getBounds) {
            const b = child.getBounds();
            found.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
          }
          if (child.list) walk(child.list);
        }
      };
      const scene = window.__debugGame!.scene.getScene("Templates");
      walk((scene.children.list as unknown as Listable[]) ?? []);
      found.sort((a, b) => a.y - b.y);
      return found[index] ?? null;
    },
    { label, index },
  );
  if (!point) throw new Error(`no "${label}" button at row ${index} on the Templates screen`);
  await clickScenePoint(page, point.x, point.y);
}

/** Every template name currently rendered as a row, top to bottom. */
async function listedTemplates(page: Page): Promise<string[]> {
  return page.evaluate((names) => {
    const scene = window.__debugGame!.scene.getScene("Templates") as unknown as {
      listContainer: { list: { type?: string; text?: string; y: number }[] };
    };
    return scene.listContainer.list
      .filter((c) => c.type === "Text" && c.text && names.includes(c.text))
      .sort((a, b) => a.y - b.y)
      .map((c) => c.text!);
  }, TEMPLATE_NAMES);
}

async function openTemplates(page: Page): Promise<void> {
  await clickByText(page, "Menu", "Templates");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Templates"));
}

test("the browser lists every bundled template", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openTemplates(page);
  await expect.poll(() => listedTemplates(page)).toEqual(TEMPLATE_NAMES);
});

test("every template starts, and none of them kills you where it drops you", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openTemplates(page);

  // Deliberately not "walk it to the goal": a real template is a long walk and
  // that would be a flake generator rather than a guarantee. What this does
  // catch is the failure that actually matters — a spawn in lava, over a pit,
  // or with no ground under it at all, which makes a template unplayable from
  // the first frame.
  for (const [index, name] of TEMPLATE_NAMES.entries()) {
    await clickRowButton(page, "Play", index);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

    const built = await page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
        player?: { x: number };
        groundLayer?: { getTilesWithin(): unknown[] };
      };
      return { hasPlayer: !!scene.player, tiles: scene.groundLayer?.getTilesWithin().length ?? 0 };
    });
    expect(built.hasPlayer, `${name} built no player`).toBe(true);
    expect(built.tiles, `${name} built no ground`).toBeGreaterThan(0);

    // Waits on *game* state, not wall clock. A fixed sleep is the wrong tool
    // here: under software WebGL the loop falls well behind real time (a walk
    // measured at 1.8s idle took over 6s loaded), so a sleep long enough to
    // outlast a fall on an idle box proves nothing on a busy one — verified,
    // by moving a spawn over a pit and watching a 900ms sleep sail past it.
    // Landing is also the stronger claim: a spawn over a pit never lands at
    // all, and a spawn in lava loses before it can.
    const arrival = await page.waitForFunction(
      () => {
        const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
          outcome: string;
          player?: { body?: { blocked?: { down?: boolean } } };
        };
        if (scene.outcome !== "playing") return { landed: false, outcome: scene.outcome };
        return scene.player?.body?.blocked?.down ? { landed: true, outcome: scene.outcome } : null;
      },
      undefined,
      { timeout: 20_000 },
    );
    expect(await arrival.jsonValue(), `${name} does not drop the player onto solid ground`).toEqual({
      landed: true,
      outcome: "playing",
    });

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("Templates"));
  }
});

test("leaving a template returns to Templates, not the Menu", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openTemplates(page);
  await clickRowButton(page, "Play", 0);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // PlayScene resolves where Back goes from `returnScene` — a template played
  // from here must come back here, not dump you on the home screen.
  expect(await readSceneField<string>(page, "Play", "returnScene")).toBe("Templates");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Templates"));
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Menu"))).toBe(false);
});

test("Use This Template edits a copy, and saving it leaves the template alone", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openTemplates(page);

  await clickRowButton(page, "Use This Template", 0);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));

  // The blank id is the whole mechanism: persistLevel assigns a fresh UUID when
  // `id` is falsy, so Save creates an independent level instead of writing over
  // the shipped template.
  const opened = await readSceneField<{ id: string; name: string; width: number; height: number }>(page, "Editor", "level");
  expect(opened.id).toBe("");
  expect(opened.name).toBe(TEMPLATE_NAMES[0]);
  expect(opened.width).toBe(TEMPLATE_LEVELS[0].width);
  expect(opened.height).toBe(TEMPLATE_LEVELS[0].height);

  await clickByText(page, "Editor", "Save");
  await expect
    .poll(() => readSceneField<{ id: string }>(page, "Editor", "level").then((l) => l.id))
    .not.toBe("");

  // It really landed in My Levels, as its own entry...
  await clickByText(page, "Editor", "Menu");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("LevelBrowser") as unknown as {
          listContainer: { list: { type?: string; text?: string }[] };
        };
        return scene.listContainer.list.filter((c) => c.type === "Text" && c.text).map((c) => c.text!);
      }),
    )
    .toContain(TEMPLATE_NAMES[0]);

  // ...and the Templates screen still offers all six, unchanged.
  await clickByText(page, "LevelBrowser", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await openTemplates(page);
  expect(await listedTemplates(page)).toEqual(TEMPLATE_NAMES);

  // The real test of "never mutated", and it has to be read through *Play*
  // rather than by re-opening the editor: `useTemplate` blanks the id on its
  // way out, so a second Use This Template shows a blank id whether or not the
  // template underneath it was clobbered. Play clones and keeps the id, so this
  // sees the shipped one — a UUID here would mean Save had written straight
  // through onto the template.
  await clickRowButton(page, "Play", 0);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  const played = await readSceneField<{ id: string; name: string }>(page, "Play", "level");
  expect(played.id).toBe(TEMPLATE_LEVELS[0].id);
  expect(played.name).toBe(TEMPLATE_NAMES[0]);
});
