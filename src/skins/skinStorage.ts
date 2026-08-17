import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { CustomSkinsFile, SkinAsset, SkinLibraryEntry } from "./CustomSkins";

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
 * As of 2026-08-16, each brush keeps a *library* of every skin ever
 * uploaded for it (see CustomSkins.ts's SkinLibraryEntry), not just the
 * one most recently uploaded — see "Skin/background/music libraries"
 * under Art for the full story, including why an upload no longer
 * silently replaces whatever was active.
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
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return normalizeSkinsFile(parsed);
  } catch {
    return {};
  }
}

/** Upgrades a file written before 2026-08-16 (one `{imageData,
 * uploadedBy, updatedAt}` record per brush, no id, no library) into the
 * current `SkinLibraryEntry` shape in memory — so an existing upload
 * keeps showing up as that brush's active skin, exactly as before,
 * instead of silently vanishing the first time this runs against
 * someone's real Drive data. Purely in-memory: the upgraded shape is
 * only ever persisted by the next real write (an upload/select/remove),
 * never written back just for having been read — cheaper and lower-risk
 * than migrating eagerly for a transform this small. An entry already in
 * the new shape (has `items`) passes through untouched. */
function normalizeSkinsFile(raw: Record<string, unknown>): CustomSkinsFile {
  const result: CustomSkinsFile = {};
  for (const [brushId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      result[brushId] = { activeId: typeof record.activeId === "string" ? record.activeId : null, items: record.items as SkinAsset[] };
    } else if (typeof record.imageData === "string") {
      const id = crypto.randomUUID();
      result[brushId] = {
        activeId: id,
        items: [{ id, imageData: record.imageData, uploadedBy: String(record.uploadedBy ?? "unknown"), updatedAt: String(record.updatedAt ?? new Date().toISOString()) }],
      };
    }
  }
  return result;
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

function entryFor(skins: CustomSkinsFile, brushId: string): SkinLibraryEntry {
  return skins[brushId] ?? { activeId: null, items: [] };
}

/** Adds a newly-uploaded skin to the brush's library and makes it the
 * active one — matches the pre-2026-08-16 behavior of an upload
 * immediately becoming visible everywhere, just without discarding
 * whatever was uploaded before it. Returns the new skin's id purely for
 * callers that want it (none currently do; resolveSkinTextureKeys is
 * what everything actually re-reads from). */
export async function addCustomSkin(brushId: string, imageData: string, uploadedBy: string): Promise<string> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  const id = crypto.randomUUID();
  const asset: SkinAsset = { id, imageData, uploadedBy, updatedAt: new Date().toISOString() };
  skins[brushId] = { activeId: id, items: [...entry.items, asset] };
  await writeCustomSkins(skins);
  return id;
}

/** Sets which of a brush's already-uploaded skins is active (`null` =
 * "use the built-in art") — the picker submenu's selection action. A
 * no-op against the last-read state if `skinId` isn't actually one of
 * this brush's items (stale UI, item removed by someone else in the
 * meantime); silently falls back to `null` rather than pointing at a
 * skin that no longer exists. */
export async function setActiveSkin(brushId: string, skinId: string | null): Promise<void> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  const resolved = skinId !== null && entry.items.some((item) => item.id === skinId) ? skinId : null;
  skins[brushId] = { ...entry, activeId: resolved };
  await writeCustomSkins(skins);
}

/** Removes one skin from a brush's library — if it was the active one,
 * the brush falls back to the built-in art (`activeId: null`) rather
 * than silently picking a different remaining skin on the uploader's
 * behalf. */
export async function removeCustomSkin(brushId: string, skinId: string): Promise<void> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  if (!entry.items.some((item) => item.id === skinId)) return;
  skins[brushId] = {
    activeId: entry.activeId === skinId ? null : entry.activeId,
    items: entry.items.filter((item) => item.id !== skinId),
  };
  await writeCustomSkins(skins);
}
