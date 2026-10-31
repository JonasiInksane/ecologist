#!/usr/bin/env python3
"""Builds the player sheet (godot/art/player.png): the mad scientist, from PixelLab concepts.

The source frames live in art-source/pixellab/player/ (48 x 48, generated with PixelLab: character
1e504385-5b0c-48b3-a919-69d3ffe125c3, "walking-8-frames" east). This script cuts them into the game's eight 32 x 48
frames, facing right: idle, four walking frames, jump, and two climbing frames. The 20 x 42 hitbox sits at x 6-25,
y 6-47 of each frame. Every pixel is snapped to the palette in tools/palette.py and the outline is set to ink[1].
Usage: python3 tools/make-player-sprites.py
"""
from pathlib import Path
from PIL import Image, ImageOps

from palette import ramp, snap

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-source" / "pixellab" / "player"
W, H = 32, 48
OUTLINE = tuple(ramp("ink")[1])
# The character stands centred on x 23.5 of its 48-pixel canvas; the hitbox centre is x 15.5 of a frame.
SHIFT = 8


def load(name):
    return Image.open(SOURCE / f"{name}.png").convert("RGBA")


def frame(img, dx=0, dy=0):
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(img, (-SHIFT + dx, dy))
    return out


def ink_outline(img):
    """Any near-black pixel on the silhouette's edge becomes the palette's outline ink."""
    px = img.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            px[x, y] = (r, g, b, 255)
            edge = any(not (0 <= x + dx < W and 0 <= y + dy < H) or img.getpixel((x + dx, y + dy))[3] < 128
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge and r + g + b < 150:
                px[x, y] = OUTLINE + (255,)
    return img


def main():
    front = load("front")
    poses = [
        frame(load("idle")),
        frame(load("walk-2")), frame(load("walk-4")), frame(load("walk-6")), frame(load("walk-0")),
        frame(load("walk-6"), dy=-1),
        frame(front), frame(ImageOps.mirror(front), dx=-2, dy=-1),
    ]
    sheet = Image.new("RGBA", (W * len(poses), H), (0, 0, 0, 0))
    for i, pose in enumerate(poses):
        sheet.paste(ink_outline(snap(pose)), (i * W, 0))
    path = ROOT / "godot" / "art" / "player.png"
    sheet.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
