# Phase 22C: demonstrate a living ecosystem

**Resumed at the user's request, 29 October 2026.** The prior paused checkpoint is recorded in
[`../PHASE22C_HANDOFF.md`](../PHASE22C_HANDOFF.md). Its unchanged rules lost every fish in
one balanced seed by day 5.875; the continuation corrects feeding before repeating the gate.
The designed-jar milestone below is a historical verification record. Continued generated-world
and winter-hive work, with its latest verification, is recorded in
[`phase22c-generated-habitats.md`](phase22c-generated-habitats.md). Interactive responsiveness
and player feedback remain open. Phase 22 is not marked fully complete.

Continuation of the Phase 22 scope requested on 29 October 2026. The research audit's ten-day
gate is an acceptance horizon, not a claim of indefinite stability or universal species balance.

## Player goal and existing rules

A designed closed habitat sustains actual food production and ordinary organisms through
repeated days and nights. Shortages and collapse must have physical resource causes. Preserve
22B's finite C/N/P pools, paid growth/reproduction, and recorded mortality. Light and heat may
cross a sealed jar; matter may not be replenished during its run. Existing fantasy exceptions
and the separate material-processing expansion remain outside this phase.

Initial implementation focuses on repeatable evidence and correction of existing defects.
Generated habitats are inspected for actual connected water, light, food, reserves and nectar
flow before changing their stocking. The named cave lake can open to daylight through its
carved geometry; a label does not establish whether a particular seed has a dark food web.

## Data and acceptance choices

`tools/ecosystem-data.mjs` is the source for regression defaults. These are explicit test choices,
not biological constants or a newly imposed global population cap.

| Setting | Default | Meaning |
| --- | --- | --- |
| Horizon | 10 game days | 108,000 actual fixed simulation steps |
| Fixed seeds | 7, 73, 31337 | independent seeded stochastic trajectories |
| Population range | 1–8 fish | viable designed-jar range; natural turnover is permitted |
| Sampling | 8 times/day | resource/population records every 1,350 ticks |
| C/N/P tolerance | 0.0001 units | maximum absolute drift, with all boundary transfers exposed |
| Water tolerance | 0.00001 carrier units | maximum closed-water drift |
| Unfed horizon | 1.25 days | exceeds the existing one-day reserve plus starvation grace |

The jar reuses the earlier two-day scene's geometry and initial stores: 80 full water tiles,
20 algae units and 10 nitrate units per water tile, two plant seeds, two fish, finite soil and
water nutrient endowments. The exact starting inventory is logged. Nothing is added after setup.
Dark, unfed and overfed cases declare their changes before the initial sample. Removing an
inoculum from the unfed control is a recorded setup removal, not an ongoing intervention.

The long-run evaluator requires retained C/N/P and water, no subsequent introductions/removals
or atmospheric top-ups, finite biological stores, and birth/death counts matching population
changes. Balanced runs require fish and plants, remaining algae and measured air/water carbon
fixation, including during the final day. The dark control must stop photosynthetic fixation
and draw down algae. Unfed fish must starve. Oxygen is reported in mg/L, with local death records;
sampled minima do not establish an exact daily minimum. Full H/O atom closure remains separate.

## Logic, integration and presentation

- `tools/ecosystem-metrics.mjs`: pure acceptance logic. Its focused checks deliberately introduce
  lost matter, external replenishment, leaks and unrecorded deaths and require rejection.
- `tools/check-ecosystem.mjs`: deterministic bounded-worker runner using the real `step()`;
  JSONL checkpoints and results retain budgets, reserves, detritus, nutrient/gas observations,
  photosynthetic production, births and mortality causes.
- `tools/inspect-habitats.mjs`: generated-world observations grouped by connected water habitat,
  with light, food and per-animal reserves. Honey stock and actual nectar collection are distinct.
- `js/oxygen.js`, `js/ecology.js`: counters record actual carbon fixed into air-fed plants and
  aquatic producers. Counters do not grant resources.
- Existing hover text continues to display food days and starvation. New diagnostics are kept
  in the test reports rather than added as technical controls to ordinary gameplay.

An observed defect allowed negligible meals to clear starvation despite unpaid maintenance.
`metabolicDebt` now retains the unmet carbon cost. Food clears it only through paid respiration;
the existing 300-tick grace remains the threshold in equivalent unpaid-maintenance ticks.
The debt is stress bookkeeping, not negative biomass. It survives ordinary body snapshots;
legacy saved starvation counts convert at the organism's existing maintenance rate.

### Feeding correction

The original fixed bite could remove an arbitrarily dilute local algae population in a single
encounter. Fish now request `BITE * A² / (K² + A²) * carrier / 255`, where `A` is the local
algae concentration and `K = ECO_RATE.grazeHalf = 20`. The existing 2% encounter chance,
maximum bite of 2, appetite limit, maintenance costs and paid reproduction remain. There is no
minimum biomass floor or added food. Sparse algae can still be eaten, but grazing falls
quadratically as searching becomes less productive. A full water tile at concentration 20
provides half the maximum bite; fractional carriers provide proportionately less.

