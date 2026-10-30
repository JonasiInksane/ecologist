#!/usr/bin/env python3
"""Makes the props (godot/art/decor.png): the things that make the plot a place without being machines.

Most of the shack's are cut straight from the dusk workshop reference (CUTS, through tools/reference.py): the
fridge, the pendant lamps, the shelves of jars and pans, the stove pipe, the plants, the shelf of glassware, the
botanical prints and the fuse box. They keep the reference's own shades. The rest are drawn here: a picket fence, a
street lamp, a chalkboard of sugar chemistry, a potted plant, sacks, a mailbox, a for-sale sign, a bush, a tree,
the neighbourhood cat and the kitchen chairs, outlined in ink where they meet the air and snapped to the palette.

Everything is packed into one sheet; the regions are written to godot/data/decor.json's "sprites" (the placements
there are kept).
Usage: python3 tools/make-decor-sprites.py
"""
import json
import math
import random
from pathlib import Path
from PIL import Image

from palette import ramp, snap

ROOT = Path(__file__).resolve().parent.parent
INK, WOOD, LEAF, GLOW = ramp("ink"), ramp("wood"), ramp("leaf"), ramp("glow")
TERRA, PLASTER, ROCK, STEEL = ramp("terracotta"), ramp("plaster"), ramp("rock"), ramp("steel")
CHEM, RED, BLUE, GOLD, WHITE = ramp("chem"), ramp("red"), ramp("blue"), ramp("gold"), ramp("white")
PURPLE, COPPER, GREY = ramp("purple"), ramp("copper"), ramp("grey")


class Canvas:
    def __init__(self, w, h):
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.img.load()
        self.w, self.h = w, h

    def put(self, x, y, color):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = tuple(color) + (255,)

    def rect(self, x0, y0, x1, y1, color):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, color)

    def outline(self, color=INK[1], skip_bottom=False):
        src = self.img.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if skip_bottom and dy == -1:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[nx, ny][3]:
                        self.px[x, y] = tuple(color) + (255,)
                        break
        return self


def fence():
    c = Canvas(32, 22)
    for i, x in enumerate(range(1, 32, 6)):
        top = 2 if i % 2 == 0 else 3
        c.rect(x, top + 1, x + 3, 21, WOOD[3])
        c.rect(x, top + 1, x, 21, WOOD[4])
        c.rect(x + 3, top + 1, x + 3, 21, WOOD[2])
        c.rect(x + 1, top, x + 2, top, WOOD[3])
        c.put(x + 1, top + 4, WOOD[1])
    for y in (7, 15):
        c.rect(0, y, 31, y + 1, WOOD[2])
        c.rect(0, y, 31, y, WOOD[3])
    return c.outline(INK[1])


def street_lamp():
    """A tall iron lamp post with a glass lantern, as in the reference's street."""
    c = Canvas(15, 100)
    c.rect(6, 18, 8, 95, INK[2])
    c.rect(6, 18, 6, 95, GREY[1])
    for y in (30, 60, 84):
        c.rect(5, y, 9, y + 1, INK[2])
        c.put(5, y, GREY[1])
    c.rect(3, 93, 11, 99, INK[2])
    c.rect(4, 91, 10, 92, INK[2])
    c.rect(3, 93, 3, 98, GREY[1])
    # the lantern: a finial, a cap, four glass panes round the flame, a base
    c.rect(7, 0, 7, 1, INK[2])
    c.rect(5, 2, 9, 3, INK[2])
    c.rect(2, 4, 12, 5, INK[2])
    c.rect(3, 4, 11, 4, GREY[1])
    c.rect(3, 6, 11, 14, INK[2])
    c.rect(4, 6, 10, 14, GLOW[3])
    c.rect(4, 6, 5, 14, GLOW[4])
    c.rect(9, 6, 10, 14, GLOW[2])
    c.rect(6, 9, 8, 12, GLOW[4])
    c.rect(7, 6, 7, 14, INK[2])
    c.rect(2, 15, 12, 16, INK[2])
    c.rect(5, 17, 9, 17, INK[2])
    return c


