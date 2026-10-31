# Art direction

The campaign should look like one painting: a cosy side-view cross-section of a workshop in a small town at dusk.
The master reference is the dusk workshop (`docs/design/art-reference-workshop.png`): a three-storey building cut
open, with a greenhouse, a kitchen, a copper still and steel tanks, a basement of mushroom racks and a sump, a van
unloading on the left and customers on the right. Warm amber rooms full of things against a cool blue-purple dusk,
heavy dark timbers, floorboards on slate slabs, dark earth with big soft stones. The earlier town references
(`art-reference-day.jpg` and `art-reference-dusk.jpg`) set the backdrop. The humour lives in the people and the
props; the world itself is played straight and pretty.

`docs/design/art-asset-manifest.json` catalogues everything in the workshop reference (273 asset families, 289
connector variants, render layers and eight build phases). Work follows its phases: a sample at play zoom first,
then the building shell, large objects, small contents, the town, the HUD, construction variants and motion.

## The reference at game scale

The reference's art pixels are about 2.6 of its pixels: brought down to 640 × 360 it matches the game's grid, with
people 42 px tall, rooms 80 px high and 16 px tiles. `tools/reference.py` makes that picture
(`art-reference-native.png`) to draw against and to compare screenshots with. Nothing in the game is taken from it:
cutting props out of it was tried and dropped, because the cut pieces came out soft and smudged next to drawn ones.
Every sprite is drawn by our scripts, at the reference's level of detail: three or four tones per material, a lit
edge and a shaded edge, wood with long grain and knots, glass that lets the wall show through, small stories on the
props (a shopping list on the fridge, chillies drying under the shelf).

Phase 1 (the shack sample) brought the world onto the reference:

- Darker earth with big soft stones, the deep ground as packed stony earth, a mossy grass band.
- Floorboards over a slate slab, heavy timber posts and a ceiling beam, brown roof shingles, framed windows with
  glazing bars.
- Rooms painted in the reference's lamplit amber (the `room` ramp), with brick courses faintly under the plaster,
  shaded toward the corners. The room light itself is nearly white, so the amber is the wall's own colour, as in the
  reference; the floor, the ceiling beam and the inner posts take the room's light too.
- Pendant lamps throw a cone of light downward in twelve smooth steps, and glow faintly by day.
- The kitchen: a cream fridge with a note and a child's drawing, an iron range with the fire behind its oven window, a
  copper saucepan, a sink cabinet and an oak table with long grain and bevels, ladder-back chairs, enamel pendant
  lamps, shelves of pans, preserves and glassware, a hanging ivy, botanical prints and the fuse box.
- The reference's HUD: coin and credits, five hearts and a frameless clock top left and right, dark navy hotbar
  slots with the keys underneath.

![The palette](art-palette.png)

## Rules

1. **One pixel grid.** One art pixel is one world unit; a cell is 8 × 8 pixels; people and the player are 32 × 48
   frames. Nothing is drawn at a different scale or smoothed.
2. **One palette.** Every colour comes from the ramps in `tools/palette.py` (159 colours in 30 ramps). Scripts draw
   with ramp names (`ramp("wood")[3]`) and pass the finished sheet through `snap()`, which moves any stray colour to
   the nearest palette colour. The world shader uses the same ramps from `godot/generated/campaign_palette.gdshaderinc`,
   which `tools/palette.py` writes. The interface keeps its own slate panels for now.
3. **Hue-shifted ramps.** Shadows lean purple and blue, highlights lean yellow. Never pure black or white: the
   darkest ink is `#120d14`.
4. **Light from the top left.** Highlights on the top and left edges, shade on the bottom and right.
5. **Outlines.** Sprites and props get a one-pixel outline in ink (`ink[1]`) where they meet the air; foliage is
   outlined in its darkest green. Tiles are outlined only where they meet the air (soil `soil[0]`, rock `rock[0]`,
   timber `wood[0]`), with the corners rounded off.
6. **Distance is haze.** The backdrop's layers are blended toward the horizon colour: far 42 %, mid 18 %, near 6 %.
   Only the foreground is fully saturated.
7. **Light is warm, dark is blue.** By day everything is lit white; at night the outdoors goes blue while rooms keep
   their own amber under a nearly white room light, and lamps throw warm cones (`lighting.gd`). Windows in the town light up through dusk.

## How the picture is built

| Layer | Drawn by | Notes |
|---|---|---|
| Sky, sun, moon, stars, clouds | `godot/backdrop.gd` | sky colours by hour: night, dawn, day, dusk; the sun crosses east to west |
| Town in three layers | `tools/make-backdrop.py` → `art/backdrop/` | forest ridges and the church (far), houses and trees (mid), big trees and hedge (near); parallax 0.12, 0.3, 0.55; window lights as separate sheets |
| Cells | `godot/liquid.gdshader` (`styled`) | grass band with hanging blades, soil darker with depth with pebbles and roots, cobbled rock, asphalt with a curb, timber posts and plank floors over slate, brick, shingle roofs, steel, framed windows; amber plaster back walls with timber framing (equipment stands in front of them and doesn't frame them); open sky left clear |
| Props | `tools/make-decor-sprites.py` → `art/decor.png`, placed by `data/decor.json`, drawn by `godot/decor.gd` | outside: fence, street lamp, plant, sacks, mailbox, for-sale sign, bush, tree, cat; in the shack: chalkboard, fridge, pendant lamps, pan and jar shelves, stove pipe, hanging ivy, glassware, table plant, kettle, prints, fuse box, chairs |
| Machines, people, the player | `make-equipment-sprites.py`, `make-people-sprites.py`, `make-player-sprites.py` | snapped to the palette |
| Light | `godot/lighting.gd`, `lighting.gdshaderinc`, `sprite_light.gdshader` | outdoor and room light, up to 16 lamps in twelve smooth steps, pendant lamps as downward cones; flames give their own light |

Roof tiles (block 82, "Roof" on the hotbar) are laid in courses of four pixels. A roof tile with open air above it
and on one side, standing on a tile that reaches further out, has its top corner cut on the diagonal, so a roof
built to step in one cell a row reads as a 45° slope. The plaster back wall (kind 3, "Plaster") draws a timber post
every eight cells, a beam under a solid ceiling and a skirting board over a solid floor, with the plaster shaded
where it meets them. The shack starts with both.

A prop shows only while what holds it up is there: ground under it, a wall behind it, or a ceiling over it. Dig out
the ground under the fence and that panel goes. A lamp prop adds a light from dusk to dawn and a halo.

The camera frames the player a little low (`FRAME_LIFT` in `main.gd`), so the ground sits in the lower third and the
town fills the sky, as in the references.

## The player

The mad scientist: a shock of white hair, brass goggles pushed up on the forehead, a lab coat with pens in the pocket
and a green chemical splash at the hem, yellow rubber gloves, dark trousers and heavy boots.

## Next

Following the manifest's phases:

- The mad scientist and the townspeople in the reference's character style (bigger heads, softer three-tone shading).
- The town behind the plot as dark silhouettes with lit windows, closer to the reference's dusk street.
- The process kit stays open: vessels are drawn cut away so the simulation paints what's inside them, and the player
  joins them with pipes and pumps to build their own reaction line. The reference's still and tanks set the style
  (copper, riveted steel, sight glasses), not closed boxes to copy.
- Other large objects drawn in the reference's manner: the delivery van, crates, the blue water tank, mushroom racks.
- Pipes in the reference's copper and blue, wall-mounted, with their joints and valves.
- The remaining interface panels moved onto the reference's navy and steel.
