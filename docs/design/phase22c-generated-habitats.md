# Phase 22C: generated habitats and winter hives

Continuation requested on 29 October 2026 after the designed-jar milestone in
[`phase22c-ecosystems.md`](phase22c-ecosystems.md). Earlier verification records remain historical
evidence for their source rules. This continuation addresses generated food supply, retained
habitats, actual movement to refuges, flowering plants and finite winter shelter. It does not
claim universal species calibration, perpetual stability or full mineral/industrial atom closure.

## Observed causes

- Generated stocked habitats received only a few carbon units from the finite airborne algae
  bank, while their fish needed over a hundred carbon units per day. The designed jar instead
  began with 1,600 units of producer biomass. Pump-off controls still starved, isolating food
  supply from machine intervention.
- The demo pump increased stranding. Even with weather disabled and the pump off, the starter
  lake shrank: nearby porewater gained roughly 98 full-cell equivalents and seeded algae moved
  into separate downhill pools. The old carve lining omitted above-ground openings where the
  lake crossed a sloping surface.
- Stranded fish searched for any liquid amount, including one-unit films on dry banks. Warm
  fish could remain in hot shallows despite connected cool water. A freshly spawned pike also
  hunted after its first tiny maintenance debit, while almost all its reserve remained.
- A plant could exhaust the mineral store of its single supporting tile despite connected,
  nutrient-rich soil nearby. Dry meadow starts did not reliably supply flowering plants.
- Returning to comb did not protect bees from cold. After funded heating was implemented,
  new nectar production exposed bees getting stuck behind trees on their return journey.
- The first seasonal run still lost all fish in seeds 73 and 31337 to starvation by days
  3.125 and 3.375. The opaque demo tank shaded roughly 60–62% of otherwise available lake
  daylight. A copied-grid ray check isolated the tank's contribution without changing the
  observed worlds. The tank is changed to glass so the existing optical rules admit sunlight.
- The glass source then retained fish until days 6.375–7.5, but all three populations
  ultimately starved. At 8–15°C the old rules halved only algae growth: even fully illuminated,
  nutrient-unlimited, oxygen-replete water on the normal day/night cycle retained at most
  13.1% of its algae per day before grazing. Fish
  still required their full warm-water maintenance. The remaining lakes had ample minerals,
  deep cool water and oxygen; tiny positive algae totals could not pay the grazers' demand.
- Seed 7's original forest seedlings had no root-reachable water. They exhausted their seed
  sugar without growing or flowering. Bees survived on stored honey but could not collect
  nectar from these drought-stalled plants. This is separate from the corrected flight paths.
- The exposed-bank moisture control uncovered legacy erosion transfers that discarded or
  changed dissolved biological quantities. Both ordinary and sterile reproductions isolate
  this from the initial moisture endowment itself. The repaired transfer paths retain the
  actual carrier, ingredients and modeled sensible/latent energy.
- The subsequent full season retained all three fish populations and all three original bees,
  but seed 73 failed final-day plant production. An exact replay matched all 65 observations:
  mature owned leaves plus a flower enclosed the stem's three-cell air lookup despite fresh
  air at their exterior faces. Later, the bank roots were also a row too high for the receding
  lake. The saved failed world's canopy resumed photosynthesis after the air-access repair,
  drawing existing CO2; its genuinely dry neighbor remained stressed.
- Healthy growth then exposed a separate nest-access gap. A paid natural offspring at
  (470,38) sealed the original seed-7 nest's narrow corridor. The bees correctly attempted
  to return with food, but their exterior air component could not reach the comb. In a copied
  grid, opening one owned leaf restored access; removing only the ice did not. Two horizontal
  comb cells preserve the same starting inventories while extending the existing seed-spacing
  protection and keeping an outer air face beyond nearby tree-growth envelopes.

## Resource and movement rules

