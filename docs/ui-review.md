# UI review — 2026-10-19

Every authoring screen photographed and read one at a time, against
`9e98192`. Fifteen shots from `tests/e2e/screen-survey.spec.ts` (iPad Pro 11"
landscape), plus two taken by hand for a variant the survey cannot reach.

**Nothing here is fixed.** Several of these are taste, and taste is Gabriel's
call. The defects and the opinions are separated below so the difference is not
left to inference.

Numbers are measured — from the source where the source says it (`GAME_WIDTH`
is 1050 and `GAME_HEIGHT` 468, `src/config/gameConfig.ts`), and from the
screenshots where they only exist on screen. Screenshot pixels are divided by
1194/1050 = 1.137 to give scene coordinates.

## What the pass is worth

Three of the findings below are invisible to `assertLayoutSound` by
construction: it compares only *interactive* Text for overlap, and two of these
are plain labels. One is a capability that is simply absent rather than broken.
None of them would ever have failed a test.

Against that: two things I went looking at turned out to be fine, and both were
only settled by reading the code — the cut-scene sprite strip (not clipped) and
the dotted frame labels (deliberate). They are recorded at the bottom so the
next person does not re-open them.

---

## Defects

### 1. A saved level cannot be played from My Levels

`My Worlds` rows read **Play · Edit · Delete**. `Templates` rows read **Play ·
Use This Template**. `My Levels` rows read **Edit · Delete** — there is no way
to play your own level from the list at all. You must open it in the editor and
press Test Play.

It also leaves a hole. `src/ui/savedList.ts` lays row actions out right-to-left
from `LAST_ACTION_X` (`GAME_WIDTH - 240` = 810) with `ACTION_STEP` 80 and
`DELETE_X` at `GAME_WIDTH - 140` = 910. With one action, Edit lands at 810 and
**x = 730 is left empty** — exactly where Worlds draws Play. Put the two
screenshots side by side and My Levels looks like a button failed to render.

The layout comment explains the alignment ("the rightmost action always lands
where a single-action screen's one button has always been") and is right to; the
empty slot is a consequence, not a bug in the laying-out. The missing capability
is the finding.

For a tool whose whole point is that a child makes a thing and then plays it,
this is the single most surprising absence on any screen.

### 2. "Copy link" is 846px from the link it copies

`PublishScene.drawStepThree`: the link renders at `STEP_TEXT_X` = 74 and the
button at `GAME_WIDTH - 130` = 920. The link under test was 40 characters and
occupied about 250px, so roughly **600px of empty space separates a value from
the button that acts on it**, on a screen 1050 wide. Nothing else on the screen
sits between them.

The wrap width (`GAME_WIDTH - STEP_TEXT_X - 160` = 816) means the text *can*
reach x = 890 for a long game name, which is presumably why the button was
pushed to the right margin — but for every realistic link it reads as two
unrelated controls.

### 3. The Sound row's gaps run from 2px to 25px

`src/editor/thingFields.ts:224` places eight buttons on a fixed `step = 62`
from `controlX + 62` — None, five presets, 🎲 Roll, ▶ Play. The buttons are
text-width, so a fixed step produces gaps that vary with label length. Measured
off the screenshot, in scene px: **10, 4, 6, 25, 21, 12, 2**.

The 2px is between **🎲 Roll and ▶ Play** — the two buttons that are *not*
sound choices, fused into one block — while "Hit" and "Blip", which are
alternatives in the same set, sit 25px apart. The grouping the eye reads is the
opposite of the grouping that exists.

The step is documented as chosen so the row "finishes clear of the drawing
column", i.e. tuned for total width. That goal and even spacing are not in
conflict; nothing yet serves the second.

### 4. Two labels in "Acts like" touch

On the thing form, the labels **"Chicken Slipper"** and **"PJ Thunder Hat"**
under adjacent tiles end and begin about **2 scene px** apart and read as one
run of text. Both are plain `Text`, not interactive, so `assertLayoutSound`
cannot see them — this is the documented blind spot, for the fourth time.

It is the widest pair of labels in that row, so it will recur with any new
long-named thing.

---

## The survey cannot see what a tablet sees

Not an app defect — the app is right — but it matters for every future review.

`playwright.config.ts` uses `devices["Desktop Chrome"]`, and both
`screen-survey.spec.ts` and `phone-landscape.spec.ts` override **only the
viewport**. A viewport is not a pointer: `matchMedia("(pointer: fine)")` stays
true, so everything gated on `hasFinePointer()` (`src/ui/pointer.ts`) has only
ever been photographed in its mouse variant — including the Skin Creator layout
a child on an iPad actually gets.

I shot it by hand with `hasTouch: true, isMobile: true`. The result: the
"Scroll to pan / Ctrl+scroll zooms" hint is correctly **absent**, so
`hasFinePointer()` does what it claims. The only cosmetic consequence is that
the "×1" zoom readout is then left alone above a ~120px gap.

The fix is one line in the survey's `test.use`. Worth doing before the next
review, because the hint that prompted the whole survey in the first place
(2026-09-11) is in exactly this class, and the survey still cannot prove it is
gone.

---

## Taste, not defects

Listed because they were noticed, not because they need doing.

- **The Menu's bottom row is lopsided.** "Things" sits at scene x 33–223 and
  "Game Maker" at 563–750, with Grampa centred at 525. That leaves 285px of
  nothing between Things and Grampa, and 20px between Grampa and Game Maker.
  The two buttons are peers and do not look like peers.
- **My Levels is mostly empty with three levels** — about 215 scene px of
  blank below the last row. The space is reserved for a six-row page, so this
  is the cost of a fixed layout, not a mistake.
- **"Opening…" and "Closing…" on the Game Maker** do not say they are cut
  scenes.
- **Mixed widths in the Skin Creator's right rail.** "Trace: None ▾" is full
  rail width; Mirror, Clear, Trace in and Set as default are text-width. One
  column, two conventions.
- **"Set as default" in the editor's left column** is a small button directly
  under the full-width "Skin: Built-in ▾", same inconsistency in miniature.

---

## The one that is not a UI problem

**Publishing ends at GitHub.** Step 2 of the Publish screen reads "On GitHub,
open public/games/ and use Add file → Upload files." The screen is clear and
well built; the instruction is simply not something a child can carry out, and
is a chore for an adult once per game. The stated goal of the tool ends with
"ship it somehow", and this is the weakest link in the whole path by a distance
— worth its own decision rather than a layout tweak.

---

## Looked at and found fine

- **The cut-scene sprite strip** — 18 tiles across 815px looked cramped and
  possibly clipped at full size. Zoomed 2×, every icon sits inside its tile with
  margin. No finding.
- **The dotted frame labels** ("Frame 1 ·", "Frame 2 ·") read like a truncation
  bug. They are deliberate: `SkinEditorScene` appends "·" to an *unpainted*
  frame so "which poses have I drawn" is answerable at a glance. The only
  reservation left is that nothing on screen says what the dot means, which is a
  matter of taste and is listed nowhere above as a defect.
