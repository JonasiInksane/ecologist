# Phase 22C continuation

**Resumed at the user's request on 29 October 2026**, in `C:\dev\ecologist` from commit
`78cd3b1`. Current rules and verification are in [`design/phase22c-ecosystems.md`](design/phase22c-ecosystems.md).
The historical paused checkpoint below explains the starting evidence; its pause is superseded.

## Current continuation

The generated-world and winter-hive headless gates passed on 30 October 2026. Current rules,
numbers, evidence and limits are in
[`design/phase22c-generated-habitats.md`](design/phase22c-generated-habitats.md).
All three seeds (7, 73, 31337) pass eight actual days, finishing with 22, 15 and 14 fish.
Seed 7 retains its three original bees and collects 1.818074 nectar units. Finite generated
producers, a glass demo tank with an idle pump, retained banks, watered seedlings, connected
roots, cold physiology, clear-ice light and physically reachable honey-funded shelter are
implemented. The ten-day balanced jars finish with 5, 4 and 6 fish; all six cases and 109
acceptance checks pass. Durable artifacts use the `phase22-world-*` prefix.

The complete regression suite passes 81 scenes / 393 checks before the last hive-only edits;
the five affected scenes pass again afterward. All 21 focused tools, build and stubbed first
frame pass. Interactive browser checks remain unverified because the Windows URL policy
guard stopped computer use. Storm rendering averages 18.18 ms, so responsiveness remains open.
Outdoor recorded introduction counters do not establish global closure: the Phase 23 audit
found pre-existing unrecorded bloom-created moss. Closed ordinary jars contain no magic.

The user explicitly requested continuing the next phase. Phase 23 Showcase core is implemented;
see [`design/phase23-showcase.md`](design/phase23-showcase.md). The exact verified Phase 22
runtime is retained locally at `.test-artifacts/phase22-verified-source` for parity checks.
Final Showcase evidence uses `phase23-*`: 273 model/parity checks, 1,240 fantasy checks,
166 new-puzzle checks, 43 UI-event checks and bundled startup pass. The broad regression run
passes 81 scenes / 393 checks while approved final fixes were landing; 20 affected scenes /
94 checks pass again on unchanged final runtime. Latest storm mean rendering is 18.30 ms.
Native frames are readable; interactive browser playtesting remains open. Proposed extensions
after the last numbered phase are in `ROADMAP.md`.

### Prior designed-jar milestone and pre-correction diagnostics

- Fish grazing now tapers quadratically with dilute algae concentration, retaining finite
  transfers and paid starvation. Satiated pike stop hunting until ordinary reserves decline.
  Births retain parental food reserves; local crowding uses equal 64-pixel axis extents.
- The test harness requires the documented fixed seeds, checks nectar/hive stores and matches
  fish-only births/deaths to fish population changes. Falsification controls cover each rule.
- Final ten-day balanced trials pass for seeds 7, 73 and 31337. End populations are 4, 4 and 5
  fish, with plants/algae retained and positive final-day photosynthesis. The design document
  records controls, conservation, regressions and performance limits. The complete six-case
  suite passes all 109 acceptance checks with `completionGate: true`; it sustains populations
  through turnover, not every original fish.
- That earlier generated seed 7 source loses its ordinary fish within 1.25 days (2 predation,
  6 stranding, 3 starvation, cumulative from generation). All three bees die of cold with
  509.779 honey units left and no nectar collected. The current seasonal results above supersede these failures.

## Historical paused checkpoint

The earlier run was paused at the user's request on **29 October 2026**. Its eight remaining
task-owned ecosystem and regression-test processes were stopped.

## Repository checkpoint

- Workspace: `C:\Users\jonas\Documents\tidepool 2\tidepool`.
- Branch: `main`, tracking `origin/main`.
- Pushed base commit before this checkpoint: `8c3f037` — `Complete phase 22 quantity accounting and finite life cycles`.
- Remote: `https://github.com/JonasiInksane/ecologist.git`.
- Phase 22A/22B are committed and pushed. The user subsequently requested that the paused
  Phase 22C work be committed and pushed as a checkpoint. Consult `git log`/`git status` for
  the resulting revision. This publication request does **not** resume implementation or tests.
- `docs/LIQUIDS_AND_MATERIALS.md` appeared during this work and was not created or edited by this task.
  Preserve it; do not treat it as part of the Phase 22C patch without inspection.

The working design and commands are in `docs/design/phase22c-ecosystems.md`. Phase 22C is
**not complete**. In particular, the ten-day survival gate has not passed.

