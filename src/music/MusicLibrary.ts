export interface MusicAsset {
  id: string;
  name: string;
  audioData: string;
  uploadedBy: string;
  updatedAt: string;
}

/** A flat, shared pool — same shape/reasoning as
 * backgrounds/BackgroundLibrary.ts's BackgroundLibraryFile, just for
 * audio. *Which* track a level plays is a per-level choice
 * (LevelData.customMusicId), not anything in this file. */
export type MusicLibraryFile = MusicAsset[];
