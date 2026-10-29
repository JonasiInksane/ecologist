# Phase 22A: account for the existing world

Approved 29 October 2026 following `reports/Tidepool living world audit.md`.

## Player goal and feel

A pond or vessel should change for understandable reasons. Mixing must retain its ingredients,
closed water must draw oxygen from finite air, and burning or distilling spirit must consume
the appropriate inputs. Preserve the existing pixel-world presentation and pacing.

## Scope

- Isolate the three failing checks: overfeeding/nighttime mortality, crowding, and spirit burning.
- Preserve fractional dissolved quantities and transfer amounts between unequal liquid volumes.
- Use a fixed reference for the oxygen-deficit channel, actual finite air/water exchange, and
  reagent-limited fractional respiration. Temperature changes equilibrium, not inventory.
- Preserve solutes and latent energy through ordinary liquid flow, swaps, pumps and pipes.
- Bound dissolution by available solid and solution capacity; retain precipitation/boiling residues.
- Conserve existing water/ethanol components through distillation and limit combustion by oxygen.
- Record mortality causes and relevant boundary exchanges. Version and migrate saved state.

The larger biomass/food/phosphorus model, new material palette, complete chemical-species
replacement, and ten-day ecosystem completion gate belong to 22B/22C and later material work.
The first slice does not claim full chemical or energy closure of every legacy reaction.

## Quantity contract and tunables

- Keep 60 ticks/second and 10,800 ticks/game day.
- Existing liquid fullness remains 0–255 carrier units. A dissolved channel's amount is
  concentration × carrier amount / 255. This game-scale measure is not a claim of SI mass.
- Retain concentrations and atmospheric fractions in double precision; no rounding per transfer.
- Exact fractional saves increase storage: the reference generated world code uses about 413 KiB
  (a 512 KiB regression budget); snapshot arrays occupy 13.4 MiB, about 161 MiB for twelve undo entries.
- Dissolved O2 uses a signed deficit from 9.1 mg/L at 20°C, with 15/255 mg/L per deficit unit.
  Negative deficits can represent supersaturation. The atmosphere/water conversion is documented
  separately in `oxygen.js`; both sides of every closed exchange must receive opposite changes.
- Preserve existing biological rate constants except when a focused causal test justifies tuning.
- Document any simplified alcohol equilibrium or energy model next to its named constants.
- Salt/sugar add approximate heat capacity in proportion to their tracked amounts. Porewater
  capacity is added to the dry soil/sponge matrix. Transfers, freezing and distillation use this
  inventory; concentration-dependent measured properties and mixing enthalpies are deferred.

## Edge cases and acceptance checks

- Unequal volumes, nearly saturated solutions, partial powder piles and repeated tiny transfers
  retain all tracked ingredients within explicitly stated floating-point tolerances.
- Cooling a sealed water tile does not create oxygen; air/water exchange conserves their sum.
- Fractional respiration produces matching CO2; oxygen-free respiration/combustion cannot proceed.
- A phase-changing parcel carries its latent energy when moved, swapped or pumped.
- Salt and sugar do not disappear from mixed residues; blocked products postpone conversion.
- Distillation retains water, ethanol and nonvolatile ingredients and spends thermal energy.
- Crowding is tested with healthy fish; hypoxia tests record low oxygen before tagged deaths.
- New snapshots/world codes preserve fractional state; legacy byte-based saves migrate explicitly.
- Run focused checks, quick scenes, build, and the complete simulation suite; inspect a browser
  preview when available. Record performance and any remaining unverified behavior honestly.

## Baseline

The original seven modified files are preserved in the audit's `phase22a-baseline.patch`.
Before this milestone: build passed; 24 quick scenes passed; the full 75-scene run took
700.6 seconds with 375 checks passing and three Phase 22 checks failing.

## Player checks

- Heat salt-and-sugar water in a vessel with room for vapor and solid residue. Both ingredients
  should remain accounted for; blocking residue space should stop final drying.
