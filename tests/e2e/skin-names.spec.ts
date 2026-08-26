import { expect, test, type Page } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  gotoApp,
  selectPaletteCategory,
  startEditorWithLevel,
  waitForSkinCanvas,
} from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Skin names, end to end through the real Skin Creator, the real storage layer
 * and the real level editor.
 *
 * Skins were the only asset library without a name — backgrounds and music have
 * always had one and their pickers show it. So the level editor labelled every
 * skin `Skin 1`, `Skin 2`, and the browse list showed the *brush* label on every
 * row: three Ghost skins were three rows all reading "Ghost", and telling them
 * apart meant opening each one. These eight cover the ways that can still go
 * wrong, one distinct failure each.
 */

const GRID = 32;

const GHOST_LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "enemy-ghost", x: 10, y: 5 },
    ]),
  );

// --- reading real state -----------------------------------------------------

/** Every skin the library holds for a brush, read through the real storage
 * layer rather than off the screen. */
async function storedSkins(page: Page, brushId: string): Promise<{ id: string; name?: string }[]> {
  return page.evaluate(async (id) => {
    const mod = (await import("/src/skins/skinStorage.ts")) as {
      loadCustomSkins(): Promise<Record<string, { items: { id: string; name?: string }[] }>>;
    };
    const skins = await mod.loadCustomSkins();
    return (skins[id]?.items ?? []).map((item) => ({ id: item.id, name: item.name }));
  }, brushId);
}

/** The names as the browse list actually renders them — the primary 15px white
 * text at each row's x=90. Read separately from storage on purpose: a name that
 * saves correctly but displays as the brush label would pass a storage-only
 * assertion and still be the bug this feature exists to fix. */
async function browseRowNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    return scene.children.list
      .filter((child) => {
        const t = child as { x?: number; text?: string; style?: { fontSize?: string } };
        return t.x === 90 && typeof t.text === "string" && t.style?.fontSize === "15px";
      })
      .map((child) => (child as unknown as { text: string }).text);
  });
}

async function nameField(page: Page) {
  return page.getByPlaceholder("Skin name");
}

async function skinCanvasCells(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getCells(): (string | null)[] };
    };
    return scene.pixelCanvas!.getCells();
  });
}

const paintedCount = (cells: (string | null)[]): number => cells.filter((c) => c !== null).length;

// --- driving the editor -----------------------------------------------------

async function paintCell(page: Page, x: number, y: number): Promise<void> {
  const box = await page.evaluate((g) => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === g && c.height === g)!;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, GRID);
  await page.mouse.click(box.left + ((x + 0.5) * box.width) / GRID, box.top + ((y + 0.5) * box.height) / GRID);
}

async function openSkinCreator(page: Page): Promise<void> {
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
}

async function newGhostSkin(page: Page): Promise<void> {
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");
}

async function setName(page: Page, name: string): Promise<void> {
  const field = await nameField(page);
  await field.fill(name);
  await field.press("Enter"); // commits, same as blurring
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

/** Paint, name, save — the ordinary create flow, used by most tests below. */
async function paintAndSave(page: Page, name: string, cells: [number, number][]): Promise<void> {
  await newGhostSkin(page);
  for (const [x, y] of cells) await paintCell(page, x, y);
  await setName(page, name);
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");
}

// --- 1. create --------------------------------------------------------------

test("a named skin is saved under that name and the browse list shows it", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  await paintAndSave(page, "Spooky pillow", [
    [8, 8],
    [9, 8],
  ]);

  await expect.poll(() => browseRowNames(page)).toEqual(["Spooky pillow"]);
  expect((await storedSkins(page, "enemy-ghost")).map((s) => s.name)).toEqual(["Spooky pillow"]);
});

// --- 2. round trip ----------------------------------------------------------

test("reopening a skin brings back its name and every pixel together", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  const painted: [number, number][] = [
    [0, 0],
    [31, 0],
    [0, 31],
    [31, 31],
    [16, 16],
  ];
  await paintAndSave(page, "Corners", painted);

  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);

  // The name is in the field, not merely in storage — reopening to a blank or
  // defaulted field would lose it on the next save.
  await expect(await nameField(page)).toHaveValue("Corners");
  await expect.poll(() => skinCanvasCells(page).then(paintedCount)).toBe(painted.length);
});

// --- 3. rename --------------------------------------------------------------

test("renaming updates the one skin in place rather than forking a second", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  await paintAndSave(page, "First try", [
    [4, 4],
    [5, 4],
    [6, 4],
  ]);
  const [before] = await storedSkins(page, "enemy-ghost");

  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);
  await setName(page, "Second thoughts");
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  await expect.poll(() => browseRowNames(page)).toEqual(["Second thoughts"]);
  const after = await storedSkins(page, "enemy-ghost");
  // Same id, same count: a rename that quietly saved a copy would leave two
  // rows here and is the likeliest way this breaks.
  expect(after).toHaveLength(1);
  expect(after[0].id).toBe(before.id);

  // ...and the pixels came through the rename untouched.
  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);
  await expect.poll(() => skinCanvasCells(page).then(paintedCount)).toBe(3);
});

