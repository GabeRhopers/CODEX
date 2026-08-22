# Rhopers Game Maker

A browser-only, drag-and-drop platformer level editor and player, built
from scratch on Phaser 3 (MIT). See
`docs/spellbound-editor-implementation-plan.md` for the full architecture,
data model, and milestone plan.

## Status

**MVP + M1 (undo/redo) + M2 content (enemy + real goal art, plus Brick/
Bounce/Spike Crawler/Bat, plus a full Items set — Coin/Heart/Speed
Potion/Feather/Shield, all with real gameplay effects, resolving the M2
hit-points open question — see "Items & hit-points" under Art) + a
tabbed, categorized palette (Blocks/Markers/Enemies/Items/Decor — replacing
the single ever-widening icon row) + a parallax scrolling background with
a 6-scene picker unrelated to ground-block skin, including 3 original painted
scenes (see "Parallax background & background scenes" under Art) + a
second content pass (Snow ground skin, Water hazard, Golem enemy, the Key→Chest
mechanic, 10 purely-cosmetic Decor entities, and a win-screen Trophy — see
"Second content pass" under Art) + M4 (home page / level browser) + 6
template levels + M8 (World Maker v1) done.** The game opens on a **Menu** (home
page) — a 2x2 card grid, each with a live status line, covering
everything there is to do: **New Level** (blank grid), **Templates**
(6 pre-built levels to play or remix — see below), **My Levels** (your
own saved work), **Worlds** (chain levels into a course). **My Levels**
lists every saved level (not just a single most-recent slot) with Edit
and Delete per row; unlike an earlier version of this project, Templates
are no longer copied into it automatically — they live in their own
always-available, read-only **Templates** screen instead (see "Templates
& ground skins" under Art), so deleting one of your own levels never touches
them and vice versa. **Worlds** chains any of your saved levels into a
played-in-order course — see "World Maker" under Controls, and plan doc
§9.3 M8 for the v1 scope and what's deliberately deferred from it. Paint
a level → Test Play → win/lose → Save → Menu → My Levels → Edit
round-trips identically, every paint/erase/entity edit is undoable — a
whole paint drag reverts as one step, not tile by tile — and a level can
include a patrolling ghost-pillow enemy (stomp it from above to kill it,
touch it any other way and you lose) plus a goal marker (currently a
caged sheep — see "Goal art" under Art) to reach. As of 2026-08-15,
Enemies/Items/Decor can be placed any number of times per level (no longer
one-per-type). As of 2026-08-16, persistence moved off
`localStorage` (whose ~5-10MB per-origin quota was routinely getting
exceeded by custom background/music uploads) onto Google Drive, gated
behind a lightweight "Who's playing?" profile picker (Mike/Gabriel/
Andressa) — see "Google Drive storage & profiles" under Art. Also as of
2026-08-16, any Marker/Enemy/Item/Decor brush can be reskinned with a
user-uploaded image, shared instantly across all 3 profiles — see
"Custom skins" under Art. Also as of 2026-08-16, the editor's menus were
restructured into a header (Level Name/Undo/Redo/Eraser/Save/Test Play/
Menu), a left "Palette" panel and a right "Level Settings" panel flanking
the grid, and a stats footer — replacing the earlier per-category Erase
brushes with one universal header Eraser toggle — see "Editor layout:
header/footer/dropdown" under Art. Also as of 2026-08-16, enemies can be
placed as **Small/Medium/Large** and every enemy's hitbox now tracks its
actual art instead of Phaser's default full-texture box — see "Enemy
hitboxes & sizes" under Art, which also covers two real bugs that pass
found: a skinned entity's size wasn't normalized in Test Play, and a
second Test Play in one session could crash. Also as of 2026-08-16,
Water no longer damages the player and can be swum through, with its own
"deeper" fill frame when stacked (mirroring Ground's top/fill look) —
Lava is unchanged and still an instant hazard — see "Water is swimmable,
not a hazard" under Art. Also as of 2026-08-16, the player and every enemy
are now confined to the level's own left/right edges — see "Player/enemy
world bounds" under Art. Also as of 2026-08-16, the game canvas no longer
gets stuck at a stale size on mobile when the browser's own address bar
shows/hides — see "Cross-device layout, part 2: the stale-canvas-size bug"
under Art. Also as of 2026-08-16, the app was renamed from "Spellbound
Level Editor" to **Rhopers Game Maker** — see "Rebrand" under Art for how
existing users' saved levels/worlds carry over. Also as of 2026-08-16,
custom skins became a real multi-item library per brush (not just one
active upload) with a thumbnail-submenu picker, and backgrounds/music
uploads got that exact same shared-library-plus-picker treatment for the
first time (previously a one-off copy embedded in a single level) — see
"Skin/background/music libraries" under Art, which also covers a real
WebGL crash that pass found and fixed. Also as of 2026-08-17, levels can
place any number of **Checkpoint** bells — touching one makes it where a
loss respawns you (for that attempt only; a fresh Test Play always starts
back at Spawn) — see "Checkpoints" under Art. Also as of 2026-08-17, a
level can grow up to two extra grids — one **Sub** area and one **Up**
area, each with the exact same block/marker/enemy/item/decor palette and
its own independent Background/Music as Main — connected via a **Magic
Basket** marker that teleports the player between them, landing exactly
on the paired basket, with score/hearts/buffs/active checkpoint carried
through — see "Sub/Up areas" under Art. Also as of 2026-08-17, a
standalone **Skin Creator** (a "Skin Creator" link on the Menu, not
nested in the level Editor) lets you paint a 32x32 pixel-art skin from
scratch — pick one of 5 preset color palettes, paint on a checkerboard
canvas, save — for any of the ~26 skinnable Marker/Enemy/Item/Decor
brushes, feeding straight into the same shared skin library the ordinary
upload path already used — see "Skin Creator" under Art. See the plan doc §9.1
for the exact MVP scope and §9.2/§9.3 for
what's still deliberately deferred (more tile/enemy variety, scrolling,
IndexedDB, backend sharing, renaming worlds from the browser — levels
themselves can be renamed as of 2026-08-14, see "Level name" under Art).

Controls add **Ctrl+Z** / **Ctrl+Y** (or **Ctrl+Shift+Z**) for undo/redo,
plus matching header buttons. As of 2026-08-16 the editor's menus are a
header (Level Name/Undo/Redo/Eraser/Save/Test Play/Menu) above, a stats
footer (level size/cursor tile/entity count) below, and two docked
vertical panels flanking the grid in between — a left **Palette** panel
(a category chip that expands into Blocks/Markers/Enemies/Items/Decor,
that category's 2-column icon grid, then a **Skin** picker trigger) and a
right **Level Settings** panel (**Background**/**Music** picker triggers,
then Clear) — replacing the earlier 5-tab "Tools" panel and single-purpose
"Actions" panel, and replacing the old 5 per-category Erase brushes with
one universal Eraser toggle in the header (see "Editor layout: header/
footer/dropdown" under Art). Each picker trigger opens a thumbnail submenu
rather than a single upload/clear button — see "Skin/background/music
libraries" under Art.

*Engineering note:* undo/redo keyboard shortcuts are guarded against a
real, reproducible quirk found while testing in this project's headless
sandbox — under software-rendered WebGL frame stalls, Phaser's keyboard
plugin can re-emit a single physical keypress as its `keydown-<KEY>` event
more than once within one rendered frame (confirmed via a raw
`window.addEventListener('keydown', ...)` listener showing exactly one
native event each time, while Phaser's derived event fired 1–3 times
nondeterministically). `EditorScene.onceThisFrame()` dedupes by
`game.loop.frame` so a single keypress can never trigger undo/redo (or
Test Play) twice.

## Getting started

```sh
npm install
npm run dev       # start the dev server (Vite)
npm run build     # type-check + production build to dist/
npm test          # run the unit test suite (Vitest)
npm run test:e2e  # run the browser e2e suite (Playwright — see tests/e2e/)
npm run typecheck # type-check only, no build
```

Open the dev server URL in a browser. Controls:

- **Home page** (opens on load): a 2x2 card grid — **New Level** starts a
  fresh empty editor; **Templates** opens the template browser; **My
  Levels** opens your saved-levels browser; **Worlds** opens the world
  browser. Each card's subtitle is a live status line (how many you've
  saved, or a nudge toward New Level/Templates when empty). Below the grid,
  one full-width bar adapts to who's looking: **Continue** reopens your most
  recently updated level in one click, or, with nothing saved yet, points
  you at the templates instead. Arrow keys move a focus ring across the
  whole page and Enter/Space opens whatever it's on, so the home page works
  without a mouse.
- **Templates**: 6 pre-built levels, one per ground skin plus two showcasing
  Brick/Bounce/Bat/Spike Crawler together and one showcasing the second
  content pass (see "Templates & ground skins" and "Second content pass" under
  Art). **Play** runs it directly; **Use This Template** opens it in the
  editor as an independent copy (a blank id, so Save creates a new level
  in My Levels — the template itself is never modified). **← Back**
  returns to the home page.
- **My Levels**: every saved level as a row (name + last-updated time)
  with **Edit** (opens it in the editor) and **Delete**. **New Level**
  and **← Back** (to the home page) are also here.
- **Worlds** (course maker): **My Worlds** lists every saved World (name +
  level count) with **Play**, **Edit**, and **Delete**; **New World**
  opens **World Maker** — click a saved level on the left to append it to
  the world's play order on the right, click an entry on the right to
  remove it, then **Save World**. World Maker has the same autosave and
  persistent save-state indicator as the level editor (see "Autosave &
  save-state tracking" under Art) — adding/removing a level marks it
  unsaved and autosaves a couple seconds later, and **← Back** flushes an
  unsaved change first, same as the editor's Menu button — with one
  difference: an empty world (no levels yet) never autosaves or gets a
  storage entry, matching **Save World**'s own "add at least one level
  first" validation. **Play** runs the first level; winning a
  level that isn't the last one shows "Level Complete!" — press **N** to
  advance to the next level, or **R** to replay the current one; winning
  the last level shows "World Complete!"; **Esc** at any point returns to
  My Worlds (not the editor, since a World isn't edited through it).
- **Skin Creator** (a chip in the home page's footer row, not a
  5th card — see "Skin Creator" under Art for why): pick **Grampa** to paint
  the player character across its five poses (idle, walk1, walk2, jump, cast),
  or an enemy to paint a looping animation of up to four frames — the frame
  list sits beside the canvas, and any pose you skip falls back to that skin's
  own idle. Otherwise: pick an existing
  pixel-drawn skin to re-edit, or **+ New Skin** and choose which of the
  ~26 skinnable brushes it's for. **Save** adds it to that brush's shared
  skin library and makes it active immediately, same as an ordinary
  upload — see the Custom skins bullet below. Its own canvas has **Undo/
  Redo** (buttons or Ctrl+Z/Ctrl+Y), **Paint/Fill/Pick** tools (Fill
  flood-fills a same-color region; Pick samples a color already on the
  canvas and resumes painting with it), a **Mirror** toggle (paints the
  horizontal-mirror cell too), a **Grid** overlay, and **Zoom +/−** —
  right-click (or a right-button drag) always erases regardless of the
  selected tool or color, no swatch-switching needed. See "Skin Creator
  tools" under Art for the full 2026-08-17 pass that added all of this.
- **Palette** (left panel): a **category chip** at the top (e.g. "Blocks
  ▾") expands into the 5 categories — Blocks, Markers, Enemies, Items,
  Decor — on tap; picking one collapses it back and shows that category's
  2-column brush grid below the chip. Click a brush, then click/drag on the
  grid to paint or place. See "Categorized palette" under Art for the
  category split and "New blocks & enemies" / "Items & hit-points" /
  "Second content pass" for what each brush does. Every brush is ordinary —
  not limited to any specific template — so any level, new or existing,
  can place any of them, from Coin to a Chest to a Sleeping Bat decoration.
  Enemies, Items, and Decor have no per-level placement limit — a level can
  have five Ghosts and a dozen Coins if you want them, each on its own tile
  (see "Multiple instances & the universal Eraser" under Art). Markers
  (Spawn/Goal/Chest) stay one-per-level as before: placing a second Spawn
  moves it rather than adding another, since a level can only ever start
  in one place. **Checkpoint** is the one Marker that breaks that rule — a
  level can have any number of them, same as Enemies/Items/Decor — see
  "Checkpoints" under Art. **Basket (Down)** and **Basket (Up)** are two
  more exceptions — see the Area switcher bullet below.
- **Hand** (header toggle, right of Eraser): grabs whatever occupies a
  clicked tile — an entity first, or the ground block itself if there's no
  entity there (2026-08-17: blocks were left out of the first version of
  this tool, then added the same day — see "Hand tool" under Art) — and
  lets you drag it to a new tile, instead of erasing and re-placing to
  move something. Press down to grab, drag (an entity's own marker follows
  your pointer; a block has no sprite of its own, so it just visibly
  disappears from its tile the moment you grab it — the ordinary hover
  highlight shows where it'll land), release over an empty tile to drop
  it. Releasing outside the grid, back on its own tile, or onto a tile
  something else already occupies snaps/paints it back to where it
  started (a status toast says "Tile occupied" for the last case); a
  valid move is one undo step, same as any other edit. Mutually exclusive
  with Eraser — only one can be the active tool, so turning one on turns
  the other off.
- **Area switcher** (header, right of Hand): **Main** / **+Sub** /
  **+Up** buttons switch which of the level's up-to-three grids you're
  editing — clicking **+Sub** or **+Up** the first time creates a blank
  area sized to match Main's current width/height, after which its button
  reads **Sub**/**Up** (no more "+") and a red **Delete** button appears
  next to it (two-tap confirm, same shape as Clear) for discarding that
  area and returning to Main. Each area keeps its own ground layer,
  entities, undo/redo history, and Background/Music choice — painting or
  placing in Sub never touches Main or Up. Place a **Basket (Down)** (from
  the Markers tab) in both Main and Sub, or a **Basket (Up)** in both Main
  and Up, to connect them — see "Sub/Up areas" under Art for the full
  teleport story.
- **Enemy Size** (right "Level Settings" panel, below Clear): **Small /
  Medium / Large** — a placement-time modifier for the next enemy you
  place, not a property of anything currently selected, so it stays put
  across category/brush switches the same way the palette selection
  itself does. "Medium" is every enemy's original, unscaled look. Click an
  already-placed enemy again with a different size selected to resize it
  in place (erase + re-place in one step) rather than needing to erase it
  by hand first. See "Enemy hitboxes & sizes" under Art for how this
  interacts with hitboxes and custom skins.
- **Eraser** (header toggle): erases whatever occupies a clicked/dragged
  tile — an entity of any category if one's there, otherwise the ground
  tile itself — regardless of which Palette category tab happens to be
  open. Replaced the earlier 5 separate per-category Erase brushes as of
  2026-08-16 (see "Multiple instances & the universal Eraser" under Art);
  the header button stays visibly highlighted while active, and a second
  click turns it back off. Undo/redo cover erases exactly like any other
  edit.
- **Custom skins**: select any Marker/Enemy/Item/Decor brush in the left
  panel, then click the **Skin** trigger below the icon grid to open a
  submenu of small thumbnails — every skin ever uploaded for that brush,
  plus a non-deletable "Default" (its built-in art) — and pick one to
  make it active, or use the submenu's own **+ Upload** tile to add a new
  one. Applies to that brush's palette icon, every already-placed
  instance, and gameplay, shared instantly across all 3 profiles (not
  just the current level). Blocks aren't reskinnable yet. Backgrounds and
  music share this exact same trigger-and-thumbnail-submenu shape — see
  "Skin/background/music libraries" under Art.
- **Test Play** (button or Space): plays the level you've built. Requires
  a Spawn and a Goal to be placed first, in any of Main/Sub/Up (they don't
  both need to be in the same area); enemies and items are optional.
- In Play mode: **arrow keys / WASD** to move, **Up/W/Space** to jump
  (press again mid-air for a second jump if you've collected a Chicken
  Slipper), **X** (or the ⚡ on-screen button) to fire the PJ Thunder
  Hat's shock, if you've collected one — see "Power-ups" under Art for
  both, **Esc** back to wherever you launched Play from (the editor for
  Test Play, My Worlds for a World, or Templates for a template's Play
  button — the on-screen hint always names the right one), **R** to
  restart after winning/losing. Jump
  on top of the Ghost or Bat to squish it; touching either any other way,
  or touching a Spike Crawler at all (it can't be stomped — though the
  Thunder Hat's shock can defeat it), costs you the
  level **unless** you're holding a Heart in reserve or are currently
  Shield-protected — see "Items & hit-points" under Art. The character
  poses differently for each situation — walking, jumping, swimming,
  casting, surviving a hit, winning and losing all look distinct; see
  "Character situations" under Art. Touching a
  **Checkpoint** bell lights it up (and dims whichever one was lit
  before) and makes it where **R** respawns you after a loss, instead of
  back at Spawn — see "Checkpoints" under Art for why that only applies to
  retrying the attempt you're on, not a fresh Test Play. Stepping on a
  **Magic Basket** instantly teleports you to wherever the matching
  basket sits in the paired area — see "Sub/Up areas" under Art. A Bounce
  block launches you noticeably higher than a normal jump; a Brick is
  just solid ground with a different look. On a
  touchscreen, semi-transparent **◀ ▶ ▲** buttons in the corners (see
  "Mobile/touch" below) do the same three things and the win/lose screen
  grows tappable **Restart**/**Next Level** buttons next to its
  keyboard-only hint text, since there's no R/N/Esc key to press.
- **Save** (header button): persists the current level to Google Drive
  under its own id (as of 2026-08-16 — see "Google Drive storage &
  profiles" under Art for why this replaced `localStorage`) — every level
  you save is kept (see My Levels), not just the most recent one. You
  rarely need to click it: a persistent **● Saved / ● Unsaved changes /
  ● Saving… / ● Save failed** indicator in the footer's bottom-right corner
  (moved there from the header as of 2026-08-17 — see "Autosave &
  save-state tracking" under Art) tracks
  whether the level in memory matches storage, and edits autosave a couple
  seconds after you stop — Save itself still exists for "save right now
  and show a confirmation toast," and still mints the level's id on first
  use exactly like autosave does.
- **Menu** (header button): also flushes an unsaved autosave first if
  one's pending, so navigating away never drops an edit still inside the
  debounce window — back to the home page.
- **Clear** (right "Level Settings" panel): wipes the current grid and
  entities. A two-tap confirm, not a native popup — the first tap arms it
  (label changes to "Clear? Tap again," red highlight, auto-reverts after
  ~3s if you don't follow up), the second tap while armed actually clears.
- **Blocks palette**: every ground/brick/bounce/hazard skin — Grass/Desert/
  Castle/Snow Ground, Brick/Castle Brick, Bounce/Castle Bounce, Water/Lava,
  plus Erase — sits in the palette simultaneously, grouped with a small gap
  between clusters. There is no level-wide "theme" to switch: which skin
  a block renders as is a property of that block, chosen when you paint it,
  so one level can freely mix Grass Ground next to Snow Ground next to a
  Castle Brick (see "Templates & ground skins" under Art). This replaced an
  earlier in-editor Theme picker that cycled one active skin at a time —
  Snow's ground tile, for instance, used to only be reachable via the
  Frozen Cavern template or that cycle button, one skin at a time; now
  every skin is just an icon away, on every level, always.
- **BG: \<name\> ▾**: click to open a submenu of small thumbnails — the 4
  built-in, plain non-parallax images (**Meadow**, the default, **Sunny
  Valley**, **Frozen Volcano**, **Pirate Cove**) plus every background any
  of the 3 profiles has ever uploaded, shared across every level (not just
  the one you uploaded it into) — pick one to use it, or use the
  submenu's own **+ Upload** tile to add a new image to the shared pool.
  Persists on Save/autosave same as any other edit (see "Static background
  (current)" under Art for why there's no pan/zoom, and
  "Skin/background/music libraries" under Art for the shared-library
  picker itself).
- **Music: \<name/None\> ▾**: same picker shape as Background — a level
  can have its own uploaded soundtrack, played during Test Play and actual
  Play (not while painting); the submenu's **None** entry is always first
  (there's no built-in track pool the way there is for backgrounds), then
  every uploaded track, plus a **+ Upload** tile to add one. See "Music"
  under Art for the size cap and why audio can't be downscaled the way a
  background image is, and "Skin/background/music libraries" under Art
  for the shared library itself, plus the shared mute/volume control (also
  on the home page) that affects whichever one is currently playing.
- **Level Name** (below the grid): edit the level's own name — commits on
  blur/Enter, Escape reverts without committing. See "Level name" under
  Art for why this needed to be a real HTML text input and two bugs that
  came with it (typing a space used to launch Test Play; clicking Save
  right after typing a name used to silently drop it).
- **Undo** / **Redo** (buttons, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z): a whole
  paint drag, a single entity placement, or a Hand-tool drag-move undoes as
  one step. Clear resets the undo history (undoing past a full level swap
  doesn't make sense); so does loading a different level via My Levels →
  Edit.

## Mobile / touch

Fully playable on a phone, no separate build or mode — the same page
adapts. Three things make that true, all in `main.ts`/`index.html` unless
noted:

- **Scaling**: the game's internal resolution stays a fixed
  `GAME_WIDTH`×`GAME_HEIGHT` (1050×468 as of the 2026-08-16 header/footer
  layout pass, computed rather than hand-tuned — see `config/gameConfig.ts`
  and "Editor layout: header/footer/dropdown" under Art; every scene's
  layout math is untouched by the scaling itself), but Phaser's Scale
  Manager runs in
  `FIT` + `CENTER_BOTH` mode, so it's letterboxed down (or up) to whatever
  viewport it's opened in, phone included, instead of getting clipped or
  forcing page scroll. See "Cross-device layout: the double-centering bug"
  below for how that centering used to go wrong, and for why pinch-zoom is
  deliberately allowed rather than blocked — `index.html`'s viewport meta
  and `touch-action` are tuned specifically to stop a tap on an on-screen
  button from also scrolling/double-tap-zooming the page, without blocking
  an intentional two-finger pinch.
- **Editor & menus**: every button/palette icon/list row is already a
  Phaser interactive object driven by pointer events, which Phaser treats
  identically whether the pointer is a mouse or a finger — no separate
  touch-specific UI code was needed there. `input.activePointers: 3` in
  the game config raises the simultaneous-touch budget above the default
  of 1, for Play mode's move+jump-at-once case below.
- **Play mode**: `src/gameplay/TouchControls.ts` draws three
  semi-transparent ◀ ▶ ▲ buttons pinned to the corners; their pressed
  state is OR'd into keyboard input in `PlayerController.updatePlayerMovement`
  rather than replacing it, so the same function drives movement
  regardless of input source and the buttons are just as clickable (if
  redundant) with a mouse. `PlayScene`'s win/lose screen also grows real
  **Restart**/**Next Level** buttons (`makeOverlayButton`) alongside the
  existing R/N/Esc hint text, which is keyboard-only wording that's
  useless without a keyboard. `MenuScene` adds a one-time "rotate your
  phone sideways" hint when `window.innerWidth < window.innerHeight`,
  since this landscape-shaped game gets letterboxed quite small in
  portrait — advisory only, everything still works either way.

## Art

**Player character:** a real hand-drawn wizard sprite sheet the user
supplied (idle, walk1, walk2, jump, cast — all originally facing right).
Cropped into individual frames, background keyed to transparent, and
normalized to a common 48px display height so animation-frame swaps never
jitter the character's size — see `public/assets/wizard/*.png` and
`src/gameplay/wizardAnimation.ts`. Left-facing movement reuses the same
right-facing frames via `setFlipX`, the standard 2D-platformer approach,
rather than needing mirrored art. The physics collision body is a fixed
size, re-centered under whichever frame is showing, so hitbox behavior
never changes with the animation.

**Ghost-pillow enemy:** original art drawn to match the wizard's style —
rounded shapes, thick navy ink outlines, flat pastel fills with a little
shading, no external references. Built with Pillow (the build sandbox
can reach PyPI even though it can't reach asset sites): clean vector
shapes at high resolution (rounded rects, overlapping ellipses, a
two-pass "draw it twice, slightly bigger underneath" outline trick),
then LANCZOS-downscaled to final size — the same finishing pipeline used
on the wizard frames, so the wizard and ghost-pillow read as one
consistent hand-drawn family. See `public/assets/entities/ghost-pillow.png`
and `src/gameplay/EnemyBehaviors.ts` (patrol + bob + the stomp-from-above
rule, unit-tested in `EnemyBehaviors.test.ts`).

**Goal art.** The goal marker was originally a hand-drawn "dream-cloud
portal" in that same wizard-family style. As of 2026-08-14 it's a
project-owner-supplied image instead — a caged sheep
(`public/assets/entities/caged-sheep.png`, texture key `goal-portal`,
unchanged despite no longer being a portal — nothing else references the
filename, so nothing beyond `BootScene.preload`'s one `load.image` line
needed to change). Processed the same way as the static background image
(see "Static background (current)" above): flood-filled from the
source's white background to transparent (`PIL.ImageDraw.floodfill`,
seeded off a corner, so the sheep's own white wool — not border-connected
to the background — stays intact), cropped to the content's bounding
box, then resized to a 48px-tall PNG with alpha premultiplied before a
LANCZOS downscale and unpremultiplied after (plain RGBA resize would
otherwise fringe dark or light halos at the transparent edge). Sized to
land in the same visual range as the enemy/goal illustrations it sits
next to (ghost-pillow is 40x40; this was 43x48) — `PlayScene` renders it
at that native pixel size with no additional scaling beyond its existing
idle pulse tween, same as before.

As of 2026-08-17, the caged-sheep art itself was swapped for a new
project-owner-supplied version (a blockier, flat-shaded pixel-art take on
the same "creature behind gold cage bars" idea) — same filename/texture
key, so still nothing beyond the source PNG needed to change. Simpler to
process than the original: the supplied file already carried a real alpha
channel (background fully transparent, not painted white), so no flood
fill was needed — just crop to content and the same premultiplied-alpha
LANCZOS downscale to 48px tall (37x48 this time, since the new art reads
narrower than the old one at the same height).

**Ground tiles merge with their neighbors.** Ground tiles have no border,
and which of two dirt/grass frames a cell renders as (grass-capped
"exposed to air" vs. plain "buried under another ground tile") is derived
purely from its neighbor above at render time — never stored. A whole
row of ground reads as one continuous strip, and a vertical stack shows
grass only on the true top surface, not as a stripe partway up a pillar.
See `src/level/groundAutotile.ts` (unit-tested) — `TilePainter` re-derives
the frame for the painted cell and the cell directly below it (the only
neighbor whose correct frame can change) on every paint/erase, and
`PlayScene`/`EditorScene.rebuildVisualsFromLevel` derive a full render
grid the same way when building/reloading a level. The saved level format
is untouched: it still stores one ground/empty value per cell, exactly as
before.

Picking the right frame is only half of "no border," though — the source
art matters too. The Kenney grass/sand/dirt tiles this project uses
(`TILE_INDEX_GRASS_TOP`/`SAND_TOP`/`DIRT_FILL` in
`prepare-kenney-assets.py`) turned out to be the pack's standalone-block
variants, not the seamless-interior ones Kenney's own demo actually
composites together — each has a ~2px bevel baked into some or all of its
4 edges, confirmed pixel-exact against the untouched 18x18 source (not an
upscaling artifact). Two placed-adjacent ground tiles each contributing
their own half of that bevel is exactly what produced the "huge gaps
between blocks" look — visible as a grid of individually-outlined blocks
instead of one solid mass, even though the autotile logic above was
already correctly picking one continuous frame. `load_terrain_tile()` in
the prep script crops that border away before upscaling, for ground tiles
only; Brick keeps its border on purpose (see below) since it's meant to
read as a distinct block, not merging terrain.

**Templates & ground skins.** Ground/Brick/Bounce/hazard blocks each come
in a "skin" — grass, desert, castle, or snow — but a skin is a property
of the individual *block*, not the level: `LevelData` has no `theme`
field at all, and every skin's blocks are always available in the
editor's Blocks palette side by side (see "Blocks palette" under
Controls), so one level can freely mix Grass Ground next to Snow
Ground next to a Castle Brick if you want. `src/level/groundSkins.ts`
holds the color palette per skin (for the ones — currently just castle —
drawn procedurally, see "Real art" below) and the skin-keyed texture
naming; `src/level/groundAutotile.ts` is where a stored tile value
becomes a render frame in the combined multi-skin tileset (see below).

`src/level/templateLevels.ts` hand-authors 6 beatable levels, exported as
`TEMPLATE_LEVELS` and served by `TemplateBrowserScene` — always
available, never written to `localStorage` (a change from an earlier
version of this project, which copied them into My Levels on first
visit): Sunny Hills (grass), Desert Canyon (desert), and Castle Ascent
(castle, a vertical staircase climb) each keep gaps/steps sized well
within the player's normal jump; **Spring Meadow** (grass) and **Crate
Canyon** (desert) additionally showcase Brick, Bounce, Bat, and Spike
Crawler together; **Frozen Cavern** (snow) showcases the second content
pass — see "Second content pass" under Art. Each template bakes one skin
into its own ground tile values at construction time (`levelFromRows`'s
`skin` option in templateLevels.ts) purely as an authoring choice — like
any level, nothing stops you from repainting one with other skins once
it's loaded in the editor. Spring Meadow/Crate Canyon
both put the goal on a platform reachable only by
bouncing — `BOUNCE_TILE`'s ~7.3-tile launch (`h = v²/2g` with
`BOUNCE_VELOCITY_Y=-719`, `GRAVITY_Y=1100` as of the 2026-08-19 gravity
retune — see "Jump feel retune" below) is far past normal-jump range,
so the platform is placed several tiles *to the side* of the pad rather
than directly above it: a player is still rising (not falling) when they
first reach that height, so a platform straight up would hit the
player's head like a ceiling instead of catching them from below. Placing
it beside the pad means the player is already descending by the time
their held-direction drift carries them into its column range — landing
on top the way a floating platform normally works. Verified in-browser
with an actual playthrough, not just the math, per this project's usual
practice of manually re-verifying anything touching physics/rendering
(see the plan doc §10).

**New blocks & enemies (first slice of the M2 content list).** Two blocks
and two enemies, picked because they slot into the existing architecture
with zero new gameplay rules (see the plan doc's M2 candidate list for
the full 20-item list and why the rest need more, like a scoring or
hit-points concept the game doesn't have yet):
- **Brick** (`BRICK_TILE`) — a second solid ground-layer value alongside
  plain ground; always renders as its own fixed frame regardless of
  neighbors, unlike ground's neighbor-derived autotiling (see
  `groundFrameAt` in `groundAutotile.ts`). Its Kenney source art keeps its
  visible border (unlike Ground's, which is stripped — see "Ground tiles
  merge with their neighbors" above) so it reads as a distinct block type
  at a glance, not as a variant of plain terrain.
- **Bounce** (`BOUNCE_TILE`) — same idea, but `PlayScene`'s ground
  collider callback checks `tile.index` against the bounce frame and, if
  the player is landing on its top face (`body.blocked.down`), overrides
  their Y velocity upward past a normal jump — one extra branch on the
  collider Test Play already had, not a new collision system.
- **Spike Crawler** & **Bat** — new `EntityType`s alongside `enemy-ghost`,
  sharing 100% of the ghost's movement code. `EnemyBehaviors.createPatrolEnemy`
  was generalized to take a texture key instead of being ghost-specific;
  `PlayScene` now spawns from a small `ENEMY_DEFS` table (type, texture,
  stompable) instead of one-off ghost-only fields. The Bat is stompable
  exactly like the ghost; the Spike Crawler sets `stompable: false`, so
  any contact costs the player regardless of direction — same
  `isStompFromAbove` check, just gated per enemy type.

**Categorized palette.** The palette used to be a single row of every
brush at once — fine at 9 icons, unworkable once Items brought the count
to 14 and climbing (now past 30 with the second content pass's Decor
category). `src/editor/Palette.ts` now tags every brush with a
`BrushCategory` (`blocks` / `markers` / `enemies` / `items` / `decor`); `EditorUI`
renders one row of small category-tab buttons plus, below it, only the
brushes belonging to whichever tab is active — the icon row stays a fixed,
manageable width no matter how many brushes a future pass adds to any one
category. Switching tabs rebuilds just that icon grid; the selection
outline hides itself (without losing the underlying selection) when the
selected brush's category isn't the one currently showing, and reappears
when you tab back. The grid of active-brush icons lives in a
`Phaser.GameObjects.Container` — as a single entry in the scene's display
list, a Container's *own* depth (not its children's) decides whether it
draws in front of or behind sibling objects like the Palette panel's
background rectangle, so `EditorUI` sets it explicitly above that
background; leaving it at the default depth was a real bug hit and fixed
during this pass — every icon silently rendered a layer behind the opaque
panel and never appeared, even though every other property (position,
texture, visibility) was correct. (As of the side-panel layout pass, the
icon grid is 2 columns instead of 1 row — see "Editor layout: header/
footer/dropdown" below — but the Container-depth mechanics are unchanged.)

**Autosave & save-state tracking.** As of 2026-08-14, Save is no longer
the only thing standing between an edit and losing it. `EditorScene`
tracks a `dirty` flag, flipped true by every paint drag, entity
move, undo, and redo (`markDirty()`, called from those exact spots —
`flushDragCommands`, `applyEntityBrushAt`, `undo`, `redo`), and flipped
back false only once a save actually succeeds. A small persistent label
in `EditorUI` (`saveStatusText`) mirrors that flag in real
time as **● Saved** / **● Unsaved changes** / **● Saving…** / **●
Save failed** — deliberately not the same mechanism as `setStatus`'s
existing transient 2.5s toast (still used for one-off messages like
"Cleared"), since a save-state readout needs to persist until the state
actually changes, not disappear on a timer. It sat in the header, just
left of Save, from 2026-08-16 until 2026-08-17, when it moved to the
footer's right edge instead (`FOOTER_SAVE_STATUS_X`) — freeing up the
header room the new Hand tool button needed (see "Hand tool" below) and
giving the readout a spot among the footer's other read-only stats
(level size/cursor tile/entity count) rather than crowding the header's
button row, which was already tight once Delete's area-delete button is
showing. `WorldMakerScene` has the
identical `dirty`/`saveStatusText` pattern (added/removed levels mark it
dirty) in its own header-style corner — it has no footer band to move
into, so it's unaffected by this — sharing the same four-state
vocabulary and colors from `src/persistence/saveState.ts` rather than
each scene inventing its own.

Three triggers actually write to storage, all funneled through one
`persistLevel()` (`persistWorld()` for Worlds) so id-minting,
`updatedAt`, and error handling only exist once:
1. **Manual Save** — the existing button, still shows the transient
   "Saved" toast on top of updating the persistent indicator.
2. **Autosave** — a `Phaser.Time.TimerEvent` debounced 2 seconds
   (`AUTOSAVE_DEBOUNCE_MS`) past the *last* edit (each new edit cancels
   and reschedules the pending timer via `.remove(false)`, so a long
   paint session doesn't write on every stroke), skipped entirely if nothing's dirty.
3. **Leave flushes** — clicking Menu (or World Maker's ← Back) awaits one
   final save first if dirty, so navigating away can't drop an edit still
   sitting inside the debounce window; a `"pagehide"` window listener
   attempts the same for tab close/refresh/back.

   **A real bug found and fixed here (2026-08-16, same day as the Drive
   move):** `leaveToMenu`/`leaveToBrowser` *awaited* `persistLevel`/
   `persistWorld` before navigating, but never checked whether that save
   had actually *succeeded* — `persistLevel` catches its own errors
   internally (see "Storage failures" below) rather than throwing, so the
   `await` always resolved normally even on a failed Drive write, and the
   very next line unconditionally called `scene.start("Menu")` anyway.
   Concretely: click Menu right as Drive is unreachable, and the app
   silently threw the edit away and moved on — the "● Save failed"
   indicator and status toast were set a moment earlier, but had no chance
   to actually register before the scene tore down, and the user simply
   landed back on the home page as if everything were fine. Fixed by
   re-checking `dirty` *after* the await (a failed `persistLevel` leaves
   it `true`, same flag a successful one clears) and returning early
   instead of navigating when it's still set — the failed level stays
   open, mid-edit, with the failure still visible, so the user can retry
   (click Menu again, click Save, or just keep editing) rather than
   silently lose work. Confirmed with a mocked-Drive Playwright test that
   forces the upload endpoint to return a 500: before the fix, the scene
   moved to Menu and the level was gone from Drive entirely; after it, the
   editor stayed open showing **● Save failed**, and a second Menu click
   once the mock was un-broken saved successfully and navigated normally,
   the level then showing up correctly in My Levels with its edit intact.
   `persistLevel`/`persistWorld` also now set **● Saving…** themselves as
   the very first thing they do (previously only autosave's own call site
   set it before invoking them) — a manual Save click or a Menu/← Back
   flush now shows the same "something is happening" feedback autosave
   already had, rather than sitting on a stale **● Unsaved changes** for
   however long the Drive round trip takes.

   **Known gap since the 2026-08-16 move to Google Drive:** the
   `"pagehide"` flush (`if (this.dirty) void this.persistLevel();` —
   deliberately not awaited, since `pagehide` itself can't be blocked
   on) used to be reliable specifically because `LocalStorageAdapter.save`'s
   `localStorage.setItem` call completed synchronously before that async
   function's first `await` — the write was already done by the time
   control returned, `pagehide` guarantees nothing about code *after*
   that. `GoogleDriveStorageAdapter.save` has no such synchronous
   fast path: every step (`getAccessToken`, `ensureAppFolder`,
   `findFileByName`, the actual upload) is a real network round trip, so
   a tab closed/refreshed within the ~2s autosave debounce window can now
   genuinely lose that last edit if the browser tears the page down before
   those requests land — something the old adapter's synchronous write
   made close to a non-issue. The explicit **Save** button and **Menu**
   (both properly `await` the write before doing anything else) are
   unaffected; this gap is specifically "closed the tab itself, fast,
   right after an edit." Worth fixing properly (`fetch(..., {keepalive:
   true})`, threaded through as an opt-in on the pagehide path only —
   applying it unconditionally would risk silently failing normal saves,
   since Chrome caps a keepalive request's body around 64KB and a
   level with a custom background/music upload routinely exceeds that)
   if this turns out to bite in practice; not yet done.

A level's id is now effectively minted on **first edit** rather than
first explicit Save (autosave reaches `persistLevel`'s
`if (!this.level.id) this.level.id = crypto.randomUUID()` well before a
user might ever click the button) — the practical effect is that a level
you started, edited, and merely navigated away from now shows up in My
Levels, where it previously wouldn't have unless Save was clicked. An
empty, completely untouched level (or an empty World with zero levels)
still never gets an id or a storage entry — nothing marks it dirty in
the first place, so there's nothing for autosave to act on.

Storage failures (network unreachable, an expired Drive session needing
reconnect, a Drive API error) are caught rather than becoming a silent
unhandled promise rejection — `persistLevel`/`persistWorld` wrap the write in
try/catch, leave `dirty` true on failure (nothing was actually
persisted), and show **● Save failed** plus a status message rather than
retrying on a timer (if storage is genuinely unavailable, retrying every
couple seconds would just be noise — the next edit or another manual
Save click tries again naturally). `dirty` staying `true` on failure is
exactly what the Menu/← Back leave-flush fix above now keys off of to
know a save didn't actually go through.

**Google Drive storage & profiles.** As of 2026-08-16, persistence moved
off `localStorage` onto Google Drive — the trigger was `localStorage`'s
own ~5-10MB per-origin quota (see "Custom uploaded backgrounds" and
"Music" above) getting routinely exceeded once a handful of levels each
carried an inline base64 background image and/or an up-to-4MB music
upload. `StorageAdapter`/`WorldStorageAdapter` themselves didn't change —
they were already written as interfaces specifically so the backend could
be swapped later (see StorageAdapter.ts's own docstring, which named
"IndexedDB, a backend" as the anticipated case) — only which
implementation `src/persistence/storage.ts` hands out changed, from
`LocalStorageAdapter`/`LocalWorldStorageAdapter` to
`GoogleDriveStorageAdapter`/`GoogleDriveWorldStorageAdapter`. The Local
adapters are still in the repo, unused — deliberately not deleted, given
how central storage is and how much newer/less-proven the Drive path is
by comparison.

*Auth.* `src/drive/googleAuth.ts` wraps Google Identity Services' token
client (the modern replacement for the deprecated `gapi.auth2` library) —
a browser-only OAuth flow needing just a public Client ID (safe to commit;
Google's own security boundary here is the Authorized JavaScript Origins
list configured against it, `https://gaberhopers.github.io` only, not
secrecy of the ID itself), no client secret, no backend. The access token
lives in memory only, never `localStorage` — a live credential isn't app
state worth persisting, and GIS's own silent-reconnect (`prompt: ''`,
tried automatically on every boot — see `ProfileGateScene`) already covers
"I signed in earlier, don't make me click again" for as long as the
browser still has a live Google session and prior consent. The OAuth
consent screen is deliberately left in **Testing** status (Google's
sanctioned way to skip the full app-verification review for small,
personal-use apps — up to 100 test users) with the project owner's own
account as the sole test user; the tradeoff is that a Testing-status
session needs re-authorizing roughly every 7 days, not once-and-forever.

*Scope.* Full `https://www.googleapis.com/auth/drive` access, not the
narrower `drive.file` scope, and deliberately so: `drive.file` only grants
visibility into files/folders the app itself created (or that were
individually opened via a Picker dialog) — the shared Drive folder the
project owner pointed this at already existed before the app ever touched
it, so `drive.file` would leave it invisible. `drive` is a "sensitive"
scope that would normally need Google's verification review for
production use at scale; Testing status is what makes skipping that
legitimate here.

*Data model.* Each level/world is its own `level-<id>.json` /
`world-<id>.json` file (see `src/drive/driveClient.ts`) inside a
dedicated **"Rhopers Game Maker"** subfolder created on first connect
inside the project owner's shared folder — a subfolder rather than using
that folder directly, so this app's many small JSON files stay organized
and don't clutter anything else kept there. Every file is tagged with
Drive's private `appProperties` (visible only to the app that set them,
distinct from Drive's `properties` which any app with access could read):
`{kind: "level"|"world", profile, levelId/worldId, name, updatedAt}`.
`list()` reads that metadata straight off the folder listing rather than
downloading every file's full content just to show a name and a
timestamp; `save()`/`load()`/`remove()` look a file up by its deterministic
name via a server-side Drive query (`name='...' and '<folder>' in
parents`) rather than listing-then-filtering, so those stay
single-request operations.

*Profiles.* `src/profile/Profile.ts`'s `PROFILES = ["Mike", "Gabriel",
"Andressa"]` are exactly what the project owner asked for — "something
super simple" — and deliberately **not** real per-person accounts: there's
one shared Google sign-in behind all three (see "Auth" above), and picking
a profile only sets a tiny `rhopers:profile` `localStorage` key (unaffected
by the quota problem that moved everything else off `localStorage` — it's
a handful of bytes) that scopes which levels/worlds `list()` returns via
the `profile` `appProperties` tag. Every profile's files are equally
visible/writable by anyone who can sign into that one Google account —
it's a filter for a shared household device, not an access-control
boundary between the three people. `ProfileGateScene` (Boot → here → Menu,
and re-entered from Menu's "Switch profile" link) gates the rest of the
app behind having both a profile picked and a live Drive connection,
trying a silent reconnect first so a returning visitor on the same
browser mostly never sees the "Connect Google Drive" button at all.

*A bug caught during development, not shipped:* `ensureAppFolder`'s
first version cached only the *resolved* folder id, not the in-flight
search-or-create request itself. `MenuScene` kicks off a
`levelStorage.list()` and a `worldStorage.list()` back to back without
awaiting either, and both adapters call `ensureAppFolder` — without
caching the promise, both calls raced past the "does the folder exist
yet?" check before either had an answer to cache, each independently
concluded "no" and created their own folder. Confirmed with a Playwright
test against a mocked Drive backend (a fake `google.accounts.oauth2`
global plus `page.route()` intercepting the real `googleapis.com`
endpoints — this environment has no outbound network path to Google's
servers at all, confirmed separately via a plain `page.goto()` timeout, so
this mock was the only way to exercise `driveClient.ts`'s actual request
formation and `GoogleDriveStorageAdapter`'s save/list/load logic before
shipping) before this fix; a single "Rhopers Game Maker" folder gets
created after it.

**Custom skins.** As of 2026-08-16, any Marker/Enemy/Item/Decor brush can
be reskinned with a user-uploaded image — click the brush in the palette
(the selection doubles as "which type," so there's no separate type
picker), then the **Skin** trigger below the icon grid — in the left
Palette panel, as of the 2026-08-16 header/footer layout pass; originally
in the right Actions panel. As of the same-day "Skin/background/music
libraries" pass (see below), that trigger opens a submenu of every skin
ever uploaded for the brush rather than holding just one — the paragraphs
below describe the underlying upload/storage/rendering pieces, which that
later pass extended into a real multi-item library rather than replacing;
see that section for the current picker UI, the library file shape, and
a real WebGL crash it fixed along the way. The image is
downscaled to a small PNG (`src/skins/skinUpload.ts`, `MAX_DIMENSION =
128` — much smaller than a background's 1600px, since these render at
roughly one tile; PNG rather than JPEG, since JPEG has no alpha channel
and would turn a reskinned ghost/item's transparent pixels solid white).
Skins apply everywhere that brush is used — the palette icon, every
already-placed instance in the current level, and actual gameplay — not
just future placements.

Blocks aren't reskinnable (the **Skin** trigger reads "Skin: N/A" for
them and can't be opened): all block rendering goes through Phaser's
tilemap system, drawing from one shared, GID-indexed spritesheet per
ground skin (`groundAutotile.ts`), not one swappable image per brush the
way every entity (a plain `scene.add.image`) works. Reskinning a block
would mean patching a specific frame inside that shared spritesheet
texture rather than swapping a texture key — a meaningfully bigger change
than "upload an image," and not part of this pass.

*Shared across all 3 profiles, not per-level.* Unlike a level's own
custom background/music (inline in that level's own JSON, private to
whoever's editing it), skins are the one piece of this app's data
deliberately **not** scoped to a profile — see Profile.ts's docstring on
the 3 profiles being a filter, not an access boundary. Every skin any of
Mike/Gabriel/Andressa uploads shows up for all three, in every level,
immediately, because there's only one shared Google sign-in behind all
three profiles anyway (see "Google Drive storage & profiles" above). All
currently-uploaded skins live in one consolidated `skins.json` file
(`src/skins/skinStorage.ts`) in the same app-managed Drive folder as
levels/worlds, keyed by Palette brush id — with only ~20-something
skinnable brushes total, resolving every skin needed to render the
palette or a level is one Drive read instead of one-per-skin, and
uploading a new one is a single read-modify-write. Known, accepted
limitation: two people uploading different skins at the exact same
moment could lose one (the second write's read-modify-write starts from
a snapshot that doesn't yet include the first) — not worth real
optimistic-concurrency handling for a 3-person household's occasional
skin uploads.

*Rendering.* `src/skins/skinLoader.ts`'s `resolveSkinTextureKeys` registers
each brush's *active* skin as its own `skin-active-<brushId>-<skinId>`
Phaser texture (via `scene.textures.addBase64`) — permanent and never
reused for different image data, since a skin's uploaded image never
changes once it exists (see "Skin/background/music libraries" under Art
for why that key scheme replaced an earlier one keyed by brush id alone,
and the WebGL crash doing so fixed). Deliberately a *separate* texture key
per skin rather than overwriting a brush's built-in key in place: several
built-in textures (e.g. `"enemy-ghost-pillow"`) are also reused as pure
decoration elsewhere (MenuScene's home-page icons) that has nothing to do
with level content and shouldn't silently change just because someone
reskinned the Ghost enemy for gameplay.

Resolution is async (a Drive read) but never blocks anything from
appearing — `EditorScene`/`PlayScene` build the palette/level with
built-in art first, then the resolve pass patches in any skins a moment
later (`EditorUI.applySkins`/`EntityPlacer.setSkinTextureKeys` re-render
the icon grid and re-sync placed markers; `PlayScene` just calls
`setTexture()` on every sprite it tracked via `trackSprite` as it
spawned them) — the same "pop in imperceptibly" tolerance every other
async texture resolution in this app already has.

*A real bug caught building this, unrelated to skins themselves:*
`ProfileGateScene.proceed()` never actually checked whether its own
silent Drive-reconnect attempt had succeeded before deciding whether to
show "Connect Google Drive" — it showed that prompt unconditionally
every time a profile was already picked, silently discarding a
successful silent reconnect and demanding an unnecessary click on every
single visit. The docstring even claimed otherwise ("no separate
isConnected() re-check needed"). Found via the same mocked-Drive
Playwright testing used to verify skins, not in production; fixed by
actually checking `isConnected()` and skipping straight to Menu when
true.

**Enemy hitboxes & sizes (2026-08-16).** Prompted by a user report to
review hitboxes and add a way to resize enemies — both landed together
since sizing an enemy and sizing its collision box turned out to be the
same underlying problem.

*Hitboxes.* Every enemy is an Arcade Physics sprite, and Arcade defaults
an un-configured body to the sprite's *full texture frame* — for every
built-in enemy, a 40x40 canvas. Measuring each texture's own alpha
channel (`PIL`'s `getbbox()`, offline) showed how far that default
strays from the actual art: the bat's wings/body only occupy a 40x20
strip vertically centered in that 40x40 canvas, so its hitbox used to be
roughly *twice* as tall as anything visible — touching well above or
below the bat's own sprite still registered a hit. Ghost/spike-crawler
had smaller but still real padding; only the golem (which fills its
canvas edge-to-edge) had an accidentally-correct default. Only the
player's own body was ever hand-tuned (`wizardAnimation.ts`'s
`BODY_WIDTH`/`BODY_HEIGHT`); nothing did the equivalent for enemies until
now. Fixed with a per-species hitbox *fraction* (`ENEMY_HITBOX_FRACTION`
in `EnemyBehaviors.ts`, tuned from those same bbox measurements) applied
via `body.setSize(..., true)` — the trailing `true` re-centers the body
automatically rather than hand-computing an offset per species, a
deliberate trade against exactly hugging an asymmetric silhouette like
the bat's (still much closer than the old full-frame default). Verified
visually, not just by inspection: `physics.arcade.debug: true` (Phaser's
own hitbox overlay) turned on temporarily, screenshotted in Test Play,
confirmed each species' magenta outline now tracks its actual art before
being turned back off.

*Sizes.* A new **Enemy Size** selector (Small/Medium/Large — see
Controls above) stores an optional `size` on the placed `LevelEntity`
(`LevelSchema.ts`; absent = "medium", so old saves and anyone who never
touches the selector are pixel-identical to before). Applied via
`setDisplaySize` rather than `setScale` specifically because it has to
survive a skin swap correctly (see below) — `setDisplaySize` targets an
absolute on-screen size regardless of the texture's own native
resolution, where `setScale` would multiply whatever that resolution
happens to be. The editor's own preview (`EntityPlacer.ts`) and
PlayScene's actual gameplay sprite use *different* baseline numbers for
the same three sizes (`ENEMY_EDITOR_SIZE_SCALE` vs. `ENEMY_SIZE_TARGET`)
since they were already starting from different baselines before this
feature existed — the editor tile-fits every marker to ≤32px
(`fitWithinTile`), PlayScene renders enemies at native size — so "Large"
means "1.4x the tile-fit preview" in one and "58px, the longer side" in
the other; both agree on "Medium ≡ today's unscaled look." Re-clicking an
already-placed enemy with a different size selected resizes it in place
(treated as a real change, not the "same brush already here" no-op every
other re-click is) rather than requiring erase-then-replace by hand.

*A real, separate bug this surfaced while verifying skins actually work
in Test Play, not just the editor's own preview:* PlayScene never
normalized a skinned entity's display size at all — `sprite.setTexture()`
swaps what's drawn but not the sprite's scale, so a skin uploaded at
anywhere up to `skinUpload.ts`'s 128px cap would render at its own full
uploaded resolution instead of a tile-appropriate one once the swap
landed, regardless of enemy size or entity type. Confirmed by uploading a
deliberately oversized (100x100) test skin and watching it render
full-size in Test Play. Fixed for every skinnable type, not just
enemies: enemies re-run the same `applyEnemySize` their spawn used (keyed
off their size, stashed on the sprite via Phaser's own
`sprite.setData`/`getData` rather than a second parallel map, since
`spritesByBrushId` only groups by brush id and loses which *instance*
had which size once two same-type enemies can differ); every other
skinnable type (Goal/Chest/Items/Decor — none of which have a body of
their own to worry about, since they're all collected via a separate,
always-tile-sized overlap zone, or in Decor's case have no physics at
all) gets a new, simpler `applyDefaultSkinSize` targeting roughly their
own built-in size (36px) instead.

*A second real, pre-existing bug found via the exact same testing —
present before this pass, not introduced by it:* `PlayScene.spritesByBrushId`
was never reset in `init()`. Phaser reuses the same scene *instance*
across every Play/Test Play/World run rather than constructing a fresh
one each time — `create()` reruns, but a plain class-field initializer
like `= new Map()` only ever runs once, at the object's first
construction. Without clearing it, a second Test Play in the same
session appended its freshly-spawned sprites onto the *previous* run's
list instead of starting clean, and since leaving a level (Esc/win/lose)
destroys every sprite from that run, the stale list ended up mixing live
sprites with already-destroyed ones. Silent until something actually
iterated that list and called a method on a destroyed sprite — which the
skin-resolve pass does on every Test Play — so it surfaced as a real,
reproducible crash (`TypeError: Cannot read properties of undefined
(reading 'sys')` inside `setTexture`) on a *second* Test Play of any
level with a skinned enemy, silently discarding the level's enemies from
that point on if it happened not to throw. Fixed by resetting
`spritesByBrushId` in `init()`, alongside every other per-run field
already reset there.

**Water is swimmable, not a hazard (2026-08-16).** Prompted by a user
report: Water used to behave exactly like Lava (an instant hit on
contact, via the shared `HAZARD_FRAMES` set — see "Water" under "Second
content pass" above) and looked the same at every depth, unlike Ground
blocks, which already show a different frame at the exposed top vs. when
buried. Both are fixed together, since the render side had to grow before
the gameplay side could split cleanly.

*Rendering: a real "deep water" frame.* Each real-art ground tileset
(`tileset-grass/desert/snow.png`) grew from 5 frames (top/fill/brick/
bounce/hazard) to 6 (top/fill/brick/bounce/hazard-top/hazard-fill) — the
same top-vs-buried split Ground already had, extended to the hazard slot.
No Kenney source pack is available in this sandbox to draw a new tile
from scratch (`prepare-kenney-assets.py` needs it as an input, and it
isn't committed to the repo), so `scripts/add-water-depth-frame.py`
derives the new frame procedurally instead: it samples the existing
surface frame's own flat fill color and adds a few subtle speckle dots
(mirroring `drawGroundFill`'s own dot accents) rather than inventing new
pixel art — a plain, wave-free tile in the *same tone* as the surface
frame (see the 2026-08-16 follow-up below — an earlier version of this
darkened the tone too, before a user report asked for it to match), that
reads as the same water, just deeper rather than a different color
entirely. `groundAutotile.ts`'s `groundFrameAt` picks
between it and the surface frame exactly the way it already picks Ground's
top vs. fill: by checking whether the cell directly above is empty
(exposed) or another hazard cell (buried). Castle's procedural Lava tile
gained a matching 6th frame too, purely so all four skins keep the same
stride for the shared gid math (`generateTextures.ts`'s `drawLava` is
called a second time, pixel-identical, at the new slot) — Lava
deliberately does **not** get a real "deeper" look, since unlike Water it
never stopped being an instant hazard regardless of depth.

*Gameplay: two sets, not one.* `groundAutotile.ts` used to export one
`HAZARD_FRAMES` set covering both Water's and Lava's frames, checked in
two places in `PlayScene`: `setCollisionByExclusion` (neither is solid)
and the per-frame damage check in `update()` (either costs a hit). Water
needed the first without the second, so it now has its own `WATER_FRAMES`
export; `HAZARD_FRAMES` narrowed to Lava only. `setCollisionByExclusion`
now excludes both sets (Water and Lava are still equally non-solid — you
fall/swim into either rather than standing on them) while the damage
check kept reading only `HAZARD_FRAMES`, which — now that it's Lava-only —
means Water stopped costing a hit with no new "is this water" branch
needed there at all.

*Gameplay: swimming.* A new per-frame check in `PlayScene.update()` reads
the tile at roughly the player's waist (half a tile above the
bottom-anchored `player.y`, not at the feet — checking the feet would
also flag a player merely *standing* on a submerged floor) against
`WATER_FRAMES`. `swimming` is that check **and** `!body.blocked.down`: a
player standing on solid ground that happens to be underwater still gets
normal grounded-jump physics, not floaty controls — only genuinely
swimming through open water does. While swimming, the normal grounded-
jump and double-jump branches are bypassed entirely in favor of setting
`body.setVelocityY` directly every frame (holding jump/up swims up at a
gentle `SWIM_UP_VELOCITY`, releasing it sinks slowly at
`SWIM_SINK_VELOCITY` — both far gentler than a normal jump/fall, so it
reads as buoyant control rather than fighting gravity with a one-off
impulse), the same per-frame-override pattern `updatePlayerMovement`
already uses for horizontal movement. Horizontal speed is reduced while
swimming via the same `speedMultiplier` parameter the Speed Potion buff
already uses, no signature changes needed. No changes were needed to the
wizard's animation: the player is already airborne (not grounded) while
freely swimming, so the existing jump pose already applies with zero
extra code.

Verified end-to-end in a mocked-Drive Playwright session: a level with a
2-tile-deep Water pit (floor removed, `WATER_TILE` at both depths, solid
ground beneath to catch a sinking swimmer) let the player fall in, sit at
the bottom, and jump back out to reach the goal and win — with no lose
banner at any point, confirming Water no longer costs a hit even on
prolonged contact. A separate level with a single `LAVA_TILE` in the
walking path still triggered an instant "You Lose" on contact, confirming
Lava's original hazard behavior is completely unchanged. The stacked-water
render fix was checked visually too: two Water tiles placed one above the
other show the bright wavy-crest surface frame on top and a flat,
speckled fill frame below — the same visual language Ground blocks
already use.

*Follow-up (2026-08-16, same day): matching tone.* The fill frame above
initially darkened the surface's own color (scaled to ~50-58% brightness
per channel) for a "deeper water" look, mirroring how a real body of
water gets darker with depth. A user report asked for the two to read as
the *same* water color instead, so `add-water-depth-frame.py`'s
`DEEP_FILL_SCALE` darkening step was dropped — the fill frame's base
color is now used exactly as sampled from the surface frame, with only
the (now slightly gentler, 85% vs. the old 75%) speckle dots providing any
tone variation at all. The script itself gained a small capability this
needed: it used to skip an already-6-frame tileset outright ("already
extended, nothing to do"), which meant retuning the fill's look at all
required resetting the tileset back to 5 frames via
`prepare-kenney-assets.py` first; it now regenerates frame 5 from frame 4
in place instead, so a future retune (or this one) is just a re-run.
Re-verified visually the same way as above — a stacked column of Water
tiles now reads as one continuous, uniformly-toned pool from the crest
down, with no visible seam between the surface and fill frames.

**Player/enemy world bounds (2026-08-16).** Prompted by a user report: the
player could walk straight past a level's left or right edge, off the end
of `StaticBackground`'s masked viewport (see its own docstring — the
background image only ever renders across exactly `level.width * TILE_SIZE`
pixels) into the plain canvas color beyond it, and enemies placed within a
couple tiles of an edge could patrol out past it the same way. Both are
symptoms of the same underlying gap: nothing ever stopped a horizontal
position from exceeding the level's own width — the ground tilemap simply
has no tiles out there to collide with, and `PlayScene.player` was
constructed with `setCollideWorldBounds(false)` outright.

Fixed with `this.physics.world.setBounds(...)` in `PlayScene.create()`,
covering exactly the same horizontal span the background is masked to
(`GRID_ORIGIN_X` to `GRID_ORIGIN_X + level.width * TILE_SIZE`) — with only
the left/right checks enabled (`checkUp`/`checkDown` both `false`). Top and
bottom are deliberately left alone: jumping above the top of the screen is
an ordinary part of a normal jump arc (nothing new stops that, on purpose),
and falling below the level is already how the existing "fell off the
level" loss condition works. `player.setCollideWorldBounds(true)` then
makes the player's own body respect that boundary.

Enemies (all four types share `createPatrolEnemy`/`updateGhostPatrol` — see
"Second content pass" above) don't collide with the physics world at all
(`setAllowGravity(false)`, driven purely by `GhostState.minX`/`maxX`), so
the same `setCollideWorldBounds` fix doesn't apply to them. Instead,
`createGhostState` now takes the level's left/right world-x bounds and
clamps the spawn-relative patrol range to never extend past either one —
an enemy placed right at the edge simply gets a shorter patrol leg on that
side instead of wandering out past it, keeping `updateGhostPatrol`'s own
direction-flip logic (which only ever triggers once `ghost.x` reaches
`minX`/`maxX`) from firing too late to matter. Covered by new
`EnemyBehaviors.test.ts` cases for the clamping itself; the world-bounds
side was verified in a mocked-Drive Playwright session — holding the move
key toward an edge for several seconds left the player pinned exactly at
it rather than drifting into the empty space beyond the background, and an
enemy placed one tile from an edge patrolled a shortened, still-fully-
visible leg instead of crossing it.

**Items & hit-points.** Seven collectible brushes, all in the palette's
Items tab, all ordinary general-purpose brushes usable in any level (not
hardcoded into specific templates) exactly like a Ground tile or a Ghost:
- **Coin** — +1 to the score shown in Play mode's top-right HUD.
- **Heart** — banks one extra hit. The next time you'd normally lose from
  touching a hazard, it's absorbed instead (the heart is spent, and you
  get a brief post-hit grace period so the same continued-contact overlap
  can't drain two hearts from one touch) — until then, contact is
  unforgiving exactly as before Hearts existed.
- **Shield** — a timed window (8s) where *any* bad contact is completely
  free, no heart spent; the player tints cyan for its duration.
- **Speed Potion** — a timed (6s) 1.6× move-speed multiplier.
- **Chicken Slipper** (internal id `item-feather` — see "Power-ups" below)
  — grants a second mid-air jump (press jump again while airborne);
  resets the moment you land.
- **PJ Thunder Hat** (see "Power-ups" below) — grants a ranged shock
  attack (X, or the on-screen ⚡ button), gated by an 800ms cooldown
  rather than limited ammo.

This is deliberately the game's first hit-points/buff system — earlier
content passes (Brick, Bounce, Spike Crawler, Bat) explicitly skipped
scoring/hit-points-shaped ideas for lack of one. The rules live in
`src/gameplay/PlayerStats.ts` as pure, unit-tested functions operating on
a plain `PlayerStats` object (score/extraHits/buff timestamps) — no Phaser
types touch that module; `PlayScene` owns spawning the item sprites (a
gentle bob tween, a static overlap zone per placed instance — see "Entity
eraser & multiple instances" under Art for why a level can have several of
the same item type), calling into `PlayerStats`, and reflecting the result
as a HUD string and a player tint. One deliberate asymmetry: **falling off the
bottom of the level stays unconditional instant-loss**, untouched by
Hearts or Shield — "bounce back and keep playing" fits absorbing a
hazard/enemy touch, but doesn't fit falling the way it fits an on-screen
hit, so `PlayScene.update`'s fall check is unchanged from before Items
existed.

**Static background (current).** Every level shows one fixed,
non-scrolling background image — no parallax, per the project owner's
"nothing special" framing when this replaced the multi-scene parallax
picker (see below). `src/gameplay/StaticBackground.ts` renders it: one
`Image`, scaled to *cover* the level's placeable viewport (like CSS
`background-size: cover` — `Math.max` of the width-ratio and
height-ratio, so it never falls short on either axis) and centered,
masked to the viewport exactly like `ParallaxBackground` was (see below
for why that masking matters). `update()` is a deliberate no-op, kept
only so the call site in `PlayScene` doesn't need to change if/when
parallax comes back.

*Which* image is a level-level choice again, as of 2026-08-14 —
`src/level/staticBackgrounds.ts` holds a small pool (`STATIC_BACKGROUNDS`,
typed `BuiltinStaticBackgroundId`) of four, each the project owner's own
supplied reference image used at its full native content (unlike the
dormant parallax pool's assets, none are pre-cropped to any particular
canvas, since a *cover* fit needs no pan slack): **Meadow** (`meadow`, the
default — `DEFAULT_STATIC_BACKGROUND`), **Sunny Valley** (`sunny-valley`,
the original single image from when this system launched with just one),
**Frozen Volcano** (`frozen-volcano`), and **Pirate Cove** (`pirate-cove`).
`LevelData.background` (typed `StaticBackgroundId` = `BuiltinStaticBackgroundId
| "custom"` — see "Custom uploaded backgrounds" below for that last one —
not the dormant parallax pool's `BackgroundSceneId`; the field was reused,
not re-added) stores the choice, `resolveStaticBackground` falls back to
the default when unset or when it names a built-in id no longer in the
pool, and `EditorUI`'s **"BG: ▶"** button cycles through the built-in pool
exactly like
the dormant parallax version's button did (destroy + recreate the
`StaticBackground` instance, since a different image can be a different
aspect ratio) — count as an edit like any paint stroke, so it marks the
level dirty and autosaves (see "Autosave & save-state tracking" above).
That button used to auto-size to its own label text ("Meadow" vs "Sunny
Valley" aren't the same length), which meant the save-state indicator
sitting after it had to reposition itself every time the label changed —
omitting that was a real bug hit while wiring this back up, and the two
overlapped the first time "Sunny Valley" was selected. The side-panel
layout pass (see "Editor layout: header/footer/dropdown" below) eliminated
that whole bug class rather than patching it further: every panel button,
background picker included, is now a fixed width, so a longer label never
pushes into whatever comes next.

**Custom uploaded backgrounds.** As of 2026-08-14, the built-in pool isn't
the only option — **Upload BG** lets you use your own image, stored
per-level rather than shipped as a build asset. Two pieces make that
work:

- `src/editor/customBackgroundUpload.ts`'s `readAndDownscaleImage` reads
  the picked `File`, downscales it (capped at 1600px on the longer side)
  and re-encodes it as a JPEG (quality 0.85) via an offscreen `<canvas>`,
  then stores the result as a data URL on `LevelData.customBackgroundData`
  — inline in the level's own saved JSON, since localStorage is this
  project's only persistence. Background art doesn't need per-pixel
  fidelity the way tile/entity sprites do, so trading some quality for a
  meaningfully smaller footprint (an unmodified multi-megapixel photo
  would eat a real chunk of the ~5-10MB localStorage quota per level) is
  an easy call.
- `src/gameplay/backgroundLoader.ts`'s `resolveBackgroundTextureKey`
  resolves which texture `StaticBackground` should render — instant for
  every built-in (already preloaded by `BootScene`), or a genuine async
  `scene.textures.addBase64` registration for a `"custom"` one, which
  doesn't exist as a texture until the moment a level that references it
  is actually opened (`EditorScene.create` / `PlayScene.create` both
  await it before constructing their `StaticBackground`). It tracks which
  data URL is currently loaded under the shared `bg-static-custom` key and
  skips re-registering when it's unchanged — necessary, not just an
  optimization: `scene.textures` is the *game's* TextureManager, shared
  across every scene, and Test Play launches PlayScene on top of a merely
  *paused* (not stopped) EditorScene, so both are alive with live
  GameObjects referencing that key at once. Unconditionally
  removing-and-recreating it on every call (PlayScene resolving the exact
  same level, i.e. the exact same image, moments after EditorScene already
  did) destroyed the GPU texture out from under EditorScene's still-alive
  background `Image` — a real crash hit and fixed during this pass
  (`Cannot read properties of null (reading 'glTexture')`), not a
  hypothetical one. `EditorScene.applyBackground` also destroys the old
  background's `Image` *before* resolving a new texture rather than after,
  for the same underlying reason: swapping to a genuinely different custom
  upload while one is already showing still goes through the
  remove-then-recreate path, and that ordering guarantees nothing
  references the old texture by the time it's removed.

Opening the actual file picker turned out to need its own real DOM
element rather than a Phaser button: browsers only open a native
file-dialog from a call that's a direct, synchronous consequence of a
trusted user gesture event, and Phaser's own pointer events are
dispatched from its internal game loop — by the time a Phaser button's
`pointerdown` handler runs, calling `.click()` on a hidden file input from
inside it is no longer a direct descendant of the native click, so
Chromium/Firefox silently no-op the dialog instead of opening it (an
input still gets created and `.click()`-ed with no error — confirmed
empirically while building this, not assumed). `src/editor/FileInputOverlay.ts`
sidesteps the problem instead of working around it: a real, always-present
`<input type="file">`, invisible (`opacity: 0`) but positioned via CSS
exactly on top of the Upload BG button (converting from EditorUI's game
coordinates to real CSS pixels using the canvas's actual
`getBoundingClientRect()`, which already reflects Phaser.Scale.FIT's
scaling and CENTER_BOTH's letterboxing for free), so the browser sees an
ordinary, unmediated click on a file input — Phaser's own rendering of
that button is purely cosmetic, with `FileInputOverlay`'s `mouseenter`/
`mouseleave` listeners mirroring hover state onto it (reused as-is for
Upload Music's own file input — see "Music" under Art — since the same
click-can't-open-from-Phaser problem applies to any file picker, not just
this one). It also hides itself
(`display: none`) while EditorScene is paused for Test Play and un-hides
on resume — without that, an invisible-but-still-clickable input pinned
to that same screen region would sit right on top of PlayScene's own
on-screen touch controls (same canvas, same coordinate space) and
silently swallow taps meant for them.

**Music.** As of 2026-08-14, the home page has background music, and any
level can have its own uploaded soundtrack — both controlled by the same
mute-toggle + draggable-volume-slider widget, `src/audio/VolumeControl.ts`.

- **Home page**: `MenuScene` plays `menu-theme.mp3` (the project owner's
  own supplied track, preloaded by `BootScene` like any other built-in
  asset) on a loop the whole time the home page is up, stopping (not just
  pausing) when you navigate away and starting fresh each time you come
  back — it's the home page's ambiance, not a whole-app soundtrack that
  keeps playing behind the editor or gameplay.
- **Per-level music**: `EditorUI`'s **Music: \<name/None\>** button and
  **Upload Music** button work exactly like their Background counterparts
  (see above) — **Upload Music** is a `FileInputOverlay` (`accept="audio/*"`)
  that stores the picked file inline on the level as
  `LevelData.customMusicData` (a data URL) and `customMusicName` (for
  display); clicking **Music: \<name\>** removes it (a no-op, not even a
  status toast, when there's nothing set — see EditorScene's `clearMusic`
  guard). Unlike a background image, audio can't be meaningfully
  downscaled client-side without a real transcoder, so
  `src/editor/musicUpload.ts` doesn't try — it just refuses anything over
  4MB outright (`MusicTooLargeError`, surfaced as a clear status message)
  rather than accepting a file that's likely doomed to blow the level's
  localStorage budget once base64-encoded anyway. The editor itself never
  plays a level's music while you're painting — only Test Play and actual
  Play do, via `src/gameplay/musicLoader.ts`'s `resolveLevelMusicKey`,
  which mirrors `backgroundLoader.ts`'s pattern (register into the
  shared, game-wide `scene.cache.audio` at runtime, since a level's own
  upload can't be preloaded by `BootScene` the way `menu-theme.mp3` is;
  skip re-registering when the exact same data is already cached). A
  level with no uploaded music just plays silently — there's no built-in
  fallback track the way there is for backgrounds. `PlayScene` stops and
  destroys its `Sound` object on scene shutdown (Esc, win, lose, restart),
  since Sound objects aren't scene-scoped in Phaser any more than textures
  are — without that explicit cleanup, a level's music would keep playing
  after leaving it.
- **Mute/volume**: a single global setting (`src/audio/audioPrefs.ts`,
  persisted to localStorage as `spellbound:audio-prefs`), applied once at
  boot to `scene.sound.volume`/`scene.sound.mute` — the *game's* shared
  SoundManager, not a per-scene one — so it affects whichever sound is
  currently playing (the home theme or a level's music) without any
  scene needing to know or care which one that is. `VolumeControl`
  instances in `MenuScene` and `PlayScene` both read and write those same
  two properties directly, so they always agree with each other and with
  what's persisted, no separate state-syncing needed. The slider is a
  plain Rectangle track + a draggable Arc thumb (pointerdown starts a
  drag, tracked via the scene's own `pointermove`/`pointerup` so a fast
  drag that briefly leaves the track's exact bounds doesn't drop it) —
  dragging it up while muted also un-mutes, matching most OS/app volume
  sliders, so a muted player can't drag to 100% and hear nothing with no
  visual explanation why.

**Level name.** As of 2026-08-14, a level's name can actually be changed —
until this pass, `createEmptyLevel` always named a new level "Untitled
Level" and nothing in the app could ever change it afterward (not the
editor, not My Levels, not World Maker's level picker), so anyone with
more than one blank level, or who used the same template twice, ended up
with visually-identical rows distinguishable only by their "Updated
\<date\>" timestamp. `src/editor/LevelNameInput.ts` fixes that with a
**Name:** field — originally docked in the otherwise-empty strip below the
grid (the editor's canvas used to be taller than the grid to fit the side
panels' content, and that strip, between the two panels, was unused); as
of the 2026-08-16 header/footer layout pass it lives in the header instead
(see "Editor layout: header/footer/dropdown" below), since that empty
strip no longer exists once `GAME_HEIGHT` is computed to fit exactly. It's
a real, always-visible
`<input type="text">` rather than a Phaser Text object, since Phaser has
no native text-entry widget at all; `src/editor/domOverlay.ts`'s
`positionOverlay` (also used by `FileInputOverlay`) places it in real CSS
pixels exactly over that spot in the canvas. Commits on blur or Enter
(reverting to the last committed value on Escape without committing); an
empty/whitespace-only value commits as "Untitled Level" rather than saving
a blank name.

Two non-obvious bugs surfaced and got fixed while building this, both
confirmed empirically rather than assumed:

- **Space/Ctrl+Z/Ctrl+Y while typing a name would fire the editor's own
  shortcuts.** Phaser's keyboard shortcuts (Space for Test Play, Ctrl+Z/Y
  for undo/redo) are bound via `window.addEventListener`, not scoped to
  whether a DOM input currently has focus — typing a level name containing
  a space would otherwise launch Test Play mid-keystroke. Fixed with
  `stopPropagation()` on every keydown/keyup the input receives.
- **Clicking Save (or any other button) right after typing a new name,
  without pressing Enter first, silently saved the *previous* name.**
  Phaser's MouseManager listens for clicks on the *canvas* itself
  (bubble phase); every other button in this UI lives on that canvas, a
  separate DOM element from the name input entirely, so clicking one
  never bubbles through the input and never fires its `blur` handler on
  its own — there's no native "click elsewhere to commit" the way an
  ordinary web form gets for free. Fixed with a capture-phase
  `pointerdown` listener on `document`: capture-phase listeners on an
  ancestor always run before a target's own bubble-phase listener, so it
  reliably blurs (and thus commits) the name input *before* Phaser's
  canvas handler — and therefore before whatever button was clicked —
  gets a chance to run.

**Multiple instances & the universal Eraser.** As of 2026-08-15, Enemies/Items/
Decor are no longer capped at one placed instance per type — until this
pass, `EntityPlacer` stored `Map<EntityType, Image>`, literally one marker
per *type* for the whole level, so placing a second Ghost just moved the
existing one instead of adding another (the same MVP shortcut spawn/goal
had always used, but never lifted for the categories that didn't need it).
There was also no way to delete a single placed entity at all — the only
options were undo immediately after placing, or Clear, which wipes the
entire level.

`EntityPlacer` now enforces a different, stricter invariant instead: **at
most one entity total per tile**, regardless of type, keyed by position
(`Map<"x,y", Image>`) rather than by type. That's what makes "click a tile
to erase" unambiguous — there's always exactly zero or one thing there to
remove. Markers (Spawn/Goal/Chest) are kept singleton *per type* on top of
that, in `EditorScene` rather than `EntityPlacer` itself: `PlayScene`'s
spawn/win/chest-open logic is built around exactly one of each, Spawn
especially (the player can only start in one place), so placing a second
Spawn still moves it rather than adding another. Enemies/Items/Decor have
no such limit — placing one only ever clears whatever (if anything)
already occupies that exact tile, not other instances elsewhere.

Every entity category tab (Markers/Enemies/Items/Decor) originally ended
its palette grid with its own **✕ Erase** brush, mirroring the Blocks
category's tile eraser, scoped to that brush's own category so the
Enemies eraser could never accidentally delete a nearby Spawn marker. As
of 2026-08-16 those 5 per-category brushes were removed in favor of one
**header-level Eraser toggle** (`EditorScene.eraserActive`, wired through
`EditorUI.setEraserActive`) — turning it on and clicking/dragging over the
grid erases whatever occupies a tile (an entity of *any* category first
via `EntityPlacer.entityAt`, the ground tile itself if none is there) no
matter which Palette category tab happens to be open, rather than only
whichever one the eraser brush used to live under. `EditorScene.applyEraseAt`
mirrors `applyTileBrushAt`'s drag-debounce (`dragLastX`/`dragLastY`) and
`applyEntityBrushAt`'s immediate-execute command pattern, so an entity
erase and a tile erase can share one `dragCommands` array across a single
drag — `HistoryStack.push` never re-calls `.execute()`, so recording an
already-applied command works the same way drag-painting already did.
Moving a Marker to a tile that's already occupied by something else (say, an enemy)
displaces that occupant too, keeping the one-entity-per-tile invariant;
both the displaced occupant and (for Markers) the marker's own previous
position are erased via their own `EraseEntityCommand`s, composed with the
new placement's `AddEntityCommand` into one `CompositeCommand` — so a
single Ctrl+Z undoes the whole move/replace as one step, restoring each
displaced entity to exactly where it was. `PlayScene` spawns every matching
Enemy/Item/Decor entity now (a `.filter()` loop per type instead of the old
first-match-only `.find()`), while Markers keep their `.find()`-based
singleton lookup, unchanged. All 6 templates predate this pass and already
had unique `(x, y)` per entity, so the new stricter invariant doesn't
affect them.

**Editor layout: header/footer/dropdown (2026-08-14 side panels, revised
2026-08-16).** As of 2026-08-14 the editor's menus moved off one crowded
toolbar row into two opaque, docked vertical panels flanking the grid — a
left "Tools" panel (5 stacked category tabs + a 2-column palette grid) and
a right "Actions" panel (every button, stacked). As of 2026-08-16 that was
revised again: a header now sits above the grid and a stats footer below
it, both spanning the full canvas width, with the two side panels
narrowed to flank only the grid's own height in between — not the header/
footer bands. `HEADER_HEIGHT`/`FOOTER_HEIGHT`/`GRID_ORIGIN_Y` (new) join
`LEFT_PANEL_WIDTH`/`RIGHT_PANEL_WIDTH`/`GRID_ORIGIN_X` (from the 2026-08-14
pass) in `config/gameConfig.ts`; `GAME_HEIGHT` is now *computed*
(`HEADER_HEIGHT + GRID_ROWS * TILE_SIZE + FOOTER_HEIGHT` = 468) rather than
a hand-tuned constant (560), since removing the 5 per-category Erase
brushes (see "Multiple instances & the universal Eraser" above) freed up
enough vertical room in the side panels that the canvas no longer needs to
be taller than header+grid+footer to fit their content — unlike the
2026-08-14 pass, there's no leftover dead space below the grid at all now.

The **header** holds Level Name (moved here from its own row below the
grid), Undo/Redo, the Eraser toggle, and — anchored to the right edge
instead, so neither the variable-length save-state text nor the level
name ever shifts them — the save-state indicator, Save, an accent-colored
Test Play, and Menu. The left **Palette** panel replaced the 5 stacked
category tabs with a single **chip** (`EditorUI.chipButton`, e.g. "Blocks
▾") that expands into all 5 categories on tap (a small `Phaser.GameObjects.
Container` toggled visible/hidden, not a native `<select>` — chosen so the
whole UI stays one visual language, canvas-rendered start to finish, no
DOM popover to keep in sync); picking one collapses it back and swaps the
icon grid below, same `EditorUI.iconPositions` 2-column layout as the
2026-08-14 pass. The Skin/Upload Skin buttons live in this same left panel
now too, pinned to a fixed row (`SKIN_SECTION_Y`) below the grid regardless
of the active category's row count, so they never jump up and down when
you switch categories — unlike the icon grid above them, whose height does
vary category to category. The right panel, retitled **Level Settings**,
keeps Background/Upload BG/Music/Upload Music, plus Clear (now a two-tap
arm/confirm — see the Controls section above — instead of firing
immediately); Test Play/Save/Menu/Undo/Redo moved out of it into the
header. The **footer** is
new: read-only level size (`W×H`), the live cursor tile (`EditorScene`
calls `EditorUI.setCursorTile` from the same `onPointerMove` that already
drives the hover highlight), and entity count (`EditorUI.setEntityCount`,
called from `markDirty` since almost every edit could have changed it —
cheaper than threading a "did the count actually change" check through
every call site). The save-state indicator joined it as of 2026-08-17 —
see "Hand tool" below.

Shifting the grid down (not just right, as the 2026-08-14 pass already
did) needed the same treatment `GRID_ORIGIN_X` got: a new `GRID_ORIGIN_Y`
(= `HEADER_HEIGHT`) threaded through every tile↔pixel conversion again —
the ground tilemap layer's origin, entity marker/enemy sprite placement
(`EntityPlacer.ts`, `EnemyBehaviors.ts`), the hover highlight, pointer-
click→tile math in both directions, and `StaticBackground`'s mask/image
position — in both `EditorScene.ts` and `PlayScene.ts`, plus
`TouchControls.ts`'s on-screen button Y. `PlayScene` — which renders no
header/footer bands of its own — deliberately shares the same
`GRID_ORIGIN_Y` as `EditorScene`, exactly like it already shared
`GRID_ORIGIN_X`, purely so Test Play doesn't visually shift the level up
or down when transitioning from Edit to Play and back; its existing HUD/
back-button/volume-control overlay (already independent of the grid) just
settles into the new top margin instead of floating over row 0 of the
grid the way it used to. One real miss surfaced by this pass's own
regression testing: `EnemyBehaviors.ts`'s `createPatrolEnemy` computed its
spawn `worldY` from `tileY * TILE_SIZE` with no `GRID_ORIGIN_Y` at all —
inherited from before the header existed and never touched by the
2026-08-14 `GRID_ORIGIN_X` pass (enemies only need vertical placement) —
which would have spawned every enemy `HEADER_HEIGHT` px too high in Test
Play relative to where it was painted in the editor.

The through-line with every other UI pass in this project holds here too:
`LEFT_PANEL_WIDTH`/`RIGHT_PANEL_WIDTH`/`HEADER_HEIGHT`/`FOOTER_HEIGHT`'s
exact values were tuned empirically against real rendered screenshots
(Playwright, calibrated via the canvas's `boundingBox()` scale) rather
than derived from a formula — comfortable for the default 20x12 grid and
every category's icon count, not the extreme case.

**Cross-device layout: the double-centering bug (2026-08-16).** A real,
shipped bug, reported as "sometimes I see a huge gap at the top" and
"things aren't clickable down below" — reproduced and root-caused with a
Playwright sweep across ~10 viewport sizes (phones portrait/landscape,
tablets, short/wide desktop windows, narrow windows) that measured the
game canvas's `getBoundingClientRect()` against its actual container.
Every one of them showed the canvas pushed far toward one edge instead of
centered — up to a **370px top-vs-bottom mismatch** on a tall phone
viewport (430×932), squeezing the whole game into a thin, off-center
sliver. Root cause: two things were centering the canvas at once.
`main.ts`'s Phaser config already centers it (`scale.mode: FIT`,
`autoCenter: Phaser.Scale.CENTER_BOTH`) by computing its own `margin-top`/
`margin-left` inline styles against its parent (`#app`) — but `index.html`
*also* centered `#app`'s content via CSS flexbox
(`display:flex; align-items:center; justify-content:center`), a leftover
from before Phaser's own centering was wired up. Flexbox centers an
element's full *margin box*, so it took the canvas — already offset by
Phaser's `margin-top`/`margin-left` — and centered *that whole offset
shape* again, adding a second, symmetric gap on top of the first,
already-asymmetric one (a top/left-only margin with nothing matching on
the bottom/right). The two passes compounded into one large gap on
whichever side already had Phaser's margin, and a small one on the
opposite side. Fixed by deleting the flex properties from `#app` entirely
— a plain `100vw`/`100dvh` block container — so Phaser's own centering is
the only one that runs. Re-verified with the same viewport sweep
afterward: every size now centers within **2px** (float rounding) on both
axes, confirmed against both the dev server and the actual production
build (`vite preview`).

