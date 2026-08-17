import { EntityPlacer, TileCoord } from "../EntityPlacer";
import { Command } from "./Command";

/** Relocates one already-placed entity from one tile to another — the Hand
 * tool's own command (see EditorScene's endGrab). Unlike Add/EraseEntityCommand
 * this never destroys/recreates the marker sprite (EntityPlacer.moveTo just
 * repositions it), so a skin or Enemy Size scale applied to it survives the
 * move untouched. Callers are responsible for having already confirmed the
 * destination tile was empty before building this — same division of
 * responsibility as AddEntityCommand. */
export class MoveEntityCommand implements Command {
  constructor(
    private readonly placer: EntityPlacer,
    private readonly from: TileCoord,
    private readonly to: TileCoord,
  ) {}

  execute(): void {
    this.placer.moveTo(this.from.x, this.from.y, this.to.x, this.to.y);
  }

  undo(): void {
    this.placer.moveTo(this.to.x, this.to.y, this.from.x, this.from.y);
  }
}
