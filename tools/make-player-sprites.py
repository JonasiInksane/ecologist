#!/usr/bin/env python3
"""Draws the player (godot/art/player.png): the mad scientist. A shock of white hair, brass goggles pushed up on the
forehead, a lab coat with a chemical stain and pens in the pocket, yellow rubber gloves and heavy boots.

Eight 32 x 48 frames, facing right: idle, four walking frames, jump, and two climbing frames. The 20 x 42 hitbox
sits at x 6-25, y 6-47 of each frame (the hair may stick out above it). Colours come from tools/palette.py.
Usage: python3 tools/make-player-sprites.py
"""
from pathlib import Path
from PIL import Image

from palette import ramp

W, H, FRAMES = 32, 48, 8
INK, SKIN, WHITE, GREY = ramp("ink"), ramp("skin"), ramp("white"), ramp("grey")
GOLD, CHEM, PURPLE, SKY, RED, BLUE = ramp("gold"), ramp("chem"), ramp("purple"), ramp("sky"), ramp("red"), ramp("blue")
NIGHT = ramp("night")
OUTLINE = INK[1]


class Frame:
    def __init__(self):
        self.img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.px = self.img.load()

    def put(self, x, y, color):
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = tuple(color) + (255,)

    def rect(self, x0, y0, x1, y1, color):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, color)

    def outline(self):
        src = self.img.copy().load()
        for y in range(H):
            for x in range(W):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and src[nx, ny][3]:
                        self.px[x, y] = OUTLINE + (255,)
                        break
        return self.img


def leg(f, x, top, bottom, shade, toe):
    trouser = NIGHT[2] if shade else NIGHT[3]
    f.rect(x, top, x + 3, bottom - 3, trouser)
    f.rect(x, top, x, bottom - 3, NIGHT[1] if shade else NIGHT[2])
    # boots: dark leather with a grey sole, the toe pointing forward
    f.rect(x - (1 if not shade else 0), bottom - 3, x + 3 + toe, bottom - 1, INK[2] if shade else GREY[0])
    f.rect(x - (1 if not shade else 0), bottom - 3, x + 3 + toe, bottom - 3, GREY[1])
    f.rect(x - (1 if not shade else 0), bottom, x + 3 + toe, bottom, GREY[2] if not shade else GREY[1])


def arm(f, x, top, length, shade, raised=False, forward=0):
    sleeve, cuff = (WHITE[1], WHITE[2]) if shade else (WHITE[3], WHITE[2])
    glove = GOLD[2] if shade else GOLD[3]
    if raised:
        f.rect(x, top - length + 3, x + 2, top + 1, sleeve)
        f.rect(x, top - length + 3, x, top + 1, WHITE[2] if not shade else WHITE[0])
        f.rect(x, top - length, x + 2, top - length + 2, glove)
        f.put(x + 1, top - length, GOLD[4] if not shade else GOLD[3])
    else:
        for i in range(length - 3):
            ox = x + (forward * i) // max(1, length)
            f.rect(ox, top + i, ox + 2, top + i, sleeve)
            if not shade:
                f.put(ox - 1, top + i, WHITE[1])
                f.put(ox + 2, top + i, WHITE[4])
        end = x + forward
        f.rect(end, top + length - 4, end + 2, top + length - 4, cuff)
        f.rect(end, top + length - 3, end + 2, top + length - 1, glove)
        f.put(end + 2, top + length - 3, GOLD[4] if not shade else GOLD[2])


def coat(f, y, flare=0):
    """The lab coat from the shoulders to the knees: lit from the front left, the back in shade, open at the hem."""
    top, hem = 19 + y, 38 + y
    for row in range(top, hem + 1):
        spread = 0 if row < 30 + y else (row - 30 - y + 1) // 3 + flare
        x0, x1 = 10 - spread, 21 + (spread + 1) // 2
        for x in range(x0, x1 + 1):
            tone = 3
            if x <= x0 + 1:
                tone = 1
            elif x <= x0 + 3:
                tone = 2
            elif x >= x1:
                tone = 2
            elif x == x1 - 1 and row > top + 1:
                tone = 4
            f.put(x, row, WHITE[tone])
    # collar and lapels over a purple turtleneck
    f.rect(15, top, 18, top, PURPLE[2])
    f.rect(16, top + 1, 17, top + 3, PURPLE[1])
    f.put(15, top + 1, WHITE[4]); f.put(18, top + 1, WHITE[4])
    f.put(15, top + 2, WHITE[2]); f.put(18, top + 2, WHITE[2])
    # the front edge, buttons, a breast pocket with pens, a belt line and a green splash near the hem
    f.rect(19, top + 3, 19, hem - 2, WHITE[2])
    for by in (top + 6, top + 10, top + 14):
        f.put(19, by, GREY[2])
    f.rect(13, top + 5, 15, top + 7, WHITE[2])
    f.put(13, top + 4, RED[3]); f.put(14, top + 4, BLUE[3]); f.put(15, top + 3, GOLD[3])
    f.rect(11, top + 11, 18, top + 11, WHITE[2])
    for sx, sy, c in ((14, hem - 4, CHEM[3]), (15, hem - 4, CHEM[4]), (15, hem - 3, CHEM[3]), (13, hem - 3, CHEM[2]),
                      (16, hem - 5, CHEM[3]), (12, hem - 6, CHEM[3])):
        f.put(sx, sy, c)
    # the open hem shows the trousers between the coat's front panels
    f.rect(20, hem - 5 if flare else hem - 3, 20, hem, NIGHT[2])


