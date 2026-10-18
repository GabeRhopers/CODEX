import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, startEditorWithLevel, tileCenter, clickScenePoint } from "./support/coords";
import { failDriveWrites, hangDriveWrites, stopFailingDriveWrites } from "./support/mockDrive";
import { makeArea, makeLevel } from "./support/levels";
import { seedLevels } from "./support/worlds";

/**
 * What happens when storage fails.
 *
 * This is the Priority Matrix's last unverified **Tier 1** row — "a failed Drive
 * save never corrupts or drops the in-memory level" — and the guard it really
 * rests on is one line in `EditorScene.leaveToMenu`: it re-checks `dirty`
 * *after* awaiting the save and refuses to navigate. Without it, clicking Menu
 * during an outage discards everything you painted, silently. Nothing exercised
 * that until now.
 *
 * Writes fail while reads keep working, which is what makes the assertions mean
 * something: the level is still on screen, still dirty, and still has its tiles.
 */

/** Deliberately **empty** — `makeArea` fills the row it is given, and an
 * already-painted grid made "the level still has its tiles" true before the
 * test painted anything, so a click that landed nowhere still looked fine. */
const LEVEL = () => makeLevel(makeArea(20, 8, -1, []));
const PAINT_TILE = { x: 4, y: 6 };

const saveState = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      ui: { saveStatusText: { text: string } };
    };
    return scene.ui.saveStatusText.text;
  });

/** How many ground tiles the *in-memory* level has — the thing a failed save
 * must not touch. */
const paintedTileCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      level: { layers: { ground: number[][] } };
    };
    return scene.level.layers.ground.flat().filter((t) => t !== -1).length;
  });

/** The maker's one-line status, under the map. */
const worldStatusText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      statusText: { text: string };
    };
    return scene.statusText.text;
  });

/** The levels the maker currently holds, in play order. */
const worldLevelIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as { world: { levelIds: string[] } };
    return [...scene.world.levelIds];
  });

/** Whether the world has been through a successful save yet — an id minted and
 * nothing outstanding. Both halves, because an id alone appears the moment the
 * *first* save is attempted, including one that failed. */
const worldSaved = (page: Page): Promise<{ hasId: boolean; dirty: boolean }> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      world: { id: string };
      dirty: boolean;
    };
    return { hasId: !!scene.world.id, dirty: scene.dirty };
  });

/** What Drive actually holds for the world being made. Reads keep working while
 * writes fail, which is what lets this stand in for "the copy still out there". */
const loadStoredWorld = (page: Page): Promise<{ id: string; levelIds: string[]; updatedAt: string } | null> =>
  page.evaluate(async () => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      world: { id: string };
      worldStorage: { load(id: string): Promise<unknown> };
    };
    return (await scene.worldStorage.load(scene.world.id)) as {
      id: string;
      levelIds: string[];
      updatedAt: string;
    } | null;
  });

async function paintOneTile(page: Page): Promise<void> {
  const point = tileCenter(PAINT_TILE.x, PAINT_TILE.y);
  await clickScenePoint(page, point.x, point.y);
}

test("a save that fails keeps the level, says so, and stays dirty", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await failDriveWrites(page);

  await paintOneTile(page);
  const painted = await paintedTileCount(page);
  expect(painted).toBeGreaterThan(0);
  // The paint must actually have registered, or the rest of this test is
  // asserting against an editor with nothing to lose.
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(true);

  await clickByText(page, "Editor", "Save");

  await expect.poll(() => saveState(page)).toContain("Save failed");
  // Still dirty: nothing was persisted, so the next edit or Save must try again
  // rather than believing the work is safe.
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(true);
  // And the work itself is untouched — the failure path must not roll anything
  // back or clear the grid.
  expect(await paintedTileCount(page)).toBe(painted);
});

test("Menu refuses to leave while the save is failing, rather than dropping the work", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await failDriveWrites(page);

  await paintOneTile(page);
  const painted = await paintedTileCount(page);
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(true);

  await clickByText(page, "Editor", "Menu");

  // The whole point: leaving here would discard the level, because nothing was
  // ever written. EditorScene.leaveToMenu re-checks `dirty` after awaiting the
  // save for exactly this.
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Editor"))).toBe(true);
  expect(await paintedTileCount(page)).toBe(painted);
  await expect.poll(() => saveState(page)).toContain("Save failed");
});

