import Phaser from "phaser";
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
 * Resolves which texture key `StaticBackground` should render for this
 * level — synchronous (well, immediately-resolving) for every built-in
 * background, since BootScene already preloaded it, or a genuine async
 * texture registration for a user-uploaded "custom" one, which doesn't
 * exist until the moment a level that references it is actually opened
 * (EditorScene.create / PlayScene.create), unlike everything BootScene
 * preloads up front. Falls back to the default built-in if the level
 * claims "custom" but has no usable image data (an old save from before
 * this existed, or a corrupted/cleared bit of storage) — same spirit as
 * `resolveStaticBackground`'s own fallback for an unknown built-in id.
 */
export function resolveBackgroundTextureKey(
  scene: Phaser.Scene,
  level: Pick<LevelData, "background" | "customBackgroundData">,
): Promise<string> {
  const id = resolveStaticBackground(level);
  if (id === "custom") {
    if (level.customBackgroundData) return loadCustomTexture(scene, level.customBackgroundData);
    return Promise.resolve(staticBackgroundDef(DEFAULT_STATIC_BACKGROUND).textureKey);
  }
  return Promise.resolve(staticBackgroundDef(id).textureKey);
}
