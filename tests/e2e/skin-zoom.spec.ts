import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * The Skin Creator's zoom, reworked 2026-08-23 from "grow the canvas inside a
 * 336px band" (a 1.6x range, three clicks end to end) to "a fixed window with
 * the drawing scaled and panned inside it" (16x).
 *
 * The first test here is the one that matters. Every cell click is derived from
 * the canvas element's own bounding box, and that box is now a scaled, offset,
 * clipped thing rather than the window itself — so "clicking a pixel paints
 * that pixel" stops being obvious and starts being a claim that needs checking
 * at a zoom level and pan offset where an off-by-one would actually show.
 */

const GRID = 32;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The clipping window, the scaled content box, and the game canvas — read in
 * one hop so they are all from the same layout pass. */
async function boxes(page: Page): Promise<{ viewport: Box; canvas: Box; game: Box }> {
  return page.evaluate((grid) => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === grid && c.height === grid);
    if (!canvas) throw new Error(`no ${grid}x${grid} pixel canvas`);
    const viewport = canvas.parentElement!.parentElement!;
    const game = window.__debugGame!.canvas;
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return { viewport: box(viewport), canvas: box(canvas), game: box(game) };
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

async function readView(page: Page): Promise<{ zoomIndex: number; panX: number; panY: number }> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getView(): { zoomIndex: number; panX: number; panY: number } };
    };
    return scene.pixelCanvas!.getView();
  });
}

const paintedIndexes = (cells: (string | null)[]): number[] =>
  cells.flatMap((cell, i) => (cell === null ? [] : [i]));

async function openGhostCanvas(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
  // Every test starts from a known zoom — the level is a persisted tool
  // preference, so without this each test would inherit the last one's.
  await clickByText(page, "SkinEditor", "Fit");
}

test("a click paints the cell under it, zoomed in four times and panned off-centre", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  for (let i = 0; i < 4; i++) await clickByText(page, "SkinEditor", "＋ Zoom");
  expect((await boxes(page)).canvas.width).toBeGreaterThan((await boxes(page)).viewport.width * 3.5);

  // Drag the view off-centre with the Pan tool, so the content box's origin is
  // nowhere near the window's and a naive window-relative calculation breaks.
  await clickByText(page, "SkinEditor", "Pan");
  const before = await boxes(page);
  const midX = before.viewport.left + before.viewport.width / 2;
  const midY = before.viewport.top + before.viewport.height / 2;
  await page.mouse.move(midX, midY);
  await page.mouse.down();
  await page.mouse.move(midX - 70, midY - 45, { steps: 8 });
  await page.mouse.up();

  const panned = await boxes(page);
  expect(panned.canvas.left).toBeLessThan(before.canvas.left);
  expect(panned.canvas.top).toBeLessThan(before.canvas.top);

  await clickByText(page, "SkinEditor", "Paint");

  // Three points spread across the *window* (so each is genuinely visible and
  // genuinely clickable), each checked against the cell the content box says
  // sits under it.
  const expected: number[] = [];
  for (const [fx, fy] of [
    [0.25, 0.3],
    [0.5, 0.55],
    [0.8, 0.75],
  ]) {
    const b = await boxes(page);
    const x = b.viewport.left + b.viewport.width * fx;
    const y = b.viewport.top + b.viewport.height * fy;
    const index =
      Math.floor(((y - b.canvas.top) / b.canvas.height) * GRID) * GRID +
      Math.floor(((x - b.canvas.left) / b.canvas.width) * GRID);
    await page.mouse.click(x, y);
    if (!expected.includes(index)) expected.push(index);
    await expect.poll(() => readCells(page).then(paintedIndexes)).toEqual([...expected].sort((p, q) => p - q));
  }
});

test("zooms in far past the old 320px ceiling, and the window stays put", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  const fit = await boxes(page);
  // At fit the drawing exactly fills the window — the old maximum, now the
  // baseline rather than the limit.
  expect(fit.canvas.width).toBeCloseTo(fit.viewport.width, 0);

  for (let i = 0; i < 12; i++) await clickByText(page, "SkinEditor", "＋ Zoom");
  const zoomed = await boxes(page);

  // The old model could not exceed the window by any amount at all.
  expect(zoomed.canvas.width / fit.viewport.width).toBeGreaterThan(7);
  expect(await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { pixelCanvas?: { canPan(): boolean } };
    return scene.pixelCanvas!.canPan();
  })).toBe(true);

  // "Keep UI nice": however far in you go, the window itself never grows and
  // never leaves the game canvas, so nothing gets pushed off the 468px scene.
  expect(zoomed.viewport.width).toBeCloseTo(fit.viewport.width, 0);
  expect(zoomed.viewport.left).toBeGreaterThanOrEqual(zoomed.game.left - 1);
  expect(zoomed.viewport.top).toBeGreaterThanOrEqual(zoomed.game.top - 1);
  expect(zoomed.viewport.left + zoomed.viewport.width).toBeLessThanOrEqual(zoomed.game.left + zoomed.game.width + 1);
  expect(zoomed.viewport.top + zoomed.viewport.height).toBeLessThanOrEqual(zoomed.game.top + zoomed.game.height + 1);
});

test("zooms out below the old 200px floor and centres what is left", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  const fit = await boxes(page);
  for (let i = 0; i < 6; i++) await clickByText(page, "SkinEditor", "－ Zoom");
  const out = await boxes(page);

  // Old floor was 200 of a 320 window, i.e. 0.625.
  expect(out.canvas.width / fit.viewport.width).toBeLessThan(0.625);
  // Smaller than the window means there is nothing to pan, so it is centred
  // rather than parked in a corner.
  const leftGap = out.canvas.left - out.viewport.left;
  const rightGap = out.viewport.left + out.viewport.width - (out.canvas.left + out.canvas.width);
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);

  await clickByText(page, "SkinEditor", "Fit");
  expect((await readView(page)).zoomIndex).toBe(2);
  expect((await boxes(page)).canvas.width).toBeCloseTo(fit.viewport.width, 0);
});
