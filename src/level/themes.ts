/**
 * Visual theme for a level: a background color plus a recolored ground
 * tileset. Purely cosmetic — themes never touch gameplay data (tile
 * indices, entity positions, collision) so TilePainter/groundAutotile stay
 * theme-agnostic and a level can be reskinned just by changing this field.
 */
export type LevelTheme = "grass" | "desert" | "castle";

export const DEFAULT_THEME: LevelTheme = "grass";

export interface ThemeColors {
  background: number;
  dirt: number;
  cap: number;
  dot: number;
}

export const THEMES: Record<LevelTheme, ThemeColors> = {
  grass: { background: 0x1a1a2e, dirt: 0x8b5a2b, cap: 0x4caf50, dot: 0x6b3f1d },
  desert: { background: 0x4a3413, dirt: 0xd2a05a, cap: 0xe8c477, dot: 0x9c6b32 },
  castle: { background: 0x0d0d14, dirt: 0x5a5a66, cap: 0x8d8d9c, dot: 0x38383f },
};

export function groundTilesetKey(theme: LevelTheme): string {
  return `tile-ground-tileset-${theme}`;
}

export function groundIconKey(theme: LevelTheme): string {
  return `tile-ground-icon-${theme}`;
}
