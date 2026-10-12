import { expect, test, type Page } from "@playwright/test";
import {
  clickByText,
  clickIconWithLabel,
  gotoApp,
  openThings,
  pixelCanvasBox,
  startEditorWithLevel,
  waitForSkinCanvas,
} from "./support/coords";
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
  const box = await pixelCanvasBox(page, gridSize);
  await page.mouse.click(box.left + ((cellX + 0.5) * box.width) / gridSize, box.top + ((cellY + 0.5) * box.height) / gridSize);
}

/** The texture the player sprite is currently drawn with. */
async function playerTexture(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { texture: { key: string } } };
    return scene.player?.texture.key ?? "";
  });
}

/** How fast the character is moving sideways — used to wait until a held key
 * has actually produced movement, rather than assuming it did. */
const playerVelocityX = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      player?: { body?: { velocity: { x: number } } };
    };
    return scene.player?.body?.velocity.x ?? 0;
  });

/** Whether the run is still going. `outcome` is `private` on PlayScene, which
 * TypeScript erases at runtime — the same way every other probe in this suite
 * reaches scene state. */
const outcome = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
    return scene.outcome ?? "";
  });

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
  await openThings(page);

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
  // Pose first, then the frame inside it. Until 2026-10-12 this was one click
  // on a "walk1 ·" button, because the character's five poses were five rows in
  // one flat strip. They are now a "Pose ▾" selector over four frame rows,
  // which is what lets a stride be longer than two frames at all — so the
  // navigation here changes with the screen rather than the behaviour.
  await clickByText(page, "SkinEditor", "Pose: Idle ▾");
  await clickByText(page, "SkinEditor", "Walk");
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
  //
  // **Sampling stops at the goal.** This level is 17 tiles of clear ground and
  // a character crosses it in a second or two, so a loop watching only the
  // clock will eventually fold the *win* pose into `seen` and fail reporting a
  // walk-cycle problem it never had. That is how CI found the applyTerminalPose
  // bug on 2026-10-11 — the sample was honest, the diagnosis in the failure
  // message was not. The outcome check keeps this test about the stride; the
  // win pose has its own assertion below.
  await page.keyboard.down("ArrowRight");
  const seen = new Set<string>();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && seen.size < 2 && (await outcome(page)) === "playing") {
    seen.add(await playerTexture(page));
  }

  expect(seen.size, "the stride never showed two distinct frames before the goal").toBeGreaterThanOrEqual(2);
  for (const key of seen) expect(key).toContain("skin-frame-player-");

  // **Winning must not hand the level back to Grampa.** applyTerminalPose wrote
  // the built-in texture straight off, and PlayScene.update returns early once
  // the outcome is settled — so the wrong art was not a flicker, it was the
  // last frame of the run, held under the Trophy. A child who painted their own
  // character watched somebody else take the bow.
  await expect.poll(() => outcome(page), { timeout: 15_000 }).toBe("won");
  await page.keyboard.up("ArrowRight");
  expect(await playerTexture(page), "the winning pose is still the painted character").toContain(
    "skin-frame-player-",
  );
});

test("a painted enemy skin loops through its frames", async ({ page }) => {
  test.slow();

  await gotoApp(page);
  await openThings(page);

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

  // The second frame of the loop. Stored as "1" — and shown that way until
  // 2026-09-12, when a loop's buttons started counting from one like a person
  // does; the storage keys are untouched, so only the label moved.
  await clickByText(page, "SkinEditor", "Frame 2 ·");
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

/**
 * The frames a character skin is *stored* under, straight from the storage
 * layer. Read rather than inferred from the UI: this test is about the keys,
 * and a migration that renders correctly while writing the wrong names would
 * pass every assertion made through the screen.
 */
async function storedCharacterFrames(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const mod = (await import("/src/skins/skinStorage.ts")) as {
      loadCustomSkins(): Promise<Record<string, { activeId: string | null; items: { id: string; frames?: Record<string, string> }[] }>>;
    };
    const skins = await mod.loadCustomSkins();
    const entry = skins["player"];
    const active = entry?.items.find((item) => item.id === entry.activeId) ?? entry?.items[0];
    return active?.frames ?? {};
  });
}

/** Seeds a character skin saved the way every skin before frame groups was:
 * three distinct images under the legacy names. */
