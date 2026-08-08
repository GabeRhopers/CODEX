# Mario Maker–Style In-Browser Level Editor

A browser-only, Mario-Maker-inspired level editor and player built on
Phaser 3 (MIT). See `docs/mario-maker-editor-implementation-plan.md` for
the full architecture, data model, and milestone plan.

## Status

**MVP complete.** Paint a level → Test Play → win/lose → Save → reload →
Load round-trips identically. See the plan doc §9.1 for the exact scope
of the MVP and §9.2 for what's deliberately deferred (undo/redo, tile/
enemy variety, level browser, scrolling, IndexedDB, backend sharing).

## Getting started

```sh
npm install
npm run dev       # start the dev server (Vite)
npm run build     # type-check + production build to dist/
npm test          # run the unit test suite (Vitest)
npm run typecheck # type-check only, no build
```

Open the dev server URL in a browser. Controls:

- **Palette** (bottom-left): click a brush — Ground, Erase, Spawn, Goal —
  then click/drag on the grid above to paint.
- **Test Play** (button or Space): plays the level you've built. Requires
  a Spawn and a Goal to be placed first.
- In Play mode: **arrow keys / WASD** to move, **Up/W/Space** to jump,
  **Esc** back to the editor, **R** to restart after winning/losing.
- **Save** / **Load**: persists to `localStorage` (single most-recent
  slot for now — a multi-level browser is a planned post-MVP milestone).
- **Clear**: wipes the current grid and entities.

## Placeholder art

Tile/character/marker art is generated procedurally in
`src/assets/generateTextures.ts` rather than loaded from Kenney's CC0
packs, because this project's build sandbox only allows outbound network
access to the npm registry and github.com — `kenney.nl`, OpenGameArt,
unpkg, and jsdelivr are all blocked here. The plan doc's asset-sourcing
recommendation (Kenney CC0 pixel-platformer packs) still stands; swapping
real Kenney PNGs in is a change to that one file's texture-loading calls,
not an architecture change.

## Project layout

See `docs/mario-maker-editor-implementation-plan.md` §4 for the intended
full layout. Implemented so far:

```
src/
├── main.ts                  Phaser game config + boot
├── scenes/
│   ├── BootScene.ts          generates placeholder textures, starts Editor
│   ├── EditorScene.ts        palette + grid painting + save/load/test-play
│   └── PlayScene.ts          runs a level with Arcade Physics
├── editor/
│   ├── Palette.ts            data-driven brush definitions
│   ├── TilePainter.ts        single mutator for the ground tile layer
│   ├── EntityPlacer.ts       single mutator for the entity layer
│   └── EditorUI.ts           toolbar + palette rendering
├── level/
│   ├── LevelSchema.ts        LevelData / LevelEntity types
│   ├── LevelSerializer.ts    serialize/deserialize/clone (+ unit tests)
├── gameplay/
│   └── PlayerController.ts   run/jump input handling
├── persistence/
│   ├── StorageAdapter.ts     interface (list/save/load/remove)
│   └── LocalStorageAdapter.ts
├── config/
│   └── gameConfig.ts         tile size, grid dimensions, physics constants
└── assets/
    └── generateTextures.ts   procedural placeholder pixel art
```
