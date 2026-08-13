# Mario Maker–Style In-Browser Level Editor

A browser-only, Mario-Maker-inspired level editor and player built on
Phaser 3 (MIT). See `docs/mario-maker-editor-implementation-plan.md` for
the full architecture, data model, and milestone plan.

## Status

**MVP + M1 (undo/redo) + M2 content (enemy + real goal art, plus Brick/
Bounce/Spike Crawler/Bat, plus a full Items set — Coin/Heart/Speed
Potion/Feather/Shield, all with real gameplay effects, resolving the M2
hit-points open question — see "Items & hit-points" under Art) + a
tabbed, categorized palette (Blocks/Markers/Enemies/Items/Decor — replacing
the single ever-widening icon row) + a parallax scrolling background with
a 6-scene picker independent of level theme, including 3 original painted
scenes (see "Parallax background & background scenes" under Art) + a
second content pass (Snow theme, Water hazard, Golem enemy, the Key→Chest
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
& themes" under Art), so deleting one of your own levels never touches
them and vice versa. **Worlds** chains any of your saved levels into a
played-in-order course — see "World Maker" under Controls, and plan doc
§9.3 M8 for the v1 scope and what's deliberately deferred from it. Paint
a level → Test Play → win/lose → Save → Menu → My Levels → Edit
round-trips identically, every paint/erase/entity edit is undoable — a
whole paint drag reverts as one step, not tile by tile — and a level can
include a patrolling ghost-pillow enemy (stomp it from above to kill it,
touch it any other way and you lose) plus a dream-cloud portal as the
goal. See the plan doc §9.1 for the exact MVP scope and §9.2/§9.3 for
what's still deliberately deferred (more tile/enemy variety, scrolling,
IndexedDB, backend sharing, renaming levels/worlds from the browser).

