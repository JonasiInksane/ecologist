#!/usr/bin/env python3
"""Draws the placeholder equipment and vehicle sprites (godot/art/equipment.png and godot/art/vehicles.png) until
PixelLab or hand-drawn art replaces them.

equipment.png is one 192 x 80 sheet: the M1 kitchen in the top 32 rows, the M2 kit below. data/equipment.json names
each piece's region and its clear inside. Vessels are drawn as cutaways (or with a sight glass, for closed tanks):
the game paints the back wall and the contents first, then this sprite's walls over them. Ports get a flange where
the pipe couples. vehicles.png holds the delivery van and the tanker named in data/shop.json.
Usage: python3 tools/make-equipment-sprites.py
"""
from pathlib import Path
from PIL import Image

from palette import ramp, snap

OUTLINE = (30, 32, 38)
STEEL, STEEL_LIGHT, STEEL_DARK = (168, 178, 186), (214, 222, 226), (104, 114, 122)
ENAMEL, ENAMEL_DARK, ENAMEL_LIGHT = (226, 220, 204), (178, 170, 152), (244, 240, 228)
GRATE, GLASS, GLASS_LIGHT = (44, 44, 50), (46, 58, 66), (92, 112, 122)
WOOD, WOOD_DARK, WOOD_LIGHT = (156, 112, 70), (112, 78, 48), (190, 144, 96)
RED, RED_DARK, RED_LIGHT = (196, 64, 74), (140, 40, 52), (228, 110, 116)
KNOB = (60, 60, 66)
BLUE, BLUE_DARK, BLUE_LIGHT = (52, 96, 156), (34, 64, 108), (90, 136, 196)
HDPE, HDPE_DARK = (226, 230, 224), (184, 190, 184)
CAGE, CAGE_DARK = (150, 156, 160), (96, 102, 108)
YELLOW, YELLOW_DARK = (222, 176, 52), (164, 122, 30)
FLAME_RING = (58, 62, 70)


def rect(img, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < img.width and 0 <= y < img.height:
                img.putpixel((x, y), color + (255,))


# The kitchen pieces are drawn after the dusk workshop reference (docs/design/art-reference-workshop.png): ink outlines,
# light from the top left, an iron range with brass knobs, a wooden cabinet under a stone counter, a sturdy table.
INK_, IRON, BRASS, OAK, STONE_TOP = ramp("ink"), ramp("grey"), ramp("gold"), ramp("wood"), ramp("plaster")
STEELR, GLOW, RED_ = ramp("steel"), ramp("glow"), ramp("red")


def stove(img, ox):
    """An iron range in the dusk workshop reference's manner: a burner grate the pans stand on, brass knobs, a chrome
    rail and an oven door with the fire glowing behind its window."""
    x0, x1 = ox + 4, ox + 27
    rect(img, x0 - 1, 0, x1 + 1, 29, INK_[1])
    for x in range(x0, x1 + 1):  # the grate
        put_rgb(img, x, 1, IRON[2] if (x - x0) % 4 == 1 else INK_[0])
    rect(img, x0, 2, x1, 2, IRON[0])
    rect(img, x0, 3, x1, 6, IRON[0]); rect(img, x0, 3, x1, 3, IRON[1]); rect(img, x0, 3, x0, 6, IRON[1])
    for kx in (ox + 8, ox + 13, ox + 18, ox + 23):
        put_rgb(img, kx, 4, BRASS[4]); put_rgb(img, kx + 1, 4, BRASS[3])
        put_rgb(img, kx, 5, BRASS[2]); put_rgb(img, kx + 1, 5, BRASS[1])
    rect(img, x0, 7, x1, 7, INK_[1])
    rect(img, x0, 8, x1, 27, IRON[0]); rect(img, x0, 8, x0, 27, IRON[1]); rect(img, x1, 8, x1, 27, INK_[2])
    rect(img, ox + 7, 9, ox + 24, 9, IRON[2]); put_rgb(img, ox + 7, 9, IRON[4]); put_rgb(img, ox + 8, 9, IRON[3])  # the chrome rail
    put_rgb(img, ox + 6, 9, INK_[1]); put_rgb(img, ox + 25, 9, INK_[1])
    rect(img, ox + 6, 11, ox + 25, 23, INK_[2])  # the oven door
    rect(img, ox + 6, 11, ox + 25, 11, IRON[1]); rect(img, ox + 6, 11, ox + 6, 23, IRON[1])
    rect(img, ox + 9, 13, ox + 22, 21, INK_[0])  # the window and the fire behind it
    rect(img, ox + 10, 14, ox + 21, 20, RED_[0])
    rect(img, ox + 10, 17, ox + 21, 20, RED_[1])
    for fx, height in ((11, 2), (13, 4), (15, 3), (17, 5), (19, 3), (20, 2)):
        for y in range(20 - height, 21):
            tone = 3 if y > 20 - height + 1 else 2
            put_rgb(img, ox + fx, y, GLOW[tone if y < 20 else 1])
            put_rgb(img, ox + fx + 1, y, GLOW[max(1, tone - 1)])
    rect(img, ox + 10, 20, ox + 21, 20, GLOW[1])
    put_rgb(img, ox + 10, 14, IRON[2]); put_rgb(img, ox + 11, 14, IRON[1])  # a glint on the glass
    rect(img, ox + 6, 25, ox + 25, 26, IRON[1]); rect(img, ox + 13, 25, ox + 18, 25, IRON[2])  # the warming drawer
    rect(img, x0, 28, x1, 29, INK_[2])
    for lx in (ox + 5, ox + 24):  # the feet
        rect(img, lx, 30, lx + 2, 31, INK_[1])


def grain(img, x0, y0, x1, y1, base, seed):
    """Wood with a long grain: streaks one tone either side of base, a knot now and then."""
    import random
    rng = random.Random(seed)
    for x in range(x0, x1 + 1):
        streak = rng.random()
        for y in range(y0, y1 + 1):
            tone = base + (1 if streak > 0.82 else -1 if streak < 0.18 else 0)
            if rng.random() < 0.04:
                tone -= 1
            put_rgb(img, x, y, OAK[max(0, min(6, tone))])
    if (x1 - x0) > 6 and (y1 - y0) > 8:
        kx, ky = rng.randrange(x0 + 2, x1 - 1), rng.randrange(y0 + 3, y1 - 2)
        put_rgb(img, kx, ky, OAK[base - 2]); put_rgb(img, kx + 1, ky, OAK[base - 1])


def put_rgb(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), tuple(color) + (255,))


