/**
 * What kind of pointer is actually being used.
 *
 * Only ever for deciding what to *say*, never what to allow. Every control in
 * this app works with a finger and with a mouse; what differs is the advice
 * worth printing next to it. The Skin Creator spent its whole life telling iPad
 * users that "Ctrl+scroll zooms" — two lines about keys and gestures that device
 * does not have, on the one screen a child spends the longest on.
 *
 * `(pointer: fine)` is the CSS media query for "the primary input can point
 * precisely" — a mouse, a trackpad, a stylus — and is false on a touchscreen.
 * Deliberately *not* `Phaser.Device.input.touch`, which reports whether the
 * browser supports touch events at all: every modern laptop with a touchscreen
 * answers yes to that while its user is holding a mouse.
 *
 * Not in `touchTarget.ts`, which states in its own docstring that it is pure
 * with no Phaser and no DOM, and is unit-tested on that basis.
 */

/**
 * True when there is a precise pointer — so hints about scrolling, right-click
 * and modifier keys are worth showing.
 *
 * Defaults to **false** when it cannot tell: the cost of wrongly hiding a hint
 * from a mouse user is a hint they did not need, and the cost of wrongly showing
 * one to a child on a tablet is an instruction they cannot follow. `matchMedia`
 * is absent under Vitest's node environment, which is the usual way of not
 * being able to tell.
 */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: fine)").matches;
}