Two related fixes landed alongside it, from the same "review across
screen sizes" pass:
- **`100vh` → `100dvh`** for `#app`'s height (with a `100vh` fallback for
  browsers that don't support the dynamic-viewport-height unit). Plain
  `100vh` is fixed to the *largest possible* viewport and doesn't shrink
  when a mobile browser's own address bar/toolbar is currently showing,
  so the bottom of the canvas can end up sitting underneath that browser
  chrome — visually present on screen but not actually tappable, since
  the browser (not the page) owns input there. This is the likely
  explanation for the "not clickable down below" report being
  intermittent rather than constant — it would only bite when the toolbar
  happened to be showing. `100dvh` tracks whatever's actually visible
  right now instead.
- **Pinch-zoom re-enabled.** `index.html`'s viewport meta previously set
  `maximum-scale=1.0, user-scalable=no`, and every relevant element
  (`html`, `body`, `#app`, `canvas`) set `touch-action: none` — both
  layers blocking zoom outright, originally to stop a tap on an on-screen
  game button from also triggering a scroll/pinch/double-tap-zoom
  gesture. That trade-off stopped being worth it once the centering fix
  above made it obvious how *short* the letterboxed game can get on a
  tall, narrow phone (down to ~167px tall on a 375×667 screen, in the
  sweep above) — every button/label shrinks along with it, with no way
  for the user to compensate. Fixed by raising `maximum-scale` to `5.0`
  and removing `user-scalable=no` from the viewport meta, and changing
  every `touch-action: none` to `touch-action: pinch-zoom` — a value that
  still blocks single-finger panning and double-tap-zoom (so on-screen
  buttons behave exactly as before) while explicitly allowing a two-finger
  pinch through to the browser's own zoom. `touch-action` only governs
  the *browser's own default* gesture handling on top of a touch; Phaser
  still receives every pointer event underneath it either way, so this
  doesn't change how taps/drags reach the game itself.

