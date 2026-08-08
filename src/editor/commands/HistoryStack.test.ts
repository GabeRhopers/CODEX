import { describe, expect, it } from "vitest";
import { Command } from "./Command";
import { CompositeCommand } from "./CompositeCommand";
import { HistoryStack } from "./HistoryStack";

function counterCommand(counter: { value: number }, delta: number): Command {
  return {
    execute: () => (counter.value += delta),
    undo: () => (counter.value -= delta),
  };
}

describe("HistoryStack", () => {
  it("undo reverses the last pushed command, redo reapplies it", () => {
    const counter = { value: 0 };
    const history = new HistoryStack();
    const cmd = counterCommand(counter, 5);

    cmd.execute();
    history.push(cmd);
    expect(counter.value).toBe(5);

    history.undo();
    expect(counter.value).toBe(0);

    history.redo();
    expect(counter.value).toBe(5);
  });

  it("undo/redo are no-ops on empty stacks", () => {
    const history = new HistoryStack();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("a new push clears the redo stack (no redo into an abandoned future)", () => {
    const counter = { value: 0 };
    const history = new HistoryStack();
    const a = counterCommand(counter, 1);
    const b = counterCommand(counter, 10);

    a.execute();
    history.push(a);
    history.undo();
    expect(counter.value).toBe(0);
    expect(history.canRedo()).toBe(true);

    b.execute();
    history.push(b);
    expect(history.canRedo()).toBe(false);
    expect(counter.value).toBe(10);
  });

  it("undoes multiple pushes in LIFO order", () => {
    const counter = { value: 0 };
    const history = new HistoryStack();
    for (const delta of [1, 2, 3]) {
      const cmd = counterCommand(counter, delta);
      cmd.execute();
      history.push(cmd);
    }
    expect(counter.value).toBe(6);
    history.undo();
    expect(counter.value).toBe(3);
    history.undo();
    expect(counter.value).toBe(1);
    history.undo();
    expect(counter.value).toBe(0);
    expect(history.undo()).toBe(false);
  });

  it("CompositeCommand undoes a batch (e.g. a drag-fill) as a single step, in reverse order", () => {
    const counter = { value: 0 };
    const history = new HistoryStack();
    const batch = new CompositeCommand([counterCommand(counter, 1), counterCommand(counter, 2), counterCommand(counter, 3)]);

    batch.execute();
    history.push(batch);
    expect(counter.value).toBe(6);

    history.undo();
    expect(counter.value).toBe(0);

    history.redo();
    expect(counter.value).toBe(6);
  });

  it("run() executes and registers in one call", () => {
    const counter = { value: 0 };
    const history = new HistoryStack();
    history.run(counterCommand(counter, 7));
    expect(counter.value).toBe(7);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(counter.value).toBe(0);
  });
});
