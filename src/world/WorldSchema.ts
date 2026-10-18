import { BuiltinStaticBackgroundId } from "../level/staticBackgrounds";
import { WorldLayout } from "./worldLayout";

/**
 * A World is an ordered run of already-saved levels, laid out on a map.
 *
 * `levelIds` remains the single source of truth for both *what is in the
 * world* and *what order it is played in* — the map's paths are drawn
 * between consecutive entries, so arranging nodes never has to also mean
 * reordering them. Levels themselves are untouched; a World only
 * references them by id, so editing/deleting a level elsewhere is
 * reflected the next time the world is played (a missing id just ends the
 * world early — see PlayScene).
 *
 * `layout` and `background` are **optional on purpose**: a world saved
 * before the map existed has neither, and must still open and play. A
 * missing layout is auto-arranged onto a serpentine route (see
 * worldLayout.resolveLayout) and a missing background falls back to the
 * same default a level does. Same migration-free shape as
 * `SkinAsset.name?` and `LevelData.skins?`.
 *
 * How far a player has got is deliberately *not* here — see
 * worldProgress.ts for why progress is per-player local state rather than
 * part of the shared document.
 */
export interface WorldData {
  id: string;
  name: string;
  levelIds: string[];
  /** Level id -> map cell. Partial entries are fine; see resolveLayout. */
  layout?: WorldLayout;
  /** The map screen's backdrop. Built-ins only — unlike a level, a world has
   * nowhere to keep an uploaded image, so "custom" is not offered here. */
  background?: BuiltinStaticBackgroundId;
  createdAt: string;
  updatedAt: string;
}

export interface WorldSummary {
  id: string;
  name: string;
  levelCount: number;
  updatedAt: string;
}

/**
 * Turns whatever came back out of storage into a `WorldData`, or `null`.
 *
 * Every world is read as JSON somebody else wrote — a file on Drive, a
 * localStorage entry, hand-edited or truncated by a failed write — and until
 * now both adapters did `JSON.parse(content) as WorldData` and handed the
 * result to `WorldMapScene`, which builds an entire screen out of it. A
 * `levelIds` that was not an array took the map down with a TypeError; a
 * document that failed to parse at all threw straight out of `load`.
 *
 * The required fields are the ones the map cannot draw anything without. The
 * optional two are dropped rather than rejected, because `WorldData`'s own
 * docstring makes absence normal for both: a world saved before the map existed
 * has neither, and must still open.
 *
 * **Deliberately shallow on `layout`.** `resolveLayout` already relocates
 * out-of-range, duplicate and non-numeric cells — that is documented there and
 * tested — so re-checking them here would be a second opinion that could drift
 * from the first. This only rules out a layout that is not an object at all.
 * Same for `background`: which ids exist is the backgrounds module's business,
 * and it already falls back.
 */
export function parseWorld(raw: unknown): WorldData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const doc = raw as Record<string, unknown>;

  for (const field of ["id", "name", "createdAt", "updatedAt"] as const) {
    if (typeof doc[field] !== "string") return null;
  }
  if (!Array.isArray(doc.levelIds) || doc.levelIds.some((id) => typeof id !== "string")) return null;

  const layout = doc.layout;
  const usableLayout = !!layout && typeof layout === "object" && !Array.isArray(layout);

  return {
    id: doc.id as string,
    name: doc.name as string,
    levelIds: doc.levelIds as string[],
    ...(usableLayout ? { layout: layout as WorldLayout } : {}),
    ...(typeof doc.background === "string" ? { background: doc.background as BuiltinStaticBackgroundId } : {}),
    createdAt: doc.createdAt as string,
    updatedAt: doc.updatedAt as string,
  };
}

/** One row of the worlds list. Same stance as `parseWorld`: a row that is not
 * shaped like a summary is dropped, so one bad entry costs its own row rather
 * than the whole list. */
export function parseWorldSummary(raw: unknown): WorldSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.updatedAt !== "string") return null;
  if (typeof row.levelCount !== "number" || !Number.isFinite(row.levelCount)) return null;
  return { id: row.id, name: row.name, levelCount: row.levelCount, updatedAt: row.updatedAt };
}

export function createEmptyWorld(name = "Untitled World"): WorldData {
  const now = new Date().toISOString();
  return { id: "", name, levelIds: [], createdAt: now, updatedAt: now };
}
