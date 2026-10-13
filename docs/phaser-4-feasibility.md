# Phaser 4: what would actually break

Status: **no known blocker remains.** Read the caveat at the bottom before
treating that as "the migration works" — it is a weaker claim than it sounds.

Written 2026-10-13, against Phaser 4.2.1 and this repo at `e2c99c0`. Every count
below was measured with `grep` over `src/`, not estimated.

## Why this was asked

An outside review flagged Phaser 4 as worth evaluating and named **tint** as the
breaking change "likely to affect this project". It also noted, correctly, that
the v3→v4 migration guide says:

> GeometryMask remains available in Canvas only.

This game runs `Phaser.AUTO`, which prefers WebGL. The guide documents what
replaces `BitmapMask` (the new Mask filter) but **says nothing about what
replaces `GeometryMask` under WebGL**. That looked like a possible hard stop, and
it was the right thing to check first.

## What the masks turned out to be

Four `createGeometryMask` calls, one in each of four files (counted at
`e2c99c0`; `ParallaxBackground` creates one and shares it across its layers, so
the number of *masked objects* is higher). Every one of them was a single
axis-aligned `fillRect` — a `Graphics` object whose entire content was one
rectangle — clipping a cover-fit image. Not one was a geometry mask in any
meaningful sense; `ParallaxBackground`'s own comment called it a "rectangular
mask … clips each to just the viewport".

Three of the four were the same pattern written out three times: scale by
`Math.max(w/iw, h/ih)`, centre on the rectangle, clip the overflow. (The fourth,
in `ParallaxBackground`, scales by height alone — see below.)

**So they were replaced with `setCrop`** (`src/ui/coverFit.ts`), which does the
same job, exists unchanged in both Phaser 3 and 4, needs no second object, and
removed this project's entire exposure to the change. The three live sites are
the level background, the world-map backdrop and a cut-scene panel's picture.

One mask remains, in `ParallaxBackground.ts`, which **nothing constructs** — it
is dormant and every other reference to it is a comment. It is the only case
whose image *moves*, and a crop is in texture pixels, so reviving it needs a
per-frame crop rather than a mask. Recorded in that file's header.

## Everything else the guide flags, against this codebase

| v4 change | Uses here |
|---|---|
| `tintFill` / `setTintFill()` removed → `tintMode` / `setTintMode()` | **0.** The only hit is a comment at `Palette.ts:214` explaining why multiply tint was chosen *instead*. All 20 tint calls are `setTint`/`clearTint`, which survive. |
| Pipelines replaced by render nodes | **0** custom pipelines |
| `BitmapMask` removed → Mask filter | **0** |
| `GeometryMask` Canvas-only | **0 live** (see above); 1 dormant |
| Camera matrix system rewritten | **0** direct matrix access |
| `Shader#setTextures()` semantics | **0** shaders |
| `RenderTexture` | **0** |

The tint item is worth stating plainly: the change the review called "likely
affects this project" **does not affect it at all**.

## What the guide does *not* cover, which is most of what this game is

Arcade Physics, the Scale Manager (`FIT` + `CENTER_BOTH`), input and
`activePointers`, and `setTexture` appear nowhere in the migration guide. Those
are what this codebase leans on hardest — 84 `this.add.*` calls, 71
`this.input.*`, a fixed 1050×468 `FIT` canvas, and an animation system built
entirely on swapping textures rather than on Phaser's animation manager.

That is a good sign and not a guarantee: "not mentioned in the migration guide"
is weaker evidence than "tested".

## The caveat

**Nothing here was built against Phaser 4.** This is the migration guide read
carefully against a `grep` of the codebase, which answers "what does the guide
say will break, and do we do any of it?" — not "does it run?". A dependency bump
on a branch, `npm run check`, and a screen survey would answer the real question
in an afternoon, and until someone does that, the honest claim is the one at the
top: no *known* blocker.

Nothing about the project requires v4. Removing the masks was worth doing on its
own merits — it deleted three copies of the same arithmetic, three `Graphics`
objects, and a `shutdown` hook that existed only to free one of them — and it
means the decision can now be made on its own timing rather than forced by a
rendering feature.
