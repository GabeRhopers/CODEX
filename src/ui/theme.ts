/**
 * The handful of colours every screen in this app is built out of.
 *
 * They were already shared, in the sense that everyone had agreed on them —
 * `#0f3460` for a button, `#3a5a9c` for hovering one, `#a6a6c8` for the quiet
 * line under a heading. What they were not was written down anywhere. Six files
 * declared their own `BUTTON_HEX`, four their own `MUTED`, and the literals
 * themselves appeared over a hundred times across `scenes/`, `editor/` and
 * `ui/`. Nothing was *broken* by that — the values genuinely all matched — but
 * "make the buttons a bit lighter" was a hundred-site change, and any one of
 * those sites drifting would have been invisible until someone noticed one
 * screen looking wrong.
 *
 * Deliberately small. This is a list of the colours that were already being
 * repeated, not a design system: no spacing scale, no typography, no semantic
 * layer over the top. Adding one of those is a different job with a different
 * justification, and inventing it here would mean inventing decisions nobody
 * has asked for yet.
 *
 * **Two number formats, on purpose.** Phaser text styles want CSS strings
 * (`backgroundColor: "#0f3460"`) and its shapes want numbers
 * (`this.add.rectangle(…, 0x1a1a2e)`). Rather than converting at each call
 * site, the ones needed both ways are given both spellings, named alike.
 */

// --- buttons ---------------------------------------------------------------

/** A button at rest. */
export const BUTTON_COLOR = "#0f3460";
/** The same button under the pointer. */
export const BUTTON_HOVER_COLOR = "#3a5a9c";
/** `BUTTON_COLOR` for Phaser shapes, which take numbers rather than strings —
 * a rail behind a row of buttons, say, that has to match them exactly. */
export const BUTTON_COLOR_NUM = 0x0f3460;

/**
 * A button representing the currently-chosen thing — the active frame in the
 * Skin Creator, the selected tool. Amber rather than a brighter blue, so
 * "selected" never reads as "hovered".
 */
export const SELECTED_COLOR = "#8a6d1f";
export const SELECTED_HOVER_COLOR = "#b8912c";
/** `SELECTED_COLOR` for Phaser shapes, which take numbers rather than strings. */
export const SELECTED_COLOR_NUM = 0x8a6d1f;

/**
 * A destructive button that has been armed and is waiting for the second tap.
 * Red, and the only red in the palette — it should be the most alarming thing
 * on any screen showing it.
 */
export const ARMED_COLOR = "#aa3333";
export const ARMED_HOVER_COLOR = "#d14f4f";

// --- text ------------------------------------------------------------------

/** Ordinary text on the app's dark ground. */
export const TEXT_COLOR = "#ffffff";
/** Subtitles, hints, secondary metadata — present but not competing. */
export const MUTED_COLOR = "#a6a6c8";
/** Something went wrong and the user needs to know. */
export const BAD_COLOR = "#ff6b6b";
/** Something worked. */
export const GOOD_COLOR = "#4ade80";
/** It worked, with a caveat worth reading. */
export const WARN_COLOR = "#ffeb3b";

// --- surfaces --------------------------------------------------------------

/** The ground every full-screen scene paints before anything else. */
export const SCREEN_BG = 0x1a1a2e;
/** One row in a list — a saved level, a world, a skin. */
export const ROW_BG = 0x16213e;
