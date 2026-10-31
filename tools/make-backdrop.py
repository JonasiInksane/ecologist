#!/usr/bin/env python3
"""Draws the campaign backdrop (godot/art/backdrop/): the inside of a giant factory hall, in three parallax layers.

far.png   the hall's back wall: steel panels over a brick plinth, tall windows whose panes are left clear so the sky
          (drawn by backdrop.gd for the hour) shows through, I-beam columns and the roof trusses
mid.png   tanks with sight glasses, open vats, catwalks with railings and stairs, copper pipe runs, caged lamps
near.png  heavy columns, hanging chains with hooks, crates and drums just behind the plot
*-lights.png  what glows in far and mid: lamps, sight glasses and vat surfaces (backdrop.gd fades them up at night)
clouds.png    four clouds; sky.png the sun and the moon, seen through the windows

The layout follows the PixelLab concepts in art-source/pixellab/concepts/ (the catwalk cross-section and the deep
hall); every pixel is drawn here. Every layer tiles horizontally (1024 pixels) and stands on its bottom row, which
backdrop.gd puts on the floor line. Colours come from tools/palette.py; the haze is a fixed blend toward the hall's
cool blue air, so distance reads as darker and bluer while warm lamps stay warm (art.md).
Usage: python3 tools/make-backdrop.py
"""
import math
import random
from pathlib import Path
from PIL import Image

from palette import ramp, hex_color

OUT = Path(__file__).resolve().parent.parent / "godot" / "art" / "backdrop"
W = 1024
INK, STEEL, BRICK, COPPER = ramp("ink"), ramp("steel"), ramp("brick"), ramp("copper")
NIGHT, BLUE, CHEM, GLOW, WHITE = ramp("night"), ramp("blue"), ramp("chem"), ramp("glow"), ramp("white")
WOOD, RED, GOLD, TEAL, SKY = ramp("wood"), ramp("red"), ramp("gold"), ramp("teal"), ramp("sky")
# The hall's air: distant things fade toward it.
HAZE = hex_color("#242c48")
FAR_H, MID_H, NEAR_H = 560, 360, 300


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

    def put(self, x, y, color, alpha=255):
        if 0 <= y < self.h:
            self.px[x % W, y] = mix(color, HAZE, self.haze) + (alpha,)

    def clear(self, x, y):
        if 0 <= y < self.h:
            self.px[x % W, y] = (0, 0, 0, 0)

    def glow(self, x, y, color, alpha=255):
        if 0 <= y < self.h:
            old = self.lx[x % W, y]
            if alpha >= old[3]:
                self.lx[x % W, y] = tuple(color) + (alpha,)

    def get(self, x, y):
        return self.px[x % W, y] if 0 <= y < self.h else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, color):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, color)

    def halo(self, cx, cy, radius, color, strength=200):
        """A soft round glow on the lights sheet, in a few hard steps (no smoothing: art.md rule 1)."""
        for y in range(cy - radius, cy + radius + 1):
            for x in range(cx - radius, cx + radius + 1):
                d = math.hypot(x - cx, y - cy) / radius
                if d <= 1.0:
                    step = math.floor((1.0 - d) * 4) / 4
                    if step > 0:
                        self.glow(x, y, color, int(strength * step))

    def outline(self, color):
        """A one-pixel outline around everything drawn so far."""
        src = self.img.copy().load()
        c = mix(color, HAZE, self.haze) + (255,)
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


# --- pieces ----------------------------------------------------------------------------------------------------------

def ibeam(layer, x, y0, y1, width, ramp_=STEEL):
    """A riveted I-beam column: flanges on both sides, the web set back in shade."""
    for y in range(y0, y1 + 1):
        for i in range(width):
            if i < 2:
                tone = 3 if i == 0 else 2
            elif i >= width - 2:
                tone = 1 if i == width - 1 else 2
            else:
                tone = 1
            layer.put(x + i, y, ramp_[tone])
        if (y - y0) % 10 == 4:
            layer.put(x + 1, y, ramp_[4])
            layer.put(x + width - 2, y, ramp_[3])
    # base plate
    layer.rect(x - 2, y1 - 2, x + width + 1, y1, ramp_[2])
    layer.rect(x - 2, y1 - 2, x + width + 1, y1 - 2, ramp_[3])


