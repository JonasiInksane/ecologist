# Tidepool living world audit

Research and working-tree audit · 29 October 2026

**Baseline report:** findings and line references below describe the project before the approved
22A/22B repairs. Current implementation and verification are tracked in
[Phase 22A](../docs/design/phase22a-accounting.md) and
[Phase 22B](../docs/design/phase22b-life-cycles.md); this report retains the original evidence and
the remaining 22C and material-expansion proposals.

**At the audit baseline, Phase 22 had most of its visible behaviors, but was not ready to be signed off as a self-sustaining living world: the full test run failed three Phase 22 checks.** The unfinished edits addressed the documented follow-up work: moss photosynthesis, root nutrient uptake, fish crowding, fermentation limits, distillation, and burning alcohol. The broader audit found errors beneath those features: dissolved material could disappear during mixing, a sealed pond could receive oxygen without depleting its air, some combustion ignored oxygen, and organisms could obtain food or biomass without paying for it. Sand, sugar, salt, and several manufacturing reactions had similar quantity and identity problems. Tidepool already had useful simulation, rendering, saving, and test infrastructure to build on. The recommended next step was to isolate the three failures and repair the required quantity accounting, followed by finite ecological cycles and connected material-processing expansions. This report retains that researched proposal; the linked Phase 22A record describes the subsequent fixes.

## Phase 22 is present, with unfinished follow-up work

The “built” label in [CHEMISTRY.md](</C:/Users/jonas/Documents/tidepool 2/tidepool/CHEMISTRY.md:381>) records a substantial implementation. Plants use light, water, CO₂, and sugar stores; creatures feed and breathe; algae affect water chemistry; decay contributes nutrients; yeast produces alcohol; and bees collect nectar. However, the document’s “left for later” paragraph is behind the working tree. The seven existing modified files contain attempts to close those items, including additional tests. Those edits were preserved during this audit.

| Area | Present in the code | Current patch or remaining completion gap |
|---|---|---|
| Plants and moss | Plants have photosynthesis, respiration, sugar-funded stem growth, flowers, and nectar. | The patch adds root nitrogen removal and moss gas exchange. Nutrient uptake has no stored plant-nitrogen destination; moss lacks reserves; leaf regrowth and natural seeds can introduce biomass without corresponding costs. |
| Algae and water | Algae grow, are grazed, exchange gases, and decay. Fish experience low dissolved oxygen. | Algal growth can occur without carbon fixation. Dissolved oxygen is represented as a deficit from saturation, allowing temperature changes and surface exchange to alter inventories incorrectly. |
| Fish and food webs | Feeding, predation, breeding, and some hunger conditions exist. | The patch adds mates and local crowding. Small fish never starve, and offspring do not debit a complete parental biomass budget. |
| Bees and honey | Flowers provide nectar, bees transport it, and comb stores honey. | Visiting comb resets hunger without consuming honey. Comb wax, offspring, and food conversion need explicit quantities. |
| Decay and nutrients | Some deaths produce ammonium; nitrification consumes oxygen; low-oxygen conditions remove nitrate. | Some flying-creature deaths bypass decay. Soil oxygen demand and mud methane production lack finite organic substrate. Phosphorus is absent. |
| Fermentation and vinegar | Sugar, yeast, ethanol, CO₂, and acidity interact. | The patch limits the chosen yeast’s alcohol production and adds distillation/burning. Carbon yields, vinegar identity, vapor composition, and energy accounting remain incomplete. |
| Sealed ecosystem | A two-day jar scenario and an overfeeding scenario exist. | The jar can pass after losing half its initial fish and plants. The overfeeding test does not establish nighttime hypoxia as the cause of death. |

These findings come from [plants.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/plants.js:33>), [creatures.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/creatures.js:66>), [materials.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/materials.js:237>), and the [life-cycle tests](</C:/Users/jonas/Documents/tidepool 2/tidepool/tools/simtest.mjs:2087>). “Implemented,” “scenario-tested,” and “scientifically consistent” therefore need separate status fields in the roadmap.

