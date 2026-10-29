# Phase 22B: finite life cycles

Rules approved 29 October 2026. Preserve Phase 22A's uncommitted work.

## Player goal

Food, growth, offspring and decay have material costs. A shortage stops growth or exhausts
reserves; deaths retain their contents for recycling. Keep the current food chains and pixel UI.

## Inventory contract

Biology pools contain carbon, nitrogen and phosphorus (`c`, `n`, `p`). Carbon uses the existing
air-CO2 reference unit; dissolved CO2 is converted through the explicit Phase 22A gas reference.
Sugar is a glucose-equivalent substrate (60 carbon units per ingredient unit), ethanol has 20,
and acetate retains ethanol's carbon. These choices match the existing 3 O2 : 2 CO2 spirit reaction;
they are game-scale molecule equivalents, not grams or calibrated ABV. Stored plant sugar already
uses air-CO2 units. Nectar/honey ingredient units use the sugar conversion, including bee cargo.

Named archetype quotas are game defaults, not universal biological constants. The initial generic
biomass quota is 0.1 N and 0.01 P per carbon unit; each archetype has its own configurable entry.
Carbon reserves can vary independently of structural nutrients. Existing 6-carbon stems and
12-carbon seed reserves remain. A fish starts with one game day of expendable food reserve.

All generated, player-added and migrated stores are recorded as introductions. Natural feeding,
growth, offspring and recycling transfer existing stores. An offspring is charged only after
successful placement. Empty comb is explicitly empty; old zero-means-full comb migrates once.
Settled detritus is a sparse saved C/N/P pool at a tile; suspended sediment transport is later work.

## Rules and integration

- Pure pool arithmetic and tunables live in `js/ecology-core.js` and `js/ecology-data.js`.
- `js/ecology.js` adapts pools to water, air, organisms, tissue, sediment and diagnostics.
- Plants and algae need carbon and mineral N/P for new biomass; leaves, flowers, seeds and tree
  regrowth are paid. Photosynthesis and respiration exchange measured carbon and oxygen.
- Animals consume real food and reserves. Predation transfers prey contents once. All mortality
  routes settle remaining biomass and cargo. Reproduction transfers parental stores.
- Detritus and soil organic matter are finite. Aerobic decay spends oxygen and returns CO2,
  ammonium and phosphate; anoxic methane production also spends organic substrate.
- Fermentation partitions sugar carbon between yeast, ethanol and CO2. Mineral shortages stop
  microbial growth, not the metabolic activity of existing yeast. Acetate gets its own carbon
  channel while the existing acid channel continues to indicate acidity.
- Snapshot schema 3 preserves all pools and migrates old channel strides and initial endowments.
  Inspection text shows reserves, nutrients and settled organic matter.

Fantasy salamanders/slimelings retain their declared fantasy energy behavior. Full elemental
chemistry of every older mineral/industrial reaction and the hot-sponge heat fix remain separate.

## Tunables and units

The source of truth is `js/ecology-data.js`; these are balancing defaults, not measured species data.

| Tunable | Default | Unit / effect |
| --- | --- | --- |
| Game day | 10,800 | simulation ticks |
| Biomass quota | N 0.1, P 0.01 | mineral units per carbon unit |
| Fish body / reserve / maintenance | 12 / 10.8 / 0.001 | carbon; carbon; carbon per tick (one day of food) |
| Pike body / reserve / maintenance | 24 / 14.4 / 0.002 | carbon; carbon; carbon per tick |
| Bee and moth body / reserve | 2 / 1.2 | carbon; reserve covers one day at default maintenance |
| Bird body / reserve | 6 / 4.8 | carbon; reserve covers 14,400 ticks |
| Starvation grace | 300 | ticks after reserve exhaustion |
| Stem / leaf / flower / seed reserve | 6 / 3 / 1 / 12 | carbon costs, with tissue N/P quotas |
| Wood / moss / wax | 40 / 3 / 2 | carbon per full block |
| Sugar and honey / ethanol | 60 / 20 | carbon per ingredient unit |
| Bee load / minimum nectar | 0.2 / 0.02 | ingredient units per trip / useful flower visit |
| Initial soil organic C / N / P | 2 / 1 / 0.1 | finite stores per soil tile |
| Initial water N / P | 3 / 0.3 | mineral units per full water carrier |
| Algae and yeast starter banks | 5 each | biomass carbon per world, independently saved |
| Decay base / scaling | 0.02 / 10 | carbon per ecology update, multiplied by max(1, available C / 10) |
| Aerobic / anaerobic yeast yield | 0.10 / 0.05 | fraction of consumed sugar carbon allocated to biomass if nutrients permit |
| Denitrification donor | 1.25 | organic carbon spent per nitrate-N unit |