- Spark pure hydrogen in a completely sealed, full chamber: it should remain unburned. Give a
  small hydrogen cloud access to oxygen-bearing air and room for steam: its edge should burn.
- Compare an algae-rich pond at night with an aerated control. Watch dissolved oxygen before
  judging fish deaths; ammonia can cause a separate daytime loss.

Interactive responsiveness and game feel require a browser playtest. The long-term living-world
gate remains 22B/22C work, including finite food/biomass/phosphorus and a controlled ten-day run.

## Remaining model limits

Organic or silt residue with no supported dry representation retains the final carrier unit;
it is not silently discarded. Closed smoke clouds persist, while gas escaping through the sky
is recorded. Finite oxygen does not yet imply a complete gas-pressure or atmospheric-species model.
The existing flow solver approximates displaced sub-tile air, and legacy dissolution/diffusion
and chemical conversions do not all conserve the new sensible-heat inventory. Hot sponges still
release steam at a fixed 110°C without paying its latent-heat cost; this can create heat and needs
a separate phase-energy correction. These limits are
separate from the tested carrier/ingredient/latent-energy conservation and phase-change budgets.
The legacy water/honey reaction also adds sugar as concentration while removing honey as amount;
partial receiving cells therefore still need a mixture-conversion correction. Honey's water/sugar
composition and these older liquid-reaction yields belong to the remaining material-contract work.

## Verification record — 29 October 2026

- Focused checks: 51 accounting assertions, 26 oxygen/porewater cases, 112 thermal assertions,
  145 device assertions, and the life diagnostics/crowding/hypoxia/aerated-control checks passed.
- Build (54 modules, 527.9 KB), headless rendering, and bundled-page initialization with browser
  stubs passed. The bundle schedules its first frame; this is not an interactive UI test.
  A read-only code review found no additional confirmed
  regressions in the completed capacity-weighted transfers or phase changes.
- The first expanded full run exposed 13 failed checks. Its log is retained as
  `research_notes/Tidepool living world audit/phase22a-full-initial.log`; it is not a final pass.
  The cauldron's remaining failure was traced to its automated controller overheating during
  ingredient addition, producing partial boiling cells that expose the older honey-conversion
  mismatch. Temperature regulation during additions reaches the unchanged ten-tonic goal.
  The fresh 81-scene run took 861.0 seconds with eight workers: 390 checks passed and one sponge
  check failed because it sampled only the final state, after emitted steam had recondensed.
  Its complete log is `research_notes/Tidepool living world audit/phase22a-full.log`.
  The corrected sponge fixture observes peak steam and continuous water conservation. Its
  12-check scene rerun passed in 61.2 seconds: steam peaked at 199 units, then recondensed; all
  200 water units remained accounted for at every tick. The rerun log is
  `research_notes/Tidepool living world audit/phase22a-sponges.log`.
  **All 391 unique checks across 81 scenes are verified across the full run and targeted rerun.**
  Production code is unchanged between those runs; the full-run log intentionally retains its
  original failed timing assertion. The earlier 25-scene quick run also passed all 109 checks;
  those scenes were included again in the final full run.
- Interactive browser testing was unavailable: the local preview could not be reached by the
  available browser connection. A rendered image verifies drawing, not controls or game feel.
- Exact fractional state increases the reference world code and undo-memory footprint as
  noted above. No simulation-test workers ran during the final 400-tick `--hot` samples.
  The original baseline averaged 23.98 ms/step and 25.76 ms/render; a fresh baseline averaged
  22.38/24.95 ms. The final build averaged 32.22/32.95 ms in one sample and 106.12/106.73 ms in
  a repeat with large latency spikes. Unchanged-source variation prevents attributing a reliable
  slowdown to this patch. These short headless samples do not establish browser frame rate or
  acceptable responsiveness; performance remains an explicit validation risk, not a passed gate.
  Raw results are retained in `phase22a-profile-before.log`, `phase22a-profile-baseline-repeat.log`,
  `phase22a-profile.log` and `phase22a-profile-repeat.log` in the audit's research folder.
