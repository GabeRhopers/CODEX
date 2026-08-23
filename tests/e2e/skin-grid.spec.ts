import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * The Grid overlay has to be visible against the art you are drawing, which is
 * not the same claim as "the grid element is displayed" — and it is the claim
 * that quietly stopped being true. The lines were a fixed
 * `rgba(255,255,255,0.18)`, which measured 1.3/255 against near-white art:
 * present in the DOM, invisible on screen, and invisible precisely where cell
 * boundaries matter most, because light art gives you nothing else to count by.
 *
 * So this measures the rendered pixels rather than the stylesheet. It fills the
 * whole canvas with one colour through the real swatch and Fill buttons,
 * screenshots it, and compares each grid-line column against its neighbours.
 * Both extremes are checked: a white line fails on white art, a black one fails
 * on black art (measured 0.0), and only a blend that inverts its backdrop
 * survives both.
 */

/** Comfortably above what any fixed-colour line manages on its own worst
 * background (2.7 for white-on-white at double strength, 0.0 for black-on-black)
 * and comfortably below what the shipped blend measures (89 and 97), so this
 * fails on a regression rather than on a tweak. */
const MIN_CONTRAST = 25;

/** Clicks the swatch of a given palette colour by asking the live scene where
 * its rectangle is, rather than recomputing the swatch row's layout here — same
 * reason coords.ts reads real positions instead of mirroring EditorUI's math. */
async function clickSwatch(page: Page, hex: string): Promise<void> {
  const point = await page.evaluate((hex) => {
    const game = window.__debugGame!;
    const scene = game.scene.getScene("SkinEditor");
    const want = parseInt(hex.replace("#", ""), 16);
    const swatch = scene.children.list.find(
      (child) => (child as { fillColor?: number; width?: number }).fillColor === want && (child as { width?: number }).width === 24,
    ) as unknown as { x: number; y: number } | undefined;
    if (!swatch) throw new Error(`no swatch for ${hex}`);
    const rect = game.canvas.getBoundingClientRect();
    const scale = game.scale.displayScale;
    // Swatches are drawn with origin (0,0), so nudge to the middle of the 24px box.
    return { x: rect.left + (swatch.x + 12) / scale.x, y: rect.top + (swatch.y + 12) / scale.y };
  }, hex);
  await page.mouse.click(point.x, point.y);
}

/** Mean |line - neighbour| luminance across every grid-line column, out of 255.
 * Playwright hands back a PNG and Node has no decoder, so the page decodes its
 * own screenshot through an offscreen canvas — no new dependency for one
 * measurement. */
async function gridContrast(page: Page): Promise<number> {
  const box = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === 32)!;
    const r = canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const png = (await page.screenshot({ clip: box })).toString("base64");

  return page.evaluate(async (png) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = `data:image/png;base64,${png}`;
    });
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    scratch.getContext("2d")!.drawImage(image, 0, 0);
    const { data, width, height } = scratch.getContext("2d")!.getImageData(0, 0, image.width, image.height);
    const lum = (x: number, y: number): number => {
      const i = (y * width + x) * 4;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };

    const cell = width / 32;
    const deltas: number[] = [];
    for (let k = 1; k < 32; k++) {
      const x = Math.round(k * cell);
      if (x + 8 >= width) continue;
      for (let y = 4; y < height - 4; y++) {
        let neighbour = 0;
        for (let n = 4; n < 8; n++) neighbour += lum(x + n, y);
        deltas.push(Math.abs(lum(x, y) - neighbour / 4));
      }
    }
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }, png);
}

async function floodWith(page: Page, hex: string): Promise<void> {
  await clickSwatch(page, hex);
  await clickByText(page, "SkinEditor", "Fill");
  const box = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === 32)!;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await expect.poll(() =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
        pixelCanvas?: { getCells(): (string | null)[] };
      };
      return scene.pixelCanvas!.getCells().filter((c) => c !== null).length;
    }),
  ).toBe(32 * 32);
}

test("the grid stays visible against both the lightest and the darkest art", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
  await clickByText(page, "SkinEditor", "Fit");
  await clickByText(page, "SkinEditor", "Grid: Off"); // -> On

  // PICO-8's near-white. A white line scored 1.3 here; that is the regression.
  await floodWith(page, "#FFF1E8");
  expect(await gridContrast(page)).toBeGreaterThan(MIN_CONTRAST);

  // PICO-8's black — where a dark line, the obvious "just darken it" fix,
  // measures exactly 0.0.
  await floodWith(page, "#000000");
  expect(await gridContrast(page)).toBeGreaterThan(MIN_CONTRAST);

  // And with the grid off there should be essentially nothing to find, which is
  // what says the measurement is reading the grid and not some artifact of the
  // art or the checkerboard.
  await clickByText(page, "SkinEditor", "Grid: On"); // -> Off
  expect(await gridContrast(page)).toBeLessThan(2);
});
