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
  floor, lamps hang from the ceiling), right-click takes one back for half its price. Furniture is decoration
  (`godot/furniture.gd`); the vessels below are real equipment.
- Inside rooms the existing build bar still lays cells, pipes, valves and pumps.

## Vessels

The glass tank (200 L, 4 × 7 cells), the wide glass tank (400 L, 6 × 5) and the open vat (100 L, 5 × 3) are
equipment kinds in the native core (`native/core/equipment.cpp`), so they hold liquid with its heat and solutes
exactly like the drum and the kettle. The tanks are closed, with a port low on each side and two on top; the vat
is open, with a drain low on each side. They are bought in furnish mode (marked `"equipment"` in
`data/furniture.json`, `"furnish": true` in `data/equipment.json`, so they stay off the kitchen kit bar): `main._furnish`
stands one on the room's floor through `world.equipment_place`, on the even cell grid, and right-click takes an
empty one back for half its price. Clicking one outside furnish mode opens the kitchen panel, to add water and read
it.

The tanks' glass is transparent in the sprite, so the liquid, drawn behind the sprite at its fill level and colour
over a dark glass back, shows through it and passes behind the frame posts. The vat's cavity is drawn dark, so its
liquid is painted over the sprite in the opening's shape (`surface` in `data/equipment.json`). Sea water is tinted
green-blue by its salt.

## Pipes and pumps

In the base the pipes, valves, filters and pump ends are drawn from `art/rooms/pipes.png` (`main._draw_fitting`):
each cell takes the piece that joins its four neighbours (pipes, valves, filters, pump ends and equipment ports), a
flange where it meets a port, the open or shut valve (turned upright in a vertical run), and the pump sprite over
its inlet, centred on the inlet and outlet when they are side by side. The sandbox keeps its old drawing. A pump
outlet still pours into the open cell beside it, where the pipe end picks the liquid up, so a little pool shows
there; a port right beside the outlet takes the liquid directly.
- The old plot (the bay with its kitchen, the van, the town) is kept behind `legacy_plot` for the tests of those
  systems.

## Art

All of it is generated with PixelLab. `art-source/pixellab/rooms/` holds the factory hall, the earth texture the
ground cells sample, the four room walls the shader samples and the steel slab and post drawn over the room frame.
`art-source/pixellab/rooms2/` holds the props redrawn to match the concept art (made with `create_image_pro` using
crops of the concept as style references, snapped to the game palette; its README has the details): 18 pieces of
furniture, the two glass tanks and the vat with their liquid masks, the pump, and the 8 × 8 pipe set drawn in
palette steel and copper. `tools/make-room-art.py` packs them into `art/rooms/walls.png`, `hall.png`,
`furniture.png`, `vessels.png` and `pipes.png` (the 16 joins in mask order, bit 1 up, 2 right, 4 down, 8 left, then
the open valve, the shut valve, the flange and the pump), and writes `data/furniture.json` and the vessels' entries
in `data/equipment.json`. A Steam release must declare AI-generated content.

## Next

- Make the still real equipment; a pump sprite that can turn, and pumps that push straight into pipes.
- Grow rooms that grow plants under grow lights.
- Better-tiling plaster and concrete walls, the generated ladder and door in the room frame, and the big pieces
  redrawn at their exact sizes.