// --- 4. blank name ----------------------------------------------------------

test("a blank name falls back to a default instead of saving an empty label", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  await newGhostSkin(page);
  await paintCell(page, 10, 10);

  // Whitespace only — the same case LevelNameInput turns into "Untitled Level".
  await setName(page, "   ");
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  const names = await browseRowNames(page);
  expect(names).toHaveLength(1);
  expect(names[0].trim()).not.toBe("");
  expect(names[0]).toBe("Ghost 1");
});

// --- 5. two skins for one brush --------------------------------------------

test("two skins for the same brush get distinct default names", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);

  // Accept the offered default both times — this is the case that used to
  // produce two rows reading "Ghost", which is the whole reason names exist.
  await newGhostSkin(page);
  await paintCell(page, 6, 6);
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  await newGhostSkin(page);
  await expect(await nameField(page)).toHaveValue("Ghost 2");
  await paintCell(page, 20, 20);
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  await expect.poll(() => browseRowNames(page)).toEqual(["Ghost 1", "Ghost 2"]);
});

// --- 6. copy ----------------------------------------------------------------

test("Copy gets its own name and leaves the original's name and pixels alone", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  await paintAndSave(page, "Original", [
    [3, 3],
    [4, 3],
  ]);

  await clickByText(page, "SkinEditor", "Copy");
  await waitForSkinCanvas(page);
  await expect(await nameField(page)).toHaveValue("Original copy");
  await paintCell(page, 25, 25);
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  await expect.poll(() => browseRowNames(page)).toEqual(["Original", "Original copy"]);
  const stored = await storedSkins(page, "enemy-ghost");
  expect(stored).toHaveLength(2);
  expect(stored[0].id).not.toBe(stored[1].id);
});

// --- 7. the payoff: choosing by name in a level -----------------------------

test("the level editor lists skins by name, and picking one applies that skin", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await openSkinCreator(page);
  await paintAndSave(page, "Blue ghost", [[5, 5]]);
  await paintAndSave(page, "Red ghost", [[25, 25]]);
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  const stored = await storedSkins(page, "enemy-ghost");
  const red = stored.find((s) => s.name === "Red ghost")!;

  await startEditorWithLevel(page, GHOST_LEVEL());
  await selectPaletteCategory(page, "Editor", "Enemies");
  await clickIconWithLabel(page, "Editor", "Ghost");
  await clickByText(page, "Editor", "Skin: Built-in ▾");

  // Picked by name — the label used to be "Skin 2", which said nothing about
  // which of the two it was.
  await clickIconWithLabel(page, "Editor", "Red ghost");

  // The applied texture key carries the skin's id, so this says *which* skin
  // landed, not merely that some skin did.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
          skinTextureKeys?: Map<string, string>;
        };
        return scene.skinTextureKeys?.get("enemy-ghost") ?? "";
      }),
    )
    .toContain(red.id);
});

// --- 8. back-compat ---------------------------------------------------------

test("a skin saved before names existed still opens, showing its brush label", async ({ page }) => {
  test.slow();
  await gotoApp(page);

  // Seeded through the real storage function with the name argument omitted —
  // which is exactly what every save did before 2026-08-26.
  await page.evaluate(async () => {
    const cells = (await import("/src/skins/pixelSkinCells.ts")) as {
      cellsToPngDataUrl(cells: (string | null)[], gridSize: number): string;
    };
    const storage = (await import("/src/skins/skinStorage.ts")) as {
      savePixelSkin(
        brushId: string,
        existingId: string | undefined,
        imageData: string,
        pixelData: { paletteId: string },
        uploadedBy: string,
        frames?: Record<string, string>,
      ): Promise<string>;
    };
    const grid: (string | null)[] = new Array(32 * 32).fill(null);
    grid[12 * 32 + 12] = "#FF004D";
    const png = cells.cellsToPngDataUrl(grid, 32);
    await storage.savePixelSkin("enemy-ghost", undefined, png, { paletteId: "pico8" }, "tester", { "0": png });
  });

  await openSkinCreator(page);
  // No name stored, so the row falls back to the brush label — exactly what it
  // showed before names existed, which is what makes this migration-free.
  await expect.poll(() => browseRowNames(page)).toEqual(["Ghost"]);
  expect((await storedSkins(page, "enemy-ghost"))[0].name).toBeUndefined();

  // Opening it offers that fallback in the field, and saving makes it a real
  // stored name — the skin migrates itself the first time it is touched.
  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);
  await expect(await nameField(page)).toHaveValue("Ghost");
  await setName(page, "Now it has a name");
  await saveSkin(page);
  await clickByText(page, "SkinEditor", "← Back");

  await expect.poll(() => browseRowNames(page)).toEqual(["Now it has a name"]);
  expect((await storedSkins(page, "enemy-ghost"))[0].name).toBe("Now it has a name");
});
