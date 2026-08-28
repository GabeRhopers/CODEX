import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { failDriveWrites } from "./support/mockDrive";
import { pngBuffer } from "./support/images";
import type { LevelData } from "../../src/level/LevelSchema";

/**
 * Uploading a background.
 *
 * Three modules and a whole rework that nothing has ever run:
 * `customBackgroundUpload.ts` downscales to 1600px and re-encodes as JPEG
 * because the image used to live inline in the level's own saved JSON;
 * `backgroundLibraryStorage.ts` was the 2026-08-16 fix for exactly that, making
 * uploads a **shared library** with levels storing a small id reference; and
 * `backgroundLoader.ts` falls back to the built-in default when that id no
 * longer resolves. All documented, none tested.
 *
 * The picker's file input is unambiguous here, which is worth knowing before
 * reaching for `.nth()`: AssetPickerMenu creates its FileInputOverlay only while
 * a dropdown is rendered and destroys it on close, and FileInputOverlay.destroy
 * calls `input.remove()` — so exactly one `<input type=file>` exists at a time,
 * the one belonging to whichever picker is open.
 */

const UPLOAD_NAME = "sunset.png";
/** Comfortably over MAX_DIMENSION (1600) on the long side, and not square, so
 * the downscale has to preserve the aspect ratio rather than just clamp both. */
const SOURCE_WIDTH = 2400;
const SOURCE_HEIGHT = 1200;

const plainLevel = (name: string): LevelData => ({
  ...makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  ),
  name,
});

/** The level the editor currently has open, as data. */
async function editorLevel(page: Page): Promise<LevelData> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as { level: LevelData };
    return JSON.parse(JSON.stringify(scene.level)) as LevelData;
  });
}

/** The background trigger's own label — the only place the current background
 * is named. */
async function backgroundLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    const label = scene.children.list.find((c) => {
      const text = (c as { text?: string }).text;
      return typeof text === "string" && text.startsWith("BG: ");
    }) as { text?: string } | undefined;
    return label?.text ?? "";
  });
}

/** Which texture the level's background image is actually rendering. */
async function backgroundTextureKey(page: Page, sceneKey: string): Promise<string> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key) as unknown as {
      background?: { image?: { texture?: { key?: string } } };
    };
    return scene.background?.image?.texture?.key ?? "";
  }, sceneKey);
}

/** Everything currently in the shared library, read through the real storage. */
async function libraryEntries(page: Page): Promise<{ id: string; name: string; imageData: string }[]> {
  return page.evaluate(async () => {
    const mod = (await import("/src/backgrounds/backgroundLibraryStorage.ts")) as {
      loadBackgroundLibrary(): Promise<{ id: string; name: string; imageData: string }[]>;
    };
    return mod.loadBackgroundLibrary();
  });
}

/** Opens the BG picker and drops a generated PNG on its Upload tile. */
async function uploadBackground(page: Page, name = UPLOAD_NAME): Promise<void> {
  await clickByText(page, "Editor", await backgroundLabel(page));
  // Exactly one file input exists once a picker is open — see the file's
  // docstring. `setInputFiles` drives it directly: it is opacity-0 but present
  // and enabled, and the overlay listens for `change`, so no file chooser is
  // involved.
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: pngBuffer(SOURCE_WIDTH, SOURCE_HEIGHT),
  });
}

test("an upload applies to the level and is stored by reference, not by copy", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("BG Upload"));
  expect(await backgroundLabel(page)).toBe("BG: Meadow ▾");

  await uploadBackground(page);
  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);

  const level = await editorLevel(page);
  expect(level.background).toBe("custom");
  expect(level.customBackgroundId).toBeTruthy();
  // The whole point of the 2026-08-16 rework: the level carries a small id, not
  // the pixels. Before it, an upload was embedded per level and invisible to
  // every other one.
  expect(level.customBackgroundData).toBeUndefined();
});

