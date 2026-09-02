import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { CustomSkinsFile, PixelSkinData, SkinAsset, SkinLibraryEntry } from "./CustomSkins";
import { activeBundle } from "../game/contentSource";

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
/** The parsed file as of the last successful read or write, and the read
 * currently in flight (if any) — see loadCustomSkins for why both exist.
 * Module-level rather than per-caller: every consumer wants the same one
 * shared library, exactly as they all previously wanted the same one file. */
let cachedSkins: CustomSkinsFile | null = null;
let inFlightRead: Promise<CustomSkinsFile> | null = null;

async function fetchCustomSkins(): Promise<CustomSkinsFile> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const file = await findFileByName(token, folderId, SKINS_FILE_NAME);
  const parsed = await readSkinsFile(token, file?.id);
  cachedSkins = parsed;
  return parsed;
}

async function readSkinsFile(token: string, fileId: string | undefined): Promise<CustomSkinsFile> {
  if (!fileId) return {};
  const content = await getFileContent(token, fileId);
  if (!content.trim()) return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return normalizeSkinsFile(parsed);
  } catch {
    return {};
  }
}

/** Every caller gets its own independent copy, never the cached object
 * itself — the mutators below (addCustomSkin/savePixelSkin/…) all follow a
 * read-mutate-write shape that writes straight into what this returns, so
 * handing back the cache by reference would let a *failed* write leave the
 * cache holding state that was never actually saved. Cloning preserves
 * exactly the semantics every caller already had back when this re-parsed
 * fresh JSON on each call. */
function cloneSkins(skins: CustomSkinsFile): CustomSkinsFile {
  return structuredClone(skins);
}

/**
 * Reads the shared library, served from memory after the first call.
 *
 * Previously every call was two real Drive round trips (findFileByName +
 * getFileContent) with no memoization at all, and `PlayScene.enterArea`
 * calls this on *every* area build — so each basket teleport re-downloaded
 * the whole library mid-play, and the Skin Creator's browse screen did one
 * full read per distinct brush it showed. (A comment there even claimed
 * these calls "replay loadCustomSkins' own in-memory result"; that cache
 * did not exist until now.)
 *
 * `inFlightRead` dedupes concurrent first calls the same way driveClient's
 * `appFolderPromise` does, and for the same reason: MenuScene kicks off
 * several resolves without awaiting each other, so caching only the settled
 * result would still let them all race past the check and each issue their
 * own request. Cleared on failure so a later attempt genuinely retries
 * rather than replaying a rejection forever (same shape as googleAuth's
 * `gisReady`).
 *
 * Cache lifetime is one page load, invalidated on every successful write
 * from this tab. It therefore won't observe a *different* tab's upload
 * until reload — an extension of the concurrent-write limitation this
 * module already documents above, and the same accepted trade for a
 * 3-person household.
 */
export function loadCustomSkins(): Promise<CustomSkinsFile> {
  const bundle = activeBundle();
  // structuredClone for the same reason the Drive path caches a copy: callers
  // read-mutate-write, and handing out the bundle's own object would let one of
  // them quietly edit what every later read returns.
  if (bundle) return Promise.resolve(structuredClone(bundle.skins));

  if (cachedSkins) return Promise.resolve(cloneSkins(cachedSkins));
  if (!inFlightRead) {
    inFlightRead = fetchCustomSkins().finally(() => {
      inFlightRead = null;
    });
  }
  return inFlightRead.then(cloneSkins);
}

/** Drops the cached copy so the next read goes back to Drive. Exported for
 * tests and for any future "someone else changed this" refresh path; the
 * normal write path updates the cache in place instead (see
 * writeCustomSkins). */
export function invalidateSkinsCache(): void {
  cachedSkins = null;
  inFlightRead = null;
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
  // Only *after* the write actually lands: what we just persisted is now
  // the truth, so the next read can serve it without a round trip. Cloned
  // because `skins` belongs to the caller, who may keep mutating it.
  // Deliberately not in a `finally` — a failed write must leave the cache
  // showing the last state that really is on Drive, not the one we failed
  // to save.
  cachedSkins = cloneSkins(skins);
}

function entryFor(skins: CustomSkinsFile, brushId: string): SkinLibraryEntry {
  return skins[brushId] ?? { activeId: null, items: [] };
}

/**
 * Adds a newly-uploaded skin to the brush's library and **leaves the default
 * alone** — the returned id is how the caller applies it where it wants (the
 * editor puts it on the level being edited; see LevelData.skins).
 *
 * It used to set `activeId` here, so an upload became the look of that brush in
 * every level the moment it finished. That is the behaviour the 2026-08-23 pass
 * removed: adding art to a library is not a decision about how anything should
 * look, and there was no way to add a skin without making that decision. Only
 * setActiveSkin moves a default now.
 */
export async function addCustomSkin(
  brushId: string,
  imageData: string,
  uploadedBy: string,
  /** Usually the uploaded file's own name, exactly as addBackgroundAsset and
   * addMusicAsset already do it. Omitted leaves the skin nameless, which
   * displaySkinName renders as the brush label. */
  name?: string,
): Promise<string> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  const id = crypto.randomUUID();
  const asset: SkinAsset = { id, name, imageData, uploadedBy, updatedAt: new Date().toISOString() };
  skins[brushId] = { ...entry, items: [...entry.items, asset] };
  await writeCustomSkins(skins);
  return id;
}

