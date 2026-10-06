# Sprite sequences — implementation plan

Status: **Planning only.** No code has been written for this. Every number
below was measured from the current codebase on 2026-10-06, not estimated;
where a figure comes from an existing comment rather than a fresh measurement,
it says so.

---

## 1. Scope and goals

Today a character pose is a single still picture. The goal is **groups of
frames per state** — an idle that breathes, a walk cycle longer than two
frames, a death that plays through rather than snapping.

Stated for the player character first, but the model must generalise to any
entity where it makes sense (enemies and invented things already animate on a
timer; see §8).

Non-goals for the MVP: new built-in art, new character states, a per-skin speed
control, Phaser's animation system, sprite atlases.

## 2. What already exists

**The state machine is already built and tested.** `characterState.ts` resolves
seven situations with a documented precedence:

```ts
type CharacterSituation = "lose" | "win" | "cast" | "swim" | "jump" | "walk" | "idle";
```

What is missing is not the concept of states. It is that **six of the seven are
a single still image**, and the seventh has two. The rest reuse art with a
treatment layered over it:

| Situation | Frame today | Treatment |
|---|---|---|
| idle | `wizard-idle` | — |
| walk | `wizard-walk1` / `walk2`, alternating at 140ms | — |
| jump | `wizard-jump` | — |
| swim | `wizard-jump` | tilt (`angleFor`) |
| cast | `wizard-cast` | — |
| win | `wizard-cast` | — |
| lose | `wizard-idle` | tint + tilt |

Three pieces of the job are therefore already done:

- **`advanceLoop` (`spriteLoop.ts`)** — a pure, tested frame timer that
  accumulates rather than resetting (so it does not drift under a starved
  loop) and treats 0–1 frames as a still. Reusable per state unchanged.
- **`resolveFrame` (`spriteFrames.ts`)** — already falls back to the skin's
  *own* base frame, so a skin with one walk frame keeps working untouched.
- **Positional keys have precedent** — enemy loops already store frames as
  `"0".."3"`.

## 3. The gap, against what was asked for

| Wanted | Status |
|---|---|
| idle | exists, 1 frame |
| walking | exists, 2 frames |
| running | **no state** — but `speedMultiplierAt` already exists as a trigger |
| jumping | exists, 1 frame |
| celebrating | exists as `win`, reuses the **cast** frame |
| taking damage | exists only as a **tint**, never a pose |
| dying | exists as `lose`, reuses **idle** plus a tilt |

So: five of seven exist as states and need sequences; one (`run`) is nearly
free; one (`hurt`) needs a genuinely new situation and new art.

## 4. Measured constraints

| Constraint | Measurement | Source |
|---|---|---|
| Editor column space | 5-row strip + colour block ends at **y=318**, floor **421** — 103px spare | existing comment in `buildCanvas` |
| Proposed strip cost | selector 26px + 4 rows × 30px = **152px** against today's **150px** | arithmetic on `layout.ts` constants |
| Frame storage, sparse 32×32 | **406 bytes** | `grumble-bug-goes-walking.json` |
| Frame storage, filled 32×32 | **~2 KB** | `grampa-and-the-lost-sheep.json` |
| Character grid | 48×48 against 32×32 for entities | `CHARACTER_GRID_SIZE` |
| Hitbox | fixed 22×40 whatever is painted | `applyWizardTexture`, pinned by `sprite-frames.spec.ts` |

A 48×48 frame is ~2.25× the area of a 32×32 one, so the worst case of seven
states × four frames lands roughly **25–55 KB per character skin**. `skins.json`
is read whole on every resolve, which is why §5 caps frames rather than leaving
it open.

**The UI costs nothing.** A pose selector plus four frames is 152px against the
150px the five-frame strip uses today — no layout rework, and about six frames
per state would still fit before the column floor.

## 5. Data model

Added alongside the existing flat lists, not replacing them:

```ts
export interface FrameGroup {
  state: string;              // matches CharacterSituation
  frames: readonly string[];  // storage keys, in play order
  loop: boolean;              // cycles, vs plays once and holds the last frame
}
export function frameGroupsFor(plan: FramePlan): readonly FrameGroup[];
```

**Storage keys become `"<state>.<index>"`** — `"walk.0"`, `"walk.1"`. This does
not violate `SkinAsset.frames`'s "addressed by meaning, not by position" rule:
the *state* carries the meaning, and an index inside one state is genuinely
positional, exactly as `LOOP_FRAMES` already is.

