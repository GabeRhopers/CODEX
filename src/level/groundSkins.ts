/**
 * A "ground skin" is a purely cosmetic look for a ground/brick/bounce/
 * hazard block — grass, desert, castle, or snow. This replaces an earlier
 * "level theme" design where a whole level picked *one* skin for every
 * block in it (first as a fixed field, later as a still-level-wide
 * cycle button) — both meant only one skin's ground tile was ever
 * paintable at a time. A skin is now chosen per *block*, not per level:
 * every skin's Ground/Brick/Bounce/hazard variants are always available
 * together in the editor's palette, and a single level can freely mix
 * them (see LevelSchema.ts's GROUND_GRASS_TILE/GROUND_DESERT_TILE/
 * GROUND_CASTLE_TILE/GROUND_SNOW_TILE and groundAutotile.ts for how a
 * stored tile value maps to a render frame in the combined tileset).
 *
 * What's left here is just the small pieces still needed once you're
 * past that: per-skin procedural draw colors (castle's ground/brick/
 * bounce/lava have no real Kenney art, so they're generated — see
 * generateTextures.ts) and the texture-key naming convention shared by
 * real-art and procedural skins alike.
 */
export type GroundSkin = "grass" | "desert" | "castle" | "snow";

/** Iteration order used everywhere a skin list matters: the combined
 * ground tileset's per-skin gid ranges (groundAutotile.ts, EditorScene/
 * PlayScene each add one Tileset per skin in this order) and the
 * Palette's ground-block ordering. Changing this order changes gid math
 * — see groundAutotile.ts's GROUND_KIND_FRAMES. */
export const GROUND_SKINS: GroundSkin[] = ["grass", "desert", "castle", "snow"];

export interface SkinColors {
  dirt: number;
  cap: number;
  dot: number;
}

/** Only castle's ground is drawn procedurally (see generateTextures.ts) —
 * grass/desert/snow use real Kenney art and never read this — but every
 * skin still gets an entry since nothing here special-cases which ones a
 * given skin happens to use. */
export const SKIN_COLORS: Record<GroundSkin, SkinColors> = {
  grass: { dirt: 0x8b5a2b, cap: 0x4caf50, dot: 0x6b3f1d },
  desert: { dirt: 0xd2a05a, cap: 0xe8c477, dot: 0x9c6b32 },
  castle: { dirt: 0x5a5a66, cap: 0x8d8d9c, dot: 0x38383f },
  snow: { dirt: 0x8ba0b8, cap: 0xf0f5fa, dot: 0x5c7186 },
};

/** The flat color every scene clears its camera to before anything else
 * draws — used to be per-theme (see git history); now there's no
 * level-wide theme to key it off, so it's just one constant. Barely
 * visible in practice since the parallax background and ground tiles
 * cover almost the whole canvas. */
export const CANVAS_BACKGROUND_COLOR = 0x1a1a2e;

export function groundTilesetKey(skin: GroundSkin): string {
  return `tile-ground-tileset-${skin}`;
}

export function groundIconKey(skin: GroundSkin): string {
  return `tile-ground-icon-${skin}`;
}

/** Brick/Bounce/Water are visually identical across grass/desert/snow —
 * they share one real Kenney tile each (see prepare-kenney-assets.py) —
 * but castle's tileset is entirely procedural (its own grey brick,
 * orange bounce pad, and lava standing in for water), so it needs its
 * own icon texture. `block` names the block *kind*; the icon only
 * actually varies for `skin === "castle"`. */
export function blockIconKey(skin: GroundSkin, block: "brick" | "bounce" | "water"): string {
  return skin === "castle" ? `tile-${block}-icon-castle` : `tile-${block}-icon`;
}