Algae maintenance/growth/death fractions are 0.001/0.005/0.002 per algae update. Freshwater algae
stop below 8°C and die above 40°C or at salinity-channel values above 50. These thresholds describe
this game archetype, not all algae. Microbial decay stops outside 0–45°C. Ecology settlement runs
every 16 simulation ticks; some substrate reactions also run in their existing material updates.

## Ownership, transport and edge cases

Each plant has a persistent identity. Replacing its root ends that plant and settles its owned
tissue; an old stem cannot become the new plant's tissue. Rejected births retain parental stores.
Food consumed beyond storage capacity becomes retained waste. Empty food does not reset hunger.
Finite pools survive freezing, death, predation, harvesting and placement; hive, bag, bucket,
pump and underground river stores are included in inventory checks. Fractional honey that cannot
fit a whole liquid carrier unit waits rather than disappearing through integer truncation.

Methane waits in a saved pool until headspace is available, even after substrate exhaustion.
Visible oxygen-gas carrier units are coarse: respiration withdraws whole units and retains the
unused fraction as saved oxygen credit. This bridges existing gas storage without granting free
oxygen. Dry nutrient recycling routes minerals to supporting soil/water for later root uptake.
Charcoal retains the source organic pool and burning spends that finite pool.
Nutrient-bearing water can emit vapor through a continuous water column into available headspace;
this abstracts bubble transport while preserving parcel energy and retaining nonvolatile solutes.
Solid roofs and other liquid phases block this route. A precipitated salt crust can also block a
narrow vent; clearing that deposit permits further drying without destroying its salt.

Legacy schema-1/2 saves receive explicit biological endowments and channel-stride migration.
Schema-3 saves preserve all pools. Player painting, spawning and deleting are external inventory
changes; biological growth and feeding are internal transfers. Introductions are not food sources
that repeat each tick.

## Feel and player checks

- Inspect a fish, let food run out, and observe its reserve decline; replenish algae and check recovery.
- Grow plants with light, water and N/P; remove phosphate and check growth stops when stored P runs out.
- Compare clean mineral mud with organic mud under oxygen-depleted water; only the organic bed has fuel for methane.
- Let bees collect nectar, then inspect the hive; an empty hive cannot feed them.
- Save, harvest and place food/tissue, then reload; stores should retain their quantities.

Interactive feel is for the user's playtest. The browser connection in this session blocked the
local file URL; headless rendering and startup checks cannot establish interactive controls or feel.

## Remaining limits and 22C

This phase closes the implemented biological C/N/P transfers, not every atom in the world.
Hydrogen/oxygen atom inventories, reaction-water volume, displaced-air pressure, industrial and
mineral reaction yields, and smoke identity still need further work. Soil adsorption, dissolved
organic transport and sediment biology are coarse. Generated habitat food supply and species
balance need long-duration multi-seed tests. No ten-day, multi-seed ecosystem gate or 60-fps claim
is made here. Later powder/mineral processing remains outside 22B.

## Acceptance and verification

Check C/N/P before and after feeding, failed/successful births, growth, predation, every death
route, decay, fermentation and save/load. Compare fed/unfed and nutrient-present/absent controls.
Sterile mineral sediment cannot consume oxygen or make methane. Empty comb cannot reset hunger.
Use seeded fixtures and explicit floating-point tolerances. Run focused checks, quick scenes,
the complete simulation suite, build and rendering; record browser/performance limits honestly.
The multi-seed ten-day ecosystem gate remains Phase 22C.

