import Phaser from "phaser";
import { loadCustomSkins } from "./skinStorage";

function skinTextureKey(brushId: string): string {
  return `skin-${brushId}`;
}

/** Which data URL is currently registered under each skin's texture key —
 * mirrors backgroundLoader.ts's loadedCustomDataUrl (see its docstring
 * for why this matters: scene.textures is the *game's* shared
 * TextureManager, and EditorScene/PlayScene can be alive at the same
 * time during Test Play, so blindly remove-and-recreating on every
 * resolve risks destroying a texture a still-alive GameObject is
 * actively rendering). Keyed by brush id, not texture key, since that's
 * what every caller here keys by too. */
const loadedByBrushId = new Map<string, string>();

function registerSkinTexture(scene: Phaser.Scene, brushId: string, dataUrl: string): Promise<string> {
  const key = skinTextureKey(brushId);
  if (loadedByBrushId.get(brushId) === dataUrl && scene.textures.exists(key)) {
    return Promise.resolve(key);
  }
  return new Promise((resolve) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.once(Phaser.Textures.Events.ADD_KEY + key, () => {
      loadedByBrushId.set(brushId, dataUrl);
      resolve(key);
    });
    scene.textures.addBase64(key, dataUrl);
  });
}

/**
 * Loads every currently-uploaded custom skin (see skinStorage.ts) and
 * registers each as its own `skin-<brushId>` Phaser texture, returning a
 * brushId -> textureKey map for whichever ones are actually in use right
 * now. Deliberately a separate key per skin rather than overwriting a
 * brush's *built-in* texture key in place: several built-in textures
 * (e.g. "enemy-ghost-pillow") are also reused as pure decoration
 * elsewhere (MenuScene's home-page icons) that has nothing to do with
 * level content and shouldn't silently change just because someone
 * reskinned the Ghost enemy for gameplay.
 */
export async function resolveSkinTextureKeys(scene: Phaser.Scene): Promise<Map<string, string>> {
  const skins = await loadCustomSkins();
  const result = new Map<string, string>();
  for (const [brushId, record] of Object.entries(skins)) {
    const key = await registerSkinTexture(scene, brushId, record.imageData);
    result.set(brushId, key);
  }
  return result;
}
