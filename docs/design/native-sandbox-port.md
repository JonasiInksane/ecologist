# Native sandbox materials and machines

Approved direction: restore the original HTML sandbox before expanding the new
business layer. This pass ports its physical materials, contact reactions and
placeable machines. The browser source defines names, IDs, palettes, heat data,
reaction rules and machine rates. The separate workshop remains available.

## Player goal

Paint the original materials, build containers and machines, connect switches,
move real liquid through pumps/pipes, and observe heat and material reactions in
the world. Menu entries must connect to working simulation behavior.

## Implementation

- Export the browser catalog, terrain/device palettes, heat tables and block
  reaction rules. Preserve the 1–79 block and 1–34 liquid IDs.
- Add pure C++ physical-system state around the existing isolated transport pass:
  partial blocks, pore reservoirs, machine buffers, wiring, pipe flow and heat.
- Port liquid contact behavior separately from the byte-exact transport fixture.
- Expose searchable categories, place/configure clicks, pump endpoint placement,
  visible wires, machine status and actual pipe flow.
- Preserve quantity, components and heat in machine transfers; refuse placement
  over occupied cells. Creative erase remains an intentional deletion operation.
- Keep the existing fine-grain layer and its conservative sugar/salt chemistry.
  Extend supported powders and add their heat/contact interactions explicitly.

## Assumptions and limits

The browser is the behavior specification, including its clearly labeled fantasy
materials and simplified reaction conversions. Transport conservation does not
imply that old reaction shortcuts are scientifically exact. Atmosphere, living
ecology, characters/rigid bodies, complete lighting, world generation and browser
save import are subsequent ports. Static organic blocks can be placed but are
not a substitute for their future living ecosystems. Solar/wind generator inputs
use visible native environment settings until native weather is available.

## Acceptance

- All original liquids are selectable; terrain IDs retain distinct appearances.
- Pumps retain blocked output, ingredients, temperature and latent heat.
- Pipes use connected endpoints; valves and filters actually control flow.
- Levers, timers, sensors and logic drive gates/machines through visible links.
- Gates wait when displaced liquid cannot fit; closing never deletes it.
- Springs/drains expose external source/sink totals; separators retain fractional
  salt and non-salt ingredients; boilers heat adjacent real liquid.
- Heat crosses materials according to source properties; freeze/thaw retains
  carrier/solutes; pore storage releases what it absorbed.
- Selected real/fantasy liquid contacts and exported block reactions have direct
  native scenarios. Fine-grain transformations use grain quantities.
- Run original 32 transport comparisons, native physical-system regressions,
  existing chemistry/workshop checks, scene interaction and GPU comparisons.

Tuning stays in the browser tables and the native exported catalog where possible.
Any native-only approximation is listed explicitly with the completed validation.

## Implemented pass and remaining parity

The palette has 128 choices (39 liquids, original terrain/devices, powders, ink/solute brushes,
pump/wire and editing tools). All 48 expanded block rules are generated from `js/chem.js`.
Browser palettes, heat data, device rates and ink mixtures are generated at build time.
The native adapter integrates physical state without altering the isolated transport kernel.

Machine transfers preserve carrier, ingredients and represented sensible/latent heat. Creative
painting/erase intentionally creates/deletes contents. Springs and vents are explicit sources;
drains are explicit sinks. Separators retain sub-grain salt. Snow melting keeps fractional water
until it can enter the integer liquid grid. Corroded wet matrices release their stored solution,
or retain it until an outlet opens. Gates wait on water, ice or fine grains.

Fine powders use explicit quantity-scaled approximations for caramelization, snow melting,
soda decomposition, quicklime hydration, acid/ash fizzing and glass flux. They do not yet share
every rule with coarse blocks. Electrolysis retains the final ingredient-carrying water unit and
reserves gas space before consumption; gas units follow the original game convention, not molar
volume. Boiler heat and other legacy reaction heat remain prescribed game inputs. This pass is
not a scientific stoichiometric or energy audit of the browser reaction set.

Still absent: combustion/fire/explosions and finite air, complete solute/gas/ecological reactions,
erosion, momentum/pressure, full lighting, growing organisms, weather/world generation, physical
sandbox saves and integration with the finite workshop economy. These remain open roadmap items.

## Playtest

- Place two pump endpoints beside a pool and an empty vessel; block the outlet, then reopen it.
  The retained liquid should resume flowing. Erasing either endpoint removes the connected pair.
- Connect pipe ends between vessels, insert a valve, then wire a lever to it. Toggle the lever;
  flow should follow the valve. Choose a liquid before placing a filter to restrict that route.
- Heat a loaded sponge and watch its water return. Freeze water inside an open gate; the gate
  should wait until the ice melts and the liquid has room to move upward.
- Pour salt into water beside a separator; collected salt should appear as individual grains.
  Try the category/search controls and click a machine repeatedly to cycle its settings.

Human playtesting is still needed for machine readability, controls and game feel.

## Validation (2026-10-30)

- 333 checks passed: 32 original transport comparisons, 28 native grain/chemistry,
  104 sandbox material/machine, 92 workshop and 77 Godot integration checks.
- GPU/HTML comparison passed for 14 liquids at two times, with over 99.95% of liquid
  pixels within three channel levels of the reference.
- A hidden-window mixed-material scene was rendered and inspected, including glass,
  terrain, fine grains, pump output, pipe flow and visible valve wiring. Its 30-tick
  physics sample averaged 1.76 ms/tick; this is not a full-game frame-rate benchmark.
- Code review findings were fixed and covered by regressions. Manual feel testing remains open.

| Tunable | Source | Default | Unit |
| --- | --- | --- | --- |
| Pump intake | `js/pumps.js` | 48 | carrier units/tick |
| Pipe transfer ceiling | `js/pipes.js` | 96 | carrier units/pipe pass |
| Source output | `js/devices.js` | 40 | carrier units/tick |
| Boiler target | `js/devices.js` | 200 | game °C |
| Battery capacity | `js/devices.js` | 1200 | powered ticks |
| Fine grain amount | `native/core/grains.hpp` | 255/64 | carrier-equivalent units/pixel |
