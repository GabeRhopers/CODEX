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
    100 = snow-top dirt (theme: snow)
    120 = plain dirt, no cap ("buried" fill — shared by every theme)
    6   = brick/crate block (shared by every real-art theme)
    107 = compressed spring/bounce pad (shared by every real-art theme)
    33  = water surface (hazard block, shared by every real-art theme —
          castle draws its own procedural lava instead, see
          generateTextures.ts, keeping castle's established "never mixes
          real and procedural art within itself" rule)

Ground tiles need their baked-in border stripped; Brick/Bounce/Water
don't: the grass/sand/snow/dirt indices above are Kenney's
standalone-block variants, not the seamless-interior variants their own
Preview.png/SampleA.png demo actually uses — each one has a solid ~2px
bevel (RGB 67,74,95) baked into some or all of its 4 edges (confirmed
pixel-exact against the untouched 18x18 source, so it's not an artifact
of this script's own upscaling). Left in place, two placed-adjacent
ground tiles each contribute their own half of that bevel, and the
combined ~4px stripe reads as a visible gap/outline between blocks —
exactly the "huge gaps between blocks" bug this function fixes. Brick
keeps its border on purpose: unlike ground, it's meant to read as a
discrete block (matches the genre convention of a visibly-bordered brick
block, and this game already uses it as something visually distinct from
plain ground) — see load_terrain_tile below for the actual crop.

Characters/tile_00XX.png (24x24, separate sheet):
    25  = bat, flying (wings spread) — the live Bat enemy
    24  = bat, perched (wings folded) — reused as a purely decorative
          "Sleeping Bat" (Palette.ts's "decor" category), not an
          animation frame; the live enemy stays a single sprite
    15  = red pointy-topped crawler (spike crawler)
    8   = grey rock-monster face (Golem enemy)
    13  = gold trophy (decorative, shown on PlayScene's win banner —
          not a placeable brush)

Also from the main 20x9 sheet, saved alongside entities (functional, not
pure decoration — kept out of Decoration tiles below for that reason):
    28  = locked chest — opens for a score bonus when touched while
          holding a Key, consuming it; pairs with tile 27 above

Items, from the same 20x9 sheet as the ground tiles, upscaled like them:
    151 = coin
    44  = heart
    67  = blue gem/shield shape (used for the Shield item)
    152 = gold bar/gem (used for the Speed item — no literal potion in
          this pack; Feather has no source tile at all and is drawn
          procedurally instead, see generateTextures.ts)
    27  = gold key (Key item — pairs with the Chest entity below)

Decoration tiles (from the same 20x9 sheet, purely cosmetic — no
collision, no gameplay effect; see Palette.ts's "decor" category):
    16  = bush            126 = pine tree        127 = cactus
    148 = lamp post       156 = single cloud      145 = snowman
    124 = sprout/vine     108 = mushroom           68 = twin rocks

This script no longer touches the pack's Backgrounds/ sheet — the small
24x24 sky tiles it has (grass/desert/icy/jungle) were tried as parallax
background scenes, but even baked up to a large canvas they still read as
an obvious repeating grid of tiny icons up close, so they were dropped
from the background-scene pool entirely (see src/level/backgrounds.ts).
The pool's remaining non-procedural scenes are original painted art from
scripts/generate-painted-backgrounds.py, not derived from this pack.
"""

import sys
from pathlib import Path

from PIL import Image

TILE_SIZE = 32
ENTITY_SIZE = 40

TILE_INDEX_GRASS_TOP = 0
TILE_INDEX_SAND_TOP = 40
TILE_INDEX_SNOW_TOP = 100
TILE_INDEX_DIRT_FILL = 120
TILE_INDEX_BRICK = 6
TILE_INDEX_BOUNCE = 107
TILE_INDEX_WATER = 33
TILE_INDEX_COIN = 151
TILE_INDEX_HEART = 44
TILE_INDEX_SHIELD = 67
TILE_INDEX_SPEED = 152
TILE_INDEX_KEY = 27
TILE_INDEX_CHEST = 28
TILE_INDEX_BUSH = 16
TILE_INDEX_TREE = 126
TILE_INDEX_CACTUS = 127
TILE_INDEX_LAMP = 148
TILE_INDEX_CLOUD = 156
TILE_INDEX_SNOWMAN = 145
TILE_INDEX_SPROUT = 124
TILE_INDEX_MUSHROOM = 108
TILE_INDEX_ROCKS = 68
CHARACTER_INDEX_BAT = 25
CHARACTER_INDEX_BAT_PERCHED = 24
CHARACTER_INDEX_SPIKE_CRAWLER = 15
CHARACTER_INDEX_GOLEM = 8
CHARACTER_INDEX_TROPHY = 13


def load_and_upscale(path: Path, size: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    return im.resize((size, size), Image.NEAREST)


# Thickness (at the source's native 18px resolution) of the baked-in bevel
# border on Kenney's grass/sand/snow/dirt tiles — see the module docstring.
TERRAIN_BORDER_PX = 2


def load_terrain_tile(path: Path, size: int) -> Image.Image:
    """Like load_and_upscale, but for ground tiles only: crops away the
    source's baked-in border first so adjacent placed tiles merge into one
    seamless mass instead of each showing its own outline. Safe to apply
    uniformly on all 4 sides even where a given tile has no border on some
    of them (e.g. dirt_fill's top/bottom) — there's no border there to
    strip, so that edge just loses 2px of ordinary interior pattern, which
    tiles exactly the same way the un-cropped interior did."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    interior = im.crop((TERRAIN_BORDER_PX, TERRAIN_BORDER_PX, w - TERRAIN_BORDER_PX, h - TERRAIN_BORDER_PX))
    return interior.resize((size, size), Image.NEAREST)


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

    repo_root = Path(__file__).resolve().parent.parent
    tiles_out = repo_root / "public" / "assets" / "tiles"
    entities_out = repo_root / "public" / "assets" / "entities"
    items_out = repo_root / "public" / "assets" / "items"
    decor_out = repo_root / "public" / "assets" / "decor"

    def tile(index: int) -> Image.Image:
        return load_and_upscale(tiles_dir / f"tile_{index:04d}.png", TILE_SIZE)

    # Ground tiles merge seamlessly (border stripped); Brick/Bounce/Water
    # keep their border, since they're meant to read as distinct blocks —
    # see load_terrain_tile's docstring.
    grass_top = load_terrain_tile(tiles_dir / f"tile_{TILE_INDEX_GRASS_TOP:04d}.png", TILE_SIZE)
    sand_top = load_terrain_tile(tiles_dir / f"tile_{TILE_INDEX_SAND_TOP:04d}.png", TILE_SIZE)
    snow_top = load_terrain_tile(tiles_dir / f"tile_{TILE_INDEX_SNOW_TOP:04d}.png", TILE_SIZE)
    dirt_fill = load_terrain_tile(tiles_dir / f"tile_{TILE_INDEX_DIRT_FILL:04d}.png", TILE_SIZE)
    brick = tile(TILE_INDEX_BRICK)
    bounce = tile(TILE_INDEX_BOUNCE)
    water = tile(TILE_INDEX_WATER)

    # Frame order matches groundAutotile.ts's GROUND_FRAME_* constants:
    # [top, fill, brick, bounce, water].
    save_strip([grass_top, dirt_fill, brick, bounce, water], tiles_out / "tileset-grass.png")
    save_strip([sand_top, dirt_fill, brick, bounce, water], tiles_out / "tileset-desert.png")
    save_strip([snow_top, dirt_fill, brick, bounce, water], tiles_out / "tileset-snow.png")
    grass_top.save(tiles_out / "icon-grass.png")
    sand_top.save(tiles_out / "icon-desert.png")
    snow_top.save(tiles_out / "icon-snow.png")
    brick.save(tiles_out / "icon-brick.png")
    bounce.save(tiles_out / "icon-bounce.png")
    water.save(tiles_out / "icon-water.png")

    entities_out.mkdir(parents=True, exist_ok=True)
    bat = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_BAT:04d}.png", ENTITY_SIZE)
    bat_perched = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_BAT_PERCHED:04d}.png", ENTITY_SIZE)
    spike = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_SPIKE_CRAWLER:04d}.png", ENTITY_SIZE)
    golem = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_GOLEM:04d}.png", ENTITY_SIZE)
    trophy = load_and_upscale(characters_dir / f"tile_{CHARACTER_INDEX_TROPHY:04d}.png", TILE_SIZE)
    bat.save(entities_out / "bat.png")
    bat_perched.save(entities_out / "bat-perched.png")
    spike.save(entities_out / "spike-crawler.png")
    golem.save(entities_out / "golem.png")
    trophy.save(entities_out / "trophy.png")
    tile(TILE_INDEX_CHEST).save(entities_out / "chest.png")
    print(f"wrote 6 entity/decoration sprites to {entities_out}")

    items_out.mkdir(parents=True, exist_ok=True)
    tile(TILE_INDEX_COIN).save(items_out / "coin.png")
    tile(TILE_INDEX_HEART).save(items_out / "heart.png")
    tile(TILE_INDEX_SHIELD).save(items_out / "shield.png")
    tile(TILE_INDEX_SPEED).save(items_out / "speed.png")
    tile(TILE_INDEX_KEY).save(items_out / "key.png")
    print(f"wrote 5 item icons to {items_out}")

    decor_out.mkdir(parents=True, exist_ok=True)
    tile(TILE_INDEX_BUSH).save(decor_out / "bush.png")
    tile(TILE_INDEX_TREE).save(decor_out / "tree.png")
    tile(TILE_INDEX_CACTUS).save(decor_out / "cactus.png")
    tile(TILE_INDEX_LAMP).save(decor_out / "lamp.png")
    tile(TILE_INDEX_CLOUD).save(decor_out / "cloud.png")
    tile(TILE_INDEX_SNOWMAN).save(decor_out / "snowman.png")
    tile(TILE_INDEX_SPROUT).save(decor_out / "sprout.png")
    tile(TILE_INDEX_MUSHROOM).save(decor_out / "mushroom.png")
    tile(TILE_INDEX_ROCKS).save(decor_out / "rocks.png")
    print(f"wrote 10 decoration sprites to {decor_out}")


if __name__ == "__main__":
    main()