def sink(img, ox):
    # a stone counter with the basin set into it, its front lip lit and a shadow under it
    rect(img, ox, 0, ox + 31, 4, INK_[1])
    rect(img, ox + 1, 1, ox + 30, 2, STONE_TOP[4])
    rect(img, ox + 1, 1, ox + 30, 1, STONE_TOP[5])
    rect(img, ox + 1, 3, ox + 30, 3, STONE_TOP[2])
    rect(img, ox + 7, 1, ox + 24, 2, STEELR[1])
    rect(img, ox + 7, 1, ox + 24, 1, STEELR[0])
    rect(img, ox + 8, 2, ox + 23, 2, STEELR[2])
    rect(img, ox + 1, 5, ox + 30, 31, INK_[1])
    grain(img, ox + 2, 5, ox + 29, 30, 3, 11)
    rect(img, ox + 2, 5, ox + 29, 6, OAK[1])  # the shadow under the counter
    for x0, x1, seed in ((ox + 3, ox + 14, 12), (ox + 17, ox + 28, 13)):  # two panelled doors
        rect(img, x0, 8, x1, 28, INK_[2])
        grain(img, x0 + 1, 9, x1 - 1, 27, 4, seed)
        rect(img, x0 + 1, 9, x1 - 1, 9, OAK[5])
        rect(img, x0 + 1, 9, x0 + 1, 27, OAK[5])
        rect(img, x0 + 3, 12, x1 - 3, 24, OAK[2])
        grain(img, x0 + 4, 13, x1 - 3, 24, 3, seed + 7)
        rect(img, x0 + 4, 13, x1 - 3, 13, OAK[1])
        rect(img, x0 + 4, 13, x0 + 4, 24, OAK[1])
        rect(img, x0 + 3, 25, x1 - 3, 25, OAK[5])
    rect(img, ox + 15, 8, ox + 16, 30, OAK[1])
    for hx in (ox + 12, ox + 19):  # brass pulls
        rect(img, hx, 15, hx, 19, BRASS[2])
        put_rgb(img, hx, 15, BRASS[4])
        put_rgb(img, hx, 19, BRASS[1])
    rect(img, ox + 2, 29, ox + 29, 30, OAK[1])
    rect(img, ox + 2, 30, ox + 29, 30, INK_[2])


