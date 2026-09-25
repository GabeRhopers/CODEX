# Working in this repo

A game-making tool for children: paint sprites, build levels, join them into
worlds, publish a link. Phaser 3 + TypeScript + Vite, no backend — a published
game is a static file.

This file is the set of things that have been learned the expensive way. It is
not a style guide; it is the list of mistakes not worth making twice.

## The screen

**1050 × 468, fixed, `Phaser.Scale.FIT`.** Every UI position is a hand-placed
Phaser object. There is no layout engine, so "will it fit" is arithmetic you do
before you write it, against `GAME_WIDTH` / `GAME_HEIGHT` in
`src/config/gameConfig.ts`.

**The height is the scarce axis.** 468px, and a footer row or a heading costs
real estate that cannot be got back. When something needs to be bigger, the
question is always "what is currently spending vertical space, and does it have
to be there?"

**Levels are exactly one screen wide and the camera never scrolls.** Decided and
re-affirmed repeatedly. Do not add scrolling; several features are simple only
because of this (local co-op needs no split screen, for one).

## Verification, in the order that matters

**1. `npm run check`** — typecheck, lint, unit tests. Fast; run it constantly.

**2. Look at it.** Take a screenshot and read it. Every visual defect this
project has had was found this way and not by an assertion: a World Map that was
a murky rectangle, cut-scene panels hunched at the bottom of an empty screen, a
background zoomed to one tree, a swatch row below the floor of the scene, a
button sitting on top of the power LED. `tests/e2e/screen-survey.spec.ts`
photographs every authoring screen in one command.

> **`assertLayoutSound` has a blind spot you must hold in your head.** It
> compares only *interactive* Text for overlap, and only interactive objects for
> off-canvas. Two plain labels on top of each other are invisible to it. This has
> cost at least three bugs.

**3. `npx playwright test --shard=1/3`, not the full local suite.** CI shards
three ways with `retries: 1`; the full single-worker run is ~30 minutes and
reproduces neither CI's ordering nor its load. Twice, the full suite passed
locally while CI failed, and `--shard=1/3` found it in ten minutes.

**4. Mutation-check every new assertion.** Break the thing it claims to protect
and watch it fail. This is not ceremony — in this session alone it caught a
`padName` off-by-one, proved a controller test was vacuous, and revealed that a
test about a null canvas context was passing with the bug restored.

## Tests

**Never wait a fixed number of milliseconds for something to happen.** Poll for
the condition. Every load-dependent failure this repo has had came from a fixed
wait: 2500ms holds that were enough on an idle machine and not under two
workers; a 300ms settle before a keypress that was silently dropped; a poll
racing a character to the goal. Measured: a character covers ~30px in the first
250ms of a run and ~100px once warm — a 3× spread, on the same machine.

`waitForTimeout` is fine for "let a tween finish before screenshotting". It is
never fine for "the thing I am about to assert on should exist by now".

The line between the two is which kind of assertion follows. Before a *positive*
one ("it moved") a fixed wait is a race. Before a *negative* one ("no second
player appeared") it is the only tool there is, because an absence cannot be
polled for. `src/e2eWaits.test.ts` enforces the distinction the only way a test
can: it does not ban the call, it requires a comment beside every one with a
numeric argument, and leaves you to write the sentence that decides which you
have. A named constant is its own justification and is exempt.

**Assert the precondition, or the test passes vacuously.** If a test depends on
a *state* — the level is still loading, the area is not yet built, the menu is
open — assert that state before acting on it. Tests that skipped this have
passed for months while exercising nothing.

**The suite is the spec.** When refactoring, the bar is that every existing spec
passes *untouched*. If one needs editing, the refactor changed behaviour it
should not have. That bar has caught real bugs twice.

## Code

**Keep rules Phaser-free.** `spriteFrames.ts`, `soundSynth.ts`, `PlayerStats.ts`,
`characterState.ts`, `gamepad.ts`, `canvasZoom.ts` deliberately import no Phaser,
so they unit-test without a `window`. Put a decision in one of these and it can
be settled in a unit test instead of by loading a page and squinting at a corner
of it. A rule parked in a Phaser-importing file cannot be tested at all.

**Derive, don't store, anything that can change underneath you.** A remembered
index into a list the browser rebuilds (connected gamepads, say) points at the
wrong thing the moment the list changes.

**Input arriving before a scene is ready is the recurring bug.** A level is not
loaded when its screen appears — `PlayScene` waits on a tileset composition
bounded at ten seconds. Two separate bugs came from this: key bindings created
during that window could not see a key already held, and a button press during
it was silently discarded. If you touch scene start-up, ask what happens to
input that arrives mid-load.

## Comments and commits

Comments here are long on purpose and carry *why*, not *what* — they have
repeatedly stopped a mistake being repeated. Two rules keep them worth their
weight:

- **The file carries the rule; the commit carries the history.** "This is 140
  wide because the power LED sits at x=172" belongs in the file. "This was 164
  until I looked at it" belongs in the commit message.
- **Numbers in comments must be measured.** If a comment names a pixel, a
  duration or a percentage, it was checked. Say what was measured and when.

Commit messages are long and explain the reasoning, the alternatives rejected,
and what was verified.

## Things that are deliberately not done

- Networked multiplayer. No server; a published game is a static file.
- Camera scrolling / levels wider than one screen.
- Three or more players (the pad rule extends, the key schemes do not).
- Two people on the on-screen controls: there is one D-pad.
