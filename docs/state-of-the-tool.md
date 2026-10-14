# The state of this tool

A verdict on the version at `7ecd891`, written 2026-10-14.

Every number below was measured on that commit, not estimated. Where something
was *not* checked, it says so — there is a section for exactly that, and it is
not the short one.

## What this is

A game-making tool for children. Paint a sprite, build a level, chain levels into
a world, write a cut scene, publish a link. Phaser 3 + TypeScript + Vite, with no
backend: a published game is a static file.

142 source files, 27,179 lines, 17 scenes, on a fixed 1050×468 canvas.

## What it can do, and what that costs

`tests/e2e/author-a-game.spec.ts` walks the whole journey the way a person would
— invent a thing, draw it, paint two levels, chain them into a world, assemble a
game with an opening, publish, and read the file that falls out — and counts
every gesture on the way:

```
Making "Grumble Bug Goes Walking" took 123 gestures:
  Thing Maker    32 gestures   24s   26%
  Level 1        35 gestures   60s   28%
  Level 2        34 gestures   58s   28%
  World Maker     8 gestures    5s    7%
  Game Maker      5 gestures    4s    4%
  Cut scene       7 gestures    6s    6%
  Publish         2 gestures    2s    2%
```

**101 of those 123 gestures (82%) are drawing and building levels. 22 (18%) are
everything else — world, game, cut scene and publish combined. Publishing is two
clicks.**

That split is the most useful thing in this document. In a tool of this kind the
failure mode is that assembly and shipping eat the child's patience before they
have made anything. Here they do not: the effort goes where the creative work is.
A stage costing forty gestures to do something small would have been a finding;
there isn't one.

Two games sit in `public/games/`. The second,
`grumble-bug-goes-walking.json`, is the bundle that walk produces — so a game
authored entirely through the tool, not hand-written as JSON, has been published.

## What is verified, and why that number is worth anything

**754 unit tests** across 47 files, **252 end-to-end tests** across 57 spec files,
sharded three ways in CI. Nothing is skipped anywhere — no `.skip`, no `.fixme`,
no `.only` — and `src/` carries no `TODO` or `FIXME`.

The count matters less than the ladder behind it, which this project follows in
order:

1. `npm run check` — `tsc --noEmit && vitest run`.
2. **Look at it.** Every visual defect this project has had was found by reading
   a screenshot, not by an assertion.
3. One shard locally, not the full suite — and all three on any commit that adds
   or deletes a spec file, because shard composition derives from the file list.
4. **Mutation-check every new assertion.** Break the thing it protects and watch
   it fail.

Step 4 is the reason to trust the other three. In the session that produced this
document it caught a test that passed with the bug restored, a vacuous controller
test, and an off-by-one — and in two cases proved a green suite was green for the
wrong reason.

## What is deliberately not done

These are decisions, not gaps, and several features are simple *because* of them:

- Networked multiplayer. There is no server.
- Camera scrolling, or levels wider than one screen.
- Three or more players.
- Two people sharing the on-screen controls — there is one D-pad.

## Limits and risks, honestly

**Google Drive is the only authoring backend, and it is unhedged.**
`src/persistence/storage.ts` constructs `GoogleDriveStorageAdapter` directly. A
`LocalStorageAdapter` exists in the same folder but **nothing in production
constructs it**. If Drive is unreachable, or a child's authorisation lapses,
there is no fallback: they cannot save. `drive-failure.spec.ts` pins the three
properties a failing save owes the user — say so, keep what is on screen, let a
retry work — so the failure is honest rather than silent. But honest is not the
same as survivable, and the known periodic re-authorisation is an open risk to a
child's work rather than a cosmetic annoyance. **This is the single largest risk
in the project.**

**The sharing path, by contrast, is the robust one.** A published game needs no
editor, no sign-in and no Drive; it reads from its own bundle
(`published-game.spec.ts:214`). Once a link exists, nothing about Drive can take
it away.

**There is no linter.** No ESLint, no Biome, no Prettier, no config and no
dependency. `tsc` and the tests are the whole net, so nothing catches an unused
import, a stray `console.log` or a formatting slip.

**`assertLayoutSound` has a blind spot.** It compares only *interactive* Text for
overlap and only interactive objects for off-canvas, so two plain labels on top of
each other are invisible to it. That has cost at least three bugs.

**Two scenes are very large.** `SkinEditorScene.ts` (2,167 lines) and
`PlayScene.ts` (2,139), each with one method reaching 31–33 members of its scene.
They resist splitting for a documented reason: lifting those methods out means
dropping `private` from thirty-odd fields, and a class whose state anybody can
reach is worse than a long file.

**The canvas is fixed at 1050×468 with no layout engine.** Every UI position is
hand-placed arithmetic, and height is the scarce axis.

## What was not checked

This is a review of the code and the test suite. It is not a review of how the
current build looks or behaves in front of a person, and four gaps follow from
that:

- **No visual pass was run for this document.** By this project's own standard
  — step 2 of the ladder above — that is the half a code review cannot supply.
  `tests/e2e/screen-survey.spec.ts` photographs every authoring screen in one
  command and was not run here.
- **The published URL has never been opened.** Everything verified about
  publishing was verified locally: the specs serve the bundle themselves, and the
  built bundle was checked by serving `dist/`. The live Pages URL is unreachable
  from the environment this was written in (`github.io` and the Pages API are
  both refused by its proxy), so "deploy succeeded" here means the workflow said
  so, not that anyone loaded the page.
- **A production build cannot be driven by the e2e suite at all.**
  `__debugGame` sits behind `import.meta.env.DEV` (`src/main.ts:94`), so every
  helper in `tests/e2e/support/coords.ts` is unavailable against `dist/`.
  `installMockDrive` does work there, since it is `addInitScript` + `route`
  rather than a hook the app must expose.
- **No child has used it.** The authoring walk says this about itself, and it is
  the most important sentence in the suite:

  > A script is not a child. It will report that a step failed, that a control
  > could not be reached, that a stage cost sixty clicks. It cannot report that a
  > screen was confusing, and that is the half only a person can tell you.

## The verdict

This version does what it set out to do. A person can go from an empty Menu to a
shareable link, the measured cost is weighted toward the creative work rather
than the plumbing, and the result is a static file that needs nothing to keep
working.

The sharing path is sound. The authoring path rests on one external dependency
with no fallback, and that — not any missing feature — is where this would fail a
child: not by refusing to make a game, but by losing one.

Nothing in the backlog is load-bearing. The next real list does not come from
reading this code. It comes from watching someone eight years old use it for an
hour.
