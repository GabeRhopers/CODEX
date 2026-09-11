/**
 * Reading a shared asset library — the uploaded backgrounds and the uploaded
 * music tracks.
 *
 * Both libraries are flat lists of near-identical records (see
 * `BackgroundLibrary.ts` and `MusicLibrary.ts`; they differ only in whether the
 * payload field is called `imageData` or `audioData`), and until 2026-09-11
 * both were read with nothing but `Array.isArray(parsed) ? parsed : []`. That
 * rules out "this is not a list" and says nothing whatever about what is *in*
 * the list, so an entry with no `imageData` travelled all the way to a texture
 * registration before anything noticed.
 *
 * **The reason this is worth a parser and not a shrug** is `collectBundle.ts`:
 * publishing reads these same two libraries, so a malformed asset is not only an
 * editor problem — it is copied into the published file and shipped to everyone
 * who opens the link. `bundleProblems` does not catch it either, because that
 * checks cross-references (an id named but absent) rather than whether an
 * asset's own fields are usable.
 *
 * The same door serves both sources: `loadBackgroundLibrary`/`loadMusicLibrary`
 * return either a parsed Drive file or `activeBundle()`'s copy, so validating
 * here covers a corrupt Drive file *and* a hand-edited or truncated bundle.
 *
 * **Bad entries are dropped, not fatal** — deliberately the opposite of
 * `parseGame`, which returns null for a malformed document. A game is one
 * document and a broken one is broken; a library is twenty independent uploads,
 * and losing all of them because one is corrupt is the worse trade by a long
 * way. Same instinct as `removeCustomSkin` falling back to built-in art and
 * `resolveLayout` relocating a bad cell rather than rejecting a world.
 *
 * Nothing new needs reporting when an entry is dropped: whatever referenced it
 * now names an id the library does not have, which is precisely what
 * `bundleProblems` already says out loud — "An uploaded background is missing
 * (…); those areas fall back."
 */

/** The field carrying the actual payload. The only thing that differs between
 * the two libraries, so it is passed in rather than guessed at — a track
 * carrying an `imageData` is not a track. */
export type AssetDataField = "imageData" | "audioData";

/** What every asset in either library has in common. */
interface AssetLike {
  id: string;
  name: string;
  uploadedBy: string;
  updatedAt: string;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Kept if it could still be used, dropped if it could not.
 *
 * Required: `id`, because nothing can reference an asset without one, and the
 * payload, because an asset with no data is an entry that will fail at the
 * moment it is rendered or decoded — which is exactly the far-from-the-cause
 * failure this module exists to prevent.
 *
 * Defaulted: `name`, `uploadedBy`, `updatedAt`. A background with no name
 * renders perfectly and shows blank in the picker; throwing somebody's upload
 * away over a missing timestamp would be a much worse outcome than showing it
 * unlabelled. */
function parseAsset<T>(raw: unknown, dataField: AssetDataField): T | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if (!isNonEmptyString(entry.id)) return null;
  if (!isNonEmptyString(entry[dataField])) return null;

  const common: AssetLike = {
    id: entry.id,
    name: typeof entry.name === "string" ? entry.name : "",
    uploadedBy: typeof entry.uploadedBy === "string" ? entry.uploadedBy : "",
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString(),
  };
  return { ...common, [dataField]: entry[dataField] } as T;
}

/** Every usable asset in `raw`, in the order it was stored. */
export function parseAssetList<T>(raw: unknown, dataField: AssetDataField): T[] {
  if (!Array.isArray(raw)) return [];
  const parsed: T[] = [];
  for (const entry of raw) {
    const asset = parseAsset<T>(entry, dataField);
    if (asset) parsed.push(asset);
  }
  return parsed;
}
