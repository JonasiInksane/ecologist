#!/usr/bin/env python3
"""Makes the props (godot/art/decor.png): the things that make the plot a place without being machines.

All drawn here, in the dusk workshop reference's manner (docs/design/art.md): outlined in ink where they meet the air,
lit from the top left, snapped to the palette. Outside: a picket fence, a street lamp, a potted plant, sacks, a
mailbox, a for-sale sign, a bush, a tree and the neighbourhood cat. In the shack: a chalkboard of sugar chemistry, the
fridge, pendant lamps, a shelf of pans, a shelf of preserves with garlic and chillies drying, the stove pipe, a hanging
plant, a shelf of glassware, a table plant, a kettle, two botanical prints, the fuse box and the kitchen chairs.

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
TEAL, SKY, PINK = ramp("teal"), ramp("sky"), ramp("pink")


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


def disc(c, cx, cy, r, color):
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r:
                c.put(x, y, color)


def glass(c, x, y, alpha=110):
    """Clear glass: the wall shows through, faintly blue."""
    if 0 <= x < c.w and 0 <= y < c.h:
        c.px[x, y] = SKY[4] + (alpha,)


def fridge():
    """A rounded cream fridge: chrome handles, a maker's badge, a note and a child's drawing held up by magnets."""
    c = Canvas(24, 50)
    for y in range(1, 48):
        for x in range(1, 23):
            if (y == 1 and (x < 3 or x > 20)) or (y == 2 and (x < 2 or x > 21)):
                continue
            tone = 5 if x in (2, 3) or y < 3 else 2 if x >= 21 else 3 if x >= 19 else 4
            if y > 37 and tone > 2:
                tone -= 1
            c.put(x, y, PLASTER[tone])
    c.rect(1, 15, 22, 15, INK[2])  # the gap between the freezer and the main door
    c.rect(2, 16, 21, 16, PLASTER[2])
    c.rect(2, 42, 21, 47, INK[2])  # the kick plate and its vents
    for y in (43, 45):
        for x in range(4, 20, 2):
            c.put(x, y, PLASTER[1])
    for top, bottom in ((7, 12), (19, 31)):  # chrome handles
        c.rect(3, top, 3, bottom, STEEL[3])
        c.rect(4, top, 4, bottom, STEEL[1])
        c.put(3, top, STEEL[4])
        c.rect(3, top - 1, 5, top - 1, STEEL[2]); c.rect(3, bottom + 1, 5, bottom + 1, STEEL[1])
    c.rect(13, 4, 17, 4, GOLD[3]); c.put(13, 4, GOLD[4]); c.rect(14, 5, 17, 5, GOLD[1])
    c.put(19, 10, LEAF[4]); c.put(20, 10, LEAF[3])
    for i in range(5):  # a shine across the enamel
        c.put(8 + i, 12 - i, PLASTER[5]); c.put(9 + i, 12 - i, PLASTER[5])
        c.put(17 + i // 2, 40 - i, PLASTER[5])
    c.rect(20, 3, 21, 13, PLASTER[2]); c.rect(20, 17, 21, 40, PLASTER[2])  # the door seal on the hinge side
    c.rect(20, 3, 20, 13, PLASTER[3]); c.rect(20, 17, 20, 40, PLASTER[3])
    c.rect(8, 6, 11, 10, WHITE[4]); c.rect(9, 7, 10, 8, SKY[3]); c.rect(9, 9, 10, 9, LEAF[3])  # a photo
    c.put(11, 7, WHITE[2]); c.put(9, 6, RED[3])
    c.rect(11, 20, 16, 27, WHITE[4])  # a shopping list
    c.rect(16, 21, 16, 27, WHITE[2])
    for y in (22, 24, 26):
        c.rect(12, y, 15 if y != 26 else 13, y, WHITE[1])
    c.put(13, 20, RED[3]); c.put(14, 20, RED[2])
    c.rect(8, 30, 14, 36, SKY[4])  # a child's drawing of a sun and a flower
    c.rect(14, 31, 14, 36, SKY[3])
    c.put(9, 31, GOLD[4]); c.put(10, 31, GOLD[3]); c.put(9, 32, GOLD[3])
    c.rect(12, 33, 12, 36, LEAF[3]); c.put(11, 32, PINK[3]); c.put(13, 32, PINK[3]); c.put(12, 31, PINK[3]); c.put(12, 32, GOLD[4])
    c.put(11, 30, BLUE[3]); c.put(17, 34, BLUE[3]); c.put(18, 34, BLUE[2])
    c.put(7, 24, GOLD[3])
    c.outline(INK[1])
    for x0 in (3, 18):  # feet
        c.rect(x0, 48, x0 + 2, 49, INK[1])
    return c


def pendant_lamp():
    """An enamel shade on a cord, its bulb glowing under the rim."""
    c = Canvas(14, 16)
    c.rect(6, 5, 7, 5, GOLD[2]); c.put(6, 5, GOLD[3])
    for y, x0 in ((6, 5), (7, 4), (8, 3), (9, 2), (10, 1)):
        x1 = 13 - x0
        for x in range(x0, x1 + 1):
            tone = 3 if x < x0 + 2 else 1 if x > x1 - 2 else 2
            c.put(x, y, TEAL[tone])
        c.put(x0 + 1, y, TEAL[4] if y < 9 else TEAL[3])
    c.rect(1, 11, 12, 11, GLOW[1])  # the inside of the rim, lit by the bulb
    c.put(1, 11, TEAL[4]); c.put(12, 11, TEAL[1])
    c.rect(5, 12, 8, 13, GLOW[3]); c.rect(6, 12, 7, 12, GLOW[4])
    c.outline(INK[1])
    c.rect(6, 0, 7, 0, WOOD[3])  # the ceiling rose and the cord
    c.rect(6, 1, 6, 3, INK[2])
    return c


def pan_shelf():
    """A shelf of tins and bowls over a brass rail of pans: a frying pan, a copper saucepan and a ladle."""
    c = Canvas(30, 29)
    c.rect(2, 1, 6, 6, RED[2]); c.rect(2, 1, 2, 6, RED[3]); c.rect(6, 2, 6, 6, RED[1])  # a tea tin
    c.rect(2, 1, 6, 1, GREY[3]); c.rect(3, 3, 5, 4, GOLD[3])
    for y in range(1, 7):  # a jar of oats
        for x in range(9, 14):
            c.put(x, y, PLASTER[4] if y > 2 else WHITE[2])
    c.rect(9, 0, 13, 0, WOOD[3]); c.rect(9, 1, 9, 6, WHITE[3]); c.rect(13, 1, 13, 6, WHITE[1])
    c.put(11, 4, PLASTER[3]); c.put(10, 5, PLASTER[5])
    c.rect(17, 0, 17, 2, LEAF[2]); c.put(17, 0, WOOD[4])  # a green bottle
    c.rect(16, 3, 18, 6, LEAF[3]); c.rect(16, 3, 16, 6, LEAF[5]); c.rect(18, 4, 18, 6, LEAF[1])
    for y, x0, x1 in ((3, 21, 27), (4, 22, 26), (5, 21, 27), (6, 22, 26)):  # two bowls, one on the other
        c.rect(x0, y, x1, y, BLUE[3] if y in (3, 5) else BLUE[2])
        c.put(x0, y, WHITE[4] if y in (3, 5) else BLUE[3])
    c.rect(0, 7, 29, 7, WOOD[5])  # the shelf
    c.rect(0, 8, 29, 9, WOOD[3]); c.rect(0, 8, 29, 8, WOOD[4])
    c.rect(0, 10, 29, 10, WOOD[1])
    for bx in (3, 25):
        c.rect(bx, 11, bx + 1, 11, WOOD[2]); c.put(bx, 12, WOOD[2])
    c.rect(6, 17, 6, 19, INK[2])  # a cast iron frying pan, hung by its handle
    disc(c, 6, 24, 4, GREY[1])
    disc(c, 6, 24, 3, GREY[0])
    c.put(4, 21, GREY[3]); c.put(3, 22, GREY[3]); c.put(5, 21, GREY[2]); c.put(8, 27, INK[2])
    c.rect(14, 17, 14, 19, COPPER[1])  # a copper saucepan
    c.rect(11, 20, 17, 26, COPPER[2]); c.rect(11, 20, 17, 20, COPPER[3])
    c.rect(11, 21, 12, 25, COPPER[3]); c.rect(12, 21, 12, 24, COPPER[4]); c.rect(17, 21, 17, 26, COPPER[1])
    c.rect(11, 26, 17, 26, COPPER[1])
    c.rect(22, 17, 22, 24, STEEL[3])  # a ladle
    c.rect(20, 25, 24, 26, STEEL[2]); c.rect(21, 27, 23, 27, STEEL[1]); c.put(20, 25, STEEL[4])
    c.outline(INK[1])
    c.rect(3, 14, 26, 14, GOLD[2])  # the brass rail, hung from the brackets, and its S-hooks
    for x in range(4, 26, 3):
        c.put(x, 14, GOLD[3])
    c.put(4, 13, GOLD[1]); c.put(25, 13, GOLD[1])
    for hx in (6, 14, 22):
        c.put(hx, 15, GREY[2]); c.put(hx, 16, GREY[1])
    return c


def jar_shelf():
    """A shelf of preserves (jam under a gingham cover, pickles, honey) with garlic, chillies and herbs drying below."""
    c = Canvas(29, 28)
    for x0, top, lid, fill, light, dark in ((1, 0, None, RED[2], RED[3], RED[1]), (10, 2, GOLD[2], LEAF[3], LEAF[5], LEAF[2]),
                                            (19, 1, WOOD[3], GOLD[3], GOLD[4], GOLD[2])):
        c.rect(x0, top + 2, x0 + 6, 8, WHITE[2])
        c.rect(x0 + 1, top + 4, x0 + 5, 8, fill)
        c.rect(x0 + 1, top + 4, x0 + 5, top + 4, light)
        c.rect(x0 + 5, top + 5, x0 + 5, 8, dark)
        c.rect(x0 + 1, top + 3, x0 + 1, 7, WHITE[4])
        if lid is None:  # a gingham cloth tied with string
            for x in range(x0 - 1, x0 + 8):
                c.put(x, top, RED[3] if x % 2 else WHITE[4]); c.put(x, top + 1, WHITE[4] if x % 2 else RED[3])
            c.rect(x0, top + 2, x0 + 6, top + 2, GOLD[2])
        else:
            c.rect(x0, top, x0 + 6, top + 1, lid); c.rect(x0, top, x0 + 6, top, light if lid != WOOD[3] else WOOD[5])
    for x in range(11, 16, 2):
        c.put(x, 7, LEAF[5])
    c.rect(0, 9, 28, 9, WOOD[5]); c.rect(0, 10, 28, 10, WOOD[3]); c.rect(0, 11, 28, 11, WOOD[1])  # the shelf
    c.rect(6, 12, 6, 14, PLASTER[2])  # garlic
    for cx, cy, tone in ((4, 17, 4), (8, 17, 3), (6, 20, 5)):
        disc(c, cx, cy, 2, PLASTER[tone])
        c.put(cx, cy, PURPLE[4]); c.put(cx, cy + 2, PLASTER[2])
    c.rect(14, 12, 14, 13, PLASTER[2])  # a string of chillies
    for i, y in enumerate(range(14, 27, 2)):
        x = 13 if i % 2 else 15
        c.put(x, y, RED[3]); c.put(x, y + 1, RED[2]); c.put(14, y, LEAF[3])
    c.rect(23, 12, 23, 13, WOOD[2])  # a bunch of herbs, hung upside down
    for y in range(14, 23):
        spread = (y - 14) // 3 + 1
        for x in range(23 - spread, 24 + spread):
            c.put(x, y, LEAF[2 + (x + y) % 3])
    return c.outline(INK[1])


def stove_pipe():
    """The range's iron flue: collars, rivets and a brass damper key."""
    c = Canvas(13, 33)
    for y in range(0, 33):
        c.rect(3, y, 9, y, GREY[1])
        c.put(3, y, GREY[2]); c.put(4, y, GREY[3]); c.put(8, y, GREY[0]); c.put(9, y, INK[2])
    for y in (6, 20):
        c.rect(2, y, 10, y + 1, GREY[1]); c.rect(2, y, 10, y, GREY[2]); c.put(3, y, GREY[4]); c.put(9, y, GREY[0])
        c.put(4, y + 1, GREY[3]); c.put(8, y + 1, GREY[3])
    c.rect(2, 29, 10, 32, GREY[1]); c.rect(2, 29, 10, 29, GREY[2]); c.put(3, 30, GREY[3])
    c.rect(9, 13, 11, 13, GOLD[2]); c.put(11, 12, GOLD[3]); c.put(11, 14, GOLD[1])
    return c.outline(INK[1])


