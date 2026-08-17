import Phaser from "phaser";

// A clean, widely-available sans-serif stack — every browser has *some*
// entry in this list (worst case, the final generic `sans-serif` keyword),
// so this needs no web-font loading/CORS/self-hosting of its own. Chosen
// over a single named font specifically so it degrades gracefully rather
// than silently falling back to Phaser's own unstyled default.
const UI_FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Verdana, Arial, sans-serif';

// Supersamples every Text object's backing canvas bitmap 2x before Phaser
// uploads it as a WebGL texture — see installTextDefaults's docstring for
// why this matters here specifically (pixelArt: true's nearest-neighbor
// sampling has much less visible blockiness to magnify when the source
// bitmap already has 2x the detail).
const UI_TEXT_RESOLUTION = 2;

/**
 * Without this, every `scene.add.text(...)` call in the game inherits two
 * defaults neither of which anyone ever chose on purpose:
 *
 * - `fontFamily` defaults to `"Courier"` (Phaser's own TextStyle default,
 *   see node_modules/phaser/src/gameobjects/text/TextStyle.js) — a
 *   monospace font, a poor fit for dense UI chrome (buttons, list rows,
 *   stat readouts) next to this game's hand-drawn art.
 * - `resolution` defaults to `1` (same file) — meaning every Text
 *   object's glyph bitmap is rendered at exactly one texture pixel per
 *   *base* canvas pixel (1050x468, see gameConfig.ts), then, because
 *   `main.ts` sets `pixelArt: true` (needed so the sprites/tiles stay
 *   crisp), gets **nearest-neighbor** — not smooth — upscaled by
 *   Scale.FIT to whatever the actual browser window's CSS size is
 *   (almost always >1x on a normal desktop). The net effect: every piece
 *   of text in the game, at any size, comes out looking blocky/jagged,
 *   regardless of font or font size — this is the single biggest lever
 *   for the game's overall text legibility, and the only one that can't
 *   be fixed by touching individual scenes' font sizes/colors.
 *
 * Patched once here, centrally, rather than threading `fontFamily`/
 * `resolution` through dozens of call sites across 13+ scene/editor files
 * (many already behind shared button/label helpers like
 * `EditorUI.makeFixedWidthButton`) — every existing and future
 * `scene.add.text(...)` call picks this up automatically. Only fills in
 * whichever of the two a caller's own style object didn't already set, so
 * a call site with a deliberate reason to override either one still can.
 * Doesn't touch sprites/tiles at all (their own `pixelArt: true` crispness
 * is untouched) — this only ever affects Text objects' own texture.
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
}