**Verification baseline:** the preceding read-through built the single-file game successfully, bundling 54 modules. All 24 quick test scenes passed in 62.2 seconds. The latest working tree's complete **75-scene suite finished in 700.6 seconds: 375 assertions passed and three failed, with no worker crashes**. All three failures are in the Phase 22 life-cycle scene. The observed results are recorded in [full-suite.log](</C:/Users/jonas/Documents/tidepool 2/tidepool/research_notes/Tidepool living world audit/full-suite.log:439>).

| Failed check | Observed output | What this establishes |
|---|---|---|
| Overfed jar bloom/night fish kill | Algae peak 19; both fish alive; dissolved O₂ 6.3 mg/L | The scripted expected outcome did not occur. Its biological cause needs isolation; the output alone does not prove which subsystem is responsible. |
| Small-pool crowding | Zero fish remaining from four | The scenario failed its expected population bound. Record causes of death before retuning reproduction. |
| Spirit flame/burnoff | Alcohol 202 from an initial 200; 57 water tiles from 18 | The expected burnoff failed. Component and energy diagnostics are needed to distinguish contributing transfers and reactions. |

The normal two-day jar passed with both fish and both plants alive, water O₂ 6.4 mg/L, and air O₂ 21.0%. That result does not resolve the oxygen-accounting defects found in code. Likewise, a distillation check passed while reporting ten condensate tiles at ethanol concentration 252 and source wine rising from 36 to 130; passing its expected condition does not establish a correct component balance or vapor equilibrium. The long Phase 22 scene now executes 79,160 ticks versus 44,660 before the patch; extracting focused transfer tests and a separate long-duration ecology tier would make iteration more practical.

Coverage includes classification of all 34 current liquid/gas IDs, the existing non-machine solid families, Phase 22 behavior, and detailed inspection of high-impact transfer and reaction paths. It is a targeted source-code and scientific-reference audit. It does not certify every material constant, every possible reaction pair, browser responsiveness, or stability across all generated worlds. The new failure cases below were identified by code inspection and arithmetic; they still need executable regression tests.

## Quantity errors undermine both chemistry and ecology

The highest-priority findings concern conservation and limiting reactants. These are correctness defects rather than choices about whether a game day represents minutes or weeks. Some existing tests explicitly expect earlier shortcuts, so a green suite can preserve scientifically wrong behavior.