test("once storage comes back, the same level saves and is really there", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await failDriveWrites(page);

  await paintOneTile(page);
  const painted = await paintedTileCount(page);
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(true);
  await clickByText(page, "Editor", "Save");
  await expect.poll(() => saveState(page)).toContain("Save failed");

  // Recovery is the other half of the guarantee: telling you and keeping the
  // work is only useful if the retry then succeeds.
  stopFailingDriveWrites(page);
  await clickByText(page, "Editor", "Save");
  await expect.poll(() => saveState(page)).toContain("Saved");
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(false);

  // Reopened from storage, not from memory — proving the bytes landed.
  await clickByText(page, "Editor", "Menu");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await clickByText(page, "Menu", "My Levels");
  await clickByText(page, "LevelBrowser", "Edit");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));
  await expect.poll(() => paintedTileCount(page)).toBe(painted);
});

// --- deleting a saved level -------------------------------------------------

/** The level *names* listed in My Levels — each row also carries an
 * "Updated …" line and its two buttons, which are not names. */
const listedNames = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("LevelBrowser") as unknown as {
      listContainer: { list: { type?: string; text?: string }[] };
    };
    return scene.listContainer.list
      .filter((c) => c.type === "Text" && c.text)
      .map((c) => c.text!)
      .filter((t) => !t.startsWith("Updated ") && !["Edit", "Delete", "Delete? Tap again"].includes(t));
  });

/** Whether any row's Delete is currently armed. Searches the *container*, not
 * `scene.children.list` — the rows live inside listContainer, so a top-level
 * scan finds nothing and silently reports "not armed". */
const anyDeleteArmed = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("LevelBrowser") as unknown as {
      listContainer: { list: { text?: string }[] };
    };
    return scene.listContainer.list.some((c) => c.text === "Delete? Tap again");
  });

async function openMyLevels(page: Page, names: string[]): Promise<void> {
  await gotoApp(page);
  await seedLevels(page, names);
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await expect.poll(() => listedNames(page).then((n) => n.length)).toBeGreaterThanOrEqual(names.length);
}

test("one tap on Delete only arms it — the level is still there", async ({ page }) => {
  test.slow();
  await openMyLevels(page, ["Keep Me", "Delete Me"]);

  await clickByText(page, "LevelBrowser", "Delete");
  // Armed, not acted on. This used to delete outright, from a button sitting
  // right next to Edit, with no undo.
  await expect.poll(() => listedNames(page)).toContain("Keep Me");
  expect(await listedNames(page)).toContain("Delete Me");
  await expect.poll(() => anyDeleteArmed(page)).toBe(true);
});

test("the second tap deletes that level and leaves the others", async ({ page }) => {
  test.slow();
  await openMyLevels(page, ["Keep Me", "Delete Me"]);

  // Rows render in list order, so the first Delete belongs to the first level.
  const [first] = await listedNames(page);
  await clickByText(page, "LevelBrowser", "Delete");
  await clickByText(page, "LevelBrowser", "Delete? Tap again");

  // Polled on the *positive* end state. `not.toContain` was satisfied by the
  // empty list the browser shows for a moment while it re-reads after the
  // delete, so the poll returned on that transient and the length assertion
  // below read the same empty list — an intermittent failure that looked like
  // the delete having removed both rows.
  await expect.poll(() => listedNames(page)).toHaveLength(1);
  expect(await listedNames(page)).not.toContain(first);
});

test("a delete that fails says so and keeps the row", async ({ page }) => {
  test.slow();
  await openMyLevels(page, ["Keep Me", "Delete Me"]);
  const before = await listedNames(page);
  await failDriveWrites(page);

  await clickByText(page, "LevelBrowser", "Delete");
  await clickByText(page, "LevelBrowser", "Delete? Tap again");

  // Was an unguarded await: the throw meant refresh() never ran and the row
  // just sat there, indistinguishable from a click that missed.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("LevelBrowser") as unknown as {
          statusText: { text: string };
        };
        return scene.statusText.text;
      }),
    )
    .toContain("Couldn't delete");
  expect(await listedNames(page)).toEqual(before);
});

