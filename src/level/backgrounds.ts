import { LevelTheme } from "./themes";

export type BackgroundSceneId =
  | "grass-sky"
  | "desert-sky"
  | "starfield"
  | "icy-sky"
  | "jungle-sky"
  | "pirate-cove"
  | "overgrown-ruins"
  | "snowy-peaks";

interface ParallaxLayerDef {
  textureKey: string;
  /** Fraction of the player's X movement this layer shifts by — smaller
   * reads as "further away". 0 would be a fixed backdrop. */
  factor: number;
}

interface BackgroundScene {
  id: BackgroundSceneId;
  label: string;
  layers: ParallaxLayerDef[];
}

/**
 * A background *scene* is a separate, explicit choice from a level's
 * `theme` (grass/desert/castle, which only recolors the ground tileset and
 * the flat fallback background color — see themes.ts) — any scene can show
 * behind any theme, picked via EditorUI's "Background: ▶" cycle button and
 * stored on `LevelData.background`.
 *
 * Every scene here is a large, fixed-size (2048x476) image per layer,
 * rendered by ParallaxBackground.ts as a single zoomed, clamped-pan Image —
 * never a live-tiling TileSprite — so a repeat/seam is never visible
 * regardless of level size. `grass-sky`/`desert-sky`/`icy-sky`/`jungle-sky`
 * started life as tiny 24x24 Kenney sky tiles and `starfield` as a
 * procedural 128x128 star scatter; both were baked up to this same large
 * canvas format (see scripts/composite-sky-backgrounds.py and
 * generateTextures.ts's drawStarfield) specifically so they could drop the
 * old tiling technique. `pirate-cove`/`overgrown-ruins`/`snowy-peaks` are
 * original painted scenes from scripts/generate-painted-backgrounds.py,
 * already authored at this same 2048x476 size.
 */
export const BACKGROUND_SCENES: BackgroundScene[] = [
  {
    id: "grass-sky",
    label: "Grass Sky",
    layers: [
      { textureKey: "bg-grass-far", factor: 0.05 },
      { textureKey: "bg-grass-near", factor: 0.15 },
    ],
  },
  {
    id: "desert-sky",
    label: "Desert Sky",
    layers: [
      { textureKey: "bg-desert-far", factor: 0.05 },
      { textureKey: "bg-desert-near", factor: 0.15 },
    ],
  },
  {
    id: "starfield",
    label: "Starfield",
    layers: [
      { textureKey: "bg-castle-far", factor: 0.04 },
      { textureKey: "bg-castle-near", factor: 0.12 },
    ],
  },
  {
    id: "icy-sky",
    label: "Icy Sky",
    layers: [
      { textureKey: "bg-icy-sky-far", factor: 0.05 },
      { textureKey: "bg-icy-sky-near", factor: 0.15 },
    ],
  },
  {
    id: "jungle-sky",
    label: "Jungle Sky",
    layers: [
      { textureKey: "bg-jungle-sky-far", factor: 0.05 },
      { textureKey: "bg-jungle-sky-near", factor: 0.15 },
    ],
  },
  {
    id: "pirate-cove",
    label: "Pirate Cove",
    layers: [
      { textureKey: "bg-pirate-cove-far", factor: 0.05 },
      { textureKey: "bg-pirate-cove-near", factor: 0.15 },
    ],
  },
  {
    id: "overgrown-ruins",
    label: "Overgrown Ruins",
    layers: [
      { textureKey: "bg-overgrown-ruins-far", factor: 0.05 },
      { textureKey: "bg-overgrown-ruins-near", factor: 0.15 },
    ],
  },
  {
    id: "snowy-peaks",
    label: "Snowy Peaks",
    layers: [
      { textureKey: "bg-snowy-peaks-far", factor: 0.05 },
      { textureKey: "bg-snowy-peaks-near", factor: 0.15 },
    ],
  },
];

const DEFAULT_BY_THEME: Record<LevelTheme, BackgroundSceneId> = {
  grass: "grass-sky",
  desert: "desert-sky",
  castle: "starfield",
  snow: "icy-sky",
};

/** What a level shows before anyone's touched the background picker — the
 * scene that already matched its theme, so existing levels (saved before
 * this feature existed, with no `background` field) render unchanged. */
export function defaultBackgroundForTheme(theme: LevelTheme): BackgroundSceneId {
  return DEFAULT_BY_THEME[theme];
}

/** Takes just the two fields it needs (not a full LevelData) so this module
 * never has to import LevelSchema — LevelSchema imports BackgroundSceneId
 * from here instead, and a cycle would break that. */
export function resolveBackground(level: { background?: BackgroundSceneId; theme: LevelTheme }): BackgroundSceneId {
  return level.background ?? defaultBackgroundForTheme(level.theme);
}

export function backgroundScene(id: BackgroundSceneId): BackgroundScene {
  const scene = BACKGROUND_SCENES.find((s) => s.id === id);
  if (!scene) throw new Error(`Unknown background scene: ${id}`);
  return scene;
}

export function nextBackgroundId(id: BackgroundSceneId): BackgroundSceneId {
  const index = BACKGROUND_SCENES.findIndex((s) => s.id === id);
  return BACKGROUND_SCENES[(index + 1) % BACKGROUND_SCENES.length].id;
}
