import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickByText, clickIconWithLabel, gotoApp, startEditorWithLevel, waitForGame } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { makeWorld, seedWorlds } from "./support/worlds";
import type { GameBundle } from "../../src/game/gameBundle";
import type { LevelArea, LevelData } from "../../src/level/LevelSchema";

/**
 * Music without uploading anything.
 *
 * **Every test here starts with an empty music library**, which is the whole
 * point: until these four tunes existed the picker offered "None" and your own
 * uploads and nothing else, so anybody who had never gone looking for an audio
 * file had exactly one option and every level they made was silent. That was
 * the day-one experience, and `gotoApp` seeds no music, so it is this spec's
 * starting state too — no `seedAssets` anywhere below.
 *
 * The three assertions are the three things the cut-scene pictures got wrong
 * six days ago, in the order they were wrong: **offered** (the picker had no
 * built-ins at all), **played** (the art existed but nothing ever reached it),
 * and **published** (a built-in id collected as if it were an upload, so the
 * bundler hunted the library for it and reported a track missing that was
 * perfectly fine). Each of those was invisible to the layer above it.
 */

/**
 * Serial, for one reason: the last test opens the *same file* the one before it
 * published. Producing that file costs a whole editor session, and re-exporting
 * it would make them two different questions rather than two halves of one.
 * Safe at module scope because this project runs Playwright with a single
 * worker — the same arrangement `published-game.spec.ts` uses and documents.
 */
test.describe.configure({ mode: "serial" });

let publishedBundle: GameBundle | null = null;

const plainLevel = (name: string): LevelData => ({
  ...makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  ),
  name,
});

/** The music trigger's own label — the only place the current track is named. */
async function musicLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    const label = scene.children.list.find((c) => {
      const text = (c as { text?: string }).text;
      return typeof text === "string" && text.startsWith("Music: ");
    }) as { text?: string } | undefined;
    return label?.text ?? "";
  });
}

async function editorArea(page: Page): Promise<LevelArea> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as { level: LevelData };
    return JSON.parse(JSON.stringify(scene.level)) as LevelArea;
  });
}

/** Everything in the shared library, read through the real storage. */
async function libraryEntries(page: Page): Promise<{ id: string; name: string }[]> {
  return page.evaluate(async () => {
    const mod = (await import("/src/music/musicLibraryStorage.ts")) as {
      loadMusicLibrary(): Promise<{ id: string; name: string }[]>;
    };
    return mod.loadMusicLibrary();
  });
}

/** Every label on the open picker, in the order it draws them. */
async function pickerLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    type Listable = { list?: Listable[]; type?: string; text?: string };
    const found: string[] = [];
    const walk = (list: Listable[]) => {
      for (const child of list) {
        if (child.type === "Text" && child.text) found.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Listable[]) ?? []);
    return found;
  });
}

/** Opens the music picker and takes the named tune. */
async function pickTune(page: Page, label: string): Promise<void> {
  await clickByText(page, "Editor", await musicLabel(page));
  await clickIconWithLabel(page, "Editor", label);
}

test("a picker with nothing uploaded still offers four tunes", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Silent By Default"));

  // The state every new author is in, asserted rather than assumed — if a
  // fixture ever started seeding music, the rest of this spec would still pass
  // while testing nothing it claims to.
  expect(await libraryEntries(page)).toEqual([]);
  expect(await musicLabel(page)).toBe("Music: None ▾");

  await clickByText(page, "Editor", "Music: None ▾");
  const labels = await pickerLabels(page);
  for (const tune of ["Jolly", "Spooky", "Busy", "Calm"]) {
    expect(labels, `"${tune}" is not on offer`).toContain(tune);
  }
  // "None" stays, and stays first: silence is still a real, explicit choice,
  // not something the built-ins replace.
  expect(labels).toContain("None");
  expect(labels.indexOf("None")).toBeLessThan(labels.indexOf("Jolly"));
});

test("picking a tune names it and stores an id, with nothing added to the library", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Jolly Level"));
  await pickTune(page, "Jolly");

  await expect.poll(() => musicLabel(page)).toBe("Music: Jolly ▾");
  const area = await editorArea(page);
  // The id carries its own mood, so playback needs no catalogue lookup — the
  // property a published bundle read by a newer build depends on.
  expect(area.customMusicId).toBe("tune:jolly");
  // And nothing was uploaded. A built-in that quietly wrote itself into the
  // shared library would be carried into every bundle as a 345KB "upload".
  expect(await libraryEntries(page)).toEqual([]);
});

test("the name survives a reload, rather than going blank waiting on Drive", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, { ...plainLevel("Named Tune"), customMusicId: "tune:spooky" });

  // An uploaded track's real name lives in music.json and arrives a moment
  // later; a built-in's is in the app and must show at once. Reading it
  // immediately, with no poll, is the assertion — a `toPass` here would be
  // satisfied by exactly the late-arriving path this is checking against.
  expect(await musicLabel(page)).toBe("Music: Spooky ▾");
});

