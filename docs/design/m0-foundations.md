# M0 Foundations: player, building, saves and the Mac build

M0 is the first milestone of the game plan ("Ecologist: game design plan", side-view cross-section, 16 px tiles).
It adds what every later milestone stands on: a character who walks around the simulated world, a campaign
build mode that costs money, whole-world saves and a macOS build.

## Campaign and sandbox

The game opens in **campaign** mode on a starting plot: a 512 × 128 world with ground at row 100, gentle land to
the west, a basalt road to the east (where delivery trucks will park in M2) and a one-room wooden shack with a
window, a wooden floor, a wood background wall and a door. **Tab** swaps to the free **sandbox** world with the
full paint and machine palette, and back; the two are separate `EcologistWorld` instances, so neither loses its
state. Credits are the workshop ledger's cash, shared by both.

Campaign controls: **A D** (or arrows) walk, **Space** jumps, **W S** climb ladders, **E** opens or closes the
nearest door, **left click** builds the selected tile, **right click** removes one, **1–0** select a build item,
**P** pauses, **F5** saves and **F9** loads. Movement uses physical key positions, so AZERTY keyboards work too.

## Player (`native/core/player.cpp`)

The player is a 20 × 42 px box (2.5 × 5.25 cells) in display pixels, stepped once per tick after the simulation
(`step_game`). Movement is resolved one pixel at a time so nothing tunnels:

- run 3 px/tick with ground acceleration 0.35 and air control 0.2; gravity 0.4 px/tick², falls capped at 10;
- jump 7 px/tick (about 61 px, under two tiles); walking steps up one tile (16 px) without jumping;
- ladders (background flag) hold the player while **W/S** is pressed, Space jumps off;
- in liquid (half the body in non-gas liquid) the player swims: slow fall, Space/W to rise, half speed.

Hazards come from the simulation itself: standing in flames, hot cells above 60 °C, falls faster than
9 px/tick, and air. Breath drains under liquid, in dense non-oxygen gas, or when the head cell's oxygen is below
12 % or its CO₂ above 5 %; the player also breathes the air model's oxygen (about 0.25 L of O₂ a minute), so a
sealed basement slowly goes stale. At zero health the player respawns at home. There are no food or sleep needs.

## Building layer (`native/core/building.cpp`)

`Sandbox::back` holds one byte per cell: background wall (bits 0–3: 1 wood, 2 brick), open door (0x20) and
ladder (0x40). None of these block liquid or gas. `Sandbox::build(x, y, code)` works on 2 × 2 cell tiles:

| Code | Effect |
| --- | --- |
| negative block id | a plain block (wood, brick, stone, glass, steel, copper, clay, sand, dirt, basalt, wool, porous, limestone) into empty cells only, so building never deletes liquid |
| 1001 / 1002 | wood / brick background wall |
| 1003 | ladder on non-solid cells |
| 1004 | a door, 2 × 6 cells standing on the clicked tile (block 80; burns like wood) |
| 1000 | remove: solid first (machines and pumps stay; soaked blocks release their water), then ladder, then wall |

`toggle_door` opens every connected door cell (they become empty, marked 0x20) or closes them again; closing is
refused while liquid stands in the doorway, and the adapter refuses it while the player stands there. The
adapter also refuses a solid tile that would overlap the player.

Costs live in `godot/data/build_costs.json` (credits per tile; a door is one item). Removing refunds the item's
`salvage` share, 50 % for built materials and nothing for natural dirt and stone so digging is not income.
Building is limited to 12 tiles from the player.

## World saves (`native/core/save.cpp`)

`save_world` writes the whole simulation: the cell world (every array, tick and RNG), grains, every sandbox
system (machines, pumps, pore water, air, fire, pressure state, budgets, the building layer) and the player.
The format is `ECOSAVE1`, a 32-bit version (1), then length-prefixed little-endian arrays. Loading reads into
fresh objects and checks the array sizes before replacing the running world, so a damaged file changes nothing.
The game saves to `user://world-v1.ecosave` (atomically, through a `.tmp` file) together with the workshop save.
A test steps a saved and a loaded world side by side and requires identical liquids, solids, temperatures,
solutes, air, fire, grains and player position.

## macOS build

`tools/native.sh setup | build | test | run` mirrors `tools/native.ps1`. Setup downloads the pinned Godot 4.7.2
macOS universal build (SHA-256 checked against the official SHA-512 list) and godot-cpp into `.tools/`, and
installs CMake/Ninja with pip unless they are already on the PATH. It needs the Xcode command line tools.
`run-ecologist.command` is the double-click launcher.

## Art

`godot/art/player.png` is drawn by `tools/make-player-sprites.py`: eight 32 × 48 frames (idle, four walking,
jump, two climbing). Since the art pass it is the mad scientist, in the palette of `docs/design/art.md`, which
also covers the walls, ladders and doors that `godot/liquid.gdshader` draws.

## Not in M0

Multi-floor plots and buying land (M3), equipment benches (M1), deliveries (M2), staff (M7) and the tutorial.
