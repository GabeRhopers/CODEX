import Phaser from "phaser";
import { CustomSkinsFile } from "./CustomSkins";
import { loadCustomSkins } from "./skinStorage";

/** Keyed by (brushId, skinId) — a skin's own uploaded imageData never
 * changes once it exists (there's no "edit" flow, only upload/delete), so
 * unlike backgroundLoader.ts's single reused CUSTOM_BACKGROUND_TEXTURE_KEY
 * (one level's currently-showing background at a time, genuinely swapped
 * in place), every skin ever made active in this session can keep its own
 * permanent key rather than fighting over one shared "skin-<brushId>" slot.
 * That's deliberate, not just convenient: reusing one key across different
 * skins would mean switching which skin is active has to `remove()` the
 * previous data before the new image finishes decoding (addBase64 is
 * async), leaving a window where any GameObject still rendering with the
 * old key — the palette icon, a placed entity — points at a just-freed GPU
 * texture. Confirmed during this feature's own testing: that's not a
 * theoretical race, it's a guaranteed crash ("Cannot read properties of
 * null (reading 'glTexture')") that kills the whole WebGL render loop, not
 * just that one icon. Giving every skin its own never-reused key (same
 * trick the thumbnail keys below already used, now extended to the active
 * key too) sidesteps the whole problem: switching skins just means a
 * different, already-safe key, never destroying one a live GameObject
 * still needs. */
function activeSkinTextureKey(brushId: string, skinId: string): string {
  return `skin-active-${brushId}-${skinId}`;
}

function skinThumbTextureKey(brushId: string, skinId: string): string {
  return `skin-thumb-${brushId}-${skinId}`;
}

/** Which data URL is currently registered under each key — guards against
 * redundant re-registration (and, since every key here is permanent per
 * (brushId, skinId) — see activeSkinTextureKey's docstring — redundant is
 * the *only* case `scene.textures.exists(key)` should ever find something
 * already there for a different dataUrl; the `remove()` below is purely
 * defensive for that shouldn't-happen case, not a normal code path the way
 * it was before every active key was made permanent). Shared by both
 * registerTexture call sites below (active skins and picker thumbnails). */
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

/**
 * Loads every brush's *active* custom skin (see skinStorage.ts's
 * SkinLibraryEntry — a brush can have several uploaded, only one applied
 * at a time) and registers it as a `skin-<brushId>` Phaser texture,
 * returning a brushId -> textureKey map for whichever ones are actually
 * active right now. Deliberately a separate key per skin rather than
 * overwriting a brush's *built-in* texture key in place: several built-in
 * textures (e.g. "enemy-ghost-pillow") are also reused as pure decoration
 * elsewhere (MenuScene's home-page icons) that has nothing to do with
 * level content and shouldn't silently change just because someone
 * reskinned the Ghost enemy for gameplay. Same return shape as before the
 * 2026-08-16 multi-skin-library change, so every existing consumer
 * (EntityPlacer, PlayScene) needed zero changes — only *how* the active
 * skin is chosen changed, not what gets handed back.
 */
export async function resolveSkinTextureKeys(scene: Phaser.Scene): Promise<Map<string, string>> {
  const skins = await loadCustomSkins();
  const result = new Map<string, string>();
  for (const [brushId, entry] of Object.entries(skins)) {
    if (!entry.activeId) continue;
    const active = entry.items.find((item) => item.id === entry.activeId);
    if (!active) continue;
    const key = await registerTexture(scene, activeSkinTextureKey(brushId, active.id), active.imageData);
    result.set(brushId, key);
  }
  return result;
}

/** One thumbnail-sized entry for a brush's skin picker submenu. */
export interface SkinThumbnail {
  id: string;
  textureKey: string;
}

/**
 * Registers every one of a *single* brush's uploaded skins as its own
 * thumbnail texture and returns their ids/keys, for the skin picker
 * submenu (see EditorUI's AssetPickerMenu) — scoped to one brush rather
 * than resolving the whole library like resolveSkinTextureKeys above,
 * since the picker only ever shows one brush's skins at a time (whichever
 * one is currently selected in the palette).
 */
export async function resolveSkinThumbnails(scene: Phaser.Scene, brushId: string): Promise<SkinThumbnail[]> {
  const skins = await loadCustomSkins();
  const entry = skins[brushId];
  if (!entry) return [];
  const thumbnails: SkinThumbnail[] = [];
  for (const item of entry.items) {
    const key = await registerTexture(scene, skinThumbTextureKey(brushId, item.id), item.imageData);
    thumbnails.push({ id: item.id, textureKey: key });
  }
  return thumbnails;
}

/** Which skin (if any) is currently active for one brush — the picker
 * submenu needs this to highlight the right thumbnail; separate from
 * resolveSkinTextureKeys (which only reports brushes that *have* an
 * active skin) since the picker also needs to distinguish "nothing
 * active" from "brush not in the file at all," and needs it for whichever
 * single brush is selected without re-resolving every brush's texture. */
export async function loadActiveSkinId(brushId: string): Promise<string | null> {
  const skins: CustomSkinsFile = await loadCustomSkins();
  return skins[brushId]?.activeId ?? null;
}
