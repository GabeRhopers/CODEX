import { LevelData, LevelSummary } from "../level/LevelSchema";
import { StorageAdapter } from "./StorageAdapter";
import { WorldStorageAdapter } from "./WorldStorageAdapter";
import { WorldData, WorldSummary } from "../world/WorldSchema";
import { GameBundle } from "../game/gameBundle";

/**
 * Levels and worlds read straight out of a bundle.
 *
 * Same interfaces the Drive adapters implement, so every scene that already
 * asks `getLevelStorage()` needs no change at all — which is exactly what those
 * interfaces were written for ("one place to swap the backend again later").
 *
 * **Writes throw rather than quietly doing nothing.** A published game never
 * saves, so if one of these is ever reached it means a code path assumed an
 * editor that is not there — and a silent no-op would hide that until someone
 * noticed their progress vanishing.
 */

function readOnly(what: string): never {
  throw new Error(`A published game cannot ${what} — it has no storage to write to.`);
}

export class BundleLevelStorage implements StorageAdapter {
  constructor(private readonly bundle: GameBundle) {}

  list(): Promise<LevelSummary[]> {
    return Promise.resolve(
      this.bundle.levels.map((level) => ({
        id: level.id,
        name: level.name || "Untitled Level",
        updatedAt: level.updatedAt,
      })),
    );
  }

  load(id: string): Promise<LevelData | null> {
    return Promise.resolve(this.bundle.levels.find((level) => level.id === id) ?? null);
  }

  save(): Promise<void> {
    return readOnly("save a level");
  }

  remove(): Promise<void> {
    return readOnly("delete a level");
  }
}

export class BundleWorldStorage implements WorldStorageAdapter {
  constructor(private readonly bundle: GameBundle) {}

  list(): Promise<WorldSummary[]> {
    return Promise.resolve(
      this.bundle.worlds.map((world) => ({
        id: world.id,
        name: world.name || "Untitled World",
        levelCount: world.levelIds.length,
        updatedAt: world.updatedAt,
      })),
    );
  }

  load(id: string): Promise<WorldData | null> {
    return Promise.resolve(this.bundle.worlds.find((world) => world.id === id) ?? null);
  }

  save(): Promise<void> {
    return readOnly("save a world");
  }

  remove(): Promise<void> {
    return readOnly("delete a world");
  }
}
