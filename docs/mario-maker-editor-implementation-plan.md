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

**Resolved (2026-08-08):** proceeding with the recommended defaults —
Vite + TypeScript, Phaser-rendered in-canvas palette, this repo is the
game repo (root-level `src/`/`public/`), local dev server for now
(`npm run dev`; a static-host deploy step, e.g. GitHub Pages, can be
added later at zero cost whenever playtesting-by-URL is needed).

**Asset-sourcing deviation:** the build sandbox's network proxy only
allows the npm registry and `github.com`/`raw.githubusercontent.com` —
`kenney.nl`, OpenGameArt, unpkg, and jsdelivr all return 403. Since Kenney
assets can't be fetched from here, the MVP uses **simple placeholder
pixel art generated procedurally in code** (solid-color tiles/sprites
drawn via Phaser `Graphics.generateTexture`, rendered with `pixelArt:
true` so the crisp-rendering risk is still validated). This is a
zero-licensing-risk, zero-network-dependency substitute for Stage 1 only;
swapping in real Kenney CC0 pixel-platformer PNGs later is a drop-in
change to `PreloadScene`'s asset keys, not an architecture change.

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

*Note: this describes the full target design, including undo/redo and
composite commands. The MVP (§9.1) implements steps 1, 2, 4, and 5 below
without the `HistoryStack`/`CompositeCommand` machinery — see §9.2 for
why that's a safe cut.*

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

## 9. Milestones — MVP first, then additive layers

The guiding principle: build the **shortest possible path that closes the
full loop** — paint → play → win/lose → save → reload → load — before
adding breadth (more tiles, enemies, undo, multi-level browsing, polish).
A horizontal build order (perfect the palette, *then* perfect undo, *then*
add play mode) risks weeks of work with nothing demoable and no proof the
core pieces fit together. A vertical slice retires the biggest technical
risks first (does Phaser tilemap collision actually feel good? does the
paint loop feel right? does editor state survive a save/reload round trip?)
while every piece cut from v1 is cut *because* the seam it needs already
exists, not because it was forgotten.

### 9.1 The MVP: a single walking skeleton

Ship this as one cohesive milestone, built in the numbered order below —
each step ends in a state you can run in a browser and show someone,
which is itself the point: it forces the highest-risk unknown in that
step to surface immediately, not after several more steps are stacked on
top of an unverified assumption.

1. **Scaffold + prove crisp rendering.** Vite + TS + Phaser, `pixelArt:
   true`, load the *real* Kenney tile/player/goal sprites (not gray boxes
   — asset selection is cheap and this retires the "does pixel art
   actually render crisp in this exact Phaser version" risk from the
   research doc immediately, rather than discovering a TileSprite
   smoothing edge case during the polish pass). One scene renders a
   player sprite standing on a row of ground tiles.
   *Verify:* sprite is pixel-sharp at the target zoom, no blur/shimmer.

2. **Static level → playable, one screen, no editor.** Hand-write a
   single small `LevelData` JSON (ground row, a gap, a player-spawn
   entity, a goal entity) and load it into `PlayScene`: Arcade Physics
   player with run/jump/gravity, tile collision via
   `setCollisionByExclusion`, camera fixed (no scrolling — level is
   capped to one screen, e.g. ~20×12 tiles), touching the goal shows "You
   Win," falling off the bottom shows "You Lose" + restart.
   *Verify:* the hardcoded level is fully playable start-to-finish. This
   is the single highest-risk step (physics/collision correctness) and
   it's proven *before* any editor UI exists, so editor bugs and physics
   bugs are never debugged tangled together.

3. **Paint loop, one tile brush.** `EditorScene` with `createBlankLayer`,
   exactly **one** ground-tile brush + an eraser, pointer paint/erase via
   `worldToTileXY`/`putTileAtWorldXY`, debounced on tile-coordinate
   change, plus the hover-highlight overlay (cheap, and it's the single
   biggest "does this feel like Mario Maker" signal, so it stays in
   scope even though everything else is being cut).
   *Rule that pays for itself later:* route every grid mutation through
   one function (e.g. `TilePainter.paint(x, y, tileIndex)`), never
   inline in the pointer handler — undo/redo (§9.2) wraps this function
   later without touching call sites.
   *Verify:* paint/erase feels smooth and responsive with no input lag.

