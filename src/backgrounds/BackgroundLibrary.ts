export interface BackgroundAsset {
  id: string;
  name: string;
  imageData: string;
  uploadedBy: string;
  updatedAt: string;
}

/** A flat, shared pool — unlike skins.json (keyed per brush), a
 * background isn't "for" any one thing, so every uploaded image just
 * lives in one list. See backgroundLibraryStorage.ts's docstring for why
 * this is shared across all 3 profiles the same way skins are, and why
 * *which* one a level uses is a per-level choice stored on the level
 * itself (LevelData.customBackgroundId) rather than anything in this
 * file. */
export type BackgroundLibraryFile = BackgroundAsset[];
