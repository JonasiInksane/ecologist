#!/usr/bin/env python3
"""Draws the campaign backdrop (godot/art/backdrop/): the town behind the plot, in three parallax layers.

far.png   hills, a pine ridge, the church and a huddle of roofs, hazed toward the horizon sky
mid.png   houses with tiled roofs and plastered walls between round trees, lightly hazed
near.png  big trees and hedges just behind the plot
*-lights.png  the windows of far and mid, lit, for dusk and night (backdrop.gd fades them in)
clouds.png    four clouds; sky.png the sun and the moon

Every layer tiles horizontally (1024 pixels) and stands on its bottom row, which backdrop.gd puts on the horizon.
Colours come from tools/palette.py; the haze is a fixed blend toward the day horizon, so the layers stay in the
palette's family while reading as distant. Usage: python3 tools/make-backdrop.py
"""
import math
import random
from pathlib import Path
from PIL import Image

from palette import ramp, hex_color

OUT = Path(__file__).resolve().parent.parent / "godot" / "art" / "backdrop"
W = 1024
INK, WOOD, LEAF, PINE = ramp("ink"), ramp("wood"), ramp("leaf"), ramp("pine")
TERRA, BRICK, PLASTER, ROCK = ramp("terracotta"), ramp("brick"), ramp("plaster"), ramp("rock")
SKY, GLOW, WHITE, BLUE, CONCRETE = ramp("sky"), ramp("glow"), ramp("white"), ramp("blue"), ramp("concrete")
HORIZON = hex_color("#c4dcf0")


def mix(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


class Layer:
    def __init__(self, height, haze):
        self.img = Image.new("RGBA", (W, height), (0, 0, 0, 0))
        self.lights = Image.new("RGBA", (W, height), (0, 0, 0, 0))
        self.px = self.img.load()
        self.lx = self.lights.load()
        self.h = height
        self.haze = haze

    def put(self, x, y, color, light=False):
        if 0 <= y < self.h:
            if light:
                self.lx[x % W, y] = color + (255,)
            else:
                self.px[x % W, y] = mix(color, HORIZON, self.haze) + (255,)

    def get(self, x, y):
        return self.px[x % W, y] if 0 <= y < self.h else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, color, light=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, color, light)

    def outline(self, color):
        """A one-pixel outline around everything drawn so far (the far layer skips it)."""
        src = self.img.copy().load()
        c = mix(color, HORIZON, self.haze) + (255,)
        for y in range(self.h):
            for x in range(W):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny = y + dy
                    if 0 <= ny < self.h and src[(x + dx) % W, ny][3]:
                        self.px[x, y] = c
                        break

    def save(self, name, lights=True):
        self.img.save(OUT / f"{name}.png")
        if lights:
            self.lights.save(OUT / f"{name}-lights.png")


def wrap_noise(x, period, octaves, seed):
    """Smooth noise that repeats every `period` pixels."""
    rng = random.Random(seed)
    total = 0.0
    for o in range(octaves):
        k = 2 ** o + 1
        phase = rng.random() * math.tau
        total += math.sin(x / period * math.tau * k + phase) / (o + 1.4)
    return total


# ---- shapes -------------------------------------------------------------------------------------------------------

def canopy(layer, cx, base, radius, rng, light_side=-1):
    """A round tree: clustered blobs lit from the top left, darker inside and underneath, on a short trunk."""
    trunk_h = int(radius * 0.9)
    layer.rect(cx - 1, base - trunk_h, cx + 1, base - 1, WOOD[2])
    layer.put(cx - 1, base - trunk_h + 2, WOOD[3])
    blobs = [(cx, base - trunk_h - radius * 0.7, radius)]
    for _ in range(5):
        a = rng.uniform(-math.pi, 0)
        d = radius * rng.uniform(0.45, 0.8)
        blobs.append((cx + math.cos(a) * d * 1.2, base - trunk_h - radius * 0.7 + math.sin(a) * d * 0.9, radius * rng.uniform(0.5, 0.75)))
    top = int(min(b[1] - b[2] for b in blobs)) - 1
    bottom = int(max(b[1] + b[2] for b in blobs)) + 1
    left = int(min(b[0] - b[2] for b in blobs)) - 1
    right = int(max(b[0] + b[2] for b in blobs)) + 1
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            best = None
            for bx, by, br in blobs:
                dx, dy = (x + 0.5 - bx) / br, (y + 0.5 - by) / br
                d = dx * dx + dy * dy
                if d <= 1.0 and (best is None or by < best[1]):
                    best = (dx, dy, d)
            if best is None:
                continue
            dx, dy, d = best
            light = -dx * 0.55 - dy * 0.85 + rng.uniform(-0.25, 0.25)
            tone = 5 if light > 0.75 else 4 if light > 0.2 else 3 if light > -0.45 else 2
            if d > 0.82 and light < 0:
                tone = 2
            layer.put(x, y, LEAF[tone])


