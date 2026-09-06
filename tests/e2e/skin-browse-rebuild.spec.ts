import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { delaySkinsRead } from "./support/mockDrive";

/**
 * Leaving the Skin Creator's browse list and coming back while it is still
 * loading must not draw the list twice.
 *
 * `SkinEditorScene.buildBrowse` paints its header immediately and appends the
 * rows when `listPixelSkins()` lands — correct behaviour, and the pattern this
 * whole app is built on. What was wrong was the guard on that late append:
 * `if (this.mode !== "browse") return`. It asks whether the *mode* is still
 * browse, which is true again the moment you go browse → pick-brush → browse,
 * and says nothing about whether the screen it was building still exists. It
 * does not: `rebuild()` destroys every child before building the new one. So
 * the first build's chain would append its rows into the second build's screen,
 * on top of the rows that build had already appended itself — two identical
 * lists stacked pixel-for-pixel, which reads as smeared text rather than as
 * anything recognisably wrong.
 *
 * The fix is a build counter captured by the closure, so a chain can tell that
 * the screen it belongs to has been replaced. This test is what says so.
 *
 * Nothing needs to be saved first. The empty state — "No pixel skins yet" — is
 * appended by the same guarded branch as the rows, so it duplicates the same
 * way, and it needs no fixture.
 */

const EMPTY_STATE = "No pixel skins yet — tap + New Skin to paint one.";

/** How many Texts on the SkinEditor screen read exactly `text`. */
async function countText(page: Page, text: string): Promise<number> {
  return page.evaluate((text) => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type Listable = { list?: Listable[]; type?: string; text?: string };
    let count = 0;
    const walk = (list: Listable[]): void => {
      for (const child of list) {
        if (child.type === "Text" && child.text === text) count++;
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Listable[]) ?? []);
    return count;
  }, text);
}

test("leaving the browse list mid-load and coming back doesn't draw it twice", async ({ page }) => {
  test.slow();

  // After gotoApp, not before. Playwright matches routes last-registered-first,
  // and gotoApp installs the base Drive mock itself — registering the delay
  // first means the base mock shadows it and nothing is ever delayed. (It cost
  // one confusing run where the read had simply already finished.) Nothing
  // reads skins on the boot path, so the Skin Creator's own read below is still
  // the first one, and still uncached.
  await gotoApp(page);
  // Wide enough that the two clicks below comfortably fit inside the window,
  // even on a loaded CI runner, and short enough that waiting it out twice is
  // not the bulk of the test.
  await delaySkinsRead(page, 4000);

  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));

  // The chain is in flight exactly while this is on screen — buildBrowse
  // creates it synchronously and only the `.then` destroys it.
  await expect.poll(() => countText(page, "Loading…")).toBe(1);

  // Away and back, both screens built synchronously, both well inside the
  // outstanding read.
  await clickByText(page, "SkinEditor", "+ New Skin");
  await page.waitForFunction(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { mode?: string };
    return scene.mode === "pick-brush";
  });
  await clickByText(page, "SkinEditor", "← Back");
  await expect.poll(() => countText(page, "Loading…")).toBe(1);

  // Both chains resolve together — `loadCustomSkins` dedupes concurrent reads,
  // so the abandoned build and the live one are waiting on the same promise and
  // wake in the same tick. That is what makes the duplicate deterministic
  // rather than a matter of luck.
  await expect.poll(() => countText(page, EMPTY_STATE), { timeout: 15_000 }).toBe(1);

  // And it stays one: a chain that was going to append late has had every
  // chance to by now.
  await page.waitForTimeout(500);
  expect(await countText(page, EMPTY_STATE)).toBe(1);
  expect(await countText(page, "Loading…")).toBe(0);
});
