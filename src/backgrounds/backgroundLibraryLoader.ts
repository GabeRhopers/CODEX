import Phaser from "phaser";
import { loadBackgroundLibrary } from "./backgroundLibraryStorage";

function backgroundThumbTextureKey(id: string): string {
  return `bg-thumb-${id}`;
}

const loadedByKey = new Map<string, string>();

function registerTexture(scene: Phaser.Scene, key: string, dataUrl: string): Promise<string> {
  if (loadedByKey.get(key) === dataUrl && scene.textures.exists(key)) {
    return Promise.resolve(key);
  }
  return new Promise((resolve) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.once(Phaser.Textures.Events.ADD_KEY + key, () => {
      loadedByKey.set(key, dataUrl);
      resolve(key);
    });
    scene.textures.addBase64(key, dataUrl);
  });
}

export interface BackgroundThumbnail {
  id: string;
  name: string;
  textureKey: string;
}

/** Registers every background in the shared library as its own thumbnail
 * texture, for the background picker submenu (see EditorUI's
 * AssetPickerMenu) — separate from gameplay/backgroundLoader.ts's
 * resolveBackgroundTextureKey, which only ever needs to register the one
 * background a level is actually showing, not the whole library at once. */
export async function resolveBackgroundThumbnails(scene: Phaser.Scene): Promise<BackgroundThumbnail[]> {
  const items = await loadBackgroundLibrary();
  const thumbnails: BackgroundThumbnail[] = [];
  for (const item of items) {
    const key = await registerTexture(scene, backgroundThumbTextureKey(item.id), item.imageData);
    thumbnails.push({ id: item.id, name: item.name, textureKey: key });
  }
  return thumbnails;
}
