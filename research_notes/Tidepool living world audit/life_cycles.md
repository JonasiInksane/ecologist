# Phase 22 life cycles and ecological realism

Research date: 29 October 2026. Project root: `C:/Users/jonas/Documents/tidepool 2/tidepool`. This is a source-code and scientific-design audit, not an implementation. Code references below are relative to that root and refer to the existing working tree. The coordinator is running the full simulation suite; no test result is asserted here.

## Where does Phase 22 actually stand?

### Takeaway

Phase 22 has a substantial behavioral prototype, plus an unfinished follow-up patch. It should not yet be described as a quantitatively closed living ecosystem. The implementation has recognizable life-cycle interactions, but several flows create, destroy, or indefinitely supply biological material without accounting for it.

### Cited Findings

| Area | Actual implementation and evidence | Completion assessment |
|---|---|---|
| Plants | Light and accessible water enable CO₂ fixation into a sugar store; growth spends sugar; respiration runs continuously (`js/plants.js:72–105`). | Implemented behavior; budgets and oxygen limitation incomplete. |
| Nutrient uptake | Current edits remove nitrate, or ammonium when nitrate is absent, from root water (`js/plants.js:52–54`). | Present in unfinished patch, but removal is not stored as plant nitrogen or required for all new growth. |
| Moss | Current edits add daytime CO₂ uptake and respiration (`js/materials.js:237–248`). The comment explicitly says there is no sugar store. | New behavior; no finite biomass or energy reserve. |
| Algae | Light-dependent O₂/CO₂ exchange, nutrient-accelerated growth, grazing, and decay (`js/solutes.js:181–197`). | Growth is separate from carbon fixation: algae can gain biomass without available CO₂; low background growth does not spend nitrate. Phosphate is absent. |
| Fish | Oxygen stress, ammonium threshold, feeding and breeding; current patch adds nearby mates and local crowding (`js/creatures.js:66–83,112–122`). | Small fish have hunger but no starvation death; only pike use a starvation condition. New offspring do not debit parental biomass. |
| Bees and honey | Bees remove nectar from flowers and deliver a fixed honey amount to comb (`js/creatures.js:233–265`). | Hive visits reset hunger without removing honey. Wax/comb production and offspring lack a material budget. |
| Decay and nitrogen | Some creature deaths add ammonium; nitrification consumes oxygen; low-oxygen nitrate disappears (`js/creatures.js:291–295`; `js/solutes.js:65–68`). | Incomplete closure: bird/moth/bee death branches return without the shared decay path; soil oxygen demand and mud methane lack finite organic stock. |
| Fermentation and vinegar | Yeast consumes sugar; low O₂ creates ethanol and CO₂; with O₂ ethanol becomes the generic acid channel (`js/solutes.js:75–88`). Current limit is 36/255, approximately 14% on the patch's declared scale. | Functional prototype, not a stoichiometric microbial model; vinegar has no acetic-acid identity or microbial population. |
| Alcohol processing | Current edits include distillation and spirit burning, with new scenario checks (`tools/simtest.mjs:2112–2125`). | Present in patch; physical mass, vapor composition and heat accounting belong to the materials audit. |
| Sealed ecosystem test | The normal jar test runs two days and accepts at least one of two fish and at least one plant (`tools/simtest.mjs:2087–2090`). The overfed jar merely requires a bloom and fewer than two survivors (`2091–2096`). | Tests demonstrate some survival and mortality, not stable inventories, carrying capacity, or a verified nighttime hypoxic cause. |

The documented “left for later” list in `CHEMISTRY.md:413` is stale relative to the unfinished patch: moss, root uptake, fish crowding, alcohol burning and distillation have been attempted. However, its larger claim that life cycles are “built” describes feature presence, not full physical correctness (`CHEMISTRY.md:381–413`).

### Inferences

The immediate milestone should be **finish and validate Phase 22**, with explicit distinction between its original behavioral promise and the stronger conserved-ecosystem objective now requested. Phosphate, microbial populations and a quantitative food web extend the original scope; fractional respiration errors and inexhaustible food/decay are current correctness defects.

