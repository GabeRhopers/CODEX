import { expect, test } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  clickScenePoint,
  gotoApp,
  readSceneField,
  selectPaletteCategory,
  tileCenter,
} from "./support/coords";

/**
 * The regression floor (Priority Matrix, "01 · TEST NEXT" action card,
 * item 5): a plain level with no Sub/Up areas, no enemies, no items —
 * paint → place → Test Play → win, driven entirely through real clicks
 * and keyboard input, the same as a first-time visitor would. Every other
 * spec in this suite builds its level programmatically and focuses on one
 * specific mechanic; this one is the baseline everything else assumes
 * still works.
 */
test("paints a level, places Spawn/Goal, and wins Test Play", async ({ page }) => {
  await gotoApp(page);
  await clickByText(page, "Menu", "New Level");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));

  await clickIconWithLabel(page, "Editor", "Grass");
  const groundRow = 9;
  for (let x = 0; x <= 8; x++) {
    const { x: px, y: py } = tileCenter(x, groundRow);
    await clickScenePoint(page, px, py);
  }

  await selectPaletteCategory(page, "Editor", "Markers");
  await clickIconWithLabel(page, "Editor", "Spawn");
  const spawnTile = tileCenter(1, groundRow - 1);
  await clickScenePoint(page, spawnTile.x, spawnTile.y);

  await clickIconWithLabel(page, "Editor", "Goal");
  const goalTile = tileCenter(7, groundRow - 1);
  await clickScenePoint(page, goalTile.x, goalTile.y);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => readSceneField<string>(page, "Play", "outcome"), { timeout: 5000, intervals: [100] })
    .toBe("won");
  await page.keyboard.up("ArrowRight");
});