def table(img, ox):
    rect(img, ox, 0, ox + 47, 5, INK_[1])  # a thick oak top, lit along its front edge
    grain(img, ox + 1, 0, ox + 46, 3, 4, 21)
    rect(img, ox + 1, 0, ox + 46, 0, OAK[6])
    rect(img, ox + 1, 3, ox + 46, 4, OAK[2])
    rect(img, ox + 1, 4, ox + 46, 4, OAK[1])
    rect(img, ox + 4, 5, ox + 43, 9, INK_[1])  # the apron with a drawer
    grain(img, ox + 5, 5, ox + 42, 8, 3, 22)
    rect(img, ox + 5, 5, ox + 42, 5, OAK[1])
    rect(img, ox + 18, 6, ox + 29, 8, INK_[2])
    rect(img, ox + 19, 6, ox + 28, 7, OAK[4])
    put_rgb(img, ox + 23, 7, BRASS[3]); put_rgb(img, ox + 24, 7, BRASS[4])
    for x in (ox + 3, ox + 40):  # turned legs and a stretcher
        rect(img, x, 9, x + 4, 31, INK_[1])
        rect(img, x + 1, 9, x + 3, 31, OAK[3])
        rect(img, x + 1, 9, x + 1, 31, OAK[5])
        rect(img, x + 3, 9, x + 3, 31, OAK[2])
        for y in (13, 21):
            rect(img, x, y, x + 4, y + 1, OAK[4])
            rect(img, x, y, x + 4, y, OAK[5])
            put_rgb(img, x + 4, y + 1, OAK[2])
        rect(img, x + 1, 30, x + 3, 31, OAK[1])
    rect(img, ox + 8, 23, ox + 39, 25, INK_[1])
    rect(img, ox + 8, 24, ox + 39, 24, OAK[3])
    rect(img, ox + 8, 23, ox + 39, 23, OAK[2])


def saucepan(img, ox, oy):
    """A copper saucepan cut away to show what's cooking: walls, a rolled rim, a heavy base and a wooden handle."""
    COP = ramp("copper")
    rect(img, ox, oy + 2, ox + 15, oy + 2, INK_[1])
    rect(img, ox + 1, oy + 2, ox + 14, oy + 2, COP[4])  # the rim
    rect(img, ox, oy + 3, ox, oy + 15, INK_[1]); rect(img, ox + 1, oy + 3, ox + 1, oy + 14, COP[3])  # walls round a clear inside
    rect(img, ox + 14, oy + 3, ox + 14, oy + 14, COP[1]); rect(img, ox + 15, oy + 3, ox + 15, oy + 15, INK_[1])
    rect(img, ox + 1, oy + 14, ox + 14, oy + 14, COP[2]); rect(img, ox + 1, oy + 15, ox + 14, oy + 15, INK_[1])
    put_rgb(img, ox + 1, oy + 14, COP[3]); put_rgb(img, ox, oy + 15, (0, 0, 0)); put_rgb(img, ox + 15, oy + 15, (0, 0, 0))
    img.putpixel((ox, oy + 15), (0, 0, 0, 0)); img.putpixel((ox + 15, oy + 15), (0, 0, 0, 0))
    rect(img, ox + 15, oy + 4, ox + 15, oy + 5, OAK[2])  # the handle stub
    put_rgb(img, ox + 15, oy + 4, OAK[4])


def mold(img, ox, oy):
    rect(img, ox, oy + 1, ox, oy + 7, RED_DARK)
    rect(img, ox + 15, oy + 1, ox + 15, oy + 7, RED_DARK)
    rect(img, ox, oy + 6, ox + 15, oy + 7, RED)
    rect(img, ox, oy + 7, ox + 15, oy + 7, RED_DARK)
    rect(img, ox, oy + 1, ox, oy + 1, RED_LIGHT)
    rect(img, ox + 15, oy + 1, ox + 15, oy + 1, RED_LIGHT)


