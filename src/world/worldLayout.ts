/**
 * Where a world's levels sit on its map.
 *
 * The map is a coarse grid of cells rather than free pixels: nodes line up on
 * their own, the paths between them stay clean runs instead of arbitrary
 * angles, and two levels can never end up half-overlapping.
 *
 * Cells, not pixels, is also what lets the *maker* and the *map* agree. The
 * maker draws its grid in the right half of the screen and the map screen uses
 * the full canvas, so they cannot share a pixel rect — they share cell
 * coordinates and each converts with its own rect (see `cellCenter`).
 *
 * Pure, no Phaser, so the arrangement rules are unit-testable on their own —
 * same split as canvasZoom.ts and skinSelection.ts.
 */

export const MAP_COLS = 8;
export const MAP_ROWS = 5;
/** A world holds at most one level per cell. Well past anything an MVP world
 * needs, and having a definite ceiling is what lets `resolveLayout` promise
 * every level a cell of its own rather than silently stacking two. */
export const MAX_NODES = MAP_COLS * MAP_ROWS;

export interface Cell {
  col: number;
  row: number;
}

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A stored layout: level id -> cell. Optional and partial by design, so a
 * world saved before the map existed still opens (see resolveLayout). */
export type WorldLayout = Record<string, Cell>;

const inBounds = (cell: Cell): boolean =>
  Number.isInteger(cell.col) &&
  Number.isInteger(cell.row) &&
  cell.col >= 0 &&
  cell.col < MAP_COLS &&
  cell.row >= 0 &&
  cell.row < MAP_ROWS;

export const cellKey = (cell: Cell): string => `${cell.col},${cell.row}`;

/**
 * The nth cell of a serpentine route: left to right, drop a row, right to
 * left. A snake rather than plain reading order because consecutive nodes then
 * always touch — reading order would jump the full width of the map at the end
 * of every row, and the path drawn between them would cut back across
 * everything below it.
 */
export function serpentineCell(index: number): Cell {
  const row = Math.floor(index / MAP_COLS);
  const within = index % MAP_COLS;
  return { col: row % 2 === 0 ? within : MAP_COLS - 1 - within, row };
}

/**
 * The default arrangement for a world that has never been laid out.
 *
 * A world that fits on one row gets spread across the **middle** of the map
 * rather than packed into the top-left corner: three nodes crammed against one
 * edge with three quarters of the map empty reads as a bug, not a route. Past
 * one row's worth it falls back to the serpentine, where packing is the point
 * — consecutive nodes need to stay neighbours once there are enough of them to
 * wrap.
 *
 * Either way this is only a starting point; the maker lets you drag any node
 * anywhere.
 */
export function autoArrange(levelIds: readonly string[]): WorldLayout {
  const layout: WorldLayout = {};
  const capped = levelIds.slice(0, MAX_NODES);

  if (capped.length <= MAP_COLS) {
    const row = Math.floor(MAP_ROWS / 2);
    const span = capped.length > 1 ? (MAP_COLS - 1) / (capped.length - 1) : 0;
    capped.forEach((id, i) => {
      layout[id] = { col: capped.length === 1 ? Math.floor(MAP_COLS / 2) : Math.round(i * span), row };
    });
    return layout;
  }

  capped.forEach((id, i) => {
    layout[id] = serpentineCell(i);
  });
  return layout;
}

/**
 * Every level id to a cell of its own.
 *
 * Keeps a stored cell when it is in bounds and still free, and otherwise hands
 * out the next free serpentine cell. That one rule covers every case that
 * matters: a world with no layout at all (opens auto-arranged, which is what
 * makes the field optional and the migration free), a world laid out before a
 * level was added (the newcomer slots in rather than landing on top of
 * something), and a hand-edited or corrupted file (out-of-range and duplicate
 * cells are relocated rather than drawn on top of each other).
 *
 * Ids beyond MAX_NODES are dropped — the maker refuses to add past the cap, so
 * this only bites a file that was edited outside the app.
 */
