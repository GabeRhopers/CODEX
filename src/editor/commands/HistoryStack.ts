import { Command } from "./Command";

export class HistoryStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /** Registers a command that has ALREADY been executed by the caller (the
   * common case: the editor applies a paint immediately for responsiveness,
   * then records what happened). Clears the redo stack, as any new action
   * invalidates the previously-undone future. */
  push(command: Command): void {
    this.undoStack.push(command);
    this.redoStack = [];
  }

  /** Executes and registers a command in one step, for callers that don't
   * need to apply the change before deciding whether to record it. */
  run(command: Command): void {
    command.execute();
    this.push(command);
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.execute();
    this.undoStack.push(command);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Called on a full-state reset (Load, Clear) — undoing past a level swap
   * makes no sense since the commands reference the pre-swap instances. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
