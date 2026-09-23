import Phaser from "phaser";
import { currentAnyPad, NO_PAD, padEdges, type PadState } from "./gamepad";

/**
 * Menu navigation for a controller: press, not hold.
 *
 * Gameplay wants to know whether a button *is* held — you walk for as long as
 * you push left. A menu wants the opposite: one press, one action. Holding
 * Start must pause once rather than sixty times a second, and a nudge of the
 * d-pad must move one level along the map rather than sprint to the end of it.
 *
 * The rule that turns one into the other is `padEdges`, which lives in
 * `gamepad.ts` beside the state it compares — this file is only the scene
 * plumbing around it, and it imports Phaser, which cannot load without a
 * `window` and so cannot be unit-tested.
 *
 * Installed per scene rather than run globally, because the answer to "what
 * does B do" is entirely a question about which screen you are on.
 */

/** What a screen can be told. Every one optional — the title screen has one
 * action, the map has four, and neither should have to write `() => {}`. */
export interface PadNavigationHandlers {
  onLeft?(): void;
  onRight?(): void;
  onUp?(): void;
  onDown?(): void;
  onConfirm?(): void;
  onBack?(): void;
  onPause?(): void;
}

/**
 * Calls a scene's handlers when their buttons are pressed.
 *
 * **Starts from what is held right now, not from nothing**, and that is
 * load-bearing rather than tidy. Moving between screens takes a frame or two
 * while your thumb is still on the button: confirming on the title screen
 * starts the map with A still down, and a fresh all-false baseline would read
 * that as a *new* press and confirm again immediately — launching a level
 * nobody chose. Seeding the baseline with the live state means a button has to
 * be released before it counts on the new screen.
 *
 * Torn down on shutdown, or the handler outlives its scene and runs against
 * destroyed objects the next time anything ticks.
 */
export function installPadNavigation(scene: Phaser.Scene, handlers: PadNavigationHandlers): void {
  // Every connected pad, not just the first: with a controller each, player
  // two's Start button did nothing at all while this read pad 0 alone. A menu
  // does not care who pressed — see anyPad.
  let previous: PadState = currentAnyPad();

  const onUpdate = (): void => {
    const next = currentAnyPad();
    const edges = padEdges(previous, next);
    previous = next;

    if (edges.left) handlers.onLeft?.();
    if (edges.right) handlers.onRight?.();
    if (edges.up) handlers.onUp?.();
    if (edges.down) handlers.onDown?.();
    if (edges.confirm) handlers.onConfirm?.();
    if (edges.back) handlers.onBack?.();
    if (edges.pause) handlers.onPause?.();
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    // Released, so the next scene to install starts from a clean baseline
    // rather than inheriting a button this one never saw let go.
    previous = NO_PAD;
  });
}
