import Phaser from "phaser";
import { loadBackgroundLibrary } from "../backgrounds/backgroundLibraryStorage";
import { LevelData } from "../level/LevelSchema";
import { DEFAULT_STATIC_BACKGROUND, resolveStaticBackground, staticBackgroundDef } from "../level/staticBackgrounds";

/** Every scene that might show a user-uploaded background reuses this one
 * texture key — only one level is open per scene instance, so there's no
 * need to key it per-level. Must be `remove`d before being re-added on a
 * different image, since Phaser's TextureManager won't overwrite an
 * existing key in place. */
const CUSTOM_BACKGROUND_TEXTURE_KEY = "bg-static-custom";

/** `scene.textures` is the *game's* TextureManager, shared by every
 * scene — not a per-scene one. Test Play launches PlayScene on top of a
 * merely-*paused* (not stopped) EditorScene, so both are alive with live
 * GameObjects at the same time, and both call `resolveBackgroundTextureKey`
 * for the exact same level (a clone), i.e. the exact same image data. If
 * that second call always removed-and-recreated the texture, it would
 * destroy the very GPU resource EditorScene's still-alive (just paused)
 * background Image is actively rendering out from under it — a real crash
 * reproduced during this feature's own testing ("Cannot read properties of
 * null (reading 'glTexture')"), not a hypothetical one. Tracking which data
 * URL is currently loaded under the shared key lets an unchanged image
 * (by far the common case — most opens of a custom-background level don't
 * change it) skip the destructive path entirely. */
let loadedCustomDataUrl: string | null = null;

function loadCustomTexture(scene: Phaser.Scene, dataUrl: string): Promise<string> {
  if (loadedCustomDataUrl === dataUrl && scene.textures.exists(CUSTOM_BACKGROUND_TEXTURE_KEY)) {
    return Promise.resolve(CUSTOM_BACKGROUND_TEXTURE_KEY);
  }
  return new Promise((resolve) => {
    if (scene.textures.exists(CUSTOM_BACKGROUND_TEXTURE_KEY)) {
      scene.textures.remove(CUSTOM_BACKGROUND_TEXTURE_KEY);
    }
    scene.textures.once(Phaser.Textures.Events.ADD_KEY + CUSTOM_BACKGROUND_TEXTURE_KEY, () => {
      loadedCustomDataUrl = dataUrl;
      resolve(CUSTOM_BACKGROUND_TEXTURE_KEY);
    });
    scene.textures.addBase64(CUSTOM_BACKGROUND_TEXTURE_KEY, dataUrl);
  });
}

/**
 * One library image, under a key of its own.
 *
 * Deliberately *not* the shared `CUSTOM_BACKGROUND_TEXTURE_KEY` above. That key
 * is right for a level, where exactly one custom background is on screen at a
 * time; a cut scene shows several pictures in sequence, and a single shared key
 * would mean removing and re-adding a texture on every panel turn — the exact
 * destructive path the comment above documents crashing on. Keyed per asset id
 * instead: nothing is ever removed, panels can flip back and forth freely, and
 * a level's background and a cut scene's picture never contend for one key even
 * when they are the same image.
 *
 * Returns null when the id names nothing — a picture deleted from the library
 * after a panel referenced it. The panel then shows its words on the plain
 * backdrop, which is the same "fall back rather than fail" stance
 * `resolveBackgroundTextureKey` takes below.
 */
export async function loadLibraryImageTexture(scene: Phaser.Scene, assetId: string): Promise<string | null> {
  const key = `cutscene-bg-${assetId}`;
  if (scene.textures.exists(key)) return key;
  const library = await loadBackgroundLibrary();
  const asset = library.find((item) => item.id === assetId);
  if (!asset) return null;
  // Re-checked after the await: two panels naming the same picture can both be
  // in flight, and addBase64 on an existing key is the destructive path.
  if (scene.textures.exists(key)) return key;
  return new Promise((resolve) => {
    scene.textures.once(Phaser.Textures.Events.ADD_KEY + key, () => resolve(key));
    scene.textures.addBase64(key, asset.imageData);
  });
}

/**
 * Resolves which texture key `StaticBackground` should render for this
 * level — synchronous (well, immediately-resolving) for every built-in
 * background, since BootScene already preloaded it, or a genuine async
 * texture registration for a user-uploaded "custom" one, which doesn't
 * exist until the moment a level that references it is actually opened
 * (EditorScene.create / PlayScene.create), unlike everything BootScene
 * preloads up front.
 *
 * As of 2026-08-16, a "custom" level primarily resolves via
 * `customBackgroundId` — a reference into the shared background library
 * (see backgrounds/backgroundLibraryStorage.ts) rather than image data
 * embedded in the level itself. `customBackgroundData` (the old, pre-
 * library embedded copy) is still checked as a fallback so a level saved
 * before this migration keeps rendering its own background without
 * needing to be re-uploaded. Falls back to the default built-in if the
 * level claims "custom" but has neither a valid library id nor legacy
 * inline data (an old save from before either existed, a since-removed
 * library entry, or corrupted/cleared storage) — same spirit as
 * `resolveStaticBackground`'s own fallback for an unknown built-in id.
 */
export async function resolveBackgroundTextureKey(
  scene: Phaser.Scene,
  level: Pick<LevelData, "background" | "customBackgroundId" | "customBackgroundData">,
): Promise<string> {
  const id = resolveStaticBackground(level);
  if (id === "custom") {
    if (level.customBackgroundId) {
      const library = await loadBackgroundLibrary();
      const asset = library.find((item) => item.id === level.customBackgroundId);
      if (asset) return loadCustomTexture(scene, asset.imageData);
    }
    if (level.customBackgroundData) return loadCustomTexture(scene, level.customBackgroundData);
    return staticBackgroundDef(DEFAULT_STATIC_BACKGROUND).textureKey;
  }
  return staticBackgroundDef(id).textureKey;
}
