import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, waitForSkinCanvas } from "./support/coords";

/**
 * Advice about a mouse is only shown to people holding one.
 *
 * The Skin Creator printed "Scroll to pan" and "Ctrl+scroll zooms" from the day
 * those gestures were added until 2026-09-12, unconditionally. On the first iPad
 * screenshot anyone took of this app, there they were: two lines of instructions
 * naming a key that device does not have and a gesture a finger does not make,
 * on the screen a child spends the longest on.
 *
 * Both directions are checked, and the second is the one that would rot
 * silently. A gate like this is easy to write so tightly that it hides the hint
 * from everybody, and nothing about a *missing* line of grey 10px text looks
 * broken — the mouse case is what stops this being "fixed" by deleting the
 * feature.
 *
 * `isMobile` + `hasTouch` is what makes Chromium report `(pointer: coarse)`;
 * viewport size alone does not, which is why a small-viewport spec would have
 * passed while proving nothing.
 */

const HINT = "Ctrl+scroll zooms";

/** Every string drawn on the Skin Creator. */
const labels = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type Obj = { type?: string; text?: string; list?: Obj[] };
    const out: string[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.type === "Text" && child.text) out.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return out;
  });

async function openTheCanvas(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await waitForSkinCanvas(page);
}

test.describe("with a mouse", () => {
  test("the scroll and Ctrl hints are shown", async ({ page }) => {
    test.slow();
    await openTheCanvas(page);
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "this context is not a fine pointer").toBe(
      true,
    );
    expect(await labels(page)).toContain(HINT);
  });
});

test.describe("on a touchscreen", () => {
  test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });

  test("they are not", async ({ page }) => {
    test.slow();
    await openTheCanvas(page);
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "touch emulation did not take").toBe(false);
    expect(await labels(page), "an iPad was told to hold Ctrl").not.toContain(HINT);
  });
});
