export const TILE_SIZE = 32;

export const GRID_COLS = 20;
export const GRID_ROWS = 12;

export const MAX_GRID_COLS = 60;
export const MAX_GRID_ROWS = 34;

export const TOOLBAR_HEIGHT = 92; // a category-tabs row + a brush-icon row (see EditorUI)
export const TOOLBAR_MIN_WIDTH = 1340; // room for the category tabs/action buttons row (incl. Theme/Background pickers) and the widest brush category row

// The canvas can be wider than the tile grid (extra toolbar room shows as
// backdrop past the grid's right edge) but never narrower than the grid.
export const GAME_WIDTH = Math.max(GRID_COLS * TILE_SIZE, TOOLBAR_MIN_WIDTH);
export const GAME_HEIGHT = GRID_ROWS * TILE_SIZE + TOOLBAR_HEIGHT;

export const GRAVITY_Y = 900;
