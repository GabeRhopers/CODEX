import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, openThings } from "./support/coords";

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

/** The three shade swatches, wherever they are. Read off the display list by
 * name so the test follows the layout rather than pinning coordinates — the
 * prose here used to say "left of the palette row", which stopped being true
 * twice over: the row moved in 2026-09-05 and stopped being a row at all in
 * 2026-09-20. The name is the only part that has survived both. */
async function shadeSwatches(page: Page): Promise<{ x: number; y: number; visible: boolean; color: number }[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    const out: { x: number; y: number; visible: boolean; color: number }[] = [];
    for (const child of scene.children.list) {
      const o = child as unknown as {
        name?: string;
        x?: number;
        y?: number;
        visible?: boolean;
        fillColor?: number;
      };
      // By name, not by geometry. This used to select "24px swatches left of the
      // centred palette row", which was true only of one particular layout: the
      // 2026-09-05 rework put the ramp and the colour grid in the same column,
      // and the filter silently started matching all eighteen palette swatches
      // too. The scene tags these (SHADE_STEP_NAME) so the question being asked
      // here is about the objects rather than about where they happen to sit.
      if (o.name === "shade-step") {
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
  await openThings(page);
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
}

/** Every Text on the scene, however deeply nested — the dropdown puts its rows
 * in a container, so a flat pass over `children.list` cannot see them. */
async function sceneTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type O = { type?: string; text?: string; list?: O[] };
    const out: string[] = [];
    const walk = (l: O[]): void => {
      for (const c of l) {
        if (c.type === "Text" && c.text) out.push(c.text);
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return out;
  });
}

test("Game Boy is gone and Yours takes its place", async ({ page }) => {
  test.slow();
  await openGhostCanvas(page);

  // The palettes on offer live behind the chip since 2026-09-20, so the
  // question this test asks — which palettes can I choose? — is now asked by
  // opening the menu. It used to read the flat display list, which happened to
  // work only while all five were permanently on screen.
  //
  // Asserting the closed state first, because "the chip names the one in use"
  // is half of what replaced that list and would otherwise go unchecked.
  expect(await sceneTexts(page), "the chip should name the palette in use").toContain("Palette: PICO-8 ▾");

  await clickByText(page, "SkinEditor", "Palette: PICO-8 ▾");
  const offered = await sceneTexts(page);
  expect(offered).not.toContain("Game Boy");
  expect(offered).toContain("Yours");
  expect(offered).toContain("PICO-8");
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
  //
  // "Frame 2 ·", not "1 ·": a loop's frames are stored as "0".."3" and were
  // shown that way until 2026-09-12, which on a screen aimed at a child said
  // nothing. The stored names are unchanged — renaming them would orphan the art
  // in every saved skin — so this is the second frame under its new label.
  // **Polled on the frame, not on the colour.** Polling for the colour would be
  // vacuous: it is already `picked` before the switch, so the very first sample
  // passes whether the rebuild has happened or not — the assertion would hold
  // with the feature removed. The active frame changing is the rebuild actually
  // having occurred, so that is what is waited for, and the colour is read
  // after it.
  await clickByText(page, "SkinEditor", "Frame 2 ·");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
            target?: { activeFrame?: string };
          };
          return scene.target?.activeFrame ?? "";
        }),
      { timeout: 15_000 },
    )
    .toBe("1");
  expect(await currentColor(page), "the sampled colour should survive a rebuild").toBe(picked);
});

test("switching palette keeps the strokes you have already made", async ({ page }) => {
  test.slow();
  // **The one behaviour the 2026-09-20 dropdown could have dropped in silence.**
  // Switching palette rebuilds canvas mode, and a rebuild reloads the frame's
  // *original* cells — so unless the live drawing is folded back in first
  // (`captureActiveFrame`), changing palette halfway through throws away every
  // stroke since the last frame change. The old row handler did that; the
  // dropdown's onSelect has to as well, and nothing was watching.
  await openGhostCanvas(page);

  const painted = (): Promise<number> =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
        pixelCanvas?: { getCells(): (string | null)[] };
      };
      return (scene.pixelCanvas?.getCells() ?? []).filter((c) => c !== null).length;
    });

  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll("canvas")].find((c) => c.width === 32 && c.height === 32);
    const r = el!.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cell = box.width / 32;
  for (const [x, y] of [
    [8, 8],
    [9, 8],
    [8, 9],
  ]) {
    await page.mouse.click(box.left + (x + 0.5) * cell, box.top + (y + 0.5) * cell);
  }
  expect(await painted(), "three cells should be painted before the switch").toBe(3);

  await clickByText(page, "SkinEditor", "Palette: PICO-8 ▾");
  await clickByText(page, "SkinEditor", "Sweetie 16");

  // The chip changing *is* the signal that the switch landed, so it is polled
  // for rather than waited out — and the stroke count is then read at that
  // moment, which is the earliest the rebuild can have thrown them away.
  await expect
    .poll(() => sceneTexts(page), { timeout: 15_000 })
    .toContain("Palette: Sweetie 16 ▾");
  expect(await painted(), "the drawing should survive a palette switch").toBe(3);
});
