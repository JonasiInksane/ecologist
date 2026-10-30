#!/usr/bin/env python3
"""The Ecologist palette: every sprite, tile and backdrop colour comes from these ramps (docs/design/art.md).

Ramps run dark to light and shift hue as they go: shadows lean purple and blue, highlights lean yellow, the way the
reference paintings do. Sprite scripts import the ramps by name; snap() moves any image onto the palette so older
art and hand edits stay in it. Run it directly to write the swatch sheet docs/design/art-palette.png.
Usage: python3 tools/palette.py
"""
from pathlib import Path


def hex_color(text):
    return tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))


RAMPS = {
    # outlines and the deepest shadows: a warm near-black, never pure black
    "ink": ["#120d14", "#1e1520", "#2b1f26"],
    # wood, from beams in shadow to sunlit planks: the reference's warm orange timber
    "wood": ["#22120c", "#3f1f12", "#63321a", "#8c4a20", "#b5622a", "#d27d38", "#e9a35a"],
    # a room's plaster as the reference paints it, in lamplight: amber, darker toward the corners
    "room": ["#4a2210", "#7e4423", "#a8612f", "#c77c3c", "#db9148", "#eaa560", "#f4bd7c"],
    # soil, darker with depth
    "soil": ["#1a110e", "#271913", "#38241a", "#4c3122", "#62402b", "#7a5236"],
    # roots and dry stems in the soil
    "root": ["#6b3a1c", "#a35a28", "#cf8442"],
    # pebbles and rubble stone: warm grey with a pink cast
    "rock": ["#2e2a30", "#463f45", "#615659", "#7f7071", "#a08d89", "#c2b0a6"],
    # cut stone, pavers and concrete: cooler grey
    "concrete": ["#34333b", "#4c4b55", "#6a6a74", "#8e8e96", "#b6b5b8", "#d8d6d2"],
    # asphalt
    "asphalt": ["#1f1e24", "#2c2b32", "#3a3941", "#4b4a52"],
    # grass and leaves, blue-green shadows to yellow-green tips
    "leaf": ["#14241c", "#1f3a26", "#2e5530", "#43723a", "#5f8f3e", "#86ad45", "#b5cc5c", "#dde488"],
    # far foliage, cooler and greyer
    "pine": ["#1b2b32", "#27403f", "#355648", "#4a6d52"],
    # weathered roof shingles (the dusk workshop reference)
    "shingle": ["#24120e", "#3a1d14", "#54301f", "#6e4329", "#8a5a38"],
    # roof tiles and terracotta
    "terracotta": ["#4a1d17", "#7a2f1e", "#a8462a", "#cc6a3a", "#e89a5c"],
    # brick
    "brick": ["#3d1a19", "#62291f", "#8c3c2a", "#b2573a", "#cf7c56"],
    # plaster and cream walls
    "plaster": ["#8a7262", "#ad937c", "#cbb196", "#e3cdae", "#f4e3c6", "#fff4de"],
    # skin
    "skin": ["#4a261d", "#7a432e", "#a8664a", "#cf916a", "#ecb98f", "#fad9b8"],
    # lab coat and other whites, shaded cool
    "white": ["#6e6f80", "#9a9cab", "#c4c6cf", "#e4e4e6", "#f8f6f0"],
    # hair greys
    "grey": ["#3a3640", "#5c5864", "#8a8690", "#b8b4bc", "#e2dfe4"],
    # day sky and water
    "sky": ["#2f5a9a", "#3f78c4", "#5c98dc", "#7fb6ec", "#a8d0f4", "#d2e8f8"],
    # dusk and night sky
    "night": ["#0b0c18", "#121530", "#1a2048", "#242c66", "#3a3478", "#5a3c7a"],
    # sunset glow
    "dusk": ["#8a3e6a", "#c2546a", "#e2744f", "#f29a4a", "#f8c260"],
    # lamplight and lit windows
    "glow": ["#c26a1e", "#f0a238", "#ffcc5c", "#ffe9a0", "#fff8dc"],
    # blue paint and pipes
    "blue": ["#1b2450", "#25357a", "#3456a8", "#4f7ccc", "#7ea6e2"],
    # copper pipes and kettles
    "copper": ["#4a2414", "#7a3c1e", "#b05a2a", "#d8823e", "#f0ac6a"],
    # steel tanks
    "steel": ["#3a3f4a", "#5a606c", "#7e8692", "#a8b0b8", "#d0d6da"],
    # reds
    "red": ["#3e0f16", "#6e1c24", "#a42c32", "#d24a42", "#ec7a62"],
    # mad science: bubbling chemical greens
    "chem": ["#123a30", "#1d5e42", "#2e8a52", "#4fbc5e", "#8ef07e", "#d6ffb0"],
    # purples: dusk shadows, the vampire's cape, lavender
    "purple": ["#24142e", "#3b2148", "#56306a", "#7a4a8e", "#a874b8"],
    # yellows and gold
    "gold": ["#5a3a10", "#8f6018", "#c48f22", "#e8bf3c", "#f8e278"],
    # teal: scrubs, enamel, old paint
    "teal": ["#123238", "#1d4d52", "#2a6e6e", "#3f9690", "#6cc0b0"],
    # pinks: hair dye, flowers, the dusk's edge
    "pink": ["#5a1a3a", "#8e2a5a", "#c44a84", "#ec7ab0", "#f8b0d0"],
}

