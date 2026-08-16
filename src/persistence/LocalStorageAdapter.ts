import { LevelData, LevelSummary } from "../level/LevelSchema";
import { deserializeLevel, serializeLevel } from "../level/LevelSerializer";
import { StorageAdapter } from "./StorageAdapter";

const INDEX_KEY = "spellbound:index";
const levelKey = (id: string) => `spellbound:level:${id}`;

function readIndex(): LevelSummary[] {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LevelSummary[];
  } catch {
    return [];
  }
}

function writeIndex(index: LevelSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export class LocalStorageAdapter implements StorageAdapter {
  async list(): Promise<LevelSummary[]> {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(level: LevelData): Promise<void> {
    localStorage.setItem(levelKey(level.id), serializeLevel(level));
    const index = readIndex().filter((entry) => entry.id !== level.id);
    index.push({ id: level.id, name: level.name, updatedAt: level.updatedAt });
    writeIndex(index);
  }

  async load(id: string): Promise<LevelData | null> {
    const raw = localStorage.getItem(levelKey(id));
    if (!raw) return null;
    return deserializeLevel(raw);
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(levelKey(id));
    writeIndex(readIndex().filter((entry) => entry.id !== id));
  }
}
