/**
 * Lighter/darker variants of a palette colour.
 *
 * Pixel art is mostly shading, and a fixed palette gives you none: PICO-8's
 * blues are three unrelated hues, not a ramp. So the Skin Creator derives a
 * ramp from whichever colour is selected rather than making you find a
 * neighbouring swatch that happens to be close.
 *
 * Mixing toward white/black rather than scaling the channels, because scaling
 * cannot lighten black at all (0 × 1.25 is still 0) — the one case a "25%
 * brighter" button most obviously has to handle.
 */

/** How far each step moves toward white or black. */
export const SHADE_STEP = 0.25;

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** "#aabbcc" (any case, with or without the #) -> [r, g, b], or null. */
export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Always lower-case and #-prefixed, so two spellings of one colour compare
 * equal — the palettes themselves mix cases ("#FFF1E8" and "#1a1c2c"). */
export function formatHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

export const normalizeHex = (hex: string): string | null => {
  const rgb = parseHex(hex);
  return rgb ? formatHex(rgb) : null;
};

/**
 * `amount` > 0 mixes toward white, < 0 toward black. Returns null for an
 * unparseable input so a corrupted stored colour can't paint something odd.
 */
export function shadeColor(hex: string, amount: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  return formatHex(rgb.map((c) => c + (target - c) * t) as [number, number, number]);
}

/**
 * The ramp shown beside the palette: one step darker, the colour itself, one
 * step lighter.
 *
 * `darker`/`lighter` come back null when the step is a no-op — black cannot go
 * darker and white cannot go lighter, and a swatch that visibly does nothing
 * when clicked is worse than one swatch fewer.
 */
export function shadeRamp(hex: string, step = SHADE_STEP): { darker: string | null; base: string | null; lighter: string | null } {
  const base = normalizeHex(hex);
  if (!base) return { darker: null, base: null, lighter: null };
  const darker = shadeColor(base, -step);
  const lighter = shadeColor(base, step);
  return {
    darker: darker === base ? null : darker,
    base,
    lighter: lighter === base ? null : lighter,
  };
}
