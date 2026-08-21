import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * A pixel skin is now stored only as its PNG — the editable cell grid it was
 * drawn from is rebuilt by decoding that PNG (see PixelSkinData.cells for
 * why the second copy was dropped). This is the test that actually protects
 * someone's artwork: paint, save, reopen, and assert every cell came back
 * identical, through the real editor and the real storage layer rather than
 * a synthetic canvas.
 */

const GRID = 32;

/** The Skin Creator's painting surface is a real DOM <canvas> overlaid on
 * the game (see PixelCanvasOverlay / domOverlay.ts), not a Phaser object —
 * it's the only 32x32 canvas on the page. */
function overlaySelector(): string {
  return "canvas";
}

async function paintCell(page: Page, cellX: number, cellY: number): Promise<void> {
  const box = await page.evaluate(
    ({ g }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === g && c.height === g);
      if (!canvas) throw new Error("pixel canvas not found");
      const r = canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    { g: GRID },
  );
  const cellW = box.width / GRID;
  const cellH = box.height / GRID;
  await page.mouse.click(box.left + (cellX + 0.5) * cellW, box.top + (cellY + 0.5) * cellH);
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

test("a painted skin survives save and reopen with every pixel intact", async ({ page }) => {
  await gotoApp(page);

  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector(overlaySelector());
  await expect.poll(() => readCells(page).then((c) => c.length)).toBe(GRID * GRID);

  // Paint a deliberately asymmetric scatter — including cells at the very
  // edges, where an off-by-one in the decode would show up first.
  const painted: [number, number][] = [
    [0, 0],
    [31, 0],
    [0, 31],
    [31, 31],
    [5, 9],
    [16, 16],
    [17, 16],
    [16, 17],
    [23, 4],
  ];
  for (const [x, y] of painted) await paintCell(page, x, y);

  const before = await readCells(page);
  const paintedCount = before.filter((c) => c !== null).length;
  expect(paintedCount).toBe(painted.length);

  await clickByText(page, "SkinEditor", "Save");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
          statusText?: { text: string };
        };
        return scene.statusText?.text ?? "";
      }),
    )
    .toContain("Saved");

  // Back out to the browse list and reopen the skin we just saved. This is
  // the path that decodes the PNG back into cells.
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "Edit");
  await page.waitForFunction(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { pixelCanvas?: unknown };
    return !!scene.pixelCanvas;
  });

  const after = await readCells(page);
  expect(after).toEqual(before);
});