| Priority | Confirmed issue and evidence | Consequence and required repair |
|---|---|---|
| P0 | [Solute diffusion](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:206>) exchanges equal concentration increments between unequal liquid volumes. | A full tile at concentration 100 and a one-fifth-full empty tile contain 100 units initially. Moving concentration 10 changes the total to 92. Transfer quantities, then derive concentrations. |
| P0 | [Dissolved oxygen](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/oxygen.js:39>) is saturation minus a stored deficit; [surface exchange](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/oxygen.js:119>) does not debit headspace oxygen. | Cooling can create computed oxygen, and closed air can replenish water indefinitely. Store actual oxygen and transfer it between finite reservoirs. |
| P0 | [Fractional respiration](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/oxygen.js:56>) removes fractional oxygen probabilistically but rounds CO₂ output. | A one-stem plant’s 0.25-unit respiration produces zero CO₂. Respiration also continues without enough oxygen. Preserve fractional quantities and return the amount actually metabolized. |
| P0 | The ordinary hot-gas branch in [fire.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/fire.js:87>) burns hydrogen or methane without requiring available oxidizer. | A sealed oxygen-free fuel cloud can react. Make ordinary combustion consume measured oxygen and stop at the limiting reactant. |
| P0 | [Flow](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/sim.js:46>) carries temperature and solutes but not accumulated latent energy; [empty cells](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:60>) clear it. | Moving a partly changing phase can strand or delete energy. Transport total thermal energy with material. |
| P0 | The new [distillation path](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:259>) subtracts concentration and carrier volume separately, emits pure ethanol vapor, and pays no latent heat. | Ethanol and other components disappear, while dilute alcohol becomes unrealistically pure vapor. Preserve each component and use a composition-dependent phase model. |
| P0 | [Gas fading](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/gases.js:13>) deletes some gases even in sealed space; [reaction output](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:101>) can fail after inputs are consumed. | Packed reactions lose products. Reserve product storage before committing, or retain pressure/dissolved products. Record open-world escape explicitly. |
| P0 | [Dissolution](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:95>) clips concentration after removing powder; [crystallization](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:152>) replaces the whole solution tile. | A small water quantity can destroy excess sugar or salt; crystals erase solvent and other solutes. Dissolve only what fits, and precipitate only the relevant species. |
| P0 | [Evaporation residues](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:272>) retain only the dominant salt/sugar channel; [caramel formation](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:215>) and [reaction products](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:112>) can turn partial amounts into full blocks. | Mixed ingredients disappear and tiny piles gain matter. Preserve all residues and scale products and heat capacity to actual mass. |
| P1 | [Powder contact rules](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:77>) turn quartz sand into clay slurry in water and glass beside any lava, bypassing [newer chemistry](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:82>). | Old and new rules contradict each other. Keep mineral identity and use one authoritative transformation path with ingredients and energy requirements. |
| P1 | [Chemical definitions](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:43>) call acid sulfuric acid and oil petroleum, while reactions make table salt from that acid and soap from that oil. [pH](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:200>) is linear in channel values. | Reactions can imply missing elements or the wrong feedstock. Split identities, retain counterions, and use a stated acidity/equilibrium approximation. |
| P1 | [Animal food](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/creatures.js:248>), [free plant reproduction](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/plants.js:129>), and [mud gas production](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/erosion.js:65>) lack finite budgets. | Ecosystems can survive or generate fuel using inexhaustible resources. Give organisms and detritus consumable inventories. |

There are also deliberate physical compressions. The [matter model](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:6>) modifies conductivity, gas heat capacity, and latent heat for play. Those changes affect ratios and energy balances; they should not be described as merely speeding up time. A realism pass should retain authoritative physical data separately from clearly named gameplay adjustments, then decide which adjustments remain acceptable.

## A common inventory model can support a believable world

The proposed foundation is a coarse material model with explicit components, energy, and boundaries. The current typed arrays, staggered updates, and separate renderer can remain. A solution needs solvent and species quantities; a pile needs solid quantity, composition, packing, and moisture; an organism needs biomass and reserves. Temperature, concentration, and visible fullness should be derived consistently from those quantities. Define a central conversion between mass, occupied volume, and tile scale before combining real densities with chemical yields. A tile’s 0–255 fullness cannot simultaneously mean liquid volume, gas volume, and mass.

