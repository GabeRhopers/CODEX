import { WorldData, WorldSummary } from "../world/WorldSchema";
import { WorldStorageAdapter } from "./WorldStorageAdapter";

const INDEX_KEY = "spellbound:world-index";
const worldKey = (id: string) => `spellbound:world:${id}`;

function readIndex(): WorldSummary[] {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorldSummary[];
  } catch {
    return [];
  }
}

function writeIndex(index: WorldSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export class LocalWorldStorageAdapter implements WorldStorageAdapter {
  async list(): Promise<WorldSummary[]> {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(world: WorldData): Promise<void> {
    localStorage.setItem(worldKey(world.id), JSON.stringify(world));
    const index = readIndex().filter((entry) => entry.id !== world.id);
    index.push({ id: world.id, name: world.name, levelCount: world.levelIds.length, updatedAt: world.updatedAt });
    writeIndex(index);
  }

  async load(id: string): Promise<WorldData | null> {
    const raw = localStorage.getItem(worldKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as WorldData;
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(worldKey(id));
    writeIndex(readIndex().filter((entry) => entry.id !== id));
  }
}
