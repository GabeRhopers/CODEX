# Mario Maker–Style In-Browser Level Editor

A browser-only, Mario-Maker-inspired level editor and player built on
Phaser 3 (MIT). See `docs/mario-maker-editor-implementation-plan.md` for
the full architecture, data model, and milestone plan.

## Status

**MVP + M1 (undo/redo) + first M2 content (enemy + real goal art) + M4
(home page / level browser) done.** The game now opens on a **Menu**
(home page) instead of dropping straight into the editor: New Level or
My Levels, with a live count of saved levels. **My Levels** lists every
saved level (not just a single most-recent slot) with Edit and Delete per
row. Paint a level → Test Play → win/lose → Save → Menu → My Levels →
Edit round-trips identically, every paint/erase/entity edit is undoable —
a whole paint drag reverts as one step, not tile by tile — and a level
can include a patrolling ghost-pillow enemy (stomp it from above to kill
it, touch it any other way and you lose) plus a dream-cloud portal as the
goal. See the plan doc §9.1 for the exact MVP scope and §9.2/§9.3 for
what's still deliberately deferred (more tile/enemy variety, scrolling,
IndexedDB, backend sharing, renaming levels from the browser).

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
  editor; **My Levels** opens the level browser. A status line shows how
  many levels you've saved.
- **My Levels**: every saved level as a row (name + last-updated time)
  with **Edit** (opens it in the editor) and **Delete**. **New Level**
  and **← Back** (to the home page) are also here.
- **Palette** (bottom-left, in the editor): click a brush — Ground,
  Erase, Spawn, Goal (dream portal), Ghost (enemy) — then click/drag on
  the grid above to paint or place.
- **Test Play** (button or Space): plays the level you've built. Requires
  a Spawn and a Goal to be placed first; the Ghost is optional.
- In Play mode: **arrow keys / WASD** to move, **Up/W/Space** to jump,
  **Esc** back to the editor, **R** to restart after winning/losing. Jump
  on top of the ghost to squish it; touching it any other way costs you
  the level.
- **Save**: persists the current level to `localStorage` under its own
  id — every level you save is kept (see My Levels), not just the most
  recent one.
- **Menu**: back to the home page.
- **Clear**: wipes the current grid and entities.
- **Undo** / **Redo** (buttons, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z): a whole
  paint drag or single entity placement/move undoes as one step. Clear
  resets the undo history (undoing past a full level swap doesn't make
  sense); so does loading a different level via My Levels → Edit.

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

**Tiles/markers/UI:** generated procedurally in
`src/assets/generateTextures.ts` rather than loaded from Kenney's CC0
packs, because this project's build sandbox only allows outbound network
access to the npm registry and github.com — `kenney.nl`, OpenGameArt,
unpkg, and jsdelivr are all blocked here. The plan doc's asset-sourcing
recommendation (Kenney CC0 pixel-platformer packs) still stands for these;
swapping real Kenney PNGs in is a change to that one file's
texture-loading calls, not an architecture change.

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
│   ├── BootScene.ts          loads wizard/entity art + procedural textures, starts Menu
│   ├── MenuScene.ts          home page: New Level / My Levels
│   ├── LevelBrowserScene.ts  lists saved levels with Edit/Delete
│   ├── EditorScene.ts        palette + grid painting + save/test-play
│   └── PlayScene.ts          runs a level with Arcade Physics
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
├── gameplay/
│   ├── PlayerController.ts   run/jump input handling
│   ├── wizardAnimation.ts    pose/texture swapping + physics-body re-centering
│   └── EnemyBehaviors.ts     ghost patrol/bob + stomp-vs-hit rule (+ unit tests)
├── persistence/
│   ├── StorageAdapter.ts     interface (list/save/load/remove)
│   └── LocalStorageAdapter.ts
├── config/
│   └── gameConfig.ts         tile size, grid dimensions, physics constants
└── assets/
    └── generateTextures.ts   procedural placeholder pixel art (tiles/markers/UI)

public/assets/
├── wizard/                   idle.png, walk1.png, walk2.png, jump.png, cast.png
└── entities/                 ghost-pillow.png, dream-portal.png
```
