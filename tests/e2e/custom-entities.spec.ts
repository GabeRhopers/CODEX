import { expect, test, type Page } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  clickScenePoint,
  gotoApp,
  readSceneField,
  selectPaletteCategory,
  startEditorWithLevel,
  tileCenter,
} from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import type { LevelData, LevelEntity } from "../../src/level/LevelSchema";
import { customDef, deleteCustomEntity, seedCustomEntities } from "./support/customEntities";
import type { PlayerStats } from "../../src/gameplay/PlayerStats";

/**
 * Entity types the player invented, from the palette through to gameplay.
 *
 * The claim this suite has to hold up is "behaviour is borrowed, never
 * described": a custom item is not an effect table entry, it is the built-in's
 * own collect path being run. So the assertion that matters is not that a
 * sprite appeared — it is that **the score actually went up**, through the same
 * code a real coin goes through.
 *
 * There is no authoring screen yet (step 0d), so definitions are seeded through
 * the dev-only `__debugCustomEntities` hook (see main.ts), which calls the real
 * Drive-backed storage module against the mocked Drive.
 */

/** A wide flat level: spawn on the left, goal on the right, everything between
 * reachable by holding one direction. */
function runwayLevel(entities: LevelEntity[] = []): LevelData {
  return makeLevel(
    makeArea(14, 10, 8, [{ type: "player-spawn", x: 1, y: 7 }, { type: "goal", x: 12, y: 7 }, ...entities]),
  );
}

/** Every entity type currently placed in the editor's level, custom ids
 * included — read straight off the scene's own level data. */
function placedTypes(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key) as unknown as { level: { entities: { type: string }[] } };
    return scene.level.entities.map((e) => e.type);
  }, sceneKey);
}

/** Every texture key drawn in Play, so a spec can ask whether an entity made it
 * onto the screen at all. */
function playTextures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play");
    type Obj = { texture?: { key?: string }; list?: Obj[] };
    const out: string[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.texture?.key) out.push(child.texture.key);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return out;
  });
}

const STAR_FRUIT = "custom:star-fruit";

test("an invented item is offered in the palette, places, and scores as the thing it copies", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [customDef({ id: STAR_FRUIT })]);
  await startEditorWithLevel(page, runwayLevel());

  // The palette resolves the library asynchronously, exactly like skins, so the
  // brush appears a moment after the editor does.
  await selectPaletteCategory(page, "Editor", "Items");
  await clickIconWithLabel(page, "Editor", "Star Fruit");

  const target = tileCenter(5, 7);
  await clickScenePoint(page, target.x, target.y);
  await expect.poll(() => placedTypes(page, "Editor")).toContain(STAR_FRUIT);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  // It wears the art of the thing it copies until someone draws it one.
  await expect.poll(() => playTextures(page)).toContain("item-coin");

  expect((await readSceneField<PlayerStats>(page, "Play", "stats")).score).toBe(0);
  await page.keyboard.down("ArrowRight");
  // The whole point: the built-in's own collect path ran. Delegating to the
  // wrong built-in, or to nothing, leaves this at 0.
  await expect
    .poll(() => readSceneField<PlayerStats>(page, "Play", "stats").then((s) => s.score), { timeout: 20_000 })
    .toBe(1);
  await page.keyboard.up("ArrowRight");
});

test("a level whose invented type has been deleted still opens, keeping the entity in its data", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [customDef({ id: STAR_FRUIT })]);

  // Placed while the definition existed, then the definition goes away — the
  // case a level made by one person and opened by another has to survive.
  const level = runwayLevel([{ type: STAR_FRUIT, x: 5, y: 7 } as unknown as LevelEntity]);
  await deleteCustomEntity(page, STAR_FRUIT);

  await startEditorWithLevel(page, level);
  // Preserved, not quietly dropped: deleting a type must never silently edit
  // levels that used it.
  expect(await placedTypes(page, "Editor")).toContain(STAR_FRUIT);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect.poll(() => playTextures(page).then((t) => t.length)).toBeGreaterThan(0);
  // Nothing to draw it as, so it is not drawn — and walking through where it
  // was collects nothing rather than scoring something invented.
  expect(await playTextures(page)).not.toContain("item-coin");
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect
    .poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 20_000 })
    .toBe("won");
  await page.keyboard.up("ArrowRight");
  expect((await readSceneField<PlayerStats>(page, "Play", "stats")).score).toBe(0);
});

test("an invented enemy patrols at the speed its definition asks for", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({
      id: "custom:swift-ghost",
      name: "Swift Ghost",
      category: "enemies",
      basedOn: "enemy-ghost",
      params: { speedScale: 2 },
    }),
  ]);

  // Both patrol from the same kind of start, so the only thing that can differ
  // between their velocities is the scale the definition asked for.
  const level = runwayLevel([
    { type: "enemy-ghost", x: 4, y: 7 },
    { type: "custom:swift-ghost", x: 8, y: 7 } as unknown as LevelEntity,
  ]);
  await page.evaluate((level) => window.__debugGame!.scene.start("Play", { level }), level);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  const speeds = async () =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
        enemies: { sprite: { body: { velocity: { x: number } } } }[];
      };
      return scene.enemies.map((e) => Math.abs(e.sprite.body.velocity.x));
    });

  await expect.poll(() => speeds().then((s) => s.length), { timeout: 20_000 }).toBe(2);
  await expect
    .poll(() => speeds().then(([builtin, custom]) => (builtin > 0 ? custom / builtin : 0)), { timeout: 20_000 })
    .toBeCloseTo(2, 1);
});

test("the palette pages once an invented type pushes a category past one screen", async ({ page }) => {
  test.slow();
  // Decor ships with exactly ten brushes, which fills all five rows of the
  // grid. One more and the eleventh would be drawn past the panel entirely.
  await gotoApp(page);
  await seedCustomEntities(page, [
    customDef({ id: "custom:totem", name: "Totem", category: "decor", basedOn: "decor-tree" }),
  ]);
  await startEditorWithLevel(page, runwayLevel());
  await selectPaletteCategory(page, "Editor", "Decor");

  await expect.poll(() => paletteLabels(page)).toContain("1/2");
  expect(await paletteLabels(page)).not.toContain("Totem");

  await clickByText(page, "Editor", "›");
  await expect.poll(() => paletteLabels(page)).toContain("Totem");

  // Reachable means placeable, not merely visible.
  await clickIconWithLabel(page, "Editor", "Totem");
  const target = tileCenter(6, 7);
  await clickScenePoint(page, target.x, target.y);
  await expect.poll(() => placedTypes(page, "Editor")).toContain("custom:totem");
});

/** Every string the palette panel is currently showing. */
function paletteLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    type Obj = { type?: string; text?: string; visible?: boolean; list?: Obj[] };
    const out: string[] = [];
    const walk = (list: Obj[]) => {
      for (const child of list) {
        if (child.visible === false) continue;
        if (child.type === "Text" && child.text) out.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Obj[]) ?? []);
    return out;
  });
}
