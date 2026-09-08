import { parseWorld, parseWorldSummary, WorldData, WorldSummary } from "../world/WorldSchema";
import { WorldStorageAdapter } from "./WorldStorageAdapter";

const INDEX_KEY = "rhopers:world-index";
const worldKey = (id: string) => `rhopers:world:${id}`;

function readIndex(): WorldSummary[] {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filtered, not rejected: one unreadable row should cost its own row rather
    // than hiding every world the person has made.
    return parsed.map(parseWorldSummary).filter((row): row is WorldSummary => row !== null);
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
    try {
      return parseWorld(JSON.parse(raw));
    } catch {
      console.error(`world ${id} could not be parsed; treating as absent`);
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(worldKey(id));
    writeIndex(readIndex().filter((entry) => entry.id !== id));
  }
}