def pine(layer, cx, base, height, colors):
    """A conifer: stacked tiers, the left side lit."""
    tiers = max(3, height // 7)
    for t in range(tiers):
        top = base - height + t * height // (tiers + 1)
        h = height // tiers + 4
        for y in range(h):
            half = int((y + 1) * (2 + t * 0.6) / 3.0)
            for x in range(-half, half + 1):
                tone = colors[2] if x < -half // 3 else colors[1] if x < half // 2 else colors[0]
                layer.put(cx + x, top + y, tone)
    layer.rect(cx, base - 3, cx, base - 1, WOOD[1])


def roof_rows(layer, x0, x1, y0, y1, rng, slope=None):
    """Clay tiles: rows three pixels high, each row's lower edge scalloped and shaded."""
    for y in range(y0, y1 + 1):
        row = (y - y0) // 3
        sub = (y - y0) % 3
        for x in range(x0, x1 + 1):
            if slope is not None and not slope(x, y):
                continue
            if sub == 2:
                color = TERRA[1] if (x + row * 2) % 4 else TERRA[0]
            elif sub == 0:
                color = TERRA[3] if (x + row * 2) % 4 != 3 else TERRA[2]
            else:
                color = TERRA[2] if rng.random() > 0.1 else TERRA[3]
            layer.put(x, y, color)


def house(layer, x, base, w, floors, rng, gable=None, wall=None, lit=0.6, floor_h=18, win=(6, 9), frame=None):
    """A town house: plastered walls, tiled roof, windows with frames and sills, a door and maybe a chimney."""
    wall_h = floors * floor_h + 3
    top = base - wall_h
    wall = wall or rng.choice([PLASTER, PLASTER, PLASTER, [ROCK[2], ROCK[3], ROCK[4], ROCK[5], ROCK[5], ROCK[5]],
                               [BRICK[1], BRICK[2], BRICK[3], BRICK[4], BRICK[4], BRICK[4]]])
    frame = frame or rng.choice([WOOD[1], WHITE[3], BLUE[1]])
    timber = wall is PLASTER and rng.random() < 0.4
    for yy in range(top, base):
        for xx in range(x, x + w):
            tone = 4 if xx == x else 2 if xx >= x + w - 2 else 3
            if yy >= base - 3:
                tone = 1
            if rng.random() < 0.06:
                tone = max(1, tone - 1)
            layer.put(xx, yy, wall[tone])
        if timber and (yy - top) % floor_h == 0:
            layer.rect(x, yy, x + w - 1, yy + 1, WOOD[1])
    if timber:
        for xx in (x, x + w - 2):
            layer.rect(xx, top, xx + 1, base - 4, WOOD[1])
    columns = max(2, (w - 6) // (win[0] + 8))
    door_col = rng.randrange(columns)
    for f in range(floors):
        wy = base - (f + 1) * floor_h + (floor_h - win[1]) // 2
        for c in range(columns):
            wx = x + (c + 1) * w // (columns + 1) - win[0] // 2
            if f == 0 and c == door_col:
                dw, dh = win[0] + 1, min(floor_h - 2, win[1] + 5)
                layer.rect(wx - 1, base - dh - 1, wx + dw, base - 1, WOOD[0])
                layer.rect(wx, base - dh, wx + dw - 1, base - 1, WOOD[3])
                layer.rect(wx, base - dh, wx, base - 1, WOOD[4])
                layer.put(wx + dw - 2, base - dh // 2, GLOW[2])
                continue
            layer.rect(wx - 1, wy - 1, wx + win[0], wy + win[1], frame)
            layer.rect(wx, wy, wx + win[0] - 1, wy + win[1] - 1, SKY[1])
            for i in range(min(win[0], win[1]) // 2):
                layer.put(wx + i, wy + i, SKY[3])
            layer.rect(wx + win[0] // 2, wy, wx + win[0] // 2, wy + win[1] - 1, frame)
            if win[1] >= 8:
                layer.rect(wx, wy + win[1] // 2, wx + win[0] - 1, wy + win[1] // 2, frame)
            layer.rect(wx - 1, wy + win[1], wx + win[0], wy + win[1], WHITE[3])
            if win[0] >= 5 and rng.random() < 0.3:
                shutter = rng.choice([BLUE[2], LEAF[2], TERRA[1]])
                layer.rect(wx - 3, wy - 1, wx - 2, wy + win[1] - 1, shutter)
                layer.rect(wx + win[0] + 1, wy - 1, wx + win[0] + 2, wy + win[1] - 1, shutter)
            if rng.random() < lit:
                warm = GLOW[3] if rng.random() < 0.5 else GLOW[2]
                layer.rect(wx, wy, wx + win[0] - 1, wy + win[1] - 1, warm, light=True)
                layer.rect(wx + win[0] // 2, wy, wx + win[0] // 2, wy + win[1] - 1, GLOW[0], light=True)
                if win[1] >= 8:
                    layer.rect(wx, wy + win[1] // 2, wx + win[0] - 1, wy + win[1] // 2, GLOW[0], light=True)
                layer.put(wx, wy, GLOW[4], light=True)
    gable = rng.random() < 0.45 if gable is None else gable
    overhang = 3
    x0, x1 = x - overhang, x + w - 1 + overhang
    if gable:
        peak = (w + 2 * overhang) / 2
        height = int(peak * 0.8)
        cx = (x0 + x1 + 1) / 2
        roof_rows(layer, x0, x1, top - height, top + 1, rng,
                  slope=lambda xx, yy: abs(xx + 0.5 - cx) <= (yy - (top - height) + 1) * (peak / height))
        # the gable end: a small round window under the ridge
        if height > 14:
            layer.rect(int(cx) - 2, top - height // 2, int(cx) + 1, top - height // 2 + 3, frame)
            layer.rect(int(cx) - 1, top - height // 2 + 1, int(cx), top - height // 2 + 2, SKY[1])
    else:
        height = max(10, floor_h - 2)
        roof_rows(layer, x0, x1, top - height, top + 1, rng,
                  slope=lambda xx, yy: x0 + (top + 1 - yy) * 0.7 <= xx <= x1 - (top + 1 - yy) * 0.7)
        # a dormer
        if w > 46 and rng.random() < 0.6:
            dx = x + w // 2 - 5
            layer.rect(dx, top - height + 3, dx + 9, top - 1, wall[3])
            layer.rect(dx + 2, top - height + 5, dx + 7, top - 2, frame)
            layer.rect(dx + 3, top - height + 6, dx + 6, top - 3, SKY[1])
            if rng.random() < lit:
                layer.rect(dx + 3, top - height + 6, dx + 6, top - 3, GLOW[2], light=True)
            roof_rows(layer, dx - 2, dx + 11, top - height - 2, top - height + 2, rng)
    for xx in range(x0, x1 + 1):
        layer.put(xx, top + 1, TERRA[0])
    if rng.random() < 0.75:
        cx = x + rng.randrange(4, max(5, w - 8))
        cw = 4 if floor_h > 12 else 2
        ch = height // 2 + 6
        layer.rect(cx, top - height // 2 - ch, cx + cw, top - 2, BRICK[2])
        layer.rect(cx, top - height // 2 - ch, cx, top - 2, BRICK[3])
        layer.rect(cx - 1, top - height // 2 - ch - 1, cx + cw + 1, top - height // 2 - ch, BRICK[0])


def church(layer, x, base, rng, scale=1):
    """The church at the end of town: a nave and a tower with a clock and a spire."""
    house(layer, x + 14 * scale, base, 34 * scale, 2, rng, gable=False, wall=PLASTER, lit=0.3, floor_h=13 * scale, win=(4 * scale, 7 * scale))
    tw, th = 14 * scale, 64 * scale
    tx = x
    for yy in range(base - th, base):
        for xx in range(tx, tx + tw):
            tone = 4 if xx == tx else 2 if xx >= tx + tw - 2 else 3
            layer.put(xx, yy, PLASTER[tone] if (yy // (5 * scale)) % 6 else PLASTER[2])
    # belfry openings and the clock
    layer.rect(tx + 4 * scale, base - th + 6 * scale, tx + tw - 5 * scale, base - th + 14 * scale, INK[2])
    cy = base - th + 24 * scale
    for yy in range(-3 * scale, 3 * scale + 1):
        for xx in range(-3 * scale, 3 * scale + 1):
            if xx * xx + yy * yy <= (3 * scale) ** 2:
                layer.put(tx + tw // 2 + xx, cy + yy, WHITE[4] if xx * xx + yy * yy < (2 * scale) ** 2 else INK[2])
    layer.put(tx + tw // 2, cy - 1, INK[1])
    layer.put(tx + tw // 2 + 1, cy, INK[1])
    layer.rect(tx + 5 * scale, base - 30 * scale, tx + tw - 6 * scale, base - 22 * scale, SKY[1])
    layer.rect(tx + 5 * scale, base - 30 * scale, tx + tw - 6 * scale, base - 22 * scale, GLOW[2], light=True)
    # the spire
    sh = 30 * scale
    for yy in range(sh):
        half = (yy + 1) * (tw // 2 + 1) // sh
        for xx in range(-half, half + 1):
            layer.put(tx + tw // 2 + xx, base - th - sh + yy, PINE[1] if xx < 0 else PINE[0])
    layer.rect(tx + tw // 2, base - th - sh - 5, tx + tw // 2, base - th - sh - 1, INK[2])
    layer.rect(tx + tw // 2 - 1, base - th - sh - 3, tx + tw // 2 + 1, base - th - sh - 3, INK[2])


def hedge(layer, x0, x1, base, height, rng):
    for x in range(x0, x1):
        top = base - height + int(abs(math.sin(x * 0.45 + rng.random() * 0.3)) * 2)
        for y in range(top, base):
            t = (y - top) / max(1, height)
            tone = 5 if y == top else 4 if t < 0.35 else 3 if t < 0.75 else 2
            if rng.random() < 0.12:
                tone -= 1
            layer.put(x, y, LEAF[max(1, tone)])


# ---- layers -------------------------------------------------------------------------------------------------------

def far_layer():
    rng = random.Random(11)
    layer = Layer(210, 0.42)
    base = layer.h
    # two wooded ridges: the back one paler, their crests made of tree crowns
    for ridge, (height, amp, tones, seed) in enumerate([(132, 24, (PINE[1], PINE[2], PINE[3]), 3), (86, 14, (PINE[2], PINE[3], LEAF[3]), 5)]):
        crest = [base - height - int(wrap_noise(x, W, 4, seed) * amp) for x in range(W)]
        for x in range(W):
            for y in range(crest[x], base):
                layer.put(x, y, tones[0] if (y - crest[x]) > 10 else tones[1])
        # crowns along the crest, then darker ones down the slope, so the ridge reads as forest
        crowns = [(cx, crest[cx] + rng.uniform(0, 6), True) for cx in (rng.randrange(W) for _ in range(260 if ridge == 0 else 200))]
        crowns += [(cx, rng.uniform(crest[cx] + 8, base), False) for cx in (rng.randrange(W) for _ in range(700 if ridge == 0 else 500))]
        crowns.sort(key=lambda c: c[1])
        for cx, cy, top in crowns:
            r = rng.uniform(3, 6.5)
            for y in range(int(cy - r) - 1, int(cy + r) + 1):
                for x in range(int(cx - r * 1.2) - 1, int(cx + r * 1.2) + 1):
                    dx, dy = (x + 0.5 - cx) / (r * 1.2), (y + 0.5 - cy) / r
                    if dx * dx + dy * dy <= 1:
                        light = -dx * 0.6 - dy * 0.8 - (0 if top else 0.5)
                        layer.put(x, y, tones[2] if light > 0.45 else tones[1] if light > -0.3 else tones[0])
        for _ in range(26 if ridge == 0 else 14):
            x = rng.randrange(W)
            pine(layer, x, crest[x] + 4, rng.randrange(10, 18), [tones[0], tones[1], tones[2]])
    # the old town on the lower slope: roofs, the church and a stone bridge over the river
    town = Layer(210, 0.3)
    church(town, 760, base - 10, rng)
    for x in list(range(560, 740, 40)) + list(range(830, 990, 38)) + list(range(40, 230, 42)):
        house(town, x + rng.randrange(-5, 5), base - rng.randrange(4, 14), rng.randrange(26, 34), rng.choice([1, 2, 2]), rng,
              lit=0.5, floor_h=11, win=(3, 5))
    for x in range(W):
        for y in range(base):
            if town.px[x, y][3]:
                layer.px[x, y] = town.px[x, y]
                if town.lx[x, y][3]:
                    layer.lx[x, y] = town.lx[x, y]
    for x in range(270, 530):
        y = base - 22 - int(math.sin((x - 270) / 260 * math.pi) * 5)
        layer.rect(x, y, x, y + 2, ROCK[4] if x % 9 else ROCK[3])
        for yy in range(y + 3, base - 8):
            ax = (x - 270) % 37
            d = ((ax - 18) / 15) ** 2 + ((yy - (base - 8)) / 12) ** 2
            if d > 1:
                layer.put(x, yy, ROCK[3] if (yy + (x // 4)) % 4 else ROCK[2])
    for x in range(W):
        for y in range(base - 8, base):
            layer.put(x, y, SKY[2] if (x // 3 + y) % 7 else SKY[4])
    layer.save("far")


def mid_layer():
    rng = random.Random(23)
    layer = Layer(180, 0.18)
    base = layer.h
    x = 0
    while x < W - 70:
        if rng.random() < 0.7:
            w = rng.randrange(44, 72)
            house(layer, x, base - 2, w, rng.choice([2, 2, 3]), rng, lit=0.6)
            x += w + rng.randrange(10, 22)
        else:
            canopy(layer, x + 18, base - 1, rng.randrange(14, 20), rng)
            x += rng.randrange(36, 48)
    for _ in range(5):
        pine(layer, rng.randrange(W), base - 1, rng.randrange(30, 44), [LEAF[1], LEAF[2], LEAF[3]])
    hedge(layer, 0, W, base, 6, rng)
    layer.outline(INK[2])
    layer.save("mid")


def near_layer():
    rng = random.Random(37)
    layer = Layer(150, 0.06)
    base = layer.h
    for x in (60, 330, 610, 880):
        canopy(layer, x + rng.randrange(-20, 20), base - 6, rng.randrange(26, 34), rng)
    for x in (200, 760):
        pine(layer, x + rng.randrange(-15, 15), base - 3, rng.randrange(54, 70), [LEAF[1], LEAF[2], LEAF[3]])
    hedge(layer, 0, W, base, 12, rng)
    layer.outline(LEAF[0])
    layer.save("near", lights=False)


def cloud(img, ox, oy, w, h, rng):
    """A cumulus: round puffs on a flat base, each lit from the top left, cream on top and blue-grey underneath."""
    base = oy + h - 4
    puffs = [(ox + w * 0.5, base - h * 0.42, h * 0.42)]
    for i in range(7):
        t = (i + 0.5) / 7
        r = h * rng.uniform(0.22, 0.36) * (1.0 - abs(t - 0.5) * 0.9)
        puffs.append((ox + w * (0.12 + t * 0.76), base - r * rng.uniform(0.6, 1.1), r))
    px = img.load()
    for y in range(oy, base + 1):
        for x in range(ox, ox + w):
            best = None
            for cx, cy, r in puffs:
                dx, dy = (x + 0.5 - cx) / (r * 1.25), (y + 0.5 - cy) / r
                d = dx * dx + dy * dy
                if d <= 1 and (best is None or cy - r < best[3]):
                    best = (dx, dy, d, cy - r)
            if best is None:
                continue
            dx, dy, d, _ = best
            light = -dx * 0.45 - dy * 0.9
            if y >= base - 1:
                light = min(light, -0.9)
            # dither between tones on alternate pixels so the shading has no hard bands
            light += 0.07 if (x + y) % 2 else -0.07
            color = WHITE[4] if light > 0.55 else WHITE[3] if light > -0.05 else SKY[4] if light > -0.6 else SKY[3]
            px[x, y] = color + (255,)


def sky_sheet():
    rng = random.Random(5)
    clouds = Image.new("RGBA", (256, 96), (0, 0, 0, 0))
    cloud(clouds, 0, 0, 120, 44, rng)
    cloud(clouds, 128, 0, 96, 36, rng)
    cloud(clouds, 0, 48, 72, 30, rng)
    cloud(clouds, 128, 48, 128, 40, rng)
    clouds.save(OUT / "clouds.png")
    bodies = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    px = bodies.load()
    for y in range(32):
        for x in range(32):
            d = math.hypot(x + 0.5 - 16, y + 0.5 - 16)
            if d <= 11:
                px[x, y] = (GLOW[4] if d < 8 else GLOW[3]) + (255,)
            elif d <= 13:
                px[x, y] = GLOW[3] + (150,)
            elif d <= 15:
                px[x, y] = GLOW[3] + (60,)
            # the moon: a disc with a few craters, on the right half of the sheet
            d = math.hypot(x + 0.5 - 16, y + 0.5 - 16)
            if d <= 9:
                shade = WHITE[3] if math.hypot(x + 0.5 - 13, y + 0.5 - 13) < 9 else WHITE[2]
                for cx, cy, r in ((19, 12, 2.2), (13, 19, 1.6), (20, 20, 1.4)):
                    if math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r:
                        shade = WHITE[1]
                px[32 + x, y] = shade + (255,)
            elif d <= 11:
                px[32 + x, y] = WHITE[3] + (50,)
    bodies.save(OUT / "sky.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    far_layer()
    mid_layer()
    near_layer()
    sky_sheet()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
