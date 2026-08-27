import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, clickScenePoint, gotoApp, startEditorWithLevel, tileCenter } from "./support/coords";
import { makeLevel } from "./support/levels";
import {
  EDGE_BOTTOM,
  EDGE_GID_BASE,
  EDGE_LEFT,
  EDGE_NONE,
  EDGE_RIGHT,
  GROUND_EDGE_TEXTURE_KEY,
} from "../../src/level/groundEdges";
import type { LevelData } from "../../src/level/LevelSchema";

/**
 * Ground masses have an outlined silhouette.
 *
 * The source art has no border on its sides or underside — prepare-kenney-
 * assets.py strips it so adjacent tiles merge — so a platform used to end in
 * nothing. The overlay layer draws a band on each *exposed* side, which makes
 * corners fall out of the geometry instead of needing a 16- or 47-tile autotile
 * set (see src/level/groundEdges.ts).
 *
 * The masks themselves are covered exhaustively by groundEdges.test.ts. What
 * only a real browser can show is the wiring: that the overlay reaches the
 * tilemap at the right gids, that painting refreshes the *neighbours* whose
 * outline just changed, and that Test Play draws the same thing the editor
 * does. Constants are imported from the module under test rather than inlined,
 * so a change to the gid base or the bit layout fails here instead of silently
 * comparing two stale numbers.
 */

const EMPTY = -1;
const GROUND_GRASS = 0;
const PLATFORM_ROW = 6;
const PLATFORM_FROM = 5;
const PLATFORM_TO = 8;
const FLOOR_ROW = 9;

/** A full-width floor plus a floating four-tile platform: between them these
 * cover a run's two ends, its middle, the level boundary and an underside. */
function edgesLevel(): LevelData {
  const width = 20;
  const height = 12;
  const ground: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (y === FLOOR_ROW) return GROUND_GRASS;
      if (y === PLATFORM_ROW && x >= PLATFORM_FROM && x <= PLATFORM_TO) return GROUND_GRASS;
      return EMPTY;
    }),
  );
  return makeLevel({
    width,
    height,
    layers: { ground },
    entities: [
      { type: "player-spawn", x: 2, y: FLOOR_ROW - 1 },
      { type: "goal", x: 18, y: FLOOR_ROW - 1 },
    ],
  });
}

/** The mask actually on the overlay layer, or EDGE_NONE where there's no tile.
 * Read back through the gid base, so this fails loudly if the overlay is ever
 * registered at the wrong firstgid and starts indexing into grass's frames. */
async function edgeMask(page: Page, sceneKey: string, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ key, tx, ty, base }) => {
      const scene = window.__debugGame!.scene.getScene(key) as unknown as {
        edgeLayer?: { getTileAt(x: number, y: number): { index: number } | null };
      };
      const tile = scene.edgeLayer?.getTileAt(tx, ty);
      return tile ? tile.index - base : 0;
    },
    { key: sceneKey, tx: x, ty: y, base: EDGE_GID_BASE },
  );
}

test("a run is banded at its ends and underlined through its middle", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, edgesLevel());

  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", PLATFORM_FROM + 1, PLATFORM_ROW)).toBe(EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", PLATFORM_TO, PLATFORM_ROW)).toBe(EDGE_RIGHT | EDGE_BOTTOM);
  // Nothing above the platform, and no top band by design — the grass cap is
  // already the top edge.
  expect(await edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW - 1)).toBe(EDGE_NONE);
});

test("ground running to the level boundary is outlined there too", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, edgesLevel());

  // Out of bounds counts as open air, matching groundAutotile's own rule for
  // the row above. Flipping OUT_OF_BOUNDS_FILLS_CELL fails exactly this.
  await expect.poll(() => edgeMask(page, "Editor", 0, FLOOR_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", 19, FLOOR_ROW)).toBe(EDGE_RIGHT | EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", 10, FLOOR_ROW)).toBe(EDGE_BOTTOM);
});

test("painting beside a cell clears the band it no longer needs, and undo brings it back", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, edgesLevel());
  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);

  // The whole point of the plus-shaped refresh in TilePainter: the cell that
  // changed is not the only one whose outline did. Drop that loop and this is
  // the assertion that fails — the platform keeps a band down the middle of
  // itself, with the new tile welded silently onto the far side of it.
  await clickIconWithLabel(page, "Editor", "Grass");
  const target = tileCenter(PLATFORM_FROM - 1, PLATFORM_ROW);
  await clickScenePoint(page, target.x, target.y);

  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", PLATFORM_FROM - 1, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);

  await clickByText(page, "Editor", "↶ Undo");
  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  expect(await edgeMask(page, "Editor", PLATFORM_FROM - 1, PLATFORM_ROW)).toBe(EDGE_NONE);
});

test("erasing a cell re-opens its neighbours' edges", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, edgesLevel());
  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM + 1, PLATFORM_ROW)).toBe(EDGE_BOTTOM);

  await clickByText(page, "Editor", "Eraser");
  const target = tileCenter(PLATFORM_FROM, PLATFORM_ROW);
  await clickScenePoint(page, target.x, target.y);

  // The erased cell is gone, and the one that was tucked behind it is now an
  // end of the run.
  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_NONE);
  expect(await edgeMask(page, "Editor", PLATFORM_FROM + 1, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
});

test("Test Play draws the same outline the editor does", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, edgesLevel());
  await expect.poll(() => edgeMask(page, "Editor", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  await expect.poll(() => edgeMask(page, "Play", PLATFORM_FROM, PLATFORM_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
  expect(await edgeMask(page, "Play", PLATFORM_FROM + 1, PLATFORM_ROW)).toBe(EDGE_BOTTOM);
  expect(await edgeMask(page, "Play", 0, FLOOR_ROW)).toBe(EDGE_LEFT | EDGE_BOTTOM);
});

test("the overlay texture darkens only the exposed sides", async ({ page }) => {
  await gotoApp(page);

  // Straight off the generated strip: the frame for a bottom-left corner has
  // pixels down its left edge and along its underside, nothing on its right,
  // and nothing through the middle. That last one matters — a band that filled
  // the cell would dim the whole tile rather than rim it.
  const alphas = await page.evaluate(
    ({ key, mask }) => {
      const offset = mask * 32;
      const at = (x: number, y: number) => window.__debugGame!.textures.getPixelAlpha(offset + x, y, key);
      return { left: at(1, 16), bottom: at(16, 30), right: at(30, 16), middle: at(16, 16) };
    },
    { key: GROUND_EDGE_TEXTURE_KEY, mask: EDGE_LEFT | EDGE_BOTTOM },
  );
  expect(alphas.left).toBeGreaterThan(0);
  expect(alphas.bottom).toBeGreaterThan(0);
  expect(alphas.right).toBe(0);
  expect(alphas.middle).toBe(0);

  // And an interior cell's frame is empty everywhere, so a cell with no exposed
  // side costs nothing even if one were placed.
  const interior = await page.evaluate(
    ({ key }) => window.__debugGame!.textures.getPixelAlpha(16, 16, key),
    { key: GROUND_EDGE_TEXTURE_KEY },
  );
  expect(interior).toBe(0);
});
