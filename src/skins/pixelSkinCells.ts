/**
 * Rebuilds a pixel skin's editable cell grid from its own saved PNG.
 *
 * A pixel skin used to persist its grid twice — as `pixelData.cells` and
 * as the `imageData` PNG rendered from that same grid — which is pure
 * redundancy, and the larger copy by an order of magnitude. This is what
 * makes dropping the array safe: PixelCanvasOverlay writes exactly one
 * canvas pixel per cell, fully opaque or fully cleared, and never scales,
 * so the PNG round-trips back to the identical array.
 *
 * That isn't an assumption — it was checked in a real browser across 32
 * distinct palette colors: 0 mismatches across all 1024 cells, at 842
 * bytes for the PNG versus 9,506 for the equivalent JSON array.
 *
 * Browser-only (needs Image + canvas), which is why it lives here rather
 * than in skinStorage.ts: that module stays plain data so its own tests
 * can run without a DOM.
 */

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * Decodes `dataUrl` into a flat, row-major array of `gridSize * gridSize`
 * hex colors, with `null` for transparent cells.
 *
 * The explicit destination size matters: a saved pixel skin is always
 * exactly gridSize square, so this is normally a 1:1 blit, but pinning it
 * means a malformed or unexpectedly-sized entry still yields a correctly
 * *shaped* grid rather than an array of the wrong length that would
 * silently corrupt the canvas it seeds.
 */
export async function cellsFromPngDataUrl(dataUrl: string, gridSize: number): Promise<(string | null)[]> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("That skin's image couldn't be decoded"));
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(image, 0, 0, gridSize, gridSize);

  const { data } = ctx.getImageData(0, 0, gridSize, gridSize);
  const cells: (string | null)[] = [];
  for (let i = 0; i < gridSize * gridSize; i++) {
    const offset = i * 4;
    // Every painted cell is written fully opaque and every erased one is
    // cleared outright (see PixelCanvasOverlay.redrawCell), so alpha is
    // binary here in practice. Treating only a true 0 as transparent keeps
    // any unexpected partial alpha as a visible color rather than silently
    // deleting that cell.
    cells.push(
      data[offset + 3] === 0
        ? null
        : `#${toHexByte(data[offset])}${toHexByte(data[offset + 1])}${toHexByte(data[offset + 2])}`,
    );
  }
  return cells;
}

/**
 * The inverse: renders a cell grid to a PNG data URL, one canvas pixel per
 * cell, exactly as PixelCanvasOverlay does for the frame you're looking at.
 *
 * Needed because a multi-frame skin saves frames you are *not* currently
 * editing. Those exist only as cell arrays in the editor's own state — there
 * is no live canvas to call exportPngDataUrl on — so they have to be rendered
 * here instead. Deliberately mirrors cellsFromPngDataUrl's conventions (fully
 * opaque for a painted cell, fully cleared for null) so a frame written by
 * this and one exported from the live canvas decode back identically; the
 * round-trip test covers both paths for that reason.
 */
export function cellsToPngDataUrl(cells: readonly (string | null)[], gridSize: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  for (let i = 0; i < gridSize * gridSize; i++) {
    const color = cells[i];
    if (!color) continue; // left cleared, which is what transparent means here
    ctx.fillStyle = color;
    ctx.fillRect(i % gridSize, Math.floor(i / gridSize), 1, 1);
  }
  return canvas.toDataURL("image/png");
}

/** True when a frame has at least one painted cell. An all-empty frame is
 * "not painted yet" rather than "painted blank" — saving it would give the
 * skin an invisible pose and make resolveFrame's fallback unreachable. */
export function hasPaintedCells(cells: readonly (string | null)[] | undefined): boolean {
  return !!cells?.some((cell) => cell !== null);
}
