import Phaser from "phaser";
import { LevelData } from "../level/LevelSchema";

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

/**
 * Resolves to the Phaser audio cache key holding this level's uploaded
 * music, or `null` if the level has none (silence is the correct default
 * — there's no built-in fallback track the way there is for backgrounds).
 * Registers the track into the shared audio cache at runtime, since it
 * can't be preloaded by BootScene like a built-in sound — it doesn't
 * exist until a level that has one is actually opened. Skips re-loading
 * when the exact same data is already cached (repeated Test Plays of the
 * same level shouldn't re-decode the same file every time).
 */
export function resolveLevelMusicKey(scene: Phaser.Scene, level: Pick<LevelData, "customMusicData">): Promise<string | null> {
  if (!level.customMusicData) return Promise.resolve(null);
  const dataUrl = level.customMusicData;

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
    scene.load.audio(CUSTOM_MUSIC_KEY, dataUrl);
    scene.load.start();
  });
}
