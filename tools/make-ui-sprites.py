#!/usr/bin/env python3
"""Draws the game's interface art: framed panels, buttons, hotbar slots and bars (godot/art/ui.png) and 16 x 16
icons (godot/art/icons.png). Placeholders in the style of the equipment sprites, until hand-drawn art replaces them.

ui.png is drawn on a logical pixel grid and saved at twice the size, so the 9-slice frames keep square pixels at the
game's 2x interface scale; godot/ui_style.gd names each region and its margins. icons.png stays at 1x and is drawn at
2x with nearest filtering.
Usage: python3 tools/make-ui-sprites.py
"""
from pathlib import Path
from PIL import Image

OUTLINE = (14, 19, 22)
STEEL_LIGHT, STEEL, STEEL_DARK = (150, 166, 174), (98, 114, 123), (58, 70, 77)
INSIDE = (28, 41, 48)
RIVET = (196, 206, 210)
FACE, FACE_HOVER, FACE_DOWN, FACE_OFF = (47, 74, 84), (63, 98, 110), (32, 52, 60), (40, 50, 54)
LIP, LIP_HOVER, SHADE = (95, 133, 146), (128, 170, 184), (21, 35, 42)
AMBER, AMBER_DARK = (242, 201, 76), (176, 132, 36)
SLOT, SLOT_DARK = (22, 33, 39), (12, 19, 23)
PAPER, PAPER_DARK, INK = (236, 232, 220), (196, 190, 176), (40, 44, 48)
RED, RED_DARK = (214, 72, 72), (140, 36, 44)
BLUE, BLUE_DARK = (88, 160, 226), (40, 92, 150)
GREEN, GREEN_DARK = (110, 196, 120), (52, 120, 66)
WOOD, WOOD_DARK, WOOD_LIGHT = (156, 112, 70), (112, 78, 48), (190, 144, 96)
BRICK, BRICK_DARK, MORTAR = (166, 74, 56), (118, 48, 38), (196, 180, 160)
STONE, STONE_DARK, STONE_LIGHT = (130, 138, 140), (92, 98, 102), (170, 176, 178)
DIRT, DIRT_DARK = (150, 104, 70), (112, 76, 50)
GLASS, GLASS_LIGHT = (120, 176, 196), (200, 232, 240)
GOLD, GOLD_DARK, GOLD_LIGHT = (232, 184, 56), (168, 120, 30), (255, 228, 130)
WHITE = (240, 236, 224)
FLAME, FLAME_CORE = (240, 120, 40), (255, 214, 90)


def put(img, x, y, color, alpha=255):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), color + (alpha,))


def rect(img, x0, y0, x1, y1, color, alpha=255):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(img, x, y, color, alpha)


def frame(img, ox, oy, w, h):
    """The window frame: a steel band with rivets around a dark, slightly see-through inside."""
    rect(img, ox, oy, ox + w - 1, oy + h - 1, OUTLINE)
    rect(img, ox + 1, oy + 1, ox + w - 2, oy + h - 2, STEEL)
    rect(img, ox + 1, oy + 1, ox + w - 2, oy + 1, STEEL_LIGHT)
    rect(img, ox + 1, oy + 1, ox + 1, oy + h - 2, STEEL_LIGHT)
    rect(img, ox + 1, oy + h - 2, ox + w - 2, oy + h - 2, STEEL_DARK)
    rect(img, ox + w - 2, oy + 1, ox + w - 2, oy + h - 2, STEEL_DARK)
    rect(img, ox + 4, oy + 4, ox + w - 5, oy + h - 5, OUTLINE)
    rect(img, ox + 5, oy + 5, ox + w - 6, oy + h - 6, INSIDE, 240)
    for x, y in ((ox + 2, oy + 2), (ox + w - 4, oy + 2), (ox + 2, oy + h - 4), (ox + w - 4, oy + h - 4)):
        rect(img, x, y, x + 1, y + 1, STEEL_DARK)
        put(img, x, y, RIVET)


