import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  clickByText,
  clickIconWithLabel,
  clickScenePoint,
  gotoApp,
  pixelCanvasBox,
  readStatusText,
  selectPaletteCategory,
  tileCenter,
  waitForSkinCanvas,
} from "./support/coords";
import type { GameBundle } from "../../src/game/gameBundle";

/**
 * Make a whole game with the tool, the way a person would.
 *
 * Every other spec in this suite proves one screen. Several seed their starting
 * state through the debug hook precisely so they can be about one thing —
 * `game-bundle.spec.ts` writes its levels straight to storage, `game-maker.spec`
 * seeds its worlds, `thing-sound.spec` seeds its invented thing. That is the
 * right call for each of them and it leaves one question unasked: can somebody
 * sit down in front of this and come out the other end with a game?
 *
 * Nobody had ever done it. The one game this project ships was written by hand
 * as JSON, so the creation path had never been walked from the Menu to a link,
 * and its cost had never been measured. This walks it: invent a thing, draw it,
 * paint two levels, chain them into a world, assemble a game with an opening,
 * publish, and read the file that falls out.
 *
 * **It counts the clicks.** Not decoration — the thing you cannot see once you
 * know a tool is how much of it is spent on what. A stage that takes forty
 * gestures to do something small is a finding, and it is invisible to a
 * pass/fail assertion.
 *
 * **What it cannot do.** A script is not a child. It will report that a step
 * failed, that a control could not be reached, that a stage cost sixty clicks.
 * It cannot report that a screen was confusing, and that is the half only a
 * person can tell you.
 */

const THING = "Grumble Bug";
const LEVEL_ONE = "Meadow Path";
const LEVEL_TWO = "The Long Climb";
const WORLD = "Green Fields";
const TITLE = "Grumble Bug Goes Walking";

/** Where the captured bundle is left for inspection. Deliberately under
 * `test-results/` rather than written into `public/games/`: a test that edits
 * the repository it is testing is a test you stop trusting. Committing it is a
 * decision for whoever reads the run. */
const OUT_DIR = "test-results";

// --- Instrumentation -------------------------------------------------------

interface StageRecord {
  name: string;
  gestures: number;
  ms: number;
}

/**
 * Counts gestures and time per stage.
 *
 * A "gesture" is one thing a hand does: a click, a drag, filling a field. Not
 * one pointer event — a drag across twelve tiles is one gesture because that is
 * what it is to do, however many events it takes to deliver. Counting events
 * instead would make painting look expensive and dropdown-hunting look cheap,
 * which is exactly backwards.
 */
class Run {
  private stages: StageRecord[] = [];
  private open: { name: string; at: number; from: number } | null = null;
  private total = 0;

  begin(name: string): void {
    this.end();
    this.open = { name, at: Date.now(), from: this.total };
  }

  end(): void {
    if (!this.open) return;
    this.stages.push({
      name: this.open.name,
      gestures: this.total - this.open.from,
      ms: Date.now() - this.open.at,
    });
    this.open = null;
  }

  count(n = 1): void {
    this.total += n;
  }

  get gestures(): number {
    return this.total;
  }

  report(): string {
    const width = Math.max(...this.stages.map((s) => s.name.length));
    const lines = this.stages.map(
      (s) =>
        `  ${s.name.padEnd(width)}  ${String(s.gestures).padStart(4)} gestures  ` +
        `${String(Math.round(s.ms / 1000)).padStart(4)}s  ` +
        `${String(Math.round((s.gestures / this.total) * 100)).padStart(3)}%`,
    );
    return [`Making "${TITLE}" took ${this.total} gestures:`, ...lines].join("\n");
  }
}

// --- Gestures --------------------------------------------------------------

/**
 * The scripted hand.
 *
 * Every method here is one gesture and increments the counter, so the count is
 * a property of the walk rather than something maintained alongside it. The
 * wrappers are thin on purpose: what they wrap is the same helpers every other
 * spec drives the app with, so this walk has no privileged access to anything.
 */
class Hand {
  constructor(
    private readonly page: Page,
    private readonly run: Run,
  ) {}

  /** A labelled button. */
  async tap(scene: string, label: string): Promise<void> {
    this.run.count();
    await clickByText(this.page, scene, label);
  }

  /** A palette or picker icon, chosen by the name written under it. */
  async pick(scene: string, label: string): Promise<void> {
    this.run.count();
    await clickIconWithLabel(this.page, scene, label);
  }

