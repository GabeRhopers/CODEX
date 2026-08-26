import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { makeWorld, seedLevels, seedWorld, storedProgress } from "./support/worlds";

/**
 * Worlds, as a map.
 *
 * Worlds had **no tests of any kind** before this — a schema, three scenes and
 * two storage adapters, all uncovered, which is what the Priority Matrix's
 * "01 · TEST NEXT" card was pointing at. So this covers the round trip rather
 * than only the new drawing: build one, save it, reopen it, play it, and come
 * back to find the progress where you left it.
 */

const LEVELS = ["Green Hill", "Ice Cave", "Lava Keep"];

/** Every node circle on the map, with whether it accepts clicks — which is how
 * "locked" is visible to a player. Read off the live display list so the test
 * follows the layout instead of pinning coordinates. */
async function nodes(page: Page): Promise<{ x: number; y: number; interactive: boolean; fill: number }[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMap");
    const out: { x: number; y: number; interactive: boolean; fill: number }[] = [];
    for (const child of scene.children.list) {
      const o = child as unknown as {
        type?: string;
        radius?: number;
        x?: number;
        y?: number;
        input?: { enabled?: boolean };
        fillColor?: number;
      };
      if (o.type === "Arc" && o.radius === 18) {
        out.push({ x: o.x!, y: o.y!, interactive: !!o.input?.enabled, fill: o.fillColor! });
      }
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

async function openMap(page: Page, worldId: string): Promise<void> {
  await page.evaluate((id) => window.__debugGame!.scene.start("WorldMap", { worldId: id }), worldId);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  // The map loads the world and the level names before it can draw anything.
  await expect.poll(() => nodes(page).then((n) => n.length)).toBeGreaterThan(0);
}

/** Walks right until the goal is reached. The seeded level puts spawn and goal
 * five tiles apart on flat ground, so this is a second or two. */
async function winCurrentLevel(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
          return scene.outcome ?? "";
        }),
      { timeout: 15_000 },
    )
    .toBe("won");
  await page.keyboard.up("ArrowRight");
}

test("a world built in the maker saves its map and reopens with the same nodes", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, LEVELS);

  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));

  // Wait for each add to *settle* before reaching for the next name.
  //
  // The maker pushes the id synchronously but rebuilds its available list in an
  // async refresh, and that rebuild removes the level just added — so every row
  // below it shifts up one. Clicking straight through resolves a point against
  // the old rows and lands on the wrong level once the rebuild arrives.
  //
  // Waiting on `levelIds.length` is not enough, and getting that wrong is what
  // made this pass locally and fail on CI: the push is synchronous, so the
  // length is already right *before* the list settles, and a click that adds
  // the wrong level still satisfies a length check. So this waits on the exact
  // ids, in order, plus the row count — which fails loudly on a misplaced click
  // instead of carrying a wrong world forward.
  for (const [i, name] of LEVELS.entries()) {
    await clickByText(page, "WorldMaker", name);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
            world: { levelIds: string[] };
            availableContainer: { list: unknown[] };
          };
          return { ids: scene.world.levelIds.join(","), rows: scene.availableContainer.list.length };
        }),
      )
      .toEqual({ ids: ids.slice(0, i + 1).join(","), rows: Math.max(1, LEVELS.length - i - 1) });
  }

  await clickByText(page, "WorldMaker", "Save World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));

  // Reopening is the real assertion: the world went through the storage
  // adapter and came back with its levels in order.
  await clickByText(page, "WorldBrowser", "Play");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => nodes(page).then((n) => n.length)).toBe(LEVELS.length);
});

test("a world saved before maps existed still opens, arranged and playable", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, LEVELS);
  // No `layout`, no `background` — exactly the shape WorldData had before this
  // feature. The optional fields are only worth anything if this still works.
  await seedWorld(page, makeWorld("legacy-world", "Legacy World", ids));

  await openMap(page, "legacy-world");
  const drawn = await nodes(page);
  expect(drawn).toHaveLength(LEVELS.length);
  // Auto-arranged: every node got a distinct spot rather than stacking.
  expect(new Set(drawn.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size).toBe(LEVELS.length);
  // And it is playable, which is the half that matters.
  expect(drawn[0].interactive).toBe(true);
});

test("later levels stay locked until the one before them is beaten", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, LEVELS);
  await seedWorld(page, makeWorld("gated-world", "Gated World", ids));

  await openMap(page, "gated-world");
  const before = await nodes(page);
  expect(before.filter((n) => n.interactive)).toHaveLength(1);

  await clickScene(page, before[0].x, before[0].y);
  await winCurrentLevel(page);
  expect(await storedProgress(page, "gated-world")).toBe(1);

  // Esc returns to the map, which is also what walks the marker onward.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));
  await expect.poll(() => nodes(page).then((n) => n.filter((x) => x.interactive).length)).toBe(2);
});

test("progress survives leaving the map and coming back", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, LEVELS);
  await seedWorld(page, makeWorld("resume-world", "Resume World", ids));

  await openMap(page, "resume-world");
  const first = (await nodes(page))[0];
  await clickScene(page, first.x, first.y);
  await winCurrentLevel(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  // Out to the browser and back in — the old behaviour restarted every world
  // from level 1 on every visit, because nothing was remembered at all.
  await clickByText(page, "WorldMap", "← Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));
  await clickByText(page, "WorldBrowser", "Play");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

  await expect.poll(() => nodes(page).then((n) => n.filter((x) => x.interactive).length)).toBe(2);
});

test("a world whose level was deleted elsewhere still opens", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, LEVELS);
  // A world referencing an id that no longer exists — the thing a World has
  // always tolerated, now on the map rather than in a list.
  await seedWorld(page, makeWorld("stale-world", "Stale World", [...ids, "deleted-level-id"]));

  await openMap(page, "stale-world");
  expect(await nodes(page)).toHaveLength(4);
  const labels = await page.evaluate(() =>
    window
      .__debugGame!.scene.getScene("WorldMap")
      .children.list.map((c) => (c as unknown as { text?: string }).text ?? "")
      .filter(Boolean),
  );
  expect(labels).toContain("(deleted level)");
  // The rest of the world is still reachable rather than the screen being dead.
  expect((await nodes(page)).filter((n) => n.interactive)).toHaveLength(1);
});