**Cross-device layout, part 2: the stale-canvas-size bug (2026-08-16).** A
second, distinct report on the same general area — "sometimes too big,
sometimes too small," this time with two screenshots of the same phone
a minute apart, one showing the game badly oversized (cropped off the left
edge, forcing a horizontal scroll) and the other correctly fit. Not the
double-centering bug above (that produced a consistent, symmetric
offset, not an oversized/cropped canvas), and not something a Playwright
viewport sweep on desktop Chromium can reproduce directly, since it's
specific to how a *real* mobile browser's own UI chrome behaves — so this
one was root-caused by reading Phaser's own source rather than by
reproducing it pixel-for-pixel. `node_modules/phaser/src/scale/
ScaleManager.js` only ever listens for `window`'s `resize` and
`orientationchange` events — it has no `ResizeObserver` or
`visualViewport` listener of its own, despite this project's `#app`
already tracking the *dynamic* viewport via `100dvh` (see above). Android
Chrome's address/tab bar showing or hiding (typically on scroll) changes
that dynamic viewport — the same thing `100dvh` is *for* — via a
`visualViewport` resize, which doesn't reliably also fire a `window`
resize. Phaser's canvas can end up sized for whatever the toolbar state
was at the last event it actually saw, drifting out of sync with the
CSS-driven `#app` size independently of anything the page itself did —
alternately spilling past the now-shorter visible viewport (cropped,
needing a scroll) or sitting smaller than it needs to, matching both
screenshots and the "sometimes too big, sometimes too small" description
exactly. Fixed in `main.ts` with one additional listener alongside
Phaser's own: `window.visualViewport?.addEventListener("resize", () =>
game.scale.refresh())` — `refresh()` is Phaser's own public API for
forcing a fresh measurement of its parent and re-fitting the canvas,
`visualViewport` is guarded since it's undefined in a handful of older
browsers (which keep relying on Phaser's own window-resize listening,
same as before). Verified in a Playwright session by capturing the actual
handler function `main.ts` registers (intercepting
`visualViewport.addEventListener` before the module loads, since the
`Phaser.Game` instance itself isn't exposed globally) and invoking it
directly — confirming it runs without error and leaves the canvas
correctly fitted, the same call path a real toolbar-triggered
`visualViewport` resize would take.

The multi-scene parallax system below is still **dormant, not deleted**
— every asset and every file it depends on (`ParallaxBackground.ts`,
the original `backgrounds.ts` and its `BACKGROUND_SCENES` pool, all 5
scenes' PNGs) stays exactly as it was, untouched and unused.

**Parallax background & background scenes (dormant — see above).** Every level renders two
background layers behind it — a slow far layer and a faster near layer —
for a sense of depth as the player moves. This project's levels are still
single-screen (no camera panning/scrolling — that's deferred to plan doc
milestone M3), so there's no camera to actually pan;
`src/gameplay/ParallaxBackground.ts` fakes the effect with a "zoom and
clamped pan" trick instead: each layer is one large `Image`, scaled up to
`1.2x` the viewport height (so it's also well wider than the viewport,
since every source is a wide landscape image — see below), then panned
horizontally by a fraction of the player's X position, clamped so the
offset can never exceed the image's own excess width. Because the clamp is
derived from the image's actual size rather than assumed to be "big
enough," an edge is *structurally* impossible to reveal — not just
unlikely at today's level-size caps, which is what the original version
of this (a live-tiling `TileSprite`, `tilePositionX` offset by player X
each frame) actually was. A `GeometryMask` clips each layer to exactly the
level's placeable pixel width (`level.width * TILE_SIZE`), called from
`PlayScene.update`; `EditorScene` gets the same layers too, but static (no
player position to drive an offset while editing) — just a backdrop at
rest, still clipped to the level's real width.

That clip matters beyond looks: the canvas is often wider than a level's
placeable grid (`GAME_WIDTH` is padded out to fit the editor's toolbar —
see `gameConfig.ts`), and earlier the background rendered across that
*entire* canvas, painting scenery into the unplaceable margin past the
grid's right edge. That made the margin look like part of the level even
though clicks there were always silently rejected (`applyTileBrushAt`
always bounds-checks against `level.width`) — the bug behind "can't place
anything on the right half of the screen." Bounding the background to the
real grid width fixes it structurally: that margin now reads as what it
is, flat background color, not misleading scenery.

*Which* scene renders is a level-level choice, entirely unrelated to
which ground-block skins (grass/desert/castle/snow) are painted into that
level — a level built entirely from Snow Ground blocks can show the
pirate cove, a level full of Castle blocks can show the sunny valley,
etc. `src/level/backgrounds.ts` is the pool (`BACKGROUND_SCENES`)
and `LevelData.background` is the optional field a level stores its
choice in (falling back to `DEFAULT_BACKGROUND` via `resolveBackground`
when unset or when it names a scene no longer in the pool — see below —
so levels saved before this feature existed, or before the pool shrank,
still render something sensible). While active, the editor's toolbar had
a **"Background: ▶"** button (far right of the action-buttons row) that
cycled through the pool, live-updating the preview (destroying and
recreating the `ParallaxBackground` instance, since different scenes have
different layer textures) and persisting the choice to the level on
Save — that button itself is one of the pieces actually deleted rather
than left dormant (see above).

The pool has five scenes, and every one of them is a large, fixed
2048x476 image pair (matching `GAME_HEIGHT` exactly). Three are original
painted scenes from `scripts/generate-painted-backgrounds.py`
(`<scene>-far.png` opaque sky + sun/moon/stars/clouds, `<scene>-near.png`
transparent above a painted foreground), commissioned to match specific
reference images the project owner provided — recreated as original art
rather than reproduced pixel-for-pixel, since the script has no access to
the reference files themselves. `green-valley` is the exception: the
project owner later supplied that reference image directly (a chat
upload, not a fetchable URL), so it's a real crop of the actual
reference — resized/cropped to the shared 2048x476 canvas and split by
hand into a `-far`/`-near` pair (a flat horizon cut with a soft feather,
not the script's painted-in-two-passes approach) rather than a
script-generated recreation of it. In pool order (see below for why this
order): `green-valley` (sunny hills, sun, drifting clouds, mountain
slopes over a valley — the pool's default), `pirate-cove`
(a wrecked galleon under a crescent moon, tattered sails, a skull flag,
flanking palm trees), `overgrown-ruins` (moss-swallowed towers with
window grids and hanging vines, a stalled elevated train, a "?" block
easter egg), and `snowy-peaks` (a jagged snow-capped range, a
lava-glowing volcano with rising smoke, drifting clouds, foreground
pines). The fifth, `starfield` (the procedural castle night sky,
generated directly at 2048x476 by `drawStarfield` in
`src/assets/generateTextures.ts`), is the only one not painted — Pillow
was used for the four painted scenes the same way it was for the
ghost-pillow and the original hand-drawn goal art (vector shapes:
gradients, circles, seeded random placement), just applied to landscape
scenes instead of a character sprite.

The four painted scenes lead the pool (in front of `starfield`, which
used to be first) and `green-valley` is the overall default —
`DEFAULT_BACKGROUND` in backgrounds.ts points to it, so it's what a
brand-new level shows before anyone touches the background picker.

The pool used to also have `grass-sky`/`desert-sky`/`icy-sky`/
`jungle-sky` — small (24x24) Kenney sky tiles, first shown via the old
live-tiling technique, then (briefly) baked up to the same 2048x476
format as everything else so the new zoom-and-pan renderer could handle
them without stretching a small source into blurriness. Baking fixed the
*edge/seam* problem, but not the actual complaint: a small tile repeated
across a large canvas still reads as an obvious grid of identical tiny
icons up close — a "wallpaper" look, not real scenery — so all four were
dropped from the pool entirely rather than patched further. `starfield`
didn't have this problem (its star scatter is randomized across the
whole canvas, not one small tile repeated) and neither do the four
painted scenes (authored at full size from the start, no tiling
involved), which is why those five are what remain.

**Second content pass.** A deliberate push to use a meaningfully larger
share of the Kenney pack (it has 231 tiles across its three sheets; the
first few passes above used 15 of them, ~6.5%) with a curated, coherent
set rather than padding for its own sake — every pick below earns its
place with a real mechanic, enemy, ground skin, or decoration, landing at
35 assets (~15.2%):
- **Snow ground skin** (`GROUND_SNOW_TILE`) — a real Kenney snow-cap
  ground tile, paired with `snowy-peaks` (see above) as the Frozen
  Cavern template's chosen background (though, like every skin, its
  background choice is independent — see above). Originally reachable
  only via the **Frozen Cavern** template; now, like every ground skin,
  it's just an icon in the Blocks palette, selectable on any level (see
  "Blocks palette" under Controls).
- **Water** (`WATER_TILE`) — not solid ground, and (as of 2026-08-16,
  see "Water is swimmable, not a hazard" under Art) not a hazard either:
  it's swimmable, never costs a hit. Real Kenney water art for grass/
  desert/snow; Castle's blocks instead paint a procedural **lava**
  frame (`LAVA_TILE`, drawn by `drawLava` in `generateTextures.ts`) for
  the same never-mix-real-and-procedural-within-one-skin reason Castle's
  Brick/Bounce blocks already follow — Lava kept its original
  hazard-on-touch behavior unchanged; only Water's changed.
- **Golem** (`enemy-golem`) — a 4th enemy `EntityType`, added to
  `ENEMY_DEFS` exactly like Bat/Spike Crawler were (100% shared patrol/
  stomp code, just a texture and a `stompable` flag) — stompable, like
  the ghost and bat.
- **Key → Chest.** `item-key` is an ordinary Items-tab collectible
  (`PlayerStats.collectKey`, a plain `hasKey` boolean — only one Key can
  ever be *held* at a time; a level can still place more than one Key
  entity, see "Entity eraser & multiple instances" under Art, collecting
  a second one while already holding one is just a no-op). **Chest** is
  its own Markers-tab entity, kept singleton per level: touching it
  while `hasKey` is true opens it (`PlayerStats.openChest` — spends the
  key, awards a +5 score bonus, the sprite destroys itself), touching it
  without a key does nothing and leaves it there to come back to. Unlike
  a solid gate blocking a path, a Chest was chosen specifically so this
  needed no new *physics* concept — it's a plain overlap zone like every
  other collectible, not a collider with a conditional pass-through.
- **Decor** — a new palette category, 10 entity types
  (`decor-bush`/`tree`/`cactus`/`lamp`/`cloud`/`snowman`/`sprout`/
  `mushroom`/`rocks`/`bat`) that are purely cosmetic: `PlayScene` spawns
  them as plain static images with no physics body and no overlap check
  at all (see the `DECOR_TYPES` loop, the simplest of the entity-spawn
  loops in the file) — a level looks identical in Play to how it looked
  while editing, with zero gameplay effect. `decor-bat` reuses the Bat
  enemy's perched-pose art as a "Sleeping Bat" decoration rather than as
  a second animation frame for the live enemy — animating a patrol
  enemy's sprite over time isn't something `EnemyBehaviors.ts` does yet,
  and wasn't worth adding just for this.
- **Trophy** — purely decorative, shown next to the banner text on
  `PlayScene`'s win screen (any win — level, world, or standalone) via a
  single `Image` created hidden in `create()` and shown in `onWin()`; no
  new state, no new rule.

**Frozen Cavern** (snow ground skin, `template-frozen-cavern`) is the template
that showcases this pass: a Bush/Golem/Snowman/Key/Rocks run leading into
a 3-tile Water gap (comfortably jumpable at this game's normal ~6-tile
reach; walking through it instead means a shallow swim now — see "Water is
swimmable, not a hazard" under Art — not a lost hit) with a
Cloud floating above it, then a Chest, a Lamp, and the goal — with a
Sleeping Bat perched up near the end for flavor. Not every one of the 10
Decor types appears in it (Tree, Cactus, Sprout, Mushroom don't fit this
particular level's cave/snow framing) — they're still fully usable from
the palette in any level regardless of what any one template shows.

**Real art: Kenney's "Pixel Platformer" (CC0).** The plan doc always
recommended Kenney's CC0 packs for this, but the build sandbox's network
proxy can't *fetch* them (only npm/github.com are reachable) — so
everything above shipped as procedural placeholder art instead, generated
at runtime with Phaser's Graphics API. That changed once the user
supplied the actual pack as a direct upload, sidestepping the network
restriction entirely. It now provides:
- **Grass, desert, and snow ground tiles** — real grass-cap, sand-cap, and
  snow-cap dirt, replacing (or, for snow, never having had) a procedural
  equivalent. **Castle keeps its original procedural grey stone** — the
  pack is a nature/outdoor set with no stone/castle-style tile, so there's
  nothing to swap it for; this is a deliberate, permanent split, not a
  TODO. *Ground tiles merge with no outline, by design* — see "Ground
  tiles merge with their neighbors" above for the autotile logic, and note
  below for why the raw source art needed one extra processing step to
  actually achieve that.
- **Brick, Bounce, and Water** — a real wooden crate, a real compressed
  spring pad, and a real water-surface tile, used by every skin *except*
  Castle's own Brick/Bounce/Lava blocks (`BRICK_CASTLE_TILE`/
  `BOUNCE_CASTLE_TILE`/`LAVA_TILE`), which keep procedural versions of all
  three — Water's is lava, see "Second content pass" above — so a Castle
  block never mixes real and procedural art within itself, even though a
  single level can now freely place Castle blocks right next to real-art
  Grass/Desert/Snow blocks.
- **Bat, Spike Crawler, and Golem** — real character art from the pack (a
  winged creature, a red pointy-topped ground crawler, and a grey
  rock-monster face) in place of the Graphics-drawn placeholders an
  earlier pass used for the first two. The Bat's perched pose is also
  reused as the purely cosmetic "Sleeping Bat" Decor entity.
- **Coin, Heart, Speed Potion, Shield, and Key** — real item-tile art from
  the pack. **Chicken Slipper** (internal id `item-feather`) and **PJ
  Thunder Hat** have no matching tile in the pack, so both are drawn
  procedurally (badge icons — see "Power-ups" below) alongside the rest of
  `generateTextures.ts`'s procedural art — the same "real art where it
  fits, procedural where it doesn't" split already established for
  Castle's blocks.
- **Chest and Trophy** — a real locked-chest tile (the Chest entity — see
  "Second content pass" above) and a real trophy character-sheet icon
  (shown on the win screen).
- **10 Decor entities** — Bush, Tree, Cactus, Lamp, Cloud, Snowman,
  Sprout, Mushroom, Rocks, and the Sleeping Bat above — all real Kenney
  tiles, purely cosmetic (see "Second content pass").
- **The background-scene pool is no longer Kenney-derived at all.** Real
  sky-tile art from the pack's background sheet (`grass-sky`/`desert-sky`/
  `icy-sky`/`jungle-sky`) was tried, but even baked up to a large canvas a
  small tile repeated across it still reads as an obvious grid of tiny
  icons, not real scenery — so all four were dropped. The pool is now four
  original painted scenes (`green-valley`/`pirate-cove`/`overgrown-ruins`/
  `snowy-peaks`) plus `starfield` (procedural, for the same
  no-matching-art reason as the castle ground tileset) — see "Parallax
  background & background scenes" above.
- The **wizard and ghost-pillow stay hand-drawn** — they're deliberate,
  already-validated custom art in a specific shared style (see below),
  not placeholders, so swapping the asset pack doesn't touch them. The
  goal marker used to be part of that same hand-drawn family too (a
  "dream-cloud portal") but is now a separately-sourced image — see
  "Goal art" above — so it's independent of both the Kenney pack and the
  wizard-style hand-drawn set.

The pack's tiles are natively 18px (24px for characters), not this
project's 32px (40px for entities), so `scripts/prepare-kenney-assets.py`
(run once, offline — not part of the build) nearest-neighbor-upscales and
composites exactly the pieces used above into the small PNGs actually
committed under `public/assets/tiles/`, `public/assets/entities/`,
`public/assets/items/`, and `public/assets/decor/` (loaded in
`BootScene.preload`) — the full third-party pack itself isn't committed
to the repo, only these derived outputs. It no longer touches
`public/assets/backgrounds/` — the pack's small sky tiles were tried
there and dropped (see "Parallax background & background scenes" above),
so every remaining background scene is either procedural or original
painted art from `scripts/generate-painted-backgrounds.py`, not derived
from this pack. See prepare-kenney-assets.py's docstring for the exact
source tile indices and how to regenerate with different ones.

**Tiles/markers/UI still procedural:** Castle's ground/brick/bounce/lava
(see above) and pure UI chrome with no asset-pack equivalent — the eraser
icon, the spawn marker, the hover highlight, and the palette selection
outline — are still generated at runtime in
`src/assets/generateTextures.ts`, same technique as before. Castle's own
procedural Brick/Bounce/Lava also get dedicated single-frame Palette icons
(`blockIconKey("castle", block)` in `groundSkins.ts`) generated right
alongside its 6-frame tileset strip (as of 2026-08-16 — see "Water is
swimmable, not a hazard" under Art for why it grew from 5), distinct from the shared real-art
Brick/Bounce/Water icons the other three skins' Brick/Bounce/Water
brushes use — necessary because, since every skin's blocks are always
in the palette together (see "Blocks palette" under Controls), Castle
Brick/Bounce/**Lava** need their own icons and labels sitting right next
to the shared ones at all times, not a shared icon that relabels itself.
Each skin/block combination is simply its own static `Brush` entry in
`Palette.ts` with its own `textureKey` and `label` — no runtime "current
skin" indirection.

*Palette/marker scaling:* entity art varies in native resolution (32px
icons vs. the larger ghost/portal illustrations), so both the editor
palette and the in-grid placement markers scale any texture down to fit
one tile via `src/editor/spriteFit.ts`, preserving aspect ratio. Gameplay
objects in `PlayScene` are unaffected and render at full native size.

**Rebrand: "Spellbound Level Editor" → Rhopers Game Maker (2026-08-16).**
Prompted by a user report that old references to the previous name (and,
in the git branch name, an even earlier "Mario Maker"-flavored working
title) were still showing up. Every user-facing string was updated — the
browser tab title (`index.html`), the home-page heading (`MenuScene.ts`),
this README's own title, and `package.json`'s package name (with
`package-lock.json` regenerated to match via `npm install
--package-lock-only`, not hand-edited).

The one part of this that needed real care rather than a find-and-replace:
`APP_FOLDER_NAME` in `googleDrive.ts` isn't just a label, it's the literal
Google Drive folder name `driveClient.ts`'s `ensureAppFolder` searches for
on every single save/load/list — the name every profile's actual level
and world files already live inside of. Renaming the constant outright
would have made the app search for a folder that doesn't exist under the
new name, silently create a fresh *empty* one, and make every
already-saved level/world look like it had vanished — not actually lost
(the old folder and its contents would still sit there untouched), just
invisible to the app from that point on. Fixed with a one-time, in-place
migration instead of a plain rename: a new `LEGACY_APP_FOLDER_NAMES`
array (currently just `["Spellbound Level Editor"]`, never meant to
shrink — a build old enough to have only ever created that very first
name still needs it found) is checked by `resolveAppFolder` if a folder
named `APP_FOLDER_NAME` isn't found; a match gets *renamed* via a Drive
`PATCH` to the new name — same folder id, so every file already inside it
stays exactly where it is — rather than a second folder being created
next to it. A brand new connect (no folder under either name yet) still
just creates one under the new name directly, same as before.
`src/profile/Profile.ts`'s `localStorage` key (which profile — Mike/
Gabriel/Andressa — is remembered on a given device; unrelated to Drive,
much lower stakes since it's just a UI convenience, not saved content)
got the same treatment in miniature: renamed to `rhopers:profile`, with
`loadActiveProfile` falling back to the old `spellbound:profile` key (and
migrating it forward) so an existing device doesn't get sent back through
the profile picker just because the key changed underneath it.
`audioPrefs.ts`'s volume/mute key and the unused (Drive-migration-era
dead code) `LocalStorageAdapter`/`LocalWorldStorageAdapter` classes' key
prefixes were renamed too, without a migration — genuinely low enough
stakes (a reset-to-default volume; classes nothing currently imports) that
matching the extra migration machinery above would have been overkill.
The multipart upload boundary string `driveClient.ts` uses when talking to
Drive (`BOUNDARY`) was renamed as well; it's an arbitrary delimiter token
Google's API never inspects for meaning, so this was pure cosmetic
consistency, not a compatibility concern. The git branch name
(`claude/mario-maker-editor-plan-cgyxrl`) and
`docs/spellbound-editor-implementation-plan.md`'s *filename* were
deliberately left alone — the former is pinned by this project's own
development instructions, the latter would break any existing link to it
for no user-facing benefit; the document's own title/prose inside it were
still updated.

**Skin/background/music libraries (2026-08-16).** Prompted by a user
request to make custom skins "properly work across all users" with "a
sub menu with a little image of each [one] saved for selection," and to
give backgrounds and music uploads that exact same workflow. Custom
skins were already shared across all 3 profiles (see `skins.json` above),
but only ever held one active skin per brush — no way to keep more than
one upload around or switch back to an earlier one. Backgrounds and music
were the opposite problem: each upload was a one-off copy embedded
straight into the single level it was uploaded into
(`LevelData.customBackgroundData`/`customMusicData`), invisible to every
other level and profile and gone for good if that level's upload was ever
overwritten.

Both problems got the same fix: a shared, flat library per asset type —
`skins.json` (existing, upgraded in place), plus two new files,
`backgrounds.json` and `music.json`, all living in the same app folder
alongside every level/world file. A level now stores which library entry
it's using as a small id reference (`customBackgroundId`/`customMusicId`)
rather than the asset data itself; `src/backgrounds/` and `src/music/`
mirror `src/skins/`'s existing `*Storage.ts` (Drive read-modify-write) /
`*Loader.ts` (registers a data URL as a Phaser texture/audio-cache entry)
split. `skins.json`'s own shape changed from one `{imageData, uploadedBy,
updatedAt}` record per brush to `{activeId, items: SkinAsset[]}` — a real
library, not just a single slot — with `skinStorage.ts`'s
`normalizeSkinsFile` upgrading an old-shape file to the new one in memory
on every read (never written back just for having been read; the next
real upload/select/remove persists it), so an existing upload keeps
showing up as that brush's active skin with zero action needed. A level
saved before any of this — with only the legacy embedded
`customBackgroundData`/`customMusicData` fields and no id — still renders/
plays its own asset unchanged: `backgroundLoader.ts`/`musicLoader.ts`
check the new id-based field first and fall back to the legacy embedded
one if it's absent (or the id it names has since been removed from the
library), same "old saves keep working, nothing forces a re-upload"
guarantee the rebrand's own folder migration above made a point of.

The picker itself — a trigger button ("Skin: Custom ▾", "BG: Meadow ▾",
"Music: menu-theme.mp3 ▾") that expands into a small thumbnail grid below
it, with a "+ Upload" tile and a delete "×" badge on every uploaded item —
is one reusable component, `src/editor/AssetPickerMenu.ts`, instantiated
three times in `EditorUI.ts` rather than three separately-built widgets.
It replaced what used to be Skin/Upload Skin (click-to-clear), a
Background cycle-button + Upload BG, and a click-to-clear Music label +
Upload Music — six differently-behaved controls collapsed into one shape
everyone already had to learn from the category chip dropdown. Opening a
picker is what triggers its Drive read (`EditorUI`'s `on*PickerOpen`
callbacks → `EditorScene`'s `resolveSkinThumbnails`/
`resolveBackgroundThumbnails`/`loadMusicLibrary`), not level load or brush
switch, so browsing the palette doesn't pay for a library fetch nobody's
about to look at. The skin picker is scoped to whichever brush is
currently selected (its "Default" entry, `EditorUI.DEFAULT_SKIN_ID`,
means "use the brush's own built-in art"); the music picker's "None"
entry (`NO_MUSIC_ID`) is a first-class choice rather than a separate
clear button, since there's no built-in fallback track the way there is
for backgrounds. Music tracks have no visual thumbnail the way images do,
so every row in that picker reuses one of two small procedurally-drawn
icons (`generateTextures.ts`'s `drawMusicNoteIcon`, muted variant for
"None") and tells tracks apart by filename label alone.

Reused, not reinvented: `AssetPickerMenu`'s "+ Upload" tile is the same
real, invisible `FileInputOverlay` `<input type="file">`-over-the-canvas
trick the old Upload BG/Upload Music buttons already used (see "The DOM
overlay trick" below) — including, since a picker's dropdown can close
and reopen (or re-render mid-upload once a library refresh lands) far
more often than the old single-shot buttons ever did, explicitly
destroying and recreating that overlay on every open/close/re-render so
its real DOM element never lingers, invisible but still the actual click
target, over whatever the editor shows once the picker's gone.

One real bug this surfaced (and fixed) rather than just a design
decision: switching a brush's *active* skin used to reuse one Phaser
texture key (`skin-<brushId>`) across every skin ever uploaded for that
brush, `remove()`-ing the old image's texture before the new one finished
decoding — a still-visible palette icon or placed entity pointing at that
just-freed GPU texture on the very next rendered frame crashed the whole
WebGL render loop (`Cannot read properties of null (reading
'glTexture')`), not just that one icon, confirmed while browser-testing
this feature. Fixed the same way `resolveSkinThumbnails`'s own thumbnail
keys already avoided the problem: give every (brush, skin) pair its own
permanent texture key (`skin-active-<brushId>-<skinId>`, see
`skinLoader.ts`) instead of fighting over one shared slot, since a skin's
uploaded image never changes once it exists. `backgroundLoader.ts`'s
single reused custom-background key didn't need the same fix — it was
already safe, since `EditorScene.applyBackground` destroys the old
preview `Image` *before* resolving a new texture, so nothing is ever left
rendering with a freed one.

Known, accepted limitations, same shape as `skins.json`'s own pre-existing
one: uploading to the same library from two tabs/profiles at the exact
same moment could lose one upload (a read-modify-write race, not worth
real optimistic concurrency for a household's occasional uploads);
deleting a background or track currently in use by a level doesn't touch
that level's own `customBackgroundId`/`customMusicId` — it simply falls
back to the default built-in (backgrounds) or silence (music, via an
explicit clear rather than a silent fallback, since there's no built-in
to land on) the next time that level is opened, matching `removeCustomSkin`'s
own "revert to default, don't guess a replacement" behavior.

**Checkpoints (2026-08-17).** A new Markers-tab entity (`checkpoint`,
texture key `checkpoint-bell` — a project-owner-supplied bell sprite,
processed the same alpha-preserving crop-and-downscale as the 2026-08-17
Goal art swap above, no flood fill needed) that gives a level mid-run
respawn points instead of always sending a loss back to Spawn.

Unlike its Markers siblings, Checkpoint is deliberately *not* singleton:
Spawn/Goal/Chest stay one-per-level (`EditorScene`'s `MARKER_TYPES` set)
because `PlayScene`'s spawn/win/chest-open logic is each built around
exactly one, but a level's whole reason to have checkpoints is placing
*several* along its length — so Checkpoint is simply left out of
`MARKER_TYPES`, which drops it straight into the same "any number, one
per tile" placement path Enemies/Items/Decor already use, with zero new
editor-side code. Being an ordinary entity brush also means it's
skinnable for free via the existing custom-skins system (see "Skin/
background/music libraries" above) — nothing about skinning is
Checkpoint-specific.

*Activation.* Touching a checkpoint's overlap zone
(`PlayScene.activateCheckpoint`) tints its bell green
(`CHECKPOINT_ACTIVE_TINT`) and pops it with a quick scale tween, clears
the tint on whichever bell was active before (only one is ever lit at a
time — touching an earlier one again after passing a later one re-activates
that earlier one, there's no "furthest checkpoint wins" ordering), and
shows a brief "Checkpoint!" toast above the grid. A plain `setTint` rather
than a second baked "lit" texture — cheap, and it survives a user-uploaded
skin of any color scheme instead of needing an activated variant of
whatever image they chose. Re-touching the already-active checkpoint is a
guarded no-op (checked by tile position, since unlike a collected item a
checkpoint's sprite is never destroyed and stays touchable) so walking
back and forth across a lit bell doesn't replay the toast/pulse or fire
on every physics frame of continued overlap.

*Respawn scope: retry, not resume.* Which checkpoint is active is
runtime-only Play-session state — never written to `LevelData`, never
saved. `PlayScene.restart()` (the R key / Restart button after a loss)
threads the active checkpoint's tile coordinates through
`scene.restart()`'s data (same mechanism `world`/`returnScene` already
use to survive that call, which reruns `init()`/`create()` from scratch
and would otherwise forget it) so retrying the *same* attempt keeps your
progress; `create()` prefers that position over the level's own Spawn
marker when present. Every *fresh* entry — Test Play from the editor, a
World's first level, a Template's Play button, `nextLevel()` advancing a
World — never passes a checkpoint, so it always starts at the real Spawn
with every bell back to its default color, confirmed via Playwright
(touch a checkpoint, Esc back to the editor, Test Play again, player
lands back at Spawn). This is a deliberate scope choice, not a missing
feature: checkpoints make retrying a hard section less punishing within
one sitting, they're not a persistent level-completion save.

**Sub/Up areas (2026-08-17).** A level can grow up to two extra grids
beyond its original one — one **Sub** area and one **Up** area, each with
the exact same block/marker/enemy/item/decor palette and its own
independent Background/Music choice as Main (see the Area switcher bullet
under Controls). Connected via a new project-owner-supplied "magical
laundry basket" asset (`magic-basket.png`, processed the same flood-fill
white-background removal + crop-to-bbox + premultiplied-alpha LANCZOS
downscale as the original caged-sheep Goal art, since this source image
was also fully opaque) placed as two new marker types, `basket-sub` and
`basket-up` — touching either one instantly teleports the player to
wherever the *same-type* basket sits in its paired area (Main⇄Sub or
Main⇄Up), landing exactly on top of it, like a Mario pipe. Not a
continuous scrolling space — each area is its own independent screen,
swapped to discontinuously, matching the reference image's own framing of
the basket as a teleportation trigger rather than a doorway you walk
through.

*Data model: zero migration.* `LevelArea` is a new interface holding
every field that used to belong to "the level" directly (background/
customBackgroundId/customMusicId/width/height/layers/entities); `LevelData
extends LevelArea` and adds only genuinely level-wide metadata (id/name/
timestamps/schemaVersion) plus two new optional fields, `subArea` and
`upArea`. Main's own data stays at the exact same top-level JSON keys it
always had — an existing saved level loads and plays identically, with
`subArea`/`upArea` simply absent — while Sub/Up are purely additive
(`schemaVersion` bumped to 2 anyway, since `LevelSerializer`'s v1→v2
ground-skin migration already claims that version number for an unrelated
reason).

*Editor: an Area switcher, not a mode.* The header grows **Main** /
**+Sub** / **+Up** buttons (see the Controls bullet above) that swap which
area `EditorScene` is currently painting/placing into — `TilePainter` and
`EntityPlacer` were retyped from `LevelData` to `LevelArea` and are
reconstructed on every switch, `HistoryStack` became one-per-area
(`Record<AreaKey, HistoryStack>`) so undoing while editing Sub can never
reach back and undo something done in Main, and creating a Sub/Up area for
the first time sizes it to Main's *current* width/height (there's no
independent resizing). A first real bug this surfaced: `EditorScene`'s
`rebuildVisualsFromLevel` (which runs on every area switch) replaced
`entityPlacer` with a fresh instance but never destroyed the *old* one's
marker sprites first — switching Main→Sub→Up left every previous area's
Spawn/basket/coin icons visually stuck on the grid even though the
underlying per-area entity data was already correctly separated, caught
by actually looking at a screenshot rather than trusting the (correct)
entity-count footer alone. Fixed with a new `EntityPlacer.destroy()`
called on the outgoing instance before replacing it.

*Marker singletons are scoped per area, not per level.* Rather than
implementing a true cross-level singleton for Spawn/Goal/Chest (which
would mean reaching into a currently-not-rendered area's data to erase a
marker there), `MARKER_TYPES`' one-per-type uniqueness check is scoped to
whichever area is currently being edited — so Main/Sub/Up can each
independently hold their own Spawn/Goal/Chest. `PlayScene` picks a
starting area by checking Main, then Sub, then Up, in that fixed order,
for whichever one has a `player-spawn` (defaulting to Main if none do,
matching every pre-existing level's behavior exactly), and Test Play now
checks for a Spawn *and* a Goal across all three areas rather than just
Main.

*Gameplay: teardown/rebuild, not a scene restart.* A basket teleport needs
to swap every area-scoped piece of Play state (ground tilemap+collider,
background, music, every spawned sprite+zone, enemies) while deliberately
preserving `stats` (score/hearts/buffs) and the player itself — unlike
Restart, which reruns the *whole* scene from scratch via `scene.restart()`
and resets those on purpose. `PlayScene.enterArea(key, landingTile?)` is a
new manually-orchestrated method that does exactly that; `useBasket`
(cooldown-guarded — see below) is its only caller besides the one-time
setup in `create()`. Progress carrying through a teleport falls out of
this for free: nothing about `stats`/`player` is touched, so a level reads
as one continuous playthrough across Main/Sub/Up, not three separate
attempts.

Two real bugs this surfaced, both the same root cause: Phaser reuses one
singleton scene instance across every relaunch rather than constructing a
fresh one (already true before this feature — see "Enemy hitboxes &
sizes"' own `spritesByBrushId` note above), so a field like `groundLayer`
can be a stale-but-truthy reference to a `TilemapLayer` the *previous* run
already tore down — and a destroyed `TilemapLayer` nulls out its own
`.tilemap` property, so `.tilemap.destroy()` alone still throws reading
`.destroy` off `undefined`. `PlayScene` gained an explicit `areaBuilt`
flag (reset in `init()`, set at the end of a successful `enterArea`) that
gates its teardown block and its player-reuse-vs-create branch, found via
Restart crashing after dying in Sub; the exact same class of bug existed
in `EditorScene.createGroundLayer()` too (`this.groundLayer?.tilemap
.destroy()`, missing a second `?.`), found separately via starting a
*second* fresh level in one browser session, fixed the same way.

*Ping-pong cooldown.* Landing on the destination area's own matching
basket (an inherent consequence of "land exactly on the paired basket")
would immediately re-overlap that basket's freshly-rebuilt trigger zone
and bounce the player straight back, forever. `TELEPORT_COOLDOWN_MS =
500`, checked/set in `useBasket`, is long enough to clear one overlap
check after landing but short enough that using a *different* basket
right after arriving doesn't feel blocked.

*Restart respawns in the checkpoint's own area.* `CheckpointCoord` gained
an `area: AreaKey` field — a checkpoint touched in Sub is meaningless to
Main's own Spawn-based starting-area guess. A second real bug: `create()`
originally always called `enterArea(startingAreaKey())`, which only ever
consults where *Spawn* lives — so restarting after dying at a Sub
checkpoint silently reopened in Main instead, confirmed by an actual
screenshot showing the player back at Main's Spawn with the checkpoint
bell nowhere in sight. Fixed by preferring `this.checkpoint?.area` when a
checkpoint was carried forward, falling back to `startingAreaKey()` only
for a genuinely fresh entry.

Verified end-to-end in a mocked-Drive Playwright session: a basket-sub
round trip (Main→Sub→confirmed no ping-pong) carrying a coin's worth of
score across the teleport, a checkpoint activated inside Sub, a Restart
after a lava death correctly reopening in Sub at that checkpoint (not
Main's Spawn), a Goal placed only in an Up area reached and won via
basket-up from a different level, the editor's Area switcher creating/
switching/two-tap-deleting a Sub area, and a plain level with no Sub/Up
areas at all still playing and winning exactly as before.

**Sub/Up feedback + basket tint (2026-08-17).** A follow-up investigation
into a report that Sub/Up areas were "not working properly," plus a
request to make Basket (Up) visually distinct from Basket (Down) since
both rendered with the exact same `magic-basket` texture everywhere — the
editor palette icon, the placed marker, and the in-game sprite — making
them genuinely impossible to tell apart at a glance. `UP_BASKET_TINT_COLOR
= 0xffc266` (a multiply-tint, not a second art asset — see Palette.ts) is
now applied to Basket (Up) at all three of those render sites, plus the
Skin Creator's pick-brush grid, and explicitly `.clearTint()`'d the moment
a real custom skin resolves for it so a player's own uploaded art is never
involuntarily recolored.

Re-testing the teleport itself end to end (correct-area round trips both
directions, and standing still on the landing basket for 3+ seconds well
past `TELEPORT_COOLDOWN_MS`) found the underlying mechanic sound — no
ping-pong, no missed overlaps. What *is* a genuine gap: `useBasket`
silently did nothing when the destination area didn't exist yet, or
existed but had no matching basket placed in it — exactly what happens
when a level designer places a basket in Main and forgets (or, before
this pass, couldn't visually tell they'd placed the wrong *type* of) the
matching one in Sub/Up. Walking onto that basket produced zero feedback —
no error, no toast, nothing — reading indistinguishably from "the feature
is broken" even though nothing had actually gone wrong. `PlayScene`'s
Checkpoint-only toast was generalized into a `showToast(message, color?)`
usable by both, and `useBasket` now surfaces "No matching basket in
Sub"/"...in Up" (in a warning color, distinct from Checkpoint's green)
whenever that happens, debounced by the same `TELEPORT_COOLDOWN_MS`
window so standing on an inert basket doesn't spam the toast every
physics frame. Verified via Playwright: a Main-only level with a
Basket (Down) and no Sub area at all shows the warning exactly once and
never teleports; a correctly-paired level round-trips in both the
Sub and Up directions with the new gold tint visibly rendering in Test
Play (not just the editor).

**Mandatory basket pairing (2026-08-18).** The runtime toast above is a
safety net, not enforcement — it only fires once a player actually walks
onto an unpaired basket mid-playtest, by which point the broken level has
already shipped. `testPlay()` already blocked Space/Test Play on a missing
Spawn or Goal (`this.ui.setStatus("Place a Spawn and a Goal before Test
Play")`); the exact same shape now also blocks it whenever `subArea`
exists without a `basket-sub` in *both* Main and Sub, or `upArea` exists
without a `basket-up` in both Main and Up — `EditorScene.hasMatchingBasketPair`,
called once per satellite area right after the Spawn/Goal check. Only
presence is required, not a 1:1 count: multiple baskets of one type in an
area are allowed (`PlayScene.useBasket` already just `.find`s the first
match in the destination), so this checks "at least one on each side," not
"exactly one." Deliberately scoped to Test Play only, not Save — matching
the Spawn/Goal check's own precedent of letting a level be saved half-built
and only gating the moment it actually needs to run. A basket placed in the
*wrong* area entirely (e.g. a `basket-sub` sitting inside Up, which
`basketDestination` treats as permanently inert — see "Sub/Up areas"
above) still passes this presence check and isn't something a static check
can catch without knowing the designer's intent; the runtime toast remains
the backstop for that case specifically. Verified via Playwright across
four scenarios per basket type: a satellite area with no basket at all
(blocked), a basket in the satellite area but not Main (still blocked —
proving both sides are actually required, not just "one somewhere"), a
correctly paired level (proceeds), and a plain level with no Sub/Up areas
at all (completely unaffected, confirming the new check is additive and
doesn't touch the existing Spawn/Goal gate).

**Jump feel retune (2026-08-19).** A report that the player's jump "looks
too high" turned out to be well-supported, not a misread: `JUMP_VELOCITY
= -450` against the original `GRAVITY_Y = 900` gave an ordinary hop a
~3.5-tile apex and a full 1-second hang time — over 2.3× the player's own
48px sprite height, measured empirically (sampling `player.y` every frame
in Playwright, not just the math) at ~108.5px/1002ms. A screenshot at the
apex made the case on its own: a routine flat-ground jump reached
tree-canopy height with nothing to clear. Cross-checking against
`templateLevels.ts` sealed it — its own comment already said gaps are
"sized well *within*" the max jump, and every real gap in the six bundled
templates tops out at 2-3 tiles, purely horizontal; the extra height was
never load-bearing for anything, just floaty by default.

Fixed by raising `GRAVITY_Y` rather than cutting `JUMP_VELOCITY` — gravity
is what actually controls "floaty vs. snappy" (it shortens hang time *and*
lowers the apex together, plus makes the fall itself read faster), where
cutting jump velocity alone would only make the same shape of arc smaller
without changing how it feels. 1200 was the first value tried and
measurably fixed the complaint, but tracing the exact trajectory against
Desert Canyon's one real step-up (a 2-tile pillar the enemy-ghost patrols
atop — a genuine rise, not just a flat gap) found it landing right at the
pillar's tile edge with under a tile of margin, down from the ~1.3 tiles
the level was originally built with. Backed off to **1100** instead:
apex ~2.9 tiles / ~0.82s hang time (still a real, visible cut — the
character no longer reads as jumping to tree-canopy height) with
comfortable margin restored on that tightest case.

`BOUNCE_VELOCITY_Y` (Spring Meadow/Crate Canyon's launch pad — see "Six
starter templates" under Art) shares `GRAVITY_Y`, so raising gravity alone
would have shrunk the bounce's own apex from ~7.3 tiles to ~5.5 — short of
the ~6 tiles SPRING_MEADOW's platform actually needs, breaking a level
that worked before. Raised `BOUNCE_VELOCITY_Y` from -650 to -719
(`v' = v·√(1100/900)`) in the same pass to keep that exact height
unchanged; only its hang time drops (~1.4s→~1.3s), which just reads as
snappier, not less reachable.

*A test-methodology lesson, not a product bug.* A first verification pass
walked all six templates with a continuous "hold Right + hold Up" bunny-
hop bot and saw 5/6 fail — alarming, right after a physics change. Re-
running the *identical* bot against the unmodified original physics
first (git stash, not just re-reasoning) found 4 of those 5 already
failing there too, including Spring Meadow/Crate Canyon/Frozen Cavern all
stopping at the exact same world-edge x-coordinate regardless of gravity
— the bot was overshooting the Goal's overlap zone while mid-hop, a
pre-existing artifact of that input pattern, not a jump-height issue.
Desert Canyon was the one real before/after difference (passed under old
physics, died under new) — but a precisely-timed *single* jump (not the
bunny-hop) at both the old and new gravity values died to the same
enemy-ghost at nearly identical positions either way, proving that
specific death is the level's enemy placement, unrelated to gravity, in
both directions. Same for Spring Meadow's bounce sequence: reached the
platform's height and died to the enemy-bat at essentially the same
world position under both old and new physics. Net result: the retune
changes nothing about which templates are completable — confirmed by
comparison against the original build, not assumed from a passing test
run.

**Power-ups: Chicken Slipper and PJ Thunder Hat (2026-08-19).** Two new
Items-tab pickups, designed end-to-end before writing any code — the
ambiguous product decisions (does the shock defeat every enemy including
the un-killable Spike Crawler, permanent equip vs. limited ammo, a visible
worn accessory vs. HUD-only, rename Feather in place vs. a new item) were
each surfaced and confirmed rather than assumed.

*Chicken Slipper* is a reskin, not new logic — double jump already existed
end-to-end as the Feather item (`PlayerStats.hasDoubleJump`/
`doubleJumpUsed`/`canDoubleJump`/`useDoubleJump`/`resetDoubleJump`, wired
into `PlayScene.update()`'s jump branch). Only the label and the
procedurally-drawn icon changed (`drawChickenSlipperIcon` in
generateTextures.ts, replacing the old placeholder chevron badge with a
white slipper sole and three orange chicken-foot claws) — the underlying
`id`/`textureKey`/`entityType` all stay `"item-feather"`, so a level saved
before this change still places the exact same item, just rendered and
labeled differently now. Same "gracefully degrade, never orphan existing
data" rule the Basket (Down)/(Up) pair already established. A new
`accessory-slippers` sprite now follows the player's feet whenever
`hasDoubleJump` is true (`PlayScene.updateAccessoryVisuals`).

*PJ Thunder Hat* is genuinely new: a ranged shock that defeats *any*
enemy on contact, including the Spike Crawler — previously un-killable,
only avoidable, since `ENEMY_DEFS` marks it `stompable: false`. Permanent
equip (`PlayerStats.hasThunderHat`) with an 800ms cooldown
(`THUNDER_COOLDOWN_MS`/`canFireThunderHat`/`fireThunderHat`) rather than
limited ammo, so a level can't be soft-locked by running out of shots on
an enemy that needs one. Firing is a new edge-triggered input (X on
keyboard via `PlayerController`'s `attackKey`/`isAttackPressed`, a 4th
on-screen ⚡ button in `TouchControls`, stacked above Jump) that spawns a
`gameplay/Bolt.ts` projectile — fixed 500px/s, gravity-free, 5-tile range,
launched in whichever direction the player is currently facing
(`player.flipX`). Resolved via manual per-frame checks in
`PlayScene.updateBolts()` (expired range, `groundLayer` tile's own
`.collides` flag, or `physics.overlap` against a live enemy) rather than
persistent Colliders — a bolt is a short-lived, dynamically-spawned
object, so a one-off check each frame avoids having to track and
explicitly tear down a Collider pair for every shot fired, the same
"colliders don't outlive a destroyed GameObject automatically" trap
`enterArea`'s own teardown already has to manage for area-scoped content.
Firing also briefly reuses `"wizard-cast"` (previously only shown once, in
`onWin()`) as a 150ms cast-flash pose, and a new `accessory-hat` sprite
follows the player's head whenever `hasThunderHat` is true.

Both accessory sprites and the bolt's own sprite are new procedurally-
drawn art (no matching asset in the Kenney pack, same situation the
Feather placeholder was already in) — see generateTextures.ts's own
comments for why. Verified end-to-end in a real browser session: both
items collected via the actual editor→Test Play flow, double jump firing
a second time only while airborne and only once per hop, the shock
correctly gated by its cooldown (a second press immediately after firing
does not spawn a second bolt), bolts travelling in the correct direction
after turning around, and — the one previously-impossible interaction —
a Spike Crawler destroyed by the shock despite being un-stompable.

**Committed Playwright e2e suite (2026-08-20).** Every feature this
project has shipped was verified in a real browser, but until now that
meant a hand-written Playwright script re-derived from scratch each
session — nothing accumulated as a regression net, and CI only ever ran
`tsc -b && vite build`. Promotes five of those scenarios (basket
round-trip both directions, the missing-basket-pair Test Play gate, Hand
tool grab/move with undo for both an entity and a ground block, checkpoint
restart reopening in its own area, and a plain-level paint→play→win
regression floor) into `tests/e2e/`, run via `npm run test:e2e`
(`@playwright/test`) and wired into `.github/workflows/deploy-pages.yml`
as a new `e2e` job the Pages `deploy` job now depends on alongside
`build` — a genuine regression blocks the deploy the same way a failing
build already does.

The real engineering problem was persistence: this app's only storage
backend is Google Drive (`GoogleDriveStorageAdapter`/`driveClient.ts`),
gated behind real Google Identity Services OAuth — completely unusable
headless in CI. `tests/e2e/support/mockDrive.ts` mocks both at the network
boundary rather than swapping in a fake StorageAdapter: a `page.addInitScript`
stubs `window.google.accounts.oauth2` before any page script runs (so
`googleAuth.ts`'s `loadGis()` never even loads the real
`accounts.google.com/gsi/client` script), and a `page.route` on
`googleapis.com` backs an in-memory fake Drive filesystem implementing the
exact request shapes `driveClient.ts` generates (folder search/create,
file search/get/rename/trash, multipart create/update — parsed off the
`Content-Type` boundary rather than hardcoding driveClient's own constant).
This exercises the *real* `GoogleDriveStorageAdapter` code end to end,
including the real `ProfileGateScene → Menu` boot chain, not a test-only
substitute for it.

The second problem was clicking anything at all: Phaser renders to one
`<canvas>`, so there's no DOM to select against. `tests/e2e/support/coords.ts`
solves this by asking the page's own live game instance for real
positions at run time — `clickByText`/`clickIconWithLabel` search a
scene's display list (recursing into Containers, since `EditorUI`'s
palette icon grid is one) for the Text/Image a real click would land on,
rather than hardcoding `EditorUI.ts`'s button-layout math, which would
silently drift out of sync on the next layout change. This surfaced a
real bug in the coordinate math itself before any spec could pass: Phaser's
`ScaleManager.displayScale` is *game-space per canvas-space pixel*
(`baseSize / canvasBounds` — confirmed straight from
`node_modules/phaser/src/scale/ScaleManager.js`, not assumed), so
converting a scene coordinate to a page click point needs to *divide* by
`displayScale`, not multiply — multiplying (my first attempt) put every
click roughly 20% short of its target, which at this canvas's FIT-mode
scale-up was just far enough to consistently miss the intended button
while still looking plausible on paper. Caught immediately by the very
first real spec run, not by re-reading the math harder.

`tests/e2e/support/levels.ts` builds real `LevelData` objects
programmatically for specs that need specific pre-built content (a
basket pair, a checkpoint past a cliff) — setup is programmatic, but the
actual mechanic under test (a basket teleport, a Hand-tool drag, a
Test-Play click, walking off a ledge) is still driven by real
pointer/keyboard input against the live scene, not a scene-state
shortcut. One of these — the basket round-trip's return leg — needed a
similar "verify, don't assume" correction: touching a basket and simply
waiting past its cooldown never re-triggered the return trip on its own,
because the player's own residual rightward velocity had already carried
it a few pixels past the landing basket's overlap zone by the time the
test noticed the area had changed; the fix was to walk back onto the
basket explicitly rather than assume a stationary re-fire.

The `window.__debugGame` hook every earlier verification pass this
session added and removed by hand around `src/main.ts` (per the
"temporary debug hook, always reverted" convention) is now permanent —
but gated behind `import.meta.env.DEV`, which Vite statically resolves to
`false` in a production build, so the whole block is dead code in what
actually deploys to GitHub Pages. Playwright's own `webServer` (see
`playwright.config.ts`) always runs the dev server, never the production
build, so the suite can rely on the hook always being present without
ever touching production behavior — a structural fix for the "must
remember to revert it" risk the ad hoc version carried, not just a
one-off instance of following the convention correctly.

**Character situations (2026-08-20).** The character now shows a different
pose for winning, losing, casting, swimming, getting hurt, and picking up a
power-up — built entirely on the five sprites he already had
(`public/assets/wizard/`), with no new art.

This started as a request to add sprite editing to the Skin Creator for the
main character. Measuring the existing frames turned that around: they carry
**~950–1010 distinct colors each, with 29–35% of their pixels at partial
alpha** (measured in a real browser, not estimated). They're hand-drawn art
with soft anti-aliased edges, while `PixelCanvasOverlay`'s model is one flat
hex color per cell from a ≤16-color palette with binary alpha — importing
them would have collapsed ~1000 colors to 16 and destroyed every soft edge.
`PixelSkinData`'s own docstring already says as much about uploaded photos.
So the sprites stay exactly as they are and the Skin Creator is untouched;
what was actually missing was the *game using* the frames it already had.

`src/gameplay/characterState.ts` is the new decision point: a pure,
priority-ordered resolver (`lose > win > cast > swim > jump > walk > idle`)
plus a frame table and a separate tint table, sitting where `PlayerStats.ts`
sits — no Phaser types, unit-tested without a scene, 20 cases covering every
branch. `updateWizardAnimation` now delegates the frame choice and *returns*
the situation it settled on, so `PlayScene` can apply the matching treatment
without re-deriving the same precedence a second time. Ordering matters in
two non-obvious places: swimming has to outrank jumping (in water the player
is always airborne by the grounded check, so the reverse order would make
the swim pose unreachable), and casting has to outrank movement so firing
the Thunder Hat reads mid-stride.

Frame and tint stay deliberately separate, keeping the split
`updateBuffVisuals` already had — a tint is a modifier on whatever pose is
showing (you can be hurt while walking), not a pose of its own. Situations
the five frames don't literally contain reuse the closest one plus a
treatment: **losing** is the idle frame desaturated and toppled over
(previously the character just froze mid-stride with no pose at all),
**swimming** is the jump frame with a forward lean, and **picking up a
power-up** briefly strikes the cast pose — the arms-up stance already reads
as "something good happened," so it needed nothing new. Coins and Keys are
excluded: they change the HUD, not what the character can do.

Two real gaps closed along the way. `onLose()` had no pose whatsoever. And
getting hurt was visually identical to holding a Shield — both only set
`invincibleUntil`, so an absorbed hit and an 8-second Shield both tinted
cyan for over a second. `PlayerStats` gained `lastHitAt`/`isHurtFlashing`
so a survived hit flashes red for 220ms before settling into the ordinary
grace tint.

*Why the tilts are safe.* Arcade Physics bodies are axis-aligned and don't
rotate with their sprite, so `setAngle` changes only what's drawn. That
matters because the 2026-08-19 gravity retune verified every bundled
template against a fixed 22×40 body, with Desert Canyon's pillar down to
roughly a tile of margin — a cosmetic pose must not be able to invalidate
that. `tests/e2e/character-states.spec.ts` asserts the body stays 22×40
with a lose tilt applied rather than leaving it to reasoning.

*A testing lesson worth recording.* Three of the four e2e tests failed on
first run, none of them because of a product defect. Two sampled too
slowly: `expect.poll` runs on its own cadence (100/250/500ms), which steps
straight over a 220ms hurt flash or a 260ms power-up flash. The third was
worse in a more interesting way — the level was short enough that the
player reached the Goal mid-assertion, and since winning *also* shows the
cast frame, a win looked exactly like a stuck power-up flash (the failure
screenshot showed "You Win!" on screen, which is what gave it away). The
fix for the transients isn't a tighter poll interval but a latch installed
inside the page on `requestAnimationFrame`, so every rendered frame is
checked and a quarter-second pose cannot be missed. A fourth failure
appeared only in the full-suite run: the headless browser falls back to
software WebGL, so the game loop runs behind wall-clock under load and a
~1.5s in-game fall genuinely took longer than a 5s poll allowed — the
screenshot showed "You Lose" already on screen. That one is environmental,
and the honest fix was headroom, not a workaround.

**Skin storage: one cache and one copy (2026-08-21).** Two problems the
character work measured but deliberately left alone, fixed together now that
they were the next thing in the way.

*The library was re-downloaded constantly.* `loadCustomSkins()` did a fresh
`findFileByName` + `getFileContent` on every call with no memoization at all,
and `PlayScene.enterArea` calls it on **every** area build — so each basket
teleport re-fetched the whole skin library mid-play, and the Skin Creator's
browse screen did one full round trip per distinct brush it listed. (A comment
in `SkinEditorScene` even claimed those calls "replay `loadCustomSkins`' own
in-memory result"; that cache did not exist.) It does now, with an in-flight
promise dedupe alongside it for the same reason `driveClient` caches its
in-flight app-folder promise: `MenuScene` fires several resolves without
awaiting each other, so caching only the settled result would still let them
all race past the check. Every caller gets an independent clone, never the
cached object — the mutators here all read-mutate-write, so handing back the
cache by reference would let a *failed* write leave it holding state that was
never saved. A failed write leaves the cache showing what's really on Drive.

*Every pixel skin stored its art twice.* A skin persisted both a PNG and the
`cells` grid it was drawn from, even though `PixelCanvasOverlay` renders
exactly one canvas pixel per cell and never scales — so the PNG already **is**
the grid. Verified rather than assumed: reconstructing a cells array from its
own PNG across 32 distinct palette colors gave **0 mismatches over all 1024
cells**, at 842 bytes against the array's 9,506. Roughly 11x of pure
redundancy, in the file that gets read whenever skins resolve. New saves write
only the palette marker; `cellsFromPngDataUrl` rebuilds the grid on open.
Legacy skins keep their `cells` and still open straight from them, and each
one migrates itself the next time it's saved — the same read-normalize,
write-when-touched approach `normalizeSkinsFile` already used for the
pre-2026-08-16 shape, rather than an eager rewrite of everyone's library.

Also fixed a real one-line bug found on the way: `paletteId` was written on
every save and then never read, because re-opening a skin always passed
`DEFAULT_PIXEL_PALETTE_ID` — so re-editing a Game Boy skin silently presented
PICO-8's swatches.

*Two bugs in the test tooling, not the app.* The Skin Creator's buttons use
`setOrigin(0, 0.5)` (and `← Back` the default `0, 0`), but `clickByText`
clicked the Text object's own `x`/`y` — an edge or a corner, not the middle —
so the click landed on the boundary and missed entirely. It now clicks the
centre of `getBounds()`, which is more robust for every existing spec too.
And `mockDrive`'s multipart parser split on a regex with a **capturing** group,
`(--)?`; `String.split` splices captured text into its result and inserts
`undefined` for an optional group that didn't match, which then threw on
`.trim()` and looked exactly like a malformed upload body. Non-capturing now.
The round trip is pinned by a new e2e test that paints a scatter of cells
(including all four corners, where an off-by-one would surface first), saves,
reopens, and asserts every cell came back identical — through the real editor
and the real storage layer, not a synthetic canvas.

**Home page UI/UX pass (2026-08-21).** Screenshotted the live page in both
the first-run and returning-user states before changing anything, which turned
up two outright bugs next to the layout problems.

*The page's only identity affordance was illegible.* The `wizard-idle`
decoration at (50, 34) was drawn straight over the `"{profile} · Switch
profile"` text at (8, 6) — not subtly, right across it. The mascot moved to the
footer and the profile line became a proper chip at the grid's own left margin.

*A Drive failure hung both status lines forever.* `void
levelStorage.list().then(...)` had no `.catch`, so an offline or consent
failure was an unhandled rejection and the cards sat on "Checking…" with
nothing explaining why and no way to retry. Both lists now catch, both cards
say so, and the bar offers **Try again**, which re-runs the fetch.

*The bottom third of the page was empty while the cards crowded the edges.*
~90px of dead space sat between the last control and the footer line. It's now
a full-width bar that adapts to who's looking: **Jump back in / <your most
recent level> / Continue →** for a returning builder, **New here? / Play a
ready-made level, then remix it into your own / Browse Templates →** for
someone with nothing saved. Deliberately not a fifth card — the grid's four
positions are hardcoded and sized so `GAME_HEIGHT` clears them, so a fifth
would mean a third row cascading into `gameConfig.ts` constants every other
scene reads; a bar fills the space without touching that math, and suits a
"one thing, right now" prompt better than a peer of the four standing choices.
Which level to resume is `pickResumeLevel` in `src/level/recentLevels.ts` —
pure and unit-tested, treating an unparseable `updatedAt` as the epoch so NaN
can't poison the ordering, and breaking ties deterministically so Continue
doesn't point somewhere different between visits. While the list is still
loading the bar is inert rather than clickable, so its destination can never
change under a cursor mid-click.

*Priorities were inverted.* The volume slider — bright green, centred,
full-width at volume 1.0 — was the loudest graphic on the page, while **Skin
Creator**, an actual destination, was a dim 13px text link *below* it. Skin
Creator is a chip now; the slider narrowed to 150px and moved to the footer's
right edge.

*Cards didn't look clickable.* They were flat filled rectangles with no border
and no affordance until you happened to hover one. Each now has a 4px accent
stripe, a border and a `›` chevron, and **New Level** carries the page's one
gold stripe — with nothing saved yet it's the only card leading anywhere with
content in it, and once there is saved work the resume bar takes over as the
loudest thing on the page.

*Icons were doing double duty as decoration.* `wizard-idle` was both the My
Levels icon and the top-left mascot; `goal-portal` was both the Worlds icon and
a top-right decoration. Repeating the art stops the icons reading as
identifiers. My Levels is a `chest` now, and the decorations are enemies only.
`decor-bat` was tried there first and rejected from the screenshot — it renders
as a near-black blob on the navy page.

*Contrast.* The controls hint was `#666688` on `#1a1a2e` = **3.10:1**, under
the 4.5:1 small-text threshold, on the one line explaining the controls to a
first-time player. Now `#8a8ab0` = 5.15:1. The card subtitles measured 6.43:1
and were left alone.

*Keyboard access.* Everything here is drawn into a canvas, so there's no DOM
tab order to inherit and the page was pointer-only. Targets now carry a
row/column, so arrow keys move spatially — "down" means the thing visually
below, even where one row is a full-width bar and its neighbour holds two
cards — and Enter/Space opens. Hover and focus drive one shared highlight, so
two things are never lit at once, and `GAME_OUT` clears a hover left stuck by a
pointer leaving the canvas (Phaser never sees that move otherwise). The volume
slider is still not keyboard-reachable, being a drag control — a real remaining
gap.

*A harness race the home page work exposed.* CI failed the skin round-trip
spec that had passed the run before: `clickByText` asserted its target existed
at the instant it was called, but `SkinEditorScene`'s browse list paints from
`listPixelSkins().then(async ...)` with a further `await resolveSkinThumbnails`
per brush inside it, so the Edit buttons appear some way after the `← Back`
that asks for them. Fast enough to win locally, not on CI. `clickByText` and
`clickIconWithLabel` now wait for their target instead of demanding it already
be there — Playwright's own rAF polling, still throwing the same "no Text X in
scene Y" message once the wait expires, so a genuinely wrong label still fails
loudly rather than silently clicking (0,0). Verified that directly: a
deliberately absent label still rejects with the right message.

*One Phaser quirk, found by measurement.* Arrow keys initially over-stepped:
three ArrowDown presses moved the ring four places. Logging DOM events, scene
emissions and focus moves side by side showed Phaser 3.90 re-delivering
already-handled keydowns — three DOM events, six scene emissions. Two fixes
were tried and measured before the third stuck. `EditorScene`'s existing
`onceThisFrame` guard also swallows a *genuine* second press in the same frame,
which is fine for undo/redo but turned those three presses into one step.
Remembering the last timestamp per key failed too, because the replays aren't
in order — the trace caught an older ArrowDown re-delivered *after* a newer one
had been handled, so a single slot ping-pongs and treats both as new. What
works is a monotonic high-water mark: every key event carries a timestamp from
one clock, so a real press is always strictly later than anything handled and a
replay never is. Verified at both timings — 7 presses, exactly 7 moves, whether
sent back to back or spaced out.

**Multi-frame sprite editor: a paintable character and animated enemies
(2026-08-22).** The Skin Creator can now paint *several* frames per skin —
five poses for the player character, a loop of up to four for each enemy —
which is the half of the original sprite-editor request that the 2026-08-20
character-situations work deliberately left for later.

*The player was not skinnable at all.* Not "skinnable but unused": `PlayScene`
created the sprite with the literal `wizard-idle` and never registered it with
`trackSprite`, so the skin-resolve pass never saw it. The `spawn` brush that
looks like the obvious home is the placement arrow, so skinning it reskins the
marker. The character now has its own storage key, deliberately not a Palette
brush — it is not something you paint into a level, and putting it there would
give the level editor a brush that places nothing.

*Grampa's own art still cannot be imported*, and this does not pretend
otherwise: ~950-1010 distinct colours per frame with about a third of pixels
at partial alpha, against a 16-colour binary-alpha canvas. A character skin is
painted from scratch and replaces him wholesale. Poses you have not painted
fall back to that skin's **own idle**, never to Grampa — a half-finished
16-colour character turning into hand-drawn art mid-jump would read as a bug
rather than as unfinished work. So one painted frame is already a usable skin;
it just doesn't animate yet.

*The character paints at 48x48, everything else stays at 32.* Grampa renders
48px tall, so a 32-grid character would be scaled up 1.5x and read visibly
chunkier than every other sprite. It also keeps the physics honest:
`applyWizardTexture` offsets the body by `FRAME_HEIGHT - BODY_HEIGHT`, so a
48-tall painted frame drops into exactly the geometry Grampa uses and **the
body stays 22x40 whatever anyone paints**. That is not incidental — the
2026-08-19 gravity retune verified every bundled template against that fixed
body, Desert Canyon's pillar down to about a tile of margin, so a skin that
could change the hitbox would let someone painting a character silently make
shipped levels uncompletable. An e2e assertion pins it.

*Additive storage.* `SkinAsset` gains an optional `frames` map;
`imageData` stays the representative frame either way, which is what lets the
browse list, the picker thumbnails and `EntityPlacer` keep reading one field
and need no changes at all. Every skin saved before this is a valid
single-frame skin with nothing to migrate. An empty frame map normalises back
to absent so readers never special-case it, and the set is written wholesale
so deleting a frame really deletes it. An all-blank frame is treated as "not
painted yet" rather than "painted invisible", which is what keeps the fallback
reachable.

*Frames animate by `setTexture`, not Phaser animations*, matching how every
other sprite in this game changes frame: a custom skin's frames arrive at
runtime as separately-registered textures, so there is no sprite sheet to
define an animation against. The loop timer accumulates rather than resetting
on each step, so a stalled frame cannot quietly drift the cycle slow — the
same wall-clock-versus-frame-rate trap the basket teleport fell into.

*Two layout things worth recording.* `PixelCanvasOverlay` hardcoded its grid
size in twenty places; it now takes one, defaulting to 32 so every existing
call site is byte-identical. The CSS grid-line overlay derives its spacing
from that size too — hardcoding 32 there would misalign every line on a 48
canvas. And the frame list sits in the empty band *beside* the canvas, not
above it: tried there first, and it rendered straight through the colour
swatches, which the screenshot caught immediately.

**Basket teleports could bounce you back and forth (2026-08-22).** A
teleport lands the player standing exactly on the destination area's own
basket, and the only thing stopping that pad firing again was
`TELEPORT_COOLDOWN_MS` — 500ms. That guard turned out to be measured on a
different clock from the thing it was guarding. `this.time.now` follows wall
time whatever the frame rate (measured: 783ms of game time across 782ms of
wall clock on a loaded box), while the player's position is integrated per
physics step. On a starved loop those diverge: the timer lapses on schedule
but the player has covered a fraction of the usual distance, so they are still
standing on the pad and get sent straight back — ping-ponging for as long as a
direction is held.

Reproduced deterministically at 6x CPU throttling rather than waiting for a
slow machine: the player oscillated around x=245 with the pad at x=238 for
5-7 seconds and finished on the wrong outcome in a third of runs. This is not
a test-only concern — the game ships touch controls and a rotate-to-landscape
tip, so slow phones are exactly the audience, and a player holding a direction
through a teleport on one would have hit it.

The guard is now `latchedBasketTile`: a pad will not fire again until the
player has genuinely left it, which is a question about position rather than
about elapsed time and so cannot drift with frame rate. It is scoped to the
one pad landed on rather than to baskets in general, so stepping straight onto
a neighbouring basket still works — the case the cooldown's own comment called
out. The timer stays for the job it is actually good at: keeping an *inert*
basket from re-toasting every physics frame.

`tests/e2e/basket-bounce.spec.ts` pins it, throttling the CPU to starve the
loop on purpose; it was checked to fail with the fix reverted, so it is
holding something real. The two round-trip tests in `basket-pairing.spec.ts`
changed with it: they used to land on the pad, stand still for 600ms, and
expect the return teleport — which was the bug. They now step off the pad and
walk back onto it, which is the interaction a player actually performs.

*Two wrong calls on the way, both worth recording.* First: the CI failure was
called environmental because the same spec failed locally at a commit CI had
passed. Then it was called a regression from the preceding harness commit,
because CI had passed twice and then failed twice. A controlled comparison —
the same throttled scenario against `coords.ts` at both commits — showed
identical ping-ponging either way, so neither story was right; the product bug
was, and CI had simply got slow enough to expose it. Third: the specific
`Expected "sub", Received "main"` signature on CI turned out to be a dropped
`keyboard.down("ArrowRight")` line, lost when a comment was inserted into that
spec. The player was never told to walk. Worth the reminder that a scripted
edit can quietly delete a line, and that a test failing for the reason you
assume is itself an assumption.

**Skin Creator (2026-08-17).** A standalone pixel-art painter, reachable
from a chip in the Menu's footer row (a bare text link until the
2026-08-21 home-page pass) rather than a fifth
card or a mode nested inside the level Editor — it's a much lighter
destination than New Level/World Maker/Templates/Continue (pick a brush,
paint, save; no level state involved), and the card grid's layout
constants are all hardcoded around exactly four cards, so a link fits
both its actual weight and the existing code better than forcing a new
row. `SkinEditorScene` is a new self-contained Phaser scene with three
internal modes (`browse` → `pick-brush` → `canvas`) rather than three
separate scenes, since all three share the same header/back-button shell
and none needs its own physics or camera setup.

*Storage: pixel-drawn skins are ordinary skins.* A painted skin is saved
through the exact same `SkinAsset`/shared-skin-library plumbing an
uploaded photo skin already used (`skinStorage.ts`'s
`loadCustomSkins`/`writeCustomSkins`, one `skins.json` per project on
Drive, keyed by brush id) — `SkinAsset` just grew one new optional field,
`pixelData: { paletteId, cells }`, where `cells` is a flat 32x32 array of
hex colors (or `null` for transparent). The canvas is still exported to
an ordinary `imageData` PNG on save, so every existing consumer
(`resolveSkinTextureKeys`, `resolveSkinThumbnails`, `EntityPlacer`,
`PlayScene`) needed zero changes — a pixel-drawn skin becomes active and
renders in-game exactly like an uploaded one. Colors are stored as literal
hex strings per cell rather than palette indices, so re-editing an old
skin later is unaffected by any future change to the built-in palettes'
own color values. A skin's brush is locked in at creation (chosen once in
`pick-brush` mode) — re-editing only ever repaints an existing skin's
cells, it can't be retargeted to a different brush, which matches how the
ordinary upload flow already scopes one skin to one brush.

*Five preset palettes,* inspired by well-known freely-usable retro
palettes (PICO-8, Sweetie 16, DawnBringer 16, a Game Boy 4-shade green
ramp) plus one exact 8-color "Bright 8" palette of pure on/off RGB
combinations, `findPalette`/`PIXEL_PALETTES` in `pixelPalettes.ts`.
Switching palettes mid-edit re-captures the canvas's current cells first
(`this.pixelCanvas.getCells()`) rather than discarding them, so painting
partway through with one palette and then switching to browse a different
one's swatches doesn't wipe unsaved strokes — only an explicit two-tap
**Clear** (matching `EditorUI`'s existing Clear/Delete-Area confirm
pattern, 3-second auto-disarm) actually erases the canvas. Undo/redo was
deliberately scoped out of v1 for effort reasons — added the same day, see
"Skin Creator tools" below.

*Pixel-perfect by construction.* `PixelCanvasOverlay` is a real DOM
`<canvas>` (positioned over the Phaser canvas the same way
`FileInputOverlay`/`LevelNameInput` already overlay real `<input>`
elements) whose backing buffer is exactly 32x32 — matching `TILE_SIZE` —
CSS-stretched to a larger on-screen editing size with
`image-rendering: pixelated`. Because the buffer is already tile-resolution,
`canvas.toDataURL()` needs zero resampling, unlike the ordinary upload
path's `readAndDownscaleSkinImage` (bilinear-resampled down to a 128px
cap). A pure-CSS checkerboard `background-image` shows through
`ctx.clearRect()`'d cells while editing but is never part of the canvas's
own bitmap, so erased cells still export as true alpha-0 pixels. Painting
uses Pointer Events (`pointerdown`/`pointermove`/`pointerup`) with
`touch-action: none`, so mouse-drag and real finger-drag both paint
without separate code paths, matching the same debounced
"once-per-cell-per-stroke" approach `EditorScene`'s own drag-paint uses.

