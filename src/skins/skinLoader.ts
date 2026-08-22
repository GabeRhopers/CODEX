import Phaser from "phaser";
import { CustomSkinsFile } from "./CustomSkins";
import { baseFrameOf, framePlanFor, loopLength, resolveFrame } from "./spriteFrames";
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

function frameTextureKey(targetId: string, skinId: string, frame: string): string {
  return `skin-frame-${targetId}-${skinId}-${frame}`;
}

/** Every frame of one skin, resolved to a live Phaser texture key and keyed
 * by frame name — what the runtime animates through. */
export type FrameTextureKeys = Map<string, string>;

/**
 * Registers every painted frame of `targetId`'s active skin and hands back a
 * frame-name -> texture-key map, or null when that target has no active skin
 * (the ordinary case: keep the built-in art).
 *
 * Separate from resolveSkinTextureKeys rather than folded into it because the
 * two answer different questions — that one resolves *every* brush's single
 * representative texture for the whole level build, this one resolves *one*
 * target's whole frame set. Merging them would make every level build
 * register five textures per animated skin whether or not anything on screen
 * animates.
 *
 * Frames get the same permanent-key-per-(target, skin, frame) treatment
 * activeSkinTextureKey's docstring explains at length: reusing a key across
 * skins means freeing a texture while a live GameObject still points at it,
 * which is a confirmed WebGL-loop-killing crash rather than a theoretical
 * one. Every frame having its own never-reused key keeps that guarantee.
 */
export async function resolveFrameTextureKeys(
  scene: Phaser.Scene,
  targetId: string,
): Promise<FrameTextureKeys | null> {
  const plan = framePlanFor(targetId);
  if (!plan) return null;
  const skins = await loadCustomSkins();
  const entry = skins[targetId];
  if (!entry?.activeId) return null;
  const active = entry.items.find((item) => item.id === entry.activeId);
  if (!active) return null;

  // A skin saved before multi-frame support has no `frames` at all; treat its
  // single `imageData` as the base frame so it animates as a one-frame still
  // rather than being skipped entirely.
  const painted: Record<string, string> = active.frames ?? { [baseFrameOf(plan)]: active.imageData };

  const keys: FrameTextureKeys = new Map();
  for (const name of plan.frames) {
    const dataUrl = resolveFrame(plan, painted, name);
    if (!dataUrl) continue;
    // Keyed by the frame that *supplied* the image, not the one being asked
    // for, so five poses falling back to one idle share a single texture
    // instead of registering the same PNG five times over.
    const suppliedBy = painted[name] ? name : baseFrameOf(plan);
    keys.set(name, await registerTexture(scene, frameTextureKey(targetId, active.id, suppliedBy), dataUrl));
  }
  return keys.size > 0 ? keys : null;
}

/** How many frames of an animated skin are actually painted and distinct —
 * what the runtime loops through. See spriteFrames.loopLength. */
export async function resolveLoopLength(targetId: string): Promise<number> {
  const plan = framePlanFor(targetId);
  if (!plan) return 0;
  const skins = await loadCustomSkins();
  const entry = skins[targetId];
  const active = entry?.items.find((item) => item.id === entry.activeId);
  if (!active) return 0;
  return loopLength(plan, active.frames ?? { [baseFrameOf(plan)]: active.imageData });
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
