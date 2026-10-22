import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { seedLevels } from "./support/worlds";

/**
 * My Levels — the list of what a child has actually made.
 *
 * It had no spec of its own, and it had no Play button. My Worlds offered
 * Play · Edit · Delete and Templates offered Play · Use This Template, while
 * the one list holding your own work offered Edit and Delete and nothing else:
 * the only way to play a level you had saved was to open it in the editor and
 * press Test Play. For a tool whose whole proposition is "make a thing, then
 * play it", that was the most surprising absence on any screen (see
 * docs/ui-review.md, 2026-10-19).
 *
 * What these tests hold onto is the round trip, not the button. Starting Play
 * is the easy half; coming back to the list you left — rather than to the
 * editor, which is where every level that was not a template used to return —
 * is the half that was actually missing.
 */

/** The Play scene's top-left back button, which renders as "◀ <WHERE> (ESC)".
 * Read off the live display list, so this follows the label rather than
 * pinning where it sits. */
const backButtonLabel = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play");
    type Obj = { type?: string; text?: string; list?: Obj[] };
    const find = (list: Obj[]): string | null => {
      for (const child of list) {
        if (child.type === "Text" && typeof child.text === "string" && child.text.startsWith("◀")) return child.text;
        if (child.list) {
          const found = find(child.list);
          if (found) return found;
        }
      }
      return null;
    };
    return find((scene?.children.list as unknown as Obj[]) ?? []);
  });

const playingLevelId = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { level?: { id: string } };
    return scene?.level?.id;
  });

/** The row buttons currently on screen, which is what the list actually
 * offers — not what the scene was configured with. */
const rowButtons = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("LevelBrowser") as unknown as {
      listContainer: { list: { type?: string; text?: string }[] };
    };
    return scene.listContainer.list
      .filter((o) => o.type === "Text" && ["Play", "Edit", "Delete"].includes(o.text ?? ""))
      .map((o) => o.text ?? "");
  });

async function openMyLevels(page: Page, names: string[]): Promise<string[]> {
  await gotoApp(page);
  const ids = await seedLevels(page, names);
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  return ids;
}

test("a saved level row offers Play as well as Edit", async ({ page }) => {
  test.slow();
  await openMyLevels(page, ["Meadow Path"]);
  // In row order, so this also pins that Play comes *first* — the same order My
  // Worlds and Templates use, and the order of the two things a child wants.
  await expect.poll(() => rowButtons(page)).toEqual(["Play", "Edit", "Delete"]);
});

test("Play opens that level, and the way back is the list you came from", async ({ page }) => {
  test.slow();
  // Two levels, and the second one is played. A one-level list would pass just
  // as well for a Play button wired to the wrong row.
  const ids = await openMyLevels(page, ["Meadow Path", "The Long Climb"]);

  await clickByText(page, "LevelBrowser", "Play");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect.poll(() => playingLevelId(page)).toBe(ids[0]);

  // The button has to *say* where it goes. It said "◀ EDITOR" for every level
  // that was not a template, which is a worse failure than saying nothing:
  // it looks completely correct until somebody presses it.
  await expect.poll(() => backButtonLabel(page)).toBe("◀ MY LEVELS (ESC)");

  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__debugGame!.scene.isActive("LevelBrowser") && !window.__debugGame!.scene.isActive("Play"),
  );
  // Back at a working list, not a dead screen: the rows are there to play again.
  await expect.poll(() => rowButtons(page)).toEqual(["Play", "Edit", "Delete", "Play", "Edit", "Delete"]);
});