def salt_pan(img, ox, oy):
    rect(img, ox, oy + 1, ox, oy + 7, STEEL_DARK)
    rect(img, ox + 31, oy + 1, ox + 31, oy + 7, STEEL_DARK)
    rect(img, ox, oy + 6, ox + 31, oy + 7, (84, 90, 96))
    rect(img, ox, oy + 7, ox + 31, oy + 7, OUTLINE)
    rect(img, ox, oy + 1, ox, oy + 1, STEEL_LIGHT)
    rect(img, ox + 31, oy + 1, ox + 31, oy + 1, STEEL_LIGHT)


def flange(img, x, y, horizontal):
    """A pipe stub at a port: horizontal for side ports, vertical for top and bottom ones."""
    if horizontal:
        rect(img, x, y, x + 2, y + 3, OUTLINE)
        rect(img, x, y + 1, x + 2, y + 2, STEEL)
    else:
        rect(img, x, y, x + 3, y + 2, OUTLINE)
        rect(img, x + 1, y, x + 2, y + 2, STEEL)


def laptop(img, ox, oy):
    rect(img, ox + 3, oy, ox + 12, oy + 5, OUTLINE)  # the lid, open
    rect(img, ox + 4, oy + 1, ox + 11, oy + 4, (70, 150, 170))
    rect(img, ox + 5, oy + 2, ox + 8, oy + 2, (180, 230, 236))
    rect(img, ox + 1, oy + 6, ox + 14, oy + 7, (88, 92, 100))
    rect(img, ox + 1, oy + 6, ox + 14, oy + 6, (128, 132, 140))


def drum(img, ox, oy):
    rect(img, ox + 1, oy + 1, ox + 14, oy + 31, OUTLINE)
    rect(img, ox + 2, oy + 2, ox + 13, oy + 30, BLUE)
    rect(img, ox + 2, oy + 2, ox + 3, oy + 30, BLUE_LIGHT)
    rect(img, ox + 12, oy + 2, ox + 13, oy + 30, BLUE_DARK)
    for y in (oy + 2, oy + 11, oy + 21, oy + 30):  # rolling hoops
        rect(img, ox + 1, y, ox + 14, y, BLUE_DARK)
    rect(img, ox + 4, oy + 3, ox + 11, oy + 30, OUTLINE)  # sight glass frame around the clear inside (5, 4, 6, 26)
    for y in range(oy + 4, oy + 30):
        for x in range(ox + 5, ox + 11):
            img.putpixel((x, y), (0, 0, 0, 0))
    rect(img, ox + 9, oy, ox + 12, oy + 1, STEEL_DARK)  # the bung on top
    flange(img, ox, oy + 26, True)
    flange(img, ox + 13, oy + 26, True)


def tote(img, ox, oy):
    rect(img, ox + 1, oy + 1, ox + 46, oy + 44, HDPE_DARK)  # the bottle, translucent where the inside shows
    for y in range(oy + 3, oy + 45):
        for x in range(ox + 3, ox + 45):
            img.putpixel((x, y), (0, 0, 0, 0))
    for x in range(ox, ox + 48, 8):  # the steel cage drawn over the contents
        rect(img, x, oy, x + 1, oy + 44, CAGE)
    for y in range(oy, oy + 45, 11):
        rect(img, ox, y, ox + 47, y + 1, CAGE)
    rect(img, ox, oy, ox + 47, oy, CAGE_DARK)
    rect(img, ox + 46, oy, ox + 47, oy + 44, CAGE_DARK)
    rect(img, ox + 16, oy, ox + 31, oy + 2, HDPE)  # filling caps on the top ports
    rect(img, ox + 18, oy, ox + 29, oy, OUTLINE)
    rect(img, ox, oy + 45, ox + 47, oy + 47, WOOD)  # pallet
    rect(img, ox, oy + 47, ox + 47, oy + 47, WOOD_DARK)
    for x in (ox + 2, ox + 22, ox + 42):
        rect(img, x, oy + 46, x + 3, oy + 47, WOOD_DARK)
    flange(img, ox, oy + 40, True)
    flange(img, ox + 45, oy + 40, True)


