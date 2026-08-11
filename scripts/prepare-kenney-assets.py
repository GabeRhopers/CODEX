#!/usr/bin/env python3
"""Derives this project's ground-tile/enemy PNGs from Kenney's "Pixel
Platformer" pack (CC0 — https://kenney.nl/assets/pixel-platformer).

Why this exists rather than just committing/loading the pack's own files
directly: the pack's tiles are natively 18x18px (characters 24x24px), but
this project's grid is TILE_SIZE=32px (entities are drawn at 40x40px to
match the existing hand-drawn ghost-pillow). Nearest-neighbor upscaling
each source tile once, offline, and compositing the handful this project
actually uses into small per-theme strips is simpler and cheaper at
runtime than teaching the game engine to render two native tile sizes
side by side. See generateTextures.ts and BootScene.preload for how the
output files are used, and the "Art" section of README.md for the full
picture (this pack replaced what used to be procedural placeholder art
for everything except the castle theme, which the pack has no stone/
castle-style tile for).

Usage:
    python3 scripts/prepare-kenney-assets.py /path/to/extracted/kenney-pixel-platformer

The argument is the extracted pack's root folder (the one containing
Tiles/, Tilemap/, License.txt, etc.) — not committed to this repo, since
only the small derived outputs below are actually needed. Re-run this
after changing any of the TILE_INDEX_* constants below to pick different
source art; outputs are written straight into public/assets/.

Tile index reference (from the pack's Tiles/tile_XXXX.png, a 20-col x
9-row sheet, row-major, so index = row*20 + col — see
"Tilesheet (Tiles).txt" in the pack):
    0   = grass-top dirt (theme: grass)
    40  = sand-top dirt (theme: desert)
    120 = plain dirt, no cap ("buried" fill — shared by every theme)
    6   = brick/crate block (shared by every real-art theme)
    107 = compressed spring/bounce pad (shared by every real-art theme)
Characters/tile_00XX.png (24x24, separate sheet):
    25  = bat (brown, wings spread)
    15  = red pointy-topped crawler (spike crawler)
Items, from the same 20x9 sheet as the ground tiles, upscaled like them:
    151 = coin
    44  = heart
    67  = blue gem/shield shape (used for the Shield item)
    152 = gold bar/gem (used for the Speed item — no literal potion in
          this pack; Feather has no source tile at all and is drawn
          procedurally instead, see generateTextures.ts)
Backgrounds/tile_00XX.png (24x24, separate sheet, left natively sized —
Phaser's TileSprite scales these at render time, not baked in):
    0   = plain light-blue sky (grass theme, far parallax layer)
    9   = light-blue sky with hills/trees (grass theme, near layer)
    4   = plain orange sky (desert theme, far layer)
    13  = orange sky with dunes/cactus silhouette (desert theme, near layer)
"""

import sys
from pathlib import Path

from PIL import Image

TILE_SIZE = 32
ENTITY_SIZE = 40

TILE_INDEX_GRASS_TOP = 0
TILE_INDEX_SAND_TOP = 40
TILE_INDEX_DIRT_FILL = 120
TILE_INDEX_BRICK = 6
TILE_INDEX_BOUNCE = 107
TILE_INDEX_COIN = 151
TILE_INDEX_HEART = 44
TILE_INDEX_SHIELD = 67
TILE_INDEX_SPEED = 152
CHARACTER_INDEX_BAT = 25
CHARACTER_INDEX_SPIKE_CRAWLER = 15
BACKGROUND_INDEX_GRASS_FAR = 0
BACKGROUND_INDEX_GRASS_NEAR = 9
BACKGROUND_INDEX_DESERT_FAR = 4
BACKGROUND_INDEX_DESERT_NEAR = 13


def load_and_upscale(path: Path, size: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    return im.resize((size, size), Image.NEAREST)


def save_strip(frames: list[Image.Image], path: Path) -> None:
    strip = Image.new("RGBA", (TILE_SIZE * len(frames), TILE_SIZE), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * TILE_SIZE, 0), frame)
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path)
    print(f"wrote {path} {strip.size}")


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    src = Path(sys.argv[1])
    tiles_dir = src / "Tiles"
    characters_dir = tiles_dir / "Characters"
    backgrounds_dir = tiles_dir / "Backgrounds"

    repo_root = Path(__file__).resolve().parent.parent
    tiles_out = repo_root / "public" / "assets" / "tiles"
    entities_out = repo_root / "public" / "assets" / "entities"
    items_out = repo_root / "public" / "assets" / "items"
    backgrounds_out = repo_root / "public" / "assets" / "backgrounds"

    def tile(index: int) -> Image.Image:
        return load_and_upscale(tiles_dir / f"tile_{index:04d}.png", TILE_SIZE)

    grass_top = tile(TILE_INDEX_GRASS_TOP)
    sand_top = tile(TILE_INDEX_SAND_TOP)
    dirt_fill = tile(TILE_INDEX_DIRT_FILL)
    brick = tile(TILE_INDEX_BRICK)
    bounce = tile(TILE_INDEX_BOUNCE)

    save_strip([grass_top, dirt_fill, brick, bounce], tiles_out / "tileset-grass.png")
    save_strip([sand_top, dirt_fill, brick, bounce], tiles_out / "tileset-desert.png")
    grass_top.save(tiles_out / "icon-grass.png")
    sand_top.save(tiles_out / "icon-desert.png")
    brick.save(tiles_out / "icon-brick.png")
    bounce.save(tiles_out / "icon-bounce.png")

    entities_out.mkdir(parents=True, exist_ok=True)
    bat = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_BAT:04d}.png", ENTITY_SIZE)
    spike = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_SPIKE_CRAWLER:04d}.png", ENTITY_SIZE)
    bat.save(entities_out / "bat.png")
    spike.save(entities_out / "spike-crawler.png")
    print(f"wrote {entities_out / 'bat.png'} {bat.size}")
    print(f"wrote {entities_out / 'spike-crawler.png'} {spike.size}")

    items_out.mkdir(parents=True, exist_ok=True)
    tile(TILE_INDEX_COIN).save(items_out / "coin.png")
    tile(TILE_INDEX_HEART).save(items_out / "heart.png")
    tile(TILE_INDEX_SHIELD).save(items_out / "shield.png")
    tile(TILE_INDEX_SPEED).save(items_out / "speed.png")
    print(f"wrote 4 item icons to {items_out}")

    def background(index: int) -> Image.Image:
        return Image.open(backgrounds_dir / f"tile_{index:04d}.png").convert("RGBA")

    backgrounds_out.mkdir(parents=True, exist_ok=True)
    background(BACKGROUND_INDEX_GRASS_FAR).save(backgrounds_out / "grass-far.png")
    background(BACKGROUND_INDEX_GRASS_NEAR).save(backgrounds_out / "grass-near.png")
    background(BACKGROUND_INDEX_DESERT_FAR).save(backgrounds_out / "desert-far.png")
    background(BACKGROUND_INDEX_DESERT_NEAR).save(backgrounds_out / "desert-near.png")
    print(f"wrote 4 background layers to {backgrounds_out}")


if __name__ == "__main__":
    main()
