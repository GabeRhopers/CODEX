import Phaser from "phaser";
import { EntityType, LevelData } from "../level/LevelSchema";
import { Brush } from "./Palette";

/**
 * The single mutator for the entity layer (mirrors TilePainter for tiles).
 * MVP constraint: exactly one of each entity type (player-spawn, goal) —
 * placing a new one replaces the previous marker of that type, since
 * PlayScene expects exactly one spawn point and one goal.
 */
export class EntityPlacer {
  private markers = new Map<EntityType, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelData,
    private readonly tileSize: number,
  ) {}

  place(brush: Brush, tileX: number, tileY: number): void {
    const type = brush.entityType;
    if (!type) return;
    if (tileX < 0 || tileY < 0 || tileX >= this.level.width || tileY >= this.level.height) return;

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
      this.markers.set(type, marker);
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
      this.markers.set(entity.type, marker);
    }
  }
}