*A real bug found and fixed: stale Back-button listeners from every prior
mode.* Each mode switch called `this.children.removeAll(true)` before
rebuilding, assuming the `true` argument destroyed the previous mode's
GameObjects — that's true for `Phaser.GameObjects.Container.removeAll`,
which `WorldMakerScene` already relies on correctly, but a Scene's own
`this.children` is a `DisplayList` (`Phaser.Structs.List` directly, per
Phaser's `InjectionMap`), and `List.removeAll` takes a *skip-callback*
flag, not a destroy flag — it never calls `.destroy()`. Every previous
mode's old GameObjects, including their Back buttons, stayed fully alive
with active input listeners, just detached from rendering — so after a
few mode transitions, clicking "← Back" from `canvas` mode fired *every*
stale Back handler stacked at that same screen position at once,
including an old `browse`-mode handler that called `scene.start("Menu")`,
sending the player straight to the actual Menu scene instead of
`SkinEditorScene`'s own `browse` list. Confirmed by reading Phaser's own
`List.js`/`Container.js`/`InjectionMap.js` source rather than guessing.
Fixed by explicitly destroying every child instead of trusting
`removeAll`'s flag:
`for (const child of [...this.children.list]) child.destroy();` (spread
into a new array first, since `.destroy()` mutates the live list during
iteration). Verified fixed via a targeted Playwright repro
(browse → + New Skin → pick a brush → canvas → Back now correctly returns
to `SkinEditorScene`'s own browse list, not Menu).

Verified end-to-end in a mocked-Drive Playwright session: painting and
saving a new pixel skin for the Coin brush (Bright 8 palette, filled red
block) then confirming it renders correctly both in the ordinary Editor's
Items palette icon and in actual Test Play gameplay with correct
collision/scoring; a full browse → pick-brush → canvas → Save → Back →
Edit → switch palette mid-edit (strokes survive) → paint more → Save
again → Back round trip, confirming exactly one browse-list entry (an
overwrite, not a duplicate) after the second save; and Delete correctly
returning the browse list to its empty state.

**Skin Creator tools (2026-08-17).** A follow-up pass adding six things a
review of the v1 canvas flagged as missing, all in `PixelCanvasOverlay`
(the data/interaction layer) and `SkinEditorScene` (the buttons wiring
each into the UI):

- *Undo/redo* — the biggest gap, since v1 had no way back from a stray
  click short of nuking the whole canvas with Clear. `PixelCanvasOverlay`
  gained its own small history (an array of `{index, prevColor,
  newColor}` deltas per cell, batched per pointerdown-drag-pointerup
  gesture or per flood fill into one `undoStack` entry) — a much lighter
  mechanism than the level editor's Command/HistoryStack classes, since a
  cell-color delta needs no GameObjects or brush lookups to replay. Ctrl+Z
  /Ctrl+Y and header Undo/Redo buttons mirror `EditorScene`'s own
  shortcuts exactly, including the `onceThisFrame` frame-stall guard —
  registered once in `create()`, not inside `buildCanvas()`, since
  `rebuild()` reruns `buildCanvas()` on every palette switch and
  browse↔canvas round trip without ever re-running `create()`; registering
  keyboard listeners inside `buildCanvas()` instead would have stacked a
  fresh duplicate listener on every visit to canvas mode, firing undo/redo
  multiple times per keypress after a few round trips. Loading a different
  skin to edit, or Clear, both reset the undo/redo stacks — same "a fresh
  editing session shouldn't carry someone else's undo history" reasoning
  `EditorScene`'s own Undo/Redo bullet already documents for loading a
  different level.
- *Bucket fill* — a `Paint`/`Fill`/`Pick` tool-mode row (right side of the
  swatch row). Fill is a classic 4-directional (not diagonal) flood fill
  from the clicked cell, bounded by the target color's own contiguous
  region, so painting a hollow border first and then filling its interior
  never bleeds past the border. One `pointerdown` — dragging with Fill
  active doesn't repeatedly re-flood-fill every cell the pointer crosses.
- *Zoom* — `PixelCanvasOverlay.setDisplaySize` (clamped to `[200, 320]`)
  resizes the on-screen CSS box only, re-centered on its previous middle
  so zooming never shifts the drawing — the 32x32 pixel buffer, `cells`,
  and undo history are all completely untouched, unlike routing this
  through a `goTo("canvas")` scene rebuild the way the palette switcher
  does (which would have wiped the undo stack via `loadCells`). This
  needed a layout change to have room to matter: v1 put Clear in a row
  below the canvas, leaving only ~6px of vertical slack in the scene's
  fixed 468px height — Clear (and the new Mirror toggle) moved to a
  column beside the canvas instead, freeing the space Zoom needed.
- *Grid overlay* — a second, sibling `<div>` layered above the canvas
  with a pure-CSS repeating-gradient grid (`background-size: calc(100% /
  32)`, so it self-aligns to cell boundaries at any zoom level with no JS
  math) rather than anything drawn into the pixel buffer itself — keeps
  it structurally impossible to leak into `exportPngDataUrl()`'s output,
  same reasoning the checkerboard background already used.
- *Eyedropper + right-click erase* — Pick samples `cells[index]` back into
  the current color and auto-reverts to Paint immediately (a momentary
  "sample and get back to work" gesture, matching every other pixel-art
  tool's own eyedropper convention). A right-button held during
  `pointerdown`/`pointermove` (`e.buttons & 2`) always erases regardless
  of the selected tool or color — a quick "get rid of this" without a
  swatch round trip — with the canvas's own `contextmenu` listener
  suppressed so the browser's right-click menu doesn't interrupt the
  gesture.
- *Mirror* — a toggle that routes every committed cell (paint, fill, or
  right-click erase — all three funnel through the same
  `setCellWithMirror`) through a horizontal-mirror pair too. Mirrors the
  *action*, not "independently flood-fill both sides" — simpler and more
  predictable than the two sides disagreeing about where their own fill
  boundary is if the drawing isn't already symmetric.

**A real bug found in testing: picking a color silently cancelled Fill.**
The swatch click handler auto-reverted the active tool to Paint on every
color pick — copied from the eyedropper's own "resume painting after a
pick" convenience without noticing the two cases aren't the same. For
Eyedropper that's correct (picking a color *is* the action, so there's
nothing left to stay in eyedropper mode for). For Fill it broke the whole
workflow: select Fill, pick a color, click the canvas — except the swatch
click had already silently switched back to Paint before the canvas click
landed, so only the single clicked cell ever got painted instead of the
region flood-filling, with no error and no visual indication anything had
gone wrong. Caught by a Playwright screenshot showing one red pixel where
a filled region was expected, not by reasoning about the code — a
reminder that this class of "silently does the wrong thing, no crash" bug
is exactly what browser verification catches and a passing build cannot.
Fixed by only auto-reverting from Eyedropper specifically
(`if (this.currentTool === "eyedropper") setTool("paint")`), leaving Fill
undisturbed across as many color changes as a multi-color fill session
needs.

Verified end-to-end in a mocked-Drive Playwright session at a >1x canvas
scale: painting a hollow border then flood-filling its interior (contained
exactly within the border, not bleeding past it), undoing the fill as one
step and redoing it, enabling Mirror and confirming one click paints both
a cell and its horizontal-mirror partner, sampling a filled cell's color
with Eyedropper (confirmed by the Paint tool button re-highlighting and
the matching swatch showing selected) and painting elsewhere with the
sampled color, right-click-erasing a cell with Mirror off, toggling the
Grid overlay on over existing artwork, and zooming in twice — canvas
visibly larger, grid still aligned, painted design and undo history both
completely intact.

**Hand tool (2026-08-17).** A new header toggle, right of Eraser, for
moving an already-placed entity without erasing and re-placing it — press
down on an occupied tile to grab whatever's there, drag (the marker
sprite follows the raw pointer position, not snapped to a tile, for a
natural "holding it" feel), release over an empty tile to drop it.
Mutually exclusive with Eraser, same shape as the two Enemy-Size-style
toggles elsewhere in this UI: `EditorScene.toggleHand`/`toggleEraser` each
clear the other's flag before handing both states to
`EditorUI.setHandActive`/`setEraserActive`, so only one can ever be the
active tool, and a distinct color (`HAND_ACTIVE_COLOR`, purple, vs.
Eraser's red) makes which one at a glance.

The first version scoped this to entities only (Markers/Enemies/Items/
Decor), reasoning "grab elements and move them" meant entities, not
ground paint — `beginGrab` called only `EntityPlacer.entityAt`, with no
fallback to the ground layer the way the universal Eraser has one. User
feedback after shipping said otherwise: clicking a placed Brick with Hand
active did nothing, and that read as a bug, not a deliberate scope limit
— "elements" evidently meant anything visibly placed on the grid, blocks
included. Extended the same day (see "Block support" below) rather than
left as a documented limitation.

Three new `EntityPlacer` methods carry the entity half of the gesture,
all keyed by tile position like `entityAt`/`removeAt` already were:

- `previewDragTo(fromX, fromY, worldX, worldY)` — a pure visual
  reposition of the marker sprite still filed under its origin tile,
  called from `onPointerMove` on every frame a drag is in progress. Never
  touches `level.entities` or the markers map's key, so nothing about the
  level actually changes until the drag commits.
- `cancelDrag(fromX, fromY)` — snaps the marker back to its own tile's
  center. Covers every way a drag can end without committing: dropped
  outside the grid, back on its own tile (no-op, nothing to do), or onto a
  tile something else already occupies (blocked rather than swapped or
  displaced — the same "very simple first" cut this project takes
  elsewhere, e.g. World Maker's own no-drag-reorder choice — with a "Tile
  occupied" status toast so the block doesn't read as the tool silently
  failing).
- `moveTo(fromX, fromY, toX, toY)` — commits the move: updates the
  entity's `x`/`y` in place and re-keys the markers map, repositioning the
  *same* sprite rather than destroying and recreating it, so a custom skin
  texture or an Enemy Size display scale already applied to it survives
  the move untouched. Unconditional like `add`/`removeAt` — `EditorScene`'s
  `endGrab` is responsible for having already confirmed the destination
  was empty.

A successful drop becomes one `MoveEntityCommand` (new, alongside
`AddEntityCommand`/`EraseEntityCommand`) — `execute` calls `moveTo` one
way, `undo` calls it the other, so Ctrl+Z/Ctrl+Y cover a Hand-tool move
exactly like any other edit, and it counts as a normal `markDirty` edit
for autosave purposes too. Verified end-to-end in a mocked-Drive
Playwright session: grab-drag-drop moving a Spawn marker to a new tile,
Ctrl+Z reverting it and Ctrl+Shift+Z re-applying it, dragging it onto a
tile an already-placed Goal occupied (blocked, "Tile occupied" toast,
snapped back to its pre-drag position, entity count unchanged), and
toggling Eraser while Hand was active correctly turning Hand back off.

*Block support.* `beginGrab` now checks for an entity first (unchanged),
then falls back to the ground block at that tile — same "entity before
ground" priority the universal Eraser's `applyEraseAt` already uses, so
Hand and Eraser read consistently: whichever one you're using, an entity
sitting on a block always takes precedence over the block underneath it.
A ground block has no sprite of its own to reposition mid-drag the way an
entity marker does — it's one cell's value in `layers.ground`, rendered
by the shared tilemap layer, not a separate GameObject — so
`previewDragTo` doesn't apply here. Instead, `beginGrab` clears the
source cell immediately and live (`TilePainter.paint(x, y, EMPTY_TILE)`)
the moment a block is grabbed, which is itself the drag's visual
feedback (the block visibly vanishes from its tile) alongside the
ordinary hover highlight tracking the pointer as the destination
indicator. This is a genuine, if brief, live mutation to the grid outside
the undo system — not a problem, because `endTileGrab` always resolves
it one of two ways before the gesture ends: paint `tileValue` back at the
source (canceled — dropped off-grid, back on its own tile, or onto an
already-occupied one, blocked with the same "Tile occupied" toast the
entity path uses) or at the destination (committed). Needed no new
`Command` class: a commit becomes one `CompositeCommand` of two ordinary
`PaintTileCommand`s (source: `tileValue → EMPTY_TILE`, destination:
`EMPTY_TILE → tileValue`) — `CompositeCommand`'s existing reverse-order
undo already unwinds a two-step move exactly right (destination back to
empty, then source back to `tileValue`), the same infrastructure ordinary
tile painting has used since undo/redo first existed. Verified with the
same Playwright session: grab-drag-dropping a placed Brick to an empty
tile, confirming the source tile empty and the destination showing the
Brick immediately mid-drag (before release) at the source, Ctrl+Z/
Ctrl+Shift+Z correctly reverting/reapplying the move, and dragging it
onto a tile a second block already occupied (blocked, snapped back to
its pre-drag tile, no duplication).

**Save-state readout moved to the footer (2026-08-17).** Freeing up room
in the header for the Hand tool button (see above) was the immediate
reason, but the footer is also just a better fit for a persistent,
read-only stat — its own doc-comment now spells out why: unlike the other
three footer slots (level size, cursor tile, entity count), which are
left-aligned in fixed slots since nothing downstream of them depends on
their width, the save-state readout is right-aligned to the footer's own
edge (`FOOTER_SAVE_STATUS_X = GAME_WIDTH - PANEL_PADDING`), the one thing
in the footer worth a dedicated, always-in-the-same-corner spot, the way
it had next to Save before. `WorldMakerScene`'s own save-state label is
unaffected — that scene has no footer band to move it into, so it stays
in its original header-style corner (top-right, below its own Save World
button).

**Text legibility pass (2026-08-17).** A step-by-step audit of why the
UI's text felt hard to read turned up three compounding causes, only one
of which was about font size:

1. *Every Text object was nearest-neighbor upscaled.* `main.ts` sets
   `pixelArt: true` so the hand-drawn sprites/tiles stay crisp, which sets
   `antialias: false`/`antialiasGL: false` globally (confirmed in Phaser's
   own `Config.js`) — but that setting applies to *every* WebGL texture,
   including the canvas-rendered bitmap behind a `Text` object. Combined
   with `resolution` defaulting to `1` on every Text object (Phaser's
   `Text.js`), and `Scale.FIT` stretching the fixed 1050x468 canvas to
   whatever the actual browser window is (almost always >1x on desktop —
   confirmed 1.333x in a 1400px-wide Playwright viewport), every letter on
   every screen was being blown up with blocky, non-antialiased scaling —
   independent of font choice or size. This was the single biggest,
   least-obvious contributor, and the only one that couldn't be fixed by
   touching individual scenes.
2. *No font family was ever set,* so every `Text` object fell back to
   Phaser's own unstyled default, `"Courier"` (confirmed in
   `TextStyle.js`) — a monospace font, a poor fit for dense UI chrome next
   to this game's hand-drawn art.
3. *Some real UI text was just very small* — AssetPickerMenu thumbnail
   labels at 8px, palette brush captions and the Upload-tile label at 9px,
   list-row sub-captions at 10px — with no shared type scale across the 13
   scene/editor files that render text.

Fix, in the same priority order: `src/ui/textDefaults.ts`'s
`installTextDefaults()` patches Phaser's own `GameObjectFactory.prototype.text`
once, called from `main.ts` before the `Game` is constructed, to inject a
default `fontFamily` (`"Trebuchet MS", "Segoe UI", Verdana, Arial,
sans-serif` — a widely-available stack rather than a single named font, so
it degrades gracefully without needing to self-host/CORS-load a web font)
and `resolution: 2` (supersamples the glyph bitmap so the nearest-neighbor
upscaling above has far less visible blockiness to magnify) into every
existing and future `scene.add.text(...)` call, everywhere, without
threading either property through dozens of call sites by hand — including
the many already hidden behind shared helpers like `EditorUI.makeFixedWidthButton`.
Only fills in whichever of the two a caller's own style didn't already
set, and never touches sprite/tile textures, so the pixel-art rendering
those rely on is completely unaffected. The handful of sub-11px sizes
identified in point 3 were raised individually (8px/9px → 10px, 10px →
11px), and `AssetPickerMenu`'s `LABEL_HEIGHT` constant grew 14 → 18 to
keep a wrapped 2-line thumbnail label (e.g. "Frozen Volcano") from
crowding whatever's below it — `cellHeight`/`panelHeight` are already
derived from that one constant, so the whole dropdown's row spacing
adjusted automatically rather than needing a second, separate fix.

Also folded in while touching these files anyway: the muted/secondary
label color used throughout the UI existed as two near-identical, mildly
inconsistent grays (`#8b8bb0` in the editor, `#8888aa` everywhere else) —
both computed to a borderline ~4.86:1 contrast ratio against the panel/
header backgrounds (WCAG AA requires 4.5:1 for normal text, so this had
no headroom to spare). Consolidated to one shared, lighter value,
`#a6a6c8` (~6.75:1 against the same backgrounds), across every scene —
one fewer inconsistency and comfortable contrast margin, not just a
bare pass.

Verified in a mocked-Drive Playwright session at a deliberately >1x
canvas scale (1400px-wide viewport, confirmed 1.333x): the Menu's title/
card text, the editor's full header/footer/palette (including "Basket
(Down)"/"Basket (Up)", the longest palette captions, still fitting
comfortably within their columns at the new size), and the Background
picker's dropdown (exercising the worst-case 2-line-wrap label) all
render crisp and correctly laid out with zero overflow or row collisions.

