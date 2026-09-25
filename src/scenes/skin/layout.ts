/**
 * Where everything in the Skin Creator sits, and why it sits there.
 *
 * Ninety lines of measured geometry that used to stand between the imports and
 * the first line of the scene: a painting window whose left edge is 306 rather
 * than centred because centring puts it 7px inside the palette chip, a second
 * column moved in 16px to buy that window its gutters, a heading gap of 18
 * because 22 put the rail's last button on top of "\u21b6 Undo".
 *
 * Every number here was checked by eye against a real screen, and most carry
 * the measurement that settled them. None of that is in the way of reading the
 * scene now, and none of it is gone. Nothing here imports Phaser, so the
 * geometry can be read \u2014 and compared against itself \u2014 without a canvas.
 */

/** The Text buttons take CSS strings; the Rectangles take the number above. */
/**
 * Selected, and selected-while-hovered.
 *
 * These exist because one colour served as *both* the hover colour and the
 * selected colour, which broke selection twice over: an armed tool looked
 * exactly like a tool you happened to be pointing at, and makeSmallButton's
 * pointerout reset every button to the unselected colour unconditionally — so
 * hovering the armed tool and moving away rendered it inactive until you
 * clicked something else.
 *
 * The amber is deliberately nowhere near the hover blue, and is the same family
 * as the ring around the selected colour swatch, so "selected" reads as one
 * language across the screen. The level editor already worked this way
 * (EditorUI's ERASER_ACTIVE_COLOR / ERASER_ACTIVE_HOVER_COLOR pair); this is
 * that pattern, not a new one.
 */
/** SELECTED_COLOR as a number, for Rectangle fills. */
export const SELECTED_FILL = 0x8a6d1f;
/** The ring drawn around whichever member of an exclusive group is active, so
 * selection is a shape and not only a colour — the same idea as EditorUI's
 * `selectedOutline` on the brush grid. */
export const SELECTED_RING_COLOR = 0xffc93c;
export const ARM_TIMEOUT_MS = 3000;
export const ROW_START_Y = 90;
export const ROW_HEIGHT = 44;
// Where the painting window sits. Fixed for the life of the scene: zoom moves
// the drawing inside this box, never the box itself, so no button can be pushed
// off the scene's 468px floor however far someone zooms in. 10 + 384 = 394,
// which leaves the footer row its line and the side columns 40px of run-on
// below the canvas — see buildCanvas's layout note.
export const CANVAS_TOP_Y = 10;
/** Width of the reference picker, and therefore of the whole right rail — see
 * buildReferenceControls for why the picker cannot be narrower. */
export const REFERENCE_WIDTH = 260;

// Everything this scene draws is a Phaser shape on one canvas, so a test that
// wants "the shade ramp" and not "the palette" has no DOM to query and has to
// pick the objects out of the display list somehow. It used to be by geometry —
// `width === 24 && x < 250`, the ramp being the only 24px swatches left of the
// centred palette row. That is a coincidence of a layout, not a fact about the
// objects, and it broke the moment the 2026-09-05 rework put both groups in the
// same column. Naming them says what they are and survives being moved.
export const SHADE_STEP_NAME = "shade-step";

// --- canvas-mode layout ---------------------------------------------------
// One place for the geometry, so the three regions can be read against each
// other rather than reconstructed from scattered literals. Everything here is
// checked by eye and by assertLayoutSound; see buildCanvas.

/**
 * The action line at the scene's floor on the **"What it does" tab**: Back,
 * Delete, Save.
 *
 * The Draw tab had one too until 2026-09-24, and losing it is what let the
 * painting window reach its ceiling — see VIEWPORT_SIZE. The form tab keeps it,
 * because a form is short and has the room; see drawThingForm.
 */
export const FOOTER_Y = 434;

/**
 * Where the painting window's left edge sits, and why it is not centred.
 *
 * `(GAME_WIDTH - VIEWPORT_SIZE) / 2` would be 301, which is 7px inside the left
 * column's palette chip. The window is centred in the *gap between the columns*
 * instead. Measured rather than guessed, from the widest thing on each side:
 * the chip is 190 wide at LEFT_COL2_X and so ends at 294, and the right rail
 * starts at 766 — 472 of gap for a 448 window, 12px either side.
 */
export const CANVAS_LEFT_X = 306;
/** Top of every side column. Above the canvas by a hair, so the first heading
 * sits level with the drawing's top edge rather than below it. */
export const RAIL_TOP_Y = 8;
/** Left region: two columns, both clear of the canvas's left edge at 333. */
export const LEFT_COL_X = 16;
/** 104, in from 120 on 2026-09-24: the 16px it gives up is what buys the
 * painting window its 12px gutters at 448 (see CANVAS_LEFT_X). The first
 * column's widest thing is the "Ctrl+scroll zooms" hint, which ends at 94, so
 * there is still 10px between the two. */
export const LEFT_COL2_X = 104;
/** Rendered height of a makeSmallButton: 12px text plus its 6px padding, twice. */
export const SMALL_BUTTON_H = 26;
/** Small-button pitch in a vertical stack — the button plus 6px of air. */
export const STACK_STEP = SMALL_BUTTON_H + 6;
// The two gaps below are what decides whether a column fits. The right rail is
// the tight one — PALETTE (5 rows), DRAWING, REFERENCE and THIS SKIN have to
// finish above the footer at y=421, and at 22/16 the last button ended at 426,
// measurably on top of "↶ Undo". 18 still leaves 5px under a 13px heading.
/** Heading to its first row. */
export const HEADING_GAP = 18;
/** Between one labelled group and the next heading. */
export const GROUP_GAP = 12;