def button(img, ox, oy, face, lip, down=False):
    rect(img, ox, oy, ox + 15, oy + 15, OUTLINE)
    rect(img, ox + 1, oy + 1, ox + 14, oy + 14, face)
    if down:
        rect(img, ox + 1, oy + 1, ox + 14, oy + 1, SHADE)
        rect(img, ox + 1, oy + 1, ox + 1, oy + 14, SHADE)
    else:
        rect(img, ox + 1, oy + 1, ox + 14, oy + 1, lip)
        rect(img, ox + 1, oy + 1, ox + 1, oy + 13, lip)
        rect(img, ox + 1, oy + 13, ox + 14, oy + 14, SHADE)
        rect(img, ox + 14, oy + 2, ox + 14, oy + 14, SHADE)


def slot(img, ox, oy, border):
    rect(img, ox, oy, ox + 19, oy + 19, border)
    rect(img, ox + 1, oy + 1, ox + 18, oy + 18, OUTLINE)
    rect(img, ox + 2, oy + 2, ox + 17, oy + 17, SLOT)
    rect(img, ox + 2, oy + 2, ox + 17, oy + 2, SLOT_DARK)
    rect(img, ox + 2, oy + 2, ox + 2, oy + 17, SLOT_DARK)


def small_panel(img, ox, oy):
    rect(img, ox, oy, ox + 15, oy + 15, OUTLINE)
    rect(img, ox + 1, oy + 1, ox + 14, oy + 14, STEEL_DARK)
    rect(img, ox + 2, oy + 2, ox + 13, oy + 13, INSIDE, 245)
    rect(img, ox + 1, oy + 1, ox + 14, oy + 1, STEEL)


def inset(img, ox, oy, color=SLOT):
    rect(img, ox, oy, ox + 11, oy + 11, OUTLINE)
    rect(img, ox + 1, oy + 1, ox + 10, oy + 10, color)
    rect(img, ox + 1, oy + 1, ox + 10, oy + 1, SLOT_DARK)


def fill(img, ox, oy, color, dark):
    rect(img, ox, oy, ox + 7, oy + 7, color)
    rect(img, ox, oy + 6, ox + 7, oy + 7, dark)
    rect(img, ox, oy + 1, ox + 7, oy + 1, tuple(min(255, c + 40) for c in color))


def paper(img, ox, oy, border):
    rect(img, ox, oy, ox + 11, oy + 11, border)
    rect(img, ox + 1, oy + 1, ox + 10, oy + 10, PAPER)


def bezel(img, ox, oy):
    """The laptop's screen bezel: dark plastic around the screen."""
    rect(img, ox, oy, ox + 31, oy + 31, OUTLINE)
    rect(img, ox + 1, oy + 1, ox + 30, oy + 30, (52, 56, 62))
    rect(img, ox + 1, oy + 1, ox + 30, oy + 1, (84, 90, 98))
    rect(img, ox + 7, oy + 7, ox + 24, oy + 24, OUTLINE)
    rect(img, ox + 8, oy + 8, ox + 23, oy + 23, PAPER)


def ui_sheet():
    img = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
    frame(img, 0, 0, 32, 32)
    button(img, 32, 0, FACE, LIP)
    button(img, 48, 0, FACE_HOVER, LIP_HOVER)
    button(img, 64, 0, FACE_DOWN, LIP, down=True)
    button(img, 80, 0, FACE_OFF, FACE_OFF)
    slot(img, 96, 0, OUTLINE)
    slot(img, 96, 20, AMBER)
    small_panel(img, 0, 32)
    inset(img, 16, 32)
    fill(img, 28, 32, RED, RED_DARK)
    fill(img, 36, 32, BLUE, BLUE_DARK)
    fill(img, 44, 32, GREEN, GREEN_DARK)
    fill(img, 52, 32, AMBER, AMBER_DARK)
    paper(img, 60, 32, PAPER_DARK)
    paper(img, 72, 32, AMBER)
    bezel(img, 84, 32)
    button(img, 32, 16, (226, 220, 204), (250, 248, 240))  # a web button inside the laptop
    button(img, 48, 16, (244, 214, 120), (255, 238, 170))
    button(img, 64, 16, (200, 176, 96), (226, 204, 130), down=True)
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


# Icons, 16 x 16 each, in a 16-wide grid; ui_style.gd keeps the same order.
ICONS = ["heart", "bubble", "coin", "sun", "moon", "truck", "crate", "gear", "pause", "hammer", "pot",
         "wood", "brick", "stone", "glass", "steel", "dirt", "wood_wall", "brick_wall", "ladder", "door",
         "pipe", "valve", "pump", "thermometer", "drop", "flask", "flame", "laptop", "save", "load", "sandbox",
         "sack", "beet", "close"]


