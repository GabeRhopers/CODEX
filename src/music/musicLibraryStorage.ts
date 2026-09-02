import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { MusicAsset, MusicLibraryFile } from "./MusicLibrary";
import { activeBundle } from "../game/contentSource";

const MUSIC_FILE_NAME = "music.json";

/**
 * A shared, reusable pool of every track any of the 3 profiles has
 * uploaded — the music equivalent of backgrounds/backgroundLibraryStorage.ts
 * (see its docstring for the full "why a shared library, why per-level
 * selection by id instead of embedded data" reasoning; it applies here
 * unchanged). Before 2026-08-16, an uploaded track was a one-off copy
 * embedded in just the level it was uploaded into
 * (LevelData.customMusicData/customMusicName) — this file fixes the same
 * "invisible to every other level, gone if overwritten" problem
 * backgrounds had.
 */
export async function loadMusicLibrary(): Promise<MusicLibraryFile> {
  const bundle = activeBundle();
  if (bundle) return structuredClone(bundle.music);

  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const file = await findFileByName(token, folderId, MUSIC_FILE_NAME);
  if (!file) return [];
  const content = await getFileContent(token, file.id);
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content) as MusicLibraryFile;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMusicLibrary(items: MusicLibraryFile): Promise<void> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const content = JSON.stringify(items);
  const appProperties = { kind: "music" };
  const existing = await findFileByName(token, folderId, MUSIC_FILE_NAME);
  if (existing) await updateFileContent(token, existing.id, content, appProperties);
  else await createFile(token, folderId, MUSIC_FILE_NAME, content, appProperties);
}

/** Adds a newly-uploaded track to the shared library and returns its new
 * id — same "adding to the library doesn't itself change what any level
 * is playing" split as addBackgroundAsset; the caller sets the current
 * level's choice separately. */
export async function addMusicAsset(name: string, audioData: string, uploadedBy: string): Promise<string> {
  const items = await loadMusicLibrary();
  const id = crypto.randomUUID();
  const asset: MusicAsset = { id, name, audioData, uploadedBy, updatedAt: new Date().toISOString() };
  await writeMusicLibrary([...items, asset]);
  return id;
}

/** Removes a track from the shared library. A level still referencing
 * this id via `customMusicId` falls back to silence the next time it's
 * opened (see musicLoader.ts) — same trade removeBackgroundAsset makes. */
export async function removeMusicAsset(id: string): Promise<void> {
  const items = await loadMusicLibrary();
  if (!items.some((item) => item.id === id)) return;
  await writeMusicLibrary(items.filter((item) => item.id !== id));
}
