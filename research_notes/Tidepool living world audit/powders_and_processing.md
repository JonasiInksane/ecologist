# Powders and processing in Tidepool

Research and working-tree audit, 29 October 2026. Scope: granular solids, sediment, sugar and salt processing, glass, clay, lime, wood and ore. No game files were changed and no tests were executed by this researcher. Code findings below are verified by static inspection; numerical reference values are selective, not a certification of every material constant.

## What is currently implemented, and which rules conflict with a realistic world?

### Takeaway

The project already has partial powder quantities, settling, dissolution, evaporation residues and several production reactions. However, older shortcuts remain active alongside the newer chemistry: quartz sand becomes clay slurry merely by touching water; lava contact bypasses the glass temperature rules; several conversions create or discard material. These need repair before adding many more substances.

### Cited Findings

The current non-machine solid families are defined in [config.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/config.js:5>) and assigned physical identities in [matter.js](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:18>):

| Family | Existing identities and states | Audit interpretation |
|---|---|---|
| Terrain and mineral grains | Soil/dirt, wet soil, granite-like stone, quartz sand, wet clay, permafrost, basalt, obsidian, porous rock identified as pumice, quartz-like crystal | Mineral identity, grain size, moisture and consolidation are largely collapsed into block IDs. Crystal also has fantasy formation/glow elsewhere. |
| Water and soluble solids | Ice, snow, loose sodium chloride, rock-salt crystal, sucrose sugar, baking soda | Seven materials actually use powder motion: sand, salt, sugar, baking soda, ash, quicklime and snow. |
| Biological and organic | Wood, moss, stems, leaves, flowers, honeycomb described as wax plus honey, caramel called crisp honey, wool | Chemical mixtures and biological tissue are represented as single materials. |
| Carbonate and ceramic | Limestone, quicklime, slaked-lime mortar, coral, bleached coral, soda-lime glass, fired-clay brick | Useful beginnings of real processing chains, but some products share identities incorrectly or form without all required inputs. |
| Metals and byproducts | Steel-like metal, molten-iron counterpart, copper/patina, aluminium, zinc, gold, hematite ore, rust, slag, charcoal, wood ash | Composition and purity are mostly implicit; steel, pure iron and carbon-rich cast iron share behavior. |
| Manufactured/special | Sponge/wet sponge, polymer membrane, fuse cord, ferrite magnet, frozen nitroglycerin | These need explicit composition or a declared surrogate; energetic-material production is outside this audit. |

The exact powder registry is [powders.js:15](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:15>). The following are confirmed findings, not hypothetical issues:

| Finding | Evidence in current code | Consequence / status |
|---|---|---|
| Sand changes its chemistry in ordinary water | [powders.js:77](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:77>) converts SAND to MUD on water contact; MUD is defined as clay slurry in matter.js:45. | **Scientifically wrong for the declared quartz sand.** Wet sand should retain mineral identity. It can be suspended, deposited or wetted; water does not turn quartz grains into clay slurry on this timescale. |
| Contact glass bypasses temperature and flux rules | [powders.js:81](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:81>) converts adjacent sand to glass whenever the other tile is lava, without reading temperature. [chem.js:82](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:82>) separately requires flux above 1000°C or sand alone above 1700°C. | **Contradictory active mechanisms.** A cold or cooling lava tile can still invoke the older conversion. |
| Grain motion has no material-specific friction, grain size or wet cohesion | [powders.js:41](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:41>) uses liquid density to allow entry; [powders.js:66](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:66>) applies the same heap threshold, random pause and diagonal movement to all powders. | A useful cellular-automaton starting point, but it does not distinguish coarse sand, fine cohesive powder, packed wet sand or suspension settling. |
| Bulk density and particle density have no explicit shared definition | [matter.js:22](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:22>) calls sand density 1.6 g/cm³ and loose salt 1.2; [powders.js:15](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:15>) uses 2.5 and 2.2 for sinking. Sugar is 0.85 in matter.js and 1.6 in powders.js. | **Not automatically wrong:** loose bulk and solid-particle densities differ. The missing piece is an explicit porosity/packing model explaining which density controls mass, heat and sinking. |
| Dissolution ignores temperature and can lose powder | [solutes.js:117](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:117>) applies the same cap to salt and sugar, then removes up to 24 grains. [addSol at line 95](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:95>) clamps the result to 255. | **Confirmed conservation defect.** For a 10-unit water tile with zero solute, adding 24 grains asks for concentration 612, clamps to 255, represents 10 grains and still removes 24. This is a static arithmetic example, not a run result. |
| Crystallisation replaces the solvent and erases co-solutes | [solutes.js:152](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/solutes.js:152>) turns the entire brine tile into GEM and clears every solute. Redissolution restores that volume as water with salt concentration 255. | The same water/solute inventory is not retained; other dissolved substances disappear. Crystal growth should remove only precipitated solute, leaving mother liquor. |
| Evaporating a mixture keeps only one component | [heat.js:272](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:272>) chooses the larger salt/sugar concentration, makes that powder, and clears all channels. | A salt-and-sugar solution loses the minority component. A mixed residue or separate deposits are needed. |
| Tiny amounts become full products | [heat.js:215](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:215>) sets heated sugar to CRISP with held=0, which means full. [chem.js:112](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:112>) similarly makes every block product full and every molten product 255. | Partial powder reactions cannot preserve amounts. Also [heat.js:58](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/heat.js:58>) gives even a tiny powder deposit a full block's heat capacity. |
| Sediment identity and quantity are collapsed | [erosion.js:13](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/erosion.js:13>) uses a fixed silt yield per eroded block; [erosion.js:55](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/erosion.js:55>) moves concentration rather than sediment mass; [erosion.js:62](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/erosion.js:62>) replaces water with mud. | Sand, soil and suspended fines cannot retain their grain composition or water budget through erosion/deposition. |
| Soda ash and wood ash are one material | [chem.js:78](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:78>) decomposes baking soda into ASH, explicitly reused for wood ash and glass flux. | Sodium carbonate and variable wood ash must be separate identities or explicit mixtures. Baking-soda decomposition also omits water from its stated gas products. |
| Several production chains use whole-block shortcuts | [chem.js:71](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:71>) sets mortar in CO₂ or open air; [chem.js:87](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/chem.js:87>) makes hot ore plus charcoal into molten iron or randomly selected slag; [reactions.js:106](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/reactions.js:106>) turns mud plus lava into brick. | Useful visual prototypes; not stoichiometric, composition-aware or thermally complete processing. |

Existing regression tests deliberately assert that sand turns into mud and glass on lava contact at [simtest.mjs:351](</C:/Users/jonas/Documents/tidepool 2/tidepool/tools/simtest.mjs:351>). The fine-powder tests at [simtest.mjs:1871](</C:/Users/jonas/Documents/tidepool 2/tidepool/tools/simtest.mjs:1871>) check pure salt or pure sugar residues and piling, but not mixed residues, near-saturation dissolution or partial-amount chemistry. Passing these tests therefore cannot establish physical correctness.

### Inferences

- **Priority 0:** give every conversion an inventory contract. Specify the consumed amounts, retained liquid, solid products, emitted gas and energy; refuse or defer a reaction if product storage has no room. This recommendation follows directly from the verified loss/creation paths above.
- Separate *what it is* from *how it is arranged*: quartz can be a crystal, gravel, sand or suspended fines; water content and packing change behavior without changing quartz into clay. This follows from the geological grain-size definitions cited below.
- Preserve the existing falling-powder framework while adding material data and calibrated movement rules. Full discrete-element simulation is not necessary to meet the user's intended observable behavior.

### Gaps

- I did not execute the failure cases; the parent is running the complete existing suite. Proposed conservation checks below should become reproducible tests before fixes.
- Every currently declared solid family is inventoried, but exact heat capacities, conductivity functions and individual mineral transformations were not independently validated for every entry in this pass.
- No physical tile volume or universal mass unit is currently specified in the audited code, so physical kilogram-level budgets require a declared scale before validation.

## How should sand, sugar, salt and processing chains behave in a defensible model?

### Takeaway

The essential distinction is between physical rearrangement, dissolving/precipitating, melting/freezing and chemical reaction. Most useful new gameplay comes from connecting those four processes to existing plants, rivers, furnaces and machinery.

### Cited Findings