# Props cut straight from the dusk workshop reference at the game's scale (tools/reference.py): the box, the
# flood-fill tolerance and any hand-placed erase or keep rectangles, in the native 640 x 360 picture. They keep the
# reference's own shades and are not snapped to the palette.
CUTS = {
    "fridge": dict(box=(221, 152, 246, 205), tol=0.06, erase=((244, 152, 246, 170),)),
    "ref_lamp": dict(box=(160, 125, 183, 143), tol=0.05),
    "pan_shelf": dict(box=(133, 137, 167, 170), tol=0.05),
    "jar_shelf": dict(box=(203, 136, 236, 167), tol=0.05, erase=((221, 152, 236, 167),)),
    "stove_pipe": dict(box=(186, 137, 201, 172), tol=0.05),
    "trailing_plant": dict(box=(236, 132, 259, 177), tol=0.05, erase=((236, 152, 246, 177),)),
    "glass_shelf": dict(box=(358, 60, 416, 86), tol=0.05),
    "table_plant": dict(box=(161, 171, 178, 187), tol=0.05, erase=((166, 171, 178, 175),)),
    "kettle": dict(box=(204, 168, 216, 179), tol=0.05, keep=((206, 170, 214, 178),)),
    "prints": dict(box=(427, 62, 471, 89), tol=0.05, keep=((430, 64, 450, 88), (452, 64, 471, 87))),
    "fuse_box": dict(box=(467, 65, 487, 92), tol=0.05),
}


def cut_prop(name):
    def draw():
        from reference import piece
        img = piece(**CUTS[name])
        c = Canvas(img.width, img.height)
        c.img.paste(img, (0, 0))
        c.px = c.img.load()
        c.cut = True
        return c
    return draw


