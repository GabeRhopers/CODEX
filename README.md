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
WebGL crash that pass found and fixed. See the plan doc §9.1
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
npm run typecheck # type-check only, no build
```

Open the dev server URL in a browser. Controls:

- **Home page** (opens on load): a 2x2 card grid — **New Level** starts a
  fresh empty editor; **Templates** opens the template browser; **My
  Levels** opens your saved-levels browser; **Worlds** opens the world
  browser. Each card's subtitle is a live status line (how many you've
  saved, or a nudge toward New Level/Templates when empty).
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
  in one place.
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
  a Spawn and a Goal to be placed first; enemies and items are optional.
- In Play mode: **arrow keys / WASD** to move, **Up/W/Space** to jump
  (press again mid-air for a second jump if you've collected a Feather),
  **Esc** back to wherever you launched Play from (the editor for Test
  Play, My Worlds for a World, or Templates for a template's Play
  button — the on-screen hint always names the right one), **R** to
  restart after winning/losing. Jump
  on top of the Ghost or Bat to squish it; touching either any other way,
  or touching a Spike Crawler at all (it can't be stomped), costs you the
  level **unless** you're holding a Heart in reserve or are currently
  Shield-protected — see "Items & hit-points" under Art. A Bounce block
  launches you noticeably higher than a normal jump; a Brick is just
  solid ground with a different look. On a
  touchscreen, semi-transparent **◀ ▶ ▲** buttons in the corners (see
  "Mobile/touch" below) do the same three things and the win/lose screen
  grows tappable **Restart**/**Next Level** buttons next to its
  keyboard-only hint text, since there's no R/N/Esc key to press.
- **Save** (header button): persists the current level to Google Drive
  under its own id (as of 2026-08-16 — see "Google Drive storage &
  profiles" under Art for why this replaced `localStorage`) — every level
  you save is kept (see My Levels), not just the most recent one. You
  rarely need to click it: a persistent **● Saved / ● Unsaved changes /
  ● Saving… / ● Save failed** indicator just left of the Save button in
  the header (see "Autosave & save-state tracking" under Art) tracks
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
  paint drag or single entity placement/move undoes as one step. Clear
  resets the undo history (undoing past a full level swap doesn't make
  sense); so does loading a different level via My Levels → Edit.

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
next to (ghost-pillow is 40x40; this is 43x48) — `PlayScene` renders it
at that native pixel size with no additional scaling beyond its existing
idle pulse tween, same as before.

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
`BOUNCE_VELOCITY_Y=-650`, `GRAVITY_Y=900`) is far past normal-jump range,
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
in `EditorUI` (`saveStatusText`, in the header just left of Save as of
2026-08-16) mirrors that flag in real
time as **● Saved** / **● Unsaved changes** / **● Saving…** / **●
Save failed** — deliberately not the same mechanism as `setStatus`'s
existing transient 2.5s toast (still used for one-off messages like
"Cleared"), since a save-state readout needs to persist until the state
actually changes, not disappear on a timer. `WorldMakerScene` has the
identical `dirty`/`saveStatusText` pattern (added/removed levels mark it
dirty), sharing the same four-state vocabulary and colors from
`src/persistence/saveState.ts` rather than each scene inventing its own.

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

**Items & hit-points.** Five collectible brushes, all in the palette's
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
- **Feather** — grants a second mid-air jump (press jump again while
  airborne); resets the moment you land.

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
header, and the save-state indicator moved with Save. The **footer** is
new: read-only level size (`W×H`), the live cursor tile (`EditorScene`
calls `EditorUI.setCursorTile` from the same `onPointerMove` that already
drives the hover highlight), and entity count (`EditorUI.setEntityCount`,
called from `markDirty` since almost every edit could have changed it —
cheaper than threading a "did the count actually change" check through
every call site).

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
  the pack. **Feather** has no matching tile in the pack, so it's drawn
  procedurally (a simple two-chevron badge icon) alongside the rest of
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

## Project layout

See `docs/spellbound-editor-implementation-plan.md` §4 for the intended
full layout. Implemented so far:

```
src/
├── main.ts                  Phaser game config + boot
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
├── items/                    coin.png, heart.png, shield.png, speed.png, key.png (Kenney, derived — Feather is procedural, see generateTextures.ts)
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
