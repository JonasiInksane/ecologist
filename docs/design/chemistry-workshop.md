# Chemistry workshop — five-sequence prototype

The user approved all five sequences on 2026-10-30. This is the first playable
implementation across them; it does not claim to simulate every chemical or to
finish the browser-to-native migration.

## Player goal and rules

1. Pour individual sand, sucrose and sodium chloride grains, watch them pile up,
   and dissolve soluble grains in water. Each grain occupies one display pixel
   (eight subdivisions per existing liquid-cell axis), with its own collision.
2. Explore concentration, temperature, dissolution, crystallization and solvent
   removal. A workshop vessel provides weighed ingredients, limiting-reagent
   chemistry and recoverable products. Mixing and chemical reaction are distinct.
3. Pour ethanol, vinegar, blood and blood plasma. Blood separation in the workshop
   produces plasma and a cell fraction; these are mixtures, not pure chemicals.
4. Buy feedstock, run timed machines, package sugar, and sell intermediates or
   finished goods. Jobs reserve their inputs and account for output and waste.
   Machines can repeat while supplies and operating funds last.
5. Opt into a fictional underground operation with a cocaine commodity, abstract
   suspicion, scheduled inspections, confiscation, fines and temporary closure.
   This route uses explicitly fictional feedstock and no real synthesis recipe,
   operating conditions or practical police-evasion guidance.

## Prototype assumptions

- Sandbox and business inventories are deliberately separate. Unlimited brush
  material cannot be sold. Workshop batches have a finite, persisted ledger.
  The workshop is an equipment panel in this first slice, not placed machinery.
- Native liquids keep their established 8-pixel cell grid. Fine grains are a
  second simulation layer; sediment is porous to the coarser liquid simulation.
- Sandbox quantities use existing carrier units. Workshop amounts use grams;
  no unvalidated conversion between the two economies is provided.
- Sand stays sand in water. Sugar and salt have distinct grain colors and
  dissolved channels. Native solubility curves and phase timing are marked
  gameplay approximations; no claim of laboratory accuracy.
- Blood's approximately 55% plasma fraction is a **volume** observation. The
  workshop uses a declared 55/45 mass split as a gameplay approximation, not a
  scientific conversion. Plasma's internal composition is descriptive for now.
- Prices, seed money, equipment costs, times and enforcement rules are invented
  game balancing defaults in `godot/data/workshop.json`.
- One workshop vessel, a finite selection of independently tradable materials,
  and a small catalog of machines establish the loop. No human medical use.

## Architecture

- `native/core/grains.*`: fine collision, quantities, dissolution, grain temperature.
- `native/core/chemistry.cpp`: native water phase/concentration integration and precipitation. Existing
  `World::step()` remains the isolated, byte-exact reference transport pass.
- `godot/core/workshop.gd`: pure data/state functions, fixed-step jobs, inventory,
  stoichiometry, temperature, market, enforcement and validated save/load.
- `godot/data/`: shared authored substance, recipe and balancing definitions.
- `godot/workshop_panel.gd`, `godot/main.gd`: player controls and presentation.

## Acceptance checks

- Real single-pixel grains settle against walls and each other; no tunneling;
  sugar/salt mass survives dissolution, mixing and crystallization.
- Water transport remains reference-compatible; evaporation retains ingredients,
  cannot discard a blocked residue, and stops without energy or a vapor outlet.
- Reaction consumes only the limiting amount, conserves mass within numerical
  tolerance, retains excess inputs, and exposes all products.
- Purchases, jobs and sales cannot duplicate stock or create negative balances;
  insufficient inputs/funds reject atomically; repeat jobs stop when exhausted.
- Blood separation and sugar processing conserve modeled mass. Packaging needs
  packaging stock. Pure ingredients and intermediate products can be sold alone.
- Illegal content is opt-in, uses fictional production, and inspections impose
  deterministic game consequences. Legal play does not require illegal jobs.
- Save/load validates before replacing state and resumes queued jobs correctly.
- Unknown mixtures can be stored without relabeling or destroying components, and
  returned to the vessel later. This prevents the only vessel becoming unusable.