def icon(name, img, ox, oy):
    p = lambda x, y, c: put(img, ox + x, oy + y, c)
    r = lambda x0, y0, x1, y1, c: rect(img, ox + x0, oy + y0, ox + x1, oy + y1, c)
    if name == "heart":
        for y, (a, b) in enumerate([(2, 5), (1, 6), (1, 13), (1, 14), (1, 14), (2, 13), (3, 12), (4, 11), (5, 10), (6, 9), (7, 8)]):
            r(a, y + 3, b, y + 3, RED)
        r(9, 3, 12, 3, RED)
        r(8, 4, 13, 4, RED)
        r(3, 4, 4, 5, (250, 170, 170))
        for x, y in ((2, 2), (5, 2), (10, 2), (13, 2)):
            p(x, y + 1, RED_DARK)
    elif name == "bubble":
        for y in range(3, 14):
            for x in range(3, 14):
                d = (x - 8) ** 2 + (y - 8) ** 2
                if 20 <= d <= 30:
                    p(x, y, BLUE)
        r(5, 5, 6, 6, (210, 236, 255))
    elif name == "coin":
        for y in range(2, 15):
            for x in range(3, 14):
                d = ((x - 8) / 5.5) ** 2 + ((y - 8) / 6.5) ** 2
                if d <= 1:
                    p(x, y, GOLD if d < 0.6 else GOLD_DARK)
        r(7, 5, 9, 5, GOLD_LIGHT)
        r(7, 5, 7, 11, GOLD_LIGHT)
        r(7, 11, 9, 11, GOLD_DARK)
    elif name == "sun":
        for y in range(16):
            for x in range(16):
                d = (x - 7.5) ** 2 + (y - 7.5) ** 2
                if d < 12:
                    p(x, y, GOLD_LIGHT if d < 5 else GOLD)
        for x, y in ((7, 1), (8, 1), (7, 14), (8, 14), (1, 7), (1, 8), (14, 7), (14, 8), (3, 3), (12, 3), (3, 12), (12, 12)):
            p(x, y, GOLD)
    elif name == "moon":
        for y in range(16):
            for x in range(16):
                if (x - 7.5) ** 2 + (y - 7.5) ** 2 < 36 and (x - 10) ** 2 + (y - 5.5) ** 2 > 22:
                    p(x, y, (220, 226, 240))
    elif name == "truck":
        r(1, 4, 9, 11, WHITE)
        r(1, 8, 9, 8, (214, 120, 62))
        r(10, 6, 14, 11, (178, 52, 52))
        r(11, 7, 13, 8, GLASS_LIGHT)
        for x in (3, 11):
            r(x, 11, x + 2, 13, OUTLINE)
    elif name == "crate":
        r(2, 3, 13, 13, WOOD)
        r(2, 3, 13, 3, WOOD_LIGHT)
        for y in (3, 8, 13):
            r(2, y, 13, y, WOOD_DARK)
        for x in (2, 13):
            r(x, 3, x, 13, WOOD_DARK)
        for i in range(10):
            p(3 + i, 4 + i // 2 if i < 8 else 7, WOOD_DARK)
    elif name == "gear":
        for y in range(16):
            for x in range(16):
                d = (x - 7.5) ** 2 + (y - 7.5) ** 2
                tooth = (abs(x - 7.5) < 1.6 or abs(y - 7.5) < 1.6 or abs(abs(x - 7.5) - abs(y - 7.5)) < 1.2) and d < 52
                if (d < 26 or tooth) and d > 5:
                    p(x, y, STEEL_LIGHT if d < 14 else STEEL)
    elif name == "pause":
        r(4, 3, 6, 12, WHITE)
        r(9, 3, 11, 12, WHITE)
    elif name == "hammer":
        r(3, 3, 11, 6, STEEL_LIGHT)
        r(3, 6, 11, 6, STEEL_DARK)
        r(6, 7, 8, 14, WOOD)
        r(8, 7, 8, 14, WOOD_DARK)
    elif name == "pot":
        r(2, 6, 13, 13, STEEL)
        r(2, 6, 13, 6, STEEL_LIGHT)
        r(3, 13, 12, 13, STEEL_DARK)
        r(0, 7, 1, 8, STEEL_DARK)
        r(14, 7, 15, 8, STEEL_DARK)
        for x in (5, 9):
            r(x, 2, x, 4, (200, 210, 214))
    elif name == "wood":
        r(1, 1, 14, 14, WOOD)
        for y in (5, 10):
            r(1, y, 14, y, WOOD_DARK)
        for x, y in ((6, 2), (11, 7), (4, 12)):
            r(x, y, x, y + 2, WOOD_DARK)
        r(1, 1, 14, 1, WOOD_LIGHT)
    elif name in ("brick", "brick_wall"):
        dark = name == "brick_wall"
        r(1, 1, 14, 14, MORTAR if not dark else (120, 110, 100))
        for row in range(4):
            y = 1 + row * 4
            off = 0 if row % 2 == 0 else 3
            for x0 in range(-3 + off, 15, 6):
                c = BRICK if not dark else BRICK_DARK
                r(max(1, x0), y, min(14, x0 + 4), y + 2, c)
    elif name == "stone":
        r(1, 1, 14, 14, STONE)
        for x, y in ((3, 3), (9, 5), (5, 10), (11, 11), (2, 7)):
            r(x, y, x + 2, y + 1, STONE_DARK)
            p(x, y, STONE_LIGHT)
    elif name == "glass":
        r(1, 1, 14, 14, OUTLINE)
        r(2, 2, 13, 13, GLASS)
        for i in range(4):
            p(4 + i, 7 - i, GLASS_LIGHT)
            p(8 + i, 11 - i, GLASS_LIGHT)
    elif name == "steel":
        r(1, 1, 14, 14, STEEL)
        r(1, 1, 14, 1, STEEL_LIGHT)
        r(1, 14, 14, 14, STEEL_DARK)
        for x, y in ((3, 3), (12, 3), (3, 12), (12, 12)):
            p(x, y, RIVET)
    elif name == "dirt":
        r(1, 1, 14, 14, DIRT)
        r(1, 1, 14, 3, GREEN_DARK)
        r(1, 1, 14, 1, GREEN)
        for x, y in ((4, 7), (10, 9), (7, 12), (12, 5)):
            p(x, y, DIRT_DARK)
    elif name == "wood_wall":
        r(1, 1, 14, 14, WOOD_DARK)
        for x in (4, 8, 12):
            r(x, 1, x, 14, (84, 58, 36))
    elif name == "ladder":
        r(3, 0, 4, 15, WOOD)
        r(11, 0, 12, 15, WOOD)
        for y in (2, 6, 10, 14):
            r(5, y, 10, y, WOOD_LIGHT)
    elif name == "door":
        r(3, 0, 12, 15, WOOD_DARK)
        r(4, 1, 11, 14, WOOD)
        r(4, 7, 11, 7, WOOD_DARK)
        p(10, 8, GOLD)
    elif name == "pipe":
        r(0, 5, 15, 10, OUTLINE)
        r(0, 6, 15, 9, STEEL)
        r(0, 6, 15, 6, STEEL_LIGHT)
        for x in (3, 11):
            r(x, 4, x + 1, 11, STEEL_DARK)
    elif name == "valve":
        r(0, 8, 15, 12, OUTLINE)
        r(0, 9, 15, 11, STEEL)
        r(5, 6, 10, 13, (178, 52, 52))
        r(7, 2, 8, 6, STEEL_DARK)
        r(3, 1, 12, 2, (178, 52, 52))
    elif name == "pump":
        r(2, 4, 13, 13, OUTLINE)
        r(3, 5, 12, 12, (60, 120, 90))
        for y in range(6, 12):
            p(4 + (y - 6), y, (150, 220, 180))
        r(0, 7, 2, 9, STEEL)
        r(13, 7, 15, 9, STEEL)
        r(6, 1, 9, 4, STEEL_DARK)
    elif name == "thermometer":
        r(6, 1, 9, 11, OUTLINE)
        r(7, 2, 8, 11, WHITE)
        r(7, 6, 8, 11, RED)
        r(5, 11, 10, 14, OUTLINE)
        r(6, 12, 9, 13, RED)
    elif name == "drop":
        for y in range(2, 15):
            for x in range(3, 13):
                if (y > 8 and (x - 7.5) ** 2 + (y - 9.5) ** 2 < 18) or (y <= 8 and abs(x - 7.5) < (y - 2) * 0.7):
                    p(x, y, (232, 176, 74))
        r(5, 9, 5, 11, (255, 230, 160))
    elif name == "flask":
        r(6, 1, 9, 6, OUTLINE)
        r(7, 1, 8, 6, GLASS_LIGHT)
        for y in range(6, 15):
            half = 1 + (y - 6) * 0.6
            r(int(7.5 - half), y, int(7.5 + half), y, GREEN if y > 9 else GLASS_LIGHT)
        r(2, 14, 13, 14, OUTLINE)
    elif name == "flame":
        for y in range(2, 15):
            w = (y - 2) * 0.5 if y < 10 else 4 - (y - 10) * 0.4
            r(int(7.5 - w), y, int(7.5 + w), y, FLAME)
            if y > 7:
                w2 = max(0, w - 2)
                r(int(7.5 - w2), y, int(7.5 + w2), y, FLAME_CORE)
    elif name == "laptop":
        r(3, 2, 12, 10, OUTLINE)
        r(4, 3, 11, 9, (70, 150, 170))
        r(1, 11, 14, 13, (128, 132, 140))
        r(1, 13, 14, 13, (88, 92, 100))
    elif name == "save":
        r(2, 2, 13, 13, BLUE_DARK)
        r(4, 2, 11, 6, WHITE)
        r(5, 9, 10, 13, (40, 44, 48))
    elif name == "load":
        r(1, 5, 14, 13, WOOD_LIGHT)
        r(1, 3, 6, 5, WOOD_LIGHT)
        r(1, 7, 14, 13, GOLD)
    elif name == "sandbox":
        r(1, 10, 14, 14, (215, 185, 121))
        for x, y in ((3, 8), (6, 6), (9, 8), (12, 7), (5, 3), (10, 4)):
            p(x, y, (215, 185, 121))
        r(9, 9, 14, 10, BLUE)
    elif name == "sack":
        burlap, burlap_dark, burlap_light = (196, 164, 112), (142, 112, 70), (222, 198, 150)
        for y, (a, b) in enumerate([(6, 9), (5, 10), (6, 9), (4, 11), (3, 12), (2, 13), (2, 13), (2, 13), (2, 13),
                                    (2, 13), (2, 13), (3, 12)]):
            r(a, y + 2, b, y + 2, burlap)
            p(a, y + 2, burlap_dark)
            p(b, y + 2, burlap_dark)
        r(5, 4, 10, 4, burlap_dark)
        r(4, 6, 5, 9, burlap_light)
        r(4, 14, 11, 14, burlap_dark)
    elif name == "beet":
        purple, purple_dark = (150, 40, 90), (100, 24, 60)
        leaf, leaf_dark = (96, 176, 84), (52, 120, 56)
        r(6, 1, 7, 5, leaf)
        r(9, 0, 10, 5, leaf_dark)
        r(4, 2, 5, 4, leaf_dark)
        for y in range(5, 14):
            for x in range(16):
                if ((x - 7.5) / 5.0) ** 2 + ((y - 9.0) / 4.0) ** 2 <= 1:
                    p(x, y, purple)
        r(7, 13, 8, 15, purple_dark)
        r(5, 7, 6, 8, (200, 90, 140))
    elif name == "close":
        for i in range(10):
            for d in (0, 1):
                p(3 + i + d, 3 + i, RED_DARK)
                p(12 - i - d, 3 + i, RED_DARK)
        for i in range(9):
            p(3 + i, 3 + i, RED)
            p(12 - i, 3 + i, RED)


def icon_sheet():
    img = Image.new("RGBA", (256, 16 * ((len(ICONS) + 15) // 16)), (0, 0, 0, 0))
    for i, name in enumerate(ICONS):
        icon(name, img, (i % 16) * 16, (i // 16) * 16)
    return img


def main():
    art = Path(__file__).resolve().parent.parent / "godot" / "art"
    ui_sheet().save(art / "ui.png")
    icon_sheet().save(art / "icons.png")
    print(f"wrote {art / 'ui.png'} and {art / 'icons.png'}")


if __name__ == "__main__":
    main()
