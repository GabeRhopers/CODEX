import { expect, test } from "@playwright/test";
import { clickByText, dragScenePoints, gotoApp, startEditorWithLevel, tileCenter } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Priority Matrix, "01 · TEST NEXT": Hand-tool grab/move for an entity and
 * a ground block, with correct undo (Tier 2, Editor UX).
 */

const GROUND_GRASS_TILE = 0;
const EMPTY_TILE = -1;

interface EditorLevelSnapshot {
  entities: { type: string; x: number; y: number }[];
  ground: number[][];
}

async function readLevel(page: import("@playwright/test").Page): Promise<EditorLevelSnapshot> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      level: { entities: { type: string; x: number; y: number }[]; layers: { ground: number[][] } };
    };
    return { entities: scene.level.entities, ground: scene.level.layers.ground };
  });
}

test("Hand tool grabs/moves an entity and a ground block, and Undo reverts each", async ({ page }) => {
  const mainArea = makeArea(10, 8, 5, [{ type: "enemy-ghost", x: 3, y: 5 }]);
  const level = makeLevel(mainArea);

  await gotoApp(page);
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Hand");

  // --- Entity: grab the ghost at (3,5), drop it at (3,2) ---
  await dragScenePoints(page, tileCenter(3, 5), tileCenter(3, 2));
  let snapshot = await readLevel(page);
  let ghost = snapshot.entities.find((e) => e.type === "enemy-ghost");
  expect(ghost).toMatchObject({ x: 3, y: 2 });

  await clickByText(page, "Editor", "Undo");
  snapshot = await readLevel(page);
  ghost = snapshot.entities.find((e) => e.type === "enemy-ghost");
  expect(ghost).toMatchObject({ x: 3, y: 5 });

  // --- Ground block: grab the grass tile at (6,5) (part of the painted
  // strip), drop it at (6,2) (empty) ---
  await dragScenePoints(page, tileCenter(6, 5), tileCenter(6, 2));
  snapshot = await readLevel(page);
  expect(snapshot.ground[2][6]).toBe(GROUND_GRASS_TILE);
  expect(snapshot.ground[5][6]).toBe(EMPTY_TILE);

  await clickByText(page, "Editor", "Undo");
  snapshot = await readLevel(page);
  expect(snapshot.ground[5][6]).toBe(GROUND_GRASS_TILE);
  expect(snapshot.ground[2][6]).toBe(EMPTY_TILE);
});
