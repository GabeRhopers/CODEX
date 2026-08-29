import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedLevels, seedWorld } from "./support/worlds";

/**
 * What a thumb actually meets, on a phone held sideways.
 *
 * Every other spec runs at the desktop viewport, where the canvas renders at or
 * near its native 1050x468 and nothing is small. This one runs at 844x390 — an
 * iPhone 14 in landscape, the device this project is actually used on — where
 * Phaser's Scale.FIT letterboxes the canvas down to ~0.83 and every control
 * shrinks with it. A 32px palette icon met a thumb as 26.7 CSS px against
 * Apple's and Google's 44/48px guidance; the asset picker's tiles were 20.
 *
 * The measurements below are deliberately of *rendered CSS pixels*, not of the
 * layout constants. Asserting the constants would only restate the source; the
 * whole question is what those constants become once the canvas is scaled, and
 * that is a number no unit test can see.
 */

// An iPhone 14 held sideways. Chosen over a nominal "mobile" size because the
// aspect ratio is what decides the scale: 844/390 is 2.16:1 against the canvas's
// 2.24:1, so barely any of the screen is wasted and the scale is as good as this
// game gets on a phone. If targets are too small *here*, they are too small
// everywhere.
test.use({ viewport: { width: 844, height: 390 } });

const GUIDELINE_CSS_PX = 44;

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  );

/** Game pixels to CSS pixels, exactly as the browser is drawing them right now.
 * Read from the live canvas rather than computed, so it stays true whatever the
 * Scale Manager decides. */
async function canvasScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = window.__debugGame!;
    return game.canvas.getBoundingClientRect().width / game.scale.width;
  });
}

/**
 * The on-screen size of every interactive object in a scene, in CSS pixels.
 *
 * Measures the *hit area* where one is set, because that is what accepts the
 * tap — the drawn art is often deliberately smaller (a 32px icon in a 53px
 * target). Falls back to the object's own display size otherwise.
 */
async function tapTargets(page: Page, sceneKey: string): Promise<{ label: string; width: number; height: number }[]> {
  const scale = await canvasScale(page);
  const raw = await page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
    type Obj = {
      type?: string;
      text?: string;
      name?: string;
      width?: number;
      height?: number;
      displayWidth?: number;
      displayHeight?: number;
      list?: Obj[];
      input?: { enabled?: boolean; hitArea?: { width?: number; height?: number } };
    };
    const found: { label: string; width: number; height: number }[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.input?.enabled) {
          const hit = child.input.hitArea;
          found.push({
            // `||` not `??`: an unnamed Phaser object has `name === ""`, which
            // `??` happily keeps, labelling every Zone and Arc as the empty
            // string and making the filters below match nothing.
            label: child.text || child.name || child.type || "?",
            width: hit?.width ?? child.displayWidth ?? child.width ?? 0,
            height: hit?.height ?? child.displayHeight ?? child.height ?? 0,
          });
        }
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return found;
  }, sceneKey);
  return raw.map((t) => ({ label: t.label, width: t.width * scale, height: t.height * scale }));
}

/** The smallest of a set, so a failure names the worst offender rather than
 * just saying something was too small. */
function smallest(targets: { label: string; width: number; height: number }[]): {
  label: string;
  width: number;
  height: number;
} {
  return targets.reduce((worst, t) => (Math.min(t.width, t.height) < Math.min(worst.width, worst.height) ? t : worst));
}

test("the canvas really is letterboxed down on this viewport", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const scale = await canvasScale(page);
  // Guards every measurement below: if the canvas were somehow rendering at
  // full size here, each assertion would pass for the wrong reason.
  expect(scale).toBeLessThan(1);
  expect(scale).toBeGreaterThan(0.7);
});

test("a palette brush is big enough to tap", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());

  // The palette icons are Zones sized from the grid cell; the icon art stays
  // 32px. Before this they were the art itself: 26.7 CSS px here.
  const zones = (await tapTargets(page, "Editor")).filter((t) => t.label === "Zone");
  expect(zones.length).toBeGreaterThan(4); // the active category's brushes

  const worst = smallest(zones);
  // 43 rather than the full 44: the palette's rows are 54 game px and the
  // guideline costs 55 at this scale, so the cell caps a brush 0.6px short.
  // Making the row taller runs the grid into the skin picker below it, so the
  // shortfall is recorded rather than designed around — see ui/touchTarget.ts.
  expect(worst.width, `narrowest brush target: ${JSON.stringify(worst)}`).toBeGreaterThanOrEqual(GUIDELINE_CSS_PX - 1);
  expect(worst.height, `shortest brush target: ${JSON.stringify(worst)}`).toBeGreaterThanOrEqual(GUIDELINE_CSS_PX - 1);
});

test("an asset picker's tiles are big enough to tap", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());

  const trigger = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    const label = scene.children.list.find((c) => {
      const text = (c as { text?: string }).text;
      return typeof text === "string" && text.startsWith("BG: ");
    }) as { text?: string } | undefined;
    return label?.text ?? "";
  });
  await clickByText(page, "Editor", trigger);

  // The music picker's tiles are the smallest in the app at 24px — 20 CSS px
  // here before this change. The background picker's are 30.
  const zones = (await tapTargets(page, "Editor")).filter((t) => t.label === "Zone");
  const worst = smallest(zones);
  expect(worst.height, `shortest picker target: ${JSON.stringify(worst)}`).toBeGreaterThanOrEqual(
    // The picker's own cell is the ceiling: a tile cannot grow past it without
    // overlapping its neighbour, so this asserts a real improvement rather than
    // the full guideline. See ui/touchTarget.ts.
    30,
  );
});

