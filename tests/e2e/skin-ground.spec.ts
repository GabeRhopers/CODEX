import { expect, test, type Page } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  gotoApp,
  readSceneField,
  selectPaletteCategory,
  startEditorWithLevel,
  waitForSkinCanvas,
} from "./support/coords";
import { makeLevel } from "./support/levels";
import { hangSkinsRead } from "./support/mockDrive";
import type { LevelArea, LevelData, LevelEntity } from "../../src/level/LevelSchema";

/**
 * Blocks can wear a painted skin.
 *
 * Ten brushes — four grounds, two bricks, two bounce pads, water and lava —
 * were excluded from the whole skin system by construction, because a block
 * isn't a Sprite with a swappable texture: it's a frame index into a shared,
 * gid-addressed tileset. The fix composes that tileset instead, overpainting
 * only the frames whose brush is skinned (see src/skins/groundTileset.ts).
 *
 * Two things have to be true for that to be safe, and they're what these tests
 * check:
 *
 *  1. Only the skinned frame changes. Every other frame in the strip must come
 *     out byte-identical to the shipped art, or skinning Grass would silently
 *     repaint Brick, Water, or a block in a different level.
 *  2. Art can't change behaviour. Water stays swimmable and lava still kills,
 *     because collision keys off the frame *index* and the index doesn't move.
 *     This is the guarantee that would make the whole feature a disaster if it
 *     failed, so it's tested by actually playing the level, not by inspecting
 *     the tilemap.
 */

const GRASS_TILESET = "tile-ground-tileset-grass";
const GRID = 32;

// The tile values this spec builds levels out of — mirrors LevelSchema, which
// support/levels.ts already inlines the same way rather than importing runtime
// values into the test process.
const EMPTY = -1;
const GROUND_GRASS = 0;
const WATER = 8;
const LAVA = 9;

/** A floor with a three-tile pit of lava in the middle of it, spawn on the left
 * and goal on the right — so walking right means walking straight into it. */
function lavaLevel(): LevelData {
  const width = 20;
  const height = 12;
  const row = 8;
  const ground: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (y !== row) return EMPTY;
      return x >= 8 && x <= 10 ? LAVA : GROUND_GRASS;
    }),
  );
  const entities: LevelEntity[] = [
    { type: "player-spawn", x: 2, y: row - 1 },
    { type: "goal", x: 18, y: row - 1 },
  ];
  const area: LevelArea = { width, height, layers: { ground }, entities };
  return makeLevel(area);
}

/**
 * Water at waist height over a solid floor, so walking right wades straight
 * through it.
 *
 * Water sits *above* the ground rather than replacing it because water isn't
 * solid: a pit of it is a pit, and the player falls out of the level and dies
 * whatever the art says. Wading through is the case that actually distinguishes
 * "still water" from "accidentally became a wall or a hazard".
 */
function waterLevel(): LevelData {
  const width = 20;
  const height = 12;
  const row = 8;
  const ground: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (y === row) return GROUND_GRASS;
      if (y === row - 1 && x >= 8 && x <= 10) return WATER;
      return EMPTY;
    }),
  );
  const entities: LevelEntity[] = [
    { type: "player-spawn", x: 2, y: row - 1 },
    { type: "goal", x: 18, y: row - 1 },
  ];
  const area: LevelArea = { width, height, layers: { ground }, entities };
  return makeLevel(area);
}

/** A plain grass floor — for the "does the painted art actually reach the
 * tilemap" tests, which don't care about hazards. */
function grassLevel(): LevelData {
  const width = 20;
  const height = 12;
  const row = 8;
  const ground: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (y === row ? GROUND_GRASS : EMPTY)),
  );
  return makeLevel({
    width,
    height,
    layers: { ground },
    entities: [
      { type: "player-spawn", x: 2, y: row - 1 },
      { type: "goal", x: 18, y: row - 1 },
    ],
  });
}

/**
 * A cheap content hash of one 32x32 frame of a tileset texture, read straight
 * off the GPU-bound source image.
 *
 * Comparing frames this way (rather than a pixel or two) is what makes "every
 * unskinned frame is untouched" a real claim: a composer that wrote to the
 * wrong slot, or that redrew the built-in art slightly differently, changes the
 * hash.
 */