/**
 * The failure the other tests here cannot reach: the tab closing.
 *
 * Everything above protects work for as long as the editor stays open — the
 * level stays dirty, stays on screen, and `leaveToMenu` refuses to navigate.
 * None of it survives someone closing the tab during an outage, which is
 * exactly when someone gives up and does. `EditorScene.handlePageHide` fires
 * `void persistLevel()`, an async Drive write the browser is free to discard
 * mid-teardown, so before this there was no copy of that work anywhere.
 *
 * A synchronous localStorage draft is the fix, and this is the only test that
 * can tell whether it works, because the property is "the work is still there
 * after the page that held it is gone".
 */
test("work survives closing the tab mid-outage, and comes back on reopen", async ({ page }) => {
  test.slow();
  // One level object, passed twice. Playwright structure-clones an evaluate
  // argument, so the browser's copy is the one that gets painted and this one
  // stays as Drive still has it — which is what the reopen below must simulate.
  const stored = LEVEL();

  await gotoApp(page);
  await startEditorWithLevel(page, stored);
  await failDriveWrites(page);

  await paintOneTile(page);
  // Assert the precondition, or the reopen below proves nothing: a test that
  // "restores" a level that was never painted passes against a broken feature.
  expect(await paintedTileCount(page)).toBeGreaterThan(0);

  // The tab goes away. A plain Event, not PageTransitionEvent — the handler
  // reads nothing off it, and PageTransitionEvent is not constructible
  // everywhere.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

  const draft = await page.evaluate((id) => localStorage.getItem(`rhopers:draft:${id}`), stored.id);
  expect(draft, "pagehide must leave a draft behind — it is the only write that can finish").not.toBeNull();

  // Reopening with the copy Drive still holds: unpainted, older. The draft is
  // newer, so the editor should take it.
  await startEditorWithLevel(page, stored);

  expect(await paintedTileCount(page)).toBeGreaterThan(0);
  // Restored work has not reached Drive, so it must still be dirty — otherwise
  // the next save would never push it and the recovery would be cosmetic.
  expect(await readSceneField<boolean>(page, "Editor", "dirty")).toBe(true);
});

/**
 * The same property, for a world.
 *
 * `WorldMakerScene` is a near-copy of the editor's save machinery and had the
 * same hole: `handlePageHide` fired `void persistWorld()`, an async Drive write
 * into a page being torn down. Closing the tab mid-outage lost which levels
 * were in the world, what order they played in and where their nodes sat —
 * about eight gestures, with no copy of them anywhere.
 *
 * Built through the real maker rather than seeded, because the thing under test
 * is what the maker holds in memory versus what Drive was given, and seeding a
 * world would make those the same document.
 */