## Implemented so far

1. **Corrected starvation accounting** in `js/ecology.js`. Previously, repeated negligible meals
   could reset starvation while supplying almost none of the required maintenance energy.
   `metabolicDebt` now retains missing food costs. Recovery spends actual food through respiration
   beyond current maintenance. Oxygen shortages retain separate hypoxia/choking checks; they
   do not accumulate food debt merely because respiration is oxygen-limited. Existing saved
   starvation counts migrate when first processed; ordinary body snapshots retain the new field.
2. **Measured producer renewal:** `photosynthesisAirC` and `photosynthesisWaterC` counters record
   actual fixed carbon in `js/oxygen.js` and `js/ecology.js`; they grant no material.
3. **Behavior-preserving performance work:** sleeping liquid chunks are skipped at live chunk
   boundaries (`js/sim.js`); exhausted spore banks avoid sky rays without changing caller RNG
   consumption (`js/ecology.js`); nonvolatile channel IDs are precomputed (`js/heat.js`).
4. **Rendering performance work** in `js/render/sky.js`: cloud noise is omitted only where its
   bounded amplitude cannot change the selected palette band; lightning flashes use a lookup
   table with the same channel arithmetic. Visual comparisons pass, but final quiet timing and
   build checks after this last rendering edit are still needed.
5. **New verification tools:**
   - `tools/check-ecosystem.mjs`: real fixed-step simulation, bounded workers, JSONL observations;
     `--suite` covers three balanced seeds, one matched dark jar, unfed and overfed controls.
   - `tools/ecosystem-data.mjs`: ten days, seeds 7/73/31337, sampled population range 1–8,
     eight samples/day, explicit C/N/P and water tolerances.
   - `tools/ecosystem-metrics.mjs`, `tools/check-ecosystem-metrics.mjs`: pure acceptance logic and
     falsification checks, including offsetting negative stores, missing matter, replenishment,
     water leaks and unrecorded population changes.
   - `tools/inspect-habitats.mjs`: actual connected water habitats, light, algae, food reserves,
     hive stock, nectar collection and mortality in generated worlds.
   - `tools/trace-world.mjs`: deterministic saved-state and optional rendered-pixel digests.
   - `tools/profile.mjs`: added seeded calm/storm/burning/crowded scenes.
6. `.test-artifacts/` is ignored. Its `phase22c-reference/js` copy is a temporary comparison
   implementation, using the same corrected physiology but without the performance edits.
   Preserve it if further comparisons are needed; remove only this known task-owned copy later.

## Verification already completed

- **217** ecology/C/N/P checks pass, including the new inadequate-meal and paid-recovery cases.
- Oxygen **26**, thermal **144**, accounting **51**, devices **157** pass.
- Life diagnostics, local crowding, causal hypoxia and the aerated control pass.
- Pure ecosystem acceptance/falsification checks and short integrated runner smoke checks pass.
- The three simulation optimizations produce identical full saved-state digests after 400
  steps for seeds **7, 73, 31337**. Raw results: `phase22c-parity-final.jsonl`.
- A 100-step storm comparison of the final rendering optimization produces identical saved
  state **and pixel digests** for seed 7: `phase22c-storm-before.json` / `phase22c-storm-after.json`.
- Build passed at about **563.7 KB before the last sky-rendering edit**. Rebuild is pending.
- Review found no confirmed source bug in the maintenance, chunk/spore or nonvolatile changes.
  A reviewer found that the new nonnegative-store gate omitted soil/dead/plant/dissolved pools;
  that omission was fixed and the pure falsification check passes. Final rendering review remains.

All referenced raw results are in `research_notes/Tidepool living world audit/`.
Logs named `baseline`, `correction`, or `nutrition-trial` are superseded or interrupted trials.
Files named `suite-final` and `full` were also **interrupted by this pause**; their filenames
do not imply a completed passing run. No full current-source regression pass is claimed.

## Most important findings at pause

### Designed jars: accounting holds, survival does not yet

Latest complete checkpoints in `phase22c-suite-final.jsonl`:

| Case | Reached | Fish alive | Recorded losses | Algae remaining |
| --- | --- | --- | --- | --- |
| Balanced seed 7 | day 6.000 | 1 | 6 starvation, 1 stranded | 0.00001424 |
| Balanced seed 73 | day 5.875 | **0** | 7 starvation | 8.82e-16 |
| Balanced seed 31337 | day 5.875 | 1 | 6 starvation | 7.40e-12 |
| Dark seed 7 | day 5.875 | 0 | 5 starvation | 2.96e-28 |

