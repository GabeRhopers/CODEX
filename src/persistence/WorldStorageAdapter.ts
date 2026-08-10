import { WorldData, WorldSummary } from "../world/WorldSchema";

/** Mirrors StorageAdapter's level interface exactly, one level down (see
 * that file's comment on why every method is async). */
export interface WorldStorageAdapter {
  list(): Promise<WorldSummary[]>;
  save(world: WorldData): Promise<void>;
  load(id: string): Promise<WorldData | null>;
  remove(id: string): Promise<void>;
}
