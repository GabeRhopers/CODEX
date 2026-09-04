#!/usr/bin/env python3
"""Generates the theme-independent "background scene" parallax art under
public/assets/backgrounds/scenes/ — original pixel-art paintings (not
derived from any third-party pack, unlike prepare-kenney-assets.py).

Each scene is two layers, both PNGs at WIDTH=2048 (vs. the game's 1180px
canvas) by HEIGHT=476 (matching GAME_HEIGHT exactly) so
ParallaxBackground.ts's zoom+clamped-pan renderer can show it with no
vertical stretch and comfortable horizontal pan room:
  - "<scene>-far.png"  — opaque sky (gradient + stars/sun/moon/clouds), the
    slow layer.
  - "<scene>-near.png" — transparent above a painted silhouette (ship,
    ruins, mountains, hills), the faster layer, composited on top of "far"
    by the game so the sky shows through above it.

These four scenes were commissioned to match specific reference images
provided by the project owner (a pirate-ship cove, an overgrown ruined
city, a snowy volcano range, and a sunny green valley) — recreated here
as original art rather than reproduced pixel-for-pixel, since this
script has no access to the reference files themselves, only their
descriptions. `pirate-cove`/`overgrown-ruins`/`snowy-peaks` replace
earlier, sparser versions of the same three scenes; `green-valley` is
new and is the pool's default (see backgrounds.ts).

Not part of the build — run it once, commit the PNGs, same as
prepare-kenney-assets.py.

**Its output is NOT byte-identical on a re-run, despite the seeding.** That was
claimed here and checked on 2026-09-04 before deleting the committed art on the
strength of it: six of the eight files reproduce exactly, and `green-valley`'s
two do not. Whatever drifts (an unseeded call in its generator, a Pillow version
difference, or a later hand-edit) has not been chased down, because the art is
committed and that is what the game would use. Treat the committed PNGs as the
source of truth, not this script.

The art lives in `art-source/parallax-scenes/`, deliberately *outside*
`public/`: it is dormant (see BootScene's commented-out preload) and Vite copies
`public/` verbatim, so leaving it there shipped 1.8MB to every visitor for art
nothing loads. Move it back under public/assets/backgrounds/scenes/ when the
parallax picker returns.
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH = 2048
HEIGHT = 476

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "art-source" / "parallax-scenes"


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
    shade = tuple(max(0, c - 20) for c in color)
    draw.ellipse([cx - radius * 0.35, cy - radius * 0.3, cx + radius * 0.05, cy + radius * 0.1], fill=shade)
    draw.ellipse([cx + radius * 0.15, cy + radius * 0.25, cx + radius * 0.45, cy + radius * 0.5], fill=shade)


def add_crescent_moon(draw, cx, cy, radius, moon_color, bite_color):
    """A thinner crescent (vs. add_moon's full disc): draw the full moon,
    then "bite" it with an offset same-size circle in the sky color behind
    it, since PIL has no cheap boolean subtract for a filled arc."""
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=moon_color)
    bx, by = cx + int(radius * 0.55), cy - int(radius * 0.35)
    draw.ellipse([bx - radius, by - radius, bx + radius, by + radius], fill=bite_color)


def add_sun(draw, cx, cy, radius, color, glow_color):
    draw.ellipse([cx - radius - 10, cy - radius - 10, cx + radius + 10, cy + radius + 10], fill=glow_color)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color)


def add_cloud(draw, cx, cy, scale, color):
    r = int(11 * scale)
    for ox, oy in [(-2.1 * r, 0.35 * r), (-r, -0.15 * r), (0, -0.4 * r), (r, -0.15 * r), (2.1 * r, 0.35 * r), (0, 0.5 * r)]:
        draw.ellipse([cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r], fill=color)


def ridge_points(base_y, amplitude, seed, step=28, walk=True):
    """A left-to-right ridge line via random walk (jagged, for mountains) or
    a smoothed variant (rolling, for hills/waves) — see `smooth` below."""
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


def ridge_y_at(ridge, x):
    for i in range(len(ridge) - 1):
        x0, y0 = ridge[i]
        x1, y1 = ridge[i + 1]
        if x0 <= x <= x1:
            t = 0 if x1 == x0 else (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return ridge[-1][1]


def add_pine(draw, cx, base_y, h, color, trunk_color=(40, 30, 24, 255)):
    w = h * 0.6
    draw.rectangle([cx - 2, base_y - h * 0.22, cx + 2, base_y], fill=trunk_color)
    for i, t in enumerate((0.0, 0.35, 0.65)):
        tier_w = w * (1 - t * 0.6)
        tier_y = base_y - h * 0.18 - t * h * 0.55
        draw.polygon(
            [(cx, tier_y - h * 0.35), (cx - tier_w / 2, tier_y), (cx + tier_w / 2, tier_y)],
            fill=color,
        )


def add_palm(draw, cx, base_y, h, color):
    """A curved trunk + a fan of frond spikes, silhouette-style."""
    lean = h * 0.18
    top = (cx + lean, base_y - h)
    mid = (cx + lean * 0.5, base_y - h * 0.55)
    draw.line([mid, (cx, base_y)], fill=color, width=5)
    draw.line([top, mid], fill=color, width=5)
    for ang_x, ang_y in [(-1.0, -0.15), (-0.6, -0.55), (-0.1, -0.75), (0.5, -0.6), (0.95, -0.2), (0.7, 0.15), (-0.7, 0.2)]:
        tip = (top[0] + ang_x * h * 0.32, top[1] + ang_y * h * 0.32)
        draw.line([top, tip], fill=color, width=4)


def generate_pirate_cove():
    """Ghost-ship cove at night: purple/indigo sky, crescent moon, distant
    islets on the horizon (far); dark water, a wrecked three-mast galleon
    flying a skull flag, and flanking palm-tree silhouettes (near)."""
    far = banded_sky((28, 22, 58), (118, 96, 150))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 110, seed=101, color=(232, 228, 252))
    moon_y = int(HEIGHT * 0.16)
    add_crescent_moon(draw_far, int(WIDTH * 0.16), moon_y, 30, (245, 240, 222), lerp_color((28, 22, 58), (118, 96, 150), moon_y / HEIGHT))
    islet_color = (24, 40, 46)
    horizon_y = int(HEIGHT * 0.62)
    for ix, iw, ih in [(0.06, 90, 14), (0.36, 130, 10), (0.94, 110, 16)]:
        cx = int(WIDTH * ix)
        draw_far.ellipse([cx - iw, horizon_y - ih, cx + iw, horizon_y + ih], fill=islet_color)
        for tx_frac, th in [(-0.4, 26), (0.1, 34), (0.5, 24)]:
            add_palm(draw_far, cx + int(iw * tx_frac), horizon_y - ih // 2, th, islet_color)

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_near = ImageDraw.Draw(near)
    water_y = int(HEIGHT * 0.68)
    water_color = (18, 30, 54, 255)
    draw_near.rectangle([0, water_y, WIDTH, HEIGHT], fill=water_color)
    ripple_color = (40, 58, 92, 140)
    rng = random.Random(505)
    for _ in range(70):
        rx = rng.randint(0, WIDTH)
        ry = rng.randint(water_y + 6, HEIGHT - 4)
        rw = rng.randint(18, 60)
        draw_near.line([(rx, ry), (rx + rw, ry)], fill=ripple_color, width=2)

    hull_color = (26, 20, 18, 255)
    sail_color = (34, 30, 40, 235)
    cx = int(WIDTH * 0.5)
    deck_y = water_y - 8
    hull_w = 460
    draw_near.polygon(
        [
            (cx - hull_w / 2, deck_y - 46),
            (cx + hull_w / 2, deck_y - 46),
            (cx + hull_w / 2 - 40, deck_y + 34),
            (cx - hull_w / 2 + 60, deck_y + 34),
        ],
        fill=hull_color,
    )
    draw_near.polygon(
        [(cx - hull_w / 2 + 60, deck_y + 34), (cx + hull_w / 2 - 40, deck_y + 34), (cx + hull_w / 2 - 90, deck_y + 60), (cx - hull_w / 2 + 100, deck_y + 60)],
        fill=hull_color,
    )
    for mx_frac, mh, sail_w in [(-0.30, 190, 90), (0.0, 230, 110), (0.30, 170, 80)]:
        mx = cx + int(hull_w * mx_frac)
        base = deck_y - 40
        top = base - mh
        draw_near.line([(mx, base), (mx, top)], fill=hull_color, width=6)
        for i in range(2):
            sy0 = top + 20 + i * 70
            sy1 = sy0 + 46
            tatter = [(mx, sy0), (mx + sail_w, sy0 + 14), (mx + sail_w * 0.7, sy1), (mx + sail_w * 0.3, sy1 - 8), (mx, sy1)]
            draw_near.polygon(tatter, fill=sail_color)
        if mx_frac == 0.0:
            fx, fy = mx, top
            draw_near.polygon([(fx, fy), (fx + 46, fy + 10), (fx, fy + 24)], fill=hull_color)
            skull_cx, skull_cy = fx + 20, fy + 12
            draw_near.ellipse([skull_cx - 5, skull_cy - 5, skull_cx + 5, skull_cy + 5], fill=(220, 220, 220, 255))
            draw_near.line([(skull_cx - 8, skull_cy + 6), (skull_cx + 8, skull_cy - 2)], fill=(220, 220, 220, 255), width=2)
            draw_near.line([(skull_cx - 8, skull_cy - 2), (skull_cx + 8, skull_cy + 6)], fill=(220, 220, 220, 255), width=2)

    beach_y = int(HEIGHT * 0.9)
    sand_color = (58, 50, 40, 255)
    draw_near.rectangle([0, beach_y, WIDTH, HEIGHT], fill=sand_color)
    palm_color = (16, 14, 20, 255)
    for px, ph in [(int(WIDTH * 0.04), 210), (int(WIDTH * 0.09), 150), (int(WIDTH * 0.96), 220)]:
        add_palm(draw_near, px, beach_y + 10, ph, palm_color)
    rock_color = (46, 44, 42, 255)
    for rx, ry, rr in [(int(WIDTH * 0.90), HEIGHT - 30, 26), (int(WIDTH * 0.985), HEIGHT - 20, 34)]:
        draw_near.ellipse([rx - rr, ry - rr * 0.7, rx + rr, ry + rr * 0.7], fill=rock_color)
    return far, near


def generate_overgrown_ruins():
    """A nature-reclaimed city at night: teal sky, crescent moon (far);
    moss-covered towers with window grids and hanging vines, an elevated
    train line with two stalled cars, a "?" block easter egg, and a
    ground-level stream between broken platforms (near)."""
    far = banded_sky((8, 20, 30), (34, 58, 72))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 130, seed=111, color=(220, 232, 236))
    moon_y = int(HEIGHT * 0.15)
    add_crescent_moon(draw_far, int(WIDTH * 0.86), moon_y, 26, (226, 235, 240), lerp_color((8, 20, 30), (34, 58, 72), moon_y / HEIGHT))

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_near = ImageDraw.Draw(near)
    building_color = (32, 42, 48, 255)
    window_color = (86, 108, 108, 200)
    vine_color = (48, 92, 58, 235)
    rng = random.Random(212)
    base_y = int(HEIGHT * 0.62)
    x = 0
    while x < WIDTH:
        w = rng.randint(70, 180)
        h = rng.randint(160, 330)
        top = base_y - h + rng.randint(-20, 40)
        draw_near.rectangle([x, top, x + w, HEIGHT], fill=building_color)
        cols = max(2, w // 28)
        rows = max(3, int((HEIGHT - top) // 30))
        for r in range(rows):
            for c in range(cols):
                if rng.random() > 0.35:
                    wx = x + 8 + c * 28
                    wy = top + 10 + r * 30
                    if wx + 14 < x + w and wy + 16 < HEIGHT:
                        draw_near.rectangle([wx, wy, wx + 14, wy + 16], fill=window_color)
        if rng.random() > 0.45:
            for _ in range(rng.randint(1, 3)):
                vx = x + rng.randint(6, max(7, w - 6))
                vlen = rng.randint(40, 110)
                pts = [(vx, top)]
                yy = top
                while yy < top + vlen:
                    yy += 14
                    pts.append((pts[-1][0] + rng.randint(-4, 4), yy))
                draw_near.line(pts, fill=vine_color, width=3)
        if rng.random() > 0.7:
            ax = x + w // 2
            draw_near.line([(ax, top), (ax, top - rng.randint(18, 34))], fill=building_color, width=2)
        x += w + rng.randint(-10, 18)

    bridge_y = int(HEIGHT * 0.42)
    bridge_color = (26, 34, 38, 255)
    bx0, bx1 = int(WIDTH * 0.30), int(WIDTH * 0.66)
    draw_near.rectangle([bx0, bridge_y, bx1, bridge_y + 14], fill=bridge_color)
    for px in range(bx0 + 30, bx1, 90):
        draw_near.line([(px, bridge_y + 14), (px, HEIGHT)], fill=bridge_color, width=6)
    car_color = (58, 70, 62, 255)
    for cxo in (bx0 + 30, bx0 + 190):
        draw_near.rectangle([cxo, bridge_y - 34, cxo + 150, bridge_y], fill=car_color)
        for wx in range(cxo + 12, cxo + 140, 34):
            draw_near.rectangle([wx, bridge_y - 26, wx + 18, bridge_y - 12], fill=window_color)
        draw_near.line([(cxo, bridge_y - 8), (cxo + 150, bridge_y - 8)], fill=vine_color, width=3)

    block_x, block_y = int(WIDTH * 0.78), int(HEIGHT * 0.30)
    draw_near.rectangle([block_x, block_y, block_x + 26, block_y + 26], fill=(150, 120, 60, 255), outline=(20, 16, 10, 255), width=2)
    draw_near.text((block_x + 8, block_y + 4), "?", fill=(20, 16, 10, 255))

    light_x, light_y = int(WIDTH * 0.20), int(HEIGHT * 0.55)
    draw_near.line([(light_x, light_y), (light_x, light_y + 60)], fill=(20, 20, 20, 255), width=3)
    draw_near.rectangle([light_x - 6, light_y - 24, light_x + 6, light_y], fill=(20, 20, 20, 255))
    draw_near.ellipse([light_x - 4, light_y - 20, light_x + 4, light_y - 12], fill=(220, 60, 50, 255))

    stream_y = HEIGHT - 34
    stream_color = (40, 78, 110, 220)
    draw_near.rectangle([int(WIDTH * 0.42), stream_y, int(WIDTH * 0.58), HEIGHT], fill=stream_color)
    return far, near


def generate_snowy_peaks():
    """A dusk-lit alpine range: pale blue-grey sky with drifting clouds and
    faint stars (far); a jagged snow-capped ridge line, one glowing/smoking
    volcano, and scattered foreground pines with a frozen pond (near)."""
    far = banded_sky((150, 168, 196), (208, 220, 236))
    draw_far = ImageDraw.Draw(far)
    add_stars(draw_far, 40, seed=121, color=(255, 255, 255), max_y_frac=0.4)
    cloud_color = (232, 238, 246)
    for cx_frac, cy_frac, scale in [(0.10, 0.10, 1.3), (0.32, 0.06, 1.0), (0.58, 0.13, 1.5), (0.80, 0.07, 1.1), (0.95, 0.15, 0.9)]:
        add_cloud(draw_far, int(WIDTH * cx_frac), int(HEIGHT * cy_frac), scale, cloud_color)

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ridge = ridge_points(int(HEIGHT * 0.56), amplitude=70, seed=222, step=44, walk=True)
    silhouette_color = (78, 96, 122, 255)
    filled_silhouette(near, ridge, silhouette_color)
    draw_near = ImageDraw.Draw(near)

    snow_color = (230, 238, 248, 255)
    for i in range(1, len(ridge) - 1):
        x, y = ridge[i]
        _, y_prev = ridge[i - 1]
        _, y_next = ridge[i + 1]
        is_peak = y < y_prev and y < y_next and y < int(HEIGHT * 0.56) - 40
        if is_peak:
            cap = 24
            draw_near.polygon([(x - cap, y + cap * 0.7), (x, y), (x + cap, y + cap * 0.7)], fill=snow_color)

    volcano_x, volcano_y = ridge[len(ridge) // 3]
    lava_color = (255, 120, 40, 255)
    dark_lava = (200, 70, 20, 255)
    draw_near.polygon(
        [(volcano_x - 18, volcano_y + 20), (volcano_x - 6, volcano_y - 2), (volcano_x + 6, volcano_y - 2), (volcano_x + 18, volcano_y + 20)],
        fill=dark_lava,
    )
    draw_near.ellipse([volcano_x - 8, volcano_y - 6, volcano_x + 8, volcano_y + 8], fill=lava_color)
    smoke_color = (110, 112, 122, 150)
    sx, sy = volcano_x + 2, volcano_y - 10
    for i in range(6):
        r = 5 + i * 3
        draw_near.ellipse([sx - r, sy - i * 14 - r, sx + r, sy - i * 14 + r], fill=smoke_color)

    fg_y = int(HEIGHT * 0.86)
    fg_color = (218, 228, 238, 255)
    draw_near.rectangle([0, fg_y, WIDTH, HEIGHT], fill=fg_color)
    rng = random.Random(707)
    pine_color = (52, 74, 66, 255)
    x = 20
    while x < WIDTH:
        h = rng.randint(30, 56)
        add_pine(draw_near, x, fg_y + rng.randint(4, 20), h, pine_color, trunk_color=(60, 48, 44, 255))
        x += rng.randint(70, 160)
    pond_x, pond_w = int(WIDTH * 0.22), 180
    draw_near.ellipse([pond_x - pond_w / 2, fg_y + 20, pond_x + pond_w / 2, fg_y + 60], fill=(150, 190, 214, 255))
    return far, near


def generate_green_valley():
    """A bright, sunny grass-theme valley: sky-blue gradient, sun, drifting
    clouds (far); two-tone rolling hills, a winding path, grazing sheep,
    tree-lined slopes, and a grassy foreground with rock outcrops (near).
    This is the pool's default scene (see backgrounds.ts)."""
    far = banded_sky((90, 196, 224), (176, 226, 232), bands=10)
    draw_far = ImageDraw.Draw(far)
    add_sun(draw_far, int(WIDTH * 0.66), int(HEIGHT * 0.16), 40, (250, 190, 90), (250, 214, 140))
    cloud_color = (255, 255, 255)
    for cx_frac, cy_frac, scale in [(0.08, 0.14, 1.4), (0.24, 0.08, 1.0), (0.50, 0.05, 0.8), (0.90, 0.12, 1.5)]:
        add_cloud(draw_far, int(WIDTH * cx_frac), int(HEIGHT * cy_frac), scale, cloud_color)

    near = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_near = ImageDraw.Draw(near)

    far_hill = smooth(ridge_points(int(HEIGHT * 0.42), amplitude=50, seed=808, step=48), passes=3)
    filled_silhouette(near, far_hill, (150, 202, 112, 255))
    rng = random.Random(909)
    tree_color = (58, 118, 66, 255)
    for i in range(6, len(far_hill) - 6, 5):
        if rng.random() > 0.55:
            x, y = far_hill[i]
            add_pine(draw_near, x, int(y) + 6, rng.randint(26, 40), tree_color, trunk_color=(70, 52, 34, 255))

    near_hill = smooth(ridge_points(int(HEIGHT * 0.64), amplitude=36, seed=616, step=40), passes=2)
    filled_silhouette(near, near_hill, (104, 168, 78, 255))

    path_color = (198, 172, 120, 255)
    path_top = ridge_y_at(near_hill, int(WIDTH * 0.5))
    pts = [(int(WIDTH * 0.5) + int(24 * ((-1) ** i)), int(path_top + i * 26)) for i in range(9)]
    draw_near.line(pts, fill=path_color, width=22)

    sheep_color = (245, 245, 240, 255)
    head_color = (60, 54, 50, 255)
    for fx, fy in [(0.40, 0.80), (0.44, 0.815), (0.47, 0.79), (0.52, 0.805), (0.55, 0.82)]:
        cx, cy = int(WIDTH * fx), int(HEIGHT * fy)
        draw_near.ellipse([cx - 9, cy - 6, cx + 9, cy + 6], fill=sheep_color)
        draw_near.ellipse([cx - 13, cy - 4, cx - 6, cy + 3], fill=head_color)

    fg_y = int(HEIGHT * 0.88)
    fg_color = (86, 148, 64, 255)
    draw_near.rectangle([0, fg_y, WIDTH, HEIGHT], fill=fg_color)
    blade_color = (74, 134, 54, 255)
    for bx in range(0, WIDTH, 14):
        bh = 6 + (bx * 37) % 10
        draw_near.line([(bx, fg_y), (bx + 3, fg_y - bh)], fill=blade_color, width=2)
    rock_color = (120, 120, 118, 255)
    rock_outline = (40, 40, 38, 255)
    for rx, ry, rr in [(int(WIDTH * 0.015), HEIGHT - 10, 40), (int(WIDTH * 0.985), HEIGHT - 6, 48)]:
        draw_near.ellipse([rx - rr, ry - rr * 0.8, rx + rr, ry + rr * 0.8], fill=rock_color, outline=rock_outline, width=3)
    return far, near


SCENES = {
    "green-valley": generate_green_valley,
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
