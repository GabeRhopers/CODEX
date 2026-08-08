# Mario Maker–Style In-Browser Level Editor — Implementation Plan

Status: **Planning only.** No application code has been written yet. This
repository is currently empty except for this document. The plan below
translates the research findings (engine choice, references, persistence,
Phaser pitfalls) into a concrete, staged build plan: architecture, data
model, file layout, milestones, and open decisions that need answers before
Stage 1 coding starts.

---

## 1. Scope and goals

A browser-only, Mario-Maker-inspired level editor + player:

- A **palette** of tiles/entities the user selects a "brush" from.
- A **grid canvas** where the user paints/erases tiles and places
  entities (player spawn, enemies, coins, goal) by clicking/dragging.
- **Play mode**: run the level you just built with real platformer physics.
- **Save/load**: levels persist locally (and later, optionally, to a shared
  backend) as JSON.
- Crisp pixel art, keyboard+mouse first, touch as a stretch goal.

Non-goals for v1: multiplayer, level rating/comments, moderation, mobile app
wrapper, non-platformer game modes.

## 2. Confirmed technical decisions (from research doc)

| Decision | Choice | Why |
|---|---|---|
| Engine | Phaser 3 (MIT) | Native tilemap API, pointer input, no web-export friction (unlike Godot) |
| Rendering | `pixelArt: true`, WebGL with Canvas fallback | Crisp nearest-neighbor scaling |
| Tile painting | `createBlankLayer` + `putTileAtWorldXY`/`removeTileAtWorldXY` | Official, supported, free grid snapping |
| Art | Kenney CC0 Pixel Platformer packs | $0, no attribution required |
| Font | Press Start 2P (SIL OFL) via Phaser Bitmap Text | $0, pixel-perfect |
| Local persistence | localStorage → IndexedDB | $0, no account needed |
| Remote persistence (later) | Supabase (Postgres) as primary candidate | Free tier, relational, auth, RLS |
| Undo/redo | Command pattern, per-tile diff (not snapshots) | Memory-efficient, matches Phaser tile API |

These are treated as settled per the prior research; this plan does not
re-litigate them, only operationalizes them.

## 3. Open decisions to resolve before Stage 1 (need your input)

These materially change the file layout and early milestones, so I want a
decision before writing code:

1. **Build tooling**: plain ES modules + a static file server (zero build
   step, matches "assemble from official examples") vs. Vite (fast HMR,
   TS support, still trivially free/static-hostable). *Recommendation:
   Vite + TypeScript* — Phaser 3 ships types, and a typed tile/entity schema
   will pay for itself once undo/redo and save/load exist.
2. **Language**: TypeScript vs. JavaScript. Recommendation: TypeScript,
   given the data-driven level-JSON schema and command-pattern undo stack
   benefit a lot from static types.
3. **Palette placement**: Phaser-rendered in-canvas palette vs. HTML/DOM
   sidebar. Research leans toward Phaser-rendered for simplicity (one input
   system, no interact.js dependency) unless you want richer HTML UI
   (tooltips, scrollable categories) — that pushes toward a DOM sidebar +
   `worldToTileXY` handoff.
4. **Where does this live relative to `CODEX`?** The repo is currently
   empty. Confirm this repo *is* the game repo (not a monorepo subfolder),
   so the plan below assumes root-level `src/`, `public/`, etc.
5. **Hosting target for playtesting**: GitHub Pages / Netlify / Vercel free
   tier, or just local dev server for now? Affects whether Stage 1 needs a
   deploy workflow.

I'll proceed with the recommended options (Vite + TS, Phaser-rendered
palette) unless told otherwise, since they're reversible early and
consistent with the $0 stack goal.

## 4. Proposed repository layout

