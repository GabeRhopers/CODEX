/**
 * Visual theme for a level: a background color plus a recolored ground
 * tileset. Purely cosmetic — themes never touch gameplay data (tile
 * indices, entity positions, collision) so TilePainter/groundAutotile stay
 * theme-agnostic and a level can be reskinned just by changing this field.
 */
export type LevelTheme = "grass" | "desert" | "castle" | "snow";

export const DEFAULT_THEME: LevelTheme = "grass";

export interface ThemeColors {
  background: number;
  dirt: number;
  cap: number;
  dot: number;
}

/** dirt/cap/dot only matter for a theme whose ground tileset is drawn
 * procedurally (currently just castle — see generateTextures.ts); grass,
 * desert, and snow use real Kenney art instead and only ever read
 * `background` (the camera clear color and the Templates-list swatch —
 * see the THEMES[...] call sites), but every theme still needs all 4
 * fields filled in since ThemeColors doesn't special-case which ones a
 * given theme happens to use. */
export const THEMES: Record<LevelTheme, ThemeColors> = {
  grass: { background: 0x1a1a2e, dirt: 0x8b5a2b, cap: 0x4caf50, dot: 0x6b3f1d },
  desert: { background: 0x4a3413, dirt: 0xd2a05a, cap: 0xe8c477, dot: 0x9c6b32 },
  castle: { background: 0x0d0d14, dirt: 0x5a5a66, cap: 0x8d8d9c, dot: 0x38383f },
  snow: { background: 0x25344a, dirt: 0x8ba0b8, cap: 0xf0f5fa, dot: 0x5c7186 },
};

export function groundTilesetKey(theme: LevelTheme): string {
  return `tile-ground-tileset-${theme}`;
}

export function groundIconKey(theme: LevelTheme): string {
  return `tile-ground-icon-${theme}`;
}

/** Brick/Bounce/Water are visually identical across grass/desert/snow —
 * they share one real Kenney tile each (see prepare-kenney-assets.py) —
 * but castle's tileset is entirely procedural (its own grey brick, orange
 * bounce pad, and lava standing in for water — see generateTextures.ts),
 * so its icon has to be a separate texture, not the shared real-art one.
 * Mirrors groundIconKey's per-theme pattern for the three blocks that
 * *mostly* don't need it. */
export function blockIconKey(theme: LevelTheme, block: "brick" | "bounce" | "water"): string {
  return theme === "castle" ? `tile-${block}-icon-castle` : `tile-${block}-icon`;
}

const THEME_ORDER: LevelTheme[] = ["grass", "desert", "castle", "snow"];

/** Cycles to the next theme in THEME_ORDER, wrapping around — mirrors
 * backgrounds.ts's nextBackgroundId, driving EditorUI's "Theme: ▶" cycle
 * button so every ground skin (including Snow's) is reachable from any
 * level, not just levels that started out on that theme. */
export function nextTheme(theme: LevelTheme): LevelTheme {
  const index = THEME_ORDER.indexOf(theme);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}
