#!/usr/bin/env python3
"""The dusk workshop reference (docs/design/art-reference-workshop.png) at the game's pixel scale, to draw against
and to compare the game with (docs/design/art.md). Nothing in the game is taken from it.

The reference is a 1672 x 941 painting whose art pixels are about 2.6 screen pixels: brought down to 640 x 360 it
matches the game's grid (people 42 px tall, rooms 80 px, tiles 16 px). native() makes that 640 x 360 picture, taking
the median of the source pixels around each art pixel's centre so edges stay hard.
Usage: python3 tools/reference.py   (writes the native picture to docs/design/art-reference-native.png)
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "design" / "art-reference-workshop.png"
WIDTH, HEIGHT = 640, 360
_native = None


def native():
    global _native
    if _native is None:
        src = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.int32)
        sy, sx = src.shape[0] / HEIGHT, src.shape[1] / WIDTH
        cy = (np.arange(HEIGHT) + 0.5) * sy
        cx = (np.arange(WIDTH) + 0.5) * sx
        samples = []
        for dy in (-0.7, 0.0, 0.7):
            for dx in (-0.7, 0.0, 0.7):
                ys = np.clip((cy + dy).astype(int), 0, src.shape[0] - 1)
                xs = np.clip((cx + dx).astype(int), 0, src.shape[1] - 1)
                samples.append(src[ys][:, xs])
        _native = Image.fromarray(np.median(np.stack(samples), axis=0).astype(np.uint8), "RGB")
    return _native


if __name__ == "__main__":
    out = ROOT / "docs" / "design" / "art-reference-native.png"
    native().save(out)
    print("wrote", out)
