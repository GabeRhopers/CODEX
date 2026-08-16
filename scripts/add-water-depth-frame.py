#!/usr/bin/env python3
"""Extends each real-art ground tileset (grass/desert/snow — see
prepare-kenney-assets.py) from 5 frames to 6, adding a "deep water" fill
frame after the existing water frame.

Why a separate script rather than re-running prepare-kenney-assets.py:
that script needs Kenney's original pack (not committed to this repo) as
its input, which isn't available here — this one only needs the tileset
PNGs prepare-kenney-assets.py already produced (committed, already in
public/assets/tiles/), so it can run standalone. It's meant to be run
once; re-run it (after re-running prepare-kenney-assets.py first, which
would reset water back to a single frame) if the water art ever changes.

Water previously had one frame, used for every water tile regardless of
depth — stacking water tiles the way you'd stack ground blocks showed the
same wavy "surface" art repeated at every row, including well below the
true surface. Ground blocks avoid exactly this by having separate top/
fill frames (see groundAutotile.ts's GROUND_KIND_FRAMES); this gives
water the same treatment: frame 4 (unchanged) is the surface — open air
above — and new frame 5 is a plain "fully submerged" fill with no wave
crest, in the *same tone* as the surface frame's own solid fill color
(sampled directly from it, not darkened) — the two frames read as the
same water at different depths, distinguished only by the missing crest
and a few subtle same-tone speckle dots, not by a color/mood shift. See
groundAutotile.ts for how a stored WATER_TILE cell picks between the two
based on whether another water cell sits directly above it — identical
mechanism to ground's own top/fill autotiling. Idempotent: safe to re-run
after retuning SPECKLE_SCALE/SPECKLE_SPOTS below — an already-6-frame
tileset gets its frame 5 regenerated from its own (unchanged) frame 4
rather than being skipped, so there's no need to reset via
prepare-kenney-assets.py first.
"""

from pathlib import Path

from PIL import Image

TILE_SIZE = 32
WATER_FRAME_INDEX = 4  # existing surface frame, within each 5-or-6-frame strip

# A couple of subtle darker speckle dots on top of the flat fill, mirroring
# drawGroundFill's own dot accents in generateTextures.ts (castle) so
# water's "fill" reads consistently with every other block kind's fill
# frame rather than as a completely flat, textureless rectangle — kept
# gentle (85%, not the 75% used pre-2026-08-16) since the base fill no
# longer carries its own darkening for the speckles to compound with.
SPECKLE_SCALE = 0.85
SPECKLE_SPOTS = [(6, 4, 4, 4), (22, 10, 4, 4), (2, 18, 4, 4), (18, 24, 5, 4)]


def darken(rgba: tuple[int, int, int, int], scale: tuple[float, float, float]) -> tuple[int, int, int, int]:
    r, g, b, a = rgba
    return (round(r * scale[0]), round(g * scale[1]), round(b * scale[2]), a)


def build_water_fill(source_strip: Image.Image) -> Image.Image:
    """Plain, fully opaque deep-water frame — no wave crest, no
    transparent corners (unlike the surface frame, which needs those for
    its jagged wave silhouette against whatever's behind the topmost
    tile) — so stacked fill tiles abut seamlessly, the same way ground's
    own fill frame does."""
    water = source_strip.crop((WATER_FRAME_INDEX * TILE_SIZE, 0, (WATER_FRAME_INDEX + 1) * TILE_SIZE, TILE_SIZE))
    # Sample the surface frame's own solid fill color (well below the wave
    # crest, where every existing water frame is already a flat color —
    # see prepare-kenney-assets.py's water tile) rather than hand-picking
    # a new one, so the fill frame is a true same-tone sibling of whatever
    # the surface frame's own art actually is — used as-is, not darkened,
    # per a follow-up request that the two read as one consistent color.
    base_color = water.getpixel((TILE_SIZE // 2, TILE_SIZE - 1))
    fill_color = base_color
    speckle_color = darken(base_color, (SPECKLE_SCALE, SPECKLE_SCALE, SPECKLE_SCALE))

    fill = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), fill_color)
    for x, y, w, h in SPECKLE_SPOTS:
        for px in range(x, x + w):
            for py in range(y, y + h):
                fill.putpixel((px, py), speckle_color)
    return fill


def extend_tileset(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    if w == TILE_SIZE * 6:
        # Already extended (from a previous run) — regenerate frame 5 from
        # frame 4 in place rather than skipping, so retuning the speckle
        # constants above just needs a re-run, not a reset back through
        # prepare-kenney-assets.py first.
        water_fill = build_water_fill(im)
        im.paste(water_fill, (TILE_SIZE * 5, 0))
        im.save(path)
        print(f"rewrote {path}'s deep-water fill frame {im.size}")
        return
    if w != TILE_SIZE * 5:
        raise ValueError(f"{path} is {w}x{h}, expected {TILE_SIZE * 5}x{TILE_SIZE} (5 frames)")

    water_fill = build_water_fill(im)
    extended = Image.new("RGBA", (TILE_SIZE * 6, TILE_SIZE), (0, 0, 0, 0))
    extended.paste(im, (0, 0))
    extended.paste(water_fill, (TILE_SIZE * 5, 0))
    extended.save(path)
    print(f"wrote {path} {extended.size}")


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    tiles_dir = repo_root / "public" / "assets" / "tiles"
    for skin in ["grass", "desert", "snow"]:
        extend_tileset(tiles_dir / f"tileset-{skin}.png")


if __name__ == "__main__":
    main()
