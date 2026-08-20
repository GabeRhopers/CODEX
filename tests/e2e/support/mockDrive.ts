import type { Page, Route } from "@playwright/test";

/**
 * A from-scratch, in-memory stand-in for both halves of this app's real
 * persistence backend — Google Identity Services (the OAuth token popup)
 * and the Drive REST API itself (see src/drive/googleAuth.ts and
 * src/drive/driveClient.ts) — so the e2e suite can drive the *real*
 * EditorScene/PlayScene/ProfileGateScene code paths (including Save,
 * autosave, and the Sub/Up basket-pairing checks that read straight off
 * `this.level`) without ever touching a real Google account, network, or
 * OAuth consent screen. Every earlier browser-verification pass this
 * session took the same "mock Drive at the network boundary" approach
 * ad hoc, per script; this is that approach promoted into a single,
 * reusable, checked-in module (see the Priority Matrix's Tier 2 "no
 * committed browser suite yet" item).
 *
 * Deliberately mocks at the *network* boundary (window.google, fetch to
 * googleapis.com) rather than swapping in a fake StorageAdapter — the
 * whole point of an e2e suite is exercising the real
 * GoogleDriveStorageAdapter/driveClient code, not a test-only substitute
 * for it.
 */

interface DriveRecord {
  id: string;
  name: string;
  parents: string[];
  mimeType?: string;
  appProperties?: Record<string, string>;
  content?: string;
  trashed: boolean;
  modifiedTime: string;
}

let nextId = 1;

/** One fake Drive "account" — a flat record store, reset per test since
 * this is constructed fresh by installMockDrive on every call. */
function createStore() {
  return new Map<string, DriveRecord>();
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pulls the handful of clauses driveClient.ts's own query strings ever
 * combine — `name='X'`, `'PARENT' in parents`, and a folder-mimeType
 * filter — out of Drive's `q` search syntax. Not a general Drive query
 * parser; just enough to satisfy the exact shapes this app generates
 * (see findFolderId/findFileByName/listFiles in driveClient.ts). */
function parseQuery(q: string): { name?: string; parent?: string; folderOnly: boolean } {
  const nameMatch = q.match(/name='((?:[^'\\]|\\.)*)'/);
  const parentMatch = q.match(/'([^']+)' in parents/);
  return {
    name: nameMatch ? nameMatch[1].replace(/\\(.)/g, "$1") : undefined,
    parent: parentMatch ? parentMatch[1] : undefined,
    folderOnly: /mimeType='application\/vnd\.google-apps\.folder'/.test(q),
  };
}

function toFileMeta(record: DriveRecord): unknown {
  return {
    id: record.id,
    name: record.name,
    modifiedTime: record.modifiedTime,
    appProperties: record.appProperties,
  };
}

/** Splits a `multipart/related` body (see driveClient.ts's
 * buildMultipartBody) into its two parts — JSON metadata, then raw
 * content — without hardcoding the boundary string, so this stays correct
 * even if driveClient.ts's own BOUNDARY constant ever changes. */
function parseMultipart(contentType: string, body: string): { metadata: Record<string, unknown>; content: string } {
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch) throw new Error(`mockDrive: no boundary in Content-Type "${contentType}"`);
  const boundary = boundaryMatch[1].trim();
  const marker = new RegExp(`--${escapeRegExpLiteral(boundary)}(--)?\\r?\\n?`, "g");
  const parts = body
    .split(marker)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) throw new Error(`mockDrive: expected 2 multipart parts, got ${parts.length}`);
  const stripHeaders = (part: string): string => {
    const split = part.indexOf("\r\n\r\n");
    return split === -1 ? part : part.slice(split + 4);
  };
  const metadataRaw = stripHeaders(parts[0]).trim();
  const content = stripHeaders(parts[1]).trim();
  return { metadata: JSON.parse(metadataRaw) as Record<string, unknown>, content };
}