def truss(layer, x0, x1, y_top, depth, ramp_=STEEL):
    """A horizontal lattice girder: two chords with diagonals between them."""
    for x in range(x0, x1 + 1):
        layer.put(x, y_top, ramp_[3]); layer.put(x, y_top + 1, ramp_[2])
        layer.put(x, y_top + depth - 1, ramp_[2]); layer.put(x, y_top + depth, ramp_[1])
    bay = depth
    for bx in range(x0, x1, bay):
        for i in range(depth):
            layer.put(bx + i, y_top + i, ramp_[1])
            layer.put(bx + bay - i, y_top + i, ramp_[1])
        layer.rect(bx, y_top, bx + 1, y_top + depth, ramp_[2])


def pipe_h(layer, x0, x1, y, size=4, ramp_=COPPER, flange=48):
    for x in range(x0, x1 + 1):
        for i in range(size):
            tone = 4 if i == 0 else 3 if i == 1 else 2 if i < size - 1 else 1
            layer.put(x, y + i, ramp_[tone])
        if (x - x0) % flange == 0:
            for i in range(-1, size + 1):
                layer.put(x, y + i, ramp_[3]); layer.put(x + 1, y + i, ramp_[1])


def pipe_v(layer, x, y0, y1, size=4, ramp_=COPPER, flange=40):
    for y in range(y0, y1 + 1):
        for i in range(size):
            tone = 4 if i == 0 else 3 if i == 1 else 2 if i < size - 1 else 1
            layer.put(x + i, y, ramp_[tone])
        if (y - y0) % flange == 0:
            for i in range(-1, size + 1):
                layer.put(x + i, y, ramp_[3]); layer.put(x + i, y + 1, ramp_[1])


def railing(layer, x0, x1, y_deck, ramp_=STEEL):
    """A catwalk deck of tread plate with a two-bar railing."""
    for x in range(x0, x1 + 1):
        layer.put(x, y_deck, ramp_[3])
        layer.put(x, y_deck + 1, ramp_[2] if x % 3 else ramp_[3])
        layer.put(x, y_deck + 2, ramp_[1])
        layer.put(x, y_deck - 10, ramp_[3])
        layer.put(x, y_deck - 5, ramp_[2])
    for x in range(x0, x1 + 1, 12):
        for y in range(y_deck - 10, y_deck):
            layer.put(x, y, ramp_[2])
    # brackets under the deck
    for x in range(x0 + 6, x1, 24):
        for i in range(6):
            layer.put(x + i, y_deck + 3 + i, ramp_[1])
            layer.put(x - i, y_deck + 3 + i, ramp_[1])


def stairs(layer, x0, y_bottom, steps, ramp_=STEEL):
    """A steel stair rising to the right, four pixels a step, with a handrail."""
    for s in range(steps):
        x, y = x0 + s * 4, y_bottom - s * 4
        layer.rect(x, y, x + 5, y, ramp_[3])
        layer.rect(x, y + 1, x + 5, y + 1, ramp_[1])
        layer.put(x + 2, y - 10, ramp_[3]); layer.put(x + 3, y - 10, ramp_[3])
        layer.put(x + 4, y - 11, ramp_[3]); layer.put(x + 5, y - 11, ramp_[3])
        if s % 3 == 0:
            for yy in range(y - 10, y):
                layer.put(x + 2, yy, ramp_[2])
    for s in range(steps * 4):
        layer.put(x0 + s, y_bottom + 2 - s, ramp_[1])
        layer.put(x0 + s + 1, y_bottom + 2 - s, ramp_[2])