*Follow-up: the fix above wasn't actually complete.* User feedback after
shipping said text still looked hard to read. Re-reading Phaser's own
`Text.js`/`WebGLRenderer.js` turned up the real crux the first pass
missed: `resolution: 2` only supersamples the *source* bitmap — it never
touches which WebGL filter mode the texture is sampled with, and every
*new* texture defaults to NEAREST because of `pixelArt: true`. Worse,
that default isn't just a one-time construction-time thing a single
post-creation override could fix: `Text.updateText()` — the one method
every content or style change funnels through, `setText`/`setStyle`/
`setFont`/construction itself, all of it — calls
`renderer.canvasToTexture(canvas, existingGlTexture, true)` on *every*
call, and that function recomputes NEAREST/NEAREST from the game's global
`antialias` config and reapplies it to the texture every single time,
silently overwriting any filter override from before. A one-time
`.setFilter(LINEAR)` tried first (right after `scene.add.text(...)`
returns) held only for text that's never updated again — most button
captions, but not the footer's live cursor tile/entity count, the
save-state readout, dropdown trigger labels, or any status toast, all of
which call `.setText(...)` continuously and silently reverted to blocky
NEAREST filtering on their very next update. This mattered more than it
sounds: those are exactly the pieces of text a player's eye is drawn to
most, since they're the ones actively changing.

