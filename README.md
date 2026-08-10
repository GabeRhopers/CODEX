# Mario Maker–Style In-Browser Level Editor

A browser-only, Mario-Maker-inspired level editor and player built on
Phaser 3 (MIT). See `docs/mario-maker-editor-implementation-plan.md` for
the full architecture, data model, and milestone plan.

## Status

**MVP + M1 (undo/redo) + M2 content (enemy + real goal art, plus Brick/
Bounce/Spike Crawler/Bat) + M4 (home page / level browser) + 3 themed
sample levels + M8 (World Maker v1) done.** The game opens on a **Menu** (home page) instead of dropping
straight into the editor: **New Level**, **My Levels**, or **Worlds**,
each with a live status line. **My Levels** lists every saved level (not
just a single most-recent slot) with Edit and Delete per row — and on a
visitor's first-ever visit it's pre-seeded with 3 ready-to-play sample
levels, one per visual theme (see "Sample levels" under Art below).
**Worlds** chains any of your saved levels into a played-in-order course
— see "World Maker" under Controls, and plan doc §9.3 M8 for the v1
scope and what's deliberately deferred from it. Paint a level → Test
Play → win/lose → Save → Menu → My Levels → Edit round-trips identically,
every paint/erase/entity edit is undoable — a whole paint drag reverts as
one step, not tile by tile — and a level can include a patrolling
ghost-pillow enemy (stomp it from above to kill it, touch it any other
way and you lose) plus a dream-cloud portal as the goal. See the plan doc
§9.1 for the exact MVP scope and §9.2/§9.3 for what's still deliberately
deferred (more tile/enemy variety, scrolling, IndexedDB, backend sharing,
renaming levels/worlds from the browser).

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

- **Home page** (opens on load): **New Level** starts a fresh empty
  editor; **My Levels** opens the level browser; **Worlds** opens the
  world browser. Status lines show how many levels/Worlds you've saved.
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
- **Palette** (bottom-left, in the editor): click a brush — Ground,
  Brick, Bounce, Erase, Spawn, Goal (dream portal), Ghost, Spike, Bat —
  then click/drag on the grid above to paint or place. See "New blocks
  & enemies" under Art for what each one does.
- **Test Play** (button or Space): plays the level you've built. Requires
  a Spawn and a Goal to be placed first; the Ghost is optional.
- In Play mode: **arrow keys / WASD** to move, **Up/W/Space** to jump,
  **Esc** back to the editor, **R** to restart after winning/losing. Jump
  on top of the Ghost or Bat to squish it; touching either any other way,
  or touching a Spike Crawler at all (it can't be stomped), costs you the
  level. A Bounce block launches you noticeably higher than a normal
  jump; a Brick is just solid ground with a different look. On a
  touchscreen, semi-transparent **◀ ▶ ▲** buttons in the corners (see
  "Mobile/touch" below) do the same three things and the win/lose screen
  grows tappable **Restart**/**Next Level** buttons next to its
  keyboard-only hint text, since there's no R/N/Esc key to press.
- **Save**: persists the current level to `localStorage` under its own
  id — every level you save is kept (see My Levels), not just the most
  recent one.
- **Menu**: back to the home page.
- **Clear**: wipes the current grid and entities.
- **Undo** / **Redo** (buttons, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z): a whole
  paint drag or single entity placement/move undoes as one step. Clear
  resets the undo history (undoing past a full level swap doesn't make
  sense); so does loading a different level via My Levels → Edit.

## Mobile / touch

Fully playable on a phone, no separate build or mode — the same page
adapts. Three things make that true, all in `main.ts`/`index.html` unless
noted:

- **Scaling**: the game's internal resolution stays a fixed 920×448 (every
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

**Sample levels & themes.** A level carries a `theme` (`grass`, `desert`,
or `castle`) — purely a recolor of the ground tileset and the scene's
background, never gameplay data, so TilePainter/groundAutotile stay
theme-agnostic and any level can be reskinned by changing one field. New
levels default to `grass` (unchanged from before themes existed); old
saved levels with no `theme` field are treated as `grass` on load (see
`LevelSerializer.deserializeLevel`). `src/level/themes.ts` holds the
color palette per theme and the themed texture-key naming; the palette's
Ground brush icon and the editor/play tileset both follow the current
level's theme automatically. `src/level/sampleLevels.ts` hand-authors one
short, beatable level per theme — Sunny Hills (grass), Desert Canyon
(desert), Castle Ascent (castle, a vertical staircase climb) — each with
gaps and steps sized well within the player's jump range, and seeds all
three into My Levels on a visitor's first-ever visit via a one-time
`localStorage` flag (deleting a sample afterward doesn't bring it back).

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
- The **wizard, ghost-pillow, and dream-cloud portal stay hand-drawn** —
  they're deliberate, already-validated custom art in a specific shared
  style (see below), not placeholders, so swapping the asset pack doesn't
  touch them.

The pack's tiles are natively 18px (24px for characters), not this
project's 32px (40px for entities), so `scripts/prepare-kenney-assets.py`
(run once, offline — not part of the build) nearest-neighbor-upscales and
composites exactly the pieces used above into the small PNGs actually
committed under `public/assets/tiles/` and `public/assets/entities/`
(loaded in `BootScene.preload`) — the full third-party pack itself isn't
committed to the repo, only these derived outputs. See that script's
docstring for the exact source tile indices and how to regenerate with
different ones.

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
│   ├── MenuScene.ts          home page: New Level / My Levels / Worlds
│   ├── LevelBrowserScene.ts  lists saved levels with Edit/Delete
│   ├── EditorScene.ts        palette + grid painting + save/test-play
│   ├── PlayScene.ts          runs a level with Arcade Physics (optionally chained via a World)
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
│   └── sampleLevels.ts        3 hand-authored levels (one per theme) + first-visit seeding
├── gameplay/
│   ├── PlayerController.ts   run/jump input handling
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
└── tiles/                    tileset-grass.png, tileset-desert.png, icon-*.png (Kenney, derived — see scripts/)

scripts/
└── prepare-kenney-assets.py  derives public/assets/{tiles,entities}' Kenney-sourced PNGs (one-off, not part of the build)
```