test("a world map node is big enough to tap", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedLevels(page, ["Green Hill", "Ice Cave"]);
  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));
  await clickByText(page, "WorldMaker", "Green Hill");

  const arcs = (await tapTargets(page, "WorldMaker")).filter((t) => t.label === "Arc");
  expect(arcs).toHaveLength(1);
  // The circle itself is 30px across — 24 CSS px here. Its cell is 71x54, so
  // the row caps the height the same 0.6px short as the palette's.
  expect(arcs[0].width, JSON.stringify(arcs[0])).toBeGreaterThanOrEqual(GUIDELINE_CSS_PX);
  expect(arcs[0].height, JSON.stringify(arcs[0])).toBeGreaterThanOrEqual(GUIDELINE_CSS_PX - 1);
});

test("a node can be tapped off the circle, in the space the target gained", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedLevels(page, ["Green Hill", "Ice Cave"]);
  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));
  await clickByText(page, "WorldMaker", "Green Hill");

  const node = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      worldContainer: { list: unknown[] };
    };
    const arc = (scene.worldContainer.list as { type?: string; x?: number; y?: number }[]).find(
      (o) => o.type === "Arc",
    )!;
    return { x: arc.x!, y: arc.y! };
  });

  // 20px *below* the centre: outside the 15px circle, inside the enlarged
  // target. Below rather than above on purpose. Measuring hitArea's size cannot
  // catch a target that is the right size in the wrong place, which is a mistake
  // this actually made — a Phaser Arc's hit area is in local space with its
  // centre at (radius, radius), so a centre-relative rectangle sits a whole
  // radius up and to the left, and presses near the middle silently did nothing.
  // A point above the centre falls inside the shifted rectangle too and proves
  // nothing; the target only reaches this far *down* when the shift is right.
  const p = await page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + (y + 20) / scale.y };
    },
    node,
  );
  await page.mouse.click(p.x, p.y);

  // Selected — so the tap landed on the node, 7px clear of its art.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
          worldContainer: { list: unknown[] };
        };
        const arc = (scene.worldContainer.list as { type?: string; fillColor?: number }[]).find(
          (o) => o.type === "Arc",
        );
        return arc?.fillColor ?? 0;
      }),
    )
    .toBe(0xffc93c);
});

test("every button in My Levels clears a usable size", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedLevels(page, ["Green Hill"]);
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));

  // Row buttons cannot reach the full guideline without redesigning the row —
  // recorded honestly in touchTarget.ts rather than papered over. What they can
  // do is stop being 20 CSS px, which is what this pins.
  const targets = (await tapTargets(page, "LevelBrowser")).filter((t) => t.height > 0);
  const worst = smallest(targets);
  expect(worst.height, `shortest button: ${JSON.stringify(worst)}`).toBeGreaterThanOrEqual(28);
});

/**
 * The overflow half of the same change, and a bug on every device rather than
 * only a phone: rows were laid out as `start + i * height` with nothing checking
 * the canvas was tall enough, so from the ninth saved level onward they were
 * simply drawn past the bottom edge.
 *
 * These run at the phone viewport with the rest of this file, but nothing about
 * them is phone-specific — the canvas is a fixed 1050x468 whatever it is scaled
 * to, so the row that fell off did so on a desktop too.
 */

/** Every level name currently listed, whichever page is showing. */
async function listedNames(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key) as unknown as {
      listContainer: { list: unknown[] };
    };
    return (scene.listContainer.list as { type?: string; text?: string; style?: { fontSize?: string } }[])
      .filter((o) => o.type === "Text" && o.style?.fontSize === "15px")
      .map((o) => o.text ?? "");
  }, sceneKey);
}

test("a ninth saved level is still reachable, through the pager", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const names = Array.from({ length: 9 }, (_, i) => `Level ${String(i + 1).padStart(2, "0")}`);
  await seedLevels(page, names);

  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));

  const first = await listedNames(page, "LevelBrowser");
  expect(first.length).toBeGreaterThan(0);
  expect(first.length).toBeLessThan(names.length); // it pages at all

  await clickByText(page, "LevelBrowser", "Next ›");
  const second = await listedNames(page, "LevelBrowser");

  // The guarantee: every level appears exactly once across the pages, and the
  // ones that used to fall off the bottom are among them.
  expect([...first, ...second].sort()).toEqual([...names].sort());
});

test("a ninth world is still reachable too", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  for (let i = 1; i <= 9; i++) {
    await seedWorld(page, makeWorld(`w${i}`, `World ${String(i).padStart(2, "0")}`, levels));
  }

  await clickByText(page, "Menu", "Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));

  const first = await listedNames(page, "WorldBrowser");
  expect(first.length).toBeLessThan(9);
  await clickByText(page, "WorldBrowser", "Next ›");
  const second = await listedNames(page, "WorldBrowser");
  expect([...first, ...second]).toHaveLength(9);
});

test("deleting the last world on a page falls back rather than showing nothing", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const levels = await seedLevels(page, ["Green Hill"]);
  for (let i = 1; i <= 7; i++) {
    await seedWorld(page, makeWorld(`w${i}`, `World ${String(i).padStart(2, "0")}`, levels));
  }

  await clickByText(page, "Menu", "Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));
  await clickByText(page, "WorldBrowser", "Next ›");
  const second = await listedNames(page, "WorldBrowser");
  expect(second).toHaveLength(1);

  // Removing it empties the page you are standing on. Without clampPage the
  // screen keeps rendering that page and simply goes blank.
  await clickByText(page, "WorldBrowser", "Delete");
  await clickByText(page, "WorldBrowser", "Delete? Tap again");

  await expect.poll(() => listedNames(page, "WorldBrowser").then((n) => n.length)).toBe(6);
});
