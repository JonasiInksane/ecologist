#!/usr/bin/env python3
"""Packs the PixelLab room art (art-source/pixellab/rooms/ and rooms2/) into the game's sheets (docs/design/rooms.md).

art/rooms/walls.png      the four room walls (plaster, steel, tile, concrete) as 64 x 64 tiles side by side, then
                         the earth texture (128 x 128) and the floor slab (64 x 16) and room post (16 x 80); the
                         world shader and main.gd read them at these offsets
art/rooms/hall.png       the factory hall behind the base
art/rooms/furniture.png  every piece of furniture (rooms2/props), packed in a row; data/furniture.json says where
                         each one is and how it stands (floor or ceiling)
art/rooms/vessels.png    the glass tanks and the vat (rooms2/props) in a row; data/equipment.json holds their regions
                         and the glass inside each, the bounding box of its mask
art/rooms/pipes.png      8 x 8 pipe pieces (rooms2/pipes): the 16 joins in mask order (bit 1 up, 2 right, 4 down,
                         8 left), then the open valve, the shut valve and the flange, then the 24 x 16 pump
The plaster and concrete walls show a faint seam where they repeat; a better-tiling pick is still to come.
Usage: python3 tools/make-room-art.py
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-source" / "pixellab" / "rooms"
SRC2 = ROOT / "art-source" / "pixellab" / "rooms2"
EQUIPMENT = ROOT / "godot" / "data" / "equipment.json"
OUT = ROOT / "godot" / "art" / "rooms"
DATA = ROOT / "godot" / "data" / "furniture.json"

WALLS = ["03-wall-plaster", "04-wall-steel", "05-wall-tile", "06-wall-concrete"]
MIRRORED = set()  # mirroring their quarter lost the stains; they are used as generated for now
# id, source (rooms2/props), name, how it stands, cost in credits, what it is for
FURNITURE = [
    ("desk", "desk", "Desk with computer", "floor", 60, "where orders and research are done"),
    ("chair", "chair", "Office chair", "floor", 10, ""),
    ("shelf", "shelf", "Shelf", "floor", 25, "storage"),
    ("workbench", "workbench", "Workbench", "floor", 70, "tools"),
    ("generator", "generator", "Generator", "floor", 220, "power for the base"),
    ("grow_rack", "grow-rack", "Grow rack", "floor", 90, "plants under grow lights"),
    ("hydro_tray", "hydro-tray", "Hydroponic tray", "floor", 40, "seedlings in water"),
    ("pot_sprout", "plant-sprout", "Potted sprout", "floor", 5, ""),
    ("pot_half", "plant-half", "Potted plant", "floor", 8, ""),
    ("pot_full", "plant-full", "Flowering plant", "floor", 12, ""),
    ("lamp", "lamp", "Ceiling lamp", "ceiling", 15, "light"),
    ("gauge", "gauge", "Pressure gauge", "floor", 10, ""),
    ("barrel", "barrel", "Barrel", "floor", 8, ""),
    ("barrel_stack", "barrel-stack", "Barrels", "floor", 15, ""),
    ("crate", "crate", "Crate", "floor", 6, ""),
    ("crate_stack", "crate-stack", "Crates", "floor", 15, ""),
    ("box", "box", "Box", "floor", 3, ""),
    ("still", "still", "Copper still", "floor", 180, "distils what is in it (decoration for now)"),
]
# The vessels are real equipment (native/core/equipment.cpp): id, source, name, cost, what it is for. Their sprites
# are exactly their footprints in cells.
VESSELS = [
    ("glass_tank", "tank-tall", "Glass tank · 200 L", "Tank", 150, "Closed. A port low on each side and two on top."),
    ("wide_tank", "tank-wide", "Wide glass tank · 400 L", "Wide tank", 220, "Closed. A port low on each side and two on top."),
    ("vat", "vat", "Open vat · 100 L", "Vat", 60, "Open on top, with a drain low on each side."),
]
PIPES = [f"pipe-{m & 1}{m >> 1 & 1}{m >> 2 & 1}{m >> 3 & 1}" for m in range(16)] + ["pipe-valve-open", "pipe-valve-closed", "pipe-flange"]


def seamless(img):
    q = img.crop((0, 0, img.width // 2, img.height // 2))
    out = Image.new("RGBA", img.size)
    out.paste(q, (0, 0))
    out.paste(ImageOps.mirror(q), (img.width // 2, 0))
    out.paste(ImageOps.flip(q), (0, img.height // 2))
    out.paste(ImageOps.flip(ImageOps.mirror(q)), (img.width // 2, img.height // 2))
    return out


def save(img, path):
    # leave a sheet alone when its pixels are unchanged, so a Pillow upgrade doesn't churn the PNGs
    if path.exists():
        old = Image.open(path).convert("RGBA")
        if old.size == img.size and ImageChops.difference(old, img.convert("RGBA")).getbbox() is None:
            return
    img.save(path)


def load(name):
    return Image.open(SRC / f"{name}.png").convert("RGBA")


def prop(name):
    return Image.open(SRC2 / "props" / f"{name}.png").convert("RGBA")


def vessels():
    sheet = Image.new("RGBA", (sum(prop(src).width + 2 for _, src, *_ in VESSELS) + 32, 56), (0, 0, 0, 0))
    data = json.loads(EQUIPMENT.read_text())
    items = [i for i in data["items"] if i["id"] not in {v[0] for v in VESSELS}]
    x = 0
    for vid, src, name, short, cost, note in VESSELS:
        img = prop(src)
        sheet.paste(img, (x, 0))
        mask = prop(f"{src}-mask")
        box = mask.getchannel("R").point(lambda v: 255 if v > 127 else 0).getbbox()
        items.append({"id": vid, "name": name, "short": short, "cost": cost, "salvage": 0.5, "furnish": True,
                      "sheet": "res://art/rooms/vessels.png", "sprite": [x, 0, img.width, img.height],
                      "inside": [box[0], box[1], box[2] - box[0], box[3] - box[1]], "back": "1a222c", "note": note})
        if src == "vat":
            # the vat's cavity is drawn dark, so its liquid is painted over the sprite through the opening's shape
            surface = Image.new("RGBA", mask.size, (0, 0, 0, 0))
            surface.paste((255, 255, 255, 255), (0, 0), mask.getchannel("R").point(lambda v: 255 if v > 127 else 0))
            surface = surface.crop(box)
            sheet.paste(surface, (x + img.width + 2, 0))
            items[-1]["surface"] = [x + img.width + 2, 0, surface.width, surface.height]
            x += surface.width + 2
        x += img.width + 2
    save(sheet, OUT / "vessels.png")
    # the file keeps its hand layout: one item per line
    lines = []
    for key, value in data.items():
        if key == "items":
            value = items
        if isinstance(value, list) and value and isinstance(value[0], dict):
            rows = ",\n".join("    " + json.dumps(i, ensure_ascii=False) for i in value)
            lines.append(f'  {json.dumps(key)}: [\n{rows}\n  ]')
        else:
            lines.append(f"  {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}")
    EQUIPMENT.write_text("{\n" + ",\n".join(lines) + "\n}\n")
    return [(i["id"], i["name"], i["cost"], i["note"], i["sprite"]) for i in items if i.get("sheet")]


def pipes():
    sheet = Image.new("RGBA", (len(PIPES) * 8 + 24, 16), (0, 0, 0, 0))
    for i, name in enumerate(PIPES):
        sheet.paste(Image.open(SRC2 / "pipes" / f"{name}.png").convert("RGBA"), (i * 8, 0))
    sheet.paste(prop("pump"), (len(PIPES) * 8, 0))
    save(sheet, OUT / "pipes.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (384 + 16, 128), (0, 0, 0, 0))
    for i, name in enumerate(WALLS):
        tile = load(name).resize((64, 64), Image.NEAREST)
        atlas.paste(seamless(tile) if name in MIRRORED else tile, (i * 64, 0))
    atlas.paste(load("02-backdrop-earth").resize((128, 128), Image.NEAREST), (256, 0))
    atlas.paste(load("07-floor-slab"), (0, 64))
    atlas.paste(load("08-room-post"), (384, 0))
    save(atlas, OUT / "walls.png")
    save(load("01-backdrop-hall"), OUT / "hall.png")
    pieces, x, height = [], 0, 0
    images = []
    for fid, src, name, stand, cost, about in FURNITURE:
        img = prop(src)
        img = img.crop(img.getbbox())
        images.append((img, x))
        pieces.append({"id": fid, "name": name, "stand": stand, "cost": cost, "about": about,
                       "region": [x, 0, img.width, img.height]})
        x += img.width + 2
        height = max(height, img.height)
    sheet = Image.new("RGBA", (x, height), (0, 0, 0, 0))
    for img, at in images:
        sheet.paste(img, (at, 0))
    save(sheet, OUT / "furniture.png")
    for vid, name, cost, about, region in vessels():
        pieces.append({"id": vid, "name": name, "stand": "floor", "cost": cost, "about": about, "equipment": vid,
                       "region": region})
    pipes()
    DATA.write_text(json.dumps({"_comment": "Written by tools/make-room-art.py from the PixelLab room art: each piece's "
                                "region in art/rooms/furniture.png, whether it stands on the floor or hangs from the "
                                "ceiling, and its price. Pieces with \"equipment\" are placed as that equipment kind and drawn from "
                                "art/rooms/vessels.png.", "pieces": pieces}, indent=2) + "\n")
    print("wrote", OUT, DATA)


if __name__ == "__main__":
    main()
