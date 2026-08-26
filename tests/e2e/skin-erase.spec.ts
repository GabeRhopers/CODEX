import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * The Erase tool. Erasing was previously reachable only by right-click or by
 * selecting the transparent ✕ swatch — the first does not exist on a
 * touchscreen, and the second costs you whatever colour you had selected. So
 * this covers both halves of "it is a tool": it drags like Paint, and taking it
 * does not take your colour with it.
 *
 * The second test is a layout guard. The tool row is right-aligned and the
 * swatch row is centred and palette-dependent, so they approach each other from
 * opposite directions and nothing in the code stops them meeting — adding this
 * fifth tool spent most of the clearance that was left. A measured floor is
 * what keeps a sixth from silently sliding underneath the swatches.
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

test("the tool row still clears the widest palette's swatches", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  // PICO-8 is the default and the widest: 16 colours plus the transparent ✕.
  const layout = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    const labels = ["Pan", "Paint", "Erase", "Fill", "Pick"];
    let toolLeft = Number.POSITIVE_INFINITY;
    let swatchRight = Number.NEGATIVE_INFINITY;
    let swatches = 0;
    for (const child of scene.children.list) {
      const text = child as { text?: string; x?: number };
      if (typeof text.text === "string" && labels.includes(text.text)) {
        toolLeft = Math.min(toolLeft, text.x!);
      }
      // Swatches are 24px rectangles drawn from origin (0,0).
      const rect = child as { width?: number; height?: number; x?: number; type?: string };
      if (rect.type === "Rectangle" && rect.width === 24 && rect.height === 24) {
        swatches++;
        swatchRight = Math.max(swatchRight, rect.x! + 24);
      }
    }
    return { toolLeft, swatchRight, swatches };
  });

  expect(layout.swatches).toBe(17); // 16 colours + transparent — the widest case
  expect(layout.toolLeft).toBeGreaterThan(layout.swatchRight);
  // Not merely "does not overlap": a gap this side of comfortable is the signal
  // that the next tool needs a different home rather than another 6px.
  expect(layout.toolLeft - layout.swatchRight).toBeGreaterThan(8);
});