**Dissolved amount must be independent of saturation capacity.** Water temperature, pressure, and salinity determine the equilibrium oxygen target. They do not instantaneously change the oxygen already present. USGS provides a useful saturation reference with a stated validity range; use bounded lookup tables and transfer the same amount out of air that enters water. ([USGS DOTABLES](https://water.usgs.gov/water-resources/software/DOTABLES/))

Gas tiles and ambient air need a shared inventory contract. A coarse atmosphere can track oxygen, background nitrogen, carbon dioxide, water vapor, and active trace gases; visible clouds can reflect local composition. Smoke particles require their own suspended-particle inventory. An initial pressure approximation is reasonable if its range and limitations are explicit. Diffusion, wind, dissolution, venting, condensation, and reaction must transfer or transform those same quantities.

Thermal energy should travel with the material. Water’s phase equilibrium, density, and enthalpy are linked; IAPWS can supply reference tables without requiring its full formulation at every game tick. Pure-water boiling near 100°C is an atmospheric-pressure approximation. Ethanol vaporization also has a real energy cost, and ethanol/water vapor composition varies with the mixture; simple distillation does not produce pure ethanol from a dilute solution in one step. ([IAPWS-95](https://iapws.org/technical-guidance/release/IAPWS-95), [NIST water](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4), [NIST ethanol](https://webbook.nist.gov/cgi/cbook.cgi?ID=C64175&Mask=4), [Purdue distillation principles](https://www.extension.purdue.edu/extmedia/AE/AE-117.html))

Reactions should declare identities, quantities, limiting reagents, products, and heat. A reaction first calculates an allowed extent, checks product storage, and then applies all transfers together. Electricity must have a quantitative supply if electrolysis claims an energy budget; the molecular ratio for water splitting is 2 H₂O → 2 H₂ + O₂. Saponification belongs to triglyceride oils and yields glycerol plus fatty-acid salts, so petroleum and plant oil need separate definitions. Acidity needs identified species: sulfuric acid, acetic acid, and dissolved CO₂ have different counterions and buffering behavior. ([DOE electrolysis](https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis), [University of Washington saponification](https://chem.washington.edu/lecture-demos/saponification), [EPA pH](https://www.epa.gov/caddis/ph))

For living matter, a small carbon–nitrogen–phosphorus model is a practical target. Photosynthesis transfers carbon from CO₂ into organic stores using light; respiration consumes organic stores and oxygen. Growth, leaves, seeds, nectar, and offspring must all draw from those stores. Root nutrient uptake must have a destination, and carbon fixation must limit algal production. Nitrogen and phosphorus limitation are meaningful mechanisms because excess nutrients can drive blooms and oxygen depletion. ([NASA carbon cycle](https://science.nasa.gov/earth/earth-observatory/the-carbon-cycle/), [EPA nutrient pollution](https://www.epa.gov/nutrientpollution/effects-dead-zones-and-harmful-algal-blooms))

Decomposition needs finite detritus, with different products and rates under oxygen-rich and oxygen-poor conditions. Mineral mud and organic-rich sediment should be distinguished. Microbial guilds can represent nitrification, denitrification, fermentation, and decay without individual microbes. Ammonia toxicity should eventually depend on total ammonia, pH, temperature, and exposure, because the toxic un-ionized fraction changes with chemical conditions. ([EPA anaerobic digestion](https://www.epa.gov/anaerobic-digestion/basic-information-about-anaerobic-digestion), [EPA ammonia](https://www.epa.gov/caddis/ammonia))

Food and reproduction make populations respond to their environment. A fish uses stored food before starving; a bee consumes hive reserves when flowers are unavailable. Nectar, honey, wax, and pollen represent different resources, so nectar delivery should not silently fund every colony need. Fermentation requires substrate and a viable yeast population; the chosen yeast’s alcohol tolerance is a species/strain model, not a universal cutoff. Vinegar production requires an acetic-acid identity and oxygen-dependent microbial activity. ([Cornell bee nutrition](https://monroe.cce.cornell.edu/agriculture/seasonal-produce-highlights/honey-bees-honey), [UC Davis fermentation](https://wine.ucdavis.edu/industry-info/enology/fermentation-management-guides/wine-fermentation/overview), [UC Davis problem fermentations](https://wine.ucdavis.edu/industry-info/enology/fermentation-management-guides/wine-fermentation/problem-fermentations), [UC Davis volatile acidity](https://waterhouse.ucdavis.edu/whats-in-wine/volatile-acidity))

Fantasy remains compatible with this model when its exceptions are declared. Aether can retain unusual buoyancy; frost can draw on a magical cooling reserve or a named external source; void can send matter to a recorded sink; mimic can perform an explicitly magical transformation. Those choices need approval. Ordinary transfers and reactions should still obey the selected rules, and diagnostics should show magic separately from unexplained loss.

## Sand and sugar should open connected processing chains

**Mineral identity, grain size, and moisture are separate properties.** The geological Wentworth convention distinguishes sand, silt, and clay-sized particles by size; “clay-sized” alone does not specify a clay mineral. Quartz sand can wet, settle, erode, and be ground finer without becoming clay. Moisture can bind grains through capillary effects, while flooding can change stability. Friction, shape, packing, and cohesion should influence pile behavior; density alone is insufficient. ([USGS sediment nomenclature](https://pubs.usgs.gov/of/2006/1046/htmldocs/nomenclature.htm), [Utah Geological Survey settling](https://geology.utah.gov/map-pub/survey-notes/teachers-corner/teachers-corner-use-a-settling-container/), [Pakpour et al. sandcastle experiments](https://www.nature.com/articles/srep00549), [Zhou et al. granular piles](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.64.021301))

The first terrain expansion should introduce graded sediment and moisture-aware states: gravel, quartz sand, suspended/dry silt, clay-bearing fines, and mixtures containing organic material. Retain the current falling-powder approach while giving classes different settling, friction, cohesion, and erosion parameters. “Wet sand” can be a state of sand. Mud can be a suspension whose mineral and organic fractions remain visible to chemistry and ecology. Rivers can then sort particles, build bars and deltas, and transport nutrients through the same conserved flows.

**Sugar should have a complete origin and fate.** Begin with one crop, such as beet or cane, and a practical extraction chain. Sugar beet stores sucrose; real processing extracts it into water, clarifies and filters the juice, concentrates it, crystallizes sugar, and separates useful residues. In Tidepool, this connects farming, water, heat, filtration, crystallization, fermentation, animal feed, and compost. Pulp and mother liquor must remain as products. ([British Sugar processing](https://www.britishsugar.co.uk/about-sugar/how-sugar-is-made), [Sugar Association processing](https://www.sugar.org/sugar/refining-processing/))

Sucrose solubility depends on temperature and solution composition. Syrup should therefore be a water/sugar mixture whose viscosity and freezing behavior follow concentration. Cooling or evaporation can produce crystals while retaining mother liquor. Grinding changes particle size; dissolving changes physical state; caramelization changes chemistry. Heating sugar involves time-dependent degradation and moisture effects, so one arbitrary temperature switch that turns a pinch into a full caramel block is inadequate. ([Nordic Sugar technical reference](https://www.nordzucker.com/de/wp-content/uploads/sites/2/2020/08/Functional_prop_on_tech_level_uk_2020.pdf), [ICUMSA sucrose solubility specification](https://www.icumsa.org/methods/icumsa-specification-and-standard-sps-2-1998/), [Original sugar calorimetry study](https://www.sciencedirect.com/science/article/pii/S0040603114002500))

The same dissolution/precipitation machinery should handle brine and salt. Evaporation removes water; the excess dissolved species precipitates; other ingredients remain in the residual solution or mixed deposit. Fresh water can redissolve deposited halite. This provides consistent salt pans, crystal growth, food preservation, and chemical processing without one-off disappearance rules. ([USGS Bonneville Salt Flats](https://pubs.usgs.gov/publication/wsp2057))

Glass and ceramics need distinct feedstocks and thermal histories. Soda-lime glass uses silica with sodium carbonate and limestone; pure silica glass is a different composition. Basalt lava should not automatically make soda-lime glass from adjacent sand, and ordinary basalt melt should not always become rhyolitic obsidian when quenched. Clay-rich feed can dry reversibly before firing creates a different ceramic material. ([Corning glass manufacture](https://www.corning.com/worldwide/en/innovation/materials-science/glass/how-glass-made.html), [USGS basalt lava](https://www.usgs.gov/media/images/hot-basalt-lava-flowing-over-surface-a-cooled-basalt-lava-flow), [USGS obsidian](https://www.usgs.gov/observatories/yvo/news/yellowstones-tool-making-lava-flows), [Brick Industry Association technical notes](https://www.gobrick.com/resources/technical-notes))

| Proposed chain | Useful new content | Connection to the living world |
|---|---|---|
| Rock → graded grains → transport → deposition | Gravel, silt, clay-bearing fines; moisture/packing states | River habitats, soil texture, filtration, deltas, nutrient transport |
| Crop → juice → syrup → crystals and mother liquor | One sugar crop, pulp, sucrose crystals, molasses-like residue | Farming, food, fermentation, compost, water and heat use |
| Brine → concentration → crystals and remaining brine | Mixed residues and composition-aware crystals | Salt flats, water treatment, osmotic stress |
| Defined glass ingredients → molten glass → cooled glass | Soda ash distinct from wood ash; molten glass | Greenhouses, vessels, lamps, recycling later |
| Clay-rich feed → wet shape → dry clay → ceramic | Unfired clay and fired ceramic states | Kilns, water storage, habitat construction |
| Plant waste → decay or char → soil/mineral/gas products | Detritus, humus/compost, moisture-aware wood and char | Fertility, oxygen demand, carbon storage, fuel |
| Defined ore and reductant → metal, slag, gas | Declared ore/gangue composition and slag | Machinery and infrastructure with traceable inputs |

Wood processing should preserve moisture, char, ash, and gas quantities. Ironmaking slag should follow ore gangue and flux composition rather than an arbitrary random share of converted tiles. The current lime cycle is a useful starting point, but its water and CO₂ exchanges also need the common inventory system. These are conceptual gameplay chains; exact formulations and rate tables need an implementation-time data review. ([FAO carbonization](https://www.fao.org/4/x5328e/x5328e05.htm), [USGS iron and steel slag](https://www.usgs.gov/centers/national-minerals-information-center/iron-and-steel-slag-statistics-and-information), [US Bureau of Standards lime reference](https://www.govinfo.gov/content/pkg/GOVPUB-C13-971e3eedbc78437526a79f43e71b91eb/pdf/GOVPUB-C13-971e3eedbc78437526a79f43e71b91eb.pdf))

## Finish the foundation, then prove the ecosystem

The following sequence keeps the first change reviewable while supporting the larger ambition. It is a proposed revision to the roadmap, not an approved implementation. Physical reference values remain separate from game timing, and each milestone must preserve or deliberately migrate saved worlds.

| Milestone | Concrete scope | Exit condition |
|---|---|---|
| **22A: Isolate failures and account for the existing world** | Reproduce the three observed Phase 22 failures in focused scenes; add mortality and component diagnostics; correct their demonstrated causes and the required quantity-transfer defects. Establish identity and amount contracts. | The three failures are resolved with meaningful assertions; small closed scenes retain tracked components; every source/sink is reported. |
| **22B: Complete finite life cycles** | Give plants, algae, fish, bees, offspring, and detritus finite stores. Unify death/decay paths; add the minimum nutrient and microbial model needed for closure. Integrate conservative fermentation and alcohol phase changes. | Food, carbon, nutrients, oxygen, water, and products have recorded destinations; no inexhaustible food or organic substrate. |
| **22C: Demonstrate a living world** | Add long-duration diagnostic scenarios, multiple fixed seeds, mortality attribution, and population/resource trend checks. Retune affected puzzles and generated habitats. | The Phase 22 completion gate below passes with the full regression suite and measured performance. |
| **Material expansion** | Resolve remaining material identities, heat/phase compression, sediment, saturation, crystallization, and processing chains. Add a few connected materials at a time. | Each new chain passes its material, energy, save/restore, and ecological-interaction checks before further additions. |
| **Showcase** | Terrarium mode, chemistry/ecology puzzles, explanatory inspection tools, and a complete fantasy pass. | Players can observe causes and diagnose failure; ordinary and magical budgets remain distinguishable. |

### Proposed first-milestone specification

**Player goal:** build a pond or vessel, add known materials, and observe understandable changes. A sealed setup should not receive hidden oxygen or lose sugar when it mixes. The immediate feel target is predictable cause and effect with the existing expressive pixel-world presentation.

**Rules:** first isolate and explain the overfeeding, crowding, and spirit-burning failures; do not assume their root causes from the final counts. Transfer conserved amounts before deriving concentrations; debit both sides of exchange; preserve fractional remainders; cap every reaction by available inputs; retain products when storage is blocked; record world-boundary, player-tool, and fantasy additions/removals. Initially apply this contract to water, oxygen, CO₂, salt, sugar, nitrogen-bearing channels, and ethanol where those existing systems interact. New material palette entries are not required for this first slice.

| Parameter or convention | Proposed initial setting | Reason / qualification |
|---|---|---|
| Simulation tick | Preserve the current 60 ticks/second | Avoid mixing timing changes with correctness repairs. |
| Day length | Preserve the current three-minute game day | Biological rate changes remain separately configurable. |
| Closed test boundaries | Zero unreported matter flux | A test boundary condition, not a claim that real habitats are isolated. |
| Fractional quantities | Retain exact fixed-point remainders or higher-precision amounts | Select after a small transport benchmark; do not discard sub-unit products. |
| SI conversion | One central documented tile-volume/reference-mass mapping | The physical scale must be chosen before claiming kilogram, mole, or exposure accuracy. |
| Rate multipliers | Named separately for biology, weathering, and transport | Defaults should preserve current pacing where possible, then be calibrated against the new budgets. |
| Acceptance tolerance | Exact totals for integer/fixed-point transfers; explicit measured tolerance for floating-point paths | Establish and report the tolerance; never hide drift with an unexplained margin. |

**Integration:** shared state and snapshots carry the inventories; liquid flow, pumps, pipes, dissolution, gas exchange, and reactions use common transfer helpers. The hover inspector gains quantities and cause-of-death diagnostics without exposing internal array terminology. The custom bundle’s naming restrictions and explicit save registry must remain satisfied. Legacy concentration data should be converted using saved liquid amounts, with versioned identity defaults and compatibility tests.

**Edge cases:** one-unit puddles, nearly full solution channels, unequal neighboring volumes, repeated tiny transfers, zero oxygen, frozen or partly boiling material in transit, packed output cells, gases under a sealed roof, player painting during a test, and old saves with missing fields. The first patch should contain small reproducible tests for these cases, then run the existing quick suite and build. The complete suite, including affected puzzles, follows before the milestone is accepted. A browser playthrough is still needed for clarity and feel.

### Phase 22 needs a stronger completion gate

A designed balanced jar should run for **at least ten game days across multiple fixed seeds**, with a stated viable population range and full accounting of births, deaths, biomass, detritus, water, and gases. Ten days is a proposed acceptance horizon, not proof of indefinite stability. A sealed jar can receive light and exchange heat; it should be closed to matter except for explicitly logged interventions. Natural turnover is acceptable when its costs and products are recorded.

A matched dark jar must lose the ability to sustain net photosynthetic production. Nutrient-limited jars must stop adding biomass when the relevant stores are exhausted. A fish without food must spend reserves and eventually starve; empty comb must not feed bees. Organic matter must be consumed as it drives oxygen demand or methane production. These comparisons distinguish an ecosystem response from a decorative survival timer.

The overfeeding test must record local oxygen, ammonia, temperature, time of day, and the tagged cause of death. A scenario specifically named “nighttime hypoxic kill” must show low oxygen preceding death at night, while controlling the other causes; include an aerated comparison and a separate ammonia scenario. Real photosynthesis, respiration, and decomposition can drive daily oxygen changes, with low oxygen often occurring before dawn. ([USGS daily water-quality variation](https://www.usgs.gov/centers/new-jersey-water-science-center/science/diurnal-variations-water-quality-surface-water), [EPA dissolved oxygen](https://www.epa.gov/caddis/dissolved-oxygen))

### Expansion needs its own material gate

Each processing chain should conserve its components through partial quantities, mixed inputs, heating/cooling, and save/load. Quartz sand in water must retain quartz identity. Dissolution at several water volumes must remove exactly the quantity added to solution. Salt-plus-sugar evaporation must retain both constituents. Heating a pinch must not create a full product block. Drying clay and firing clay must produce distinct reversible and irreversible outcomes. A packed reaction must retain products or stop. A moved phase-changing liquid must retain its energy.

Performance must be measured after each slice on calm, stormy, burning, and crowded scenes; the historical tick target is not a current benchmark. Preserve sleeping chunks and staggered work, and expand precision only where the model needs it. The most valuable new content will then reuse these rules: a new crop feeds an existing extraction and fermentation chain, and a new sediment class changes river and soil behavior through shared transport.

## Appendix: every current liquid and gas needs an explicit identity

This inventory covers the 34 IDs in [config.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/config.js:17>) and their declared [material definitions](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:40>). It records current identity questions, not independently certified property tables.

| IDs | Current material | Required definition or correction |
|---|---|---|
| 1 | Water | H₂O solvent plus explicit dissolved/suspended contents. |
| 2 | Lava | Declared basalt melt; composition and crystallization range. |
| 3 | Honey | Sugar/water mixture, distinct from pure sucrose. |
| 4, 7 | Aether, frost | Fantasy properties and explicit energy exceptions. |
| 5 | Quicksilver | Mercury; preserve mercury identity in its vapor. |
| 6 | Acid | Currently sulfuric acid; concentration, counterions, and separate other acids. |
| 8 | Steam | H₂O vapor, with ethanol/water composition explicit when mixed. |
| 9 | Oil | Currently petroleum; separate plant/triglyceride oil. |
| 10, 11, 13 | Slime, bloomwater, tonic | Fantasy identities; decide biomass and nutrient participation. |
| 12 | Mud | Water plus identified mineral and organic particles. |
| 14 | Foam | Gas/liquid/surfactant mixture; distinguish froth from oil/water emulsion. |
| 15 | Stormwater | Fantasy charged water with defined electrical energy behavior. |
| 16 | Molten metal | Resolve pure iron, steel, and carbon-rich cast iron. |
| 17 | Smoke | Gas mixture plus suspended particles, with deposition and escape. |
| 18 | Methane | CH₄ with oxidizer-limited combustion and finite biological sources. |
| 19 | Toxic fumes | Split mercury vapor, sulfur dioxide, and any other distinct gases. |
| 20 | Nitro | Declared energetic material; abstract game properties and outcomes only. |
| 21 | Lye | Declared 50% NaOH solution; track solvent and solute. |
| 22 | Carbon dioxide | CO₂ shared consistently between gas tiles, air, and water. |
| 23, 24, 27 | Void ink, mimic, liquid light | Fantasy sources, sinks, and transformations declared separately. |
| 25 | Coolant | Choose glycol and water composition, or label enhanced behavior fantasy. |
| 26 | Ferrofluid | Carrier liquid plus magnetic suspended particles. |
| 28 | Fertiliser | Resolve urea, ammonium, nitrate, and phosphorus content. |
| 29, 30 | Hydrogen, oxygen | H₂/O₂ quantities, transport, reactions, and energy accounting. |
| 31 | Molten slag | Declared oxide composition linked to ore and flux inputs. |
| 32 | Chlorine | Cl₂ with explicit dissolution/reaction/escape, including sealed conditions. |
| 33 | Bleach | Declared 5% sodium hypochlorite solution and its components. |
| 34 | Oily water | Emulsion properties derived from actual oil fraction and surfactant. |

The solids audit also covers terrain/mineral grains; ice, snow and soluble powders; wood, plants, wax/honey and wool; limestone, lime, coral, glass and brick; metals, ore, rust, slag, charcoal and ash; and manufactured materials such as sponges and membranes. Grain density and loose bulk density should both be represented where relevant rather than treating their difference as an error.

Detailed evidence, additional acceptance cases, and source-access limitations are preserved in [matter and mixtures](</C:/Users/jonas/Documents/tidepool 2/tidepool/research_notes/Tidepool living world audit/matter_and_mixtures.md>), [life cycles](</C:/Users/jonas/Documents/tidepool 2/tidepool/research_notes/Tidepool living world audit/life_cycles.md>), and [powders and processing](</C:/Users/jonas/Documents/tidepool 2/tidepool/research_notes/Tidepool living world audit/powders_and_processing.md>). Some specialized papers were available only through indexed abstracts, and exact solubility curves, species-specific toxicity, and process parameters need verification when implemented. The plan deliberately separates confirmed code defects from those outstanding data choices.
