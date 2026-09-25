import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, openThings } from "./support/coords";
import { failDriveWrites, stopFailingDriveWrites } from "./support/mockDrive";
import { listCustomEntities } from "./support/customEntities";

/**
 * A thing whose save did not happen.
 *
 * **The symptom was "I made a thing and it isn't in the editor".** The cause was
 * one missing `.catch`: `onSave` sent the definition out as a bare
 * `void saveCustomEntity(draft).then(...)` and printed `Saved "<name>"` from a
 * *different*, synchronous branch — so the green message did not depend on the
 * write at all. Under an outage the screen said Saved and the library was
 * empty, which is indistinguishable from the app losing your work, because it
 * is the app losing your work.
 *
 * `drive-failure.spec.ts` already calls this Tier 1 for the level editor and
 * pins the same three properties there: say so, keep what is on screen, and let
 * a retry work once storage comes back. This is that spec for the Thing Maker,
 * which had never been asked any of them.
 *
 * Reads keep working while writes fail, which is what makes the assertions mean
 * something — the form is still on screen with the name still in it.
 */

/** The name field's placeholder, and the name typed into it. */
const NAME_FIELD = "Star Fruit";
const THING_NAME = "Star Fruit";

function sceneMode(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { mode?: string };
    return scene.mode;
  });
}

/** Every string the Skin Creator is drawing. Read wholesale rather than by
 * position because the status line moves with the rail's layout. */
const labels = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type O = { type?: string; text?: string; list?: O[] };
    const out: string[] = [];
    const walk = (l: O[]): void => {
      for (const c of l) {
        if (c.type === "Text" && c.text) out.push(c.text);
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return out;
  });

const says = async (page: Page, fragment: string): Promise<boolean> =>
  (await labels(page)).some((t) => t.includes(fragment));

/** Menu → Things → + New Thing, named and ready to save. */
async function aNamedThing(page: Page): Promise<void> {
  await gotoApp(page);
  await openThings(page);
  await clickByText(page, "SkinEditor", "+ New Thing");
  await expect.poll(() => sceneMode(page)).toBe("thing");
  await page.getByPlaceholder(NAME_FIELD).fill(THING_NAME);
  await page.getByPlaceholder(NAME_FIELD).press("Enter");
}

test("a save that fails says so instead of saying Saved", async ({ page }) => {
  test.slow();
  // **The bug, as an assertion.** Before the fix this screen showed
  // `Saved "Star Fruit".` in green with nothing in the library behind it.
  await aNamedThing(page);
  await failDriveWrites(page);
  await clickByText(page, "SkinEditor", "Save");

  await expect.poll(() => says(page, "Couldn't save"), { timeout: 10_000 }).toBe(true);
  expect(await says(page, "Saved"), "it must not claim a save that did not happen").toBe(false);
  expect(await listCustomEntities(page), "and nothing reached the library").toEqual([]);
});

test("the thing is still on screen afterwards, with its name", async ({ page }) => {
  test.slow();
  // The half that makes the message worth showing: being told it failed is no
  // use if the form has already been cleared or navigated away from. The name
  // is the part that cannot be recovered from anywhere else.
  await aNamedThing(page);
  await failDriveWrites(page);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => says(page, "Couldn't save"), { timeout: 10_000 }).toBe(true);

  expect(await sceneMode(page), "still on the form, not sent back to the grid").toBe("thing");
  await expect(page.getByPlaceholder(NAME_FIELD)).toHaveValue(THING_NAME);
});

test("pressing Save again once Drive is back actually saves it", async ({ page }) => {
  test.slow();
  // The recovery, which is the whole reason the other two matter. An outage
  // that cost the work regardless would make "try again in a moment" a lie.
  await aNamedThing(page);
  await failDriveWrites(page);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => says(page, "Couldn't save"), { timeout: 10_000 }).toBe(true);

  await stopFailingDriveWrites(page);
  await clickByText(page, "SkinEditor", "Save");

  await expect.poll(async () => (await listCustomEntities(page)).map((d) => d.name), { timeout: 10_000 }).toEqual([
    THING_NAME,
  ]);
  expect(await says(page, "Saved"), "and now it may say so").toBe(true);
});
