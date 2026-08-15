import { EntityType, LevelEntity } from "../../level/LevelSchema";
import { EntityPlacer } from "../EntityPlacer";
import { Brush } from "../Palette";
import { Command } from "./Command";

/** Removes one already-placed entity, keyed by its position (EntityPlacer
 * only ever has one entity per tile, so position alone identifies it).
 * `entity` is the snapshot returned by EntityPlacer.entityAt/removeAt at
 * the time this command was built — undo re-adds the exact same
 * type/position from that snapshot, regardless of what (if anything) has
 * been placed at that tile since. */
export class EraseEntityCommand implements Command {
  constructor(
    private readonly placer: EntityPlacer,
    private readonly brushesByType: Map<EntityType, Brush>,
    private readonly entity: LevelEntity,
  ) {}

  execute(): void {
    this.placer.removeAt(this.entity.x, this.entity.y);
  }

  undo(): void {
    const brush = this.brushesByType.get(this.entity.type);
    if (!brush) return;
    this.placer.add(brush, this.entity.x, this.entity.y);
  }
}
