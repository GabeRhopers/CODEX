import { createFile, ensureAppFolder, findFileByName, getFileContent, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { CustomEntityDef, CustomEntityId } from "./customEntity";
import { activeBundle } from "../game/contentSource";

const FILE_NAME = "custom-entities.json";

/**
 * The shared library of invented entity types.
 *
 * Same shape as every other library here (skins, backgrounds, music): one JSON
 * file in the app's Drive folder, deliberately **not** scoped per profile — a
 * type someone invents is part of the game, like a skin, not a personal setting
 * (see skinStorage.ts's own note on that asymmetry).
 *
 * Cached for the page load with the same in-flight dedupe `loadCustomSkins`
 * uses, and for the same reason: PlayScene resolves this on every area build, so
 * an uncached read would re-download the library on every basket teleport.
 *
 * Nothing here validates a definition. The registry does that once, when it
 * merges (see entityRegistry.validDefs) — a hand-edited or older-build entry is
 * dropped there rather than at every call site, and the level that referenced it
 * still opens with the entity inert.
 */
export type CustomEntitiesFile = CustomEntityDef[];

let cached: CustomEntitiesFile | null = null;
let inFlightRead: Promise<CustomEntitiesFile> | null = null;

async function fetchDefs(): Promise<CustomEntitiesFile> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const file = await findFileByName(token, folderId, FILE_NAME);
  if (!file) return [];
  const content = await getFileContent(token, file.id);
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content) as CustomEntitiesFile;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupted file reads as "no custom types" rather than taking the app
    // down — every level still opens, with its custom entities inert.
    console.error("custom-entities.json could not be parsed; treating as empty");
    return [];
  }
}

/** Every caller gets its own copy, never the cached array — the mutators below
 * read-mutate-write, so handing back the cache by reference would let a failed
 * write leave it holding state that was never saved. */
export function loadCustomEntities(): Promise<CustomEntitiesFile> {
  const bundle = activeBundle();
  if (bundle) return Promise.resolve(structuredClone(bundle.customEntities));

  if (cached) return Promise.resolve(structuredClone(cached));
  if (!inFlightRead) {
    inFlightRead = fetchDefs().finally(() => {
      inFlightRead = null;
    });
  }
  return inFlightRead.then((defs) => structuredClone(defs));
}

/** Drops the cached copy so the next read goes back to Drive. */
export function invalidateCustomEntitiesCache(): void {
  cached = null;
  inFlightRead = null;
}

async function write(defs: CustomEntitiesFile): Promise<void> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const content = JSON.stringify(defs);
  const appProperties = { kind: "custom-entities" };
  const existing = await findFileByName(token, folderId, FILE_NAME);
  if (existing) await updateFileContent(token, existing.id, content, appProperties);
  else await createFile(token, folderId, FILE_NAME, content, appProperties);
  // Only after the write actually landed, so a rejection leaves the cache
  // matching what is really in Drive.
  cached = structuredClone(defs);
}

/** Adds a definition, or replaces the one with the same id. */
export async function saveCustomEntity(def: CustomEntityDef): Promise<void> {
  const defs = await loadCustomEntities();
  const next = defs.filter((d) => d.id !== def.id);
  next.push({ ...def, updatedAt: new Date().toISOString() });
  await write(next);
}

/**
 * Removes a definition.
 *
 * Levels that already placed it keep the entity: it renders inert rather than
 * disappearing or breaking the load, so deleting a type never silently edits
 * levels someone else made. Same trade `removeBackgroundAsset` and
 * `removeMusicAsset` make.
 */
export async function removeCustomEntity(id: CustomEntityId): Promise<void> {
  const defs = await loadCustomEntities();
  if (!defs.some((d) => d.id === id)) return;
  await write(defs.filter((d) => d.id !== id));
}
