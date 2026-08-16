import { getAccessToken } from "../drive/googleAuth";
import { createFile, ensureAppFolder, findFileByName, getFileContent, listFiles, trashFile, updateFileContent } from "../drive/driveClient";
import { deserializeLevel, serializeLevel } from "../level/LevelSerializer";
import { LevelData, LevelSummary } from "../level/LevelSchema";
import { loadActiveProfile } from "../profile/Profile";
import { StorageAdapter } from "./StorageAdapter";

function fileName(id: string): string {
  return `level-${id}.json`;
}

function requireProfile(): string {
  const profile = loadActiveProfile();
  if (!profile) throw new Error("No active profile — this shouldn't be reachable past ProfileGateScene");
  return profile;
}

/**
 * Drive-backed replacement for LocalStorageAdapter — see "Google Drive
 * storage & profiles" under Art in README.md for the full story. Each
 * level is its own `level-<id>.json` file (full LevelData as its content,
 * same format LevelSerializer already produced for localStorage) inside
 * the shared app folder (see driveClient.ensureAppFolder), tagged with
 * Drive's private `appProperties` — `{kind:"level", profile, levelId,
 * name, updatedAt}` — so `list()` can build LevelSummary rows straight
 * from that per-file metadata without downloading every file's full
 * content just to show a name and a timestamp.
 *
 * Every level in the shared folder is visible to every profile at the
 * Drive-permissions level (there's only one signed-in Google account
 * behind all three — see googleAuth.ts) — `profile` in appProperties is
 * what `list()` filters on client-side, the same "name-tag, not a
 * security boundary" scoping Profile.ts's own docstring describes.
 */
export class GoogleDriveStorageAdapter implements StorageAdapter {
  async list(): Promise<LevelSummary[]> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const profile = requireProfile();
    const files = await listFiles(token, folderId);
    return files
      .filter((f) => f.appProperties?.kind === "level" && f.appProperties?.profile === profile)
      .map((f) => ({
        id: f.appProperties!.levelId,
        name: f.appProperties!.name ?? "Untitled Level",
        updatedAt: f.appProperties!.updatedAt ?? f.modifiedTime ?? "",
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(level: LevelData): Promise<void> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const profile = requireProfile();
    const name = fileName(level.id);
    const content = serializeLevel(level);
    const appProperties = {
      kind: "level",
      profile,
      levelId: level.id,
      name: level.name,
      updatedAt: level.updatedAt,
    };

    const existing = await findFileByName(token, folderId, name);
    if (existing) await updateFileContent(token, existing.id, content, appProperties);
    else await createFile(token, folderId, name, content, appProperties);
  }

  async load(id: string): Promise<LevelData | null> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const existing = await findFileByName(token, folderId, fileName(id));
    if (!existing) return null;
    const content = await getFileContent(token, existing.id);
    return deserializeLevel(content);
  }

  async remove(id: string): Promise<void> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const existing = await findFileByName(token, folderId, fileName(id));
    if (existing) await trashFile(token, existing.id);
  }
}