Pike retain their digestion delay and resume hunting below their ordinary reserve target
(`body + reserve`, 38.4 carbon units). Finishing digestion alone no longer justifies consuming
prey while surplus reserves remain. Caught prey still transfers its complete existing stores.

These are explicit game-archetype assumptions, not measured fish-species parameters. Type III
responses have empirical support in some plankton grazers; applying this response to Tidepool's
generic algae-eating fish is a balancing choice. It does not imply universal behavior or
indefinite stability. `tools/check-feeding.mjs` checks dilute/dense/sterile water, partial
carriers, the ordinary creature update, satiated/hungry pike and conserved C/N/P.

The first ten-day feeding trial retained producers and conserved its stores, but two balanced
seeds exceeded the specified population range (sampled maxima 10 and 11 fish). It is retained
as failed evidence, not a completed gate. Review also found that paid births could leave the
parent with its structural body and no food reserve. Ordinary births must now retain the
parent's existing one-reserve target after paying the child's full body, reserve and nutrients.
For fish the required carbon becomes 45.6 rather than 34.8. This introduces no population cap,
food source or change to child endowment. It is an explicit game rule for repeated reproduction;
focused success/failure tests and a fresh long run are required before treating it as verified.

Retaining parental reserves alone still exceeded the population gate (seed 31337 reached nine
fish before day six). The local spacing rule also used different axis extents: 64 pixels
horizontally and 32 vertically. It now uses 64 pixels in both directions, with the existing
four-fish local threshold and 30-fish world limit unchanged. Rotated layouts therefore have
the same crowding rule; distant populations do not count. This is a game spacing choice,
not a calibrated density law or a new global cap. As before, nearby disconnected water bodies
can count in the same neighborhood; connected-habitat population accounting is later work.

Three small performance changes avoid traversing sleeping liquid chunks, unnecessary spore
sky rays when finite banks cannot pay, and repeated volatile-channel membership tests. They
must retain cell/RNG order and produce the same full saved state as the reference implementation.
`tools/trace-world.mjs` records a deterministic digest; timing comparisons require quiet runs.

## Verification commands

```text
node tools/check-ecosystem-metrics.mjs
node tools/check-feeding.mjs
node tools/check-ecology.mjs
node tools/check-ecosystem.mjs --days=10 --seeds=7,73,31337 --jobs=3
node tools/check-ecosystem.mjs --days=10 --seeds=7 --case=dark
node tools/check-ecosystem.mjs --days=1.25 --seeds=7 --case=unfed
node tools/check-ecosystem.mjs --days=2 --seeds=7 --case=overfed
node tools/inspect-habitats.mjs --seeds=7 --ticks=13500
node tools/simtest.mjs --full --jobs=4 --progress
node tools/profile.mjs 400 --hot
node tools/build.mjs
npm run test:ecosystem
```

Preliminary logs named `baseline` or `correction` were stopped after the inadequate-meal
starvation defect was found. They are diagnostic history and are not completed ten-day gates.
Final results, performance limits and interactive-play status will be recorded after verification.

## Research and interpretation

