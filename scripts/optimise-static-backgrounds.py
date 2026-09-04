#!/usr/bin/env python3
"""Right-sizes and re-quantizes the four shipped static backgrounds in place.

These are the images `StaticBackground.ts` renders cover-fit behind a level
(see level/staticBackgrounds.ts for the pool). Three of them were committed at
1376x768 in full 24-bit colour and cost 4.1MB between them — most of the whole
site's payload, downloaded by everyone who opens a published game link.

Two things were wrong with that, and neither is the format:

  * **They were larger than they can ever render.** The canvas is 1050x468
    (config/gameConfig.ts) and these are cover-fit onto it, so anything past
    ~1120px wide is detail the player never sees. Resizing is a pure win.

  * **They are pixel art stored as though they were photographs.** Flat colour
    bands, a dithered sky gradient and single-pixel stars — content with very
    few *intended* colours, saved with tens of thousands of actual ones after
    some earlier resample. Quantizing back to a 64-colour palette is close to
    restoring the art's own intent, and indexed PNG compresses it hard.

JPEG was measured and rejected: at a matching size it smears exactly the dither
and the 1px stars that this art is made of, and it would have meant changing
every filename the loader asks for. Staying PNG means **no code change at all**.

Measured result: 4133KB -> 634KB, with the on-screen difference invisible at the
scale these render (checked side by side before this script was written).

Idempotent: an image already within the size and palette targets is left alone,
so re-running this is safe and a second pass never re-quantizes already-indexed
art.
"""

import os
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = REPO_ROOT / "public" / "assets" / "backgrounds" / "static"

# A little wider than the 1050px canvas so a cover-fit never samples past the
# edge, and so a slightly wider canvas later does not immediately need new art.
TARGET_WIDTH = 1120
# 64 was chosen by measuring 32/48/64/128: 64 is where the sky gradient stops
# banding visibly against the original, and the file is still ~270KB at worst.
PALETTE_COLOURS = 64


def already_optimised(image: Image.Image) -> bool:
    """True when this file has been through here before.

    Checked rather than tracked in a manifest: the two properties this script
    sets are both readable straight off the image, so the file is its own record
    of whether the work is done.
    """
    if image.width > TARGET_WIDTH:
        return False
    colours = image.getcolors(maxcolors=PALETTE_COLOURS)
    return colours is not None


def optimise(path: Path) -> tuple[int, int]:
    before = os.path.getsize(path)
    image = Image.open(path)
    if already_optimised(image):
        return before, before

    if image.width > TARGET_WIDTH:
        height = round(image.height * TARGET_WIDTH / image.width)
        # LANCZOS rather than NEAREST: the source is *not* clean pixel art any
        # more (it carries resample artefacts already), so preserving its
        # apparent detail beats trying to snap it back to a pixel grid it no
        # longer sits on. The quantize below is what restores the flat bands.
        image = image.resize((TARGET_WIDTH, height), Image.LANCZOS)

    image = image.convert("RGB").quantize(colors=PALETTE_COLOURS, method=Image.MEDIANCUT)
    image.save(path, "PNG", optimize=True)
    return before, os.path.getsize(path)


def main() -> None:
    total_before = total_after = 0
    for path in sorted(STATIC_DIR.glob("*.png")):
        before, after = optimise(path)
        total_before += before
        total_after += after
        note = " (already optimised)" if before == after else ""
        print(f"{path.name:24s} {before / 1024:7.0f}KB -> {after / 1024:7.0f}KB{note}")
    print(f"{'TOTAL':24s} {total_before / 1024:7.0f}KB -> {total_after / 1024:7.0f}KB")


if __name__ == "__main__":
    main()