COLORS = [hex_color(c) for ramp in RAMPS.values() for c in ramp]


def ramp(name):
    return [hex_color(c) for c in RAMPS[name]]


def _lab(rgb):
    def linear(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (linear(c) for c in rgb)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


_LABS = [_lab(c) for c in COLORS]
_cache = {}


def nearest(rgb):
    if rgb not in _cache:
        lab = _lab(rgb)
        best = min(range(len(COLORS)), key=lambda i: sum((a - b) ** 2 for a, b in zip(lab, _LABS[i])))
        _cache[rgb] = COLORS[best]
    return _cache[rgb]


def snap(img):
    """Moves every opaque pixel of an RGBA image onto the palette, in place; semi-transparent pixels keep their alpha."""
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = nearest((r, g, b)) + (a,)
    return img


def write_shader_include():
    """godot/generated/campaign_palette.gdshaderinc: the ramps as constant arrays for the world shader."""
    lines = ["// Generated by tools/palette.py from its RAMPS; do not edit.", ""]
    for name, colors in RAMPS.items():
        values = ", ".join("vec3(%.4f, %.4f, %.4f)" % tuple(c / 255.0 for c in hex_color(h)) for h in colors)
        lines.append("const vec3 PAL_%s[%d] = vec3[%d](%s);" % (name.upper(), len(colors), len(colors), values))
    path = Path(__file__).resolve().parent.parent / "godot" / "generated" / "campaign_palette.gdshaderinc"
    path.write_text("\n".join(lines) + "\n")
    print("wrote", path)


def main():
    from PIL import Image, ImageDraw
    write_shader_include()
    width = max(len(r) for r in RAMPS.values())
    sheet = Image.new("RGB", (width * 16 + 96, len(RAMPS) * 16), hex_color("#120d14"))
    draw = ImageDraw.Draw(sheet)
    for row, (name, colors) in enumerate(RAMPS.items()):
        draw.text((2, row * 16 + 3), name, fill=(230, 226, 220))
        for i, c in enumerate(colors):
            draw.rectangle((96 + i * 16, row * 16, 96 + i * 16 + 15, row * 16 + 15), fill=hex_color(c))
    path = Path(__file__).resolve().parent.parent / "docs" / "design" / "art-palette.png"
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(path)
    print("wrote", path, len(COLORS), "colours")


if __name__ == "__main__":
    main()