/**
 * Sets a brush's **library default** — what every level that hasn't chosen for
 * itself will wear (`null` = "use the built-in art"). See skinSelection.ts for
 * how that layers under a level's own choice.
 *
 * The *only* function that moves a default, deliberately: it is reached from
 * one explicit, confirmed "Set as default" button and from nowhere else, so
 * making or uploading a skin can never quietly restyle every level. A no-op
 * against the last-read state if `skinId` isn't actually one of this brush's
 * items (stale UI, item removed by someone else in the meantime); silently
 * falls back to `null` rather than pointing at a skin that no longer exists.
 */
export async function setActiveSkin(brushId: string, skinId: string | null): Promise<void> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  const resolved = skinId !== null && entry.items.some((item) => item.id === skinId) ? skinId : null;
  skins[brushId] = { ...entry, activeId: resolved };
  await writeCustomSkins(skins);
}

/** Every pixel-editor-made skin across every brush, flattened into one
 * list — the Skin Creator's "select a skin to edit" browse screen (see
 * SkinEditorScene) needs to show these across all brushes at once, unlike
 * every other skin-library reader here (resolveSkinThumbnails,
 * onSkinPickerOpen) which is always scoped to one already-selected brush.
 * Ordinary uploaded-photo skins (no `pixelData`) are omitted — see
 * PixelSkinData's own docstring for why those aren't re-editable here. */
export async function listPixelSkins(): Promise<{ brushId: string; asset: SkinAsset }[]> {
  const skins = await loadCustomSkins();
  const result: { brushId: string; asset: SkinAsset }[] = [];
  for (const [brushId, entry] of Object.entries(skins)) {
    for (const asset of entry.items) {
      if (asset.pixelData) result.push({ brushId, asset });
    }
  }
  return result;
}

/**
 * Creates or overwrites one pixel-drawn skin — the Skin Creator's Save button —
 * and, like addCustomSkin, **leaves the default alone**.
 *
 * This one mattered most. It used to set `activeId`, so finishing a drawing
 * silently made it the look of that brush in every level, with nothing asked
 * and no way to paint one without that happening. Painting is not a decision
 * about how existing levels should look; picking the skin in a level is, and
 * "Set as default" is.
 *
 * `existingId` re-saves in place (same id, brush unchanged) when re-editing an
 * existing pixel skin; omitted (or no longer present — removed by someone else
 * in the meantime) falls through to adding a brand new library entry.
 * Deliberately reuses loadCustomSkins/writeCustomSkins/entryFor exactly as
 * every other mutator here does, rather than a separate pixel-skins file — one
 * skin is one skin regardless of how its PNG was produced; see PixelSkinData's
 * own docstring for what actually distinguishes a pixel-drawn one.
 */
export async function savePixelSkin(
  brushId: string,
  existingId: string | undefined,
  imageData: string,
  pixelData: PixelSkinData,
  uploadedBy: string,
  frames?: Record<string, string>,
  /** Already sanitized by the caller (see skinNames.sanitizeSkinName) — this
   * layer stores what it is handed rather than deciding what a blank means. */
  name?: string,
): Promise<string> {
  const skins = await loadCustomSkins();
  const entry = entryFor(skins, brushId);
  const now = new Date().toISOString();
  const targetId = existingId && entry.items.some((item) => item.id === existingId) ? existingId : undefined;

  // Persist only the palette marker, never the cell grid — `imageData` is
  // already a lossless copy of it (see PixelSkinData.cells for the measured
  // reasoning). Rebuilt here rather than trusting the caller's object so a
  // legacy `cells` array can't get written straight back out, which is what
  // makes each save quietly migrate its own skin off the old shape.
  const persisted: PixelSkinData = { paletteId: pixelData.paletteId };
  // Normalized rather than passed straight through, for the same reason: a
  // caller handing over an empty map, or one holding nothing but blanks,
  // should leave an ordinary single-frame skin behind rather than an empty
  // `frames: {}` that every reader then has to special-case. Written whole
  // (not merged into whatever was there) so deleting a frame in the editor
  // actually deletes it.
  const persistedFrames = frames && Object.keys(frames).length > 0 ? { ...frames } : undefined;

  if (targetId) {
    // Re-saving in place keeps the same id, which is what makes a rename a
    // rename rather than a second skin appearing beside the first. `name ??`
    // rather than a plain assignment so a caller that doesn't handle names
    // (there are none today, but the parameter is optional) can't blank one.
    const items = entry.items.map((item) =>
      item.id === targetId
        ? {
            ...item,
            name: name ?? item.name,
            imageData,
            pixelData: persisted,
            frames: persistedFrames,
            uploadedBy,
            updatedAt: now,
          }
        : item,
    );
    skins[brushId] = { ...entry, items };
    await writeCustomSkins(skins);
    return targetId;
  }

  const id = crypto.randomUUID();
  const asset: SkinAsset = { id, name, imageData, uploadedBy, updatedAt: now, pixelData: persisted, frames: persistedFrames };
  skins[brushId] = { ...entry, items: [...entry.items, asset] };
  await writeCustomSkins(skins);
  return id;
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
