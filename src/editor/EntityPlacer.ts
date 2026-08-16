import Phaser from "phaser";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y } from "../config/gameConfig";
import { EntityType, LevelData, LevelEntity } from "../level/LevelSchema";
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
    private readonly level: LevelData,
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
   * if the invariant above requires it. */
  add(brush: Brush, tileX: number, tileY: number): void {
    const type = brush.entityType;
    if (!type) return;
    const worldX = GRID_ORIGIN_X + tileX * this.tileSize + this.tileSize / 2;
    const worldY = GRID_ORIGIN_Y + tileY * this.tileSize + this.tileSize / 2;

    this.level.entities.push({ type, x: tileX, y: tileY });
    const marker = this.scene.add.image(worldX, worldY, this.textureKeyFor(brush));
    marker.setDepth(10);
    fitWithinTile(marker);
    this.markers.set(tileKey(tileX, tileY), marker);
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
      fitWithinTile(marker);
      this.markers.set(tileKey(entity.x, entity.y), marker);
    }
  }
}