def coupling(img, ox, oy):
    rect(img, ox + 1, oy + 1, ox + 14, oy + 14, OUTLINE)  # a yellow manifold box with a camlock for the tanker hose
    rect(img, ox + 2, oy + 2, ox + 13, oy + 13, YELLOW)
    rect(img, ox + 12, oy + 2, ox + 13, oy + 13, YELLOW_DARK)
    rect(img, ox + 3, oy + 3, ox + 12, oy + 12, OUTLINE)
    for y in range(oy + 4, oy + 12):
        for x in range(ox + 4, ox + 12):
            img.putpixel((x, y), (0, 0, 0, 0))
    rect(img, ox + 14, oy + 1, ox + 15, oy + 4, STEEL_DARK)  # camlock
    rect(img, ox + 1, oy + 15, ox + 14, oy + 15, (70, 70, 76))
    flange(img, ox + 2, oy, False)
    flange(img, ox + 10, oy, False)


def kettle(img, ox, oy):
    rect(img, ox + 1, oy + 1, ox + 46, oy + 21, OUTLINE)  # the jacket around an open bowl, inside (3, 3, 42, 17)
    rect(img, ox + 2, oy + 2, ox + 45, oy + 20, STEEL)
    rect(img, ox + 2, oy + 20, ox + 45, oy + 20, STEEL_DARK)
    for y in range(oy + 3, oy + 20):
        for x in range(ox + 3, ox + 45):
            img.putpixel((x, y), (0, 0, 0, 0))
    rect(img, ox, oy + 1, ox + 47, oy + 2, STEEL_LIGHT)  # rim
    rect(img, ox + 4, oy + 22, ox + 43, oy + 22, OUTLINE)
    rect(img, ox + 6, oy + 25, ox + 41, oy + 26, FLAME_RING)  # the gas ring under it
    for x in (ox + 4, ox + 41):  # legs
        rect(img, x, oy + 22, x + 2, oy + 31, OUTLINE)
        rect(img, x + 1, oy + 22, x + 1, oy + 31, STEEL_DARK)
    rect(img, ox + 2, oy + 27, ox + 9, oy + 28, STEEL_DARK)  # drain lines to the side ports
    rect(img, ox + 38, oy + 27, ox + 45, oy + 28, STEEL_DARK)
    flange(img, ox, oy + 26, True)
    flange(img, ox + 45, oy + 26, True)
    rect(img, ox + 21, oy + 29, ox + 26, oy + 31, KNOB)  # the burner knob
    rect(img, ox + 23, oy + 29, ox + 24, oy + 29, (150, 150, 158))


def centrifuge(img, ox, oy):
    rect(img, ox + 1, oy + 1, ox + 30, oy + 25, OUTLINE)  # casing with the basket showing, inside (7, 5, 18, 14)
    rect(img, ox + 2, oy + 2, ox + 29, oy + 24, (120, 132, 140))
    rect(img, ox + 2, oy + 2, ox + 29, oy + 2, STEEL_LIGHT)
    rect(img, ox + 5, oy + 3, ox + 26, oy + 20, OUTLINE)
    rect(img, ox + 6, oy + 4, ox + 25, oy + 19, (88, 96, 104))  # perforated basket wall
    for y in range(oy + 5, oy + 19):
        for x in range(ox + 7, ox + 25):
            img.putpixel((x, y), (0, 0, 0, 0))
    for y in range(oy + 5, oy + 19, 3):
        img.putpixel((ox + 6, y), (40, 44, 50, 255))
        img.putpixel((ox + 25, y), (40, 44, 50, 255))
    rect(img, ox + 6, oy + 26, ox + 25, oy + 31, OUTLINE)  # motor
    rect(img, ox + 7, oy + 27, ox + 24, oy + 30, (64, 112, 84))
    for x in range(ox + 9, ox + 23, 3):
        rect(img, x, oy + 27, x, oy + 30, (44, 82, 60))
    rect(img, ox + 1, oy + 26, ox + 5, oy + 27, STEEL_DARK)  # casing drains
    rect(img, ox + 26, oy + 26, ox + 30, oy + 27, STEEL_DARK)
    flange(img, ox, oy + 26, True)
    flange(img, ox + 29, oy + 26, True)


def wheel(img, cx, cy):
    rect(img, cx - 5, cy - 5, cx + 5, cy + 5, OUTLINE)
    rect(img, cx - 4, cy - 6, cx + 4, cy + 6, OUTLINE)
    rect(img, cx - 6, cy - 4, cx + 6, cy + 4, OUTLINE)
    rect(img, cx - 2, cy - 2, cx + 2, cy + 2, STEEL)


