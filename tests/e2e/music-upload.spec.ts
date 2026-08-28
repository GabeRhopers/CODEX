import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickDeleteBadgeFor, clickIconWithLabel, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";
import { failDriveWrites } from "./support/mockDrive";
import { wavBuffer } from "./support/audio";
import type { LevelArea, LevelData } from "../../src/level/LevelSchema";

/**
 * Uploading music — the last of the never-tested features.
 *
 * Four modules, hand-verified once on 2026-08-16 and never run since:
 * `musicUpload.ts` (the 4MB guard, which is the *whole* defence — audio can't be
 * re-encoded client-side the way a background image is downscaled),
 * `musicLibraryStorage.ts` (the same shared-library rework backgrounds got),
 * `musicLoader.ts` (registers the track into Phaser's audio cache at runtime),
 * and EditorScene's upload/select/delete handlers — including one documented
 * asymmetry against backgrounds: deleting a track clears the current area's own
 * reference, because there is no fallback track to land on.
 *
 * The picker's file input is unambiguous, same as for backgrounds:
 * AssetPickerMenu creates its FileInputOverlay only while a dropdown is
 * rendered and `FileInputOverlay.destroy` calls `input.remove()`, so exactly one
 * `<input type=file>` exists at a time.
 */

const TRACK_NAME = "theme.wav";
/** Short enough to keep the base64 payload small; long enough to be real audio
 * a decoder will accept. ~44KB. */
const TRACK_SECONDS = 0.25;
/** Comfortably over MAX_MUSIC_BYTES (4MB): 44100Hz stereo 16-bit is ~176KB per
 * second, so 30s is ~5.3MB. */
const OVERSIZED_SECONDS = 30;

const plainLevel = (name: string): LevelData => ({
  ...makeLevel(
    makeArea(20, 12, 9, [
      { type: "player-spawn", x: 2, y: 8 },
      { type: "goal", x: 18, y: 8 },
    ]),
  ),
  name,
});

/** The level the editor currently has open, as data. */
async function editorLevel(page: Page): Promise<LevelData> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as { level: LevelData };
    return JSON.parse(JSON.stringify(scene.level)) as LevelData;
  });
}

/** The area every picker in this spec edits. `LevelData extends LevelArea` —
 * Main *is* the level (see LevelSchema), and only Sub/Up are separate objects —
 * so this reads the level itself, matching EditorScene.area(). */
async function editorArea(page: Page): Promise<LevelArea> {
  return editorLevel(page);
}

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

async function statusText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      ui: { statusText: { text: string } };
    };
    return scene.ui.statusText.text;
  });
}

/** Everything in the shared library, read through the real storage. */
async function libraryEntries(page: Page): Promise<{ id: string; name: string; audioData: string }[]> {
  return page.evaluate(async () => {
    const mod = (await import("/src/music/musicLibraryStorage.ts")) as {
      loadMusicLibrary(): Promise<{ id: string; name: string; audioData: string }[]>;
    };
    return mod.loadMusicLibrary();
  });
}

/** Opens the Music picker and drops a file on it. `buffer` defaults to a real,
 * decodable quarter-second of silence. */
async function uploadMusic(
  page: Page,
  { name = TRACK_NAME, buffer = wavBuffer(TRACK_SECONDS) }: { name?: string; buffer?: Buffer } = {},
): Promise<void> {
  await clickByText(page, "Editor", await musicLabel(page));
  // Exactly one file input exists once a picker is open — see the file's
  // docstring. It is opacity-0 but present and enabled and listens for
  // `change`, so setInputFiles drives it with no file chooser involved.
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "audio/wav", buffer });
}

test("an upload applies to the area and is stored by reference, not by copy", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Upload"));
  expect(await musicLabel(page)).toBe("Music: None ▾");

  await uploadMusic(page);
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);
  expect(await statusText(page)).toContain("Music uploaded");

  const area = await editorArea(page);
  expect(area.customMusicId).toBeTruthy();
  // The 2026-08-16 rework: the area carries a small id, not the audio. The two
  // legacy embedded fields are the pre-rework shape and nothing writes them.
  expect(area.customMusicData).toBeUndefined();
  expect(area.customMusicName).toBeUndefined();
});

test("the track is stored byte-for-byte, unlike an uploaded background", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Verbatim"));

  const source = wavBuffer(TRACK_SECONDS);
  await uploadMusic(page, { buffer: source });
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);

  const [entry] = await libraryEntries(page);
  expect(entry.name).toBe(TRACK_NAME);
  expect(entry.audioData.startsWith("data:audio/wav;base64,")).toBe(true);

  // The deliberate contrast with customBackgroundUpload, which downscales to
  // 1600px and re-encodes as JPEG: there is no client-side transcoder for
  // audio, so what went in is exactly what is stored.
  const stored = Buffer.from(entry.audioData.split(",")[1], "base64");
  expect(stored.equals(source)).toBe(true);
});

test("a file over the limit is refused by name and nothing is written", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Too Big"));

  await uploadMusic(page, { name: "epic.wav", buffer: wavBuffer(OVERSIZED_SECONDS) });

  // MusicTooLargeError's own message, surfaced verbatim as the status line —
  // the size guard is the entire defence on this path, since an oversized track
  // can't be shrunk the way an oversized image can.
  await expect.poll(() => statusText(page)).toContain("the limit is 4MB");
  expect(await musicLabel(page)).toBe("Music: None ▾");
  expect((await editorArea(page)).customMusicId).toBeUndefined();
  // The guard runs before any Drive write, so the library never saw it.
  expect(await libraryEntries(page)).toEqual([]);
});