test("the uploaded image is downscaled and re-encoded, not stored as-is", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("BG Downscale"));
  await uploadBackground(page);
  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);

  const [entry] = await libraryEntries(page);
  expect(entry.name).toBe(UPLOAD_NAME);
  // JPEG, not the PNG that went in — customBackgroundUpload re-encodes because
  // this data is stored, not a build asset.
  expect(entry.imageData.startsWith("data:image/jpeg")).toBe(true);

  const size = await page.evaluate(
    (dataUrl) =>
      new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => reject(new Error("stored background did not decode"));
        img.src = dataUrl;
      }),
    entry.imageData,
  );
  // MAX_DIMENSION is 1600 on the longest side, aspect ratio preserved.
  expect(size).toEqual({ width: 1600, height: 800 });
});

test("the upload joins a shared library a second level can pick from", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("First Level"));
  await uploadBackground(page);
  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);
  const uploadedId = (await editorLevel(page)).customBackgroundId;

  // A different level entirely — no second upload.
  await startEditorWithLevel(page, plainLevel("Second Level"));
  expect(await backgroundLabel(page)).toBe("BG: Meadow ▾");

  await clickByText(page, "Editor", "BG: Meadow ▾");
  await clickIconWithLabel(page, "Editor", UPLOAD_NAME);

  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);
  expect((await editorLevel(page)).customBackgroundId).toBe(uploadedId);
});

test("an uploaded background survives saving and reopening the level", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Saved BG"));
  await uploadBackground(page);
  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);
  const uploadedId = (await editorLevel(page)).customBackgroundId;

  await clickByText(page, "Editor", "Save");
  await clickByText(page, "Editor", "Menu");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await clickByText(page, "LevelBrowser", "Edit");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));

  // Reopened from storage: the id round-tripped, and it resolves back to a real
  // custom texture rather than quietly falling back to a built-in.
  await expect.poll(() => editorLevel(page).then((l) => l.customBackgroundId)).toBe(uploadedId);
  await expect.poll(() => backgroundTextureKey(page, "Editor")).toBe("bg-static-custom");
});

test("a level whose background was deleted from the library still opens, on the default", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Orphaned BG"));
  await uploadBackground(page);
  await expect.poll(() => backgroundLabel(page)).toBe(`BG: ${UPLOAD_NAME} ▾`);
  await clickByText(page, "Editor", "Save");

  // Remove it from the shared library — backgroundLoader documents that a level
  // still pointing at it falls back to the built-in default, and nothing has
  // ever run that path.
  const [entry] = await libraryEntries(page);
  await page.evaluate(async (id: string) => {
    const mod = (await import("/src/backgrounds/backgroundLibraryStorage.ts")) as {
      removeBackgroundAsset(id: string): Promise<void>;
    };
    await mod.removeBackgroundAsset(id);
  }, entry.id);
  await expect.poll(() => libraryEntries(page).then((l) => l.length)).toBe(0);

  await clickByText(page, "Editor", "Menu");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await clickByText(page, "LevelBrowser", "Edit");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));

  // Still opens, still has its content, and shows Meadow rather than nothing.
  await expect.poll(() => backgroundTextureKey(page, "Editor")).toBe("bg-static-meadow");
  expect((await editorLevel(page)).entities.length).toBeGreaterThan(0);
});

test("an upload that cannot be stored says so and changes nothing", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Failed BG"));
  await failDriveWrites(page);

  await uploadBackground(page);

  // Asserting on "Couldn't" rather than the full message on purpose: the editor
  // currently reports "Couldn't load that image" for a *storage* failure, since
  // the read and the save share one rejection handler. The image loaded fine.
  // Pinning the substring keeps that wording free to improve.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("Editor") as unknown as { ui: { statusText: { text: string } } };
        return scene.ui.statusText.text;
      }),
    )
    .toContain("Couldn't");

  const level = await editorLevel(page);
  expect(level.customBackgroundId).toBeUndefined();
  expect(level.background).not.toBe("custom");
  expect(await backgroundLabel(page)).toBe("BG: Meadow ▾");
});
