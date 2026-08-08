import { LevelData, LevelSummary } from "../level/LevelSchema";

/**
 * All methods are async even though LocalStorageAdapter is internally
 * synchronous — this keeps the call sites (EditorScene) identical when a
 * genuinely async adapter (IndexedDB, a backend) is swapped in later.
 */
export interface StorageAdapter {
  list(): Promise<LevelSummary[]>;
  save(level: LevelData): Promise<void>;
  load(id: string): Promise<LevelData | null>;
  remove(id: string): Promise<void>;
}
