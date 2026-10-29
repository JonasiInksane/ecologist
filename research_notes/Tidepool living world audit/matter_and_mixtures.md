# Tidepool matter and mixtures audit

Read 29 October 2026. Scope: every current liquid/gas ID was classified from the working-tree definitions; representative high-impact paths were inspected in detail. This is a code-and-reference audit, not an exhaustive experimental validation of every material pair. No game source was changed and no tests were run by this researcher. Code references below refer to the current working tree, including the unfinished Phase 22 patch.

## What do the current liquids and gases represent?

### Takeaway

The project has a useful shared physical-property table, but it combines pure substances, unspecified mixtures, suspensions, living matter, and fantasy materials under the same single-type tile model. A credible world first needs explicit identities and conserved inventories; adding more numerical property rows alone will not deliver that.

### Cited Findings

The complete inventory is defined at `js/config.js:17–24`, named at `js/liquids.js:28–63`, and physically described at `js/matter.js:40–54`. The following are **the game's declared identities**, not independently verified property specifications for every substance.

| ID | Current material | Identity and required clarification |
|---|---|---|
| 1 | Water | Real H₂O; also the carrier for most solutions. Its current concentration channels need quantitative species inventories. |
| 2 | Lava | Declared basalt melt, a composition-dependent mixture; crystallization range and gas content require a coarse composition model. |
| 3 | Honey | Natural sugar/water mixture, currently one substance plus a single generic dissolved sugar channel. |
| 4, 7 | Aether, frost | Explicit fantasy. Aether rises; frost maintains −40°C. Document the external energy or magic accounting for such behavior. |
| 5 | Quicksilver | Mercury. Its vapor currently becomes generic toxic fumes, losing mercury identity. |
| 6 | Acid | Declared sulfuric acid, but shares generic acidity and salts with other acids. Choose actual acid species/concentrations. |
| 8 | Steam | H₂O vapor; the new patch also uses this type for ethanol-rich vapor. Composition must remain explicit. |
| 9 | Oil | Declared crude petroleum, but also participates in soap-making as though it were a triglyceride oil. Split identities. |
| 10, 11, 13 | Slime, bloomwater, tonic | Explicit fantasy; slime is also treated as living/rotting material. Define whether ordinary biomass budgets apply. |
| 12 | Mud | Declared clay slurry, but fed by sand and multiple sediment shortcuts. Separate mineral particle composition and water. |
| 14 | Foam | Declared soapy froth; also represents churned oil/water. Gas fraction, water, oil and surfactant should be separate components. |
| 15 | Stormwater | Explicit fantasy charged water; define energy storage/use independently from ordinary conductive brine. |
| 16 | Molten metal | Table says molten iron; heat code describes carbon-rich cast iron, while solid METAL is steel. Composition changes are currently implicit. |
| 17 | Smoke | Currently a gas species; should be an atmospheric mixture plus suspended particles, with deposition/escape rather than automatic deletion. |
| 18 | Methane | Real CH₄; oxidation must consume oxygen and account for carbon and hydrogen products. |
| 19 | Toxic fumes | Ambiguously combines sulfur dioxide and mercury vapor. These require different identities, fate and reactions. |
| 20 | Nitro | Declared nitroglycerin. Keep only abstract game behavior for energetic materials; this audit proposes no real-world preparation recipes. |
| 21 | Lye | Declared 50% sodium hydroxide solution. Represent solvent and NaOH quantitatively. |
| 22 | Carbon dioxide | Real CO₂, present both as concentrated gas tiles and ambient CO₂; these stores need one conversion rule. |
| 23, 24, 27 | Void ink, mimic, liquid light | Explicit fantasy. Void destroys matter and mimic changes identity; require named exceptions and an explicit magic ledger. |
| 25 | Coolant | Declared glycol coolant, with deliberately exaggerated conductivity. Specify glycol identity and water fraction or label the enhanced coolant fantasy. |
| 26 | Ferrofluid | Magnetite suspended in oil; carrier and particle fraction matter. |
| 28 | Fertiliser | Table says urea/ammonium-nitrate solution; dissolved fertiliser stands for nitrate. These are different chemical/biological inputs. |
| 29, 30 | Hydrogen, oxygen | Real H₂ and O₂; need mole-based reaction accounting and shared gas transport. |
| 31 | Molten slag | Unspecified oxide mixture; choose a small declared composition suitable for the selected ore process. |
| 32 | Chlorine | Real Cl₂; currently fades away in sealed space. |
| 33 | Bleach | Declared 5% sodium hypochlorite solution. Composition, aqueous chemistry and decomposition need explicit products. |
| 34 | Oily water | Oil/water emulsion; currently a fixed density despite a stored variable oil share. |