  /** A category tab: the chip, then the row. Two gestures, because it is two. */
  async category(scene: string, label: "Blocks" | "Markers" | "Enemies" | "Items" | "Decor"): Promise<void> {
    this.run.count(2);
    await selectPaletteCategory(this.page, scene, label);
  }

  /** A button whose label carries its own current state ("BG: Meadow ▾"). */
  async tapStartingWith(scene: string, prefix: string): Promise<void> {
    const label = await readStatusText(this.page, scene, prefix);
    if (!label) throw new Error(`no button starting with "${prefix}" in ${scene}`);
    await this.tap(scene, label);
  }

  /** Typing into one of the DOM fields overlaid on the canvas. */
  async type(placeholder: string, value: string): Promise<void> {
    this.run.count();
    const field = this.page.getByPlaceholder(placeholder);
    await field.fill(value);
    await field.press("Enter");
  }

  /** A paragraph field: blur rather than Enter, which types a newline there. */
  async write(placeholder: string, value: string): Promise<void> {
    this.run.count();
    const field = this.page.getByPlaceholder(placeholder);
    await field.fill(value);
    await field.blur();
  }

  /** One tile in the editor grid. */
  async place(tileX: number, tileY: number): Promise<void> {
    this.run.count();
    const at = tileCenter(tileX, tileY);
    await clickScenePoint(this.page, at.x, at.y);
  }

  /**
   * A run of tiles, painted in one drag — what a hand actually does with a
   * ground row.
   *
   * The step count is derived from the distance rather than fixed. EditorScene
   * paints a tile only when the pointer is *seen* inside it (see
   * `paintAlong`/`dragLastX`), so a long drag delivered in Playwright's default
   * five steps paints five tiles out of twenty and leaves a dotted line.
   */
  async paint(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    this.run.count();
    const a = tileCenter(from.x, from.y);
    const b = tileCenter(to.x, to.y);
    const tiles = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + 1;
    await dragOnCanvas(this.page, a, b, tiles * 3);
  }
}

/** Scene coordinates to page coordinates — the conversion `coords.ts` keeps
 * private, mirrored here for the two gestures it does not cover. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
}

async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): Promise<void> {
  const a = await toPage(page, from.x, from.y);
  const b = await toPage(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

// --- Reading the screens ---------------------------------------------------

const labels = (page: Page, sceneKey: string): Promise<string[]> =>
  page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
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
  }, sceneKey);

const active = (page: Page, key: string): Promise<boolean> =>
  page.evaluate((k) => window.__debugGame!.scene.isActive(k), key);

async function waitFor(page: Page, key: string): Promise<void> {
  await expect.poll(() => active(page, key), { timeout: 30_000 }).toBe(true);
}

/** The level as the editor currently holds it — used to check the painting
 * landed before saving, rather than finding out from the published file. */
const editorLevel = (page: Page): Promise<{ width: number; height: number; entities: { type: string }[] }> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      level: { width: number; height: number; entities: { type: string }[] };
    };
    return JSON.parse(JSON.stringify(scene.level));
  });

