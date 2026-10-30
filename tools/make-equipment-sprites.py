#!/usr/bin/env python3
"""Draws the placeholder kitchen sprites (godot/art/equipment.png) until PixelLab or hand-drawn art replaces them.

One 160 x 32 sheet; data/equipment.json names each piece's region. Vessels are drawn as cutaways with a clear
interior: the game paints the back wall and the contents first, then this sprite's walls over them.
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


def main():
    img = Image.new("RGBA", (160, 32), (0, 0, 0, 0))
    stove(img, 0)
    sink(img, 32)
    table(img, 64)
    saucepan(img, 112, 0)
    mold(img, 112, 16)
    salt_pan(img, 128, 0)
    out = Path(__file__).resolve().parent.parent / "godot" / "art" / "equipment.png"
    img.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
