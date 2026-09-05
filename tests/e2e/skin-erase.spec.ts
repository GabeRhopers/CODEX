import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";
import { assertLayoutSound } from "./support/layout";

/**
 * The Erase tool. Erasing was previously reachable only by right-click or by
 * selecting the transparent ✕ swatch — the first does not exist on a
 * touchscreen, and the second costs you whatever colour you had selected. So
 * this covers both halves of "it is a tool": it drags like Paint, and taking it
 * does not take your colour with it.
 *
 * The second test is a layout guard, and it is the only one this scene's canvas
 * mode has — layout-invariants.spec.ts covers the pick-brush grid and nothing
 * covered this. It used to be much narrower: a measured floor on the gap between
 * the right-aligned tool row and the centred, palette-dependent swatch row,
 * which approached each other from opposite directions with nothing in the code
 * stopping them meeting. The 2026-09-05 layout put those in separate columns, so
 * that particular gap no longer exists — but the columns can still overrun the
 * footer, which is exactly what assertLayoutSound already looks for, generally,
 * for every pair of interactive labels on the screen at once.
 */

const GRID = 32;

async function canvasBox(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  return page.evaluate((g) => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === g && c.height === g);
    if (!canvas) throw new Error(`no ${g}x${g} pixel canvas`);
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, GRID);
}

async function readCells(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getCells(): (string | null)[] };
    };
    if (!scene.pixelCanvas) throw new Error("canvas mode not active");
    return scene.pixelCanvas.getCells();
  });
}

const painted = (cells: (string | null)[]): (string | null)[] => cells.filter((c) => c !== null);

/** Page coordinates of a cell's centre. */
function cellPoint(box: { left: number; top: number; width: number; height: number }, x: number, y: number) {
  return { x: box.left + ((x + 0.5) * box.width) / GRID, y: box.top + ((y + 0.5) * box.height) / GRID };
}

async function openGhostCanvas(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
}

test("Erase rubs out a whole drag, and gives your colour back when you leave it", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  // Paint a row of four by dragging, so the erase below has a run to clear
  // rather than one cell.
  let box = await canvasBox(page);
  await page.mouse.move(cellPoint(box, 6, 8).x, cellPoint(box, 6, 8).y);
  await page.mouse.down();
  for (const x of [7, 8, 9]) await page.mouse.move(cellPoint(box, x, 8).x, cellPoint(box, x, 8).y);
  await page.mouse.up();

  const beforeErase = await readCells(page);
  expect(painted(beforeErase)).toHaveLength(4);
  const colour = painted(beforeErase)[0];

  // Erase the same run in one drag. A tool that only acted once per press
  // would leave three of the four behind, which is the guard in onPointerMove.
  await clickByText(page, "SkinEditor", "Erase");
  box = await canvasBox(page);
  await page.mouse.move(cellPoint(box, 6, 8).x, cellPoint(box, 6, 8).y);
  await page.mouse.down();
  for (const x of [7, 8, 9]) await page.mouse.move(cellPoint(box, x, 8).x, cellPoint(box, x, 8).y);
  await page.mouse.up();

  await expect.poll(() => readCells(page).then(painted)).toHaveLength(0);

  // The colour survived the excursion — the whole reason Erase is a tool and
  // not "go select the transparent swatch and then find your colour again".
  await clickByText(page, "SkinEditor", "Paint");
  box = await canvasBox(page);
  await page.mouse.click(cellPoint(box, 20, 20).x, cellPoint(box, 20, 20).y);
  await expect.poll(() => readCells(page).then(painted)).toEqual([colour]);
});

test("canvas mode is laid out soundly with the widest palette showing", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  // PICO-8 is the default and the widest: 16 colours plus the transparent ✕,
  // so the colour grid is at its tallest and the columns at their fullest.
  const swatches = await page.evaluate(
    () =>
      window.__debugGame!.scene.getScene("SkinEditor").children.list.filter(
        (child) => (child as { name?: string }).name === "palette-swatch",
      ).length,
  );
  // Without this the check below could pass on a screen that simply failed to
  // draw the colours. By name rather than by size and position — see the note in
  // skin-palette.spec.ts's shadeSwatches for what geometry-matching cost.
  expect(swatches, "the colour grid is not at its widest — this guard is vacuous").toBe(17);

  await assertLayoutSound(page, "SkinEditor");
});
