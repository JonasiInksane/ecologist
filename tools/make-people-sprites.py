#!/usr/bin/env python3
"""Draws the townspeople (godot/art/people.png): placeholders in the style of the player sprite until PixelLab or
hand-drawn art replaces them.

Each look is one row of seven 32 x 48 frames, facing right: idle, four walking frames and two knocking frames. The
looks are listed in LOOKS, in the order godot/data/people.json refers to them by index. Below the people, a row of
24 x 16 dogs: three frames (idle, two walking) for each coat in DOGS.
Usage: python3 tools/make-people-sprites.py
"""
from pathlib import Path
from PIL import Image

W, H, FRAMES = 32, 48, 7
EYE, OUTLINE = (34, 30, 36), (24, 22, 30)

SKINS = {"light": (240, 200, 166), "tan": (226, 172, 128), "brown": (176, 118, 80), "dark": (112, 72, 50),
         "pale": (226, 228, 234)}

# Each look: skin, hair (style, colour), top (style, colour), bottom (style, colour), shoes, extras.
LOOKS = [
    # 0 the postman
    dict(skin="tan", hair=("short", (60, 40, 30)), top=("shirt", (86, 128, 196)), bottom=("shorts", (40, 52, 92)),
         shoes=(40, 40, 44), extras={"cap": (52, 76, 150), "bag": (128, 92, 52)}),
    # 1 a jogger
    dict(skin="light", hair=("short", (214, 172, 92)), top=("tank", (250, 128, 48)), bottom=("shorts", (34, 34, 40)),
         shoes=(236, 236, 240), extras={"headband": (236, 236, 240)}),
    # 2 an old lady
    dict(skin="light", hair=("bun", (196, 196, 204)), top=("jacket", (132, 88, 160)), bottom=("skirt", (88, 70, 100)),
         shoes=(70, 50, 40), extras={"glasses": True}),
    # 3 a man in a suit
    dict(skin="brown", hair=("bald", (40, 30, 26)), top=("jacket", (52, 58, 72)), bottom=("pants", (60, 64, 78)),
         shoes=(30, 26, 26), extras={"collar": (236, 236, 240)}),
    # 4 a teenager
    dict(skin="tan", hair=("short", (40, 30, 26)), top=("hoodie", (196, 56, 60)), bottom=("pants", (64, 92, 150)),
         shoes=(236, 236, 240), extras={"cap": (40, 40, 44)}),
    # 5 a woman in yellow
    dict(skin="dark", hair=("long", (24, 20, 22)), top=("shirt", (240, 196, 72)), bottom=("pants", (70, 120, 84)),
         shoes=(88, 60, 40), extras={}),
    # 6 a man in a striped shirt
    dict(skin="light", hair=("short", (220, 180, 100)), top=("stripes", (186, 74, 64)), bottom=("pants", (120, 92, 64)),
         shoes=(70, 50, 40), extras={}),
    # 7 a night nurse in scrubs
    dict(skin="brown", hair=("short", (30, 24, 22)), top=("shirt", (82, 172, 166)), bottom=("pants", (82, 172, 166)),
         shoes=(236, 236, 240), extras={}),
    # 8 a hipster with a beanie and a beard
    dict(skin="light", hair=("short", (120, 72, 40)), top=("jacket", (206, 160, 60)), bottom=("pants", (50, 54, 60)),
         shoes=(88, 60, 40), extras={"beanie": (70, 110, 90), "beard": (120, 72, 40)}),
    # 9 a dog walker
    dict(skin="light", hair=("long", (196, 96, 48)), top=("jacket", (84, 120, 70)), bottom=("pants", (60, 64, 78)),
         shoes=(70, 50, 40), extras={}),
    # 10 a punk
    dict(skin="light", hair=("mohawk", (236, 92, 168)), top=("jacket", (36, 36, 42)), bottom=("pants", (52, 52, 60)),
         shoes=(30, 26, 26), extras={}),
    # 11 a grandpa
    dict(skin="tan", hair=("short", (226, 226, 230)), top=("shirt", (196, 176, 136)), bottom=("pants", (96, 88, 80)),
         shoes=(70, 50, 40), extras={"glasses": True, "beard": (226, 226, 230)}),
    # 12 a baker in an apron
    dict(skin="tan", hair=("bun", (88, 52, 32)), top=("apron", (90, 130, 196)), bottom=("skirt", (90, 130, 196)),
         shoes=(70, 50, 40), extras={}),
    # 13 the pale gentleman who only comes out at night
    dict(skin="pale", hair=("slick", (20, 18, 24)), top=("cape", (30, 28, 36)), bottom=("pants", (30, 28, 36)),
         shoes=(20, 18, 22), extras={"lining": (150, 30, 40), "collar": (236, 236, 240)}),
    # 14 a courier
    dict(skin="dark", hair=("short", (24, 20, 22)), top=("jacket", (120, 80, 170)), bottom=("pants", (40, 40, 44)),
         shoes=(236, 236, 240), extras={"cap": (120, 80, 170)}),
    # 15 a chef
    dict(skin="light", hair=("short", (60, 40, 30)), top=("shirt", (240, 240, 236)), bottom=("pants", (50, 50, 56)),
         shoes=(30, 26, 26), extras={"toque": (248, 248, 246)}),
]

