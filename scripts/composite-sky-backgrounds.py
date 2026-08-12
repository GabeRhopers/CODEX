#!/usr/bin/env python3
"""Bakes the small (24x24) Kenney sky tiles into large, fixed-size canvases.

The old ParallaxBackground rendered these tiny textures as a live-tiling
Phaser TileSprite stretched across the whole canvas — cheap, but the literal
repeat was visible up close, and the technique painted scenery across the
full canvas width regardless of the level's actual placeable width (the
root cause of the "can't place on the right half" bug). The new renderer
(ParallaxBackground.ts) instead shows one zoomed, panned Image per layer,
which only works well with a source image that's already large — a 24x24
tile stretched to that size directly would be a blurry, blocky mess.

This script pre-tiles each small source tile (upscaled 4x via nearest
neighbor, matching the old tileScale=4 visual density) across a canvas
matching the painted scenes' format (2048x476, i.e. exactly GAME_HEIGHT
tall) so every background scene — Kenney-tile-based or hand-painted — can
go through the same Image-based renderer.

Usage: python3 scripts/composite-sky-backgrounds.py
(no arguments — reads the small tiles already committed under
public/assets/backgrounds/, which this repo's earlier
prepare-kenney-assets.py pass already extracted from the Kenney pack.)
"""

from pathlib import Path

from PIL import Image

CANVAS_WIDTH = 2048
CANVAS_HEIGHT = 476  # matches GAME_HEIGHT, and the painted scenes' format
UPSCALE = 4  # matches the old TileSprite's setTileScale(4, 4)

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKGROUNDS_DIR = REPO_ROOT / "public" / "assets" / "backgrounds"
SCENES_DIR = BACKGROUNDS_DIR / "scenes"

# (source file, output file) pairs. grass/desert sources live directly under
# backgrounds/; icy/jungle already live under backgrounds/scenes/ (from an
# earlier pass) and are overwritten in place with their baked versions.
JOBS = [
    (BACKGROUNDS_DIR / "grass-far.png", SCENES_DIR / "grass-sky-far.png"),
    (BACKGROUNDS_DIR / "grass-near.png", SCENES_DIR / "grass-sky-near.png"),
    (BACKGROUNDS_DIR / "desert-far.png", SCENES_DIR / "desert-sky-far.png"),
    (BACKGROUNDS_DIR / "desert-near.png", SCENES_DIR / "desert-sky-near.png"),
    (SCENES_DIR / "icy-sky-far.png", SCENES_DIR / "icy-sky-far.png"),
    (SCENES_DIR / "icy-sky-near.png", SCENES_DIR / "icy-sky-near.png"),
    (SCENES_DIR / "jungle-sky-far.png", SCENES_DIR / "jungle-sky-far.png"),
    (SCENES_DIR / "jungle-sky-near.png", SCENES_DIR / "jungle-sky-near.png"),
]


def main() -> None:
    # Read every source into memory before writing anything, since two jobs
    # (icy-sky/jungle-sky) overwrite their own source path in place.
    loaded = [(Image.open(src).convert("RGBA"), dst) for src, dst in JOBS]
    for src_img, dst_path in loaded:
        tile = src_img.resize((src_img.width * UPSCALE, src_img.height * UPSCALE), Image.NEAREST)
        canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT))
        for y in range(0, CANVAS_HEIGHT, tile.height):
            for x in range(0, CANVAS_WIDTH, tile.width):
                canvas.paste(tile, (x, y))
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dst_path)
        print(f"wrote {dst_path} {canvas.size}")


if __name__ == "__main__":
    main()
