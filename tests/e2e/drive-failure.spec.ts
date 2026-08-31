import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, readSceneField, startEditorWithLevel, tileCenter, clickScenePoint } from "./support/coords";
import { failDriveWrites, stopFailingDriveWrites } from "./support/mockDrive";
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