async function frameHashes(page: Page, textureKey: string): Promise<number[]> {
  return page.evaluate(
    ({ key, grid }) => {
      const source = window.__debugGame!.textures.get(key).getSourceImage() as CanvasImageSource;
      const canvas = document.createElement("canvas");
      canvas.width = grid;
      canvas.height = grid;
      const ctx = canvas.getContext("2d")!;
      const hashes: number[] = [];
      for (let frame = 0; frame < 6; frame++) {
        ctx.clearRect(0, 0, grid, grid);
        ctx.drawImage(source, frame * grid, 0, grid, grid, 0, 0, grid, grid);
        const data = ctx.getImageData(0, 0, grid, grid).data;
        let hash = 0;
        for (let i = 0; i < data.length; i++) hash = (Math.imul(hash, 31) + data[i]) >>> 0;
        hashes.push(hash);
      }
      return hashes;
    },
    { key: textureKey, grid: GRID },
  );
}

/** Which texture the given scene's ground layer is really drawing its grass
 * strip from — the tileset, not our own bookkeeping, so this fails if the
 * composed key never reached `addTilesetImage`. */
async function grassTilesetName(page: Page, sceneKey: string): Promise<string> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key) as unknown as {
      groundLayer?: { tileset?: { name: string }[] };
    };
    return scene.groundLayer?.tileset?.[0]?.name ?? "";
  }, sceneKey);
}

/**
 * Paints a skin for one target in the Skin Creator and returns to the Menu.
 *
 * Deliberately paints a *filled block* of cells rather than a couple of dots:
 * a ground tile is read as a surface, and a two-pixel skin would be nearly
 * indistinguishable from the built-in art in a screenshot.
 */
async function paintSkinFor(page: Page, targetLabel: string): Promise<void> {
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", targetLabel);
  await waitForSkinCanvas(page);

  const box = await page.evaluate((grid) => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === grid)!;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, GRID);
  for (let y = 4; y < 12; y += 2) {
    for (let x = 4; x < 28; x += 2) {
      await page.mouse.click(box.left + ((x + 0.5) * box.width) / GRID, box.top + ((y + 0.5) * box.height) / GRID);
    }
  }

  await clickByText(page, "SkinEditor", "Save");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { statusText?: { text: string } };
        return scene.statusText?.text ?? "";
      }),
    )
    .toContain("Saved");
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
}

/** Selects a Blocks brush and picks its one saved skin for this level. */
async function chooseBlockSkin(page: Page, brushLabel: string, skinName: string): Promise<void> {
  await selectPaletteCategory(page, "Editor", "Blocks");
  await clickIconWithLabel(page, "Editor", brushLabel);
  await clickByText(page, "Editor", "Skin: Built-in ▾");
  await clickIconWithLabel(page, "Editor", skinName);
  // The composed tileset is rebuilt asynchronously after the pick; the layer's
  // own tileset name is the only thing that says the rebuild actually landed.
  await expect.poll(() => grassTilesetName(page, "Editor")).not.toBe(GRASS_TILESET);
}

test("the Skin Creator offers every block, and its grid still fits on screen", async ({ page }) => {
  // The only test in this file that lacked it, and the one that timed out at 30s
  // in a full run while taking 5s alone. Not a defect being papered over: this
  // sandbox renders on software WebGL, the suite has grown from 88 tests to 159,
  // and its five siblings here already make the same allowance for the same
  // work — boot, open the Skin Creator, read the grid.
  test.slow();
  await gotoApp(page);
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");

  const labels = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    return (scene.children.list as { type: string; text?: string; y: number; height: number }[])
      .filter((c) => c.type === "Text" && typeof c.text === "string")
      .map((c) => ({ text: c.text!, bottom: c.y + c.height }));
  });
  const names = labels.map((l) => l.text);
  for (const block of ["Grass", "Desert", "Castle", "Snow", "Brick", "Castle Brick", "Bounce", "Castle Bounce", "Water", "Lava"]) {
    expect(names, `${block} missing from the Skin Creator`).toContain(block);
  }
  // Adding ten targets pushed the 6-column grid to a seventh row that started
  // below the canvas — the last six brushes were simply unreachable.
  const height = await page.evaluate(() => window.__debugGame!.scale.height);
  for (const label of labels) {
    expect(label.bottom, `"${label.text}" runs off the bottom`).toBeLessThanOrEqual(height);
  }
});