```
/
├── docs/
│   └── mario-maker-editor-implementation-plan.md   (this file)
├── public/
│   └── assets/
│       ├── tiles/            # Kenney pixel-platformer tileset(s)
│       ├── entities/         # player, enemies, coin, goal sprites
│       └── fonts/            # Press Start 2P (or Phaser bitmap font files)
├── src/
│   ├── main.ts                # Phaser game config, boots the game
│   ├── scenes/
│   │   ├── BootScene.ts        # minimal loader for the preloader's own assets
│   │   ├── PreloadScene.ts     # loads tileset, atlas, font, shows progress bar
│   │   ├── MenuScene.ts        # New Level / Load Level / Level Browser
│   │   ├── EditorScene.ts      # the palette + grid painting scene
│   │   ├── PlayScene.ts        # runs a level with platformer physics
│   │   └── LevelBrowserScene.ts# list saved levels, play/edit/delete
│   ├── editor/
│   │   ├── Palette.ts           # brush definitions, selection state
│   │   ├── TilePainter.ts       # pointer -> worldToTileXY -> put/removeTile
│   │   ├── EntityPlacer.ts      # object-layer placement (spawn/enemies/goal)
│   │   ├── commands/
│   │   │   ├── Command.ts        # execute()/undo() interface
│   │   │   ├── PaintTileCommand.ts
│   │   │   ├── PlaceEntityCommand.ts
│   │   │   └── HistoryStack.ts   # undo/redo stacks, batching for drag-paint
│   │   └── EditorUI.ts          # toolbar: save/load/play/undo/redo/clear
│   ├── level/
│   │   ├── LevelSchema.ts       # TS types + JSON schema/validator for level data
│   │   ├── LevelSerializer.ts   # Tilemap <-> LevelData JSON (de)serialization
│   │   └── sampleLevels.ts      # 1-2 built-in example levels
│   ├── gameplay/
│   │   ├── PlayerController.ts  # movement, jump, collision (platformer physics)
│   │   ├── EnemyBehaviors.ts    # basic patrol/stomp logic
│   │   └── WinLoseConditions.ts
│   ├── persistence/
│   │   ├── StorageAdapter.ts    # interface: list/save/load/delete(level)
│   │   ├── LocalStorageAdapter.ts
│   │   ├── IndexedDbAdapter.ts  # swapped in once level count/size grows
│   │   └── (future) SupabaseAdapter.ts
│   └── config/
│       └── gameConfig.ts        # Phaser.Game config: pixelArt, scale, physics
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

This mirrors the research doc's Stage 1→3 progression: everything under
`persistence/` is behind one interface so Stage 3's backend swap doesn't
touch editor/gameplay code.

## 5. Data model: the level format

This is the most important artifact to get right early, since editor,
player, save/load, and (later) sharing all depend on it.

```ts
interface LevelData {
  schemaVersion: 1;
  id: string;              // uuid, generated on first save
  name: string;
  author?: string;
  createdAt: string;       // ISO timestamp
  updatedAt: string;
  width: number;           // tiles
  height: number;          // tiles
  tileSize: 16 | 32;       // px, matches Kenney pack chosen
  tileset: string;         // key into loaded tileset atlas
  layers: {
    ground: number[][];    // tile index grid, -1 = empty (the paintable layer)
  };
  entities: LevelEntity[]; // object layer, not baked into the tile grid
}