Reference anchors for the core physics:

- NIST lists water's normal boiling point near **373.17 K** and provides vapor-pressure fits; a constant 100°C rule is an atmospheric-pressure approximation, not a rule for arbitrary pressure. [NIST water](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4)
- NIST lists ethanol's normal boiling point near **351.5 K (78.35°C)** and vaporization enthalpy **38.56 kJ/mol at 351.5 K**. Vaporization must have an energy cost. [NIST ethanol](https://webbook.nist.gov/cgi/cbook.cgi?ID=C64175&Mask=4)
- IAPWS provides a thermodynamic formulation relating water temperature, density, enthalpy and phase equilibrium. Its role here should be generating reference tables, not running a full scientific equation-of-state solver for every game tile. [IAPWS-95](https://iapws.org/technical-guidance/release/IAPWS-95)
- Saponification acts on triglyceride esters and produces glycerol and fatty-acid salts; the current petroleum identity does not support the implemented generic oil-to-soap rule. [University of Washington chemistry](https://chem.washington.edu/lecture-demos/saponification)

### Inferences

Use real identities for ordinary materials, and explicitly mark fantasy definitions in data and UI. Separate petroleum oil from plant oil, sulfuric acid from acetic acid, and mercury vapor from sulfur dioxide before attaching more reactions. Preserve old IDs as migration aliases rather than silently changing old worlds' contents.

### Gaps

This pass does not independently certify every table density, heat capacity, viscosity, toxicity or ignition point. Several mixtures lack sufficient composition information for a unique real value. Their definitions must be resolved first. Biological toxicity also depends on exposure and chemical speciation, not a single universal kill threshold.

## Which current rules prevent physically consistent behavior?

### Takeaway

Several defects are objective accounting errors, not necessary artistic simplifications. Others are consciously compressed physics whose scope should be documented. The strongest confirmed code findings follow; they were established by reading callers and guards, not by executing new repro scenes.

### Cited Findings

**1. Diffusion does not conserve dissolved mass when neighboring cells contain different liquid amounts.** `js/solutes.js:206–212` subtracts and adds the same *concentration* increment; callers at `130–131` do not require equal liquid amounts. Under the project's documented amount formula, dissolved amount is concentration × liquid amount / 255. For a full tile containing concentration 100 and a 51/255-full tile containing concentration 0, a diffusion increment of 10 changes total solute from 100 to `90 + 10×51/255 = 92`: eight units disappear. Reversing the gradient can create solute. The same issue affects oxygen/nutrient budgets. `mixSol` at `31–37` additionally rounds every transfer into byte concentrations, so long-running transport needs a bounded rounding strategy.

**2. Dissolved oxygen changes merely because temperature changes, and surface replenishment does not spend headspace oxygen.** `oxygenIn` at `js/oxygen.js:39` returns saturation(T,salt) minus a stored deficit. Cooling thus increases the computed oxygen inventory without transfer. `surfaceOx` at `119–132` reduces the deficit without subtracting oxygen from `airOx`; sealed headspace can refill water without being depleted. `breatheWater` also applies concentration changes independently of the tile's liquid amount. Real DO saturation depends on temperature, pressure and salinity, but saturation is an equilibrium target, not the actual inventory. [USGS DOTABLES](https://water.usgs.gov/water-resources/software/DOTABLES/) provides equations and their valid ranges (0–40°C, 0.5–1.1 atm, salinity 0–40‰); do not extrapolate those fits to boiling water or concentrated industrial brines without another model.

**3. Hydrogen and methane can burn without an oxidizer.** The complete gas branch in `js/fire.js:87–113` only requires sufficient temperature and absence of dousing for ordinary hydrogen/methane combustion. The preceding oxygen-neighbor guard applies to the explosion branch only. `sim.js:141` invokes `fireTick()` without an oxygen guard. `draw` merely calls `breatheAir`; it does not require successful oxygen consumption. A hot, sealed, oxygen-free hydrogen tile can therefore turn into steam; methane can disappear and heat neighbors. These should be oxidizer-limited reactions. Stoichiometric reversal of water splitting gives the relevant hydrogen/water accounting. [DOE electrolysis](https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis)

**4. Latent energy is not transported with moving liquid.** `js/sim.js:46–50` transports temperature, velocity and solutes, but not `latent`. At `heat.js:60`, an emptied tile resets its latent energy to zero. Consequently a partially boiling/freezing parcel can leave its accumulated phase-change energy at the old position, and complete drainage deletes it. `heat.js:131–132` comments that this is absorbed without loss, but the empty-tile reset contradicts that claim. Treat phase and sensible energy as one transported enthalpy budget. [IAPWS-95](https://iapws.org/technical-guidance/release/IAPWS-95)

**5. The unfinished distillation path loses components and creates pure alcohol vapor without paying latent heat.** `js/heat.js:259–267` subtracts an ethanol concentration increment and separately removes carrier amount, while leaving all other concentrations unchanged. Example: amount 255, ethanol concentration 100, decrement 8 and vapor amount 8 yields residual ethanol `92×247/255` plus 8 in vapor, totaling about **97.11 instead of 100**. Any nonvolatile solute also loses its share of the removed carrier because its concentration is not adjusted. An empty vapor tile is assigned ethanol concentration 255. No energy is removed by `distil` itself. The current rule begins at a fixed 78°C and uses a linear dew point. Real ethanol/water boiling and vapor composition depend on mixture composition; ordinary distillation approaches an azeotrope around **95.6% ethanol by mass** rather than yielding pure ethanol from a dilute solution in one step. [Purdue University distillation principles](https://www.extension.purdue.edu/extmedia/AE/AE-117.html), [NIST ethanol](https://webbook.nist.gov/cgi/cbook.cgi?ID=C64175&Mask=4)

**6. Gas disappearance and chemical reactions lack closed inventories.** `js/gases.js:13–32` fades smoke, toxic fumes and chlorine anywhere, including sealed rooms; only CO₂/O₂ fade is transferred into another store. `js/chem.js:101–109` silently declines gas output if there is no room, while `apply` at `136–142` already spends inputs and transforms the solid. Products can vanish in a packed vessel. Reaction execution should first reserve output space/storage, or retain products as dissolved/pressurized components. Open-world escape is a valid boundary sink when recorded separately.

**7. pH and chemical identity are inconsistent.** `js/solutes.js:200–204` computes aqueous pH linearly from acid/base bytes. EPA defines pH by hydrogen-ion activity and distinguishes alkalinity from pH; dissolved carbonate buffering and acid identity matter. [EPA pH](https://www.epa.gov/caddis/ph). `matter.js:43` calls ACID sulfuric acid; `reactions.js:57–59` neutralizes it with sodium hydroxide into the same salt channel used for NaCl. Sulfate cannot become chloride without a chlorine source. `solutes.js:88` also puts vinegar into this generic acidity channel. The objective fix is species accounting; the selection of which acids to expose as tools is a design choice.

**8. Electrolysis uses probability and equal tile amounts in place of mole/energy accounting.** `js/power.js:137–152` chooses hydrogen vs oxygen probabilistically at 2:1 and converts equal water/gas tile amounts. It does not debit a quantitative electrical energy budget. The expected ratio is qualitatively appropriate for molecule counts, but one shared amount is not simultaneously water volume, gas volume and mass. DOE describes electrodes, an electrolyte, electrical energy input and the net stoichiometry **2 H₂O → 2 H₂ + O₂**. [DOE electrolysis](https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis). Retain a coarse electrolyzer device, but account in moles and energy.

**Documented compression versus defects:** `js/matter.js:6–12,58–80` deliberately square-roots thermal conductivity, inflates gas heat capacity and quarters latent heats. These are gameplay choices, not accidental missing data. Their effect must be described accurately: they change physical ratios, not just time. Steam preserves water-equivalent tile amount at `heat.js:176`, while its density table is gas-like; define whether amounts mean mass or occupied volume before claiming global mass conservation. `fillMatter` at `heat.js:58` also assigns full-block capacity regardless of a partial solid's `held` amount. The property table is a start, not yet a complete consistent equation of state.

### Inferences

Existing passing scenes can establish regressions in familiar outcomes while failing to catch inventory leaks or missing limiting reagents. Add conservation tests alongside scenario tests. Use deterministic remainder accumulation or higher-precision inventories rather than stochastic creation/destruction of tiny quantities.

### Gaps

No new runtime reproductions were executed in this pass, and the parent is running the full existing suite. Detailed pressure coupling, all buoyancy cases, electromagnetic force laws, and every liquid pair remain unvalidated. No claim is made that every current gas has complete real combustion/decomposition chemistry.

## What practical foundation would support the living world?

### Takeaway

A coarse chemical simulator is sufficient: conserve selected species and heat, derive visible behavior from them, and explicitly account for boundaries and magic. A molecular simulation is unnecessary. Separate objective repairs from choices about pacing, detail and available materials.

### Cited Findings

The current architecture uses dense typed arrays, staggered subsystems and explicit save registries (`js/world.js:15–45`, `js/sim.js:135–154`, `js/snapshot.js:14–28`). It can accommodate quantitative component inventories without changing the renderer into a scientific solver. Nineteen Float32 channels over 512×128 cells occupy about **4.75 MiB**, versus **1.19 MiB** for byte channels; this is an arithmetic storage estimate, not a performance benchmark. Physical target tables can be precomputed from the sources above. Gas-to-water exchange should approach the USGS saturation target by transferring an equal amount from one reservoir to the other. [USGS DOTABLES](https://water.usgs.gov/water-resources/software/DOTABLES/)

### Inferences

Proposed order:

1. **Objective correctness repairs:** add conserved-component/energy diagnostics; fix unequal-volume diffusion, latent-energy transport, oxygen-free combustion, closed-headspace oxygen transfer, packed-reaction product loss and distillation component loss. Use tiny isolated tests with exact input/output totals. Do not retune biology until these foundations are measurable.
2. **Identity/data design for approval:** define substances with formula or declared mixture, molar mass, density(T), heat capacity(T), conductivity(T), phase data, miscibility, solubility and reference conditions. Keep gameplay time multipliers in a separate configuration. Split petroleum/plant oil and important acid species. Choose a small practical initial species set rather than adding every ion at once.
3. **Aqueous mixtures:** store solvent mass plus species amounts, derive concentrations for reactions and display, and compute an approximate mixture density. Retain nonvolatile material during evaporation/freezing and deposit only the material that precipitates. Start with charge-balanced acid/base equivalents and carbonate buffering if a full equilibrium solver is too costly; label the approximation.
4. **Gas inventory:** one consistent atmospheric inventory for O₂, N₂/background gas, CO₂, H₂O vapor and active trace gases. Visible dense clouds are a rendering of composition, not an unrelated second reservoir. A simple ideal-gas approximation and documented pressure range can precede more expensive compressible flow. Smoke particles remain separate from gas chemistry.
5. **Reaction accounting:** declarative reactants/products, limiting reagent, finite extent and energy change. Compute first, reserve output, then commit. Distinguish catalysts and rate controls from consumed material. Electrolysis draws electrical energy; combustion releases chemical energy; condensed phases carry enthalpy when moving.
6. **Fantasy design for approval:** each fantasy material has ordinary physical properties plus named exceptions. Frost may draw from a finite magical cooling store or an explicit infinite external source; void may transfer matter to a magic sink; mimic may transform through a recorded magic reaction. The choice is artistic, but exceptions must be visible to balance checks.
7. **Migration and performance:** version saves, convert old concentration bytes to quantities using the saved liquid amount and temperature, assign documented legacy identities, and preserve old code loading. Benchmark representative calm, storm, burning and crowded-world scenes after each stage; do not promise the historical 5 ms target without measurement.

Acceptance checks for this foundation:

- Closed containers retain each selected element/species across diffusion, pumps, pipes and save/load, including partial tiles and repeated tiny transfers.
- A sealed water/headspace pair exchanges oxygen conservatively; cooling changes equilibrium capacity without instantly creating dissolved oxygen.
- Zero oxidizer means no ordinary hydrogen/methane combustion; limited oxygen caps fuel consumption and products exactly.
- Partially boiling material can be moved/drained without losing enthalpy. Phase cycles consume/release the appropriate latent energy under the chosen scale.
- Ethanol/water phase changes conserve ethanol, water and every nonvolatile solute; vapor is composition-dependent and evaporation cools the source.
- Packed reactions retain products or stop; gases leave only through recorded boundaries or specified reactions.
- Identical acid equivalents dilute logarithmically in the chosen model; neutralization keeps counterions and cannot create absent elements.
- Fantasy exceptions are separately measurable so ordinary-world budgets still close.

### Gaps

The user should approve the coarse model, permitted physical compression, material naming splits and magic budgets before implementation. These notes specify objective defects and a feasible direction, not a final list of every new material or an approved rewrite. Interaction feel, visual clarity and long-run simulation stability require subsequent playtesting and measured scenarios.
