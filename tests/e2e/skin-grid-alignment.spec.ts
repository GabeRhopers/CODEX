import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * What you can see behind the drawing has to agree with the cells you paint.
 *
 * Reported from use: "the grid background in the sprite maker doesn't match the
 * actual pixel being drawn". The background in question is the checkerboard —
 * the thing an empty canvas is entirely made of, and the only thing on screen
 * that looks like a grid before you switch the grid lines on. It is drawn at a
 * fixed **16px** tile (two 8px squares) regardless of zoom, while a cell at fit
 * zoom on the 32 grid is 12.19px. So the squares you count are not the cells you
 * paint, they are 2/3 the size, and every painted block straddles them.
 *
 * `skin-grid.spec.ts` proves the *lines* are visible; this proves the layers are
 * in the right *place*, which is a different claim and was the one that was
 * false.
 *
 * All three tests measure by screenshotting the canvas element and reading the
 * image, rather than by trusting the CSS that is under suspicion.
 */

const GRID = 32;
// PICO-8's red — in the default palette, and unmistakable against the grey
// checkerboard.
const PAINT = "#FF004D";

/** Clicks a palette swatch by colour, asking the live scene where it is — the
 * same approach skin-grid.spec.ts uses, for the same reason. */
async function clickSwatch(page: Page, hex: string): Promise<void> {
  const point = await page.evaluate((hex) => {
    const game = window.__debugGame!;
    const scene = game.scene.getScene("SkinEditor");
    const want = parseInt(hex.replace("#", ""), 16);
    const swatch = scene.children.list.find(
      (child) => (child as { fillColor?: number }).fillColor === want && (child as { width?: number }).width === 24,
    ) as unknown as { x: number; y: number } | undefined;
    if (!swatch) throw new Error(`no swatch for ${hex}`);
    const rect = game.canvas.getBoundingClientRect();
    const scale = game.scale.displayScale;
    return { x: rect.left + (swatch.x + 12) / scale.x, y: rect.top + (swatch.y + 12) / scale.y };
  }, hex);
  await page.mouse.click(point.x, point.y);
}

function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate((grid) => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === grid)!;
    const r = canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, GRID);
}

/** Paints the cell whose *exact-fraction* centre is under the cursor — which is
 * the cell `cellIndexFromEvent` will choose. */
async function paintCellAt(page: Page, col: number, row: number): Promise<void> {
  const box = await canvasBox(page);
  const cell = box.width / GRID;
  await page.mouse.click(box.x + (col + 0.5) * cell, box.y + (row + 0.5) * cell);
}

/**
 * Reads one horizontal line of the canvas out of a screenshot, in CSS pixels.
 *
 * The page decodes its own screenshot: Playwright hands back a PNG and Node has
 * no decoder, and adding one for a couple of measurements is not worth a
 * dependency — `skin-grid.spec.ts` already does exactly this. The returned
 * samples are indexed in CSS pixels rather than image pixels so a
 * `devicePixelRatio` above 1 does not silently double every measurement.
 */
async function scanLine(page: Page, row: number): Promise<{ luma: number[]; red: boolean[]; scale: number }> {
  const box = await canvasBox(page);
  const png = (await page.screenshot({ clip: box })).toString("base64");
  return page.evaluate(
    async ({ png, row, grid, cssWidth }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = `data:image/png;base64,${png}`;
      });
      const scratch = document.createElement("canvas");
      scratch.width = image.width;
      scratch.height = image.height;
      const ctx = scratch.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
      // Down the middle of the row, so a grid line along its top or bottom edge
      // can never be mistaken for the edge of what is being measured.
      const y = Math.floor(((row + 0.5) * height) / grid);
      const luma: number[] = [];
      const red: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        luma.push((data[i] + data[i + 1] + data[i + 2]) / 3);
        // Strongly red and not much else. The grid lines blend with
        // `difference`, so a line over red darkens it rather than turning it
        // another hue.
        red.push(data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 150);
      }
      return { luma, red, scale: width / cssWidth };
    },
    { png, row, grid: GRID, cssWidth: box.width },
  );
}

/** Where a run of `true` starts and ends, in CSS pixels. `left` is -1 when
 * there is no run at all. */
function runBounds(flags: boolean[], scale: number): { left: number; right: number } {
  let left = -1;
  let right = -1;
  for (let x = 0; x < flags.length; x++) {
    if (!flags[x]) continue;
    if (left < 0) left = x;
    right = x + 1;
  }
  return left < 0 ? { left: -1, right: -1 } : { left: left / scale, right: right / scale };
}

async function openNewSkin(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForFunction(
    (grid) => !!Array.from(document.querySelectorAll("canvas")).find((c) => c.width === grid),
    GRID,
  );
  // The grid lines start hidden (PixelCanvasOverlay's `gridVisible = false`),
  // which is what these measurements want: the lines blend with `difference`,
  // so one sitting on a boundary under test would recolour that column and be
  // taken for an edge. Their own visibility is `skin-grid.spec.ts`'s subject —
  // and note that on a fresh canvas they are off, so the checkerboard below is
  // the *only* grid a first-time user has to go by.
}

