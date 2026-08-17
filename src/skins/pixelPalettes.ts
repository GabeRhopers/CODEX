/** The Skin Creator's 5 preset color palettes (see SkinEditorScene /
 * PixelCanvasOverlay) — a pixel-art canvas is palette-*constrained*, not
 * a free color wheel, the same way every real pixel-art tool works: it's
 * what keeps a 32x32 sprite reading as one cohesive piece instead of a
 * smear of arbitrary colors. Four of these are well-known, freely-shared
 * reference palettes from the pixel-art community (plain RGB values, not
 * licensed assets — PICO-8's and the Game Boy's are literally fixed by
 * hardware, and Sweetie 16/DawnBringer 16 are long-established public
 * palettes) plus one exact palette needing no external reference at all
 * (Bright 8 — every pure on/off combination of R/G/B). Deliberately a
 * spread of sizes (4 to 16 colors) and moods (muted retro vs. vivid
 * primary) rather than 5 similar-looking options.
 *
 * Colors are plain hex strings, stored directly per-cell in a saved
 * skin's PixelSkinData (see CustomSkins.ts) rather than as an index into
 * this array — so editing these palettes later can never reinterpret an
 * already-saved skin's colors. */
export interface PixelPalette {
  id: string;
  name: string;
  colors: string[];
}

export const PIXEL_PALETTES: PixelPalette[] = [
  {
    id: "pico8",
    name: "PICO-8",
    colors: [
      "#000000",
      "#1D2B53",
      "#7E2553",
      "#008751",
      "#AB5236",
      "#5F574F",
      "#C2C3C7",
      "#FFF1E8",
      "#FF004D",
      "#FFA300",
      "#FFEC27",
      "#00E436",
      "#29ADFF",
      "#83769C",
      "#FF77A8",
      "#FFCCAA",
    ],
  },
  {
    id: "sweetie16",
    name: "Sweetie 16",
    colors: [
      "#1a1c2c",
      "#5d275d",
      "#b13e53",
      "#ef7d57",
      "#ffcd75",
      "#a7f070",
      "#38b764",
      "#257179",
      "#29366f",
      "#3b5dc9",
      "#41a6f6",
      "#73eff7",
      "#f4f4f4",
      "#94b0c2",
      "#566c86",
      "#333c57",
    ],
  },
  {
    id: "dawnbringer16",
    name: "DawnBringer 16",
    colors: [
      "#140c1c",
      "#442434",
      "#30346d",
      "#4e4a4e",
      "#854c30",
      "#346524",
      "#d04648",
      "#757161",
      "#597dce",
      "#d27d2c",
      "#8595a1",
      "#6daa2c",
      "#d2aa99",
      "#6dc2ca",
      "#dad45e",
      "#deeed6",
    ],
  },
  {
    id: "gameboy",
    name: "Game Boy",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    id: "bright8",
    name: "Bright 8",
    colors: ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff"],
  },
];

export const DEFAULT_PIXEL_PALETTE_ID = PIXEL_PALETTES[0].id;

export function findPalette(id: string): PixelPalette {
  return PIXEL_PALETTES.find((p) => p.id === id) ?? PIXEL_PALETTES[0];
}