def chalkboard():
    c = Canvas(44, 30)
    c.rect(0, 0, 43, 29, WOOD[2])
    c.rect(0, 0, 43, 0, WOOD[4])
    c.rect(2, 2, 41, 25, LEAF[0])
    c.rect(1, 26, 42, 27, WOOD[3])
    c.rect(6, 25, 9, 25, WHITE[4])
    chalk = WHITE[3]
    # C12H22O11, a flask with fumes, an arrow and a skull and crossbones
    for x, y in ((4, 4), (5, 4), (4, 5), (4, 6), (5, 6)):
        c.put(x, y, chalk)
    for i, xs in enumerate([(7, 8), (11, 12, 13), (16, 17), (20,)]):
        for x in xs:
            c.put(x, 6 + (i % 2), chalk)
    for x in range(4, 22):
        if x % 3:
            c.put(x, 9, WHITE[2])
    for x in range(4, 15):
        c.put(x, 12, chalk if x % 4 else WHITE[2])
    c.put(15, 11, chalk)
    c.put(16, 12, chalk)
    c.put(15, 13, chalk)
    fx, fy = 28, 8
    c.rect(fx + 2, fy, fx + 4, fy + 4, chalk)
    c.rect(fx + 3, fy + 1, fx + 3, fy + 3, LEAF[0])
    for i in range(6):
        c.put(fx + 2 - i // 2 - 1, fy + 5 + i, chalk)
        c.put(fx + 4 + i // 2 + 1, fy + 5 + i, chalk)
    c.rect(fx - 2, fy + 11, fx + 8, fy + 11, chalk)
    c.rect(fx, fy + 8, fx + 6, fy + 10, CHEM[4])
    for i, (x, y) in enumerate(((fx + 3, fy - 2), (fx + 5, fy - 4), (fx + 2, fy - 5))):
        c.put(x, y, WHITE[2])
    c.rect(6, 17, 10, 21, WHITE[3])
    c.put(7, 19, LEAF[0])
    c.put(9, 19, LEAF[0])
    c.put(4, 22, WHITE[3]); c.put(12, 22, WHITE[3]); c.put(4, 16, WHITE[3]); c.put(12, 16, WHITE[3])
    c.rect(16, 19, 24, 19, chalk)
    c.put(23, 18, chalk); c.put(23, 20, chalk)
    c.rect(27, 21, 38, 21, GOLD[4])
    return c.outline(INK[1])


def plant():
    c = Canvas(16, 22)
    c.rect(4, 15, 11, 21, TERRA[2])
    c.rect(3, 14, 12, 15, TERRA[3])
    c.rect(4, 15, 4, 21, TERRA[3])
    c.rect(10, 16, 11, 21, TERRA[1])
    rng = random.Random(9)
    for _ in range(9):
        a = rng.uniform(-2.6, -0.5)
        length = rng.uniform(6, 11)
        for t in range(int(length)):
            x = int(round(8 + math.cos(a) * t))
            y = int(round(14 + math.sin(a) * t + t * t * 0.03))
            c.put(x, y, LEAF[4] if t > length / 2 else LEAF[3])
            if t > 2:
                c.put(x + 1, y, LEAF[5] if a < -1.6 else LEAF[2])
    return c.outline(INK[1])


def sacks():
    c = Canvas(28, 18)
    for ox, h in ((1, 15), (13, 12)):
        top = 17 - h
        for y in range(top, 18):
            bulge = 1 if top + 3 < y < 16 else 0
            for x in range(ox - bulge, ox + 12 + bulge):
                tone = 4 if x < ox + 3 else 2 if x > ox + 9 else 3
                c.put(x, y, PLASTER[tone - 1])
        c.rect(ox + 3, top - 1, ox + 8, top, PLASTER[1])
        c.rect(ox + 4, top + 1, ox + 7, top + 1, WOOD[2])
        c.rect(ox + 3, top + 6, ox + 8, top + 8, PLASTER[4] if h > 13 else PLASTER[3])
        c.put(ox + 4, top + 7, RED[2]); c.put(ox + 6, top + 7, RED[2])
    return c.outline(INK[1])


def mailbox():
    c = Canvas(12, 26)
    c.rect(5, 10, 6, 25, WOOD[2])
    c.rect(5, 10, 5, 25, WOOD[3])
    c.rect(1, 2, 10, 10, RED[2])
    c.rect(1, 1, 10, 2, RED[3])
    c.rect(1, 2, 1, 10, RED[3])
    c.rect(9, 3, 10, 10, RED[1])
    c.rect(3, 5, 7, 5, INK[2])
    c.rect(11, 3, 11, 6, GOLD[3])
    return c.outline(INK[1])


def sale_sign():
    c = Canvas(24, 30)
    c.rect(3, 12, 4, 29, WOOD[2])
    c.rect(19, 12, 20, 29, WOOD[2])
    c.rect(0, 1, 23, 13, WHITE[4])
    c.rect(0, 1, 23, 2, RED[2])
    c.rect(0, 12, 23, 13, WHITE[2])
    # "FOR SALE" in three-pixel letters
    glyphs = {"F": ["111", "110", "100"], "O": ["111", "101", "111"], "R": ["110", "111", "101"],
              "S": ["011", "010", "110"], "A": ["010", "111", "101"], "L": ["100", "100", "111"], "E": ["111", "110", "111"]}
    for i, ch in enumerate("FOR"):
        for gy, row in enumerate(glyphs[ch]):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.put(6 + i * 4 + gx, 4 + gy, RED[2])
    for i, ch in enumerate("SALE"):
        for gy, row in enumerate(glyphs[ch]):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.put(4 + i * 4 + gx, 8 + gy, INK[2])
    return c.outline(INK[1])


def bush():
    c = Canvas(36, 20)
    rng = random.Random(4)
    blobs = [(9, 13, 8), (18, 10, 9), (27, 13, 8), (14, 15, 6), (24, 15, 6)]
    for y in range(20):
        for x in range(36):
            best = None
            for bx, by, r in blobs:
                dx, dy = (x + 0.5 - bx) / r, (y + 0.5 - by) / r
                if dx * dx + dy * dy <= 1 and (best is None or by < best[1]):
                    best = (dx, dy)
            if best and y < 20:
                light = -best[0] * 0.5 - best[1] * 0.9 + rng.uniform(-0.3, 0.3)
                c.put(x, y, LEAF[5] if light > 0.7 else LEAF[4] if light > 0.1 else LEAF[3] if light > -0.5 else LEAF[2])
    for x, y, col in ((8, 9, PURPLE[4]), (22, 6, WHITE[4]), (28, 10, PURPLE[4]), (15, 12, GOLD[4])):
        c.put(x, y, col)
    return c.outline(LEAF[0], skip_bottom=True)


def tree():
    c = Canvas(76, 112)
    rng = random.Random(8)
    c.rect(34, 60, 41, 111, WOOD[3])
    c.rect(34, 60, 35, 111, WOOD[4])
    c.rect(40, 60, 41, 111, WOOD[2])
    for y in range(64, 110, 7):
        c.put(37 + (y % 3), y, WOOD[1])
    c.rect(31, 106, 44, 111, WOOD[3])
    c.rect(28, 109, 47, 111, WOOD[2])
    blobs = [(38, 34, 24)]
    for _ in range(9):
        a = rng.uniform(-math.pi, 0.4)
        d = rng.uniform(10, 20)
        blobs.append((38 + math.cos(a) * d * 1.3, 36 + math.sin(a) * d, rng.uniform(11, 16)))
    for y in range(112):
        for x in range(76):
            best = None
            for bx, by, r in blobs:
                dx, dy = (x + 0.5 - bx) / r, (y + 0.5 - by) / r
                d = dx * dx + dy * dy
                if d <= 1 and (best is None or by < best[1]):
                    best = (dx, dy, d)
            if best:
                dx, dy, d = best
                light = -dx * 0.55 - dy * 0.85 + rng.uniform(-0.3, 0.3)
                tone = 6 if light > 1.0 else 5 if light > 0.5 else 4 if light > -0.1 else 3 if light > -0.6 else 2
                if d > 0.85 and light < 0:
                    tone = 2
                c.put(x, y, LEAF[tone])
    return c.outline(LEAF[0])


def cat():
    c = Canvas(18, 14)
    fur, dark, light = TERRA[3], TERRA[2], WHITE[4]
    c.rect(4, 6, 12, 12, fur)
    c.rect(4, 10, 12, 12, light)
    c.rect(10, 1, 15, 6, fur)
    c.put(10, 0, fur); c.put(15, 0, fur)
    c.rect(12, 4, 15, 6, light)
    c.put(12, 3, INK[0]); c.put(14, 3, INK[0])
    c.put(13, 5, RED[3])
    c.rect(5, 6, 7, 7, dark)
    c.rect(1, 9, 3, 10, fur)
    c.rect(0, 6, 1, 9, fur)
    c.rect(0, 5, 0, 5, dark)
    return c.outline(INK[1])


def chair(mirror=False):
    """A ladder-back kitchen chair in side view, its back to the left (mirror: to the right)."""
    def draw():
        c = Canvas(15, 28)
        c.rect(1, 0, 3, 27, WOOD[2])  # the back post running down into the rear leg
        c.rect(1, 0, 1, 27, WOOD[4])
        c.rect(1, 0, 3, 1, WOOD[5])
        for y in (4, 8):  # the ladder's rails, seen end on
            c.rect(2, y, 4, y + 1, WOOD[3])
            c.put(2, y, WOOD[5])
        c.rect(1, 14, 13, 15, WOOD[4])  # the seat, lit on top, its edge in shade
        c.rect(1, 14, 13, 14, WOOD[6])
        c.rect(1, 16, 13, 16, WOOD[1])
        c.rect(11, 17, 12, 27, WOOD[3])  # the front leg
        c.rect(11, 17, 11, 27, WOOD[5])
        c.rect(4, 22, 10, 22, WOOD[2])  # a stretcher between the legs
        c.rect(1, 26, 3, 27, WOOD[1]); c.rect(11, 26, 12, 27, WOOD[1])
        c.outline(INK[1])
        if mirror:
            c.img = c.img.transpose(Image.FLIP_LEFT_RIGHT)
            c.px = c.img.load()
        return c
    return draw


PROPS = [("fence", fence), ("street_lamp", street_lamp), ("chalkboard", chalkboard), ("plant", plant),
         ("sacks", sacks), ("mailbox", mailbox), ("sale_sign", sale_sign), ("bush", bush), ("tree", tree),
         ("cat", cat), ("chair", chair()), ("chair_r", chair(True))] + [(name, cut_prop(name)) for name in CUTS]


def main():
    drawn = [(name, draw()) for name, draw in PROPS]
    sheet = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
    regions = {}
    x = y = row_h = 0
    for name, canvas in sorted(drawn, key=lambda d: -d[1].h):
        if x + canvas.w > sheet.width:
            x, y, row_h = 0, y + row_h + 1, 0
        sheet.paste(canvas.img, (x, y))
        regions[name] = [x, y, canvas.w, canvas.h]
        x += canvas.w + 1
        row_h = max(row_h, canvas.h)
    used = max(r[1] + r[3] for r in regions.values())
    sheet = sheet.crop((0, 0, sheet.width, (used + 7) // 8 * 8))
    # drawn props are snapped to the palette; the cut ones keep the reference's shades
    drawn_only = sheet.copy()
    for name, canvas in drawn:
        if getattr(canvas, "cut", False):
            x, y, w, h = regions[name]
            drawn_only.paste((0, 0, 0, 0), (x, y, x + w, y + h))
    snapped = snap(drawn_only)
    for name, canvas in drawn:
        if getattr(canvas, "cut", False):
            x, y, w, h = regions[name]
            snapped.paste(canvas.img, (x, y))
    sheet = snapped
    sheet.save(ROOT / "godot" / "art" / "decor.png")
    data_path = ROOT / "godot" / "data" / "decor.json"
    data = json.loads(data_path.read_text()) if data_path.exists() else {"placements": []}
    data["sprites"] = {name: regions[name] for name, _ in PROPS}
    text = json.dumps(data, indent=2)
    data_path.write_text(text + "\n")
    print("wrote", ROOT / "godot" / "art" / "decor.png", "and the sprite regions in", data_path)


if __name__ == "__main__":
    main()