interface LevelEntity {
  type: "player-spawn" | "enemy-goomba" | "coin" | "goal" | "moving-platform";
  x: number;   // tile coords
  y: number;
  props?: Record<string, unknown>; // e.g. patrol range, direction
}
```

Design notes:
- **Tile grid vs. entity layer split** mirrors Tiled's tile-layer /
  object-layer convention (per research §"Polish the palette UX"),
  keeping collidable terrain separate from spawnable/movable actors.
- `schemaVersion` from day one avoids a painful migration later when the
  format inevitably changes.
- Store **tile indices**, not command history, as the persisted format —
  undo/redo history is editor-session-only, never serialized.
- Bound `width`/`height` at creation time (research's perf finding: very
  large maps drag FPS on low-end hardware). Recommend an initial cap like
  60×34 tiles (roughly one to a few "screens"), configurable per level but
  clamped in the UI.

## 6. Editor interaction design

Painting loop (per research §3 and §6):
1. On `pointerdown`/`pointermove` while a brush is selected and the primary
   button is held: convert pointer position via
   `layer.worldToTileXY(pointer.worldX, pointer.worldY)`.
2. Only issue a paint command when the resulting tile coordinate **changes**
   from the last-painted cell this drag (debounce, per research's explicit
   pitfall #6c) — prevents redundant commands and history bloat.
3. Dispatch a `PaintTileCommand` (or `EraseTileCommand`) through
   `HistoryStack`, which calls `execute()` immediately and pushes to the
   undo stack; each command stores `{x, y, prevIndex, newIndex}` only.
4. Shift+click (or a dedicated eraser brush) removes a tile —
   `removeTileAtWorldXY`.
5. A hover-highlight overlay (a semi-transparent tile-sized rectangle that
   snaps to `tileToWorldXY`) gives Mario-Maker-style placement feedback,
   per `mikewesthad`'s tutorial pattern.
6. Multi-tile drag-fills (e.g. click-drag a rectangle of ground) should be
   wrapped as **one batched command** (a `CompositeCommand` holding N
   per-tile diffs) so a single undo reverts the whole drag, not one tile at
   a time — this is an explicit improvement over the naive per-tile
   command approach and should be designed in from the start rather than
   retrofitted.
7. Entity placement uses a separate click-to-place flow (not drag-paint):
   click places one entity of the selected type at the nearest tile
   center; clicking an existing entity again could cycle/delete it (TBD in
   Stage 2 UX pass).

Palette:
- Each brush = `{ kind: "tile" | "entity", id, tileIndex?, textureKey?, label }`.
- Selecting a brush highlights it in the palette and sets
  `EditorUI`'s "current brush" state, which `TilePainter`/`EntityPlacer`
  read.
- Keep exactly **one source of truth** for "current tool/brush" (a small
  state object or event emitter), not scattered booleans — directly
  addresses the research's noted Phaser `draggable` toggle-reliability
  pitfall (#6, last bullet) by not depending on toggling Phaser input
  flags for mode-switching.

## 7. Play mode

- `PlayScene` loads the same `LevelData` used by the editor, but builds a
  *real* collidable `TilemapLayer` (`setCollisionByExclusion([-1])` or an
  explicit collision index list) plus Arcade Physics bodies for the player
  and entities.
- Reuse `LevelSerializer` so editor and play mode never diverge on how
  tile indices map to world objects — this is the piece most likely to
  rot if duplicated.
- Minimum viable gameplay: run/jump/gravity, solid-ground collision,
  stomp-kills-enemy, coin pickup, goal-triggers-win, fall-off-bottom-loses.
- "Test Play" button inside the editor should push the *in-memory* current
  level state into `PlayScene` (no save required) so iterate-and-test is
  fast, with a "Back to Editor" that returns to the exact same editor
  state.

## 8. Persistence layering

`StorageAdapter` interface (list/save/load/delete/exists), so:
- Stage 1 ships `LocalStorageAdapter` (JSON.stringify per level, keyed by
  id, plus an index key listing all level ids/names for the browser
  screen).
- Swap to `IndexedDbAdapter` once either (a) level count gets unwieldy for
  a localStorage index scan, or (b) we want level thumbnails (canvas
  snapshot blobs) — IndexedDB handles binary data localStorage can't.
- Stage 3 backend (`SupabaseAdapter`) implements the same interface;
  editor/browser UI code should not need to change, only which adapter is
  constructed at startup (env-based or a settings toggle).
- Every adapter method should be `async` from day one even though
  `LocalStorageAdapter` is actually synchronous — avoids an interface
  break when IndexedDB/Supabase (genuinely async) are swapped in.

## 9. Milestones

**M0 — Project scaffold** *(half a day)*
- Vite + TS + Phaser installed, `pixelArt: true` config, empty scene that
  renders a placeholder sprite. Confirms the toolchain and pixel-art
  rendering work before any editor logic.
- Acceptance: `npm run dev` shows a crisp, non-blurry test sprite in
  browser.

**M1 — Static level render + play skeleton**
- Hand-authored `LevelData` JSON (no editor yet) loads into `PlayScene`.
- Player can run/jump/collide with tiles from Kenney tileset.
- Acceptance: a hardcoded test level is fully playable start-to-goal.

**M2 — Core paint loop**
- `EditorScene` with `createBlankLayer`, palette (2-3 tile types), pointer
  paint/erase with hover highlight, per the research's "Paint Tiles"/"Put
  Tiles" pattern.
- Acceptance: can paint and erase tiles smoothly; no visible input lag;
  debounced so drag-paint doesn't spam duplicate commands.

**M3 — Undo/redo**
- `Command`/`HistoryStack`/`CompositeCommand` implemented and wired to
  paint/erase and entity placement.
- Acceptance: Ctrl+Z/Ctrl+Y (or on-screen buttons) correctly undo/redo
  single paints, drag-fills, and entity placement, including across a
  save (history itself need not persist, but state must stay consistent).

**M4 — Entities + win/lose**
- Player-spawn, at least one enemy, coin, goal placeable from palette;
  `PlayScene` honors them (spawn point, stomp kill, pickup, win trigger).
- Acceptance: a level built entirely in the editor is playable and
  winnable/losable correctly.

**M5 — Save/load (local)**
- `LocalStorageAdapter`, `LevelBrowserScene` (list/play/edit/delete),
  "New Level" flow with width/height/name prompt.
- Acceptance: build a level, save, reload the page, load it from the
  browser screen, and it's pixel-identical to what was saved.

**M6 — Polish pass**
- Hover/selection feedback, toolbar icons, Press Start 2P UI text,
  keyboard shortcuts, basic sound effects (optional, still $0 via
  Kenney's CC0 audio packs), clamp/validate map size in the "New Level"
  form.
- Acceptance: a first-time user can create, save, and play a level
  without instructions.

**M7 (optional, later) — Sharing backend**
- Only start once M0–M6 are solid, per research's explicit
  recommendation. Introduce `SupabaseAdapter`, auth, and a public level
  browse/list view. Out of scope for the current plan; revisit with its
  own design pass when triggered.

Each milestone should land as its own PR/commit set so undo/redo, entity
system, and persistence can be reviewed independently.

## 10. Testing strategy

- **Unit tests** (Vitest, free, pairs naturally with Vite) for the parts
  that don't need a browser/canvas: `LevelSerializer` round-trip
  (LevelData → Tilemap → LevelData equality), `HistoryStack`
  execute/undo/redo semantics, `StorageAdapter` implementations against a
  shared contract test suite (so `LocalStorageAdapter` and future
  `IndexedDbAdapter`/`SupabaseAdapter` all satisfy identical behavior).
- **Manual/browser verification** for anything touching Phaser rendering,
  input, or physics (per this project's own operating norms: type checks
  don't verify feature correctness) — each milestone's acceptance
  criteria above should be manually re-verified in a real browser before
  marking the milestone done, not just covered by unit tests.
- No end-to-end/Playwright suite planned for v1; revisit if regressions in
  the paint/undo loop become frequent enough to justify the investment.

## 11. Risk register

| Risk | From research | Mitigation |
|---|---|---|
| Large maps tank FPS on low-end hardware | §6, explicitly reported Phaser forum issue | Clamp map size in "New Level" UI (M6); revisit chunking only if a real level exceeds the cap and still lags |
| TileSprite/pixel-art smoothing edge cases across Phaser versions | §4 | Pin an exact Phaser version early; visually verify `pixelArt`+`roundPixels` on the actual chosen tileset during M0, not later |
| `draggable` toggle unreliable mid-interaction in some 3.x versions | §6 | Avoid Phaser object-drag entirely for tile painting (use pointer+worldToTileXY instead, already the plan); manage editor mode via one explicit state object |
| No turnkey Phaser Mario Maker to fork — assembly risk | Caveats | Mitigated by treating official "Paint Tiles"/"Put Tiles" examples and `mikewesthad/phaser-3-tilemap-blog-posts` as required reading before M2, not optional inspiration |
| Free-tier backend terms change (Supabase 7-day pause, Firebase Blaze requirement) | Caveats | Deferred entirely — not relevant until M7; re-verify current terms at that time, don't build against today's numbers |
| Level JSON format changes after users have saved levels | Not covered by research | `schemaVersion` field from M1 onward; write a migration function stub even if it's a no-op initially |

## 12. Immediate next step

Once the open decisions in §3 are answered (or you confirm the
recommended defaults), Stage/M0 can start: scaffold the Vite+TS+Phaser
project, wire `pixelArt: true`, and commit a crisp-rendering smoke test as
the first real commit on this branch.
