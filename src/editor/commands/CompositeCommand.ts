import { Command } from "./Command";

/**
 * Batches several commands (e.g. every tile touched by one paint drag) into
 * a single undo step. undo() runs in reverse order so overlapping edits
 * (e.g. painting the same cell twice in one drag) unwind correctly.
 */
export class CompositeCommand implements Command {
  constructor(private readonly commands: Command[]) {}

  execute(): void {
    for (const command of this.commands) command.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
  }
}
