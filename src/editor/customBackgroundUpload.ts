const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Reads/downscales/re-encodes a user-picked image file into a
 * background-ready JPEG data URL (see BackgroundFileInput for how the
 * file itself gets picked).
 *
 * Downscaling (capped at MAX_DIMENSION on the longer side) and re-encoding
 * as JPEG matter for a reason none of the game's other art needs to care
 * about: this image isn't a build asset, it lives inline in the level's
 * own saved JSON in localStorage (see LevelData.customBackgroundData), so
 * an unmodified multi-megabyte photo would eat a meaningful chunk of that
 * quota per level. Background art doesn't need per-pixel fidelity the way
 * tile/entity sprites do, so the quality trade is an easy one.
 */
export function readAndDownscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Not a valid image"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
