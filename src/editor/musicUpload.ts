// Unlike a background image, audio can't be meaningfully downscaled
// client-side without a real transcoder, so instead of shrinking the file
// this just refuses anything too big to comfortably fit in the rest of a
// level's localStorage budget alongside its background image/grid data —
// a clear, immediate error beats a save that's doomed to hit the
// browser's storage quota anyway (see LocalStorageAdapter.save's own
// try/catch for what that failure looks like).
const MAX_MUSIC_BYTES = 4 * 1024 * 1024;

export class MusicTooLargeError extends Error {
  constructor(public readonly sizeBytes: number) {
    super(`File is ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB; the limit is ${MAX_MUSIC_BYTES / (1024 * 1024)}MB`);
  }
}

/** Reads a user-picked audio file into a data URL as-is (no re-encoding —
 * see musicLoader.ts for how it's registered as a playable Phaser sound). */
export function readAudioAsDataUrl(file: File): Promise<string> {
  if (file.size > MAX_MUSIC_BYTES) return Promise.reject(new MusicTooLargeError(file.size));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
