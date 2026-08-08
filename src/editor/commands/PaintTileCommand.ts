import { TilePainter } from "../TilePainter";
import { Command } from "./Command";

/** Stores only the one tile's old/new index — not a grid snapshot. */
export class PaintTileCommand implements Command {
  constructor(
    private readonly painter: TilePainter,
    private readonly x: number,
    private readonly y: number,
    private readonly prevIndex: number,
    private readonly newIndex: number,
  ) {}

  execute(): void {
    this.painter.paint(this.x, this.y, this.newIndex);
  }

  undo(): void {
    this.painter.paint(this.x, this.y, this.prevIndex);
  }
}