/** How many ground tiles are painted in the level's main area. */
const groundCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      level: { layers: { ground: number[][] } };
    };
    return scene.level.layers.ground.flat().filter((t) => t !== -1).length;
  });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/author-${name}.png` });
}

/** What the enemies in the running level are actually drawn with.
 *
 * The one thing a screenshot proved and no assertion did: an invented thing
 * used to play as the built-in it copies, however carefully you drew it, and
 * everything else about the run looked right. See `adoptsFirstSkin` in
 * skinStorage.ts. */
const enemyTextures = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      enemies: { sprite: { texture: { key: string } } }[];
    };
    return scene.enemies.map((e) => e.sprite.texture.key);
  });

// --- The sprite ------------------------------------------------------------

const BODY = "#008751";
const EYE = "#FFF1E8";
const PUPIL = "#000000";

/** A round bug, drawn as rows. Each entry is one drag. */
const BUG_ROWS: [y: number, x0: number, x1: number][] = [
  [8, 12, 19],
  [9, 10, 21],
  [10, 9, 22],
  [11, 8, 23],
  [12, 8, 23],
  [13, 8, 23],
  [14, 8, 23],
  [15, 8, 23],
  [16, 9, 22],
  [17, 10, 21],
  [18, 12, 19],
  [19, 9, 11],
  [19, 20, 22],
];

const EYES: [x: number, y: number][] = [
  [13, 12],
  [14, 12],
  [18, 12],
  [19, 12],
];

const PUPILS: [x: number, y: number][] = [
  [14, 13],
  [18, 13],
];

const GRID = 32;

/** Clicks the swatch of a given colour. Found by its fill rather than its
 * position, so a palette-row relayout does not silently start painting in some
 * other colour — the failure mode a coordinate would have. */
async function pickColor(page: Page, run: Run, hex: string): Promise<void> {
  run.count();
  const at = await page.evaluate((wanted) => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    const target = parseInt(wanted.slice(1), 16);
    for (const child of scene.children.list) {
      const o = child as unknown as { name?: string; x?: number; y?: number; width?: number; fillColor?: number };
      if (o.name === "palette-swatch" && o.fillColor === target) {
        return { x: o.x! + (o.width ?? 24) / 2, y: o.y! + (o.width ?? 24) / 2 };
      }
    }
    return null;
  }, hex);
  if (!at) throw new Error(`no palette swatch for ${hex} — is PICO-8 still the palette the canvas opens on?`);
  await clickScenePoint(page, at.x, at.y);
}

async function paintCells(page: Page, run: Run, cells: [number, number][]): Promise<void> {
  const box = await pixelCanvasBox(page, GRID);
  const w = box.width / GRID;
  const h = box.height / GRID;
  for (const [x, y] of cells) {
    run.count();
    await page.mouse.click(box.left + (x + 0.5) * w, box.top + (y + 0.5) * h);
  }
}

async function paintRow(page: Page, run: Run, y: number, x0: number, x1: number): Promise<void> {
  run.count();
  const box = await pixelCanvasBox(page, GRID);
  const w = box.width / GRID;
  const h = box.height / GRID;
  const cy = box.top + (y + 0.5) * h;
  await page.mouse.move(box.left + (x0 + 0.5) * w, cy);
  await page.mouse.down();
  await page.mouse.move(box.left + (x1 + 0.5) * w, cy, { steps: (x1 - x0 + 1) * 3 });
  await page.mouse.up();
}

const paintedCells = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      pixelCanvas?: { getCells(): (string | null)[] };
    };
    return (scene.pixelCanvas?.getCells() ?? []).filter((c) => c !== null).length;
  });

// --- The walk --------------------------------------------------------------

test("a person can make a small game from the Menu to a link", async ({ page }, testInfo) => {
  testInfo.setTimeout(600_000);
  mkdirSync(OUT_DIR, { recursive: true });

  const run = new Run();
  const hand = new Hand(page, run);

  await gotoApp(page);

  // --- 1. Invent a thing ---------------------------------------------------
  run.begin("Thing Maker");
  await hand.tap("Menu", "Thing Maker");
  await waitFor(page, "ThingMaker");
  await hand.tap("ThingMaker", "+ New Thing");
  await hand.type("Star Fruit", THING); // "Star Fruit" is the field's placeholder
  await hand.tap("ThingMaker", "Enemy");
  await hand.tap("ThingMaker", "Slow");
  await hand.tap("ThingMaker", "Thud");
  await shot(page, "01-thing");
  await hand.tap("ThingMaker", "Save & draw sprite →");

  // --- 2. Draw it ----------------------------------------------------------
  run.begin("Skin Creator");
  await waitFor(page, "SkinEditor");
  await waitForSkinCanvas(page);

  await pickColor(page, run, BODY);
  for (const [y, x0, x1] of BUG_ROWS) await paintRow(page, run, y, x0, x1);
  await pickColor(page, run, EYE);
  await paintCells(page, run, EYES);
  await pickColor(page, run, PUPIL);
  await paintCells(page, run, PUPILS);

  // Painted before it is saved: a sprite that silently came out empty would
  // publish perfectly happily and only be visible to whoever opened the link.
  expect(await paintedCells(page), "the sprite came out empty").toBeGreaterThan(100);
  await shot(page, "02-sprite");

  await hand.type("Skin name", THING);
  await hand.tap("SkinEditor", "Save");
  await expect
    .poll(() => readStatusText(page, "SkinEditor", "Saved"), { timeout: 20_000 })
    .toContain("Saved");

  await hand.tap("SkinEditor", "← Back");
  await hand.tap("SkinEditor", "← Back");
  await waitFor(page, "ThingMaker");
  await hand.tap("ThingMaker", "← Back");
  await waitFor(page, "Menu");

  // --- 3. Two levels -------------------------------------------------------
  await buildLevel(page, hand, run, {
    stage: "Level 1",
    name: LEVEL_ONE,
    shot: "03-level-one",
    paint: async () => {
      await hand.category("Editor", "Blocks");
      await hand.pick("Editor", "Grass");
      await hand.paint({ x: 0, y: 10 }, { x: 19, y: 10 });
      await hand.paint({ x: 0, y: 11 }, { x: 19, y: 11 });
      await hand.pick("Editor", "Brick");
      await hand.paint({ x: 6, y: 7 }, { x: 8, y: 7 });
      await hand.paint({ x: 12, y: 6 }, { x: 14, y: 6 });
    },
    dress: async () => {
      await hand.category("Editor", "Items");
      await hand.pick("Editor", "Coin");
      await hand.place(7, 6);
      await hand.place(13, 5);
      await hand.place(16, 9);
      await hand.category("Editor", "Enemies");
      await hand.pick("Editor", THING);
      await hand.place(11, 9);
      await hand.category("Editor", "Decor");
      await hand.pick("Editor", "Tree");
      await hand.place(4, 9);
    },
    testPlay: true,
  });

  await buildLevel(page, hand, run, {
    stage: "Level 2",
    name: LEVEL_TWO,
    shot: "04-level-two",
    paint: async () => {
      await hand.category("Editor", "Blocks");
      await hand.pick("Editor", "Grass");
      await hand.paint({ x: 0, y: 10 }, { x: 19, y: 10 });
      await hand.paint({ x: 0, y: 11 }, { x: 19, y: 11 });
      await hand.paint({ x: 8, y: 7 }, { x: 13, y: 7 });
      await hand.paint({ x: 8, y: 8 }, { x: 13, y: 8 });
      await hand.paint({ x: 8, y: 9 }, { x: 13, y: 9 });
      await hand.pick("Editor", "Brick");
      await hand.place(6, 9);
      await hand.place(7, 8);
    },
    dress: async () => {
      await hand.category("Editor", "Items");
      await hand.pick("Editor", "Coin");
      await hand.place(9, 6);
      await hand.place(11, 6);
      await hand.pick("Editor", "Heart");
      await hand.place(2, 9);
      await hand.category("Editor", "Enemies");
      await hand.pick("Editor", THING);
      await hand.place(16, 9);
    },
    testPlay: false,
  });

  // --- 4. Chain them into a world -----------------------------------------
  run.begin("World Maker");
  await hand.tap("Menu", "Worlds");
  await waitFor(page, "WorldBrowser");
  await hand.tap("WorldBrowser", "New World");
  await waitFor(page, "WorldMaker");
  await hand.tap("WorldMaker", LEVEL_ONE);
  await expect.poll(() => labels(page, "WorldMaker")).toContain(LEVEL_ONE);
  await hand.tap("WorldMaker", LEVEL_TWO);
  await hand.type("World name", WORLD);
  await hand.tapStartingWith("WorldMaker", "Map backdrop:");
  await shot(page, "05-world");
  await hand.tap("WorldMaker", "Save World");
  await waitFor(page, "WorldBrowser");
  await expect.poll(() => labels(page, "WorldBrowser")).toContain(WORLD);
  await hand.tap("WorldBrowser", "← Back");
  await waitFor(page, "Menu");

  // --- 5. Assemble the game -----------------------------------------------
  run.begin("Game Maker");
  await hand.tap("Menu", "Game Maker");
  await waitFor(page, "GameMaker");
  await expect.poll(() => labels(page, "GameMaker")).toContain(WORLD);
  await hand.type("Grampa's Quest", TITLE);
  await hand.tap("GameMaker", "Add");
  await hand.type("The End", "Home at last");
  await hand.type("Thanks for playing!", "The Grumble Bug never did catch anybody.");
  await shot(page, "06-game");

  run.begin("Cut scene");
  await hand.tap("GameMaker", "Opening…");
  await waitFor(page, "CutSceneMaker");
  await hand.tap("CutSceneMaker", "+ Add panel");
  await hand.write("What happens here?", "A Grumble Bug woke up in the meadow.");
  await hand.tap("CutSceneMaker", "+ Add panel");
  await hand.write("What happens here?", "It was a long way home.");
  await shot(page, "07-cutscene");
  await hand.tap("CutSceneMaker", "Save");
  await expect.poll(() => labels(page, "CutSceneMaker")).toContain("Saved.");
  await hand.tap("CutSceneMaker", "← Back");
  await waitFor(page, "GameMaker");

  // --- 6. Publish ----------------------------------------------------------
  run.begin("Publish");
  await hand.tap("GameMaker", "Publish…");
  await waitFor(page, "Publish");
  run.count();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "Publish", "Download"),
  ]);
  const bundle = JSON.parse(readFileSync(await download.path(), "utf8")) as GameBundle;
  await shot(page, "08-publish");
  run.end();

  writeFileSync(`${OUT_DIR}/${download.suggestedFilename()}`, JSON.stringify(bundle, null, 2));

  // --- What came out -------------------------------------------------------
  //
  // Asserted against the *file*, not the screens: everything above could look
  // right and still publish something a visitor cannot play, which is precisely
  // the failure nobody would catch.
  expect(bundle.game.title).toBe(TITLE);
  expect(bundle.worlds.map((w) => w.name)).toEqual([WORLD]);
  expect(bundle.levels.map((l) => l.name).sort()).toEqual([LEVEL_ONE, LEVEL_TWO].sort());
  expect(bundle.customEntities.map((d) => d.name)).toEqual([THING]);
  expect(bundle.customEntities[0].sound?.preset).toBe("thud");
  expect(bundle.game.opening?.panels).toHaveLength(2);

  // The invented thing is placed, and the art it was drawn with travelled.
  const placed = bundle.levels.flatMap((l) => l.entities.filter((e) => String(e.type).startsWith("custom:")));
  expect(placed.length, "the invented thing is in no level").toBeGreaterThan(0);
  const thingId = bundle.customEntities[0].id;
  expect(Object.keys(bundle.skins), "the drawn sprite is not in the file").toContain(thingId);

  // eslint-disable-next-line no-console -- the point of the run
  console.log(`\n${run.report()}\n`);
  testInfo.annotations.push({ type: "gestures", description: String(run.gestures) });
});

interface LevelPlan {
  stage: string;
  name: string;
  shot: string;
  paint: () => Promise<void>;
  dress: () => Promise<void>;
  testPlay: boolean;
}

/** One level, from the Menu's New Level to being saved and back at the Menu. */
async function buildLevel(page: Page, hand: Hand, run: Run, plan: LevelPlan): Promise<void> {
  run.begin(plan.stage);
  await hand.tap("Menu", "New Level");
  await waitFor(page, "Editor");
  await hand.type("Level name", plan.name);

  await plan.paint();
  await expect.poll(() => groundCount(page), { timeout: 20_000 }).toBeGreaterThan(40);

  await hand.category("Editor", "Markers");
  await hand.pick("Editor", "Spawn");
  await hand.place(1, 9);
  await hand.pick("Editor", "Goal");
  await hand.place(18, 9);

  await plan.dress();

  // The default background is Meadow; a real author picks one.
  await hand.tapStartingWith("Editor", "BG: ");
  await hand.tap("Editor", "Sunny Valley");

  await expect
    .poll(() => editorLevel(page).then((l) => l.entities.map((e) => e.type)))
    .toContain("goal");
  await shot(page, plan.shot);

  if (plan.testPlay) {
    await hand.tap("Editor", "Test Play (Space)");
    await waitFor(page, "Play");

    // The invented thing wears the sprite that was drawn for it, not the ghost
    // it was based on. Polled because the swap happens after an async skin
    // resolve (see PlayScene's resolveSkinTextureKeys).
    await expect
      .poll(() => enemyTextures(page), { timeout: 20_000 })
      .not.toContain("enemy-ghost-pillow");

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1200);
    await page.keyboard.up("ArrowRight");
    await shot(page, `${plan.shot}-play`);
    await page.keyboard.press("Escape");
    await waitFor(page, "Editor");
  }

  await hand.tap("Editor", "Save");
  await expect.poll(() => readStatusText(page, "Editor", "Saved"), { timeout: 20_000 }).toBe("Saved");
  await hand.tap("Editor", "Menu");
  await waitFor(page, "Menu");
}
