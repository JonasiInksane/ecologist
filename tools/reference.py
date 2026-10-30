#!/usr/bin/env python3
"""The dusk workshop reference (docs/design/art-reference-workshop.png) at the game's pixel scale, and a cutter that
lifts props out of it (docs/design/art.md).

The reference is a 1672 x 941 painting whose art pixels are about 2.6 screen pixels: brought down to 640 x 360 it
matches the game's grid (people 42 px tall, rooms 80 px, tiles 16 px). native() makes that 640 x 360 picture, taking
the median of the source pixels around each art pixel's centre so edges stay hard. cut() lifts one object out of it:
it flood-fills the background from the box's edges (and any extra seeds) across neighbouring pixels within a
tolerance, so the fill stops at the object's dark outline, then applies hand-placed erase and keep rectangles.
Usage: python3 tools/reference.py   (writes the native picture to docs/design/art-reference-native.png)
"""
from collections import deque
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


def _lab(a):
    a = a.astype(np.float64) / 255.0
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    l = np.cbrt(a @ np.array([0.4122214708, 0.5363325363, 0.0514459929]))
    m = np.cbrt(a @ np.array([0.2119034982, 0.6806995451, 0.1073969566]))
    s = np.cbrt(a @ np.array([0.0883024619, 0.2817188376, 0.6299787005]))
    return np.stack([0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                     1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                     0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s], -1)


def cut(box, tol=0.06, seeds=(), erase=(), keep=(), edges=True):
    """One object from the native picture as RGBA. box, seeds, erase and keep are in native pixels."""
    x0, y0, x1, y1 = box
    rgb = np.asarray(native())[y0:y1, x0:x1]
    lab = _lab(rgb)
    h, w = rgb.shape[:2]
    held = np.zeros((h, w), bool)
    for kx0, ky0, kx1, ky1 in keep:
        held[max(0, ky0 - y0):ky1 - y0, max(0, kx0 - x0):kx1 - x0] = True
    bg = np.zeros((h, w), bool)
    queue = deque()
    start = [(sx - x0, sy - y0) for sx, sy in seeds]
    if edges:
        start += [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    for x, y in start:
        if not held[y, x] and not bg[y, x]:
            bg[y, x] = True
            queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny, nx] and not held[ny, nx] \
                    and np.linalg.norm(lab[ny, nx] - lab[y, x]) < tol and lab[ny, nx][0] > 0.22:
                bg[ny, nx] = True
                queue.append((nx, ny))
    for ex0, ey0, ex1, ey1 in erase:
        bg[max(0, ey0 - y0):ey1 - y0, max(0, ex0 - x0):ex1 - x0] = True
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, alpha]), "RGBA")


def _islands(op, smallest):
    """The opaque mask without the pieces smaller than smallest pixels (stray specks of the wall's texture)."""
    h, w = op.shape
    seen = np.zeros_like(op)
    keep = np.zeros_like(op)
    for y in range(h):
        for x in range(w):
            if op[y, x] and not seen[y, x]:
                part, queue = [], deque([(x, y)])
                seen[y, x] = True
                while queue:
                    cx, cy = queue.popleft()
                    part.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and op[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((nx, ny))
                if len(part) >= smallest:
                    for cx, cy in part:
                        keep[cy, cx] = True
    return keep


def tidy(img, ink=(30, 21, 32), smallest=8):
    """Drops specks and pixels with fewer than two opaque neighbours, and darkens the light pixels on the cut edge
    toward ink, so a cut-out keeps a dark outline where the painting had a soft one."""
    a = np.asarray(img).copy()
    a[..., 3][~_islands(a[..., 3] > 0, smallest)] = 0
    op = a[..., 3] > 0
    h, w = op.shape
    pad = np.pad(op, 1)
    count = sum(pad[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx] for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)))
    a[..., 3][op & (count < 2)] = 0
    op = a[..., 3] > 0
    pad = np.pad(op, 1)
    edge = op & ~(pad[1:h + 1, 2:] & pad[1:h + 1, :w] & pad[2:, 1:w + 1] & pad[:h, 1:w + 1])
    rgb = a[..., :3].astype(np.float64)
    light = rgb @ np.array([0.3, 0.59, 0.11]) > 70
    for c in range(3):
        rgb[..., c] = np.where(edge & light, rgb[..., c] * 0.45 + ink[c] * 0.55, rgb[..., c])
    a[..., :3] = rgb.astype(np.uint8)
    return Image.fromarray(a, "RGBA").crop(Image.fromarray(a, "RGBA").getbbox())


def piece(box, **options):
    """cut() then tidy(): one prop ready for a sheet."""
    smallest = options.pop("smallest", 8)
    return tidy(cut(box, **options), smallest=smallest)


if __name__ == "__main__":
    out = ROOT / "docs" / "design" / "art-reference-native.png"
    native().save(out)
    print("wrote", out)