def cab(img, ox, oy, colour, dark):
    """A truck cab facing left (towards the plot), 30 px wide, on a 64 px tall strip."""
    rect(img, ox, oy + 14, ox + 29, oy + 55, OUTLINE)
    rect(img, ox + 1, oy + 15, ox + 28, oy + 54, colour)
    rect(img, ox + 1, oy + 48, ox + 28, oy + 54, dark)
    rect(img, ox + 3, oy + 18, ox + 18, oy + 32, OUTLINE)  # windscreen
    rect(img, ox + 4, oy + 19, ox + 17, oy + 31, (120, 170, 196))
    rect(img, ox + 5, oy + 20, ox + 9, oy + 20, (200, 230, 240))
    rect(img, ox, oy + 44, ox + 3, oy + 47, (250, 226, 140))  # headlight
    rect(img, ox + 21, oy + 36, ox + 25, oy + 37, dark)  # door handle


def van(img, ox, oy):
    cab(img, ox, oy + 6, (236, 238, 240), (170, 176, 182))
    rect(img, ox + 28, oy + 4, ox + 111, oy + 55, OUTLINE)  # box body
    rect(img, ox + 29, oy + 5, ox + 110, oy + 54, (236, 238, 240))
    rect(img, ox + 29, oy + 5, ox + 110, oy + 6, (250, 252, 252))
    rect(img, ox + 29, oy + 30, ox + 110, oy + 35, (214, 120, 62))  # livery stripe
    rect(img, ox + 29, oy + 36, ox + 110, oy + 37, (170, 84, 40))
    rect(img, ox + 106, oy + 8, ox + 108, oy + 52, (196, 200, 204))  # rear door seam
    for cx in (ox + 18, ox + 92):
        wheel(img, cx, oy + 57)


def tanker(img, ox, oy):
    cab(img, ox, oy, (178, 52, 52), (120, 32, 36))
    rect(img, ox + 30, oy + 48, ox + 191, oy + 53, OUTLINE)  # chassis
    rect(img, ox + 34, oy + 12, ox + 189, oy + 47, OUTLINE)  # the tank, rounded at the ends
    rect(img, ox + 32, oy + 16, ox + 191, oy + 43, OUTLINE)
    rect(img, ox + 35, oy + 13, ox + 188, oy + 46, (198, 206, 212))
    rect(img, ox + 33, oy + 17, ox + 190, oy + 42, (198, 206, 212))
    rect(img, ox + 35, oy + 14, ox + 188, oy + 17, (232, 238, 242))
    rect(img, ox + 35, oy + 41, ox + 188, oy + 46, (150, 160, 168))
    rect(img, ox + 40, oy + 26, ox + 186, oy + 30, (58, 120, 170))  # sea-blue stripe
    for x in (ox + 70, ox + 110, ox + 150):
        rect(img, x, oy + 13, x, oy + 46, (150, 160, 168))
    rect(img, ox + 100, oy + 8, ox + 120, oy + 11, OUTLINE)  # walkway hatch
    rect(img, ox + 31, oy + 42, ox + 37, oy + 49, STEEL_DARK)  # hose connection behind the cab
    for cx in (ox + 18, ox + 150, ox + 172):
        wheel(img, cx, oy + 57)


def main():
    img = Image.new("RGBA", (192, 80), (0, 0, 0, 0))
    stove(img, 0)
    sink(img, 32)
    table(img, 64)
    saucepan(img, 112, 0)
    mold(img, 112, 16)
    salt_pan(img, 128, 0)
    laptop(img, 0, 32)
    drum(img, 16, 32)
    tote(img, 32, 32)
    coupling(img, 80, 32)
    kettle(img, 96, 32)
    centrifuge(img, 144, 32)
    art = Path(__file__).resolve().parent.parent / "godot" / "art"
    img = snap(img)
    img.save(art / "equipment.png")
    trucks = Image.new("RGBA", (192, 128), (0, 0, 0, 0))
    van(trucks, 0, 0)
    tanker(trucks, 0, 64)
    snap(trucks).save(art / "vehicles.png")
    print(f"wrote {art / 'equipment.png'} and {art / 'vehicles.png'}")


if __name__ == "__main__":
    main()
