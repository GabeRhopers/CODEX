import Phaser from "phaser";

// A clean, widely-available sans-serif stack — every browser has *some*
// entry in this list (worst case, the final generic `sans-serif` keyword),
// so this needs no web-font loading/CORS/self-hosting of its own. Chosen
// over a single named font specifically so it degrades gracefully rather
// than silently falling back to Phaser's own unstyled default.
const UI_FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Verdana, Arial, sans-serif';

// Supersamples every Text object's backing canvas bitmap 2x before Phaser
// uploads it as a WebGL texture — extra source detail for the LINEAR
// filtering below to interpolate from, so curves/diagonals in the glyphs
// stay smooth rather than soft.
const UI_TEXT_RESOLUTION = 2;

/**
 * Without this, every `scene.add.text(...)` call in the game inherits
 * defaults nobody ever chose on purpose, and even then keeps losing a
 * further fight against `pixelArt: true` every time its content changes:
 *
 * - `fontFamily` defaults to `"Courier"` (Phaser's own TextStyle default,
 *   see node_modules/phaser/src/gameobjects/text/TextStyle.js) — a
 *   monospace font, a poor fit for dense UI chrome (buttons, list rows,
 *   stat readouts) next to this game's hand-drawn art.
 * - `resolution` defaults to `1` (same file) — less source detail for the
 *   filtering fix below to work with.
 * - **The real crux, found after the first pass at this still looked rough
 *   in practice:** `main.ts` sets `pixelArt: true` so the hand-drawn
 *   sprites/tiles stay crisp, which makes every *new* WebGL texture
 *   default to NEAREST filtering — but Text's own canvas-rendered glyph
 *   bitmap is just another WebGL texture, so it inherits that too. Worse,
 *   this isn't a one-time construction-time default you could override
 *   once and be done: `Text.updateText()` (confirmed in Phaser's own
 *   `Text.js`) — the one method every content or style change funnels
 *   through, `setText`/`setStyle`/`setFont`/`setColor`/construction
 *   itself, all of it — calls `renderer.canvasToTexture(canvas,
 *   existingGlTexture, true)` on *every single call*, and that function
 *   (confirmed in `WebGLRenderer.js`) recomputes NEAREST/NEAREST from the
 *   game's global `antialias` config and reapplies it to the texture
 *   every time, silently overwriting any filter override from before.
 *   A one-time `.setFilter(LINEAR)` right after creation, tried first,
 *   held only for text that's never updated again — which is most of the
 *   button captions, but not the footer's live cursor tile/entity count,
 *   the save-state readout, dropdown trigger labels, or any status toast,
 *   all of which call `.setText(...)` continuously and silently reverted
 *   to blocky NEAREST filtering on their very next update.
 *
 * Patched here, centrally, in two places — rather than threading
 * `fontFamily`/`resolution` through dozens of call sites across 13+
 * scene/editor files (many already behind shared button/label helpers
 * like `EditorUI.makeFixedWidthButton`), and rather than re-asserting a
 * filter override at every one of the many places in this codebase that
 * calls `.setText`:
 *
 * 1. `GameObjectFactory.prototype.text` — injects the default
 *    `fontFamily`/`resolution` into every `scene.add.text(...)` call.
 *    Only fills in whichever of the two a caller's own style didn't
 *    already set, so a call site with a deliberate reason to override
 *    either one still can.
 * 2. `Text.prototype.updateText` — the single choke point every text/
 *    style change funnels through (see above) — re-asserts LINEAR
 *    filtering immediately after Phaser's own update rebuilds the texture
 *    and resets it to NEAREST, so the fix survives every future
 *    `.setText()` call, not just the first render.
 *
 * Neither patch touches sprite/tile textures at all — `pixelArt: true`'s
 * crisp nearest-neighbor rendering for the hand-drawn art is completely
 * unaffected; this only ever reaches into a Text object's own texture.
 *
 * Must run before any scene's `create()` can call `scene.add.text(...)` —
 * see main.ts, which calls this before constructing the `Phaser.Game`.
 */
export function installTextDefaults(): void {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  const originalText = factory.text;

  factory.text = function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const mergedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: UI_FONT_FAMILY,
      resolution: UI_TEXT_RESOLUTION,
      ...style,
    };
    return originalText.call(this, x, y, text, mergedStyle);
  };

  const textPrototype = Phaser.GameObjects.Text.prototype;
  const originalUpdateText = textPrototype.updateText;

  textPrototype.updateText = function (this: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
    const result = originalUpdateText.call(this);
    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return result;
  };
}
