#!/usr/bin/env python3
"""Generates the theme-independent "background scene" parallax art under
public/assets/backgrounds/scenes/ — original pixel-art paintings (not
derived from any third-party pack, unlike prepare-kenney-assets.py),
requested to replace the small 24px Kenney sky tiles that made the old
parallax background's repeat obvious at normal level widths.

Each scene is two layers, both PNGs at GAME_WIDTH*LOOP_FACTOR (2048px, vs.
the game's 1180px canvas) by GAME_HEIGHT (476px) so ParallaxBackground can
render them at tileScale=1 with no vertical stretch:
  - "<scene>-far.png"  — opaque sky gradient + stars + moon, the slow layer.
  - "<scene>-near.png" — transparent above a silhouette (rolling waves,
    a building skyline, a mountain ridge), the faster layer, composited on
    top of "far" by the game so the sky shows through above the silhouette.

Why 2048px wide fixes the "repeating" complaint: ParallaxBackground offsets
tilePositionX by playerX*factor every frame. With today's size cap
(MAX_GRID_COLS*TILE_SIZE=1920px of level width) and the near layer's 0.15
factor, the total scroll range is under 300px — nowhere near this image's
width, so the tile boundary is never actually seen in play, unlike the old
96px-wide (24px source * 4x tileScale) Kenney sky tile repeating every few
player-widths.

Reproducible: every random placement below is seeded, so re-running this
script regenerates byte-identical output. Not part of the build — run it
once, commit the PNGs, same as prepare-kenney-assets.py.
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH = 2048
HEIGHT = 476

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "assets" / "backgrounds" / "scenes"


def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def banded_sky(top_color, bottom_color, bands=14):
    img = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(img)
    band_height = HEIGHT / bands
    for band in range(bands):
        t = band / (bands - 1)
        color = lerp_color(top_color, bottom_color, t)
        y0 = int(band * band_height)
        y1 = int((band + 1) * band_height) if band < bands - 1 else HEIGHT
        draw.rectangle([0, y0, WIDTH, y1], fill=color)
    return img


def add_stars(draw, count, seed, color, max_y_frac=0.72):
    rng = random.Random(seed)
    for _ in range(count):
        x = rng.randint(0, WIDTH - 1)
        y = rng.randint(0, int(HEIGHT * max_y_frac))
        size = 2 if rng.random() > 0.82 else 1
        draw.rectangle([x, y, x + size - 1, y + size - 1], fill=color)


def add_moon(draw, cx, cy, radius, color, outline):
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color, outline=outline, width=2)
    # A couple of soft craters, same trick used on the wizard/ghost art:
    # small darker-shade ellipses, not full shading, to avoid a flat disc.
    shade = tuple(max(0, c - 20) for c in color)
    draw.ellipse([cx - radius * 0.35, cy - radius * 0.3, cx + radius * 0.05, cy + radius * 0.1], fill=shade)
    draw.ellipse([cx + radius * 0.15, cy + radius * 0.25, cx + radius * 0.45, cy + radius * 0.5], fill=shade)


def ridge_points(base_y, amplitude, seed, step=28, walk=True):
    """A left-to-right ridge line via random walk (jagged, for mountains) or
    a smoothed variant (rolling, for waves) — see `smooth` below."""
    rng = random.Random(seed)
    points = []
    y = base_y
    x = 0
    while x < WIDTH:
        points.append((x, y))
        if walk:
            y += rng.randint(-amplitude, amplitude)
            y = max(base_y - amplitude * 3, min(base_y + amplitude, y))
        x += step
    points.append((WIDTH, points[-1][1]))
    return points


def smooth(points, passes=2):
    for _ in range(passes):
        smoothed = [points[0]]
        for i in range(1, len(points) - 1):
            x, y = points[i]
            _, y0 = points[i - 1]
            _, y1 = points[i + 1]
            smoothed.append((x, (y0 + y + y1) / 3))
        smoothed.append(points[-1])
        points = smoothed
    return points


def filled_silhouette(img_rgba, points, color):
    draw = ImageDraw.Draw(img_rgba)
    polygon = list(points) + [(WIDTH, HEIGHT), (0, HEIGHT)]
    draw.polygon(polygon, fill=color)
    return points


def generate_pirate_cove():
    far = banded_sky((35, 30, 70), (120, 100, 150))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 90, seed=101, color=(232, 228, 252))
    add_moon(draw_far, int(WIDTH * 0.14), int(HEIGHT * 0.2), 34, (245, 240, 222), (205, 194, 172))

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ridge = smooth(ridge_points(int(HEIGHT * 0.66), amplitude=22, seed=202, step=32), passes=3)
    silhouette_color = (22, 26, 52, 255)
    filled_silhouette(near, ridge, silhouette_color)

    # A couple of distant ship masts poking over the horizon — evokes the
    # cove without drawing a full ship (kept simple on purpose).
    draw_near = ImageDraw.Draw(near)
    rng = random.Random(303)

    def ridge_y_at(x):
        for i in range(len(ridge) - 1):
            x0, y0 = ridge[i]
            x1, y1 = ridge[i + 1]
            if x0 <= x <= x1:
                t = 0 if x1 == x0 else (x - x0) / (x1 - x0)
                return y0 + (y1 - y0) * t
        return ridge[-1][1]

    for mast_x in (int(WIDTH * 0.30), int(WIDTH * 0.63), int(WIDTH * 0.86)):
        base_y = ridge_y_at(mast_x)
        mast_h = rng.randint(46, 70)
        draw_near.line([(mast_x, base_y), (mast_x, base_y - mast_h)], fill=silhouette_color, width=3)
        flag_w = rng.randint(16, 24)
        draw_near.polygon(
            [
                (mast_x, base_y - mast_h),
                (mast_x + flag_w, base_y - mast_h + 6),
                (mast_x, base_y - mast_h + 12),
            ],
            fill=silhouette_color,
        )
    return far, near


def generate_overgrown_ruins():
    far = banded_sky((10, 22, 34), (36, 60, 76))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 110, seed=111, color=(220, 232, 236))
    add_moon(draw_far, int(WIDTH * 0.84), int(HEIGHT * 0.17), 30, (226, 235, 240), (172, 192, 198))

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    silhouette_color = (17, 27, 33, 255)
    draw_near = ImageDraw.Draw(near)
    rng = random.Random(212)
    base_y = int(HEIGHT * 0.58)
    x = 0
    while x < WIDTH:
        w = rng.randint(64, 168)
        h = rng.randint(40, 200)
        top = base_y - h
        draw_near.rectangle([x, top, x + w, HEIGHT], fill=silhouette_color)
        # occasional thin antenna
        if rng.random() > 0.6:
            ax = x + w // 2
            draw_near.line([(ax, top), (ax, top - rng.randint(18, 34))], fill=silhouette_color, width=2)
        # occasional tree-blob perched on the rooftop (the "overgrown" cue)
        if rng.random() > 0.45:
            bx = x + rng.randint(8, max(9, w - 8))
            br = rng.randint(10, 18)
            blob_color = (30, 66, 46, 255)
            draw_near.ellipse([bx - br, top - br * 1.3, bx + br, top + br * 0.3], fill=blob_color)
        x += w + rng.randint(-10, 18)
    return far, near


def generate_snowy_peaks():
    far = banded_sky((20, 28, 58), (58, 80, 118))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 100, seed=121, color=(233, 240, 255))
    add_moon(draw_far, int(WIDTH * 0.20), int(HEIGHT * 0.16), 28, (240, 245, 250), (192, 202, 217))

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ridge = ridge_points(int(HEIGHT * 0.56), amplitude=70, seed=222, step=44, walk=True)
    silhouette_color = (44, 58, 78, 255)
    filled_silhouette(near, ridge, silhouette_color)
    draw_near = ImageDraw.Draw(near)

    # Snow caps on the tallest local peaks.
    snow_color = (214, 224, 236, 255)
    for i in range(1, len(ridge) - 1):
        x, y = ridge[i]
        _, y_prev = ridge[i - 1]
        _, y_next = ridge[i + 1]
        is_peak = y < y_prev and y < y_next and y < int(HEIGHT * 0.56) - 40
        if is_peak:
            cap = 22
            draw_near.polygon(
                [(x - cap, y + cap * 0.7), (x, y), (x + cap, y + cap * 0.7)],
                fill=snow_color,
            )

    # One volcano accent: pick a mid-height peak, add a small glow + smoke.
    volcano_x, volcano_y = ridge[len(ridge) // 3]
    glow_color = (255, 140, 60, 255)
    draw_near.ellipse(
        [volcano_x - 6, volcano_y - 4, volcano_x + 6, volcano_y + 6],
        fill=glow_color,
    )
    smoke_color = (120, 120, 130, 140)
    sx, sy = volcano_x + 2, volcano_y - 6
    for i in range(5):
        r = 4 + i * 2
        draw_near.ellipse(
            [sx - r, sy - i * 12 - r, sx + r, sy - i * 12 + r],
            fill=smoke_color,
        )
    return far, near


SCENES = {
    "pirate-cove": generate_pirate_cove,
    "overgrown-ruins": generate_overgrown_ruins,
    "snowy-peaks": generate_snowy_peaks,
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, generator in SCENES.items():
        far, near = generator()
        far.save(OUT_DIR / f"{name}-far.png")
        near.save(OUT_DIR / f"{name}-near.png")
        print(f"wrote {name}-far.png / {name}-near.png")


if __name__ == "__main__":
    main()
