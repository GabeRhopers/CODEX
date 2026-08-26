import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * Selection has to survive a hover.
 *
 * The Sprite editor used one colour — #3a5a9c — for *both* "you are pointing at
 * this" and "this is the armed tool", and `makeSmallButton`'s pointerout reset
 * every button to the unselected colour unconditionally. So pointing at the
 * armed tool and moving away rendered it inactive, and it stayed wrong until
 * you clicked a different tool. Nothing in the suite noticed, because nothing
 * looked at a button's resting appearance at all.
 *
 * These read the live display list rather than pixels: a Phaser Text's
 * backgroundColor is what the bug was about, and reading it directly says which
 * button is wrong instead of only that the screen changed.
 */

/** Resting background colour of the small text button with this exact label. */
async function buttonBackground(page: Page, label: string): Promise<string> {
  return page.evaluate((text) => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    for (const child of scene.children.list) {
      const o = child as unknown as { type?: string; text?: string; style?: { backgroundColor?: string } };
      if (o.type === "Text" && o.text === text) return o.style?.backgroundColor ?? "";
    }
    throw new Error(`no button labelled "${text}"`);
  }, label);
}

/** Scene coords of a labelled button, so the mouse can be moved onto it. */
async function buttonPoint(page: Page, label: string): Promise<{ x: number; y: number }> {
  return page.evaluate((text) => {
    const game = window.__debugGame!;
    const scene = game.scene.getScene("SkinEditor");
    for (const child of scene.children.list) {
      const o = child as unknown as {
        type?: string;
        text?: string;
        getBounds?: () => { centerX: number; centerY: number };
      };
      if (o.type === "Text" && o.text === text && o.getBounds) {
        const b = o.getBounds();
        const rect = game.canvas.getBoundingClientRect();
        const scale = game.scale.displayScale;
        return { x: rect.left + b.centerX / scale.x, y: rect.top + b.centerY / scale.y };
      }
    }
    throw new Error(`no button labelled "${text}"`);
  }, label);
}

async function openGhostCanvas(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
}

test("the armed tool still looks armed after you hover it and move away", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  await clickByText(page, "SkinEditor", "Fill");
  const armed = await buttonBackground(page, "Fill");
  const idle = await buttonBackground(page, "Paint");
  expect(armed, "the armed tool should not look like an unarmed one").not.toBe(idle);

  // The bug: hovering the armed tool and leaving repainted it as unarmed.
  const p = await buttonPoint(page, "Fill");
  await page.mouse.move(p.x, p.y);
  await page.mouse.move(p.x, p.y + 120); // off the button, without clicking
  await page.waitForTimeout(50);

  expect(await buttonBackground(page, "Fill"), "hovering the armed tool must not clear its highlight").toBe(armed);
  expect(await buttonBackground(page, "Paint")).toBe(idle);
});

test("hovering an unarmed tool does not make it look armed", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  await clickByText(page, "SkinEditor", "Fill");
  const armed = await buttonBackground(page, "Fill");

  // Hover colour and selected colour used to be the same value, so a tool you
  // were merely pointing at was indistinguishable from the armed one.
  const p = await buttonPoint(page, "Paint");
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(50);
  expect(await buttonBackground(page, "Paint"), "a hovered tool must not read as the armed one").not.toBe(armed);
});

test("Grid and Mirror keep their On highlight after a hover", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  for (const [off, on] of [
    ["Grid: Off", "Grid: On"],
    ["Mirror: Off", "Mirror: On"],
  ]) {
    const before = await buttonBackground(page, off);
    await clickByText(page, "SkinEditor", off);
    const lit = await buttonBackground(page, on);
    expect(lit, `${on} should not look the same as ${off}`).not.toBe(before);

    const p = await buttonPoint(page, on);
    await page.mouse.move(p.x, p.y);
    await page.mouse.move(p.x, p.y + 120);
    await page.waitForTimeout(50);
    expect(await buttonBackground(page, on), `${on} lost its highlight to a hover`).toBe(lit);
  }
});
