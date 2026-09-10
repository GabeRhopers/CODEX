#!/usr/bin/env python3
"""Draws the Meadow static background at the shape it is actually rendered in.

`public/assets/backgrounds/static/meadow.png` was **1120x1120** while the other
three static backgrounds are **1120x625**. `StaticBackground.ts` cover-fits these
into the console's screen (640x384), so a 1120x625 source shows as 688x384 — the
whole scene, 48px trimmed off the sides — but the square one showed as 640x640
with **40% of its height cropped away**. What survived was a middle band of two
enormous trees whose trunks ran behind the level's ground strip and reappeared
below it. Meadow is the first name in the background dropdown, so that was the
first thing anyone opening the picker saw.

It went unnoticed because nothing ever selected it: the demo game uses
`sunny-valley`, and `optimise-static-backgrounds.py` says in its own docstring
that it right-sized *three* images. This was the fourth.

**Redrawn rather than cropped or squashed.** The old composition ran the full
height — clouds near the top, sun below them, tree canopies through the middle,
trunks and grass at the bottom — about 970 of its 1120 rows, against a 625-row
target. No band keeps both the sun and the grass. Squashing to 625 turns the sun
into an oval and flattens the canopies, which on flat pixel art with hard edges
reads as a bug rather than a style. The art is six colours and a handful of
shapes, so drawing it at the right size costs less than salvaging it.

**Drawn small, then scaled up with NEAREST.** The scene is composed at 224x125
and multiplied by 5. Drawing circles directly at 1120x625 gives smooth, hairline
edges that look nothing like the rest of this game; composing at 1/5 and
point-scaling gives an honest 5px pixel block. (The original had no clean block
size at all — sampled run lengths shared no common factor, so it was drawn small
and resampled with smoothing at some point in its history.)

Palette read straight off the old file, so the new one is recognisably the same
meadow: six colours, no additions.

Run once and commit the PNG, the same convention `generate-sfx.py` and
`generate-painted-backgrounds.py` follow — **the committed PNG is the source of
truth, not this script.** Needs Pillow (`pip install Pillow`).

Run `optimise-static-backgrounds.py` afterwards; it should report this file as
already within target, since six colours is well inside its 64-colour budget.
"""

import random
from math import sin
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "public" / "assets" / "backgrounds" / "static" / "meadow.png"

# Matches the other three static backgrounds exactly. See the module docstring
# for why the height is the whole point of this script.
WIDTH, HEIGHT = 1120, 625
# Composition happens at 1/SCALE and is point-scaled up — see the docstring.
SCALE = 5
W, H = WIDTH // SCALE, HEIGHT // SCALE  # 224 x 125

# Read off the old meadow.png with Image.getcolors(): these six are 92% of it,
# and everything else in that file was resampling noise around their edges.
SKY = (0x7C, 0xE6, 0xFF)
GRASS = (0x00, 0xCA, 0x00)  # the sunlit ridge
DEEP = (0x01, 0x91, 0x01)  # the shaded mass below it, and the tree canopies
WHITE = (0xFF, 0xFF, 0xFF)
SUN = (0xFF, 0xFF, 0x00)
TRUNK = (0x7F, 0x21, 0x00)

# The screen shows the middle 640 of the 688 this renders as, so roughly 5
# columns at each edge of the composition are never seen. Nothing that has to
# read as deliberate is placed there.
EDGE = 6

# Where the level's own ground tiles sit. A level's ground is normally its
# bottom two rows, which cover the bottom ~21 rows of this composition — so the
# grass drawn below that line is only ever glimpsed, and the ridge has to sit
# above it to be seen at all.
HIDDEN_BY_LEVEL_GROUND = 21


def ridge(draw: ImageDraw.ImageDraw, base: float, amplitude: float, phase: float, colour) -> None:
    """Fills from a rolling line down to the bottom of the image.

    Two sines of different periods rather than one, so the hills do not repeat
    on an obvious beat across a frame this wide.
    """
    for x in range(W):
        y = base + amplitude * sin(x / 34.0 + phase) + amplitude * 0.45 * sin(x / 11.0 + phase * 2)
        draw.rectangle([x, int(y), x, H], fill=colour)


def cloud(draw: ImageDraw.ImageDraw, cx: int, cy: int, width: int) -> None:
    """Three overlapping ellipses — the same lumpy shape the old art used."""
    height = max(5, width // 3)
    draw.ellipse([cx - width // 2, cy - height // 2, cx + width // 2, cy + height // 2], fill=WHITE)
    draw.ellipse([cx - width // 3, cy - height, cx + width // 12, cy + height // 3], fill=WHITE)
    draw.ellipse([cx - width // 12, cy - int(height * 0.8), cx + width // 3, cy + height // 3], fill=WHITE)


def tree(draw: ImageDraw.ImageDraw, cx: int, base_y: int, canopy_r: int) -> None:
    """A round canopy on a straight trunk, standing on the grass line.

    Canopy above the ridge and trunk below it, so the canopy always reads
    against sky — the canopy shares DEEP with the shaded grass, and a tree drawn
    low enough to overlap that mass would lose its silhouette entirely.
    """
    trunk_w = max(3, canopy_r // 3)
    trunk_top = base_y - canopy_r
    draw.rectangle([cx - trunk_w // 2, trunk_top, cx + trunk_w // 2, base_y], fill=TRUNK)
    draw.ellipse(
        [cx - canopy_r, trunk_top - canopy_r * 2, cx + canopy_r, trunk_top + canopy_r // 3],
        fill=DEEP,
    )


def generate() -> Image.Image:
    # Seeded so a re-run reproduces this. Same caveat generate-painted-
    # backgrounds.py records about its own seeding: a Pillow version change can
    # still move a pixel, which is exactly why the PNG is committed.
    random.seed(20260910)

    image = Image.new("RGB", (W, H), SKY)
    draw = ImageDraw.Draw(image)

    # Sun, right of centre so it is not competing with the tallest tree.
    sun_x, sun_y, sun_r = 168, 25, 10
    draw.ellipse([sun_x - sun_r, sun_y - sun_r, sun_x + sun_r, sun_y + sun_r], fill=SUN)

    # Four clouds rather than the old two: this frame is nearly twice as wide as
    # it is tall, and two left the middle of the sky empty.
    for cx, cy, width in ((34, 22, 30), (84, 34, 22), (128, 18, 26), (198, 30, 24)):
        cloud(draw, cx, cy, width)

    # The sunlit ridge, then the shaded mass in front of and below it. Drawn in
    # that order so the light band is a strip along the skyline rather than a
    # wash over the whole lower third.
    grass_base = H - HIDDEN_BY_LEVEL_GROUND - 16
    ridge(draw, grass_base, 4.0, 0.0, GRASS)
    ridge(draw, grass_base + 13, 3.0, 2.1, DEEP)

    # Trees along the ridge, biggest nearest the edges so the eye is not pulled
    # to the middle of a background. Sizes vary; positions do not, because a
    # seeded random x placed two of them touching on the first run and a
    # background is not worth a rejection loop.
    for cx, canopy_r in ((22, 13), (66, 9), (110, 11), (150, 8), (196, 12)):
        base = int(grass_base + 4.0 * sin(cx / 34.0)) + 6
        tree(draw, cx, base, canopy_r)

    return image.resize((WIDTH, HEIGHT), Image.NEAREST)


if __name__ == "__main__":
    art = generate()
    art.save(OUT, optimize=True)
    print(f"{OUT.relative_to(REPO_ROOT)}: {art.width}x{art.height}, {len(art.getcolors(maxcolors=256) or [])} colours")