Generated, actually stocked water habitats receive a one-time algae endowment up to concentration
20 in illuminated, freshwater, thermally suitable cells. Additions use actual carrier amounts
and record all C/N/P introductions. Existing denser algae and the finite airborne bank are
retained. The saved generation marker prevents depletion or loading from triggering another
endowment; older saves are not silently restocked.

The demo pump and its linked lever start off; the player can switch them on. Its initially
empty component buffer, temperature and latent energy are explicit so snapshots round-trip.
The demonstration tank uses glass walls and floor to transmit daylight to the lake below;
the pump outlet remains an opaque machine. Its geometry and manual operation are retained.
The starter lake receives a clay lower rim at generation. This preserves its open top and
initial water, and does not repair later player-made breaches or refill the lake during play.
Watered bank plants are finite initial seeds, with their normal recorded seed inventories.
Placement prefers the lowest initially dry, daylit supported sites with real initial air,
while preserving all existing water and clay. This extends their useful reach during normal
drawdown without enlarging roots, repairing later breaches or adding more seeds.

Fish recovery seeks water deep enough for the body and open descents up to two rows below.
It does not remove the stranding limit or teleport the fish. Water directly below calls for
falling rather than jumping away. Recovery remains a local search, not general pathfinding.
Ordinary fish and pike steer toward better adjacent water outside a 5–35°C game comfort band;
the existing lethal heat threshold remains 45°C. Walls and insufficient water block a refuge.
Without a real accessible refuge, exposure can still kill.

Pike begin hunting when their reserve falls below half its ordinary target. This provides a
meaningful food-demand margin; a single maintenance debit no longer triggers a kill. Digestion,
paid offspring and complete finite prey transfers remain in place. These thresholds describe
the game's archetypes, not universal fish physiology.

Roots can withdraw existing minerals through four-neighbor connected dirt, wet dirt and moss
within three soil steps. Rock, gaps and world edges interrupt access. More source tiles extend
reach without multiplying the old total uptake budget: 0.1 N and 0.01 P per plant update.
Stem, leaf, flower and nectar costs are unchanged. Exhausted soil stays exhausted.

Mature plants retain their ordinary direct air-face choice, then search a bounded connected
component of their own current stem, leaf and flower tissue for real empty face-adjacent air.
Rock, liquid, foreign ownership and stale tissue tags block traversal. Existing oxygen/CO2
helpers still debit that actual cell. A sealed or oxygen-starved plant can still fail; paid
leaves no longer make an otherwise exposed plant unable to breathe. Open roots skip a
nonwithdrawable one-unit film when usable water is farther within their existing reach.

Existing forest/jungle seedlings receive a finite initial rooting-water buffer in eligible
dry dirt: at most 21 cells per seed within three columns and three rows below its root,
255 carrier units per cell. Existing water, ingredients, non-soil materials and overlapping
patches are preserved. The exact initial addition is recorded in
`accounting.woodlandMoistureIntroduced`; a saved marker prevents another endowment.
No nectar or nutrients are supplied by this operation. Wet dirt also accepts ordinary paid
seeds, so watering a planting bed does not make it reject seedlings.

Wet-bank erosion releases actual porewater and its components before removing the bank.
Slumps obtain their mud carrier from existing pore/river water; impossible or fractionally
unrepresentable transfers wait. Mud washing and settling reclassify retained parcels rather
than deleting their ingredients. Packed beds retain their water as wet dirt. Existing soil
inventories become finite settled detritus when the bank disappears. Phase changes rebase
temperature against the game's current capacities to retain modeled energy. These repairs
do not establish calibrated mineral grain quantities or sediment thermochemistry.

Cold aquatic activity now uses `min(1, 2^((temperature - 20)/10))`: 1 at 20°C,
0.5 at 10°C and 0.25 at 0°C. The same factor paces algae production, respiration and
dark/cold loss, replacing the growth-only cold penalty. Fish and pike maintenance use it
while their center occupies actual water. Their unpaid metabolic debt remains carbon,
with the same energy threshold; temperature changes never forgive old debt. Oxygen limits,
the 8°C algae growth cutoff, lethal heat/salt and ordinary stranding remain active. Warm
rates are capped at their prior values. These shared Q10/reference/cap choices are game
archetype assumptions, not a universal physiological fit.

