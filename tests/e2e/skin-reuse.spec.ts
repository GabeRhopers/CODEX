import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, waitForSkinCanvas } from "./support/coords";

/**
 * Reusing art you already have: copying a skin as a starting point without
 * destroying it, and tracing over an existing image.
 *
 * The load-bearing assertion here is that a tracing reference **cannot reach a
 * saved skin**. It is shown as a CSS layer under the canvas, and
 * exportPngDataUrl only serializes the canvas bitmap, so today that is true by
 * construction — which is exactly the kind of guarantee that quietly stops
 * being true the day someone changes how export works. Hence a test rather
 * than a comment.
 */

async function readCells(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getCells(): (string | null)[] };
    };
    if (!scene.pixelCanvas) throw new Error("canvas mode not active");
    return scene.pixelCanvas.getCells();
  });
}

const paintedCount = (cells: (string | null)[]): number => cells.filter((cell) => cell !== null).length;

async function paintCell(page: Page, gridSize: number, cellX: number, cellY: number): Promise<void> {
  const box = await page.evaluate(
    ({ g }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === g && c.height === g);
      if (!canvas) throw new Error(`no ${g}x${g} pixel canvas`);
      const r = canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    { g: gridSize },
  );
  await page.mouse.click(box.left + ((cellX + 0.5) * box.width) / gridSize, box.top + ((cellY + 0.5) * box.height) / gridSize);
}

async function saveSkin(page: Page): Promise<void> {
  await clickByText(page, "SkinEditor", "Save");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { statusText?: { text: string } };
        return scene.statusText?.text ?? "";
      }),
    )
    .toContain("Saved");
}

async function openSkinCreator(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
}

/** How many skins the library holds for a brush — read through the real
 * storage layer rather than by counting rows on screen. */
async function skinCount(page: Page, brushId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const mod = (await import("/src/skins/skinStorage.ts")) as { loadCustomSkins(): Promise<Record<string, { items: unknown[] }>> };
    const skins = await mod.loadCustomSkins();
    return skins[id]?.items.length ?? 0;
  }, brushId);
}

test("Copy starts a new skin from an existing one and leaves the original alone", async ({ page }) => {
  test.slow();
  await openSkinCreator(page);

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
  for (const [x, y] of [
    [4, 4],
    [5, 4],
    [6, 4],
  ]) {
    await paintCell(page, 32, x, y);
  }
  const original = await readCells(page);
  expect(paintedCount(original)).toBe(3);
  await saveSkin(page);

  await clickByText(page, "SkinEditor", "← Back");
  expect(await skinCount(page, "enemy-ghost")).toBe(1);

  // Copy, then paint something clearly different and save.
  await clickByText(page, "SkinEditor", "Copy");
  await waitForSkinCanvas(page);
  // The copy opens holding the source's pixels — that is what makes it a base.
  await expect.poll(() => readCells(page).then(paintedCount)).toBe(3);
  for (const [x, y] of [
    [20, 20],
    [21, 20],
  ]) {
    await paintCell(page, 32, x, y);
  }
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  // Two skins now, and the first still has exactly what it had.
  await expect.poll(() => skinCount(page, "enemy-ghost")).toBe(2);
  const stored = await page.evaluate(async () => {
    const mod = (await import("/src/skins/skinStorage.ts")) as {
      loadCustomSkins(): Promise<Record<string, { items: { id: string; imageData: string }[] }>>;
    };
    const skins = await mod.loadCustomSkins();
    return skins["enemy-ghost"].items.map((item) => item.imageData);
  });
  expect(stored[0]).not.toBe(stored[1]);
});

test("a tracing reference guides the drawing but never gets saved into it", async ({ page }) => {
  test.slow();
  await openSkinCreator(page);

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");

  await paintCell(page, 32, 2, 2);
  await paintCell(page, 32, 3, 2);

  // Show Grampa behind the canvas. His art is ~1000 colours and can't be
  // imported, which is exactly why tracing it is worth having.
  await clickByText(page, "SkinEditor", "Trace: None ▾");
  await clickIconWithLabel(page, "SkinEditor", "Grampa idle");

  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("div")).some((el) => el.style.backgroundImage.startsWith('url("data:image')),
      ),
    )
    .toBe(true);

  // The reference is a view layer, not content: the cells are untouched.
  expect(paintedCount(await readCells(page))).toBe(2);

  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);

  // Reopened from the saved PNG: still two cells. If the reference had been
  // baked in this would be in the hundreds.
  await expect.poll(() => readCells(page).then(paintedCount)).toBe(2);
});

test("Trace in stamps the reference as a starting point, and Undo takes it back", async ({ page }) => {
  test.slow();
  await openSkinCreator(page);

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Grampa");
  await page.waitForSelector("canvas");

  await paintCell(page, 48, 1, 1);
  const before = await readCells(page);
  expect(paintedCount(before)).toBe(1);

  await clickByText(page, "SkinEditor", "Trace: None ▾");
  await clickIconWithLabel(page, "SkinEditor", "Grampa idle");
  await clickByText(page, "SkinEditor", "Trace in");

  // A traced character fills a large part of the grid — the exact count
  // depends on the alpha cutoff, so this asserts "a lot" rather than a number
  // that would break the moment that threshold is tuned.
  await expect.poll(() => readCells(page).then(paintedCount)).toBeGreaterThan(300);

  // Tracing is an edit like any other, which is most of the point: try it,
  // decide you preferred your own, take it back.
  await clickByText(page, "SkinEditor", "↶ Undo");
  await expect.poll(() => readCells(page).then(paintedCount)).toBe(1);
});
