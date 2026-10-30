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


def stove(img, ox):
    rect(img, ox, 3, ox + 31, 31, OUTLINE)
    rect(img, ox + 1, 4, ox + 30, 30, ENAMEL)
    rect(img, ox + 1, 4, ox + 30, 4, ENAMEL_LIGHT)
    rect(img, ox + 29, 5, ox + 30, 30, ENAMEL_DARK)
    rect(img, ox, 0, ox + 31, 2, GRATE)  # the burner grate the pans stand on
    for x in range(ox + 2, ox + 30, 4):
        rect(img, x, 1, x + 1, 1, (70, 70, 78))
    for i, x in enumerate((ox + 5, ox + 12, ox + 19, ox + 26)):  # knobs
        rect(img, x - 1, 6, x + 1, 8, KNOB)
        rect(img, x, 6, x, 6, (150, 150, 158))
    rect(img, ox + 3, 11, ox + 28, 27, OUTLINE)  # oven door
    rect(img, ox + 4, 12, ox + 27, 26, ENAMEL_DARK)
    rect(img, ox + 6, 15, ox + 25, 24, GLASS)
    rect(img, ox + 7, 16, ox + 10, 16, GLASS_LIGHT)
    rect(img, ox + 7, 13, ox + 24, 13, STEEL)  # handle
    rect(img, ox + 2, 29, ox + 4, 31, OUTLINE)
    rect(img, ox + 27, 29, ox + 29, 31, OUTLINE)


def sink(img, ox):
    rect(img, ox, 0, ox + 31, 3, STEEL_DARK)  # counter with the basin set into it
    rect(img, ox, 0, ox + 31, 0, STEEL_LIGHT)
    rect(img, ox + 6, 1, ox + 25, 3, (70, 80, 88))
    rect(img, ox + 1, 4, ox + 30, 31, OUTLINE)
    rect(img, ox + 2, 5, ox + 29, 30, WOOD)
    rect(img, ox + 2, 5, ox + 29, 5, WOOD_LIGHT)
    rect(img, ox + 15, 6, ox + 16, 30, WOOD_DARK)  # two cupboard doors
    rect(img, ox + 12, 15, ox + 13, 18, STEEL)
    rect(img, ox + 18, 15, ox + 19, 18, STEEL)
    for y in (10, 22):
        rect(img, ox + 4, y, ox + 13, y, WOOD_DARK)
        rect(img, ox + 18, y, ox + 27, y, WOOD_DARK)


def table(img, ox):
    rect(img, ox, 0, ox + 47, 3, OUTLINE)
    rect(img, ox + 1, 0, ox + 46, 2, WOOD)
    rect(img, ox + 1, 0, ox + 46, 0, WOOD_LIGHT)
    for x in (ox + 3, ox + 41):
        rect(img, x, 4, x + 3, 31, OUTLINE)
        rect(img, x + 1, 4, x + 2, 31, WOOD_DARK)
    rect(img, ox + 7, 20, ox + 40, 21, WOOD_DARK)


def saucepan(img, ox, oy):
    rect(img, ox + 1, oy + 2, ox + 1, oy + 15, STEEL_DARK)  # walls, rim and base around a clear inside
    rect(img, ox + 14, oy + 2, ox + 14, oy + 15, STEEL_DARK)
    rect(img, ox, oy + 2, ox + 15, oy + 2, STEEL_LIGHT)
    rect(img, ox + 1, oy + 14, ox + 14, oy + 15, STEEL)
    rect(img, ox + 1, oy + 15, ox + 14, oy + 15, STEEL_DARK)
    rect(img, ox + 15, oy + 4, ox + 15, oy + 5, OUTLINE)  # handle stub


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
    img.save(art / "equipment.png")
    trucks = Image.new("RGBA", (192, 128), (0, 0, 0, 0))
    van(trucks, 0, 0)
    tanker(trucks, 0, 64)
    trucks.save(art / "vehicles.png")
    print(f"wrote {art / 'equipment.png'} and {art / 'vehicles.png'}")


if __name__ == "__main__":
    main()