def head(f, y):
    # neck, face and ear
    f.rect(15, 17 + y, 18, 18 + y, SKIN[2])
    f.rect(13, 8 + y, 21, 17 + y, SKIN[3])
    f.rect(13, 8 + y, 14, 17 + y, SKIN[2])
    f.rect(20, 9 + y, 21, 11 + y, SKIN[4])
    f.rect(15, 12 + y, 15, 14 + y, SKIN[1])  # ear
    f.put(16, 13 + y, SKIN[2])
    # a big nose, an eye under a bushy brow, a lopsided grin
    f.rect(22, 13 + y, 22, 14 + y, SKIN[3])
    f.put(22, 15 + y, SKIN[2])
    f.put(19, 13 + y, WHITE[4]); f.put(20, 13 + y, INK[0])
    f.rect(18, 11 + y, 21, 11 + y, GREY[3])
    f.put(21, 10 + y, GREY[4])
    f.rect(18, 16 + y, 20, 16 + y, SKIN[1])
    f.put(21, 15 + y, SKIN[1])
    # wild white hair: a mane down the back of the head, a crown, and tufts sticking out every way
    for hx in range(10, 14):
        for hy in range(7, 16):
            if (hx, hy) not in ((10, 7), (10, 15), (13, 15)):
                f.put(hx, hy + y, GREY[2] if hx == 10 or hy > 13 else GREY[3])
    for hx in range(12, 22):
        for hy in range(5, 8):
            if hy == 5 and hx in (12, 21):
                continue
            f.put(hx, hy + y, GREY[4] if hy == 5 or (hy == 6 and hx % 3) else GREY[3])
    for hx, hy, tone in ((11, 4, 4), (12, 3, 4), (12, 4, 3), (14, 2, 4), (14, 3, 4), (15, 4, 4), (17, 1, 4), (17, 2, 4),
                         (17, 3, 4), (18, 4, 4), (20, 3, 4), (20, 4, 3), (21, 4, 4), (22, 5, 4), (23, 6, 3), (22, 7, 3),
                         (9, 8, 3), (8, 9, 3), (9, 10, 2), (8, 12, 2), (9, 13, 2), (9, 14, 2), (11, 16, 2), (12, 16, 2)):
        f.put(hx, hy + y, GREY[tone])
    # brass goggles pushed up on the forehead, on a dark strap
    f.rect(13, 9 + y, 21, 9 + y, INK[2])
    for gx in (16, 20):
        f.rect(gx - 1, 8 + y, gx + 1, 10 + y, GOLD[2])
        f.put(gx, 9 + y, CHEM[4] if gx == 20 else SKY[3])
        f.put(gx - 1, 8 + y, GOLD[4])


def figure(step=0, bob=0, jump=False, climb=None):
    f = Frame()
    y = bob
    if climb is not None:
        arm(f, 10, 21 + y, 10, True, raised=climb == 0)
    elif jump:
        arm(f, 10, 21 + y, 10, True, raised=True)
    else:
        arm(f, 11, 21 + y, 13, True, forward=-step)
    if jump:
        leg(f, 12, 36 + y, 44 + y, True, 1)
    elif climb is not None:
        leg(f, 12, 36 + y, 47 - 2 * climb, True, 2)
    else:
        leg(f, 13 - step, 36 + y, 47, True, 2)
    if jump:
        leg(f, 16, 36 + y, 43 + y, False, 2)
    elif climb is not None:
        leg(f, 16, 36 + y, 45 + 2 * climb, False, 2)
    else:
        leg(f, 16 + step, 36 + y, 47, False, 2)
    coat(f, y, flare=2 if jump else 1 if abs(step) >= 2 else 0)
    head(f, y)
    if climb is not None:
        arm(f, 20, 21 + y, 10, False, raised=climb == 1)
    elif jump:
        arm(f, 20, 21 + y, 10, False, raised=True)
    else:
        arm(f, 18, 21 + y, 13, False, forward=step)
    return f.outline()


def main():
    poses = [
        dict(),
        dict(step=3), dict(step=0, bob=-1), dict(step=-3), dict(step=0, bob=-1),
        dict(jump=True),
        dict(climb=0), dict(climb=1),
    ]
    sheet = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    for i, pose in enumerate(poses):
        sheet.paste(figure(**pose), (i * W, 0))
    path = Path(__file__).resolve().parent.parent / "godot" / "art" / "player.png"
    sheet.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