def caged_lamp(layer, cx, top, drop, light=True):
    """A caged work lamp on a chain, its warm halo on the lights sheet."""
    for y in range(top, top + drop):
        layer.put(cx, y, STEEL[2] if (y // 2) % 2 else STEEL[1])
    y = top + drop
    layer.rect(cx - 3, y, cx + 3, y + 1, STEEL[2])
    layer.rect(cx - 2, y - 1, cx + 2, y - 1, STEEL[3])
    for yy in range(y + 2, y + 8):
        for xx in range(cx - 3, cx + 4):
            cage = xx in (cx - 3, cx, cx + 3) or yy == y + 5
            layer.put(xx, yy, STEEL[1] if cage else GLOW[3 if xx < cx else 2])
    layer.rect(cx - 2, y + 8, cx + 2, y + 8, STEEL[1])
    if light:
        layer.halo(cx, y + 5, 26, GLOW[2], 110)
        layer.halo(cx, y + 5, 10, GLOW[3], 200)
        for yy in range(y + 2, y + 8):
            for xx in range(cx - 2, cx + 3):
                if xx != cx and yy != y + 5:
                    layer.glow(xx, yy, GLOW[4], 255)


def tank(layer, x, base, w, h, liquid, rng, sight=True):
    """A riveted steel tank on legs with a domed top, banded, a sight glass showing the liquid inside."""
    legs = 10
    body_top = base - legs - h
    for xx in (x + 4, x + w - 7):
        layer.rect(xx, base - legs, xx + 2, base, STEEL[1])
        layer.rect(xx - 1, base, xx + 3, base, STEEL[2])
    for yy in range(body_top, base - legs):
        for i in range(w):
            t = i / (w - 1)
            tone = 1 if t > 0.82 else 2 if t > 0.6 else 3 if t > 0.12 else 2
            if t < 0.05 or t > 0.95:
                tone = 1
            layer.put(x + i, yy, STEEL[tone])
    for band in range(body_top + 8, base - legs, 22):
        for i in range(w):
            layer.put(x + i, band, STEEL[1])
            if i % 6 == 2:
                layer.put(x + i, band - 1, STEEL[4])
    # dome
    r = w // 2
    for i in range(w):
        dx = (i - r + 0.5) / r
        dome = int(math.sqrt(max(0.0, 1 - dx * dx)) * w * 0.22)
        for yy in range(body_top - dome, body_top):
            layer.put(x + i, yy, STEEL[3 if dx < -0.2 else 2 if dx < 0.5 else 1])
    pipe_v(layer, x + r - 2, body_top - int(w * 0.22) - 30, body_top - int(w * 0.22) + 1, 4)
    if sight:
        sx0, sx1 = x + w // 2 - 7, x + w // 2 + 7
        sy0, sy1 = body_top + 14, base - legs - 14
        level = sy0 + int((sy1 - sy0) * rng.uniform(0.25, 0.5))
        for yy in range(sy0 - 2, sy1 + 3):
            for xx in range(sx0 - 2, sx1 + 3):
                layer.put(xx, yy, COPPER[2] if xx in (sx0 - 2, sx1 + 2) or yy in (sy0 - 2, sy1 + 2) else COPPER[1])
        for yy in range(sy0, sy1 + 1):
            for xx in range(sx0, sx1 + 1):
                if yy < level:
                    layer.put(xx, yy, NIGHT[2])
                else:
                    tone = 4 if yy == level else 3 if xx < sx0 + 4 else 2
                    layer.put(xx, yy, liquid[tone])
                    layer.glow(xx, yy, liquid[4 if yy == level else 3], 170)
                    if rng.random() < 0.06:
                        layer.put(xx, yy, liquid[5 if len(liquid) > 5 else 4])
        layer.halo((sx0 + sx1) // 2, (level + sy1) // 2, 20, liquid[3], 70)
    # a gauge
    gx, gy = x + w - 10, body_top + 12
    for yy in range(gy - 3, gy + 4):
        for xx in range(gx - 3, gx + 4):
            if math.hypot(xx - gx, yy - gy) <= 3.2:
                layer.put(xx, yy, WHITE[3] if math.hypot(xx - gx, yy - gy) < 2.2 else INK[2])
    layer.put(gx + 1, gy - 1, RED[3])


def vat(layer, x, base, w, h, liquid):
    """An open riveted vat: the glowing surface shows over the rim."""
    for yy in range(base - h, base + 1):
        for i in range(w):
            t = i / (w - 1)
            tone = 1 if t > 0.85 else 2 if t > 0.55 else 3 if t > 0.1 else 2
            layer.put(x + i, yy, COPPER[tone] if yy < base - h + 3 else STEEL[tone])
        if (yy - base) % 12 == 0:
            for i in range(1, w - 1, 5):
                layer.put(x + i, yy, STEEL[4])
    for i in range(2, w - 2):
        layer.put(x + i, base - h - 1, liquid[4])
        layer.put(x + i, base - h - 2, liquid[3] if i % 7 else liquid[4])
        layer.glow(x + i, base - h - 1, liquid[4], 255)
        layer.glow(x + i, base - h - 2, liquid[4], 220)
    layer.halo(x + w // 2, base - h - 6, w // 2 + 6, liquid[3], 90)
    # rising bubbles
    for k in range(4):
        bx = x + 6 + k * (w - 12) // 3
        by = base - h - 6 - (k * 5) % 11
        layer.put(bx, by, liquid[4]); layer.glow(bx, by, liquid[4], 220)


def crate(layer, x, base, size):
    for yy in range(base - size, base + 1):
        for xx in range(x, x + size):
            edge = xx in (x, x + size - 1) or yy in (base - size, base)
            diag = (xx - x) == (base - yy) or (xx - x) == (yy - base + size)
            layer.put(xx, yy, WOOD[2] if edge else WOOD[3] if diag else WOOD[4] if (yy - base) % 5 else WOOD[3])


def drum(layer, x, base, color):
    w, h = 12, 18
    for yy in range(base - h, base + 1):
        for i in range(w):
            tone = 1 if i > 9 else 2 if i > 6 else 3 if i > 1 else 2
            layer.put(x + i, yy, color[tone])
        if (base - yy) in (5, 12):
            for i in range(w):
                layer.put(x + i, yy, color[1])
    for i in range(w):
        layer.put(x + i, base - h, color[4])


def chain(layer, x, y0, y1, hook=True):
    for y in range(y0, y1):
        if (y // 3) % 2:
            layer.put(x, y, STEEL[2]); layer.put(x + 1, y, STEEL[1])
        else:
            layer.put(x - 1, y, STEEL[2]); layer.put(x + 2, y, STEEL[1]); layer.put(x, y, STEEL[3])
    if hook:
        for i, (dx, dy) in enumerate(((0, 0), (0, 1), (0, 2), (0, 3), (1, 4), (2, 4), (3, 3), (3, 2), (-1, 4))):
            layer.put(x + dx, y1 + dy, STEEL[3] if i < 4 else STEEL[2])
        layer.rect(x - 2, y1 - 3, x + 3, y1 - 1, GOLD[2])


# --- layers ----------------------------------------------------------------------------------------------------------

def far_layer():
    """The back wall of the hall, 42 % hazed, with windows cut clear for the sky."""
    rng = random.Random(11)
    L = Layer(FAR_H, 0.42)
    h = FAR_H
    roof_line = 60
    for y in range(h):
        for x in range(W):
            if y < roof_line:
                L.put(x, y, NIGHT[1] if y % 9 else NIGHT[2])
            elif y > h - 90:
                # the brick plinth
                course = (y - (h - 90)) // 4
                joint = (y - (h - 90)) % 4 == 3 or (x + (course % 2) * 6) % 12 == 0
                L.put(x, y, BRICK[1] if joint else BRICK[2] if (x * 7 + course * 13) % 23 else BRICK[3])
            else:
                # steel cladding panels, 32 wide, with seams and rivets
                seam = x % 32 == 0
                tone = 1 if seam else 2 if x % 32 > 26 else 2 if (x // 32 + y // 64) % 3 == 0 else 2
                L.put(x, y, STEEL[tone] if not seam else STEEL[0])
                if x % 32 == 1 and y % 16 == 8:
                    L.put(x, y, STEEL[3])
    # tall windows with arched tops and glazing bars, panes left clear
    for wx in range(40, W, 128):
        wx0, wx1, wy0, wy1 = wx, wx + 56, roof_line + 70, h - 130
        arch = 28
        for y in range(wy0 - arch, wy1 + 1):
            for x in range(wx0, wx1 + 1):
                dy = wy0 - y
                if dy > 0 and math.hypot(x - (wx0 + wx1) / 2, dy) > arch:
                    continue
                frame = x in (wx0, wx0 + 1, wx1 - 1, wx1) or y == wy1 or y == wy1 - 1
                bar = (x - wx0) % 14 == 0 or ((y - wy0) % 18 == 0 and y >= wy0)
                if dy > 0 and math.hypot(x - (wx0 + wx1) / 2, dy) > arch - 2:
                    frame = True
                if frame:
                    L.put(x, y, STEEL[3] if x < wx0 + 2 else STEEL[1])
                elif bar:
                    L.put(x, y, STEEL[1])
                else:
                    L.clear(x, y)
        # the sill
        L.rect(wx0 - 3, wy1 + 1, wx1 + 3, wy1 + 2, STEEL[3])
        L.rect(wx0 - 3, wy1 + 3, wx1 + 3, wy1 + 3, STEEL[0])
    # columns and the roof trusses
    for cx in range(0, W, 256):
        ibeam(L, cx - 8, roof_line, h, 16)
    truss(L, 0, W, roof_line, 24)
    for x in range(0, W, 64):
        chain(L, x + 30, roof_line + 25, roof_line + 60 + (x * 37) % 40, hook=False)
    L.save("far", lights=True)


def mid_layer():
    """Tanks, vats, catwalks and pipes, 18 % hazed."""
    rng = random.Random(23)
    L = Layer(MID_H, 0.18)
    h = MID_H
    deck = h - 150
    upper = h - 270
    # pipe runs high up first, so the tanks stand in front of them
    pipe_h(L, 0, W, upper - 22, 5)
    pipe_h(L, 0, W, deck - 64, 4, ramp_=BLUE)
    # catwalks, the lower one with stairs up to it
    railing(L, 120, 470, deck)
    railing(L, 600, 960, deck)
    railing(L, 300, 760, upper)
    stairs(L, 60, h - 2, 37)
    stairs(L, 520, deck - 2, 30)
    for px in (130, 300, 460, 610, 790, 950):
        ibeam(L, px, deck + 3, h, 8)
    for px in (310, 520, 750):
        ibeam(L, px, upper + 3, deck - 1, 6)
    # tanks on the floor and on the catwalk
    tank(L, 180, h, 78, 150, CHEM, rng)
    tank(L, 660, h, 92, 170, BLUE + [SKY[4]], rng)
    tank(L, 360, deck, 64, 90, TEAL, rng)
    tank(L, 820, deck, 60, 80, CHEM, rng)
    vat(L, 300, h, 110, 34, ramp("dusk"))
    vat(L, 880, h, 96, 30, CHEM)
    vat(L, 640, upper, 70, 22, CHEM)
    pipe_v(L, 255, upper - 22, h - 50, 4)
    pipe_v(L, 905, deck - 64, deck - 4, 4, ramp_=BLUE)
    for lx in (90, 250, 420, 560, 730, 900):
        caged_lamp(L, lx, 0, 22 + (lx * 13) % 30)
    for lx in (200, 470, 690, 960):
        caged_lamp(L, lx, deck + 3, 10)
    L.outline(INK[1])
    L.save("mid")


def near_layer():
    """Heavy columns, chains with hooks, crates and drums just behind the plot, 6 % hazed."""
    rng = random.Random(37)
    L = Layer(NEAR_H, 0.06)
    h = NEAR_H
    for cx in (60, 572):
        ibeam(L, cx, 0, h, 26)
    pipe_h(L, 0, W, 6, 6)
    for x in (230, 380, 820):
        chain(L, x, 12, 60 + (x * 7) % 60)
    for x, s in ((110, 22), (134, 16), (118, 14), (640, 20), (900, 24), (926, 18)):
        base = h if (x, s) != (118, 14) else h - 22
        crate(L, x, base, s)
    for x, c in ((700, BLUE), (714, RED), (728, BLUE), (980, CHEM)):
        drum(L, x, h, c)
    L.outline(INK[1])
    L.save("near", lights=False)


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