export function resolveLayout(levelIds: readonly string[], stored?: WorldLayout): WorldLayout {
  const capped = levelIds.slice(0, MAX_NODES);
  const taken = new Set<string>();
  const resolved: WorldLayout = {};
  const needsCell: string[] = [];

  for (const id of capped) {
    const cell = stored?.[id];
    if (cell && inBounds(cell) && !taken.has(cellKey(cell))) {
      resolved[id] = { col: cell.col, row: cell.row };
      taken.add(cellKey(cell));
    } else {
      needsCell.push(id);
    }
  }

  // Each id's *preferred* cell is the one autoArrange would give it, so a world
  // with no stored layout at all comes out exactly auto-arranged rather than
  // packed into a corner by the serpentine fallback below. That fallback only
  // catches ids whose preferred cell is already spoken for — a world laid out
  // by hand and then added to.
  const preferred = autoArrange(capped);
  let next = 0;
  for (const id of needsCell) {
    const want = preferred[id];
    if (want && !taken.has(cellKey(want))) {
      resolved[id] = want;
      taken.add(cellKey(want));
      continue;
    }
    while (next < MAX_NODES && taken.has(cellKey(serpentineCell(next)))) next++;
    const cell = serpentineCell(next);
    resolved[id] = cell;
    taken.add(cellKey(cell));
    next++;
  }
  return resolved;
}

/**
 * Move one level to `cell`, keeping every other node exactly where it appears.
 *
 * Returns the new layout, or `null` when `cell` already belongs to a different
 * level — the caller snaps that node back rather than stacking two.
 *
 * The freezing is the point. A layout used to hold *only* the cells someone had
 * dragged, on the reasoning that pinning a node the moment it was auto-placed
 * would lock in each intermediate arrangement (adding a second level would nail
 * the first where it had been centred on its own). That reasoning was right
 * about `add`, but applying it to `drag` too meant every unpinned node was
 * re-derived on every redraw — so dragging one node visibly teleported another:
 * with three levels auto-arranged to (0,2) (4,2) (7,2), dropping the third onto
 * (0,2) sent the *first* to (0,0), which nobody had touched.
 *
 * Freezing on a deliberate placement and only then splits the two cases cleanly:
 * a world nobody has arranged still re-spreads as levels are added (no stored
 * layout, so `resolveLayout` auto-arranges the whole set), and a world someone
 * has arranged never moves under them — a newcomer takes the next free cell and
 * nothing else shifts.
 */
export function placeNode(
  levelIds: readonly string[],
  stored: WorldLayout | undefined,
  id: string,
  cell: Cell,
): WorldLayout | null {
  if (!inBounds(cell)) return null;
  const resolved = resolveLayout(levelIds, stored);
  // Against the *resolved* layout, not the stored one: an auto-placed node
  // occupies its cell on screen just as much as a dragged one does, and
  // checking only stored cells is what let a drop bump it.
  for (const [otherId, taken] of Object.entries(resolved)) {
    if (otherId !== id && cellKey(taken) === cellKey(cell)) return null;
  }
  return { ...resolved, [id]: { col: cell.col, row: cell.row } };
}

/** Cell -> the pixel point at its centre, inside whatever rect the caller
 * draws its map in. */
export function cellCenter(cell: Cell, rect: MapRect): { x: number; y: number } {
  return {
    x: rect.x + ((cell.col + 0.5) * rect.width) / MAP_COLS,
    y: rect.y + ((cell.row + 0.5) * rect.height) / MAP_ROWS,
  };
}

/** The pixel point -> cell conversion, for a click on the map. Returns null
 * outside the rect, so a stray click near the edge places nothing rather than
 * clamping onto a corner the player didn't aim at. */
export function cellAt(x: number, y: number, rect: MapRect): Cell | null {
  const col = Math.floor(((x - rect.x) / rect.width) * MAP_COLS);
  const row = Math.floor(((y - rect.y) / rect.height) * MAP_ROWS);
  const cell = { col, row };
  return inBounds(cell) ? cell : null;
}

/** The cells to walk, in play order — what the path is drawn along and what
 * the marker moves between. */
export function orderedCells(levelIds: readonly string[], layout: WorldLayout): Cell[] {
  return levelIds.map((id) => layout[id]).filter((cell): cell is Cell => cell !== undefined);
}
