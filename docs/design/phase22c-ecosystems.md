# Phase 22C: demonstrate a living ecosystem

**Paused at the user's request, 29 October 2026.** Current status, interrupted tests and
resume instructions are in [`../PHASE22C_HANDOFF.md`](../PHASE22C_HANDOFF.md).
The ten-day gate has not passed; one balanced seed had already lost all fish by day 5.875.

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

Three small performance changes avoid traversing sleeping liquid chunks, unnecessary spore
sky rays when finite banks cannot pay, and repeated volatile-channel membership tests. They
must retain cell/RNG order and produce the same full saved state as the reference implementation.
`tools/trace-world.mjs` records a deterministic digest; timing comparisons require quiet runs.

## Verification commands

```text
node tools/check-ecosystem-metrics.mjs
node tools/check-ecology.mjs
node tools/check-ecosystem.mjs --days=10 --seeds=7,73,31337 --jobs=3
node tools/check-ecosystem.mjs --days=10 --seeds=7 --case=dark
node tools/check-ecosystem.mjs --days=1.25 --seeds=7 --case=unfed
node tools/check-ecosystem.mjs --days=2 --seeds=7 --case=overfed
node tools/inspect-habitats.mjs --seeds=7 --ticks=13500
node tools/simtest.mjs --full --jobs=4 --progress
node tools/profile.mjs 400 --hot
node tools/build.mjs
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

Player feel and a browser playthrough remain distinct from headless tests. No short headless
profile establishes a browser frame rate. Later chemistry/mineral/powder work is still required
for the broader real-material world.