Seed 73 has already failed the survival criterion; simply restarting the same unchanged
ten-day suite will not resolve that. Original fish had offspring before the collapse, hence
the death counts exceed the two starting fish. No replenishment was added during these runs.
The key next investigation is producer renewal versus grazing and reproduction/food demand.
Current grazing can clear every last bit of a low-density algae population. A concentration-
dependent feeding response or a physically defined producer refuge are **unimplemented ideas**,
not verified fixes. Do not hide this collapse with free food or by undoing starvation accounting.

The earlier unfed 1.25-day control recorded both fish starving. The latest suite's unfed and
overfed jobs had not started before the pause; rerun them after the next correction.

### Generated seed 7: several distinct ecological problems

`phase22c-habitat-final.jsonl` **completed its 13,500-tick observation (1.25 days)**:

- No ordinary fish remained. Cumulative losses from generation onward were 5 predation,
  2 stranding and 4 starvation. One pike remained.
- All 3 bees died of cold. About **509.78 honey units** remained and **no nectar was collected**.
- Six plants and one flower remained; plants are not universally unable to mature.
- The default pump starts on and changes pond water distribution. Distinguish this machine
  intervention from natural habitat balance before changing stocking or water rules.
- The pike hunts after its short digestion timer regardless of energy needs; investigate this
  along with small-pond stocking before assuming all predation is resource-driven.

An initial static assumption that the named "cave lake" cannot receive light was corrected.
The carve extends above the original surface and the raised basin has a leak; actual seeds
have illuminated lake tiles and circulation. **Do not claim all cave-lake producers are
impossible.** The measured problem is sufficient reachable production/food and water retention.

Possible future work discussed but **not implemented**: wider connected-soil nutrient foraging,
finite starting algae per illuminated habitat, pond-bank plants, changing the default demo
pump, prey-density-dependent grazing, resource-limited hunting, and funded winter hive shelter.
These require a concrete plan grounded in the observations; do not silently apply all of them.

### Winter hive behavior needs a real rule

`driveBee()` increments cold damage below 0°C even beside its home, so returning home does not
protect it. Real honey bees cluster and spend honey to generate heat; they do not simply become
immune to cold or hibernate. A funded thermoregulation/shelter model is future design work.

- Penn State: https://extension.psu.edu/honey-bee-management-throughout-the-seasons
- Minnesota Extension: https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-insects/wasps-and-bees
- Cave ecology qualification: https://home.nps.gov/grba/learn/nature/cave-life.htm?mobile-app=true&theme=false

## Performance evidence and limits

Quiet 400-tick seed-7 samples **before the latest cloud/lightning optimization**:

| Scene | Mean simulation step | Mean render |
| --- | --- | --- |
| Calm | 25.29 ms | 28.27 ms |
| Storm | 26.65 ms | 79.43 ms |
| Burning | 20.90 ms | 21.46 ms |
| Crowded | 26.98 ms | 27.09 ms |

Storm profiling identified cloud drawing and lightning flashes as significant costs.
The later pixel-parity comparisons ran alongside tests, so their times are **not** a valid
performance measurement. Earlier simulation before/after timings varied by seed and host
load; do not claim a reliable speedup or 60 fps. Reprofile quietly after changes settle.
Interactive browser play remains unverified; the connected browser blocked local file URLs.

## Resume order

1. Read this handoff and the working design; check `git status` and preserve unrelated edits.
2. Diagnose the already-observed balanced-jar extinction with shorter targeted experiments;
   propose any new feeding/refuge/winter rules before committing to a broad biology expansion.
3. Fix and verify each causal issue with C/N/P conservation and matched controls. Do not launch
   repeated long suites while source rules are still changing.
4. Once the source is stable, run the complete ten-day suite, focused checks and full regression.
   Long tests are expensive; bound workers and retain JSONL progress. Full-suite shell logs may
   remain buffered until completion, so empty redirected logs are not evidence of a stuck run.
5. Finish rendering review, quiet performance measurements, build/startup/render checks,
   documentation and package commands. `package.json` has **not** yet gained a Phase 22C script.
6. Do not mark Phase 22/22C complete until its stated gate actually passes. The paused checkpoint
   publication was authorized separately from implementation; the later user request resumed work.

There is no active scheduled continuation or goal. The current continuation is described above.
