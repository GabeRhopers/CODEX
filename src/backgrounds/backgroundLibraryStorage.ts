import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { BackgroundAsset, BackgroundLibraryFile } from "./BackgroundLibrary";
import { activeBundle } from "../game/contentSource";
import { parseAssetList } from "../persistence/assetLibrary";

const BACKGROUNDS_FILE_NAME = "backgrounds.json";

/**
 * A shared, reusable pool of every custom background image any of the 3
 * profiles has uploaded — the same "upload once, pick from a thumbnail
 * submenu anywhere" treatment skins.json already had (see
 * skins/skinStorage.ts's docstring for why skins aren't profile-scoped;
 * same reasoning applies here). Before 2026-08-16, an uploaded background
 * was a one-off copy embedded in just the level it was uploaded into
 * (LevelData.customBackgroundData) — invisible to every other level and
 * every other profile, and gone forever if that level's upload was
 * overwritten. This file fixes both: one Drive read resolves the whole
 * library (for the picker submenu's thumbnails), and *which* entry a
 * level uses is stored on the level as a small id reference
 * (LevelData.customBackgroundId) rather than the image data itself — see
 * backgroundLoader.ts for how an id becomes a Phaser texture.
 */
export async function loadBackgroundLibrary(): Promise<BackgroundLibraryFile> {
  const bundle = activeBundle();
  if (bundle) return structuredClone(bundle.backgrounds);

  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const file = await findFileByName(token, folderId, BACKGROUNDS_FILE_NAME);
  if (!file) return [];
  const content = await getFileContent(token, file.id);
  if (!content.trim()) return [];
  try {
    // Every entry checked, not just "is this a list" — an upload with no
    // imageData used to travel all the way to a texture registration, and via
    // collectBundle.ts into published games. See persistence/assetLibrary.ts.
    return parseAssetList<BackgroundAsset>(JSON.parse(content), "imageData");
  } catch {
    return [];
  }
}

async function writeBackgroundLibrary(items: BackgroundLibraryFile): Promise<void> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const content = JSON.stringify(items);
  const appProperties = { kind: "backgrounds" };
  const existing = await findFileByName(token, folderId, BACKGROUNDS_FILE_NAME);
  if (existing) await updateFileContent(token, existing.id, content, appProperties);
  else await createFile(token, folderId, BACKGROUNDS_FILE_NAME, content, appProperties);
}

/** Adds a newly-uploaded background to the shared library and returns its
 * new id — the caller (EditorScene) is responsible for then setting that
 * id as the *current level's* choice; adding to the library doesn't
 * itself change what any level is showing. */
export async function addBackgroundAsset(name: string, imageData: string, uploadedBy: string): Promise<string> {
  const items = await loadBackgroundLibrary();
  const id = crypto.randomUUID();
  const asset: BackgroundAsset = { id, name, imageData, uploadedBy, updatedAt: new Date().toISOString() };
  await writeBackgroundLibrary([...items, asset]);
  return id;
}

/** Removes a background from the shared library. Any level still
 * referencing this id by `customBackgroundId` falls back to the default
 * built-in the next time it's opened (see backgroundLoader.ts) — the same
 * "a removed skin reverts affected brushes to their built-in art" trade
 * skins.json's removeCustomSkin makes, not a special case here. */
export async function removeBackgroundAsset(id: string): Promise<void> {
  const items = await loadBackgroundLibrary();
  if (!items.some((item) => item.id === id)) return;
  await writeBackgroundLibrary(items.filter((item) => item.id !== id));
}