Clear ice admits daylight through the existing binary optical model. Snow and rock still
block it, and photosynthesis still requires actual CO2 and mineral nutrients. This does not
model ice thickness, snow attenuation, species acclimation or detailed spectral transmission.

Natural seed spread also respects occupied hive flight space, extending the existing plant
spacing rule to a potential stem/leaf envelope beside comb. Rejected placements retain the
parent's full resources. Direct seed placement remains possible, and existing plants can
still physically block a hive; ordinary ticks do not clear or suppress them. Generated nests
are placed away from already-seeded plants' future growth. Their two cells project horizontally
from the trunk; the outer entrance is beyond every nearby wood cell's two-tile leaf-growth
envelope. Both cells participate in natural seed spacing and initial growth-envelope checks.

## Winter shelter

Bees physically beside their hive spend connected comb honey and actual local oxygen to warm
real air. Carbon becomes measured CO2 through the existing respiration helper; honey N/P
return to retained mineral stores. Heat is credited only for paid metabolism, wakes the normal
heat solver and diffuses/cools through the existing grid. Empty or anoxic comb supplies no
heat; limited oxygen limits heating. Bees without physical comb-face access cannot draw
that energy. Cold and stale-air mortality remain active.

Named game tunables are `hiveTarget = 12°C`, `hiveBurn = 0.001 C/bee/tick` and
`hiveJoulesPerCarbon = 200`. These are explicitly game-scale shelter/power choices, not measured
bee calorimetry or brood-core targets. Connected comb traversal is bounded to 64 cells and
respects world edges. Foraging weather is sampled outside the immediately heated comb faces,
so local shelter warmth does not masquerade as spring. Returning bees must physically reach
the comb-face air to benefit. Normal body reserves and maintenance remain separate from the
additional honey metabolism used for heating.

Bee flight follows bounded, cached paths through actual empty air cells for both flowers
and home. Ordinary body collisions still apply. Collection/deposit/feeding require actual
flower/comb face access rather than proximity to an intermediate waypoint. Failed searches
are cached briefly and retried; an inaccessible nest supplies no remote food or warmth.
The route is ordinary saved bee state. Cargo fullness uses the existing small numeric
tolerance for behavior while retaining the exact fractional food amount.

The search uses deterministic A* within the same 2,048 discovered-cell budget and 40-tile
bound per axis. The earlier uniform search could exhaust that budget on an unobstructed
35-tile return. Cached next steps are rechecked after advancing a waypoint; changed destination
faces invalidate stale paths. Flowers with no empty approach face are excluded from selection
and cached-target reuse. A physically sealed nest remains unreachable.

