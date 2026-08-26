import { normalizeHex } from "./colorShades";

/**
 * "Yours" — the palette that fills itself.
 *
 * Two problems, one answer. First, a colour outside the active palette used to
 * be *thrown away*: the swatch row reset `currentColor` to `palette.colors[0]`
 * whenever the selected colour wasn't one of its own, and the canvas is rebuilt
 * on every frame and palette switch — so sampling a colour off a traced
 * reference, then moving to the next frame, silently lost it. Second, there was
 * no way to keep a colour you liked at all.
 *
 * So rather than a palette you have to build by hand — which would need a
 * colour picker this app doesn't have — this one collects the colours you
 * actually used that no preset offered: eyedropper samples and the shade ramp's
 * lighter/darker steps. Those are precisely the colours that had nowhere to
 * live.
 *
 * Stored in localStorage rather than Drive because it is a *tool preference*,
 * like the current tool and zoom level (see SkinEditorScene's field comments),
 * not part of any skin. Same shape and same never-trust-storage handling as
 * audioPrefs.ts.
 */

const STORAGE_KEY = "rhopers:custom-palette";
/** One row's worth, matching the widest preset palette, so the "Yours" tab
 * lays out exactly like every other tab and needs no scrolling. */
export const MAX_CUSTOM_COLORS = 16;

export const CUSTOM_PALETTE_ID = "yours";

/**
 * Most-recent-first, de-duplicated, capped. Returns the same array instance
 * when nothing changed, so a caller can skip a pointless write.
 */
export function addCustomColor(colors: string[], color: string, max = MAX_CUSTOM_COLORS): string[] {
  const normalized = normalizeHex(color);
  if (!normalized) return colors;
  // Already at the front: nothing to do. Anywhere else, it moves to the front,
  // because "the colours I reach for" is more useful than "the order I first
  // found them".
  if (colors[0] === normalized) return colors;
  return [normalized, ...colors.filter((c) => c !== normalized)].slice(0, max);
}

export function removeCustomColor(colors: string[], color: string): string[] {
  const normalized = normalizeHex(color);
  return normalized ? colors.filter((c) => c !== normalized) : colors;
}

/** Drops anything unparseable and any duplicate, so a hand-edited or
 * partially-corrupted entry can't put a broken swatch on screen. */
export function sanitizeCustomColors(raw: unknown, max = MAX_CUSTOM_COLORS): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeHex(entry);
    if (normalized && !out.includes(normalized)) out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

export function loadCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeCustomColors(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveCustomColors(colors: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // A full or blocked localStorage must not take the editor down with it —
    // the colours are a convenience, the drawing is the work.
  }
}
