import { getAccessToken } from "../drive/googleAuth";
import { createFile, ensureAppFolder, findFileByName, getFileContent, listFiles, trashFile, updateFileContent } from "../drive/driveClient";
import { loadActiveProfile } from "../profile/Profile";
import { WorldStorageAdapter } from "./WorldStorageAdapter";
import { WorldData, WorldSummary } from "../world/WorldSchema";

function fileName(id: string): string {
  return `world-${id}.json`;
}

function requireProfile(): string {
  const profile = loadActiveProfile();
  if (!profile) throw new Error("No active profile — this shouldn't be reachable past ProfileGateScene");
  return profile;
}

/** Drive-backed replacement for LocalWorldStorageAdapter — same file-per-
 * record/appProperties-tagged pattern as GoogleDriveStorageAdapter (see
 * its docstring), sharing the same app folder with `world-<id>.json`
 * names instead of `level-<id>.json` so both kinds coexist there without
 * colliding. */
export class GoogleDriveWorldStorageAdapter implements WorldStorageAdapter {
  async list(): Promise<WorldSummary[]> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const profile = requireProfile();
    const files = await listFiles(token, folderId);
    return files
      .filter((f) => f.appProperties?.kind === "world" && f.appProperties?.profile === profile)
      .map((f) => ({
        id: f.appProperties!.worldId,
        name: f.appProperties!.name ?? "Untitled World",
        levelCount: Number(f.appProperties!.levelCount ?? "0"),
        updatedAt: f.appProperties!.updatedAt ?? f.modifiedTime ?? "",
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(world: WorldData): Promise<void> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const profile = requireProfile();
    const name = fileName(world.id);
    const content = JSON.stringify(world);
    const appProperties = {
      kind: "world",
      profile,
      worldId: world.id,
      name: world.name,
      levelCount: String(world.levelIds.length),
      updatedAt: world.updatedAt,
    };

    const existing = await findFileByName(token, folderId, name);
    if (existing) await updateFileContent(token, existing.id, content, appProperties);
    else await createFile(token, folderId, name, content, appProperties);
  }

  async load(id: string): Promise<WorldData | null> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const existing = await findFileByName(token, folderId, fileName(id));
    if (!existing) return null;
    const content = await getFileContent(token, existing.id);
    return JSON.parse(content) as WorldData;
  }

  async remove(id: string): Promise<void> {
    const token = await getAccessToken();
    const folderId = await ensureAppFolder(token);
    const existing = await findFileByName(token, folderId, fileName(id));
    if (existing) await trashFile(token, existing.id);
  }
}
