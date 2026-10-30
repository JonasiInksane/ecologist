# Native fire, air and flow pass

Ports the browser's fire, explosions, gases, air oxygen, pressure, momentum and erosion to the C++ core
(`native/core/combustion.cpp`, `native/core/flow_systems.cpp`). The browser files remain the reference:
`js/fire.js`, `js/blast.js`, `js/gases.js`, `js/oxygen.js` (air half), `js/pressure.js`, `js/momentum.js`
and `js/erosion.js`. Constants, thresholds and cadences are copied from them.

## What runs, and when

`Sandbox::step` follows the browser's order in `js/sim.js`:

| Tick | System |
| --- | --- |
| every | momentum (after the liquid pass), machines, pumps, pipes (odd), heat (even), fire |
| `tick % 4 == 0` | pressure (when on) |
| `tick % 4 == 1` | erosion, then the air's oxygen and water-surface gas exchange |
| `tick % 4 == 2` | gases, materials |
| `tick % 4 == 3` | reactions |

## Model

- **Air.** `air_ox` (tenths of a percent) and `air_carb` (hundredths) per cell, starting at 21% and 0.04%.
  Air open to the sky is reset to the atmosphere and the difference is recorded; other air mixes 45% of
  each neighbour difference per pass in recently changed chunks (50% upward when the lower cell is 20°
  hotter). Water surfaces exchange O₂ and CO₂ with the air above them by the browser's saturation table.
- **Fire.** Blocks ignite above their ignition temperature when they touch air with at least 15% oxygen
  (or oxygen gas), burn for their burn time while exposed, and go out when doused from above/beside or
  smothered. Each burning tick draws 2 units of oxygen from each neighbouring air cell and returns 10× as
  CO₂ units. Burnt wood, charcoal and leaves sometimes leave ash. Oil burns one unit per tick while exposed.
  Spirit (water with enough ethanol, or poured ethanol, which first becomes that mixture) burns 3 O₂ : 2 CO₂.
  Methane and hydrogen burn into steam by `2 H₂ + O₂` and `CH₄ + 2 O₂`, reserving oxygen and CO₂ room first.
- **Explosions.** Nitro above 218°, landing after six rows of fall, or touching live power; frozen nitro
  above 218°; lit methane/hydrogen touching oxygen (or chlorine for hydrogen). Radius 2–6 by amount.
  Soft blocks break (pore water is released into the cell, not deleted), heat rises by up to 700°,
  liquid is pushed one cell outward and the core fills with smoke. `shake` drives the Godot camera.
- **Gases.** Smoke, methane and hydrogen at the open top escape; smoke, poison and chlorine thin out under
  open sky; CO₂ and O₂ gas join neighbouring air. Neighbouring different gases trade places 30% of the time.
- **Pressure, momentum, erosion.** Direct ports. Erosion keeps bank pore water and retains heat across
  material changes by returning the energy difference to the largest-capacity cell, as in the browser.

`Sandbox::budget` records combustion oxygen/carbon, burnt fuels, reaction water, gas escape and fading,
blast inputs, eroded/slumped blocks and the atmosphere boundary.

## Differences from the browser

- No ecology yet: organic blocks always use the browser's fallback air draw, and mud does not rot into
  methane. Particles, sound and floating bodies (blast impulses on crates or the explorer) are not ported.
- The browser leaves `BURN_TIME[LEAF] = 30` inside a comment, so its leaves catch but never burn. The
  native port gives leaves the intended 30-tick burn.
- Magnets do not yet hold ferrofluid against pressure; drains pull liquid but draw no whirlpool.

## Verification (2026-10-30)

- `ecologist-sandbox-tests`: 128 checks, 0 failures, including 24 new checks for ignition, sealed-room
  smothering with exact O₂/CO₂ trade, explosions (methane/oxygen, dropped nitro, frozen nitro), hydrogen
  stoichiometry, dousing, burning oil on water, U-bend pressure, dam-break momentum, erosion of wet soil with
  conserved water and heat, smoke escape and lossless CO₂ release.
- Transport parity unchanged: 32/32 differential cases match the JavaScript pass byte for byte.
- Native chemistry: 28 checks pass. Godot 4.5 headless integration: 82 checks pass (5 new).
- Demo world, 3000 ticks: water plus pore water conserved exactly. Sandbox step on the demo world with
  ~90 cells burning averages under 1 ms per tick (Linux x86-64, -O2).
