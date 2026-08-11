import { LevelTheme } from "./themes";

export type BackgroundSceneId =
  | "grass-sky"
  | "desert-sky"
  | "starfield"
  | "pirate-cove"
  | "overgrown-ruins"
  | "snowy-peaks";

interface ParallaxLayerDef {
  textureKey: string;
  /** Fraction of the player's X movement this layer shifts by — smaller
   * reads as "further away". 0 would be a fixed backdrop. */
  factor: number;
  tileScale: number;
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
 * stored on `LevelData.background`. `grass-sky`/`desert-sky`/`starfield`
 * reuse the pre-existing theme-matched art (Kenney sky tiles, the
 * procedural castle starfield — see BootScene.preload / generateTextures.ts)
 * as three entries in the same pool; the rest are original painted scenes
 * from `scripts/generate-painted-backgrounds.py`, each ~4x the canvas
 * width so the tile boundary is never actually seen at today's level-size
 * cap (see that script's docstring for the exact math) — replacing the old
 * complaint that the small 24px Kenney sky tile's repeat was obvious.
 */
export const BACKGROUND_SCENES: BackgroundScene[] = [
  {
    id: "grass-sky",
    label: "Grass Sky",
    layers: [
      { textureKey: "bg-grass-far", factor: 0.05, tileScale: 4 },
      { textureKey: "bg-grass-near", factor: 0.15, tileScale: 4 },
    ],
  },
  {
    id: "desert-sky",
    label: "Desert Sky",
    layers: [
      { textureKey: "bg-desert-far", factor: 0.05, tileScale: 4 },
      { textureKey: "bg-desert-near", factor: 0.15, tileScale: 4 },
    ],
  },
  {
    id: "starfield",
    label: "Starfield",
    layers: [
      { textureKey: "bg-castle-far", factor: 0.04, tileScale: 1 },
      { textureKey: "bg-castle-near", factor: 0.12, tileScale: 1 },
    ],
  },
  {
    id: "pirate-cove",
    label: "Pirate Cove",
    layers: [
      { textureKey: "bg-pirate-cove-far", factor: 0.05, tileScale: 1 },
      { textureKey: "bg-pirate-cove-near", factor: 0.15, tileScale: 1 },
    ],
  },
  {
    id: "overgrown-ruins",
    label: "Overgrown Ruins",
    layers: [
      { textureKey: "bg-overgrown-ruins-far", factor: 0.05, tileScale: 1 },
      { textureKey: "bg-overgrown-ruins-near", factor: 0.15, tileScale: 1 },
    ],
  },
  {
    id: "snowy-peaks",
    label: "Snowy Peaks",
    layers: [
      { textureKey: "bg-snowy-peaks-far", factor: 0.05, tileScale: 1 },
      { textureKey: "bg-snowy-peaks-near", factor: 0.15, tileScale: 1 },
    ],
  },
];

const DEFAULT_BY_THEME: Record<LevelTheme, BackgroundSceneId> = {
  grass: "grass-sky",
  desert: "desert-sky",
  castle: "starfield",
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