Photosynthesis and respiration produce daily dissolved-oxygen variation; decomposition also
consumes oxygen. Low oxygen often occurs near dawn, but timing is measured rather than forced
by a test name. [USGS daily water-quality variation](https://www.usgs.gov/centers/new-jersey-water-science-center/science/diurnal-variations-water-quality-surface-water),
[EPA dissolved oxygen](https://www.epa.gov/caddis/dissolved-oxygen).

Dark cave food webs depend on incoming organic material and other organisms; ordinary
photosynthetic growth needs light. This informs habitat inspection without assuming every
carved lake is dark. [National Park Service cave ecology](https://home.nps.gov/grba/learn/nature/cave-life.htm?mobile-app=true&theme=false).

The functional-response form and its search-efficiency interpretation are described by
[Freilich et al. (2021)](https://bg.copernicus.org/articles/18/5595/2021/).
[Sarnelle and Wilson (2008)](https://www.wilsonlab.com/wp-content/uploads/2021/11/2008_Ecology_Sarnelle_and_Wilson.pdf)
measured reduced clearance at low phytoplankton densities in Daphnia; this supports the mechanism,
not the game's fish archetype or its numerical half-response setting.

Player feel and a browser playthrough remain distinct from headless tests. No short headless
profile establishes a browser frame rate. Later chemistry/mineral/powder work is still required
for the broader real-material world.

## Designed-jar milestone verification — 29 October 2026

The final feeding, parental-reserve and local-spacing rules complete all three balanced
ten-day trajectories with the original acceptance thresholds. Each run retains two plants,
measured algae and photosynthetic production during the final day. These are designed-jar
results, not indefinite stability or evidence that generated habitats are balanced.

| Seed | Fish at day 10 | Sampled fish range | Algae carbon at day 10 | Recorded fish losses |
| --- | --- | --- | --- | --- |
| 7 | 4 | 2–6 | 48.5383 | 5 hypoxia |
| 73 | 4 | 2–5 | 52.9730 | 4 hypoxia |
| 31337 | 5 | 2–6 | 51.1865 | 3 hypoxia |

Mortality and paid offspring represent turnover; this is not a claim that the original fish
all survive or that oxygen never falls below a stress threshold. Sampled oxygen minima are
2.45, 2.14 and 2.20 mg/L respectively, not exact daily minima or proof of death timing.
Across these balanced runs, maximum absolute drift is below 1.3e-9 carbon, 3.0e-12 nitrogen
and 1.8e-13 phosphorus units. Water drift is zero; introductions, removals and atmospheric
top-ups remain unchanged after setup. Final-day air/water fixation is positive in every seed.

The final suite finishes all six runs with zero failures and `completionGate: true`: 109
integration acceptance checks. The ten-day dark control fixes no carbon, draws algae down to
8.5e-33 carbon units and loses both fish to starvation. The sterile unfed control loses both
fish to starvation by 1.25 days; the overfed two-day control loses both to recorded hypoxia.
Across all six cases water drift is zero and maximum absolute C/N/P drift is below
7.6e-8 / 1.2e-10 / 1.3e-12 units respectively, within the unchanged 1e-4 tolerance.

The grazing-only ten-day diagnostic failed the unchanged population gate in two seeds;
the parent-reserve-only trial was interrupted after seed 31337 reached nine fish. Those
records are retained separately from the final suite. Their source rules are described above.

Focused checks pass: 58 feeding/reproduction/spacing assertions, 217 ecology/C/N/P checks,
51 accounting, 26 oxygen, 144 thermal and 157 device checks, plus life diagnostics and the
acceptance falsification checks. A complete 81-scene run passes 393 checks in 379.9 seconds
with the parental-reserve rule. The later spacing correction is verified by the focused
checks and all five affected ecology/life scenes (91.3 seconds). This is a full run plus
affected-scene reruns, not one final invocation of every scene after the spacing edit.

The npm wrapper in this execution environment exits with Windows status `0xC0000142` when
launching its script shell. Verification therefore uses the equivalent direct `node tools/...`
commands; the package aliases retain the same commands for normal development use.

The final-source generated seed-7 observation completes 13,500 ticks (1.25 days) but retains
no ordinary fish. Cumulative losses from generation are 2 predation, 6 stranding and 3 starvation;
one pike remains. All three bees die of cold while 509.779 honey units remain, with no nectar
collected. Five plants remain, without flowers at the endpoint. The surviving water habitat
has 47 connected tiles, all illuminated, and regrows algae after fish losses. This separates
reachable food, water retention/movement and winter shelter problems from an impossible-light
assumption. These balance issues are still open; the final-source record supersedes earlier
generated-world observations.

Build passes with 57 modules (575.1 KB as reported by the bundler). Bundled initialization
under browser stubs schedules its first frame, and the inspected seed-7 frame renders at
512 × 288 pixels. The sky optimization passes 34 pixel-parity cases for cloud thresholds,
fog and lightning. These checks do not establish interactive controls or player feel.
The in-app browser times out on localhost; native browser state access times out waiting for
app approval. No interactive browser playthrough is claimed.

With simulation-test workers stopped, the final seed-7 profiles use 400 actual ticks per
scene and draw every other tick:

| Scene | Mean simulation step | Mean render |
| --- | --- | --- |
| Calm | 8.37 ms | 7.68 ms |
| Storm | 12.99 ms | 29.52 ms |
| Burning | 8.98 ms | 7.64 ms |
| Crowded | 8.93 ms | 7.77 ms |

Storm rendering still exceeds a 16.7 ms frame budget; its render 95th percentile is 38.60 ms
and its largest render spike is 250.81 ms. These are headless samples, not browser frame
rates or a reliable before/after speed comparison. Responsiveness is an open gate.

Raw evidence is retained in `research_notes/Tidepool living world audit/`:

- `phase22c-resumed-suite.jsonl` and `phase22c-resumed-summary.jsonl`: final six-case observations,
  acceptance checks, derived summary and the coordinator's completion result.
- `phase22c-resumed-full.log` and `phase22c-resumed-crowding.log`: complete regression run and
  20 checks across the five scenes rerun after the spacing correction.
- `phase22c-resumed-focused.log`: accounting, oxygen, thermal, devices, feeding, ecology, life,
  acceptance falsification, build, startup and rendered-frame results.
- `phase22c-resumed-habitats.jsonl` and `phase22c-resumed-performance.log`: final-source
  generated habitat observations and the four profiles with function timings.
- `phase22c-resumed-grazing-diagnostic.jsonl`: the failed grazing-only ten-day populations,
  completed short controls and interrupted dark control. It is not a passing suite.
- `phase22c-resumed-parent-diagnostic.jsonl`: the interrupted parent-reserve-only trial,
  stopped after a recorded population-range failure. It is not a completed ten-day run.

Next work should isolate generated habitats with the demo pump on/off before changing initial
stocking or finite producer endowments; test fed versus unfed winter hives with explicit
energy/oxygen costs; address storm drawing costs; and obtain an interactive playthrough.
The designed-jar milestone is verified, while those broader Phase 22 completion items remain.
