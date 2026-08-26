import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp } from "./support/coords";

/**
 * The palette row: the shade ramp, and "Yours".
 *
 * The bug underneath both is that an off-palette colour used to be discarded.
 * The swatch row reset `currentColor` to `palette.colors[0]` whenever the
 * selection wasn't one of its own, and canvas mode is rebuilt on every frame
 * and palette switch — so a colour sampled off a traced reference vanished the
 * moment you stepped to the next frame. The shade ramp makes off-palette
 * colours easy to produce, which is what made that worth fixing rather than
 * documenting.
 */

const currentColor = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { currentColor: string | null };
    return scene.currentColor;
  });

const storedCustomColors = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const raw = localStorage.getItem("rhopers:custom-palette");
    return raw ? (JSON.parse(raw) as string[]) : [];
  });

/** The three shade swatches, left of the palette row. Read off the display
 * list so the test follows the layout rather than pinning coordinates. */
async function shadeSwatches(page: Page): Promise<{ x: number; y: number; visible: boolean; color: number }[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    const out: { x: number; y: number; visible: boolean; color: number }[] = [];
    for (const child of scene.children.list) {
      const o = child as unknown as {
        type?: string;
        width?: number;
        height?: number;
        x?: number;
        y?: number;
        visible?: boolean;
        fillColor?: number;
      };
      // 24px swatches left of the centred palette row are the ramp; the palette
      // row's own swatches are the same size but start further right.
      if (o.type === "Rectangle" && o.width === 24 && o.height === 24 && o.x! < 250) {
        out.push({ x: o.x!, y: o.y!, visible: o.visible!, color: o.fillColor! });
      }
    }
    return out.sort((a, b) => a.x - b.x);
  });
}

async function clickScene(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
  await page.mouse.click(p.x, p.y);
}

async function openGhostCanvas(page: Page): Promise<void> {
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
}

test("Game Boy is gone and Yours takes its place", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  const tabs = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    return scene.children.list
      .map((c) => (c as unknown as { type?: string; text?: string }))
      .filter((o) => o.type === "Text")
      .map((o) => o.text ?? "");
  });
  expect(tabs).not.toContain("Game Boy");
  expect(tabs).toContain("Yours");
  expect(tabs).toContain("PICO-8");
});

test("the shade ramp offers a lighter and darker neighbour, and hides a step that would do nothing", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  // PICO-8 opens on #000000, which cannot go darker — so that swatch is hidden
  // rather than shown as a duplicate that ignores clicks.
  const atBlack = await shadeSwatches(page);
  expect(atBlack).toHaveLength(3);
  expect(atBlack[0].visible, "black has no darker step, so it should be hidden").toBe(false);
  expect(atBlack[1].visible).toBe(true);
  expect(atBlack[2].visible).toBe(true);

  // A mid-tone has both neighbours, and they differ from each other.
  const green = "#008751";
  await page.evaluate((c) => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      currentColor: string | null;
      refreshShadeRamp?: () => void;
      pixelCanvas?: { setCurrentColor(c: string): void };
    };
    scene.currentColor = c;
    scene.pixelCanvas?.setCurrentColor(c);
    scene.refreshShadeRamp?.();
  }, green);

  const atGreen = await shadeSwatches(page);
  expect(atGreen.every((s) => s.visible)).toBe(true);
  expect(atGreen[0].color).not.toBe(atGreen[1].color);
  expect(atGreen[2].color).not.toBe(atGreen[1].color);
  expect(atGreen[0].color, "darker should be darker than lighter").toBeLessThan(atGreen[2].color);
});

test("a shade you pick becomes the current colour and is kept in Yours", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  expect(await storedCustomColors(page)).toEqual([]);

  const before = await currentColor(page);
  const swatches = await shadeSwatches(page);
  const lighter = swatches[2]; // black's only available step
  await clickScene(page, lighter.x + 12, lighter.y + 12);

  const after = await currentColor(page);
  expect(after).not.toBe(before);

  // The point of the whole feature: a colour no preset palette contains now has
  // somewhere to live, instead of being replaced by palette.colors[0].
  expect(await storedCustomColors(page)).toContain(after);
});

test("an off-palette colour survives a frame switch instead of being discarded", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  const swatches = await shadeSwatches(page);
  await clickScene(page, swatches[2].x + 12, swatches[2].y + 12);
  const picked = await currentColor(page);
  expect(picked).not.toBeNull();

  // Switching frames rebuilds canvas mode from scratch — which is exactly where
  // the colour used to be silently reset to palette.colors[0].
  await clickByText(page, "SkinEditor", "1 ·");
  await page.waitForTimeout(200);
  expect(await currentColor(page), "the sampled colour should survive a rebuild").toBe(picked);
});
