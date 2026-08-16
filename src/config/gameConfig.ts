export const TILE_SIZE = 32;

export const GRID_COLS = 20;
export const GRID_ROWS = 12;

export const MAX_GRID_COLS = 60;
export const MAX_GRID_ROWS = 34;

// The editor's menus dock as two vertical panels flanking the grid — a
// left "Palette" panel (category chip + icon grid + skins) and a right
// "Level Settings" panel (Background/Music/Clear) — with a header above
// and a stats footer below (see EditorUI.ts for the layout built on top
// of these).
export const LEFT_PANEL_WIDTH = 190;
export const RIGHT_PANEL_WIDTH = 220;

// Where tile (0,0)'s pixel origin sits — everything that converts a tile
// coordinate to a pixel position (the ground tilemap, entity markers/
// sprites, the hover highlight, pointer-to-tile math, StaticBackground) is
// offset by this so the grid renders to the right of the left panel
// instead of flush against the canvas edge. EditorScene and PlayScene both
// use it — PlayScene has no panels of its own, but keeping the same origin
// means Test Play doesn't visually shift the level sideways.
export const GRID_ORIGIN_X = LEFT_PANEL_WIDTH;

// The header (Level Name/Undo/Redo/Save/Test Play/Menu/Eraser in
// EditorScene) sits above the grid, same reasoning as GRID_ORIGIN_X but on
// the vertical axis — shared with PlayScene so Test Play doesn't jump the
// level up or down either, even though PlayScene renders no header
// buttons of its own into that reserved strip (its existing HUD/back-
// button/volume-control overlay just settles into it instead of floating
// over row 0 of the grid, which is what they did before this margin
// existed). FOOTER_HEIGHT (stats: level size, cursor tile, entity count)
// is editor-only — PlayScene has nothing to put there, so its own grid
// only needs to account for the header, not the footer.
export const HEADER_HEIGHT = 56;
export const FOOTER_HEIGHT = 28;
export const GRID_ORIGIN_Y = HEADER_HEIGHT;

// Sized for the default/template grid (20x12) plus both panels, not
// MAX_GRID_COLS/MAX_GRID_ROWS — same "comfortable for typical levels, not
// the extreme case" philosophy the old toolbar-width sizing used. A level
// resized well past the default can extend under the right panel or past
// the canvas edge; that's a pre-existing limitation (GAME_WIDTH was never
// sized for the max), not something this layout pass introduces.
export const GAME_WIDTH = Math.max(
  GRID_COLS * TILE_SIZE + LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH,
  LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH + 4 * TILE_SIZE,
);
// header + grid + footer, with the side panels' own content (category
// chip + icon grid + skins on the left, Background/Music/Clear on the
// right — see EditorUI.ts) sized to fit within that same total rather
// than driving it, now that neither panel needs a whole stacked button
// list anymore.
export const GAME_HEIGHT = HEADER_HEIGHT + GRID_ROWS * TILE_SIZE + FOOTER_HEIGHT;

export const GRAVITY_Y = 900;