Controls add **Ctrl+Z** / **Ctrl+Y** (or **Ctrl+Shift+Z**) for undo/redo,
plus matching toolbar buttons.

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
- **Templates**: 6 pre-built levels, one per theme plus two showcasing
  Brick/Bounce/Bat/Spike Crawler together and one showcasing the second
  content pass (see "Templates & themes" and "Second content pass" under
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
  remove it, then **Save World**. **Play** runs the first level; winning a
  level that isn't the last one shows "Level Complete!" — press **N** to
  advance to the next level, or **R** to replay the current one; winning
  the last level shows "World Complete!"; **Esc** at any point returns to
  My Worlds (not the editor, since a World isn't edited through it).
- **Palette** (bottom of the editor): a row of **category tabs** — Blocks,
  Markers, Enemies, Items, Decor — switches which row of brushes shows
  below it; click a brush, then click/drag on the grid above to paint or
  place. See "Categorized palette" under Art for why it's tabbed and "New
  blocks & enemies" / "Items & hit-points" / "Second content pass" for
  what each brush does. Every brush is ordinary — not limited to any
  specific template — so any level, new or existing, can place any of
  them, from Coin to a Chest to a Sleeping Bat decoration.
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
- **Save**: persists the current level to `localStorage` under its own
  id — every level you save is kept (see My Levels), not just the most
  recent one.
- **Menu**: back to the home page.
- **Clear**: wipes the current grid and entities.
- **Theme: ▶**: cycles the level's ground skin through all 4
  `LevelTheme`s (Grass/Desert/Castle/Snow), previewing live — the ground
  layer's tile *data* (top/fill/brick/bounce/water at each cell) is
  untouched, only which tileset image renders it changes, so a level's
  full layout survives a theme switch intact. Every ground skin is
  reachable from any level this way (see "Second content pass" under Art
  for why this exists — Snow's ground tile used to only be reachable via
  the Frozen Cavern template). Persists on Save.
- **Background: ▶**: cycles the level's parallax background scene through
  the pool of 5 (independent of the level's theme — see "Parallax
  background & background scenes" under Art), previewing live; persists on
  Save.
- **Undo** / **Redo** (buttons, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z): a whole
  paint drag or single entity placement/move undoes as one step. Clear
  resets the undo history (undoing past a full level swap doesn't make
  sense); so does loading a different level via My Levels → Edit.

## Mobile / touch

Fully playable on a phone, no separate build or mode — the same page
adapts. Three things make that true, all in `main.ts`/`index.html` unless
noted:

- **Scaling**: the game's internal resolution stays a fixed
  `GAME_WIDTH`×`GAME_HEIGHT` (1340×476 — see `config/gameConfig.ts`; every
  scene's layout math is untouched), but Phaser's Scale Manager runs in
  `FIT` + `CENTER_BOTH` mode, so it's letterboxed down (or up) to whatever
  viewport it's opened in, phone included, instead of getting clipped or
  forcing page scroll. `index.html`'s viewport meta tag disables pinch/
  double-tap zoom and `touch-action: none` stops taps on the on-screen
  buttons from also scrolling the page.
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

**Ghost-pillow enemy & dream-cloud portal:** original art drawn to match
the wizard's style — rounded shapes, thick navy ink outlines, flat pastel
fills with a little shading, no external references. Built with Pillow
(the build sandbox can reach PyPI even though it can't reach asset sites):
clean vector shapes at high resolution (rounded rects, overlapping
ellipses, a two-pass "draw it twice, slightly bigger underneath" outline
trick), then LANCZOS-downscaled to final size — the same finishing
pipeline used on the wizard frames, so all three characters read as one
consistent family. See `public/assets/entities/*.png` and
`src/gameplay/EnemyBehaviors.ts` (patrol + bob + the stomp-from-above
rule, unit-tested in `EnemyBehaviors.test.ts`).

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

**Templates & themes.** A level carries a `theme` (`grass`, `desert`, or
`castle`) — purely a recolor of the ground tileset and the scene's
background, never gameplay data, so TilePainter/groundAutotile stay
theme-agnostic and any level can be reskinned by changing one field. New
levels default to `grass` (unchanged from before themes existed); old
saved levels with no `theme` field are treated as `grass` on load (see
`LevelSerializer.deserializeLevel`). `src/level/themes.ts` holds the
color palette per theme and the themed texture-key naming; the palette's
Ground brush icon and the editor/play tileset both follow the current
level's theme automatically.

`src/level/templateLevels.ts` hand-authors 6 beatable levels, exported as
`TEMPLATE_LEVELS` and served by `TemplateBrowserScene` — always
available, never written to `localStorage` (a change from an earlier
version of this project, which copied them into My Levels on first
visit): Sunny Hills (grass), Desert Canyon (desert), and Castle Ascent
(castle, a vertical staircase climb) each keep gaps/steps sized well
within the player's normal jump; **Spring Meadow** (grass) and **Crate
Canyon** (desert) additionally showcase Brick, Bounce, Bat, and Spike
Crawler together; **Frozen Cavern** (snow) showcases the second content
pass — see "Second content pass" under Art. Spring Meadow/Crate Canyon
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
category. Switching tabs rebuilds just that icon row; the selection
outline hides itself (without losing the underlying selection) when the
selected brush's category isn't the one currently showing, and reappears
when you tab back. The row of active-brush icons lives in a
`Phaser.GameObjects.Container` — as a single entry in the scene's display
list, a Container's *own* depth (not its children's) decides whether it
draws in front of or behind sibling objects like the toolbar's background
rectangle, so `EditorUI` sets it explicitly above that background; leaving
it at the default depth was a real bug hit and fixed during this pass —
every icon silently rendered a layer behind the opaque toolbar and never
appeared, even though every other property (position, texture, visibility)
was correct.

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
gentle bob tween, a static overlap zone, one-per-type exactly like
Spawn/Goal/enemies already are — see `Palette.ts`'s docstring on that
scope cut), calling into `PlayerStats`, and reflecting the result as a HUD
string and a player tint. One deliberate asymmetry: **falling off the
bottom of the level stays unconditional instant-loss**, untouched by
Hearts or Shield — "bounce back and keep playing" fits absorbing a
hazard/enemy touch, but doesn't fit falling the way it fits an on-screen
hit, so `PlayScene.update`'s fall check is unchanged from before Items
existed.

**Parallax background & background scenes.** Every level renders two
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

*Which* scene renders is a level-level choice, deliberately independent
of the level's `theme` (grass/desert/castle only recolor the ground
tileset and the flat fallback color — see themes.ts) — a grass-themed
level can show the snowy-mountain scene, a castle level can show the
pirate cove, etc. `src/level/backgrounds.ts` is the pool (`BACKGROUND_SCENES`)
and `LevelData.background` is the optional field a level stores its
choice in (falling back to a best-fit-by-theme scene via
`resolveBackground` when unset or when it names a scene no longer in the
pool — see below — so levels saved before this feature existed, or
before the pool shrank, still render something sensible). The editor's
toolbar has a **"Background: ▶"** button (far right of the action-buttons
row) that cycles through the pool, live-updating the preview (destroying
and recreating the `ParallaxBackground` instance, since different scenes
have different layer textures) and persisting the choice to the level on
Save.

The pool has five scenes, and every one of them is a large, fixed
2048x476 image pair (matching `GAME_HEIGHT` exactly). Four are original
painted scenes from `scripts/generate-painted-backgrounds.py`
(`<scene>-far.png` opaque sky + sun/moon/stars/clouds, `<scene>-near.png`
transparent above a painted foreground), commissioned to match specific
reference images the project owner provided — recreated as original art
rather than reproduced pixel-for-pixel, since the script has no access to
the reference files themselves. In pool order (see below for why this
order): `green-valley` (sunny hills, sun, drifting clouds, a winding
path, grazing sheep, tree-lined slopes — the pool's default), `pirate-cove`
(a wrecked galleon under a crescent moon, tattered sails, a skull flag,
flanking palm trees), `overgrown-ruins` (moss-swallowed towers with
window grids and hanging vines, a stalled elevated train, a "?" block
easter egg), and `snowy-peaks` (a jagged snow-capped range, a
lava-glowing volcano with rising smoke, drifting clouds, foreground
pines). The fifth, `starfield` (the procedural castle night sky,
generated directly at 2048x476 by `drawStarfield` in
`src/assets/generateTextures.ts`), is the only one not painted — Pillow
was used for the four painted scenes the same way it was for the
ghost-pillow and dream-cloud portal art (vector shapes: gradients,
circles, seeded random placement), just applied to landscape scenes
instead of a character sprite.

The four painted scenes lead the pool (in front of `starfield`, which
used to be first) and `green-valley` is the overall default —
`DEFAULT_BY_THEME.grass` in backgrounds.ts points to it, and `"grass"` is
also `DEFAULT_THEME` (themes.ts), so it's what a brand-new level shows
before anyone touches the background picker.

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
place with a real mechanic, enemy, theme, or decoration, landing at 35
assets (~15.2%):
- **Snow theme** (`"snow"`, a 4th `LevelTheme`) — a real Kenney snow-cap
  ground tile, paired with `snowy-peaks` (see above) as its default
  background. Originally reachable only via the **Frozen Cavern** template
  (see below) — an in-editor theme *picker* came later (see the
  **"Theme: ▶"** entry below), so it's now selectable on any level.
- **Water** (`WATER_TILE`, a 5th ground-layer value alongside Ground/
  Brick/Bounce) — a hazard, not solid ground: excluded from
  `setCollisionByExclusion` so the player falls through it onto whatever
  *is* solid beneath, and `PlayScene.update` checks the tile under the
  player's feet every frame, calling the same `takeHit()` an enemy touch
  does (Hearts/Shield apply exactly the same way) — reuses the hit-points
  system entirely rather than inventing a second one. Real Kenney water
  art for grass/desert/snow; castle draws its own procedural **lava**
  frame instead (`drawLava` in `generateTextures.ts`) for the same
  never-mix-real-and-procedural-within-one-theme reason Brick/Bounce
  already follow there.
- **Golem** (`enemy-golem`) — a 4th enemy `EntityType`, added to
  `ENEMY_DEFS` exactly like Bat/Spike Crawler were (100% shared patrol/
  stomp code, just a texture and a `stompable` flag) — stompable, like
  the ghost and bat.
- **Key → Chest.** `item-key` is an ordinary Items-tab collectible
  (`PlayerStats.collectKey`, a plain `hasKey` boolean — only one Key can
  ever be held at a time, matching every entity type's one-per-level
  placement limit). **Chest** is its own Markers-tab entity: touching it
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

**Frozen Cavern** (snow theme, `template-frozen-cavern`) is the template
that showcases this pass: a Bush/Golem/Snowman/Key/Rocks run leading into
a 3-tile Water gap (comfortably jumpable at this game's normal ~6-tile
reach; walking through it instead costs a hit, same as any hazard) with a
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
  spring pad, and a real water-surface tile, used in every theme *except*
  castle (which keeps procedural versions of all three — Water's is lava,
  see "Second content pass" above — so a castle-themed level never mixes
  real and procedural art within itself — only *between* different
  levels' themes).
- **Bat, Spike Crawler, and Golem** — real character art from the pack (a
  winged creature, a red pointy-topped ground crawler, and a grey
  rock-monster face) in place of the Graphics-drawn placeholders an
  earlier pass used for the first two. The Bat's perched pose is also
  reused as the purely cosmetic "Sleeping Bat" Decor entity.
- **Coin, Heart, Speed Potion, Shield, and Key** — real item-tile art from
  the pack. **Feather** has no matching tile in the pack, so it's drawn
  procedurally (a simple two-chevron badge icon) alongside the rest of
  `generateTextures.ts`'s procedural art — the same "real art where it
  fits, procedural where it doesn't" split already established for the
  castle theme.
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
- The **wizard, ghost-pillow, and dream-cloud portal stay hand-drawn** —
  they're deliberate, already-validated custom art in a specific shared
  style (see below), not placeholders, so swapping the asset pack doesn't
  touch them.

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

**Tiles/markers/UI still procedural:** the castle theme (see above) and
pure UI chrome with no asset-pack equivalent — the eraser icon, the spawn
marker, the hover highlight, and the palette selection outline — are
still generated at runtime in `src/assets/generateTextures.ts`, same
technique as before.

*Palette/marker scaling:* entity art varies in native resolution (32px
icons vs. the larger ghost/portal illustrations), so both the editor
palette and the in-grid placement markers scale any texture down to fit
one tile via `src/editor/spriteFit.ts`, preserving aspect ratio. Gameplay
objects in `PlayScene` are unaffected and render at full native size.

## Project layout

See `docs/mario-maker-editor-implementation-plan.md` §4 for the intended
full layout. Implemented so far:

```
src/
├── main.ts                  Phaser game config + boot
├── scenes/
│   ├── BootScene.ts          loads wizard/Kenney/entity art + procedural textures, starts Menu
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
│   ├── EntityPlacer.ts       raw mutator for the entity layer
│   ├── EditorUI.ts           toolbar + palette rendering
│   ├── spriteFit.ts          scales any texture down to fit one tile
│   └── commands/
│       ├── Command.ts         execute()/undo() interface
│       ├── PaintTileCommand.ts
│       ├── PlaceEntityCommand.ts
│       ├── CompositeCommand.ts batches a whole drag into one undo step
│       └── HistoryStack.ts    undo/redo stacks (+ unit tests)
├── level/
│   ├── LevelSchema.ts        LevelData / LevelEntity types
│   ├── LevelSerializer.ts    serialize/deserialize/clone (+ unit tests)
│   ├── groundAutotile.ts     derives the grass-top/buried tile frame from neighbors (+ unit tests)
│   ├── themes.ts              theme color palettes + themed texture-key naming
│   ├── backgrounds.ts         the theme-independent background-scene pool + resolveBackground/nextBackgroundId
│   └── templateLevels.ts      6 hand-authored levels (TEMPLATE_LEVELS), served by TemplateBrowserScene
├── gameplay/
│   ├── PlayerController.ts   run/jump input handling (speed-multiplier aware; exports isJumpPressed for double-jump edge detection)
│   ├── PlayerStats.ts        pure score/hearts/buffs rules — collect*/registerHit/speedMultiplierAt/canDoubleJump (+ unit tests)
│   ├── ParallaxBackground.ts two-layer fake-parallax background (zoomed Image, clamped pan by player X, masked to level width), keyed by BackgroundSceneId
│   ├── wizardAnimation.ts    pose/texture swapping + physics-body re-centering
│   └── EnemyBehaviors.ts     shared patrol/bob + stomp-vs-hit rule for ghost/bat/spike crawler (+ unit tests)
├── persistence/
│   ├── StorageAdapter.ts       interface (list/save/load/remove)
│   ├── LocalStorageAdapter.ts
│   ├── WorldStorageAdapter.ts  same interface, one level down, for Worlds
│   └── LocalWorldStorageAdapter.ts
├── world/
│   └── WorldSchema.ts        WorldData: an ordered list of level ids + a name
├── config/
│   └── gameConfig.ts         tile size, grid dimensions, physics constants
└── assets/
    └── generateTextures.ts   procedural art still in use: castle theme + UI chrome

public/assets/
├── wizard/                   idle.png, walk1.png, walk2.png, jump.png, cast.png (hand-drawn)
├── entities/                 ghost-pillow.png, dream-portal.png (hand-drawn); bat.png, bat-perched.png, spike-crawler.png, golem.png, trophy.png, chest.png (Kenney)
├── tiles/                    tileset-{grass,desert,snow}.png, icon-*.png (Kenney, derived — see scripts/)
├── items/                    coin.png, heart.png, shield.png, speed.png, key.png (Kenney, derived — Feather is procedural, see generateTextures.ts)
├── decor/                    bush/tree/cactus/lamp/cloud/snowman/sprout/mushroom/rocks.png — purely cosmetic (Kenney, derived)
└── backgrounds/
    └── scenes/               every background-scene layer, all a fixed 2048x476: green-valley/pirate-cove/overgrown-ruins/snowy-peaks-{far,near}.png (original painted art, not Kenney-derived) — castle's "starfield" scene is procedural, generated at the same size

scripts/
├── prepare-kenney-assets.py       derives public/assets/{tiles,entities,items,decor}' Kenney-sourced PNGs (one-off, not part of the build)
└── generate-painted-backgrounds.py derives public/assets/backgrounds/scenes/'s original painted PNGs (one-off, not part of the build)
```
