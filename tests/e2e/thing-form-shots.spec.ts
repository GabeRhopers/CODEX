import { expect, test } from "@playwright/test";
import { clickByText, gotoApp } from "./support/coords";
import { assertLayoutSound } from "./support/layout";

/**
 * The Thing Maker's edit form, in all three families.
 *
 * The Sound row pushes everything below it down, and the tightest case —
 * Enemies, which also carries a Speed row — leaves the Save buttons around
 * y=414 against a 468px canvas. That is arithmetic, and arithmetic is exactly
 * what has been wrong before, so this looks.
 *
 * `assertLayoutSound` runs too, but it only compares *interactive* text: two
 * plain labels overlapping is invisible to it, which is how the Menu's credits
 * line and an empty palette hint both shipped through it. The screenshots are
 * the part that catches those.
 */

test("the edit form fits in every family", async ({ page }, testInfo) => {
  test.slow();

  await gotoApp(page);
  await clickByText(page, "Menu", "Thing Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ThingMaker"));
  await clickByText(page, "ThingMaker", "+ New Thing");

  for (const family of ["Item", "Enemy", "Decoration"] as const) {
    await clickByText(page, "ThingMaker", family);
    await page.waitForTimeout(300);

    const name = `thing-form-${family.toLowerCase()}`;
    await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
    await page.screenshot({ path: `test-results/${name}.png` });

    // Nothing may run off the bottom. This is the assertion the arithmetic in
    // the plan was a guess at; Enemy is the case it was closest on.
    const overflow = await page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("ThingMaker");
      const height = window.__debugGame!.scale.height;
      const over: string[] = [];
      for (const child of scene.children.list) {
        const o = child as unknown as { type?: string; text?: string; getBounds?: () => { y: number; height: number } };
        const b = o.getBounds?.();
        if (b && b.y + b.height > height + 1) over.push(`${o.type} "${o.text ?? ""}" bottom=${(b.y + b.height).toFixed(0)}`);
      }
      return over;
    });
    expect(overflow, `${family}: something runs off the bottom of the canvas`).toEqual([]);

    await assertLayoutSound(page, "ThingMaker");
  }
});
