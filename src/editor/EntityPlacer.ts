import Phaser from "phaser";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y } from "../config/gameConfig";
import { ENEMY_EDITOR_SIZE_SCALE, isEnemyType } from "../gameplay/EnemyBehaviors";
import { EnemySize, EntityType, LevelArea, LevelEntity } from "../level/LevelSchema";
import { Brush } from "./Palette";
import { fitWithinTile } from "./spriteFit";

export interface TileCoord {
  x: number;
  y: number;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * The single mutator for the entity layer (mirrors TilePainter for tiles).
 * Invariant: at most one entity total per tile, regardless of type — that's
 * what makes "click a tile to erase" unambiguous. Markers (player-spawn/
 * goal/chest) are additionally kept singleton *per type* across the whole
 * level by EditorScene (see its MARKER_TYPES), since PlayScene's spawn/win/
 * chest-open logic is built around exactly one of each; Enemies/Items/Decor
 * have no such limit and can have any number of instances, each pinned to
 * its own tile.
 *
 * add/removeAt are unconditional, like TilePainter#paint — deciding whether
 * a placement is actually a change, and what (if anything) needs clearing
 * first to keep the invariants above, is EditorScene's job, not this
 * class's.
 *
 * Bound to one `LevelArea` (Main, Sub, or Up — see "Sub/Up areas" under
 * Art) at a time, not the whole `LevelData` — EditorScene constructs a
 * fresh one whenever the area being edited switches.
 */
export class EntityPlacer {
  private markers = new Map<string, Phaser.GameObjects.Image>();
  // brushId -> texture key for every brush with a custom skin — see
  // skinLoader.ts. Set once by EditorScene's async skin-resolution pass;
  // add/syncFromLevel consult it via textureKeyFor so placed markers pick
  // up a skin the same way EditorUI's palette icons do.
  private skinTextureKeys = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelArea,
    private readonly tileSize: number,
  ) {}

  setSkinTextureKeys(skinTextureKeys: Map<string, string>): void {
    this.skinTextureKeys = skinTextureKeys;
  }

  private textureKeyFor(brush: Brush): string {
    return this.skinTextureKeys.get(brush.id) ?? brush.textureKey;
  }

  /** Current position of a singleton marker type (Spawn/Goal/Chest).
   * Meaningless for multi-instance types, where "the" position doesn't
   * exist — callers only ever ask this for marker types. */
  getPosition(type: EntityType): TileCoord | null {
    const entity = this.level.entities.find((e) => e.type === type);
    return entity ? { x: entity.x, y: entity.y } : null;
  }

  /** Whatever entity (any type) currently occupies this exact tile. */
  entityAt(tileX: number, tileY: number): LevelEntity | null {
    return this.level.entities.find((e) => e.x === tileX && e.y === tileY) ?? null;
  }

  /** Unconditionally adds a new entity at (tileX, tileY) — callers are
   * responsible for having already cleared that tile first (via removeAt)
   * if the invariant above requires it. `size` is meaningful only for
   * enemy brushes (see EnemyBehaviors.ts's ENEMY_TYPES/isEnemyType) —
   * passed for every other brush it's simply ignored and never stored, so
   * their JSON stays exactly as it was before this feature existed. */
  add(brush: Brush, tileX: number, tileY: number, size?: EnemySize): void {
    const type = brush.entityType;
    if (!type) return;
    const worldX = GRID_ORIGIN_X + tileX * this.tileSize + this.tileSize / 2;
    const worldY = GRID_ORIGIN_Y + tileY * this.tileSize + this.tileSize / 2;
    const storedSize = isEnemyType(type) ? size : undefined;

    this.level.entities.push({ type, x: tileX, y: tileY, ...(storedSize ? { size: storedSize } : {}) });
    const marker = this.scene.add.image(worldX, worldY, this.textureKeyFor(brush));
    marker.setDepth(10);
    this.applyMarkerDisplaySize(marker, storedSize);
    this.markers.set(tileKey(tileX, tileY), marker);
  }

  /** Tile-fits every marker (unchanged from before this feature), then
   * layers the editor-preview size multiplier on top for enemies — see
   * ENEMY_EDITOR_SIZE_SCALE's docstring for why this uses different
   * numbers than PlayScene's own size handling. */
  private applyMarkerDisplaySize(marker: Phaser.GameObjects.Image, size: EnemySize | undefined): void {
    fitWithinTile(marker);
    if (!size) return;
    const scale = ENEMY_EDITOR_SIZE_SCALE[size];
    marker.setDisplaySize(marker.displayWidth * scale, marker.displayHeight * scale);
  }

