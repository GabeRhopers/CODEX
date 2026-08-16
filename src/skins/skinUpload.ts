const MAX_DIMENSION = 128;

/**
 * Reads/downscales a user-picked image into a small PNG data URL sized
 * for an entity sprite — a much smaller MAX_DIMENSION than
 * customBackgroundUpload.ts's (entities render at roughly one tile,
 * 32px, so 128px covers even a high-DPI display with room to spare) and
 * PNG rather than JPEG: JPEG has no alpha channel, and would turn every
 * transparent pixel in a reskinned enemy/item/decor sprite solid white
 * (or black), which is exactly the pixels a floating ghost or a small
 * item icon relies on most.
 */
export function readAndDownscaleSkinImage(file: File): Promise<string> {
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
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
