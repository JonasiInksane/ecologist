# The base: building room by room

The campaign starts with almost nothing: one bare room standing on the floor of a giant factory hall. The hall is
only the backdrop. Everything else the player builds: more rooms beside it, rooms stacked on top, and rooms dug down
into the earth, then furniture, tanks, pumps and pipes inside them. The simulation underneath is the same one as
before (liquids, heat, chemistry, pumps and pipes, building cells), so a reaction line built inside a room behaves
like it always has.

## Rooms on a grid (`godot/core/rooms.gd`)

- A slot is 24 cells wide and 12 tall: a 2-cell steel wall on its left, a 2-cell steel slab on top and a 22 × 10
  cell room inside (176 × 80 pixels). The floor is the slab of the room below, or the ground's concrete cap.
- Level 0 stands on the ground line (row 48). Levels above stack on rooms below them; levels below are dug into the
  earth and get a steel floor.
- A new room must join the base: beside a room on its level, on top of a room, or (underground) beside or under one.
  The first room goes anywhere.
- Neighbours side by side get a doorway (the bottom 6 rows of the shared wall). Neighbours above and below get a
  two-tile hatch with a ladder from the lower floor into the room above.
- Kinds: Workshop (plaster), Lab (steel), Grow room (white tile), Cellar (concrete). Underground rooms cost 60
  credits more to dig. The kind sets the wall for now; what each kind is good for comes later.

## In the game (`godot/main.gd`)

- **R** toggles room mode: free slots light up with their price, green if you can afford it. **1-4** pick the kind;
  click to build.
- **F** toggles furnishing: **,** and **.** pick a piece, click in a room to place it (floor pieces stand on the
  floor, lamps hang from the ceiling), right-click takes one back for half its price. Furniture is decoration for
  now (`godot/furniture.gd`); tanks, vats and pumps become working equipment next.
- Inside rooms the existing build bar still lays cells, pipes, valves and pumps.
- The old plot (the bay with its kitchen, the van, the town) is kept behind `legacy_plot` for the tests of those
  systems.

## Art

All of it is generated with PixelLab and kept in `art-source/pixellab/rooms/`; `tools/make-room-art.py` packs it:
the factory hall, the earth texture the ground cells sample, the four room walls the shader samples, the steel slab
and post drawn over the room frame, and 19 pieces of furniture with their prices in `data/furniture.json`. A Steam
release must declare AI-generated content.

## Next

- Make the tanks, vats, pumps and still real equipment that holds and moves liquid, joined by the generated pipes.
- Grow rooms that grow plants under grow lights.
- Better-tiling plaster and concrete walls, the generated ladder and door in the room frame, and the big pieces
  redrawn at their exact sizes.