test("Test Play really renders the tune and plays it", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Plays A Tune"));
  await pickTune(page, "Busy");
  await expect.poll(() => musicLabel(page)).toBe("Music: Busy ▾");

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // The whole chain, and the step the cut-scene bug proves is worth asserting
  // separately: the id is recognised as a built-in, musicSynth renders it,
  // musicLoader registers the data URL under the shared key, and PlayScene
  // builds a Sound from it. On the cache and the Sound rather than on
  // `isPlaying`, since a suspended AudioContext decodes fine but is silent.
  await expect
    .poll(() => page.evaluate(() => window.__debugGame!.cache.audio.exists("level-custom-music")), { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { music?: { key: string } };
          return scene.music?.key ?? null;
        }),
      { timeout: 20_000 },
    )
    .toBe("level-custom-music");
});

test("a tune-only game publishes with no tracks to carry and nothing reported missing", async ({ page }) => {
  test.slow();
  await gotoApp(page);

  // Seeded directly rather than authored, so this measures the collector and
  // not the editor: a level that plays a built-in and nothing else.
  await page.evaluate(async () => {
    const storage = (await import("/src/persistence/storage.ts")) as {
      getLevelStorage(): { save(level: unknown): Promise<void> };
    };
    const now = new Date().toISOString();
    await storage.getLevelStorage().save({
      schemaVersion: 2,
      id: "lvl-1",
      name: "Tune Level",
      createdAt: now,
      updatedAt: now,
      tileSize: 32,
      width: 12,
      height: 8,
      layers: { ground: Array.from({ length: 8 }, (_, y) => Array.from({ length: 12 }, () => (y === 6 ? 0 : -1))) },
      entities: [
        { type: "player-spawn", x: 1, y: 5 },
        { type: "goal", x: 9, y: 5 },
      ],
      customMusicId: "tune:calm",
    });
  });
  await seedWorlds(page, [makeWorld("w1", "World One", ["lvl-1"])]);

  await clickByText(page, "Menu", "Game Maker");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameMaker"));
  await page.getByPlaceholder("Grampa's Quest").fill("Quiet Quest");
  await page.getByPlaceholder("Grampa's Quest").press("Enter");
  await clickByText(page, "GameMaker", "Add");

  await clickByText(page, "GameMaker", "Publish…");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Publish"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickByText(page, "Publish", "Download"),
  ]);
  const bundle = JSON.parse(readFileSync((await download.path())!, "utf8")) as GameBundle;

  // The level travels with its choice intact...
  expect(bundle.levels.map((l) => l.customMusicId)).toEqual(["tune:calm"]);
  // ...and the bundle carries no audio, because there is none to carry: a tune
  // is a mood and a seed, rebuilt on the other side. Four 345KB WAVs in every
  // published file is the cost of getting this wrong in the other direction.
  expect(bundle.music).toEqual([]);

  // And no complaint. Before `referencedMusicIds` learned to skip built-ins
  // this said "An uploaded track is missing (tune:calm); those areas play
  // silently." about a level that plays perfectly.
  const status = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Publish") as unknown as { status: string };
    return scene.status;
  });
  expect(status).not.toContain("missing");
  expect(status).toMatch(/^Saved 1 world, 1 level, /);

  publishedBundle = bundle;
});

test("a visitor with nothing plays the tune, rebuilt from a bundle carrying no audio", async ({ browser }) => {
  test.slow();
  expect(publishedBundle, "the publish test must run first").not.toBeNull();
  const bundle = publishedBundle!;

  /**
   * **A context of its own, and that is the whole test.** `route` handlers and
   * `addInitScript` survive navigation, so reusing the authoring page would
   * leave the mocked Drive and the seeded profile installed — and a tune that
   * was secretly still reading the library would pass anyway. Here there is no
   * Drive, no token and no profile; anything that plays came from the file, and
   * the file has `music: []`.
   */
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.addInitScript(() => localStorage.clear());
    await page.route("**/game.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundle) }),
    );
    await page.goto("/");
    await waitForGame(page);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("GameTitle"), undefined, { timeout: 20_000 });

    await clickByText(page, "GameTitle", "Play ▶");
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldMap"));

    // The one open node on the map — the level that picked "Calm".
    const node = await page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("WorldMap");
      for (const child of scene.children.list) {
        const o = child as unknown as { type?: string; radius?: number; x?: number; y?: number };
        if (o.type === "Arc" && o.radius === 18) return { x: o.x!, y: o.y! };
      }
      return null;
    });
    expect(node, "no level node on the published map").not.toBeNull();
    const point = await page.evaluate(
      ({ x, y }) => {
        const game = window.__debugGame!;
        const rect = game.canvas.getBoundingClientRect();
        const scale = game.scale.displayScale;
        return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
      },
      node!,
    );
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

    // The end of the chain the whole design exists for: the bundle carried no
    // audio at all, and the tune is here anyway because `tune:calm` is a mood
    // and a seed that musicSynth rebuilds on this machine. A published game
    // with four WAVs in it would be the same feature and a far worse link.
    expect(bundle.music).toEqual([]);
    await expect
      .poll(() => page.evaluate(() => window.__debugGame!.cache.audio.exists("level-custom-music")), {
        timeout: 20_000,
      })
      .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const scene = window.__debugGame!.scene.getScene("Play") as unknown as { music?: { key: string } };
            return scene.music?.key ?? null;
          }),
        { timeout: 20_000 },
      )
      .toBe("level-custom-music");
  } finally {
    await context.close();
  }
});
