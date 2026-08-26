import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * The multi-frame skin editor, end to end through the real editor, the real
 * storage layer and the real PlayScene: paint two poses for the player
 * character, save, play a level, and assert the character is actually wearing
 * them and animating between them.
 *
 * The hitbox assertion here is the one that matters most. A painted character
 * replaces Grampa's art entirely, and the 2026-08-19 gravity retune verified
 * every bundled template against a fixed 22x40 body (Desert Canyon's pillar
 * down to about a tile of margin). If a custom skin could change the body,
 * someone painting a character could silently make shipped levels
 * uncompletable. It cannot, and this is what says so.
 */

const CHARACTER_GRID = 48;

async function paintCell(page: Page, gridSize: number, cellX: number, cellY: number): Promise<void> {
  const box = await page.evaluate(
    ({ g }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === g && c.height === g);
      if (!canvas) throw new Error(`no ${g}x${g} pixel canvas on the page`);
      const r = canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    { g: gridSize },
  );
  await page.mouse.click(box.left + ((cellX + 0.5) * box.width) / gridSize, box.top + ((cellY + 0.5) * box.height) / gridSize);
}

/** The texture the player sprite is currently drawn with. */
async function playerTexture(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { texture: { key: string } } };
    return scene.player?.texture.key ?? "";
  });
}

const status = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { statusText?: { text: string } };
    return scene.statusText?.text ?? "";
  });

async function saveSkin(page: Page): Promise<void> {
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => status(page)).toContain("Saved");
}

/**
 * Saving a skin deliberately changes nothing anyone can see (2026-08-23) — it
 * joins the library and waits to be chosen. These tests are about what the
 * *runtime* does with a skin, so they make that choice the blunt way: become
 * the default for every level. Two taps, because it reaches every level.
 */
async function makeDefault(page: Page): Promise<void> {
  await clickByText(page, "SkinEditor", "Set as default");
  await clickByText(page, "SkinEditor", "For every level?");
  await expect.poll(() => status(page)).toContain("default set");
}

test("a painted character skin replaces Grampa, animates, and cannot change his hitbox", async ({ page }) => {
  test.slow(); // paints across two 48x48 frames, saves through mocked Drive, then plays a level

  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Grampa");
  await page.waitForSelector("canvas");

  // The character paints at 48, not the 32 every other skin uses, so it lines
  // up with Grampa's own render height instead of being scaled up chunky.
  await expect
    .poll(() =>
      page.evaluate(() => Array.from(document.querySelectorAll("canvas")).some((c) => c.width === 48 && c.height === 48)),
    )
    .toBe(true);

  // idle: a shape in the top-left quadrant.
  for (const [x, y] of [
    [4, 4],
    [5, 4],
    [4, 5],
  ]) {
    await paintCell(page, CHARACTER_GRID, x, y);
  }

  // walk1: a deliberately different shape, bottom-right, so the two frames
  // cannot be confused for each other by accident.
  await clickByText(page, "SkinEditor", "walk1 ·");
  await page.waitForTimeout(300);
  for (const [x, y] of [
    [40, 40],
    [41, 40],
    [40, 41],
  ]) {
    await paintCell(page, CHARACTER_GRID, x, y);
  }

  await saveSkin(page);
  await makeDefault(page);

  // walk2 was never painted, so it falls back to this skin's own idle — never
  // to Grampa's art, which would look like a bug mid-stride.
  // Two backs: canvas mode returns to the browse list, and the browse list
  // returns to the Menu.
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  const level = makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
    ]),
  );
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // Standing still: the painted idle frame, not a wizard-* texture.
  await expect.poll(() => playerTexture(page), { timeout: 15_000 }).toContain("skin-frame-player-");

  // The whole point of the fixed body: whatever anyone paints, the physics
  // Grampa was tuned around is untouched.
  const body = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      player?: { body?: { width: number; height: number } };
    };
    return { width: scene.player?.body?.width, height: scene.player?.body?.height };
  });
  expect(body).toEqual({ width: 22, height: 40 });

  // Walking cycles walk1 and walk2; walk2 resolves to the idle texture, so two
  // distinct keys should both appear while moving.
  await page.keyboard.down("ArrowRight");
  const seen = new Set<string>();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && seen.size < 2) seen.add(await playerTexture(page));
  await page.keyboard.up("ArrowRight");

  expect(seen.size).toBeGreaterThanOrEqual(2);
  for (const key of seen) expect(key).toContain("skin-frame-player-");
});

test("a painted enemy skin loops through its frames", async ({ page }) => {
  test.slow();

  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));

  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");

  // Enemies keep the ordinary 32 grid — only the character moved to 48.
  await expect
    .poll(() =>
      page.evaluate(() => Array.from(document.querySelectorAll("canvas")).some((c) => c.width === 32 && c.height === 32)),
    )
    .toBe(true);

  for (const [x, y] of [
    [4, 4],
    [5, 4],
  ]) {
    await paintCell(page, 32, x, y);
  }

  await clickByText(page, "SkinEditor", "1 ·");
  await page.waitForTimeout(300);
  for (const [x, y] of [
    [26, 26],
    [27, 26],
  ]) {
    await paintCell(page, 32, x, y);
  }

  await saveSkin(page);
  await makeDefault(page);
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  const level = makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "enemy-ghost", x: 10, y: 5 },
    ]),
  );
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  const ghostTexture = (): Promise<string> =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
        spritesByBrushId?: Map<string, { texture: { key: string } }[]>;
      };
      return scene.spritesByBrushId?.get("enemy-ghost")?.[0]?.texture.key ?? "";
    });

  // Both painted frames should show up within a couple of loop cycles. A skin
  // that resolved but never advanced would stick on one key and fail here.
  await expect.poll(ghostTexture, { timeout: 15_000 }).toContain("skin-frame-enemy-ghost-");
  const seen = new Set<string>();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && seen.size < 2) seen.add(await ghostTexture());
  expect(seen.size).toBeGreaterThanOrEqual(2);
});
