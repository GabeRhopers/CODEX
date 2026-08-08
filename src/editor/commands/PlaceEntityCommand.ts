import { EntityPlacer, TileCoord } from "../EntityPlacer";
import { Brush } from "../Palette";
import { Command } from "./Command";

/**
 * MVP entities are singletons per type (one spawn, one goal), so placing a
 * new one always replaces the previous position. `prev` is null when this
 * placement is the type's first-ever placement, which tells undo() to
 * remove the entity entirely rather than move it back somewhere.
 */
export class PlaceEntityCommand implements Command {
  constructor(
    private readonly placer: EntityPlacer,
    private readonly brush: Brush,
    private readonly prev: TileCoord | null,
    private readonly next: TileCoord,
  ) {}

  execute(): void {
    this.placer.setEntity(this.brush, this.next.x, this.next.y);
  }

  undo(): void {
    if (this.prev) {
      this.placer.setEntity(this.brush, this.prev.x, this.prev.y);
    } else if (this.brush.entityType) {
      this.placer.removeEntity(this.brush.entityType);
    }
  }
}
