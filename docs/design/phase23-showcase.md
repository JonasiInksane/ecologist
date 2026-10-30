# Phase 23: Showcase

The player should be able to watch a finite ecosystem, solve two understandable chemistry
problems, and recognize when a fantasy material changes the ordinary budget. This phase
exposes the existing simulation; it does not promise indefinite survival or full elemental
and energy closure for every material.

## Terrarium

Add a separate saved mode sharing the exact tested jar construction. Start with two fish,
two plants and finite water, algae, nutrients and food. Real day/night advances; the glass
contains matter while admitting light. No ordinary editing, rain, drain or body placement
is available. Pause, speed, inspection, display, light schedule, restart and save/load remain
available. Light scheduling is an explicit external energy choice. The Lighting display
toggle only changes rendering.

Read-only feedback shows elapsed days, populations, oxygen near fish, algae and reserve
warnings. Reads must not change stores or RNG. Loading never calls setup or replenishes a
jar; old saves clear stale mode state. Returning to Sandbox restores its simulation settings.
Construction and seeded RNG behavior must match the existing four gate scenarios.
Model contract: [phase23-terrarium.md](phase23-terrarium.md).

## Chemistry puzzles

An initially unlit low-oxygen fire chamber asks the player to keep its vent shut and ignite wood,
retaining at least eight logs after the actual flame goes out. An idle unlit chamber cannot
win. A finite brine still asks the player to heat its source and cool its receiver to collect
freshwater while salt remains behind. Both use ordinary allowed tools and existing physics;
no hidden per-tick temperature reset supplies the solution. Scripted actual-tool actions
must win; missing or wrong actions must fail or make no progress. Existing built-in goal
hooks plus a small physics-cadence observation callback retain actual ignition evidence at
fast playback speeds. The vent starts shut so reading the instructions cannot replenish its
air. Contract: [phase23-puzzles.md](phase23-puzzles.md).

## Fantasy materials

Retain the existing materials and rates, with named rules and saved cumulative source/sink
receipts. Typed carrier, consumed ingredients, biological C/N/P, modeled heat exchange and
unmetered magical light/power are distinct quantities. The magical ledger is separate from
ordinary player/generated edit accounting; a mixed-world budget must include both. It must
not silently weaken the closed ordinary jar tests. Register magically created moss so later
tissue initialization does not count it again.

Fix confirmed first-contact mimic behavior and recipes that erase unrelated/excess solutes.
Labels and inspection explain the effect in player language. Old saves establish a marked
loaded-tick accounting baseline, without reconstructing fictitious historical receipts.
Contract: [phase23-fantasy.md](phase23-fantasy.md).

## Acceptance and limits

Verify shared-constructor parity, finite jar controls, save/code/undo/legacy behavior,
input mutation guards, both scripted puzzle solutions and negative controls, declared magic
receipts and unaffected ordinary transfers. Build and exercise the bundled first frame.
Headless frame inspection complements these checks. The prior Windows browser URL guard
prevents interactive playtesting in this run; that acceptance item stays open.

Retain Phase 22's passing evidence and its limits. The outdoor suite tracks recorded
boundaries and is not globally closed. Phase 22's storm rendering performance remains open.
New powders, mineralogy and food-processing chains are future extensions, not prerequisites
for this Showcase phase.

## Verified implementation, 30 October 2026

The core Showcase implementation is present. Its final runtime digest is
`15d6cdcf8132496d39a0de16f602d48dd10380c2bf05bca927378ac0b79ee0b9`.
The [evidence manifest](../../research_notes/Tidepool%20living%20world%20audit/phase23-manifest.json)
records hashes, commands, scope and limitations.

| Verification | Result |
| --- | --- |
| Shared model and preserved Phase 22 parity | 273 checks; all four scenarios and three seeds match exact snapshots at steps 0/1/8/32/64 and the next RNG draw; only asserted new default/empty metadata excluded |
| Final Showcase command | 189 model, 1,240 fantasy, 166 puzzle and 43 UI-event checks pass; compiled startup and first frame pass |
| New puzzles | Both solve through actual allowed tools by 121 ticks for all three seeds; wrong actions, reading delay, sparse polling, contamination and save/restart controls pass |
| Ordinary focused accounting | Final accounting 51, oxygen 26, thermal 144 and devices 160 checks/assertions pass; 27 focused commands also passed before the final small fixes |
| Broad regressions | 81 scenes / 393 checks pass while approved final fixes were landing; source may vary between scenes |
| Final affected regressions | 20 scenes / 94 checks pass on unchanged final runtime; raw before/after source manifests retained |
| Presentation | Jar and both complete vessels inspected in native headless frames; daytime/nighttime jar shading leaves saved state unchanged; one seeded ordinary-world frame exactly matches Phase 22 |
| Build | 63 modules, 634.8 KB; `dist/tidepool.html` |

The jar retains its atmosphere-isolation mask and tested physiology. A display-only daylight
path makes its glass chamber visible and follows the actual light schedule. Pure geometry
data avoids importing generation into the renderer. The new puzzle views show their vessels
at 2×; the fire switch sits beside its chamber. A cold network query also no longer treats
zero-initialized generation stamps as supplied power.

Quiet seed-7 profiles over 400 ticks (drawing every other tick with inspector sampling):

| Scene | Mean step / render | Render median / 95th / worst |
| --- | --- | --- |
| Calm, 1024×576 | 6.29 / 6.40 ms | 5.54 / 7.43 / 190.42 ms |
| Storm, 1024×576 | 9.69 / 18.30 ms | 16.74 / 22.48 / 209.92 ms |
| Terrarium, 512×288 at 2× | 2.04 / 2.27 ms | 1.73 / 2.74 / 119.86 ms |

Storm cost and occasional long frames remain open. These are headless timings, not a browser
60-fps claim. Interactive browser use was stopped by the Windows URL policy guard; event
tests and native frames do not establish full browser layout, player feel or accessibility.
The earlier long ecosystem gates retain their Phase 22 source scope; they were not rerun
after Showcase. Exact shared-jar parity and the absence of magical materials in that fixture
support the extraction without replacing its documented long-run record.

Durable raw logs and images use the `phase23-*` prefix in
`research_notes/Tidepool living world audit/`. The built-in plan ends at Phase 23; proposed
extensions are listed after Showcase in `ROADMAP.md`.
