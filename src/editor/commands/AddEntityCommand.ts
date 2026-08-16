import { EnemySize } from "../../level/LevelSchema";
import { EntityPlacer } from "../EntityPlacer";
import { Brush } from "../Palette";
import { Command } from "./Command";

/** Adds one entity at (x, y). Callers (EditorScene) are responsible for
 * having already queued whatever EraseEntityCommands are needed to keep
 * EntityPlacer's "one entity per tile" invariant and, for marker types, its
 * "one of this type per level" invariant — this command only ever adds.
 * `size` is ignored by EntityPlacer.add for non-enemy brushes; passed
 * through unconditionally here for the same reason it's optional there. */
export class AddEntityCommand implements Command {
  constructor(
    private readonly placer: EntityPlacer,
    private readonly brush: Brush,
    private readonly x: number,
    private readonly y: number,
    private readonly size?: EnemySize,
  ) {}

  execute(): void {
    this.placer.add(this.brush, this.x, this.y, this.size);
  }

  undo(): void {
    this.placer.removeAt(this.x, this.y);
  }
}