### Verification record, 29 October 2026

- `node tools/check-ecology.mjs`: 208 passing checks for pure transfers and integrated C/N/P,
  finite food, mortality, paid offspring/growth, decay, fermentation, transport and migration.
- Accounting: 51 checks; oxygen: 26; thermal: 144; devices: 157; life diagnostics, local
  crowding, causal hypoxia and the aerated control all pass.
- First full run: 81 scenes / 391 checks in 970.3 seconds, with 385 passing and six failures.
  The raw log is retained as `research_notes/Tidepool living world audit/phase22b-full.log`.
  This was followed by fixes and affected-scene reruns, rather than presenting the first run
  as green. Plant fixtures now supply finite N/P; marsh-gas fixtures supply organic substrate
  and anoxia; sunlight uses a matched shade control; salt drying counts conserved crystals.
  The actual production defect was nutrient-bearing submerged water being unable to boil;
  its vapor route now has direct carrier/component/enthalpy and blocked-outlet checks.
- In the full run the balanced sealed jar retained both original fish and both plants through
  two days (water oxygen 6.4 mg/L). The overfed jar reached an algae bloom of 255, then lost
  both original fish with recorded hypoxia. Their deaths occurred in daylight; this is not
  evidence that overfeeding necessarily causes a nighttime kill. A separate controlled
  nighttime hypoxia scene and its aerated control pass.
- The latest puzzle rerun passes every success/failure route across all nine levels, including
  the cauldron's unchanged ten-tile tonic goal. The crystal-vent and weather controls pass.
- All six initially failing behaviors now pass on affected-scene reruns. The final quick run
  passes 109 checks across 25 scenes in 108.5 seconds. Additional current-source reruns pass
  the marsh-gas scene (5 checks), weather (3), honey/still scenes (7), and material/porous-store/
  coolant-boiler scenes (26). The plant rerun passes all three growth/wilt/burning checks.
  Logs are named `phase22b-quick-final.log`, `phase22b-mud-final.log`, `phase22b-weather.log`,
  `phase22b-heat-final.log`, `phase22b-materials-final.log`, `phase22b-plants-mud.log` and
  `phase22b-regressions.log` in the audit research folder. Some intermediate combined logs
  retain an earlier mud failure; the final mud log supersedes it. This is a full run plus
  targeted reruns, not a claim that one final invocation of all 81 scenes was green.
- Build: 57 modules, about 563 KB. Bundled initialization schedules its first animation frame
  under browser stubs; a seed-7 headless frame renders successfully. These do not verify
  interactive play. The connected browser blocked the local file URL.
- The reference snapshot scenario round-trips exactly and produces a 475 KiB world code,
  below its 512 KiB budget. Typed snapshot arrays use about 14.4 MiB per entry (about 173 MiB
  for twelve entries), plus saved object pools and JavaScript overhead.
- A quiet 400-tick `node tools/profile.mjs 400 --hot` sample measured 29.00 ms mean / 22.67 ms
  median simulation steps, and 28.23 ms mean / 19.66 ms median renders (every other tick).
  The 95th percentiles were 51.84/33.37 ms, with 816/931 ms worst spikes; generation took
  2,396 ms. No simulation-test workers ran concurrently. Raw output is
  `phase22b-performance.log`. Earlier unchanged-source samples varied substantially, so this
  does not establish a reliable speedup, browser frame rate or responsiveness gate. Lighting,
  simulation traversal, heat and momentum remain prominent costs for 22C profiling.
- Code review found no remaining significant issue in the finite-life integrations or the
  final submerged-vapor fix. Changes remain uncommitted as requested by the working workflow.

Research: EPA nutrients https://www.epa.gov/caddis/nutrients ; variable phytoplankton stoichiometry
https://pmc.ncbi.nlm.nih.gov/articles/PMC5880891/ ; yeast metabolism/fermentation
https://thesis.library.caltech.edu/4462/3/Hannoun_b_1988.pdf .
