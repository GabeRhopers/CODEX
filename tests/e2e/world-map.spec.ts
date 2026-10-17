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

/** The level the Play scene currently holds. A room change is a scene restart,
 * so this is what actually moving between rooms looks like from outside. */
const playingLevelId = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { level?: { id: string } };
    return scene.level?.id;
  });

const playerTileX = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      player?: { x: number };
    };
    // GRID_ORIGIN_X is 190 and TILE_SIZE 32 (see config/gameConfig.ts); read as
    // a tile so the assertion says something a person can picture.
    return Math.round(((scene.player?.x ?? 0) - 190) / 32);
  });

/**
 * Walking out of one room and into the next — the first thing the metroidvania
 * mode can actually do.
 *
 * A room is a level (Gabriel, 2026-10-16) and rooms are joined at their edges
 * because the camera never scrolls (CLAUDE.md), so this is the whole mechanism:
 * an exit on one room's edge, a link in the world, and the next screen.
 *
 * Seeded rather than authored, because placing and linking exits is 1c. What
 * this proves is that the runtime half works, which is what the editor half
 * will be built against.
 */
test("walking into an edge exit opens the room it links to", async ({ page }) => {
  test.slow();
  await gotoApp(page);

  const rooms = [
    { id: "room-a", name: "Room A", exitX: 19, spawnX: 2, background: "meadow" }, // door on the right edge
    // **Room B's spawn sits at the far end from its door, on purpose.** The
    // assertion below has to tell "arrived at the door" apart from "started at
    // the Spawn marker", and the two are only a tile apart if the spawn is
    // where Room A's is. Putting 14 tiles between them means the check does not
    // depend on exactly when the held key is released — see the comment there.
    // A different backdrop so a screenshot can show the room changed. The
    // level-id assertion is what *proves* it; this is so a person looking at
    // the two pictures can see it too.
    { id: "room-b", name: "Room B", exitX: 0, spawnX: 15, background: "frozen-volcano" }, // door on the left edge
  ];
  await page.evaluate(async (rooms) => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      levelStorage: { save(level: unknown): Promise<void> };
    };
    for (const room of rooms) {
      await scene.levelStorage.save({
        schemaVersion: 2,
        id: room.id,
        name: room.name,
        createdAt: "2026-10-16T00:00:00.000Z",
        updatedAt: "2026-10-16T00:00:00.000Z",
        tileSize: 32,
        background: room.background,
        width: 20,
        height: 12,
        isRoom: true,
        layers: { ground: Array.from({ length: 12 }, (_, y) => Array.from({ length: 20 }, () => (y === 10 ? 0 : -1))) },
        entities: [
          { type: "player-spawn", x: room.spawnX, y: 9 },
          { type: "edge-exit", x: room.exitX, y: 9 },
        ],
      });
    }
  }, rooms);

  // Start in Room A, with the world carrying the one door between them. The
  // links riding on the world context is what makes the exit live at all.
  await page.evaluate(async () => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      levelStorage: { load(id: string): Promise<unknown> };
    };
    const level = await scene.levelStorage.load("room-a");
    window.__debugGame!.scene.start("Play", {
      level,
      world: {
        levelIds: ["room-a", "room-b"],
        index: 0,
        worldId: "w-rooms",
        roomLinks: [[{ levelId: "room-a", side: "right" }, { levelId: "room-b", side: "left" }]],
      },
    });
  });
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // Assert the precondition, or "arrived in room B" could be true of a test
  // that never left room A because it started there.
  await expect.poll(() => playingLevelId(page)).toBe("room-a");

  await page.keyboard.down("ArrowRight");
  await expect.poll(() => playingLevelId(page), { timeout: 20_000 }).toBe("room-b");
  await page.keyboard.up("ArrowRight");

  // Arrived *at Room B's door*, not at its Spawn marker 14 tiles away, which is
  // where an ordinary start would have put them. That is the whole difference
  // between a room change and a level change.
  //
  // **Deliberately not `toBe(1)`.** The exact landing tile is 1, but the key is
  // still held as the scene restarts, so the arriving character immediately
  // walks right and the precise tile is a moving target — asserting it raced
  // the character and failed on tile 2 the first time this was written. The
  // room is 20 wide with the door at one end and the spawn at the other, so
  // "nearer the door than the spawn" is the question that actually has a stable
  // answer.
  await expect.poll(() => playerTileX(page)).toBeLessThan(8);
});