DOGS = [(150, 100, 60), (40, 36, 36), (232, 226, 210)]


def shade(color, factor):
    return tuple(max(0, min(255, int(round(c * factor)))) for c in color)


def rect(img, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < img.width and 0 <= y < img.height:
                img.putpixel((x, y), color + (255,))


def figure(img, look, step=0, bob=0, knock=None):
    """step: leg swing; knock: None, 0 (fist up) or 1 (fist at the door)."""
    y = bob
    skin = SKINS[look["skin"]]
    skin_dark = shade(skin, 0.84)
    top_style, top = look["top"]
    top_dark, top_light = shade(top, 0.72), shade(top, 1.18)
    bottom_style, bottom = look["bottom"]
    bottom_dark = shade(bottom, 0.74)
    shoes = look["shoes"]
    extras = look["extras"]
    sleeve, sleeve_dark = (skin, skin_dark) if top_style == "tank" else (top, top_dark)
    if top_style == "apron":
        sleeve, sleeve_dark = top, top_dark

    def leg(x, top_y, bottom_y, color, forward):
        if bottom_style == "shorts":
            rect(img, x, top_y, x + 3, top_y + 4, color)
            rect(img, x, top_y + 5, x + 3, bottom_y - 3, skin if color == bottom else skin_dark)
        else:
            rect(img, x, top_y, x + 3, bottom_y - 3, color)
        rect(img, x, bottom_y - 2, x + 3 + forward, bottom_y, shoes)
        rect(img, x, bottom_y, x + 3 + forward, bottom_y, shade(shoes, 0.7))

    def arm(x, top_y, length, color, hand=skin):
        rect(img, x, top_y, x + 2, top_y + length - 3, color)
        rect(img, x, top_y + length - 2, x + 2, top_y + length - 1, hand)

    # back arm and back leg first, in darker tones
    arm(10 - (step > 0), 21 + y, 11, sleeve_dark if top_style != "cape" else top_dark)
    if bottom_style != "skirt":
        leg(13 - step, 33 + y, 47, bottom_dark, 2)
    # torso and legs
    rect(img, 11, 20 + y, 21, 32 + y, top)
    rect(img, 11, 20 + y, 12, 32 + y, top_dark)
    if top_style == "stripes":
        for row in range(22, 32, 3):
            rect(img, 11, row + y, 21, row + y, (236, 228, 214))
    elif top_style == "jacket":
        rect(img, 16, 20 + y, 17, 32 + y, top_dark)
    elif top_style == "hoodie":
        rect(img, 11, 18 + y, 13, 21 + y, top_dark)
        rect(img, 15, 26 + y, 20, 30 + y, top_dark)
    elif top_style == "apron":
        rect(img, 14, 21 + y, 21, 36 + y, (244, 242, 236))
        rect(img, 14, 21 + y, 14, 36 + y, (206, 204, 198))
    elif top_style == "cape":
        rect(img, 9, 20 + y, 22, 40 + y, top)
        rect(img, 9, 20 + y, 11, 40 + y, extras.get("lining", top_dark))
        rect(img, 9, 40 + y, 22, 40 + y, top_dark)
    else:
        rect(img, 19, 21 + y, 20, 28 + y, top_light)
    if "collar" in extras:
        rect(img, 15, 20 + y, 18, 21 + y, extras["collar"])
    elif top_style != "hoodie":
        rect(img, 15, 20 + y, 17, 21 + y, skin_dark)
    if "bag" in extras:
        for i in range(10):
            rect(img, 12 + i, 20 + i + y, 12 + i, 20 + i + y, extras["bag"])
        rect(img, 19, 29 + y, 23, 33 + y, extras["bag"])
    if bottom_style == "skirt":
        rect(img, 11, 33 + y, 21, 44, bottom)
        rect(img, 11, 33 + y, 12, 44, bottom_dark)
        rect(img, 13, 45, 16, 47, skin_dark)
        rect(img, 13 + step // 2, 46, 18 + step // 2, 47, shoes)
    else:
        if top_style != "apron" and top_style != "cape":
            rect(img, 11, 32 + y, 21, 33 + y, shade(bottom, 0.55))
        leg(16 + step, 33 + y, 47, bottom, 2)
    # head
    rect(img, 15, 18 + y, 18, 19 + y, skin_dark)
    rect(img, 12, 8 + y, 21, 17 + y, skin)
    rect(img, 19, 12 + y, 19, 13 + y, EYE)
    rect(img, 21, 14 + y, 21, 14 + y, skin_dark)
    rect(img, 18, 16 + y, 20, 16 + y, skin_dark)
    style, hair = look["hair"]
    hair_dark = shade(hair, 0.72)
    if style in ("short", "long", "bun"):
        rect(img, 11, 6 + y, 21, 9 + y, hair)
        rect(img, 11, 6 + y, 13, 15 + y, hair)
        rect(img, 12, 6 + y, 20, 6 + y, hair_dark)
        if style == "long":
            rect(img, 10, 9 + y, 13, 22 + y, hair)
            rect(img, 10, 9 + y, 10, 22 + y, hair_dark)
        if style == "bun":
            rect(img, 8, 5 + y, 11, 9 + y, hair)
            rect(img, 8, 9 + y, 11, 9 + y, hair_dark)
    elif style == "bald":
        rect(img, 11, 11 + y, 13, 14 + y, hair)
    elif style == "mohawk":
        rect(img, 14, 2 + y, 18, 8 + y, hair)
        rect(img, 14, 2 + y, 18, 2 + y, shade(hair, 1.2))
        rect(img, 11, 10 + y, 13, 14 + y, shade(skin, 0.9))
    elif style == "slick":
        rect(img, 11, 6 + y, 21, 8 + y, hair)
        rect(img, 11, 6 + y, 13, 13 + y, hair)
        rect(img, 18, 8 + y, 19, 9 + y, hair)
    rect(img, 14, 10 + y, 14, 12 + y, skin_dark)
    if "cap" in extras:
        rect(img, 11, 5 + y, 21, 8 + y, extras["cap"])
        rect(img, 19, 8 + y, 24, 9 + y, shade(extras["cap"], 0.75))
    if "beanie" in extras:
        rect(img, 11, 4 + y, 21, 9 + y, extras["beanie"])
        rect(img, 11, 9 + y, 21, 9 + y, shade(extras["beanie"], 0.75))
    if "toque" in extras:
        rect(img, 12, 0 + y, 20, 7 + y, extras["toque"])
        rect(img, 12, 7 + y, 20, 7 + y, shade(extras["toque"], 0.82))
    if "headband" in extras:
        rect(img, 11, 8 + y, 21, 9 + y, extras["headband"])
    if "glasses" in extras:
        rect(img, 17, 12 + y, 21, 12 + y, OUTLINE)
        rect(img, 18, 13 + y, 20, 13 + y, (180, 210, 230))
    if "beard" in extras:
        rect(img, 15, 15 + y, 21, 18 + y, extras["beard"])
        rect(img, 18, 16 + y, 20, 16 + y, shade(extras["beard"], 0.7))
    # front arm
    if knock is None:
        arm(17 + step, 21 + y, 11, sleeve)
    else:
        # The arm reaches forward, fist raised to the door at shoulder height, then a knock lower.
        reach = 21 + y if knock == 0 else 23 + y
        rect(img, 18, reach, 26, reach + 2, sleeve)
        rect(img, 27, reach - 1, 28, reach + 2, skin)


def outline(img):
    out = img.copy()
    for y in range(img.height):
        for x in range(img.width):
            if img.getpixel((x, y))[3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < img.width and 0 <= ny < img.height and img.getpixel((nx, ny))[3]:
                    out.putpixel((x, y), OUTLINE + (255,))
                    break
    return out


def dog(img, coat, step):
    dark = shade(coat, 0.7)
    rect(img, 5, 6, 17, 10, coat)
    rect(img, 5, 6, 17, 6, shade(coat, 1.15))
    rect(img, 16, 3, 21, 8, coat)
    rect(img, 21, 6, 22, 7, OUTLINE)
    rect(img, 16, 2, 17, 4, dark)
    rect(img, 19, 5, 19, 5, EYE)
    rect(img, 2, 4, 4, 6, coat)
    for x, swing in ((6, step), (9, -step), (13, step), (16, -step)):
        rect(img, x + swing, 11, x + 1 + swing, 15, dark if x in (9, 16) else coat)


def main():
    poses = [dict(), dict(step=3), dict(step=0, bob=-1), dict(step=-3), dict(step=0, bob=-1),
             dict(knock=0), dict(knock=1)]
    sheet = Image.new("RGBA", (W * FRAMES, H * len(LOOKS) + 16), (0, 0, 0, 0))
    for row, look in enumerate(LOOKS):
        for i, pose in enumerate(poses):
            frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            figure(frame, look, **pose)
            sheet.paste(outline(frame), (i * W, row * H))
    for d, coat in enumerate(DOGS):
        for i, step in enumerate((0, 1, -1)):
            frame = Image.new("RGBA", (24, 16), (0, 0, 0, 0))
            dog(frame, coat, step)
            sheet.paste(outline(frame), ((d * 3 + i) * 24, H * len(LOOKS)))
    path = Path(__file__).resolve().parent.parent / "godot" / "art" / "people.png"
    sheet.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
