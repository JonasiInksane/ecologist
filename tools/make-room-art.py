#!/usr/bin/env python3
"""Packs the PixelLab room art (art-source/pixellab/rooms/) into the game's sheets (docs/design/rooms.md).

art/rooms/walls.png      the four room walls (plaster, steel, tile, concrete) as 64 x 64 tiles side by side, then
                         the earth texture (128 x 128) and the floor slab (64 x 16) and room post (16 x 80); the
                         world shader and main.gd read them at these offsets
art/rooms/hall.png       the factory hall behind the base
art/rooms/furniture.png  every piece of furniture, packed in a row; data/furniture.json says where each one is
                         and how it stands (floor or ceiling)
The plaster and concrete walls show a faint seam where they repeat; a better-tiling pick is still to come.
Usage: python3 tools/make-room-art.py
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-source" / "pixellab" / "rooms"
OUT = ROOT / "godot" / "art" / "rooms"
DATA = ROOT / "godot" / "data" / "furniture.json"

WALLS = ["03-wall-plaster", "04-wall-steel", "05-wall-tile", "06-wall-concrete"]
MIRRORED = set()  # mirroring their quarter lost the stains; they are used as generated for now
# id, source, name, how it stands, cost in credits, what it is for
FURNITURE = [
    ("desk", "09-desk-computer", "Desk with computer", "floor", 60, "where orders and research are done"),
    ("lab_bench", "10-lab-bench", "Lab bench", "floor", 80, "glassware for small reactions"),
    ("chair", "11-office-chair", "Office chair", "floor", 10, ""),
    ("shelf", "12-shelf", "Shelf", "floor", 25, "storage"),
    ("tank", "13-tank", "Liquid tank", "floor", 150, "holds liquids for a reaction line"),
    ("vat", "14-vat", "Open vat", "floor", 60, "an open vessel to mix in"),
    ("pump_unit", "15-pump", "Pump", "floor", 40, "moves liquid through pipes"),
    ("still", "17-still", "Copper still", "floor", 180, "distils what is in it"),
    ("generator", "18-generator", "Generator", "floor", 220, "power for the base"),
    ("grow_rack", "19-grow-rack", "Grow rack", "floor", 90, "plants under grow lights"),
    ("hydro_tray", "20-hydro-tray", "Hydroponic tray", "floor", 40, "seedlings in water"),
    ("pot_sprout", "21-pot-sprout", "Potted sprout", "floor", 5, ""),
    ("pot_half", "21-pot-half", "Potted plant", "floor", 8, ""),
    ("pot_full", "21-pot-full", "Flowering plant", "floor", 12, ""),
    ("lamp", "22-ceiling-lamp", "Ceiling lamp", "ceiling", 15, "light"),
    ("door", "24-steel-door", "Steel door", "floor", 50, ""),
    ("crate", "25-crate", "Crate", "floor", 6, ""),
    ("barrel", "26-barrel", "Barrel", "floor", 8, ""),
    ("workbench", "27-workbench", "Workbench", "floor", 70, "tools"),
]


def seamless(img):
    q = img.crop((0, 0, img.width // 2, img.height // 2))
    out = Image.new("RGBA", img.size)
    out.paste(q, (0, 0))
    out.paste(ImageOps.mirror(q), (img.width // 2, 0))
    out.paste(ImageOps.flip(q), (0, img.height // 2))
    out.paste(ImageOps.flip(ImageOps.mirror(q)), (img.width // 2, img.height // 2))
    return out


def load(name):
    return Image.open(SRC / f"{name}.png").convert("RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (384 + 16, 128), (0, 0, 0, 0))
    for i, name in enumerate(WALLS):
        tile = load(name).resize((64, 64), Image.NEAREST)
        atlas.paste(seamless(tile) if name in MIRRORED else tile, (i * 64, 0))
    atlas.paste(load("02-backdrop-earth").resize((128, 128), Image.NEAREST), (256, 0))
    atlas.paste(load("07-floor-slab"), (0, 64))
    atlas.paste(load("08-room-post"), (384, 0))
    atlas.save(OUT / "walls.png")
    load("01-backdrop-hall").save(OUT / "hall.png")
    pieces, x, height = [], 0, 0
    images = []
    for fid, src, name, stand, cost, about in FURNITURE:
        img = load(src)
        img = img.crop(img.getbbox())
        images.append((img, x))
        pieces.append({"id": fid, "name": name, "stand": stand, "cost": cost, "about": about,
                       "region": [x, 0, img.width, img.height]})
        x += img.width + 2
        height = max(height, img.height)
    sheet = Image.new("RGBA", (x, height), (0, 0, 0, 0))
    for img, at in images:
        sheet.paste(img, (at, 0))
    sheet.save(OUT / "furniture.png")
    DATA.write_text(json.dumps({"_comment": "Written by tools/make-room-art.py from the PixelLab room art: each piece's "
                                "region in art/rooms/furniture.png, whether it stands on the floor or hangs from the "
                                "ceiling, and its price.", "pieces": pieces}, indent=2) + "\n")
    print("wrote", OUT, DATA)


if __name__ == "__main__":
    main()
