import { activeBundle } from "../game/contentSource";
import { BundleLevelStorage, BundleWorldStorage } from "./BundleStorage";
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

// A published game reads from its bundle instead of Drive.
//
// Resolved per call rather than captured once, and that is load-bearing: Phaser
// constructs every scene when the Game is created, which is *before* the boot
// has decided whether this page is a game or the editor. A scene that grabbed an
// adapter in a field initializer would hold the Drive one for the life of a
// published page and never read the bundle at all — which is exactly the bug a
// mutation test caught here. Scenes therefore ask on each use (see their
// `get levelStorage()`), and these instances are memoised so that costs nothing.
let bundleLevelStorage: { source: unknown; adapter: StorageAdapter } | null = null;
let bundleWorldStorage: { source: unknown; adapter: WorldStorageAdapter } | null = null;
export function getLevelStorage(): StorageAdapter {
  const bundle = activeBundle();
  if (!bundle) return levelStorage;
  if (bundleLevelStorage?.source !== bundle) bundleLevelStorage = { source: bundle, adapter: new BundleLevelStorage(bundle) };
  return bundleLevelStorage.adapter;
}

export function getWorldStorage(): WorldStorageAdapter {
  const bundle = activeBundle();
  if (!bundle) return worldStorage;
  if (bundleWorldStorage?.source !== bundle) bundleWorldStorage = { source: bundle, adapter: new BundleWorldStorage(bundle) };
  return bundleWorldStorage.adapter;
}