- Run native reference tests, native chemistry/grain checks, Godot workshop and
  scene integration checks, and hidden-window screenshots/visual comparisons.

## Scientific references and limits

- The existing browser's `solutes.js`, `matter.js` and accounting tests define
  concentration × carrier / 255 and the game's compressed heat model.
- [American Red Cross: blood components](https://www.redcrossblood.org/donate-blood/how-to-donate/types-of-blood-donations/blood-components.html)
  describes whole blood and its roughly 55% plasma volume fraction.
- [NCI SEER: introduction to blood](https://training.seer.cancer.gov/hematopoietic1/intro-to-blood.html)
  describes separation of plasma and cellular components by centrifugation.
- [American Red Cross: plasma](https://www.redcrossblood.org/donate-blood/dlp/plasma-information.html)
  describes plasma as mostly water with proteins and other dissolved components.
- [American Chemical Society: controlling reaction products](https://www.acs.org/middleschoolchemistry/lessonplans/chapter6/lesson2.html)
  supports the modeled acetic acid + sodium bicarbonate reaction and its sodium
  acetate, water and carbon dioxide products. The workshop uses limiting amounts;
  reaction kinetics, pH, dissociation and reaction enthalpy remain unmodeled.

## Principal tunables

| Setting | Authored location | Default | Meaning |
| --- | --- | --- | --- |
| Grain collision subdivision | `native/core/grains.hpp` | 8 per axis | One display pixel per independent grain |
| Maximum grains | same | 150,000 | Bounded prototype workload |
| Grain quantity | same | 255 / 64 carrier units | Fractional accounting per full grain |
| Dissolution rate | same | 0.5 units/tick | Maximum ingredient transfer per grain |
| Chemistry cadence | `native/core/chemistry.cpp` | 4 ticks | Diffusion, precipitation, water phase updates |
| Starting cash | `godot/data/workshop.json` | 500 credits | First workshop endowment |
| Vessel capacity | same | 2,000 g | Maximum mixture mass |
| Process durations | same | 4–45 seconds | Accelerated game production time |
| Inspection interval | same | 180 seconds | Fictional scenario inspection clock |
| Fine / closure | same | 80 credits / 30 seconds | Initial consequences, capped by available cash |

## Playtest

- Select sand, sugar or salt and pour over a platform and water; compare piling
  with dissolution. Use the heat/cool brushes and inspect the footer quantities.
- Open Workshop → Machines. Buy the filter press and auto-repeat two batches;
  continue through concentration, crystallization, packaging and sale.
- Mix 100 g vinegar and 20 g sodium bicarbonate in the vessel; react and verify
  collected gas, retained products and excess ingredient. Try storing an unusual
  mixture and loading it again, then save/load a running machine batch.
- Enable the optional underground scenario, run its fictional batch, and let a
  scheduled inspection occur. Legal production should remain usable during closure.

## Verification recorded on 2026-10-30

- 32 byte-exact browser/native transport comparisons passed.
- 28 native grain/chemistry checks passed, including fractional residues, blocked
  outlets, last-carrier drying and ingredient/phase-energy conservation.
- 92 workshop checks passed: compositions, reactions, production, trade, storage,
  save continuation and fictional enforcement.
- 33 Godot integration checks passed, including actual file replacement/load.
- The GPU/HTML liquid comparison passed at both animation times (over 99.95% of
  liquid pixels within three color levels). All four populated workshop screens
  rendered without script/shader errors.
- The 100,000-grain physics-only sample averaged roughly 1.4–2.8 ms/tick across
  local runs. The 2,369-grain rendered sample reported 47–60 fps. These are short
  development measurements, not a million-particle/full-game performance claim.
- Independent code review findings were fixed and rechecked. Human play-feel and
  economy balance still need the user's playtest.

Not in this slice: complete aqueous equilibria, biological activity/coagulation,
full heat transport, all browser reactions, character play, factory building,
logistics networks, or realistic law enforcement. These remain explicit roadmap
items rather than being represented as completed by this prototype.