The mechanism follows cluster thermoregulation and honey expenditure described by
[Purdue Extension](https://ag.purdue.edu/department/extension/ppp/resources/ppp-publications/mobile/ppp-116-pol-91.html)
and [UF/IFAS](https://ask.ifas.ufl.edu/publication/IN1006). Queen/brood/pollen, disease, detailed
cluster insulation and cold-limited travel between honey cells remain outside this game model.

Primary experiments support temperature-dependent aquatic photosynthesis/respiration
([Vona et al., 2004](https://nph.onlinelibrary.wiley.com/doi/10.1111/j.1469-8137.2004.01098.x),
[Coles and Jones, 2000](https://www.usgs.gov/publications/effect-temperature-photosynthesis-light-response-and-growth-four-phytoplankton-species)),
fish metabolic responses and acclimation
([Sandblom et al., 2014](https://royalsocietypublishing.org/doi/10.1098/rspb.2014.1490)),
and photosynthesis beneath lake ice, modulated by snow cover
([Garcia et al., 2019](https://pmc.ncbi.nlm.nih.gov/articles/pmid/30626619/)). They do not
establish the game's shared numeric factor or its species-independent thresholds.

## Acceptance and evidence

Focused controls cover finite initial endowments, exclusions, save/load, bank breaches,
connected root budgets, paid flowering, reachable versus absent refuges, satiated versus
hungry predators, fractional honey/oxygen, blocked respiration, fed/unfed winter hives and
physical routing around obstacles. Every new pool uses existing ecological inventories or
ordinary saved state; no new unsaved per-tile fields are introduced.

The generated-world acceptance horizon is eight actual game days (one full seasonal cycle),
with seeds 7, 73 and 31337, sampled fish persistence and continued producer activity, retained
living plants, finite nonnegative stores, recorded fish/pike/bee births/deaths and no post-setup
biological endowment injections. Initially stocked hives must retain bees and collect real
nectar. Outdoor atmosphere/weather exchanges are reported boundaries, not a sealed-jar
experiment or a claim of closure for every legacy material reaction. Controls and pure
falsification tests must reject missing food, malformed counter maps, unrecorded population
changes and repeated endowments.

The headless gates passed on 30 October 2026. The verified runtime digest is
`8547d33396ba9a1d8ce43fc15b45571ef0a55ed8ee2e57145ee8dc59639a3915`.
Durable results and source hashes are in
[`phase22-world-manifest.json`](../../research_notes/Tidepool%20living%20world%20audit/phase22-world-manifest.json).

| Verification | Result |
| --- | --- |
| Eight-day generated worlds, seeds 7 / 73 / 31337 | 78 acceptance checks; `completionGate: true`; final fish 22 / 15 / 14, plants 9 / 3 / 3, algae retained and positive final-day air and aquatic photosynthesis |
| Initially stocked hive, seed 7 | All three original bees survive; 1.818074 nectar units collected; 8,499.838 game J of honey/oxygen-funded heat |
| Ten-day balanced jars, same seeds | Final fish 5 / 4 / 6, plants and algae retained; maximum C/N/P drift 1.164e-9 / 3.865e-12 / 2.061e-13, water drift zero |
| Complete jar suite | All six cases and 109 acceptance checks pass; dark runs ten days, unfed 1.25 days and overfed two days; adverse controls lose their fish |
| Regression scenes | 81 scenes / 393 checks pass before the final hive-only edits; five affected scenes pass again after those edits |
| Focused checks | 21 tools pass, including 51 exact sky frame/state comparisons; detailed counts in `phase22-world-focused.log` |
| Build and startup | 59 modules, 603.2 KB; compiled initialization and first animation frame pass under DOM/canvas stubs; headless frame retained |

The seasonal and jar JSONL, focused and regression logs, profiles, image and causal failure
traces are retained under `research_notes/Tidepool living world audit/phase22-world-*`.
Failed diagnostic runs remain identified as failures; they are not completion evidence.

Quiet 400-tick profiles give mean step/render times of 6.30/6.39 ms (calm), 9.56/18.18 ms
(storm), 6.77/6.39 ms (burning), and 6.91/6.39 ms (crowded). Storm rendering still exceeds
16.7 ms, and occasional long frames remain. These results do not establish 60 fps.
Interactive playtesting remains unverified: the Windows computer-use URL policy guard
stopped browser interaction. Browser responsiveness and player feedback remain open Phase 22
acceptance work, distinct from the passing headless gates.

### Budget scope and the Phase 23 handoff

The outdoor gate verifies stable **recorded** introduction/removal counters after setup; it
does not prove global C/N/P closure. Phase 23 auditing found pre-existing bloom-to-moss
reactions that add implicit biological stock without recording an introduction: in 256 steps,
seeds 7 / 73 / 31337 create 4 / 6 / 7 moss cells, each implying 3 C / 0.3 N / 0.03 P.
This limits the outdoor result and motivates a separate declared fantasy budget. The ordinary
closed jars contain none of these magical materials; their conservation results still apply.
Industrial/mineral elemental closure, magical energy and outdoor atmospheric/weather
boundaries also remain outside the closed-jar claim.