test("a painted Grass skin repaints grass and nothing else, in the editor and in Test Play", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const builtIn = await frameHashes(page, GRASS_TILESET);

  await paintSkinFor(page, "Grass");
  await startEditorWithLevel(page, grassLevel());
  // Nothing picked yet: the level is byte-identical to one built before blocks
  // were skinnable at all, right down to using the shipped texture itself.
  expect(await grassTilesetName(page, "Editor")).toBe(GRASS_TILESET);

  await chooseBlockSkin(page, "Grass", "Grass 1");
  const composedKey = await grassTilesetName(page, "Editor");
  const composed = await frameHashes(page, composedKey);

  // Frame 0 is grass's surface and frame 1 its buried variant, which falls back
  // to the painted surface because only `top` was painted.
  expect(composed[0]).not.toBe(builtIn[0]);
  expect(composed[1]).not.toBe(builtIn[1]);
  // Brick, Bounce and Water share this same strip. They were not skinned, so
  // they must still be exactly the shipped art — this is what makes the
  // "overpaint, don't assemble" design worth having.
  expect(composed.slice(2)).toEqual(builtIn.slice(2));

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  // Test Play composes its own tilesets before building the area, so the same
  // painted art has to be what the played level is made of.
  await expect.poll(() => grassTilesetName(page, "Play")).toBe(composedKey);
});

test("skinning Brick leaves Grass alone", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  const builtIn = await frameHashes(page, GRASS_TILESET);

  await paintSkinFor(page, "Brick");
  await startEditorWithLevel(page, grassLevel());
  await chooseBlockSkin(page, "Brick", "Brick 1");

  const composed = await frameHashes(page, await grassTilesetName(page, "Editor"));
  // Brick is frame 2 of the grass strip (see groundStrip.ts's table).
  expect(composed[2]).not.toBe(builtIn[2]);
  expect(composed[0]).toBe(builtIn[0]);
  expect(composed[1]).toBe(builtIn[1]);
  expect(composed.slice(3)).toEqual(builtIn.slice(3));
});

test("a skinned Water tile is still swimmable", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintSkinFor(page, "Water");
  await startEditorWithLevel(page, waterLevel());
  await chooseBlockSkin(page, "Water", "Water 1");

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // The gid layout is what a mis-sized composed strip would shift, and it is
  // what every behaviour keys off — so pin it directly as well as by playing:
  // water's exposed frame is 4, and it must still be excluded from collision.
  const waterTile = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      groundLayer: { getTileAt(x: number, y: number): { index: number; collides: boolean } | null };
    };
    const tile = scene.groundLayer.getTileAt(9, 7);
    return tile && { index: tile.index, collides: tile.collides };
  });
  expect(waterTile).toEqual({ index: 4, collides: false });

  // Straight through the water and on to the goal. If the skin had displaced
  // the frame index, water would have become solid ground or an outright
  // hazard, and this would time out or lose instead.
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 15000, intervals: [100] }).toBe("won");
  await page.keyboard.up("ArrowRight");
});

test("a skinned Lava tile still kills", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintSkinFor(page, "Lava");
  // Lava lives in castle's strip, so this also covers a strip other than
  // grass's being composed.
  await startEditorWithLevel(page, lavaLevel());
  await selectPaletteCategory(page, "Editor", "Blocks");
  await clickIconWithLabel(page, "Editor", "Lava");
  await clickByText(page, "Editor", "Skin: Built-in ▾");
  await clickIconWithLabel(page, "Editor", "Lava 1");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
          groundLayer?: { tileset?: { name: string }[] };
        };
        return scene.groundLayer?.tileset?.[2]?.name ?? "";
      }),
    )
    .not.toBe("tile-ground-tileset-castle");

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  await page.keyboard.down("ArrowRight");
  await expect.poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 15000, intervals: [100] }).toBe("lost");
  await page.keyboard.up("ArrowRight");
});

test("a level still starts when the skins library read never answers", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  // Not an error — a request that is never answered at all. PlayScene waits on
  // the composed tilesets before it builds the area, so an unbounded wait here
  // is a level that never starts: no ground, no player, nothing to do but
  // watch. Every `.catch` in the app is useless against this, because nothing
  // ever settles.
  await hangSkinsRead(page);
  await startEditorWithLevel(page, grassLevel());

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // It falls back to the shipped art and plays. Generous, because the fallback
  // is deliberately on a 10s backstop rather than a fast retry.
  await expect
    .poll(() => grassTilesetName(page, "Play"), { timeout: 25000, intervals: [250] })
    .toBe(GRASS_TILESET);
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => readSceneField<string>(page, "Play", "outcome"), { timeout: 20000, intervals: [100] }).toBe("won");
  await page.keyboard.up("ArrowRight");
});