4. **Spawn/goal placement, palette made data-driven.** Add two more
   palette entries — player-spawn and goal — as **data** (an array of
   brush definitions), not as hardcoded if/else branches, and route
   placement through one `EntityPlacer.place(type, x, y)` function
   (same rule as step 3, applied to the entity list). Placing writes into
   `LevelData.entities`, exactly the shape `PlayScene` already consumes
   from step 2.
   *Verify:* palette now has 3 buttons (ground, spawn, goal); clicking
   each does the right thing.

5. **Close the loop: Test Play.** A "Test Play" button hands the
   in-memory editor state (already `LevelData`-shaped, via the shared
   `LevelSerializer` — write it now rather than duplicating
   editor↔tilemap conversion ad hoc) to `PlayScene`, with "Back to
   Editor" returning to the same editor state.
   *Verify:* paint a tiny level from scratch, hit Play, actually run,
   jump, and win. This is the moment it becomes *the product* rather
   than two disconnected halves.

6. **Persist it.** `StorageAdapter` interface + `LocalStorageAdapter`
   (async methods even though localStorage itself is sync — see §8), one
   Save button (single fixed slot is fine — no browser/list UI yet), one
   Load action.
   *Verify:* build a level, Save, reload the browser tab, Load, and it's
   pixel-identical to what was saved. This is the proof that editor,
   `LevelSerializer`, and persistence are actually one consistent
   pipeline, not three places that happen to agree today.

**MVP acceptance (the demo):** open the page with nothing saved, paint a
short level (ground + gap + spawn + goal) from an empty grid, hit Test
Play, run and jump across the gap, touch the goal and see "You Win,"
return to the editor, Save, reload the tab, Load, and play it again with
identical results. If that sequence works end-to-end, the MVP is done —
everything after this is additive, not foundational.

### 9.2 What's deliberately cut from the MVP, and why it's safe to cut

Each cut below is safe specifically because the seam it would need
already exists from the steps above — nothing here requires reopening
step 1-6 code, only extending it:

| Cut from MVP | Why it's safe to defer |
|---|---|
| Undo/redo | Steps 3-4 already funnel every mutation through one function per subsystem; wrapping those functions in `Command` objects (§6) is additive, not a rewrite |
| Tile/entity variety (decorative tiles, enemies, coins, moving platforms) | Palette is already data (step 4) and `LevelEntity.type` is already an open string — new brushes are new array entries plus a new `case` in `PlayScene`'s entity-spawn switch |
| Multiple saved levels / level browser | `StorageAdapter` (step 6) already supports list/save/load/delete by id; only the UI for many levels is missing |
| Camera scrolling / levels larger than one screen | `PlayScene`'s camera setup (step 2) is isolated from tilemap/serializer code; `camera.startFollow` plus lifting the size cap touches nothing else |
| IndexedDB / backend persistence | Behind the same `StorageAdapter` interface (step 6) by construction |
| Composite/batched undo commands for drag-fills | Moot until undo exists; the painter already applies one tile at a time so batching is a `HistoryStack` concern, not a `TilePainter` one |
| Sound, animations, keyboard shortcuts, toolbar polish | Additive UI/UX, touches no data model or architecture |

### 9.3 Post-MVP milestones (additive, any order after M-MVP)

**M1 — Undo/redo.** `Command`/`HistoryStack`/`CompositeCommand`, wired
onto the mutator functions from MVP steps 3-4. *Acceptance:* Ctrl+Z/
Ctrl+Y correctly undo/redo single paints, drag-fills (as one batched
command), and entity placement.

**M2 — Content breadth.** More ground/decoration tile types, at least
one enemy (patrol + stomp-kill) and coins, all as new palette/entity
entries. *Acceptance:* a level using every brush type is playable and
scores/behaves correctly.

**M2 candidate content list (2026-08-10; Brick/Bounce/Spike Crawler/Bat
built the same day, the rest not yet).** Five each across four
categories, picked to fit the existing dream/wizard aesthetic and stay
buildable on top of the current architecture — the ground grid, the
open-string `EntityType`, and `PlayScene`'s entity-spawn switch (see the
M2 cut note in §9.2). Each entry notes what it needs beyond "new palette
entry + new switch case," since a few require genuinely new engine
concepts, not just content:

*Blocks* (new ground-tile variants; today there's `GROUND_TILE`, `BRICK_TILE`, `BOUNCE_TILE`):
1. **Brick** ✅ built — a second solid tile, visually distinct from dirt/grass. `BRICK_TILE`/`GROUND_FRAME_BRICK`; renders as a fixed frame regardless of neighbors, unlike ground's autotiling.
2. **Cloud Platform** — stand on top, jump up through from below, walk off the sides. Needs one-way collision (Arcade Physics `checkCollision.up`-only, or a `collider` `process` callback keyed off the player's velocity/position), not just a new texture.
3. **Ice** — low-friction surface; player keeps sliding after releasing left/right. Needs a per-tile friction/drag value threaded into `PlayerController`, which currently has none.
4. **Crumbling Block** — solid until stood on, then shakes and disappears ~1s later. Needs per-instance timer state, so it can't be pure tile-grid data the way ground is — closer to a lightweight entity that happens to render/collide like a tile.
5. **Bounce Block** ✅ built — spring pad; contact overrides the player's Y velocity upward, higher than a normal jump. `BOUNCE_TILE`/`GROUND_FRAME_BOUNCE`; `PlayScene.onGroundCollide` checks the collided tile's index and `body.blocked.down` (so it only fires landing on the top face, not a side bump).

*Items* (collectibles; there are none today — this category needs a scoring/inventory concept the game currently has zero of):
1. **Coin** — the baseline collectible; needs a running score display and a "collected" flag per placed instance so it doesn't respawn on revisit within a play session.
2. **Extra Heart** — grants one extra hit before losing. Needs a hit-points concept to replace the current instant-lose-on-any-bad-contact rule (a real design decision, not just an asset — see open question below).
3. **Speed Potion** — temporary move-speed multiplier with a visible timer/flashing-player cue.
4. **Feather (double jump)** — grants a second mid-air jump; either for the rest of the level (permanent pickup) or on a timer, needs deciding.
5. **Shield Bubble** — temporary invincibility (absorbs one hit or lasts N seconds); same hit-points prerequisite as Extra Heart.

*Enemies* (new `EntityType`s alongside `enemy-ghost`; this category is the cheapest to add — the pattern already exists end to end):
1. **Spike Crawler** ✅ built — patrols like the ghost, but never stompable (`stompable: false` in `PlayScene`'s `ENEMY_DEFS`) — any contact costs the player regardless of direction.
2. **Bat** ✅ built — flies the exact same patrol+bob path as the ghost (100% shared code — `EnemyBehaviors.createPatrolEnemy` was generalized to take a texture key); same stomp-from-above rule as the ghost.
3. **Totem Shooter** — stationary, periodically fires a slow projectile; first enemy needing its own projectile entity and a lifetime/cleanup.
4. **Hopper** — bounces in place or toward the player on a timer; stomp only counts while it's on the ground (mid-air stomp shouldn't count), a variant of the existing `isStompFromAbove` check.
5. **Big Ghost (mini-boss)** — larger sprite, takes 3 stomps instead of 1; needs a hit-counter on the enemy itself (currently enemies are one-hit-and-`destroy()`).

*Hazards & special tiles* (obstacles that aren't "enemies" and level-building tools beyond plain terrain):
1. **Spike Pit** — instant-lose ground tile, visually distinct (no stomping — touching it from any direction loses).
2. **Saw Blade** — patrols a fixed track (like the ghost, but no gravity/bob) and always costs a hit/loss on touch.
3. **Moving Platform** — patrols horizontally or vertically and carries the player standing on it (the player's X needs to inherit the platform's delta while grounded on it — Arcade Physics doesn't do this for free the way it does static tile collision).
4. **Checkpoint Flag** — mid-level respawn point; only meaningful once losing doesn't always mean "back to the very start," which ties into the hit-points question above.
5. **One-Way Warp** — touching it teleports the player to a second, paired warp tile elsewhere in the level; needs a way to link two placed entities to each other, which today's flat `entities: LevelEntity[]` array (no per-entity id/reference field) doesn't support yet.

**Open design question before starting any of Items/Hazards' checkpoint/
warp entries:** the game is currently strictly binary — any bad contact
or falling off is an immediate loss, restart the whole level. Hearts,
shields, and checkpoints all assume some form of "you can take a hit and
keep going," which is a real gameplay-rules decision, not just content,
and is worth deciding deliberately rather than backing into by shipping
Extra Heart first. *Recommendation:* the remaining no-new-rules half of
Blocks and Enemies (Cloud Platform, Ice, Crumbling Block, Totem Shooter,
Hopper, Big Ghost) is still fair game to build incrementally the same
way Brick/Bounce/Spike Crawler/Bat were; decide on hit-points/checkpoints
as its own small design pass before starting Items/Hazards' harder half.

**M3 — Bigger levels.** Lift the one-screen cap, add camera-follow and
scrolling in both editor and play mode; keep a sane upper bound per the
research's FPS-on-large-maps finding. *Acceptance:* a multi-screen level
scrolls smoothly in both editor and play, at or under the size cap.

**M4 — Level browser.** `LevelBrowserScene` (list/play/edit/delete/
rename), proper "New Level" flow with name + width/height prompts
(validated against the size cap). *Acceptance:* manage several saved
levels without losing or overwriting the wrong one.

**M5 — Polish pass.** Toolbar icons, Press Start 2P UI text, keyboard
shortcuts, optional Kenney CC0 sound effects, hover/selection feedback
beyond the MVP's basic highlight. *Acceptance:* a first-time user can
create, save, and play a level with no instructions.

**M6 (optional, if levels get large or numerous) — IndexedDB.** Swap
`LocalStorageAdapter` for `IndexedDbAdapter` behind the existing
interface; add level thumbnails if desired (binary storage IndexedDB
supports and localStorage doesn't).

**M7 (optional, later) — Sharing backend.** Only start once the above is
solid, per the original research's explicit recommendation. Introduce
`SupabaseAdapter`, auth, and a public level browse/list view. Out of
scope for this plan; revisit with its own design pass when triggered.

**M8 — World Maker (course builder), v1.** Done, deliberately cut down to
the simplest thing that's still genuinely useful, matching this project's
habit of shipping the smallest walking skeleton first (§9.1's guiding
principle) rather than the full-featured version. A **World** is just an
ordered list of already-saved level ids (`WorldData` in
`src/world/WorldSchema.ts`) — no branching paths, no visual world map, no
per-level unlocking/stars, no in-app renaming (same cut as levels
already make). `WorldMakerScene` builds one by clicking saved levels
into play order (click again on the right side to remove); `PlayScene`
gained an optional `world` context so winning a non-final level shows
"Level Complete!" with an N-to-advance hint instead of "You Win!", and
winning the last one shows "World Complete!"; Esc during world play
returns to `WorldBrowserScene` instead of resuming a (nonexistent, in
this flow) paused Editor scene. If a level referenced by a world is later
deleted, the world just ends early there rather than erroring — no
integrity constraint links `WorldData.levelIds` to `LevelData.id` beyond
that runtime check. *Acceptance:* build a 2+ level World from existing
levels, Play it, win the first level, advance with N into the next one,
and reach "World Complete" on the last — verified end-to-end in a
headless browser.

*Deferred from v1 (safe to add later without reopening the above):*
drag-to-reorder (click-to-add already establishes an order; reordering
is a `WorldMakerScene`-only UI change, `WorldData.levelIds` is already
just an array), a persistent per-level "stars/best time" scoreboard, a
visual world-map screen (SMB3-style node graph) in place of the plain
list, level unlocking/gating, and in-app renaming of worlds/levels
(would land as one shared text-input component, not two).

Each milestone (MVP included) should land as its own PR/commit set so
review stays scoped.

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
recommended defaults), MVP step 1 (§9.1) can start: scaffold the
Vite+TS+Phaser project, wire `pixelArt: true`, load real Kenney sprites,
and commit a crisp-rendering smoke test as the first real commit on this
branch — then proceed straight through steps 2-6 to the closed-loop demo
before any breadth work begins.