  /** Removes and returns whatever entity occupies this exact tile (any
   * type), or null if the tile was already empty — the shared primitive
   * both erasing and "something's already here, clear it first" placement
   * logic build on. */
  removeAt(tileX: number, tileY: number): LevelEntity | null {
    const entity = this.entityAt(tileX, tileY);
    if (!entity) return null;
    this.level.entities = this.level.entities.filter((e) => e !== entity);
    const key = tileKey(tileX, tileY);
    const marker = this.markers.get(key);
    if (marker) {
      marker.destroy();
      this.markers.delete(key);
    }
    return entity;
  }

  /** Repositions the marker at (fromX, fromY) to raw pointer/world
   * coordinates while a Hand-tool drag is in progress (see EditorScene's
   * beginGrab/onPointerMove) — a pure visual follow that never touches
   * `level.entities` or the markers map's key, which stays filed under the
   * origin tile until moveTo commits the drag or cancelDrag reverts it. A
   * no-op if the origin tile has no marker (shouldn't happen via the Hand
   * tool's own gesture, which only ever begins a grab on an occupied tile). */
  previewDragTo(fromX: number, fromY: number, worldX: number, worldY: number): void {
    this.markers.get(tileKey(fromX, fromY))?.setPosition(worldX, worldY);
  }

  /** Snaps the marker at (fromX, fromY) back to its own tile's center —
   * called when a Hand-tool drag ends without committing a move (dropped
   * outside the grid, back on its own tile, or onto a tile something else
   * already occupies). */
  cancelDrag(fromX: number, fromY: number): void {
    const marker = this.markers.get(tileKey(fromX, fromY));
    marker?.setPosition(
      GRID_ORIGIN_X + fromX * this.tileSize + this.tileSize / 2,
      GRID_ORIGIN_Y + fromY * this.tileSize + this.tileSize / 2,
    );
  }

  /** Commits a Hand-tool drag: relocates whatever entity sits at (fromX,
   * fromY) to (toX, toY), updating both `level.entities` and the markers
   * map's key — the same sprite, just repositioned, so no destroy/recreate
   * and no skin/size re-application needed. Unconditional, like add/
   * removeAt: callers (EditorScene's endGrab, and MoveEntityCommand's
   * execute/undo, which calls this in both directions) are responsible for
   * having already confirmed the destination tile is empty. Returns false
   * if there's nothing at `from` — shouldn't happen via the Hand tool's own
   * gesture, but keeps this safe to call from undo/redo after some other
   * edit already touched the tile. */
  moveTo(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const entity = this.entityAt(fromX, fromY);
    if (!entity) return false;
    entity.x = toX;
    entity.y = toY;
    const fromKey = tileKey(fromX, fromY);
    const marker = this.markers.get(fromKey);
    this.markers.delete(fromKey);
    if (marker) {
      marker.setPosition(GRID_ORIGIN_X + toX * this.tileSize + this.tileSize / 2, GRID_ORIGIN_Y + toY * this.tileSize + this.tileSize / 2);
      this.markers.set(tileKey(toX, toY), marker);
    }
    return true;
  }

  /** Destroys every marker sprite this instance owns — called on the *old*
   * EntityPlacer right before EditorScene's rebuildVisualsFromLevel
   * replaces it with a fresh one bound to a different area (see "Sub/Up
   * areas" under Art). Without this, switching areas would just abandon
   * the old instance with its markers still live on the display list —
   * `this.markers` was never anyone else's reference to clean up, and a
   * fresh EntityPlacer's own `syncFromLevel` only ever clears *its own*
   * (empty) map, not a completely different instance's. */
  destroy(): void {
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
  }

  /** Rebuilds marker sprites from an already-populated LevelData (e.g. after Load). */
  syncFromLevel(brushesByType: Map<EntityType, Brush>): void {
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
    for (const entity of this.level.entities) {
      const brush = brushesByType.get(entity.type);
      if (!brush) continue;
      const worldX = GRID_ORIGIN_X + entity.x * this.tileSize + this.tileSize / 2;
      const worldY = GRID_ORIGIN_Y + entity.y * this.tileSize + this.tileSize / 2;
      const marker = this.scene.add.image(worldX, worldY, this.textureKeyFor(brush));
      marker.setDepth(10);
      this.applyMarkerDisplaySize(marker, isEnemyType(entity.type) ? entity.size : undefined);
      this.markers.set(tileKey(entity.x, entity.y), marker);
    }
  }
}