test("an upload that cannot be stored says so and changes nothing", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Store Fails"));
  await failDriveWrites(page);

  await uploadMusic(page);

  // "Couldn't" rather than the full sentence on purpose: the editor reports
  // "Couldn't load that file" for a *store* failure, because the read and the
  // save share one rejection handler — the same wording issue background upload
  // has. The substring keeps it free to improve.
  await expect.poll(() => statusText(page)).toContain("Couldn't");
  expect(await musicLabel(page)).toBe("Music: None ▾");
  expect((await editorArea(page)).customMusicId).toBeUndefined();
});

test("the track joins a shared library a second level can pick from", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("First Level"));
  await uploadMusic(page);
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);
  const uploadedId = (await editorArea(page)).customMusicId;

  // A different level entirely — no second upload.
  await startEditorWithLevel(page, plainLevel("Second Level"));
  expect(await musicLabel(page)).toBe("Music: None ▾");

  await clickByText(page, "Editor", "Music: None ▾");
  await clickIconWithLabel(page, "Editor", TRACK_NAME);

  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);
  expect((await editorArea(page)).customMusicId).toBe(uploadedId);
});

test("Test Play really loads and plays the uploaded track", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Plays"));
  await uploadMusic(page);
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  // The whole chain: the id resolves against the library, musicLoader registers
  // the data URL into the shared audio cache under its one key, and PlayScene
  // builds a Sound from it. Asserted on the cache and the Sound rather than on
  // `isPlaying`, since a suspended AudioContext (no user gesture yet, headless
  // or otherwise) decodes fine but wouldn't be audible.
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

test("picking None clears every music field, legacy ones included", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  // Seeded as a pre-rework level: music embedded in the level itself, no
  // library id. Nothing writes these fields anymore, so without seeding them
  // the "legacy ones included" half of this test asserts on values that were
  // never set — it passed with the clearing removed until this was added.
  await startEditorWithLevel(page, {
    ...plainLevel("Music Cleared"),
    customMusicData: "data:audio/wav;base64,UklGRiQAAABXQVZF",
    customMusicName: "old-embedded.wav",
  });
  expect(await musicLabel(page)).toBe("Music: old-embedded.wav ▾");

  // Uploading points the area at the library but leaves the legacy pair alone,
  // so all three are set by the time None is picked.
  await uploadMusic(page);
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);
  expect((await editorArea(page)).customMusicData).toBeTruthy();

  await clickByText(page, "Editor", `Music: ${TRACK_NAME} ▾`);
  await clickIconWithLabel(page, "Editor", "None");

  await expect.poll(() => musicLabel(page)).toBe("Music: None ▾");
  expect(await statusText(page)).toContain("Music removed");
  // "None" is a real, explicit state here rather than "point at nothing and
  // fall back" — there is no built-in track — so it has to clear the legacy
  // embedded pair too, or a pre-rework level would keep playing its own copy.
  const area = await editorArea(page);
  expect(area.customMusicId).toBeUndefined();
  expect(area.customMusicData).toBeUndefined();
  expect(area.customMusicName).toBeUndefined();

  // And the track is still in the library — "None" is a selection, not a delete.
  expect(await libraryEntries(page)).toHaveLength(1);
});

test("deleting a track clears the area that was still using it", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Deleted"));
  await uploadMusic(page);
  await expect.poll(() => musicLabel(page)).toBe(`Music: ${TRACK_NAME} ▾`);

  await clickByText(page, "Editor", `Music: ${TRACK_NAME} ▾`);
  await clickDeleteBadgeFor(page, "Editor", TRACK_NAME);

  await expect.poll(() => statusText(page)).toContain("Track removed");
  // The documented asymmetry against backgrounds: a deleted background leaves
  // the level pointing at nothing and backgroundLoader lands on the built-in
  // default, but there is no default *track* — so a dangling customMusicId
  // would leave the trigger naming something that no longer exists anywhere.
  await expect.poll(() => musicLabel(page)).toBe("Music: None ▾");
  expect((await editorArea(page)).customMusicId).toBeUndefined();
  expect(await libraryEntries(page)).toEqual([]);
});

test("a track that cannot be decoded falls back to silence instead of hanging", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await startEditorWithLevel(page, plainLevel("Music Corrupt"));

  // Nothing validates the *contents* of an upload — only its size — so bytes
  // that are not audio at all reach the library happily.
  await uploadMusic(page, { name: "broken.wav", buffer: Buffer.from("this is not audio at all") });
  await expect.poll(() => musicLabel(page)).toBe("Music: broken.wav ▾");
  const brokenId = (await editorArea(page)).customMusicId!;

  // Called from the *Editor* scene, which never plays level music, so nothing
  // else is loading the same cache key and this measures only musicLoader.
  //
  // Phaser emits FILE_LOAD_ERROR only when the fetch fails, and a data URL
  // never fails to fetch; a decodeAudioData failure goes through
  // File.onProcessError, which emits nothing. So before musicLoader also
  // listened for COMPLETE, this promise stayed pending forever — exactly the
  // "rather than leaving the caller's promise unresolved" its comment promised.
  const settled = await page.evaluate(async (customMusicId: string) => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    const mod = (await import("/src/gameplay/musicLoader.ts")) as {
      resolveLevelMusicKey(scene: unknown, level: { customMusicId?: string }): Promise<string | null>;
    };
    return Promise.race([
      mod.resolveLevelMusicKey(scene, { customMusicId }).then((key) => ({ settled: true, key })),
      new Promise((resolve) => setTimeout(() => resolve({ settled: false, key: null }), 8_000)),
    ]);
  }, brokenId);
  expect(settled).toEqual({ settled: true, key: null });

  // And the level itself still plays, just silently.
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome: string };
          return scene.outcome;
        }),
      { timeout: 20_000 },
    )
    .toBe("playing");
});
