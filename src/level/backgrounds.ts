import { LevelTheme } from "./themes";

export type BackgroundSceneId = "starfield" | "pirate-cove" | "overgrown-ruins" | "snowy-peaks";

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
 * never a live-tiling TileSprite. `grass-sky`/`desert-sky`/`icy-sky`/
 * `jungle-sky` used to live here too — small 24x24 Kenney sky tiles baked
 * up to this same large-canvas format (see git history and
 * scripts/composite-sky-backgrounds.py) so the zoom+pan renderer never had
 * to stretch a small source image. That baking fixed the *edge/seam*
 * problem, but not the underlying one: a small tile repeated across a
 * large canvas still reads as an obvious grid of identical tiny icons up
 * close — a "wallpaper" look, not real scenery — so those four were
 * dropped from the pool entirely rather than patched further.
 * `starfield` (the procedural castle night sky, generated directly at
 * 2048x476 by `drawStarfield`) doesn't have that problem — its star
 * scatter is randomized across the whole canvas, not one small tile
 * repeated — and the other three (`pirate-cove`/`overgrown-ruins`/
 * `snowy-peaks`) are original painted scenes from
 * scripts/generate-painted-backgrounds.py, authored at this size from the
 * start with no tiling involved at all.
 */
export const BACKGROUND_SCENES: BackgroundScene[] = [
  {
    id: "starfield",
    label: "Starfield",
    layers: [
      { textureKey: "bg-castle-far", factor: 0.04 },
      { textureKey: "bg-castle-near", factor: 0.12 },
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
  grass: "overgrown-ruins",
  desert: "pirate-cove",
  castle: "starfield",
  snow: "snowy-peaks",
};

/** What a level shows before anyone's touched the background picker — a
 * scene that reads reasonably against its theme (exact per-theme sky
 * tiles no longer exist — see BACKGROUND_SCENES's docstring — so this is
 * a best-fit pick, not a guaranteed match), so existing levels (saved
 * before this feature existed, with no `background` field) still render
 * something sensible. */
export function defaultBackgroundForTheme(theme: LevelTheme): BackgroundSceneId {
  return DEFAULT_BY_THEME[theme];
}

/** Takes just the two fields it needs (not a full LevelData) so this module
 * never has to import LevelSchema — LevelSchema imports BackgroundSceneId
 * from here instead, and a cycle would break that. Falls back to the
 * theme default not just when `background` is unset but also when it's
 * set to an id no longer in the pool (e.g. a level saved back when
 * grass-sky/desert-sky/icy-sky/jungle-sky still existed), so an old save
 * degrades to a different scene instead of crashing the scene load. */
export function resolveBackground(level: { background?: BackgroundSceneId; theme: LevelTheme }): BackgroundSceneId {
  if (level.background && BACKGROUND_SCENES.some((scene) => scene.id === level.background)) {
    return level.background;
  }
  return defaultBackgroundForTheme(level.theme);
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
