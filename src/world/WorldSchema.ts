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

export function createEmptyWorld(name = "Untitled World"): WorldData {
  const now = new Date().toISOString();
  return { id: "", name, levelIds: [], createdAt: now, updatedAt: now };
}