async function handleDriveRoute(store: Map<string, DriveRecord>, route: Route): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const isUpload = url.pathname.startsWith("/upload/drive/v3/files");
  const fileIdMatch = url.pathname.match(/\/drive\/v3\/files\/([^/]+)$/);

  // GET /drive/v3/files?q=... — the one search shape every list/find call
  // in driveClient.ts uses.
  if (!isUpload && url.pathname === "/drive/v3/files" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const { name, parent, folderOnly } = parseQuery(q);
    const files = [...store.values()].filter((record) => {
      if (record.trashed) return false;
      if (name !== undefined && record.name !== name) return false;
      if (parent !== undefined && !record.parents.includes(parent)) return false;
      if (folderOnly && record.mimeType !== "application/vnd.google-apps.folder") return false;
      return true;
    });
    await route.fulfill({ json: { files: files.map(toFileMeta) } });
    return;
  }

  // POST /drive/v3/files — folder creation (resolveAppFolder).
  if (!isUpload && url.pathname === "/drive/v3/files" && method === "POST") {
    const body = JSON.parse(request.postData() ?? "{}") as { name: string; mimeType?: string; parents?: string[] };
    const id = `mock-${nextId++}`;
    store.set(id, {
      id,
      name: body.name,
      parents: body.parents ?? [],
      mimeType: body.mimeType,
      trashed: false,
      modifiedTime: new Date().toISOString(),
    });
    await route.fulfill({ json: { id } });
    return;
  }

  // GET /drive/v3/files/:id?alt=media — file content download.
  if (!isUpload && fileIdMatch && method === "GET" && url.searchParams.get("alt") === "media") {
    const record = store.get(fileIdMatch[1]);
    if (!record) {
      await route.fulfill({ status: 404, json: { error: { message: "not found" } } });
      return;
    }
    await route.fulfill({ body: record.content ?? "", contentType: "text/plain" });
    return;
  }

  // PATCH /drive/v3/files/:id — rename (legacy-folder migration) or trash.
  if (!isUpload && fileIdMatch && method === "PATCH") {
    const record = store.get(fileIdMatch[1]);
    if (!record) {
      await route.fulfill({ status: 404, json: { error: { message: "not found" } } });
      return;
    }
    const body = JSON.parse(request.postData() ?? "{}") as { name?: string; trashed?: boolean };
    if (body.name !== undefined) record.name = body.name;
    if (body.trashed !== undefined) record.trashed = body.trashed;
    await route.fulfill({ json: toFileMeta(record) });
    return;
  }

  // POST /upload/drive/v3/files?uploadType=multipart — createFile.
  if (isUpload && url.pathname === "/upload/drive/v3/files" && method === "POST") {
    const contentType = (await request.headerValue("content-type")) ?? "";
    const { metadata, content } = parseMultipart(contentType, request.postData() ?? "");
    const id = `mock-${nextId++}`;
    const record: DriveRecord = {
      id,
      name: String(metadata.name ?? ""),
      parents: (metadata.parents as string[] | undefined) ?? [],
      mimeType: metadata.mimeType as string | undefined,
      appProperties: metadata.appProperties as Record<string, string> | undefined,
      content,
      trashed: false,
      modifiedTime: new Date().toISOString(),
    };
    store.set(id, record);
    await route.fulfill({ json: toFileMeta(record) });
    return;
  }

  // PATCH /upload/drive/v3/files/:id?uploadType=multipart — updateFileContent.
  const uploadIdMatch = url.pathname.match(/\/upload\/drive\/v3\/files\/([^/]+)$/);
  if (isUpload && uploadIdMatch && method === "PATCH") {
    const record = store.get(uploadIdMatch[1]);
    if (!record) {
      await route.fulfill({ status: 404, json: { error: { message: "not found" } } });
      return;
    }
    const contentType = (await request.headerValue("content-type")) ?? "";
    const { metadata, content } = parseMultipart(contentType, request.postData() ?? "");
    if (metadata.appProperties) record.appProperties = { ...record.appProperties, ...(metadata.appProperties as Record<string, string>) };
    record.content = content;
    record.modifiedTime = new Date().toISOString();
    await route.fulfill({ json: toFileMeta(record) });
    return;
  }

  throw new Error(`mockDrive: unhandled ${method} ${url.pathname}${url.search}`);
}

/**
 * Installs the fake Google Identity Services object *before* any page
 * script runs, so googleAuth.ts's `loadGis()` (which checks
 * `window.google?.accounts?.oauth2` first) never even appends the real
 * `accounts.google.com/gsi/client` script tag — every sign-in call
 * resolves instantly with a fake token, no popup, no network.
 */
async function installMockGoogleIdentity(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient(config: { callback: (response: { access_token: string; expires_in: number }) => void }) {
            return {
              callback: config.callback,
              requestAccessToken() {
                // Real GIS is asynchronous (a token popup, or a silent
                // background check) — a microtask keeps this mock async
                // too, so callers awaiting a Promise around it (see
                // googleAuth.ts's requestToken) aren't relying on a
                // same-tick resolution that would never happen for real.
                queueMicrotask(() => this.callback({ access_token: "mock-access-token", expires_in: 3600 }));
              },
            };
          },
          revoke(_token: string, done: () => void) {
            queueMicrotask(done);
          },
        },
      },
    };
  });
}

/** Installs the Drive REST mock. Each call gets its own isolated in-memory
 * store (nothing persists between tests, matching every other test's
 * fresh-page-load isolation). */
async function installMockDriveApi(page: Page): Promise<void> {
  const store = createStore();
  await page.route("https://www.googleapis.com/**", (route) => handleDriveRoute(store, route));
}

/** The one call every spec needs before navigating — wires up both mocks.
 * Call this before `page.goto`; Playwright queues `addInitScript`/`route`
 * registrations to apply from the very next navigation. */
export async function installMockDrive(page: Page): Promise<void> {
  await installMockGoogleIdentity(page);
  await installMockDriveApi(page);
}
