import Phaser from "phaser";
import { EntityType, LevelData } from "../level/LevelSchema";
import { Brush } from "./Palette";
import { fitWithinTile } from "./spriteFit";

export interface TileCoord {
  x: number;
  y: number;
}

/**
 * The single mutator for the entity layer (mirrors TilePainter for tiles).
 * MVP constraint: exactly one of each entity type (player-spawn, goal,
 * enemy-ghost) — placing a new one replaces the previous marker of that
 * type, since PlayScene currently expects at most one of each.
 *
 * setEntity/removeEntity are unconditional, like TilePainter#paint — the
 * "is this actually a change" and "what was here before" decisions belong
 * to whoever is building a PlaceEntityCommand (EditorScene), not to this
 * class.
 */
export class EntityPlacer {
  private markers = new Map<EntityType, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelData,
    private readonly tileSize: number,
  ) {}

  getPosition(type: EntityType): TileCoord | null {
    const entity = this.level.entities.find((e) => e.type === type);
    return entity ? { x: entity.x, y: entity.y } : null;
  }

  setEntity(brush: Brush, tileX: number, tileY: number): void {
    const type = brush.entityType;
    if (!type) return;

    const worldX = tileX * this.tileSize + this.tileSize / 2;
    const worldY = tileY * this.tileSize + this.tileSize / 2;

    this.level.entities = this.level.entities.filter((e) => e.type !== type);
    this.level.entities.push({ type, x: tileX, y: tileY });

    const existing = this.markers.get(type);
    if (existing) {
      existing.setPosition(worldX, worldY);
    } else {
      const marker = this.scene.add.image(worldX, worldY, brush.textureKey);
      marker.setDepth(10);
      fitWithinTile(marker);
      this.markers.set(type, marker);
    }
  }

  removeEntity(type: EntityType): void {
    this.level.entities = this.level.entities.filter((e) => e.type !== type);
    const marker = this.markers.get(type);
    if (marker) {
      marker.destroy();
      this.markers.delete(type);
    }
  }

  /** Rebuilds marker sprites from an already-populated LevelData (e.g. after Load). */
  syncFromLevel(brushesByType: Map<EntityType, Brush>): void {
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
    for (const entity of this.level.entities) {
      const brush = brushesByType.get(entity.type);
      if (!brush) continue;
      const worldX = entity.x * this.tileSize + this.tileSize / 2;
      const worldY = entity.y * this.tileSize + this.tileSize / 2;
      const marker = this.scene.add.image(worldX, worldY, brush.textureKey);
      marker.setDepth(10);
      fitWithinTile(marker);
      this.markers.set(entity.type, marker);
    }
  }
}
