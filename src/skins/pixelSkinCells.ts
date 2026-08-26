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

/** Generous next to a data: URL decode, which is local and normally instant —
 * this is a stuck-forever backstop, not a performance budget, and a CI runner
 * under load is exactly where a slow-but-fine decode happens. */
const DECODE_TIMEOUT_MS = 10_000;

/**
 * Decodes a data URL into an Image, **bounded**.
 *
 * Both decode paths below used to await `onload` with no timeout, which means
 * the promise can simply never settle: if neither `load` nor `error` fires,
 * every caller waits forever. SkinEditorScene.openForEditing is where that
 * hurts — it awaits one of these per painted frame, so a multi-frame skin
 * decodes four in a row, and a single lost event leaves the Skin Creator in
 * browse mode with its target already set, no status text, and Edit looking
 * like a dead button with nothing in the console. That is exactly the state a
 * long-running CI flake reported: `mode=browse status="" target=<set>`.
 *
 * Rejecting turns that silent hang into the visible "Couldn't open that skin"
 * message openForEditing's catch already knows how to show, leaving the browse
 * list usable so it can be retried. It does not make a lost event impossible —
 * it makes it sayable, which is what the un-diagnosable version was not.
 */
function loadImage(dataUrl: string, errorMessage: string): Promise<HTMLImageElement> {
  const image = new Image();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out decoding that image")), DECODE_TIMEOUT_MS);
    const settle = (fn: () => void) => () => {
      clearTimeout(timer);
      fn();
    };
    image.onload = settle(() => resolve(image));
    image.onerror = settle(() => reject(new Error(errorMessage)));
    image.src = dataUrl;
  });
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
  const image = await loadImage(dataUrl, "That skin's image couldn't be decoded");

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

/**
 * Decodes any image into a cell grid **without distorting it** — the tracing
 * path, as opposed to cellsFromPngDataUrl above.
 *
 * The two differ deliberately. A saved skin is always exactly gridSize square,
 * so that function's straight stretch to gridSize is a 1:1 blit and its
 * explicit destination size is a guard against a malformed entry. A tracing
 * source is arbitrary art: the built-in frames measure 29x48, 30x48 and 40x40,
 * so stretching one to fill a square grid would widen Grampa by more than half
 * again and make him worthless as a guide. This scales to fit and centres,
 * matching what the on-screen reference layer shows (`background-size:
 * contain`), so what you trace over is what you get.
 */
export async function cellsFromImageFitted(dataUrl: string, gridSize: number): Promise<(string | null)[]> {
  const image = await loadImage(dataUrl, "That image couldn't be decoded");

  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");

  const scale = Math.min(gridSize / image.width, gridSize / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  ctx.drawImage(
    image,
    Math.floor((gridSize - drawWidth) / 2),
    Math.floor((gridSize - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );

  const { data } = ctx.getImageData(0, 0, gridSize, gridSize);
  const cells: (string | null)[] = [];
  for (let i = 0; i < gridSize * gridSize; i++) {
    const offset = i * 4;
    // Hand-drawn art is full of partial alpha (about a third of Grampa's
    // pixels), and the canvas has no such thing — a cell is painted or it is
    // not. Anything at least half opaque becomes a solid cell; the rest is
    // dropped, which is what keeps a traced silhouette crisp instead of
    // fringed with near-invisible edge pixels.
    cells.push(
      data[offset + 3] < 128
        ? null
        : `#${toHexByte(data[offset])}${toHexByte(data[offset + 1])}${toHexByte(data[offset + 2])}`,
    );
  }
  return cells;
}