**Back-compat is one read-time alias**, migrated away on the next save — the
precedent `pixelData.cells` set ("still read when present… migrates itself away
on the next save of each skin"):

```
idle → idle.0    walk1 → walk.0    walk2 → walk.1    jump → jump.0    cast → cast.0
```

**Cap: four frames per state.** Matches `LOOP_FRAMES`, and keeps the worst case
inside both budgets above.

**Loop vs play-once** is the one genuinely new mechanic. `idle`/`walk`/`swim`
cycle; `win`/`lose`/`cast` play once and hold the last frame. `advanceLoop`
cannot express the second, and it is what makes dying read as dying rather than
as a twitch.

## 6. Phases

The ordering principle: **the runtime learns to play sequences before the editor
can paint them**, never the reverse. An editor that saves frames the runtime
ignores would silently lose a child's work, which is the worst failure mode this
codebase has (see CLAUDE.md, "Never announce a save you have not seen land").

### Phase 1 — The model, pure and additive

Land `FrameGroup`, `frameGroupsFor` and the legacy alias as pure data rules.
**Do not touch `CHARACTER_FRAMES`** — nothing reads the new functions yet, so
behaviour is unchanged and no e2e is needed.

*Files:* `src/skins/spriteFrames.ts` + its test.

*Risk:* the alias map **is** the compatibility guarantee; if it is wrong, every
character skin already painted breaks.
*Verify:* a unit test per legacy key. Mutation-check by deleting one alias entry
and confirming exactly that frame fails.

### Phase 2 — The runtime plays sequences

*Files:* `spriteLoop.ts`, `characterState.ts`, `wizardAnimation.ts` + tests.

- **`advanceOnce(state, deltaMs, frameCount)`** — plays through and holds the
  last frame. A separate function rather than a mode flag on `advanceLoop`,
  whose "it cycles" contract is documented and tested.
- **Per-situation timing in `WizardAnimState`**, resetting when the situation
  changes — mirroring what `walkTimer` already does, "so the cycle always
  restarts from the same foot rather than resuming mid-stride after a jump".

**The safety property, and it is testable:** with only legacy frames present,
every state resolves to one frame, `advanceLoop` returns 0, and the texture
sequence is byte-identical to today's.

*Risk:* forgetting the reset, so a jump after walking starts mid-sequence.
*Verify:* pure unit tests, no scene required. Mutation-check the reset.

### Phase 2½ — Running, nearly free *(independent of everything else)*

Scale `WALK_FRAME_INTERVAL_MS` by the existing `speedMultiplierAt(stats, now)`.
**No new state, no new art, no new storage** — a character moving faster takes
faster steps. Roughly ten lines, and the cheapest visible win on this list; it
depends on no other phase and can land at any point.

### Phase 3 — The editor can paint them

*Files:* `SkinEditorScene.ts`, `scenes/skin/layout.ts`, `tests/e2e/sprite-frames.spec.ts`.

- `CHARACTER_FRAMES` switches to groups; the frame strip becomes a **"Pose ▾"
  selector plus up to four frame rows** (152px, see §4).
- `onSave` writes `"<state>.<index>"` and drops the legacy keys — migration
  happens here.
- **`imageData` must stay `idle.0`.** The browse list, the picker thumbnails and
  `EntityPlacer` all read that single field.

*Risk — the significant one:* a child who already painted `walk1`/`walk2` opens
the editor and their art is not under Walk. That is work lost, silently.
*Verify:* an e2e that paints with the **old** keys, reopens, and asserts the art
appears under the new ones. Plus screenshots — every visual defect this project
has had was found by looking, not by asserting.

### Phase 4 — Built-in sequences for Grampa *(art, not code)*

Nothing before this needs new art, deliberately, so the system lands and is
verified without waiting on drawing. Then: two more walk frames, a two-frame
idle breath, a two-frame celebrate.

Source is already settled — the original implementation plan lists **Kenney CC0
Pixel Platformer packs, "$0, no attribution required"**. Verified still true
(2026-10-06): CC0, credit appreciated but not mandatory.

The commonly-recommended **Universal LPC** set should be avoided here: GPL3 /
CC-BY-SA3, attribution **mandatory**, and share-alike is viral — it would
arguably reach skins children derive from it, and every published game would
need to ship a credits file.

### Phase 5 — New states *(v2, out of MVP)*

Only **hurt** needs both a new situation and new art, and it is where the
current tint-only treatment is weakest. `resolveSituation` is pure and cheap to
extend; it is out of the MVP because its precedence carries subtle documented
invariants — swim must outrank jump, or the swim pose is unreachable, since in
water the player is always airborne by the grounded check.

Also worth revisiting here: `jump` currently merges rise and fall, with a
comment that a separate "fall" "would encode nothing". That was true when jump
was one picture. It stops being true once jump holds two.

## 7. Verification, per phase

Following CLAUDE.md's order: `npm run check` constantly; **look at it** from
Phase 3 on; `--shard=1/3` single-worker, and **all three shards** on any phase
that adds or deletes a spec file; mutation-check every new assertion.

Phases 1, 2 and 2½ are entirely unit-testable — no scene, no browser.

## 8. Generalising to other entities

`FrameGroup` is deliberately generic and `framePlanFor` keys off the target id,
so enemies and invented things can gain named groups later with no second
mechanism: an enemy's existing four-frame loop is simply one unnamed group
today. The MVP does not do this, but nothing in it precludes it.

## 9. Open decisions

1. **Four frames per state, or six?** Four matches `LOOP_FRAMES` and the storage
   budget; six is what the column can hold. Four unless there is a reason.
2. **Ping-pong?** Aseprite's tag model (name, range, direction, repeat) is the
   de-facto standard, and ping-pong makes a two-frame idle read as breathing for
   no extra art. Cheap to add in Phase 2; omitted above to keep the MVP narrow.
3. **Does `hurt` want a pose at all**, or is the existing tint enough? It is the
   only item on the original list needing new art.

## 10. Deliberately not doing

- **Phaser's animation system or sprite atlases.** Custom skin frames arrive at
  runtime as separately-registered textures; there is no sheet to define an
  animation against, and `setTexture` is how every sprite in this game already
  changes frame.
- **A per-skin frame-rate control.** One more thing to store and to get wrong,
  for a game whose characters all move at similar speeds — the same reasoning
  `LOOP_FRAME_INTERVAL_MS` already records.
- **Changing the hitbox.** Fixed at 22×40 whatever is painted, and pinned by a
  test, because the 2026-08-19 gravity retune was verified against it.