### Gaps

The current life tests do not measure total C/N/P, all causes of death, population age structure, or long-term equilibrium. No claim of stability across world seeds is justified by this audit. A sealed jar exchanges light and heat with its surroundings; “sealed” should mean closed to matter, not closed to energy.

## Which biological rules need correction, and what does the research support?

### Takeaway

The most important repair is a common accounting system for carbon, nutrients, food reserves and oxygen. Realistic behavior follows when transformations are limited by their available reactants and when organisms pay for maintenance, growth and reproduction.

### Cited Findings

1. **Photosynthesis and respiration are material transfers.** NASA describes photosynthesis as conversion of CO₂ and water into organic carbon and O₂ using light; respiration returns organic carbon to CO₂ while consuming O₂. For a simplified model, the reversible bookkeeping unit can be `CO₂ + H₂O ↔ CH₂O + O₂`, with energy flowing in opposite directions. This is an accounting approximation, not the detailed biochemical pathway. [NASA, The Carbon Cycle](https://science.nasa.gov/earth/earth-observatory/the-carbon-cycle/)

   **Confirmed defect:** `respire(k, carb)` stochastically removes fractional O₂ but adds `Math.round(carb)` CO₂ (`js/oxygen.js:56–59`). A one-stem plant's 0.25-unit respiration loses its CO₂ output entirely; larger plants have different rounding errors. The same function clamps O₂ to zero but still credits CO₂, and `plantTick` spends sugar regardless of oxygen availability (`js/plants.js:76–78`). Fix fractional inventories or carry residuals, and return the amount actually respired.

2. **Blooms affect oxygen over the day and through decay.** USGS field monitoring attributes daily DO and pH changes to photosynthesis and respiration; EPA describes plant respiration and decomposition as oxygen demands, with low DO often strongest before dawn. The simulation should log the actual phase of day, local DO and death cause rather than infer hypoxia from a green pond and a missing fish. [USGS, Diurnal variations in water quality](https://www.usgs.gov/centers/new-jersey-water-science-center/science/diurnal-variations-water-quality-surface-water); [EPA, Dissolved Oxygen](https://www.epa.gov/caddis/dissolved-oxygen)

3. **Both nitrogen and phosphorus constrain living production.** Excess N and P can cause algal blooms and oxygen depletion. A nitrate-only fertilizer channel is a useful earlier abstraction, but it cannot represent phosphorus limitation or account for both nutrients in plant, algae and animal biomass. [EPA, Dead zones and harmful algal blooms](https://www.epa.gov/nutrientpollution/effects-dead-zones-and-harmful-algal-blooms)

   **Confirmed gaps:** `regrowLeaf` creates leaves without spending reserves; `dropSeed` calls `plantSeed`, which gives the new plant starting sugar without a matching parental debit (`js/plants.js:33–36,129–147`). Algal growth adds biomass independently from the CO₂/O₂ exchange (`js/solutes.js:185,196–197`). Root uptake currently removes nutrients without recording their destination. These are separate from the legitimate sandbox act of painting in new matter, which should be tracked as an external addition.

4. **Nitrification and denitrification have different requirements.** EPA describes nitrification as aerobic ammonia-to-nitrite-to-nitrate conversion; denitrification uses nitrate under anoxic conditions and consumes organic carbon. EPA's engineering reference gives approximately 4.57 g O₂ per g ammonia-N nitrified and 7.14 g CaCO₃-equivalent alkalinity consumed. These are useful stoichiometric reference checks, not arbitrary thresholds to copy into uncalibrated game units. [EPA, Municipal Nutrient Removal Technologies, 2008](https://www.epa.gov/sites/production/files/2019-08/documents/municipal_nutrient_removal_technologies_vol_i.pdf); [EPA, Wastewater Lagoon Troubleshooting Manual](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P1019E47.txt)

   **Current approximation:** `js/solutes.js:67–68` removes nitrate in low O₂ without a carbon donor or destination inventory for N₂. Repairing this requires an explicit nitrogen pool and a documented microbial rate model. The large 2008 PDF was accessible in indexed text but could not be fully fetched by the browser tool; use the numerical values as sourced references pending implementation-time verification.

5. **Ammonia toxicity depends on chemical conditions.** EPA distinguishes NH₄⁺ from the more toxic un-ionized NH₃ fraction; pH, temperature and exposure affect risk. A single raw-channel cutoff is therefore inadequate as the final toxicity model. [EPA, Ammonia](https://www.epa.gov/caddis/ammonia)

   **Code:** `js/creatures.js:29,71` applies one threshold of 80 to the ammonium channel. Preserve separate hypoxia and ammonia causes and use total ammonia plus a pH/temperature speciation model when concentration units are defined. Do not claim the existing jar fish kill was caused by one rather than the other.

6. **Decay needs consumable organic material.** EPA describes anaerobic digestion as microbial breakdown of organic matter without oxygen, producing mainly methane and CO₂ plus digestate. Mineral mud alone should not be an endless source of fuel. [EPA, Basic information about anaerobic digestion](https://www.epa.gov/anaerobic-digestion/basic-information-about-anaerobic-digestion)

   **Code:** `js/erosion.js:65–81` generates methane from the presence of a suitable mud bed, and `js/solutes.js:66` lets dirt beneath water consume O₂ indefinitely. Neither condition debits an organic stock. Add detritus/soil organic carbon distinct from mineral sediment. Route airborne as well as aquatic deaths into a carcass or detritus inventory; current early-return deaths include `js/creatures.js:169–175,202–206,233–238`.

7. **Food must be consumed and converted.** Cornell states that bees obtain carbohydrate from nectar and protein/lipids from pollen, and can starve. The numerical per-bee needs should not be copied directly until a sprite's represented biomass and the game's biological timescale are defined. [Cornell Cooperative Extension, Honey bees and honey](https://monroe.cce.cornell.edu/agriculture/seasonal-produce-highlights/honey-bees-honey)

   **Code defects:** bees reset hunger at comb without spending food (`js/creatures.js:248`); small fish can remain hungry indefinitely (`66–83`); animal reproduction creates full bodies without a reserve cost. Introduce food reserves and biomass transfers, retaining local crowding as a secondary spatial constraint. Separate comb wax mass from honey contents, especially because `held=0` currently means full comb (`263–265`).

8. **Fermentation needs substrate and a viable population; vinegar is a microbial process.** UC Davis gives the net hexose fermentation yield of two ethanol and two CO₂ molecules per sugar molecule. Its fermentation data show strain- and condition-dependent alcohol tolerance, so 14% is a reasonable chosen yeast archetype, not a universal biological maximum. Its Waterhouse Lab identifies oxygen-requiring acetic-acid bacteria that convert ethanol to acetic acid. [UC Davis, Fermentation overview](https://wine.ucdavis.edu/industry-info/enology/fermentation-management-guides/wine-fermentation/overview); [UC Davis, Problem fermentations](https://wine.ucdavis.edu/industry-info/enology/fermentation-management-guides/wine-fermentation/problem-fermentations); [UC Davis Waterhouse Lab, Volatile acidity](https://waterhouse.ucdavis.edu/whats-in-wine/volatile-acidity)

   **Current gaps:** `js/solutes.js:81–88` uses channel increments and random gas emission rather than carbon-balanced yields, treats oxygen as a binary respiration/fermentation switch, and makes generic acid without tracking acetic-acid bacteria. A minimal microbial guild is sufficient; individual simulated microbes are unnecessary. Sugar species and ethanol mass fractions must align with the materials model.

### Inferences

Use consistent units and finite inventories before adding more species. Proposed internal choices are moles for gas/chemical transfers, mass for biomass and nutrient stocks, and real seconds plus named biological time multipliers for rates. UI may show mg/L, percent composition and game days. These are design proposals; no scientifically unique tile volume or sprite mass exists until the game's scale is defined.

The shared material audit must repair air/water gas exchange and dissolved-oxygen accounting before the closed-jar ecosystem can be validated. Otherwise ecology can appear balanced because its physical reservoirs replenish matter implicitly.

### Gaps

No single starvation duration, photosynthetic rate, C:N:P ratio, fish DO threshold or yeast alcohol limit applies to every species. Choose a small explicit set of organism archetypes and source their parameter ranges. Species-specific physiology, pathogens, detailed pollen chemistry, sap hydraulics and full microbial competition are later fidelity layers, not prerequisites for fixing resource creation.

## What is a concrete completion specification?

### Takeaway

Finish Phase 22 with measurable budgets and causal tests, then extend biodiversity and production chains. The goal is a world that responds to shortages and disturbances coherently, including the possibility of an ecosystem collapsing for identifiable reasons.

### Cited Findings

The following is an implementation proposal derived from the defects and sources above, not a claim that these features already exist:

| Step | Proposed work | Acceptance requirement |
|---|---|---|
| 22A: arithmetic and accounting | Fraction-preserving gas transfers; bounded respiration/fixation; reserve costs for leaves, seeds and offspring; finite fish/bee food; common death-to-detritus transfer. | No transfer exceeds available inputs; splitting one reaction into small increments gives the same totals as a large increment; all births, deaths and food transfers have a material origin/destination. |
| 22B: substrate-based ecology | Organic matter separated from sand/clay; finite soil carbon and nitrogen; phosphate and biomass nutrient stores; microbial guild rates; nitrogen gas destination. | Sterile mineral sediment cannot make methane or consume oxygen; a fixed detritus addition produces bounded products; N/P starvation stops net growth while maintenance consumes reserves. |
| 22C: fermentation integration | Separate sugar/ethanol/acetic-acid identities and microbial activity; conservative yields and heat; selected yeast archetype. | Substrate exhaustion stops production; products account for carbon; limited oxygen limits oxidation; the documented yeast tolerance is a model parameter. |
| 22D: observable ecosystems | Cause-of-death codes, inventory diagnostics and time series; update documentation and saves for new state. | A loss can be attributed to DO, ammonia, heat, starvation or another recorded condition; save/undo preserves every new pool and reserve. |

### Inferences

Suggested test defaults are engineering targets, not scientific constants:

- An isolated transfer test conserves relevant elemental inventories to numerical precision. A whole-world tolerance is derived from representation error; do not simply permit unexplained percentage drift.
- A designed balanced sealed jar runs at least ten game days across multiple fixed seeds. Track total matter, dissolved/headspace gases, biomass, detritus, nutrients, births/deaths and water. Require a documented viable population range and no unexplained resource trend; natural turnover may occur if births and deaths are accounted for.
- A matched dark jar cannot sustain net photosynthetic production; a jar lacking N or P cannot keep adding biomass; reopening a depleted jar changes its gas budget through a recorded boundary flux.
- Overfeeding produces measurable oxygen demand. For a test specifically named “nighttime hypoxic kill,” require low local DO to precede the tagged death at night, and control ammonia, temperature and other causes. Also test an aerated comparison and a separate ammonia-toxicity scenario.
- A fish without food depletes reserves and eventually dies; a fed population approaches a food/space-limited range. Bees consume honey when forage is absent; an empty comb cannot prevent starvation.
- Ten-day tests belong in the full tier; targeted arithmetic and short budget tests belong in the quick tier. Existing gameplay puzzles need regression checks after changing their material rules.

Later additions with clear value: aquatic macrophytes, detritivores, decomposer fungi, explicit pollen, compost, simple soil fertility differences and organism life stages. Their usefulness depends on the same finite resource ledger; adding them before that would multiply balancing problems.

### Gaps

The final tile scale, organism archetypes, acceptable speedups and performance budget need an approved design. This audit does not determine that every conceivable jar must remain alive; viability depends on initial stocks, lighting, temperature and species. It specifies how to distinguish a genuinely sustainable setup from a simulation shortcut.