**Sediment and wet grains.** Geological grain size and mineral composition are separate descriptions. The Wentworth scale places gravel above 2 mm, sand between roughly 62.5 µm and 2 mm, silt between 4 and 62.5 µm, and clay-sized particles below 4 µm. These are geological conventions; soil-science size boundaries differ. [USGS sediment nomenclature](https://pubs.usgs.gov/of/2006/1046/htmldocs/nomenclature.htm). Larger fragments require different transport conditions, and settling can separate sand, silt and clay-size fractions; fine clay-rich sediment is cohesive when wet. [Utah Geological Survey settling-container explanation](https://geology.utah.gov/map-pub/survey-notes/teachers-corner/teachers-corner-use-a-settling-container/).

Small amounts of liquid create capillary bridges and strengthen sand; too much liquid can destabilise it. One experiment found maximum strength at approximately 1% liquid volume, a result for its tested material rather than a universal constant. [Pakpour et al., original sandcastle experiments](https://www.nature.com/articles/srep00549). Numerical granular research finds sliding/rolling friction and particle/container geometry important for pile angle; density alone is not a suitable control. [Zhou et al., Physical Review E](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.64.021301).

**Sugar production.** Sugar beet already contains sucrose. A real producer describes slicing the crop, extracting sugar with hot water, clarifying with lime, filtering, concentrating/seeding crystals, and washing/drying the crystals. These provide a coherent crop-to-material progression. [British Sugar's production process](https://www.britishsugar.co.uk/about-sugar/how-sugar-is-made). Molasses and plant pulp remain useful co-products instead of disappearing. [Sugar Association processing overview](https://www.sugar.org/sugar/refining-processing/).

**Sugar physical behavior.** A producer's technical reference gives ordinary caster-sugar bulk density around 880 kg/m³, subject to handling and grain distribution. It describes temperature-dependent sucrose solubility, higher viscosity with dissolved sugar, freezing-point depression, and increasing sugar concentration in the unfrozen portion as ice forms. It also distinguishes caramelisation as chemical degradation and lists sucrose's conventional melting figure as 186 ± 4°C; continued heating can leave carbonaceous residue. [Nordic Sugar technical reference, pages 17, 21 and 52–53](https://www.nordzucker.com/de/wp-content/uploads/sites/2/2020/08/Functional_prop_on_tech_level_uk_2020.pdf). ICUMSA's official solubility specification is for pure crystalline sucrose in pure water and explicitly distinguishes saturation, supersaturation and undersaturation; impurities need separate treatment. [ICUMSA SPS-2 abstract](https://www.icumsa.org/methods/icumsa-specification-and-standard-sps-2-1998/).

Sugar should not have one falsely exact caramelisation switch. Original calorimetry reports heating-rate-dependent behavior and overlap between melting and decomposition, with degradation absent only under an extreme rapid-heating experiment. [2014 original calorimetry abstract](https://www.sciencedirect.com/science/article/pii/S0040603114002500). The practical model should integrate time spent hot, water content and sugar identity; a displayed temperature is a calibrated onset/range, not a universal reaction boundary.

**Salt and crystals.** Halite is sodium chloride. It forms extensive deposits when salt water evaporates. [USGS halite sample documentation](https://pubs.usgs.gov/of/2003/ofr-03-395/DESCRIPT/M/halite_hs433.html). USGS field observations link evaporation to halite crystallisation and fresh recharge to redissolution. [USGS Bonneville Salt Flats study](https://pubs.usgs.gov/publication/wsp2057). In a game, evaporation must remove water while retaining dissolved salt until excess precipitates; crystals must not be solvent converted into mineral.

**Glass and volcanic rock.** Quartz-rich sand requires roughly 1700°C to melt in the simple pure-silica case. Soda-lime glass uses silica, sodium carbonate to aid melting and limestone as stabilizer; pure silica glass is a different composition. [Corning's glass-manufacturing explanation](https://www.corning.com/worldwide/en/innovation/materials-science/glass/how-glass-made.html). USGS describes basalt eruptions at approximately 1100–1250°C. [USGS basalt-lava reference](https://www.usgs.gov/media/images/hot-basalt-lava-flowing-over-surface-a-cooled-basalt-lava-flow). Obsidian's familiar form is silica-rich rhyolitic volcanic glass, rather than every lava cooled by water. [USGS Yellowstone obsidian explanation](https://www.usgs.gov/observatories/yvo/news/yellowstones-tool-making-lava-flows). Thus Tidepool's declared basalt melt should not automatically purify quartz sand into soda-lime glass or turn into rhyolitic obsidian on quenching.

**Clay, lime and ceramics.** Fired brick starts from clay/shale-type feedstock and a firing process that bonds its particles. [Brick Industry Association technical notes](https://www.gobrick.com/resources/technical-notes). Moisture, drying and firing behavior affect the final product. [Brick Development Association quality guidance](https://www.brick.org.uk/better-with-brick/quality/clay-brick-quality). Quicklime and hydrated lime are different chemical identities: adding water to quicklime creates hydrated lime with heat and expansion; hydrated lime can absorb CO₂. [US Bureau of Standards Circular 189](https://www.govinfo.gov/content/pkg/GOVPUB-C13-971e3eedbc78437526a79f43e71b91eb/pdf/GOVPUB-C13-971e3eedbc78437526a79f43e71b91eb.pdf). The current game has the outline of this cycle, but quantities, moisture and atmospheric CO₂ consumption need accounting.

**Wood and iron.** FAO describes wood first drying, then thermally decomposing to char plus gases and condensable products. Product yield depends on temperature and feedstock; one reference gives about 33% charcoal mass yield from oven-dry feed at 500°C, excluding fuel burned for heat. This supports an explicit wood-moisture budget and incomplete conversion yield, not one block of wood becoming a full equal-volume block plus arbitrary smoke. [FAO carbonisation processes](https://www.fao.org/4/x5328e/x5328e05.htm). Ironmaking slag comes from ore gangue and fluxes, with composition and cooling affecting its properties. [USGS iron and steel slag](https://www.usgs.gov/centers/national-minerals-information-center/iron-and-steel-slag-statistics-and-information). Its quantity therefore should derive from input composition rather than a random one-third selection of converted ore tiles.

### Inferences

Suggested game-scale production chains, explicitly design proposals:

1. **Rock → weathering/crushing → graded mineral particles → river transport → deposition.** Preserve mineral constituents; give sand, silt and clay-size fractions different settling/cohesion. Moist sand is a moisture state; mud is water with sufficiently fine solids, not a new element made by touching sand.
2. **Sugar crop → extracted juice → concentrated syrup → crystals plus mother liquor.** Add one crop first (beet or cane), plant pulp, a filtering step and a crystallisation operation. Syrup should be a water/sugar mixture whose behavior follows composition, not another independent liquid with disconnected rules. Grinding changes crystal size, not sugar chemistry.
3. **Brine → evaporation → salt crystals plus remaining brine → redissolution.** The same mechanism should handle later evaporites using different solubility data. Keep multiple dissolved species when one crystallises.
4. **Quartz sand + soda ash + limestone → glass batch → viscous molten glass → glass.** Add actual sodium carbonate separately from wood ash; add cullet only when recycling has useful gameplay. Distinguish silica glass if making it without flux/stabilizer.
5. **Clay-rich feed → shaped wet clay → dry unfired clay → fired ceramic.** Drying is reversible by wetting; firing produces an irreversible material change in the intended range. Mud of arbitrary mineral composition must not automatically become identical brick.
6. **Wood/plant residues → drying/decay or oxygen-limited char production.** Moisture, organic carbon, ash and gas products connect this to the ecosystem. **Ore + reductant + appropriate heat → metal + composition-derived slag + gas** connects to machinery later; avoid an arbitrary ore-to-metal ratio.

These are qualitative production models for a game, not real-world operating instructions. Slow weathering, growth, drying and curing may be accelerated, but the acceleration should not create elements or reverse cause and effect.

### Gaps

- Precise salt and sucrose solubility tables, mixed-ion activity corrections, sediment settling calibration and individual ceramic/wood recipes require a curated data pass before implementation. Do not copy an unqualified number from a search snippet.
- The Nature sand paper, ICUMSA page and ScienceDirect calorimetry page had full-page access restrictions/timeouts; the indexed original abstracts were available. Their cited claims are limited to those abstracts, not unseen full texts.
- Exact honey sugar ratios, wax production and microbial transformations belong to the ecology report; honey must not simply be treated as pure sucrose when those processes are integrated.

## What should change first, and how can the result be tested?

### Takeaway

Repair representation and conservation first, then introduce a small group of connected materials and manufacturing steps. A much larger palette on the current model would multiply exceptions and hide the same defects in new reactions.

### Cited Findings

The existing state already preserves powder amounts through `held`, and the piling test checks exact grain totals ([powders.js:23](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/powders.js:23>), [simtest.mjs:1891](</C:/Users/jonas/Documents/tidepool 2/tidepool/tools/simtest.mjs:1891>)). This is a useful foundation to retain. The current material table has density, heat capacity and conductivity but no standardized composition, particle size, moisture, solubility curve or reaction-yield definitions ([matter.js:16](</C:/Users/jonas/Documents/tidepool 2/tidepool/js/matter.js:16>)).

### Inferences

**Proposed data contract.** Each real material should state identity/composition, density basis and units, heat properties, phase behavior, solubility relation and source/conditions. A granular state additionally needs dry-solid mass, grain-size class, packing/porosity, water content, friction/cohesion and erodibility. Use SI units in definitions and documented conversions to tile units. Packing density and particle density must remain distinct. Fine suspended particles should have conserved inventories separate from dissolved ions. Fantasy materials should declare where they supply or remove matter/energy and retain the ordinary rules elsewhere.

**Implementation sequence.**

| Priority | Deliverable | Valuable additions |
|---|---|---|
| P0 | Conserved solid/solute/water quantities and amount-aware heat/reactions; one route per transformation | No new palette items required. Fix loss/creation and remove conflicting sand rules. |
| P1 | Granular material definitions plus moisture, packing and sediment transport | Gravel and suspended/dry silt; clay-size particles and clay-rich slurry; wet sand as state. |
| P1 | Solubility-driven dissolution/crystal growth and retained mother liquor | Sugar crystals, syrup as a mixture, real salt crystallisation; distinguish sucrose from generic fermentable sugar as biology requires. |
| P2 | First complete natural production chain | Sugar beet or cane, juice, pulp/bagasse, molasses/mother liquor; crushing/extraction/filtering/concentration/crystallisation. |
| P2 | Consistent kiln and furnace chemistry | Soda ash distinct from wood ash; molten glass, dry clay and fired ceramic; composition-aware lime/char/ore conversion. |
| P3 | Extend only after budgets and ecological consequences hold | Humus/compost, graded gravel/mineral weathering, gypsum or other useful evaporites, recycled glass, ore mineral variants. |

**Acceptance checks proposed for the parent plan.**

1. Put quartz sand in fresh water for many simulated days: it wets, falls, can erode/redeposit, and remains quartz; total mineral mass is constant.
2. Pour dry and slightly wet sand into equivalent heaps: repose/cohesion differs according to material data. Flooding changes stability without converting grains into clay. Calibrate a defined test scene, not a universal slope copied from one study.
3. Put equal masses of coarse sand, silt and clay-size particles in still water: settling/suspension orders follow configured grain size and cohesion. Stirring can resuspend fines, then settling returns the same quantities.
4. Dissolve powder into 1, 10, 128 and 255 units of water, including near saturation: removed solid exactly equals added dissolved mass; excess stays solid. No clipping loss.
5. Compare cold and warm sucrose solutions against the selected temperature-dependent solubility table; cooling a supersaturated batch grows crystals without deleting the mother liquor.
6. Evaporate a salt+sugar solution, including traces and nearly equal quantities: capture steam, residue and all remaining solutes; each constituent's inventory closes within documented numerical tolerance.
7. Heat a 1-grain and a 255-grain sugar sample: product quantities and energy requirements scale with mass. Caramelisation does not create a full block from a pinch and cannot be undone merely by dissolving it back into pure sucrose.
8. Drop quartz sand beside basalt-temperature lava without flux: no automatic soda-lime glass. In a separately specified glass-batch test, all required ingredients and sufficient heat produce a compositionally consistent melt and cooled product.
9. Dry clay and then wet it: moisture state reverses. Fire it and then wet it: it retains its fired identity; arbitrary quartz slurry does not become clay brick.
10. Cycle limestone/quicklime/hydrated lime/carbonate in a closed mass-budget test, recording water and CO₂ consumption/release. Check both gas-tile and ambient-air paths.
11. Convert moist wood into char or burn it: count water, residual carbon, ash and gaseous carbon; no full-block mass amplification. Test poor product space rather than silently deleting emitted gas.
12. Save/restore partially wet mixed sediment, partially dissolved grains and mixed mother liquor, then continue: identity, amounts and subsequent behavior remain consistent.

Existing tests that intentionally preserve inaccurate behavior must be rewritten with explicit design notes. Historical puzzle solutions depending on those shortcuts should be retuned after the new real-world rules are agreed.

### Gaps

- These are proposed acceptance tests and implementation priorities, not implemented fixes or measured game-feel results.
- No timetable is inferred. The representation changes span snapshots, rendering, material definitions and several simulation passes, so they are broader than closing the remaining Phase 22 checklist alone.
