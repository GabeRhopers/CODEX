/**
 * A World is the simplest possible "course maker" v1: an ordered list of
 * already-saved level ids, played back to back. No branching paths, no
 * visual world map, no per-level unlocking — those are explicitly out of
 * scope for v1 (see docs/mario-maker-editor-implementation-plan.md §9.3
 * M8). Levels themselves are untouched; a World only references them by
 * id, so editing/deleting a level elsewhere is reflected the next time the
 * world is played (a missing id just ends the world early — see
 * PlayScene).
 */
export interface WorldData {
  id: string;
  name: string;
  levelIds: string[];
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
