import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { CustomSkinsFile } from "./CustomSkins";

const SKINS_FILE_NAME = "skins.json";

/**
 * Custom skins are the one piece of this app's Drive data deliberately
 * NOT scoped to a profile (see Profile.ts's docstring on the 3 profiles
 * being a filter, not an access boundary, and README's "Google Drive
 * storage & profiles" for why levels/worlds ARE scoped) — a skin
 * uploaded by any of the 3 people should show up for all of them,
 * everywhere that type is placed, in every level, immediately. All
 * skins live in one consolidated `skins.json` file (not one Drive file
 * per skin) keyed by Brush id: with only ~20-something skinnable
 * brushes total, resolving every skin needed to render the palette or a
 * level is one Drive read instead of N, and uploading one is a single
 * read-modify-write instead of "list, then find, then create-or-update."
 *
 * Known, accepted limitation: uploading two different skins at the exact
 * same moment from two different browser tabs/profiles could lose one —
 * the second write's read-modify-write starts from a snapshot that
 * doesn't yet include the first. Not worth real optimistic-concurrency
 * handling for a 3-person household's occasional skin uploads.
 */
export async function loadCustomSkins(): Promise<CustomSkinsFile> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const file = await findFileByName(token, folderId, SKINS_FILE_NAME);
  if (!file) return {};
  const content = await getFileContent(token, file.id);
  if (!content.trim()) return {};
  try {
    return JSON.parse(content) as CustomSkinsFile;
  } catch {
    return {};
  }
}

async function writeCustomSkins(skins: CustomSkinsFile): Promise<void> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const content = JSON.stringify(skins);
  const appProperties = { kind: "skins" };
  const existing = await findFileByName(token, folderId, SKINS_FILE_NAME);
  if (existing) await updateFileContent(token, existing.id, content, appProperties);
  else await createFile(token, folderId, SKINS_FILE_NAME, content, appProperties);
}

export async function saveCustomSkin(brushId: string, imageData: string, uploadedBy: string): Promise<void> {
  const skins = await loadCustomSkins();
  skins[brushId] = { imageData, uploadedBy, updatedAt: new Date().toISOString() };
  await writeCustomSkins(skins);
}

export async function removeCustomSkin(brushId: string): Promise<void> {
  const skins = await loadCustomSkins();
  if (!(brushId in skins)) return;
  delete skins[brushId];
  await writeCustomSkins(skins);
}