async function seedLegacyCharacterSkin(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async (grid) => {
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
        name?: string,
      ): Promise<string>;
    };
    // One distinct pixel per frame, so each image is byte-different from the
    // others and "which art landed where" is answerable.
    const paint = (index: number): string => {
      const blank: (string | null)[] = new Array(grid * grid).fill(null);
      blank[(10 + index) * grid + 10] = "#FF004D";
      return cells.cellsToPngDataUrl(blank, grid);
    };
    const frames = { idle: paint(0), walk1: paint(1), walk2: paint(2) };
    await storage.savePixelSkin("player", undefined, frames.idle, { paletteId: "pico8" }, "tester", frames, "Old Hero");
    return frames;
  }, CHARACTER_GRID);
}

test("a character painted before frame groups keeps every frame, under its new pose", async ({ page }) => {
  test.slow();
  // **The migration, and the only thing standing between it and lost artwork.**
  // Skins saved before this feature store idle/walk1/walk2. The editor now
  // works in group slots, so opening one has to find the old names and put
  // that art under the right pose — and saving has to write the new names
  // without dropping anything on the way.
  await gotoApp(page);
  const seeded = await seedLegacyCharacterSkin(page);

  const before = await storedCharacterFrames(page);
  expect(Object.keys(before).sort(), "precondition: seeded under the legacy names").toEqual(["idle", "walk1", "walk2"]);

  // Open it and save it again, painting nothing. A no-op save is the whole
  // test: whatever comes back is purely what the migration did.
  // Through "My skins" rather than the Things grid: clicking Grampa there
  // starts a *new* skin, and re-opening the saved one is the whole point.
  await openThings(page);
  await clickByText(page, "SkinEditor", "My skins");
  await clickByText(page, "SkinEditor", "Edit");
  await waitForSkinCanvas(page);
  await saveSkin(page);

  const after = await storedCharacterFrames(page);
  expect(after["idle.0"], "the idle art survived, under its slot").toBe(seeded.idle);
  expect(after["walk.0"], "walk1 became the first stride frame").toBe(seeded.walk1);
  expect(after["walk.1"], "walk2 became the second — not dropped, not merged").toBe(seeded.walk2);
  expect(after["walk1"], "the legacy name is gone, migrated away on save").toBeUndefined();
  expect(after["walk2"]).toBeUndefined();
});

test("a three-frame walk is painted, saved and actually played", async ({ page }) => {
  test.slow();
  // **What the whole frame-group plan exists for.** Before this, a character's
  // stride was two pictures because the editor had exactly two walk buttons and
  // the runtime had a hard-coded count of 2. A child can now paint a third and
  // the game plays it. Nothing else in the suite can show that.
  await gotoApp(page);
  await openThings(page);
  await clickIconWithLabel(page, "SkinEditor", "Grampa");
  await waitForSkinCanvas(page);

  // Idle first: it is the base frame, and Save refuses a skin without it.
  await paintCell(page, CHARACTER_GRID, 4, 4);

  await clickByText(page, "SkinEditor", "Pose: Idle ▾");
  await clickByText(page, "SkinEditor", "Walk");
  // Three frames, each a different pixel so the three textures cannot collapse
  // into one another by accident.
  for (const [frame, cell] of [
    ["Frame 1 ·", 20],
    ["Frame 2 ·", 24],
    ["Frame 3 ·", 28],
  ] as const) {
    await clickByText(page, "SkinEditor", frame);
    await paintCell(page, CHARACTER_GRID, cell, cell);
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
    ]),
  );
  await startEditorWithLevel(page, level);
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect.poll(() => playerTexture(page), { timeout: 15_000 }).toContain("skin-frame-player-");

  // **Assert he is actually walking before sampling the walk.** Without this
  // the loop can spend its whole budget on the idle texture and report "one
  // distinct frame", which reads as a broken stride and is really a keypress
  // that had not landed yet. Measured: that is exactly how this test failed on
  // its first run and passed on its second.
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => playerVelocityX(page), { timeout: 10_000 }).toBeGreaterThan(5);

  // Sampling stops at the goal, for the reason the stride test above records.
  const seen = new Set<string>();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && seen.size < 3 && (await outcome(page)) === "playing") {
    seen.add(await playerTexture(page));
  }
  await page.keyboard.up("ArrowRight");

  expect(seen.size, "a three-frame stride should show three distinct textures").toBeGreaterThanOrEqual(3);
  for (const key of seen) expect(key).toContain("skin-frame-player-");
});

