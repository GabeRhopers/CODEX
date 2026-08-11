# Mario Maker–Style In-Browser Level Editor

A browser-only, Mario-Maker-inspired level editor and player built on
Phaser 3 (MIT). See `docs/mario-maker-editor-implementation-plan.md` for
the full architecture, data model, and milestone plan.

## Status

**MVP + M1 (undo/redo) + M2 content (enemy + real goal art, plus Brick/
Bounce/Spike Crawler/Bat, plus a full Items set — Coin/Heart/Speed
Potion/Feather/Shield, all with real gameplay effects, resolving the M2
hit-points open question — see "Items & hit-points" under Art) + a
tabbed, categorized palette (Blocks/Markers/Enemies/Items — replacing the
single ever-widening icon row) + a parallax scrolling background with a
6-scene picker independent of level theme, including 3 original painted
scenes (see "Parallax background & background scenes" under Art) + M4
(home page / level browser) + 5 template levels + M8 (World Maker v1)
done.** The game opens on a **Menu** (home
page) — a 2x2 card grid, each with a live status line, covering
everything there is to do: **New Level** (blank grid), **Templates**
(5 pre-built levels to play or remix — see below), **My Levels** (your
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
- **Templates**: 5 pre-built levels, one per theme plus two showcasing
  Brick/Bounce/Bat/Spike Crawler together (see "Templates & themes" under
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
  Markers, Enemies, Items — switches which row of brushes shows below it;
  click a brush, then click/drag on the grid above to paint or place. See
  "Categorized palette" under Art for why it's tabbed and "New blocks &
  enemies" / "Items & hit-points" for what each brush does. Items are
  ordinary brushes like anything else in the palette — not limited to any
  specific template — so any level, new or existing, can place any of the
  5 items.
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
- **Background: ▶**: cycles the level's parallax background scene through
  the pool of 6 (independent of the level's theme — see "Parallax
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
  `GAME_WIDTH`×`GAME_HEIGHT` (1180×476 — see `config/gameConfig.ts`; every
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

`src/level/templateLevels.ts` hand-authors 5 beatable levels, exported as
`TEMPLATE_LEVELS` and served by `TemplateBrowserScene` — always
available, never written to `localStorage` (a change from an earlier
version of this project, which copied them into My Levels on first
visit): Sunny Hills (grass), Desert Canyon (desert), and Castle Ascent
(castle, a vertical staircase climb) each keep gaps/steps sized well
within the player's normal jump; **Spring Meadow** (grass) and **Crate
Canyon** (desert) additionally showcase Brick, Bounce, Bat, and Spike
Crawler together. Both put the goal on a platform reachable only by
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
  `groundFrameAt` in `groundAutotile.ts`).
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
to 14 and climbing. `src/editor/Palette.ts` now tags every brush with a
`BrushCategory` (`blocks` / `markers` / `enemies` / `items`); `EditorUI`
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
background layers behind it — a slow-scrolling far layer and a
faster-scrolling near layer — for a sense of depth as the player moves.
This project's levels are still single-screen (no camera panning/
scrolling — that's deferred to plan doc milestone M3), so there's no
camera to actually pan; `src/gameplay/ParallaxBackground.ts` fakes the
effect instead by offsetting each background `TileSprite`'s
`tilePositionX` by the player's X position times a small per-layer factor
every frame, called from `PlayScene.update`. `EditorScene` gets the same
layers too, but static (no player position to drive an offset while
editing) — just a backdrop at rest.

*Which* scene renders is a level-level choice, deliberately independent
of the level's `theme` (grass/desert/castle only recolor the ground
tileset and the flat fallback color — see themes.ts) — a grass-themed
level can show the snowy-mountain scene, a castle level can show the
pirate cove, etc. `src/level/backgrounds.ts` is the pool (`BACKGROUND_SCENES`)
and `LevelData.background` is the optional field a level stores its
choice in (falling back to the theme's traditionally-matching scene via
`resolveBackground` when unset, so levels saved before this feature
existed — and the hand-authored templates, which never set it — render
exactly as before). The editor's toolbar has a **"Background: ▶"** button
(far right of the action-buttons row) that cycles through the pool,
live-updating the preview (destroying and recreating the
`ParallaxBackground` instance, since different scenes have different
layer textures) and persisting the choice to the level on Save.

The pool has six scenes. Three reuse pre-existing art as-is: `grass-sky`/
`desert-sky` (real Kenney sky tiles) and `starfield` (the procedural
castle night sky). The other three — `pirate-cove`, `overgrown-ruins`,
`snowy-peaks` — are original painted scenes added specifically to replace
an early version of this feature, which reused the small 24px Kenney sky
tiles at 4x scale (96px effective tile width): fine as a *themed* sky, but
its repeat became obviously visible once players moved more than a
screen-width or two, which is exactly what prompted this rework. Each new
scene is a wide (2048px — roughly 4x the game's own canvas width) pair of
PNGs (`<scene>-far.png` opaque sky+stars+moon, `<scene>-near.png`
transparent above a hand-drawn silhouette — rolling waves + distant ship
masts for the cove, a jagged building skyline with rooftop greenery for
the ruins, a snow-capped mountain ridge with one small volcano accent for
the peaks) generated by `scripts/generate-painted-backgrounds.py` — see
that script's docstring for the exact math on why 2048px means the tile
boundary is never actually seen at today's level-size cap. Not derived
from the Kenney pack (original art, unlike everything in the next
section) — Pillow was used the same way it was for the ghost-pillow and
dream-cloud portal art (vector shapes: gradients, circles, seeded random
silhouettes), just applied to landscape scenes instead of a character
sprite.

**Real art: Kenney's "Pixel Platformer" (CC0).** The plan doc always
recommended Kenney's CC0 packs for this, but the build sandbox's network
proxy can't *fetch* them (only npm/github.com are reachable) — so
everything above shipped as procedural placeholder art instead, generated
at runtime with Phaser's Graphics API. That changed once the user
supplied the actual pack as a direct upload, sidestepping the network
restriction entirely. It now provides:
- **Grass and desert ground tiles** — real grass-cap and sand-cap dirt,
  replacing their procedural equivalents. **Castle keeps its original
  procedural grey stone** — the pack is a nature/outdoor set with no
  stone/castle-style tile, so there's nothing to swap it for; this is a
  deliberate, permanent split, not a TODO.
- **Brick and Bounce** — a real wooden crate and a real compressed spring
  pad, used in every theme *except* castle (which keeps procedural
  versions of these too, so a castle-themed level never mixes real and
  procedural art within itself — only *between* different levels' themes).
- **Bat and Spike Crawler** — real character art from the pack (a winged
  creature and a red pointy-topped ground crawler) in place of the
  Graphics-drawn placeholders from the previous pass.
- **Coin, Heart, Speed Potion, and Shield** — real item-tile art from the
  pack. **Feather** has no matching tile in the pack, so it's drawn
  procedurally (a simple two-chevron badge icon) alongside the rest of
  `generateTextures.ts`'s procedural art — the same "real art where it
  fits, procedural where it doesn't" split already established for the
  castle theme.
- **The `grass-sky`/`desert-sky` background-scene layers** — real sky-tile
  art from the pack's background sheet (a plain-sky "far" tile and a
  hills/trees or dunes/cactus-silhouette "near" tile); `starfield` (the
  castle-matching scene) stays procedural for the same no-matching-art
  reason as the castle ground tileset. The other three scenes in the pool
  (`pirate-cove`/`overgrown-ruins`/`snowy-peaks`) are original painted art,
  not from this pack — see "Parallax background & background scenes" above.
- The **wizard, ghost-pillow, and dream-cloud portal stay hand-drawn** —
  they're deliberate, already-validated custom art in a specific shared
  style (see below), not placeholders, so swapping the asset pack doesn't
  touch them.

The pack's tiles are natively 18px (24px for characters, 24px for
background tiles), not this project's 32px (40px for entities), so
`scripts/prepare-kenney-assets.py` (run once, offline — not part of the
build) nearest-neighbor-upscales and composites exactly the pieces used
above into the small PNGs actually committed under `public/assets/tiles/`,
`public/assets/entities/`, `public/assets/items/`, and
`public/assets/backgrounds/` (loaded in `BootScene.preload`) — the full
third-party pack itself isn't committed to the repo, only these derived
outputs. Background tiles are left at their native 24px (Phaser's
`TileSprite.setTileScale` scales them at render time instead) since,
unlike the other pieces, they're tiled rather than shown at a single fixed
size. See that script's docstring for the exact source tile indices and
how to regenerate with different ones.

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
│   └── templateLevels.ts      5 hand-authored levels (TEMPLATE_LEVELS), served by TemplateBrowserScene
├── gameplay/
│   ├── PlayerController.ts   run/jump input handling (speed-multiplier aware; exports isJumpPressed for double-jump edge detection)
│   ├── PlayerStats.ts        pure score/hearts/buffs rules — collect*/registerHit/speedMultiplierAt/canDoubleJump (+ unit tests)
│   ├── ParallaxBackground.ts two-layer fake-parallax background (TileSprite offset by player X), keyed by BackgroundSceneId
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
├── entities/                 ghost-pillow.png, dream-portal.png (hand-drawn); bat.png, spike-crawler.png (Kenney)
├── tiles/                    tileset-grass.png, tileset-desert.png, icon-*.png (Kenney, derived — see scripts/)
├── items/                    coin.png, heart.png, shield.png, speed.png (Kenney, derived — Feather is procedural, see generateTextures.ts)
└── backgrounds/
    ├── grass-{far,near}.png, desert-{far,near}.png   (Kenney, derived — castle's "starfield" scene is procedural)
    └── scenes/               pirate-cove-{far,near}.png, overgrown-ruins-{far,near}.png, snowy-peaks-{far,near}.png (original painted art)

scripts/
├── prepare-kenney-assets.py       derives public/assets/{tiles,entities,items,backgrounds}' Kenney-sourced PNGs (one-off, not part of the build)
└── generate-painted-backgrounds.py derives public/assets/backgrounds/scenes/'s original painted PNGs (one-off, not part of the build)
```
