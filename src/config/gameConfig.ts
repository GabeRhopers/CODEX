export const TILE_SIZE = 32;

export const GRID_COLS = 20;
export const GRID_ROWS = 12;

export const MAX_GRID_COLS = 60;
export const MAX_GRID_ROWS = 34;

// The editor's menus dock as two vertical panels flanking the grid — Tools
// (category tabs + palette) on the left, Actions (Test Play/Save/Menu/
// Clear/Undo/Redo/Background) on the right — rather than one row below it.
// See EditorUI.ts for the layout built on top of these.
export const LEFT_PANEL_WIDTH = 190;
export const RIGHT_PANEL_WIDTH = 220;

// Where tile (0,0)'s pixel origin sits — everything that converts a tile
// coordinate to a pixel position (the ground tilemap, entity markers/
// sprites, the hover highlight, pointer-to-tile math, StaticBackground) is
// offset by this so the grid renders to the right of the Tools panel
// instead of flush against the canvas edge. EditorScene and PlayScene both
// use it — PlayScene has no panels of its own, but keeping the same origin
// means Test Play doesn't visually shift the level sideways.
export const GRID_ORIGIN_X = LEFT_PANEL_WIDTH;

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
// Taller than the bare grid (GRID_ROWS * TILE_SIZE = 384) since the Tools
// panel's category tabs + a 2-column icon grid for the widest category
// (Blocks, 11 brushes) need more vertical room than 12 rows of tiles do —
// see EditorUI.ts's layout constants. Both panels span this full height,
// masked-off dead space below the grid (within its own x-range) included,
// so nothing past the grid's real height reads as paintable.
export const GAME_HEIGHT = 560;

export const GRAVITY_Y = 900;