test("a world's arrangement survives closing the tab mid-outage", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const ids = await seedLevels(page, ["Green Hill", "Ice Cave", "Lava Keep"]);

  await clickByText(page, "Menu", "Worlds");
  await clickByText(page, "WorldBrowser", "New World");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMaker"));

  // Two levels in and saved. This is the state Drive ends up holding, and the
  // world needs a real id before a draft can be keyed by one — see
  // WorldMakerScene.writeDraft on why that window exists and how long it is.
  for (const [i, name] of ["Green Hill", "Ice Cave"].entries()) {
    await clickByText(page, "WorldMaker", name);
    await expect.poll(() => worldLevelIds(page)).toEqual(ids.slice(0, i + 1));
  }
  await expect
    .poll(() => worldSaved(page), { timeout: 20_000 })
    .toEqual({ hasId: true, dirty: false });
  const stored = await loadStoredWorld(page);
  expect(stored?.levelIds, "Drive must be holding the two-level world").toHaveLength(2);

  // **Writes now hang rather than fail**, which is the point. A rejecting write
  // reaches `persistWorld`'s catch, and that catch writes a draft of its own —
  // so it would quietly stand in for the teardown draft this spec is about. A
  // request that never answers is also the truer model of a closing tab: it
  // takes its in-flight requests with it and they never come back as errors.
  await hangDriveWrites(page);

  // The third level is the work that now cannot reach Drive.
  await clickByText(page, "WorldMaker", "Lava Keep");
  // Assert the precondition, or the reopen below proves nothing: a test that
  // "restores" a level that was never added passes against a broken feature.
  await expect.poll(() => worldLevelIds(page)).toEqual(ids);

  // **The tab closes inside the autosave debounce**, which is the harder case
  // and the one `writeDraft`'s own timestamp exists for. Arranging never
  // touches `updatedAt` — only `persistWorld` does — so with no save attempt in
  // between, the world still carries the stamp of the last *successful* save. A
  // draft written verbatim would be judged no newer than the stored copy and
  // silently refused.
  //
  // Measured on 2026-10-18: without cancelling the pending timer this test
  // passed with the stamping removed, because the failed autosave 2s after the
  // click had already bumped `updatedAt` for it. The assertion below is what
  // stops that happening again — if the timer beat us here, this fails loudly
  // rather than quietly testing the easy path.
  const stillStale = await page.evaluate((storedUpdatedAt) => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      autosaveTimer?: { remove(dispatch: boolean): void };
      world: { updatedAt: string };
    };
    scene.autosaveTimer?.remove(false);
    return scene.world.updatedAt === storedUpdatedAt;
  }, stored!.updatedAt);
  expect(stillStale, "no save may have run between the edit and the tab closing").toBe(true);

  // The tab goes away. A plain Event, not PageTransitionEvent — same reasoning
  // as the editor's test above.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

  const draft = await page.evaluate((id) => localStorage.getItem(`rhopers:worlddraft:${id}`), stored!.id);
  expect(draft, "pagehide must leave a draft behind — it is the only write that can finish").not.toBeNull();

  // Reopening with the copy Drive still holds: two levels, older. The draft is
  // newer, so the maker should take it.
  //
  // **Via the browser screen, and that is not decoration.** Restarting a scene
  // that is already running leaves `isActive("WorldMaker")` true throughout, so
  // a wait on it returns at once and every read after it can still be looking
  // at the *pre-restart* scene — which is how this spec passed on 2026-10-18
  // with the draft timestamping removed. Leaving first makes the transition
  // observable, so the reads below are guaranteed to be of the reopened maker.
  // Left through the maker's *own* ScenePlugin, not the global scene manager:
  // `game.scene.start(key)` starts that scene and leaves the caller running,
  // so the maker would never actually shut down and the wait below could not
  // be satisfied.
  await page.evaluate(() => {
    const maker = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      scene: { start(key: string): void };
    };
    maker.scene.start("WorldBrowser");
  });
  await page.waitForFunction(
    () => window.__debugGame!.scene.isActive("WorldBrowser") && !window.__debugGame!.scene.isActive("WorldMaker"),
  );
  await page.evaluate((world) => {
    const browser = window.__debugGame!.scene.getScene("WorldBrowser") as unknown as {
      scene: { start(key: string, data: unknown): void };
    };
    browser.scene.start("WorldMaker", { world });
  }, stored);
  await page.waitForFunction(
    () => window.__debugGame!.scene.isActive("WorldMaker") && !window.__debugGame!.scene.isActive("WorldBrowser"),
  );

  await expect.poll(() => worldLevelIds(page)).toEqual(ids);
  // Restored work has not reached Drive, so it must still be dirty — otherwise
  // the next save would never push it and the recovery would be cosmetic.
  expect(await readSceneField<boolean>(page, "WorldMaker", "dirty")).toBe(true);

  // And it *says so*. Polled, not read once, because the line is written when
  // the level names come back — and it has to survive `refresh()` writing its
  // own "N levels" line, which is the bug a screenshot caught on 2026-10-18:
  // the arrangement came back correctly and nothing on screen explained why it
  // differed from what Drive holds.
  await expect
    .poll(() => worldStatusText(page))
    .toBe("Restored changes that never reached Google Drive");
});
