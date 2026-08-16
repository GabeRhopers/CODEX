import { APP_FOLDER_NAME, DRIVE_ROOT_FOLDER_ID, LEGACY_APP_FOLDER_NAMES } from "../config/googleDrive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const BOUNDARY = "rhopers-game-maker-boundary";

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  /** Private-to-this-app metadata (Drive's `appProperties`, distinct from
   * `properties` which any app with access could read) — this is where
   * profile/kind/id tagging lives, see GoogleDriveStorageAdapter. */
  appProperties?: Record<string, string>;
}

class DriveApiError extends Error {}

/** Every Drive REST call funnels through here so the "explain *why* it
 * failed" logic (auth expired vs. genuinely offline vs. Drive's own error
 * body) only exists once. */
async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      // response body wasn't JSON (or was empty) — fall through with just the status
    }
    throw new DriveApiError(`Drive request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return res;
}

/** Drive query strings quote string literals with single quotes; embedded
 * `\` and `'` need backslash-escaping. None of this app's own inputs
 * (APP_FOLDER_NAME, `level-<uuid>.json`) actually contain either
 * character, but escaping defensively costs nothing and avoids a subtle
 * future bug if that ever changes. */
function escapeForQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

let cachedAppFolderId: string | null = null;
// GoogleDriveStorageAdapter and GoogleDriveWorldStorageAdapter both call
// ensureAppFolder, and MenuScene kicks off a levelStorage.list() and a
// worldStorage.list() back to back without awaiting either — without
// caching the in-flight search-or-create promise itself (not just its
// eventual result), both calls would race past the "does it exist yet"
// check before either had cached an answer, each conclude "no" and create
// their own folder. Confirmed with a mocked Drive backend during
// development: two "Rhopers Game Maker" folders got created from a single
// page load before this existed.
let appFolderPromise: Promise<string> | null = null;

/** Finds (or, on first connect, creates) the dedicated subfolder this
 * app's files live in inside the project owner's shared Drive folder —
 * see googleDrive.ts's docstring on DRIVE_ROOT_FOLDER_ID for why a
 * subfolder rather than using that folder directly. Cached in memory per
 * page load; re-resolving costs one extra list call at worst, never a
 * correctness problem. */
export function ensureAppFolder(token: string): Promise<string> {
  if (cachedAppFolderId) return Promise.resolve(cachedAppFolderId);
  if (!appFolderPromise) appFolderPromise = resolveAppFolder(token);
  return appFolderPromise;
}

async function findFolderId(token: string, name: string): Promise<string | null> {
  const q = `name='${escapeForQuery(name)}' and '${DRIVE_ROOT_FOLDER_ID}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const listRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}`,
  );
  const listed = (await listRes.json()) as { files: { id: string }[] };
  return listed.files[0]?.id ?? null;
}

async function resolveAppFolder(token: string): Promise<string> {
  const currentId = await findFolderId(token, APP_FOLDER_NAME);
  if (currentId) {
    cachedAppFolderId = currentId;
    return currentId;
  }

  // Not found under the current name — check every earlier name this
  // folder has shipped under (see LEGACY_APP_FOLDER_NAMES) before assuming
  // this is a genuine first-time connect. A match gets renamed in place
  // (same folder id, so every level/world file inside it stays put)
  // rather than silently creating a second, empty folder and stranding
  // everything already saved under the old name.
  for (const legacyName of LEGACY_APP_FOLDER_NAMES) {
    const legacyId = await findFolderId(token, legacyName);
    if (legacyId) {
      await driveFetch(token, `${DRIVE_API}/files/${legacyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: APP_FOLDER_NAME }),
      });
      cachedAppFolderId = legacyId;
      return legacyId;
    }
  }

  const createRes = await driveFetch(token, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME, parents: [DRIVE_ROOT_FOLDER_ID] }),
  });
  const created = (await createRes.json()) as { id: string };
  cachedAppFolderId = created.id;
  return cachedAppFolderId;
}

export async function findFileByName(token: string, folderId: string, name: string): Promise<DriveFileMeta | null> {
  const q = `name='${escapeForQuery(name)}' and '${folderId}' in parents and trashed=false`;
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name,modifiedTime,appProperties)")}`,
  );
  const body = (await res.json()) as { files: DriveFileMeta[] };
  return body.files[0] ?? null;
}

export async function listFiles(token: string, folderId: string): Promise<DriveFileMeta[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=${encodeURIComponent("files(id,name,modifiedTime,appProperties)")}`,
  );
  const body = (await res.json()) as { files: DriveFileMeta[] };
  return body.files;
}

function buildMultipartBody(metadata: unknown, content: string): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--`
  );
}

export async function createFile(
  token: string,
  folderId: string,
  name: string,
  content: string,
  appProperties: Record<string, string>,
): Promise<DriveFileMeta> {
  const metadata = { name, parents: [folderId], mimeType: "application/json", appProperties };
  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent("id,name,modifiedTime,appProperties")}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${BOUNDARY}` },
      body: buildMultipartBody(metadata, content),
    },
  );
  return (await res.json()) as DriveFileMeta;
}

export async function updateFileContent(
  token: string,
  fileId: string,
  content: string,
  appProperties: Record<string, string>,
): Promise<void> {
  const metadata = { appProperties };
  await driveFetch(token, `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=multipart`, {
    method: "PATCH",
    headers: { "Content-Type": `multipart/related; boundary=${BOUNDARY}` },
    body: buildMultipartBody(metadata, content),
  });
}

export async function getFileContent(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  return res.text();
}

/** Trashes rather than permanently deletes — recoverable from Drive's own
 * Trash if a profile's "Delete" click was a mistake, same safety margin
 * Drive's own UI gives you. */
export async function trashFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${DRIVE_API}/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}
