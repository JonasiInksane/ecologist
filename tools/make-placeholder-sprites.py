#!/usr/bin/env python3
"""Draws the placeholder player sprite sheet (godot/art/player.png) until PixelLab or hand-drawn art replaces it.

Eight 32 x 48 frames, facing right: idle, four walking frames, jump, and two climbing frames. The 20 x 42 hitbox
sits at x 6-25, y 6-47 of each frame. Usage: python3 tools/make-placeholder-sprites.py
"""
from pathlib import Path
from PIL import Image

W, H, FRAMES = 32, 48, 8
SKIN, SKIN_DARK = (233, 182, 140), (196, 140, 104)
HAIR, HAIR_DARK = (92, 58, 38), (66, 40, 28)
SHIRT, SHIRT_DARK, SHIRT_LIGHT = (62, 150, 136), (40, 108, 100), (98, 186, 166)
PANTS, PANTS_DARK = (70, 84, 120), (50, 60, 90)
BELT, BOOT, BOOT_DARK = (60, 44, 32), (88, 60, 40), (62, 42, 30)
EYE, OUTLINE = (34, 30, 36), (24, 22, 30)


def rect(img, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < img.width and 0 <= y < img.height:
                img.putpixel((x, y), color + (255,))


def leg(img, x, top, bottom, color, boot_forward):
    rect(img, x, top, x + 3, bottom - 3, color)
    rect(img, x, bottom - 2, x + 3 + boot_forward, bottom, BOOT)
    rect(img, x, bottom, x + 3 + boot_forward, bottom, BOOT_DARK)


def arm(img, x, top, length, color, raised=False):
    if raised:
        rect(img, x, top - length + 2, x + 2, top + 1, color)
        rect(img, x, top - length, x + 2, top - length + 1, SKIN)
    else:
        rect(img, x, top, x + 2, top + length - 3, color)
        rect(img, x, top + length - 2, x + 2, top + length - 1, SKIN)


def figure(img, step=0, bob=0, jump=False, climb=None):
    """step: -2..2 leg swing; climb: 0 or 1 for the alternating climbing pose."""
    y = bob
    # back arm and back leg first, in darker tones
    if climb is not None:
        arm(img, 9, 21 + y, 9, SHIRT_DARK, raised=climb == 0)
    else:
        arm(img, 10 - (step > 0), 21 + y, 11, SHIRT_DARK)
    if jump:
        leg(img, 11, 33 + y, 43 + y, PANTS_DARK, 1)
    elif climb is not None:
        leg(img, 12, 33 + y, 47 - 2 * climb, PANTS_DARK, 2)
    else:
        leg(img, 13 - step, 33 + y, 47, PANTS_DARK, 2)
    # torso
    rect(img, 11, 20 + y, 21, 32 + y, SHIRT)
    rect(img, 11, 20 + y, 12, 32 + y, SHIRT_DARK)
    rect(img, 19, 21 + y, 20, 28 + y, SHIRT_LIGHT)
    rect(img, 15, 20 + y, 17, 21 + y, SKIN_DARK)  # open collar
    rect(img, 11, 32 + y, 21, 33 + y, BELT)
    # front leg
    if jump:
        leg(img, 16, 33 + y, 42 + y, PANTS, 2)
    elif climb is not None:
        leg(img, 16, 33 + y, 45 + 2 * climb, PANTS, 2)
    else:
        leg(img, 16 + step, 33 + y, 47, PANTS, 2)
    # head
    rect(img, 15, 18 + y, 18, 19 + y, SKIN_DARK)  # neck
    rect(img, 12, 8 + y, 21, 17 + y, SKIN)
    rect(img, 19, 12 + y, 19, 13 + y, EYE)
    rect(img, 21, 14 + y, 21, 14 + y, SKIN_DARK)  # nose
    rect(img, 18, 16 + y, 20, 16 + y, SKIN_DARK)  # mouth
    rect(img, 11, 6 + y, 21, 9 + y, HAIR)
    rect(img, 11, 6 + y, 13, 15 + y, HAIR)
    rect(img, 12, 6 + y, 20, 6 + y, HAIR_DARK)
    rect(img, 14, 10 + y, 14, 12 + y, SKIN_DARK)  # ear
    # front arm
    if climb is not None:
        arm(img, 21, 21 + y, 9, SHIRT, raised=climb == 1)
    elif jump:
        arm(img, 22, 21 + y, 9, SHIRT, raised=True)
    else:
        arm(img, 17 + step, 21 + y, 11, SHIRT)


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


def main():
    poses = [
        dict(),
        dict(step=3), dict(step=0, bob=-1), dict(step=-3), dict(step=0, bob=-1),
        dict(jump=True),
        dict(climb=0), dict(climb=1),
    ]
    sheet = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    for i, pose in enumerate(poses):
        frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        figure(frame, **pose)
        sheet.paste(outline(frame), (i * W, 0))
    path = Path(__file__).resolve().parent.parent / "godot" / "art" / "player.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
