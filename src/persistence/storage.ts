import { GoogleDriveStorageAdapter } from "./GoogleDriveStorageAdapter";
import { GoogleDriveWorldStorageAdapter } from "./GoogleDriveWorldStorageAdapter";
import { StorageAdapter } from "./StorageAdapter";
import { WorldStorageAdapter } from "./WorldStorageAdapter";

// Every scene asks here instead of constructing its own adapter — one
// place to swap the backend again later, same reason EditorScene etc.
// were already written against the StorageAdapter interface rather than
// LocalStorageAdapter directly. Both adapters are stateless enough that
// a single shared instance vs. one-per-scene makes no behavioral
// difference; sharing just avoids the pointless allocations.
const levelStorage: StorageAdapter = new GoogleDriveStorageAdapter();
const worldStorage: WorldStorageAdapter = new GoogleDriveWorldStorageAdapter();

export function getLevelStorage(): StorageAdapter {
  return levelStorage;
}

export function getWorldStorage(): WorldStorageAdapter {
  return worldStorage;
}
