import Phaser from "phaser";
import { LevelData } from "../level/LevelSchema";
import { loadMusicLibrary } from "../music/musicLibraryStorage";

/** Every scene that might play a level's uploaded music reuses this one
 * cache key — only one level's music is ever playing at a time, and
 * unlike StaticBackground (see backgroundLoader.ts), nothing here needs
 * to worry about a paused-but-alive EditorScene still referencing the old
 * entry: the editor itself never plays level music (only Test Play /
 * actual Play do — see PlayScene), and PlayScene always stops and
 * destroys its own Sound object on scene shutdown before a new one is
 * ever created, so there's no concurrent live reference to protect. */
const CUSTOM_MUSIC_KEY = "level-custom-music";

let loadedMusicDataUrl: string | null = null;

function loadCustomAudio(scene: Phaser.Scene, dataUrl: string): Promise<string | null> {
  if (loadedMusicDataUrl === dataUrl && scene.cache.audio.exists(CUSTOM_MUSIC_KEY)) {
    return Promise.resolve(CUSTOM_MUSIC_KEY);
  }
  return new Promise((resolve) => {
    if (scene.cache.audio.exists(CUSTOM_MUSIC_KEY)) {
      scene.cache.audio.remove(CUSTOM_MUSIC_KEY);
    }
    scene.load.once(`filecomplete-audio-${CUSTOM_MUSIC_KEY}`, () => {
      loadedMusicDataUrl = dataUrl;
      resolve(CUSTOM_MUSIC_KEY);
    });
    // A corrupted/undecodable upload shouldn't break Play — fall back to
    // silence rather than leaving the caller's promise unresolved.
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => resolve(null));
    // FILE_LOAD_ERROR alone doesn't actually deliver that, though, for the one
    // input this path ever gets: Phaser emits it only when the *fetch* fails,
    // and a data URL never fails to fetch. Audio that downloads fine and then
    // fails decodeAudioData goes through File.onProcessError, which logs and
    // emits nothing at all — so without this the promise stayed pending
    // forever. COMPLETE fires once the queue drains either way, and "the key
    // never reached the cache" is the failure.
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (!scene.cache.audio.exists(CUSTOM_MUSIC_KEY)) resolve(null);
    });
    scene.load.audio(CUSTOM_MUSIC_KEY, dataUrl);
    scene.load.start();
  });
}

/**
 * Resolves to the Phaser audio cache key holding this level's uploaded
 * music, or `null` if the level has none (silence is the correct default
 * — there's no built-in fallback track the way there is for backgrounds).
 * Registers the track into the shared audio cache at runtime, since it
 * can't be preloaded by BootScene like a built-in sound — it doesn't
 * exist until a level that has one is actually opened.
 *
 * As of 2026-08-16, primarily resolves via `customMusicId` — a reference
 * into the shared music library (see music/musicLibraryStorage.ts) rather
 * than audio embedded in the level itself. `customMusicData` (the old,
 * pre-library embedded copy) is still checked as a fallback so a level
 * saved before this migration keeps playing its own track without needing
 * to be re-uploaded. Skips re-loading when the exact same data is already
 * cached (repeated Test Plays of the same level shouldn't re-decode the
 * same file every time).
 */
export async function resolveLevelMusicKey(
  scene: Phaser.Scene,
  level: Pick<LevelData, "customMusicId" | "customMusicData">,
): Promise<string | null> {
  if (level.customMusicId) {
    const library = await loadMusicLibrary();
    const asset = library.find((item) => item.id === level.customMusicId);
    if (asset) return loadCustomAudio(scene, asset.audioData);
  }
  if (level.customMusicData) return loadCustomAudio(scene, level.customMusicData);
  return null;
}