def trailing_plant():
    """A terracotta pot hung on cords, ivy spilling over it and trailing down."""
    rng = random.Random(7)
    c = Canvas(21, 37)
    c.rect(4, 8, 16, 8, TERRA[3]); c.rect(4, 8, 7, 8, TERRA[4])
    for y, x0, x1 in ((9, 5, 15), (10, 5, 15), (11, 6, 14), (12, 6, 14), (13, 7, 13)):
        for x in range(x0, x1 + 1):
            c.put(x, y, TERRA[3] if x < x0 + 2 else TERRA[1] if x > x1 - 2 else TERRA[2])
    for _ in range(46):  # the foliage heaped in the pot
        x, y = rng.randint(3, 17), rng.randint(3, 9)
        if abs(x - 10) + max(0, 6 - y) * 2 < 9:
            tone = rng.choice((2, 3, 3, 4, 5))
            c.put(x, y, LEAF[tone]); c.put(x + 1, y, LEAF[max(1, tone - 1)])
    for vx, length in ((4, 22), (7, 27), (13, 24), (16, 18)):  # the trailing vines
        x = vx
        for i, y in enumerate(range(10, 10 + length)):
            if i and i % 5 == 0:
                x += rng.choice((-1, 0, 1))
            c.put(x, y, LEAF[2])
            if i % 3 == 0:
                side = 1 if (i // 3) % 2 else -1
                c.put(x + side, y, LEAF[4]); c.put(x + side, y + 1, LEAF[3])
    c.outline(INK[1])
    for x0, x1 in ((10, 5), (10, 15)):  # the cords up to the hook
        for y in range(1, 8):
            c.put(round(x0 + (x1 - x0) * y / 8), y, PLASTER[2])
    c.put(10, 0, GREY[2])
    return c


def glass_shelf():
    """A shelf of glassware: a flask of green, a round flask of blue, a rack of test tubes, a beaker and a succulent."""
    c = Canvas(54, 19)
    for y in range(7, 15):  # the conical flask
        half = 1 + (y - 7) * 4 // 7
        for x in range(6 - half - 1, 6 + half + 1):
            glass(c, x, y)
    for y in range(3, 7):
        glass(c, 5, y); glass(c, 6, y)
    for y in range(10, 15):
        half = 1 + (y - 7) * 4 // 7
        c.rect(6 - half, y, 5 + half, y, CHEM[3] if y > 10 else CHEM[4])
    c.put(4, 12, CHEM[5]); c.put(7, 13, CHEM[5]); c.rect(4, 2, 7, 2, WHITE[3]); c.put(5, 8, WHITE[4]); c.put(4, 9, WHITE[4])
    for y in range(1, 7):  # the round flask
        glass(c, 16, y); glass(c, 17, y)
    c.rect(15, 1, 18, 1, WHITE[3])
    for y in range(7, 15):
        for x in range(13, 22):
            if (x - 16.5) ** 2 + (y - 10.5) ** 2 <= 17:
                if y >= 10:
                    c.put(x, y, BLUE[4] if y == 10 else BLUE[3] if x < 19 else BLUE[2])
                else:
                    glass(c, x, y)
    c.put(14, 9, WHITE[4]); c.put(15, 8, WHITE[4])
    c.rect(23, 9, 33, 9, WOOD[4]); c.rect(23, 13, 33, 14, WOOD[3]); c.rect(23, 13, 33, 13, WOOD[4])  # the tube rack
    c.rect(23, 9, 23, 14, WOOD[2]); c.rect(33, 9, 33, 14, WOOD[2])
    for tx, fill in ((25, RED[3]), (28, GOLD[3]), (31, PURPLE[3])):
        for y in range(2, 13):
            for x in (tx, tx + 1):
                if y >= 7:
                    c.put(x, y, fill)
                elif y != 9:
                    glass(c, x, y, 140)
        c.rect(tx, 2, tx + 1, 2, WHITE[3]); c.put(tx, 7, WHITE[4])
    c.rect(23, 9, 33, 9, WOOD[4])
    for y in range(5, 15):  # a beaker of amber
        for x in range(37, 42):
            if y >= 9:
                c.put(x, y, COPPER[4] if y == 9 else COPPER[3] if x < 40 else COPPER[2])
            else:
                glass(c, x, y)
        c.put(36, y, WHITE[2]); c.put(42, y, WHITE[1])
    c.rect(36, 14, 42, 14, WHITE[1]); c.put(35, 5, WHITE[2])
    for y in (7, 10, 12):
        c.put(38, y, WHITE[3])
    c.rect(45, 10, 52, 10, TERRA[4]); c.rect(46, 11, 51, 14, TERRA[2]); c.rect(46, 11, 47, 14, TERRA[3])  # a succulent
    for x, y, tone in ((47, 9, 3), (48, 8, 4), (49, 7, 5), (50, 8, 4), (51, 9, 3), (48, 9, 3), (50, 9, 2), (49, 8, 4),
                       (46, 8, 3), (52, 8, 2), (49, 6, 4)):
        c.put(x, y, LEAF[tone])
    c.put(49, 5, PINK[3]); c.put(48, 5, PINK[4]); c.put(49, 4, PINK[3])
    c.rect(0, 15, 53, 15, WOOD[5]); c.rect(0, 16, 53, 17, WOOD[3]); c.rect(0, 18, 53, 18, WOOD[1])  # the shelf
    return c.outline(INK[1])


def table_plant():
    """A small potted plant for the table."""
    rng = random.Random(3)
    c = Canvas(15, 13)
    c.rect(3, 7, 11, 7, TERRA[4]); c.rect(3, 7, 11, 7, TERRA[3]); c.put(3, 7, TERRA[4]); c.put(4, 7, TERRA[4])
    for y in range(8, 13):
        x0, x1 = 4 + (y > 10), 10 - (y > 10)
        for x in range(x0, x1 + 1):
            c.put(x, y, TERRA[3] if x < x0 + 2 else TERRA[1] if x == x1 else TERRA[2])
    for _ in range(40):
        x, y = rng.randint(1, 13), rng.randint(0, 6)
        if abs(x - 7) < 2 + y:
            tone = rng.choice((2, 3, 4, 4, 5))
            c.put(x, y, LEAF[tone])
    return c.outline(INK[1])


def kettle():
    """A small copper kettle."""
    c = Canvas(9, 8)
    c.rect(3, 0, 5, 0, COPPER[1]); c.put(2, 1, COPPER[1]); c.put(6, 1, COPPER[1]); c.put(4, 1, GOLD[3])
    c.rect(2, 2, 6, 2, COPPER[3])
    c.rect(1, 3, 7, 6, COPPER[2]); c.rect(1, 3, 2, 6, COPPER[3]); c.put(2, 4, COPPER[4]); c.rect(7, 3, 7, 6, COPPER[1])
    c.rect(2, 7, 6, 7, COPPER[1])
    c.put(8, 3, COPPER[2]); c.put(8, 4, COPPER[1])
    return c.outline(INK[1])


def prints():
    """Two framed botanical prints: a fern and a toadstool."""
    c = Canvas(43, 24)
    def frame(x0, y0, x1, y1):
        c.rect(x0, y0, x1, y1, INK[1])
        x0, y0, x1, y1 = x0 + 1, y0 + 1, x1 - 1, y1 - 1
        c.rect(x0, y0, x1, y1, WOOD[2])
        c.rect(x0, y0, x1, y0, WOOD[4]); c.rect(x0, y0, x0, y1, WOOD[4])
        c.rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, PLASTER[5])
        c.rect(x0 + 2, y0 + 2, x1 - 2, y0 + 2, PLASTER[3]); c.rect(x0 + 2, y0 + 2, x0 + 2, y1 - 2, PLASTER[3])
    frame(0, 0, 20, 23)
    for y in range(4, 19):  # the fern
        x = 10 + (1 if y < 8 else 0)
        c.put(x, y, LEAF[1])
        reach = max(1, min(5, (y - 3) // 2)) if y < 16 else 2
        if y % 2 == 0:
            for i in range(1, reach + 1):
                c.put(x - i, y - i // 2, LEAF[3 if i < reach else 4]); c.put(x + i, y - i // 2, LEAF[2 if i < reach else 3])
    c.rect(7, 20, 13, 20, PLASTER[2])
    frame(23, 3, 42, 21)
    for y in range(7, 12):  # the toadstool
        half = min(5, 1 + (y - 7) * 2)
        c.rect(32 - half, y, 33 + half, y, RED[3] if y < 10 else RED[2])
    c.put(30, 9, WHITE[4]); c.put(34, 8, WHITE[4]); c.put(36, 10, WHITE[4]); c.put(32, 10, WHITE[4])
    c.rect(31, 12, 34, 16, PLASTER[3]); c.rect(31, 12, 31, 16, PLASTER[4]); c.rect(28, 17, 37, 17, LEAF[3])
    c.rect(29, 18, 36, 18, PLASTER[2])
    return c


def fuse_box():
    """A grey fuse box with its breakers behind a window and a warning sign on the door."""
    c = Canvas(17, 25)
    c.rect(7, 0, 9, 4, GREY[1]); c.rect(7, 0, 7, 4, GREY[2])  # the conduit
    c.rect(1, 5, 15, 23, GREY[2])
    c.rect(1, 5, 15, 5, GREY[3]); c.rect(1, 5, 2, 23, GREY[3]); c.rect(14, 6, 15, 23, GREY[1]); c.rect(1, 23, 15, 23, GREY[1])
    c.rect(3, 7, 13, 7, GREY[1]); c.rect(3, 21, 13, 21, GREY[3])
    c.rect(4, 9, 12, 12, INK[1])
    for x, colour in ((5, RED[3]), (7, LEAF[4]), (9, GOLD[3]), (11, BLUE[3])):
        c.put(x, 10, WHITE[3]); c.put(x, 11, colour)
    for y, x0, x1 in ((14, 8, 8), (15, 7, 9), (16, 7, 9), (17, 6, 10), (18, 5, 11), (19, 5, 11)):
        c.rect(x0, y, x1, y, GOLD[3])
    c.put(8, 15, INK[1]); c.put(8, 16, INK[1]); c.put(7, 17, INK[1]); c.put(8, 17, INK[1]); c.put(9, 17, INK[1]); c.put(8, 18, INK[1])
    c.put(13, 15, GREY[4]); c.put(13, 16, GREY[1])
    return c.outline(INK[1])


SHACK_PROPS = [("fridge", fridge), ("pendant_lamp", pendant_lamp), ("pan_shelf", pan_shelf), ("jar_shelf", jar_shelf),
               ("stove_pipe", stove_pipe), ("trailing_plant", trailing_plant), ("glass_shelf", glass_shelf),
               ("table_plant", table_plant), ("kettle", kettle), ("prints", prints), ("fuse_box", fuse_box)]


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
         ("cat", cat), ("chair", chair()), ("chair_r", chair(True))] + SHACK_PROPS


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
    sheet = snap(sheet.crop((0, 0, sheet.width, (used + 7) // 8 * 8)))
    sheet.save(ROOT / "godot" / "art" / "decor.png")
    data_path = ROOT / "godot" / "data" / "decor.json"
    data = json.loads(data_path.read_text()) if data_path.exists() else {"placements": []}
    data["sprites"] = {name: regions[name] for name, _ in PROPS}
    text = json.dumps(data, indent=2)
    data_path.write_text(text + "\n")
    print("wrote", ROOT / "godot" / "art" / "decor.png", "and the sprite regions in", data_path)


if __name__ == "__main__":
    main()
