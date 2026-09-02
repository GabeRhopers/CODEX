import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickByText, gotoApp } from "./support/coords";
import { makeWorld, seedWorlds } from "./support/worlds";
import { customDef, seedCustomEntities } from "./support/customEntities";
import type { GameBundle } from "../../src/game/gameBundle";

/**
 * Everything a game needs, in one file.
 *
 * The point of this step is that a game currently only exists inside the
 * author's Google Drive, behind the author's own sign-in — so nobody else can
 * load any of it. This spec's load-bearing assertion is not that a file appears;
 * it is **what is in it and what is not**: every world, level, skin and invented
 * thing the game reaches, the one uploaded track a level plays — and *not* a
 * second uploaded track nothing uses, because a track is capped at 4MB and
 * carrying spares is the difference between a link that works and one nobody
 * will wait for.
 */

const USED_TRACK = "Used Tune";
const SPARE_TRACK = "Spare Tune";
const BACKGROUND = "Painted Sky";

interface SeededAssets {
  backgroundId: string;
  usedMusicId: string;
  spareMusicId: string;
}

/** Puts two tracks and a background in the shared libraries, through the real
 * storage modules against the mocked Drive. */
async function seedAssets(page: Page): Promise<SeededAssets> {
  return page.evaluate(async () => {
    const backgrounds = (await import("/src/backgrounds/backgroundLibraryStorage.ts")) as {
      addBackgroundAsset(name: string, imageData: string, uploadedBy: string): Promise<string>;
    };
    const music = (await import("/src/music/musicLibraryStorage.ts")) as {
      addMusicAsset(name: string, audioData: string, uploadedBy: string): Promise<string>;
    };
    return {
      backgroundId: await backgrounds.addBackgroundAsset("Painted Sky", "data:image/jpeg;base64,QkdEQVRB", "Mike"),
      usedMusicId: await music.addMusicAsset("Used Tune", "data:audio/wav;base64,VVNFRA", "Mike"),
      spareMusicId: await music.addMusicAsset("Spare Tune", "data:audio/wav;base64,U1BBUkU", "Mike"),
    };
  });
}

/** Saves a level that wears the seeded assets and places an invented thing —
 * in its Sub area, so the walk is proven to look past Main. */
async function seedLevel(page: Page, id: string, assets: SeededAssets, customType: string): Promise<void> {
  await page.evaluate(
    async ({ id, assets, customType }) => {
      const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
        levelStorage: { save(level: unknown): Promise<void> };
      };
      const now = new Date().toISOString();
      const ground = (rows: number, cols: number) =>
        Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, () => (y === 6 ? 0 : -1)));
      await scene.levelStorage.save({
        schemaVersion: 2,
        id,
        name: id,
        createdAt: now,
        updatedAt: now,
        tileSize: 32,
        width: 12,
        height: 8,
        layers: { ground: ground(8, 12) },
        entities: [
          { type: "player-spawn", x: 1, y: 5 },
          { type: "goal", x: 9, y: 5 },
        ],
        background: "custom",
        customBackgroundId: assets.backgroundId,
        customMusicId: assets.usedMusicId,
        subArea: {
          width: 12,
          height: 8,
          layers: { ground: ground(8, 12) },
          entities: [{ type: customType, x: 4, y: 5 }],
        },
      });
    },
    { id, assets, customType },
  );
}

/** Clicks Download and reads back the file the browser actually saved. */
async function downloadBundle(page: Page): Promise<{ bundle: GameBundle; fileName: string }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "GameMaker", "Download game file"),
  ]);
  const path = await download.path();
  return { bundle: JSON.parse(readFileSync(path, "utf8")) as GameBundle, fileName: download.suggestedFilename() };
}

function statusLine(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("GameMaker") as unknown as { status: string };
    return scene.status;
  });
}

async function buildGame(page: Page, title: string): Promise<void> {
  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await page.getByPlaceholder("Grampa's Quest").fill(title);
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");
}

test("the file holds everything the game reaches, and nothing it does not", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const assets = await seedAssets(page);
  const thing = customDef({ id: "custom:star", name: "Star Fruit" });
  await seedCustomEntities(page, [thing]);
  await seedLevel(page, "lvl-1", assets, thing.id);
  await seedWorlds(page, [makeWorld("w1", "World One", ["lvl-1"])]);

  await buildGame(page, "Grampa's Quest");
  const { bundle, fileName } = await downloadBundle(page);

  expect(fileName).toBe("grampa-s-quest.rhopers-game.json");
  expect(bundle.format).toBe(1);
  expect(bundle.game.title).toBe("Grampa's Quest");
  expect(bundle.worlds.map((w) => w.id)).toEqual(["w1"]);
  expect(bundle.levels.map((l) => l.id)).toEqual(["lvl-1"]);

  // The invented thing, and the art library it needs to render with.
  expect(bundle.customEntities.map((d) => d.id)).toContain("custom:star");
  expect(bundle.skins).toBeDefined();

  // The background and the track this level actually uses...
  expect(bundle.backgrounds.map((b) => b.name)).toEqual([BACKGROUND]);
  expect(bundle.music.map((m) => m.name)).toEqual([USED_TRACK]);
  // ...and not the one nothing plays. This is the assertion the whole "collect
  // by reach" design exists for.
  expect(bundle.music.map((m) => m.name)).not.toContain(SPARE_TRACK);

  // Nothing dangling, and the summary says what was made.
  await expect.poll(() => statusLine(page)).toMatch(/^Saved 1 world, 1 level, /);
});

test("a game missing a level still exports, and the file says which", async ({ page }) => {
  test.slow();
  // Deleting a level elsewhere is the failure that actually ends a world early,
  // so the export has to name it rather than quietly producing a broken game —
  // and has to still produce the file, or there is nothing to inspect.
  await gotoApp(page);
  const assets = await seedAssets(page);
  await seedLevel(page, "lvl-1", assets, "item-coin");
  await seedWorlds(page, [makeWorld("w1", "World One", ["lvl-1", "deleted-level"])]);

  await buildGame(page, "Broken Quest");
  const { bundle } = await downloadBundle(page);

  expect(bundle.levels.map((l) => l.id)).toEqual(["lvl-1"]);
  await expect.poll(() => statusLine(page)).toContain("deleted-level");
  await expect.poll(() => statusLine(page)).toContain("World One");
});

test("the whole skins library travels, not just what a level names", async ({ page }) => {
  test.slow();
  // A level's own skin map is not enough to know what it renders: the resolver
  // falls back to the library default for any brush the level says nothing
  // about. So a skin nobody explicitly chose still has to be in the file.
  await gotoApp(page);
  const assets = await seedAssets(page);
  await page.evaluate(async () => {
    const skins = (await import("/src/skins/skinStorage.ts")) as {
      addCustomSkin(brushId: string, imageData: string, uploadedBy: string, name?: string): Promise<string>;
    };
    await skins.addCustomSkin("enemy-ghost", "data:image/png;base64,R0hPU1Q", "Mike", "Blue Ghost");
  });
  await seedLevel(page, "lvl-1", assets, "item-coin");
  await seedWorlds(page, [makeWorld("w1", "World One", ["lvl-1"])]);

  await buildGame(page, "Skinned Quest");
  const { bundle } = await downloadBundle(page);

  expect(Object.keys(bundle.skins)).toContain("enemy-ghost");
  expect(bundle.skins["enemy-ghost"].items.map((s) => s.name)).toContain("Blue Ghost");
});
