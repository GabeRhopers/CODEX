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
above — and new frame 5 is a plain, darker "fully submerged" fill with no
wave crest, derived by darkening/desaturating the existing frame's solid
fill color rather than inventing new pixel art from scratch (keeps the
same hand-tuned hue family, just reads as deeper). See groundAutotile.ts
for how a stored WATER_TILE cell picks between the two based on whether
another water cell sits directly above it — identical mechanism to
ground's own top/fill autotiling.
"""

from pathlib import Path

from PIL import Image

TILE_SIZE = 32
WATER_FRAME_INDEX = 4  # existing surface frame, within each 5-frame strip

# How much to darken the water fill's RGB channels for the "deep" look
# (multiplicative, applied per-channel) — tuned by eye against the
# existing surface color so it reads as clearly deeper without looking
# like a different substance entirely.
DEEP_FILL_SCALE = (0.5, 0.52, 0.58)
# A couple of subtle darker speckle dots on top of the flat fill, mirroring
# drawGroundFill's own dot accents in generateTextures.ts (castle) so
# water's "fill" reads consistently with every other block kind's fill
# frame rather than as a completely flat, textureless rectangle.
SPECKLE_SCALE = 0.75
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
    # a new one, so the fill frame stays a true darkened sibling of
    # whatever the surface frame's own art actually is.
    base_color = water.getpixel((TILE_SIZE // 2, TILE_SIZE - 1))
    fill_color = darken(base_color, DEEP_FILL_SCALE)
    speckle_color = darken(base_color, (DEEP_FILL_SCALE[0] * SPECKLE_SCALE, DEEP_FILL_SCALE[1] * SPECKLE_SCALE, DEEP_FILL_SCALE[2] * SPECKLE_SCALE))

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
        print(f"{path} already has 6 frames, skipping")
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