The real fix needed a second patch point, not a bigger `resolution`:
`installTextDefaults()` also now wraps `Phaser.GameObjects.Text.prototype
.updateText` itself — calls the original (unchanged), then re-asserts
`texture.setFilter(Phaser.Textures.FilterMode.LINEAR)` immediately after,
every time. Since `updateText()` is the one choke point every text/style
change funnels through, this survives every future `.setText()` call
rather than just the first render — no gaps, no need to hunt down and
patch every individual mutator method. `resolution: 2` stays alongside
it (extra source detail for LINEAR to interpolate from, still worth
having), but the filter override is what actually made blocky/aliased
text go away for good. Verified the same way the original bug was found
here — a Playwright session that moves the pointer continuously (driving
dozens of real `.setText()` calls on the footer's cursor-tile readout,
the same class of element that silently regressed before) and then
screenshots a tight crop of that exact text afterward, confirming smooth,
anti-aliased edges rather than the blocky look a reverted-to-NEAREST
texture would show.

## Project layout

See `docs/spellbound-editor-implementation-plan.md` §4 for the intended
full layout. Implemented so far:

```
src/
├── main.ts                  Phaser game config + boot
├── ui/
│   └── textDefaults.ts       patches Phaser's text factory with a default fontFamily/resolution — see "Text legibility pass" under Art
├── scenes/
│   ├── BootScene.ts          loads wizard/Kenney/entity art + procedural textures, starts ProfileGate
│   ├── ProfileGateScene.ts   "Who's playing?" + "Connect Google Drive" gate, Boot → here → Menu — see "Google Drive storage & profiles" under Art
│   ├── MenuScene.ts          home page: 2x2 card grid (New Level / Templates / My Levels / Worlds)
│   ├── TemplateBrowserScene.ts lists TEMPLATE_LEVELS with Play/Use This Template
│   ├── LevelBrowserScene.ts  lists saved levels with Edit/Delete
│   ├── EditorScene.ts        palette + grid painting + save/test-play
│   ├── PlayScene.ts          runs a level with Arcade Physics (optionally chained via a World or returning to Templates)
│   ├── WorldBrowserScene.ts  lists saved Worlds with Play/Edit/Delete
│   └── WorldMakerScene.ts    build/edit a World's level order
├── editor/
│   ├── Palette.ts            data-driven brush definitions
│   ├── TilePainter.ts        raw mutator for the ground tile layer
│   ├── EntityPlacer.ts       raw mutator for the entity layer — position-keyed (one entity per tile), not type-keyed, since 2026-08-15's multi-instance rework
│   ├── EditorUI.ts           header + footer + left Palette panel (category chip/dropdown + 2-col grid + Skin) + right Level Settings panel rendering
│   ├── FileInputOverlay.ts   a real, invisible <input type=file> positioned over an EditorUI upload button (Upload BG or Upload Music) — see "Custom uploaded backgrounds" under Art for why a Phaser-driven click can't open a real file picker
│   ├── LevelNameInput.ts     a real, visible <input type=text> for the level name (Phaser has no native text-entry widget) — see "Level name" under Art, including two non-obvious bugs found/fixed while building it
│   ├── domOverlay.ts         positionOverlay() — converts game coordinates to real CSS pixels over the canvas, shared by FileInputOverlay and LevelNameInput
│   ├── customBackgroundUpload.ts downscales/re-encodes a picked image file into a background-ready JPEG data URL
│   ├── musicUpload.ts        reads a picked audio file as-is (no re-encoding possible), rejecting anything over 4MB — see "Music" under Art
│   ├── spriteFit.ts          scales any texture down to fit one tile
│   └── commands/
│       ├── Command.ts         execute()/undo() interface
│       ├── PaintTileCommand.ts
│       ├── AddEntityCommand.ts  adds one entity; undo removes it
│       ├── EraseEntityCommand.ts removes one entity; undo re-adds it from its own snapshot
│       ├── MoveEntityCommand.ts relocates one entity (Hand tool); undo moves it back
│       ├── CompositeCommand.ts batches a whole drag (or an entity move/replace — see "Entity eraser & multiple instances" under Art) into one undo step
│       └── HistoryStack.ts    undo/redo stacks (+ unit tests)
├── level/
│   ├── LevelSchema.ts        LevelData / LevelEntity types (customBackgroundData/customMusicData/customMusicName, EnemySize included)
│   ├── LevelSerializer.ts    serialize/deserialize/clone (+ unit tests)
│   ├── groundAutotile.ts     stored tile value → render frame in the combined multi-skin tileset (+ unit tests)
│   ├── groundSkins.ts         per-skin color palettes + skin-keyed texture-key naming
│   ├── backgrounds.ts         dormant: the parallax background-scene pool (unrelated to ground skin) + resolveBackground/nextBackgroundId
│   ├── staticBackgrounds.ts   current: the built-in static background pool (Meadow/Sunny Valley/Frozen Volcano/Pirate Cove) + resolveStaticBackground/nextStaticBackgroundId/backgroundDisplayLabel — LevelData.background's actual type ("custom" included)
│   └── templateLevels.ts      6 hand-authored levels (TEMPLATE_LEVELS), served by TemplateBrowserScene
├── gameplay/
│   ├── PlayerController.ts   run/jump input handling (speed-multiplier aware; exports isJumpPressed for double-jump edge detection)
│   ├── PlayerStats.ts        pure score/hearts/buffs rules — collect*/registerHit/speedMultiplierAt/canDoubleJump (+ unit tests)
│   ├── StaticBackground.ts   current no-pan background (cover-fit, masked to the grid's exact width and height), textureKey passed in by the caller
│   ├── backgroundLoader.ts   resolves a level's background to a texture key — instant for built-ins, async scene.textures.addBase64 registration for a "custom" upload (see "Custom uploaded backgrounds" under Art)
│   ├── musicLoader.ts        resolves a level's uploaded music to a Phaser audio cache key, or null for silence — async scene.load.audio registration, same pattern as backgroundLoader.ts (see "Music" under Art)
│   ├── ParallaxBackground.ts dormant two-layer fake-parallax background (zoomed Image, clamped pan by player X, masked to level width), keyed by the dormant BackgroundSceneId — see "Static background (current)" under Art
│   ├── wizardAnimation.ts    pose/texture swapping + physics-body re-centering
│   └── EnemyBehaviors.ts     shared patrol/bob + stomp-vs-hit rule for ghost/bat/spike crawler (+ unit tests), plus per-species hitbox fractions and Small/Medium/Large sizing (applyEnemySize/applyDefaultSkinSize) — see "Enemy hitboxes & sizes" under Art
├── audio/
│   ├── audioPrefs.ts         {volume, muted} — load/save to localStorage, applied once to scene.sound (the game-wide SoundManager) at boot
│   └── VolumeControl.ts      mute-toggle + draggable-volume-slider widget, used identically by MenuScene (home-page theme) and PlayScene (a level's music) — see "Music" under Art
├── persistence/
│   ├── StorageAdapter.ts       interface (list/save/load/remove)
│   ├── LocalStorageAdapter.ts  unused since 2026-08-16 — kept, not deleted, see "Google Drive storage & profiles" under Art
│   ├── GoogleDriveStorageAdapter.ts current level backend — Drive-file-per-level, appProperties-tagged by profile
│   ├── WorldStorageAdapter.ts  same interface, one level down, for Worlds
│   ├── LocalWorldStorageAdapter.ts unused since 2026-08-16, same reason as LocalStorageAdapter.ts
│   ├── GoogleDriveWorldStorageAdapter.ts current world backend — same pattern as GoogleDriveStorageAdapter.ts
│   ├── storage.ts              getLevelStorage()/getWorldStorage() — the one place that picks which adapter every scene gets
│   └── saveState.ts            shared SaveState type + text/color per state, used by EditorUI and WorldMakerScene's save-state indicators
├── drive/
│   ├── googleAuth.ts          Google Identity Services token client wrapper — connect/getAccessToken/tryReconnectSilently/disconnect
│   └── driveClient.ts         thin Drive REST v3 wrapper (fetch-based) — ensureAppFolder/findFileByName/createFile/updateFileContent/getFileContent/trashFile/listFiles
├── profile/
│   └── Profile.ts             PROFILES = [Mike, Gabriel, Andressa] + load/save/clear the active one (tiny, still in localStorage — see "Google Drive storage & profiles" under Art)
├── skins/
│   ├── CustomSkins.ts          CustomSkinRecord/CustomSkinsFile types
│   ├── skinUpload.ts           downscales a picked image to a small alpha-preserving PNG (see "Custom skins" under Art)
│   ├── skinStorage.ts          load/save/remove against the shared, non-profile-scoped skins.json
│   └── skinLoader.ts           resolveSkinTextureKeys — registers each skin as its own Phaser texture, same caching pattern as backgroundLoader.ts
├── world/
│   └── WorldSchema.ts        WorldData: an ordered list of level ids + a name
├── config/
│   ├── gameConfig.ts         tile size, grid dimensions, physics constants
│   └── googleDrive.ts        GOOGLE_CLIENT_ID / DRIVE_ROOT_FOLDER_ID / APP_FOLDER_NAME / DRIVE_SCOPE
└── assets/
    └── generateTextures.ts   procedural art still in use: Castle's blocks + UI chrome

public/assets/
├── wizard/                   idle.png, walk1.png, walk2.png, jump.png, cast.png (hand-drawn)
├── entities/                 ghost-pillow.png (hand-drawn); caged-sheep.png (goal art, project-owner-supplied — see "Goal art" under Art); bat.png, bat-perched.png, spike-crawler.png, golem.png, trophy.png, chest.png (Kenney)
├── tiles/                    tileset-{grass,desert,snow}.png, icon-*.png (Kenney, derived — see scripts/)
├── items/                    coin.png, heart.png, shield.png, speed.png, key.png (Kenney, derived — Chicken Slipper/PJ Thunder Hat are procedural, see generateTextures.ts)
├── decor/                    bush/tree/cactus/lamp/cloud/snowman/sprout/mushroom/rocks.png — purely cosmetic (Kenney, derived)
├── audio/
│   └── menu-theme.mp3        the home page's background music (the project owner's own supplied track) — see "Music" under Art. A level's own uploaded music isn't here — it lives inline in that level's saved JSON, not as a build asset.
└── backgrounds/
    ├── static/
    │   ├── meadow.png         the current default static background (the project owner's own reference image, used at native content/aspect — see "Static background (current)" under Art)
    │   ├── sunny-valley.png   another built-in static background, selectable via "BG: ▶"
    │   ├── frozen-volcano.png another built-in static background, selectable via "BG: ▶"
    │   └── pirate-cove.png    another built-in static background, selectable via "BG: ▶"
    └── scenes/               dormant: every parallax background-scene layer, all a fixed 2048x476: green-valley/pirate-cove/overgrown-ruins/snowy-peaks-{far,near}.png (original painted art, not Kenney-derived) — castle's "starfield" scene is procedural, generated at the same size

scripts/
├── prepare-kenney-assets.py       derives public/assets/{tiles,entities,items,decor}' Kenney-sourced PNGs (one-off, not part of the build)
├── generate-painted-backgrounds.py derives public/assets/backgrounds/scenes/'s original painted PNGs (one-off, not part of the build)
└── add-water-depth-frame.py       adds tileset-{grass,desert,snow}.png's 6th "deep water" fill frame (one-off, not part of the build — see "Water is swimmable, not a hazard" under Art)
```