test("the checkerboard behind the drawing is squared to the cells you paint", async ({ page }) => {
  test.slow();
  // The reported bug. An empty canvas is nothing but this checkerboard, so its
  // squares are what anyone reads as "the pixels" — and if they are not the
  // pixels, the tool is lying about its own resolution before a single stroke.
  await openNewSkin(page);

  const box = await canvasBox(page);
  const cell = box.width / GRID;
  const { luma, scale } = await scanLine(page, 16);

  // The checkerboard is #666 on #999: a light/dark split either side of the
  // midpoint, with nothing else on a blank canvas to confuse it.
  const edges: number[] = [];
  for (let x = 1; x < luma.length; x++) {
    if (luma[x - 1] < 127 !== luma[x] < 127) edges.push(x / scale);
  }
  expect(edges.length, "no checkerboard found to measure").toBeGreaterThan(4);

  // Every square boundary must land on a cell boundary. A square may span
  // several cells (it has to, once a cell is only a few pixels across), but it
  // may never end in the middle of one.
  const offsets = edges.map((x) => Math.abs(x - Math.round(x / cell) * cell));
  const worst = Math.max(...offsets);
  const report =
    `cell=${cell.toFixed(3)}px  first edges=[${edges.slice(0, 6).map((e) => e.toFixed(1)).join(", ")}]` +
    `  nearest cell boundaries=[${edges
      .slice(0, 6)
      .map((e) => (Math.round(e / cell) * cell).toFixed(1))
      .join(", ")}]`;
  // One CSS pixel of slack for the gradient's own antialiasing; the failure
  // this catches is several pixels wide, not a rounding argument.
  expect(worst, `checkerboard squares are not cell-aligned\n${report}`).toBeLessThanOrEqual(1);
});

test("a painted cell lands where the grid's own fractions say it does", async ({ page }) => {
  test.slow();
  // Not the reported bug — measured at ±0.5px, which is invisible — but the
  // guard that keeps it that way. Three participants decide where a cell edge
  // appears: the CSS gradients (exact fractions), the `pixelated` upscale of
  // the pixel buffer (nearest-neighbour, so whole device pixels), and
  // `cellIndexFromEvent` (exact fractions again). Half a pixel is the most a
  // correctly-placed box can put between them.
  await openNewSkin(page);
  await clickSwatch(page, PAINT);

  const box = await canvasBox(page);
  const cell = box.width / GRID;
  const row = 16;
  // Several columns: the error is not constant, it drifts in and out of
  // agreement across the grid, so one sample can land on a cell that happens to
  // line up exactly.
  const drift: string[] = [];

  for (const col of [1, 15, 30]) {
    await paintCellAt(page, col, row);
    const { red, scale } = await scanLine(page, row);
    const run = runBounds(red, scale);
    expect(run.left, `nothing painted for column ${col}`).toBeGreaterThanOrEqual(0);

    const expectedLeft = col * cell;
    const expectedRight = (col + 1) * cell;
    drift.push(
      `col ${col}: paint [${run.left.toFixed(2)}, ${run.right.toFixed(2)}) vs grid ` +
        `[${expectedLeft.toFixed(2)}, ${expectedRight.toFixed(2)})`,
    );
    expect(Math.abs(run.left - expectedLeft), `left edge, column ${col}\n${drift.join("\n")}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(run.right - expectedRight), `right edge, column ${col}\n${drift.join("\n")}`).toBeLessThanOrEqual(
      0.5,
    );

    // Undo, so the next column measures a clean run.
    await clickByText(page, "SkinEditor", "↶ Undo");
  }
});

test("clicking inside a cell you can see paints that cell", async ({ page }) => {
  test.slow();
  // The half that would cost real work if it broke: if the art's rendered
  // boundary and the click arithmetic disagreed, aiming just inside a cell you
  // can see would paint its neighbour.
  await openNewSkin(page);
  await clickSwatch(page, PAINT);

  const box = await canvasBox(page);
  const cell = box.width / GRID;
  const col = 15;
  const row = 8;

  // Two device pixels inside the rendered left edge of the cell — comfortably
  // inside what the eye reads as that cell.
  const renderedLeft = Math.round(col * cell);
  await page.mouse.click(box.x + renderedLeft + 2, box.y + (row + 0.5) * cell);

  const painted = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getCells(): (string | null)[] };
    };
    const cells = scene.pixelCanvas!.getCells();
    return cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  });

  expect(painted, "exactly one cell should be painted").toHaveLength(1);
  expect(painted[0], `expected column ${col} of row ${row}`).toBe(row * GRID + col);
});
