# Phase 23A: explicit fantasy boundaries

This slice keeps the existing materials, rates and starting stocks. Magic is a named external
source, sink or transformation; its counters do not turn it into ordinary closed chemistry.
The two behavior repairs are first-contact mimic transformation and recipes consuming only
their advertised ingredients, retaining excess and unrelated dissolved stocks.

## Quantities and closure

`S.accounting.fantasy` contains versioned, cumulative totals and bounded per-effect totals:
typed liquid carrier and solid representation additions/removals, actual dissolved ingredient
amounts, biological C/N/P additions/removals, and modeled sensible/pending heat additions/removals.
Receipts measure net local stock changes per effect, not full molecular reaction stoichiometry.
Carrier is the existing 255-units-per-full-tile measure. Solid entries measure the current block
representation (255 for a full block, retained amount for a partial block), not calibrated mineral mass.
Heat uses the game's current material capacities, including displaced air and porewater; these
are compressed game joules, not a new chemical enthalpy calibration. Illumination and abstract
electrical power have no joule model: record their uses and explicitly label them unmetered.

For an observation interval, biological stock change is ordinary recorded inputs minus ordinary
outputs **plus magical biological sources minus magical biological sinks**, together with the
existing measured atmosphere/device/world boundaries. Subtract counters at the interval's start;
do not add the same initial endowment twice. This is a reconciliation equation for the tracked
domain, not a claim that every legacy chemical reaction or every atom is closed.

Ordinary `ecoRecordEdit`, `introduced` and `removed` keep their existing meaning. Magic has its own
ledger. Newly conjured moss receives explicit tissue funded by that magical source, preventing
later tissue initialization from introducing it again. Void sends carrier, ingredients and pending
heat to its named sink immediately; erased cells cannot retain heat for a later parcel.
Partial magical carrier costs remove the same fraction of pending energy. Occupied products such
as crystal, tonic and frost retain their saved pending reservoir; steam subsequently balances it
normally. This does not add a latent-heat model for materials that do not have one.

## Named effects

- Void annihilation and void/aether: external matter and heat sinks.
- Mimic: external material transmutation; exactly the first contacted liquid is copied. The
  contacted parcel is retained. Its own carrier, ingredients and temperature are retained.
  The existing void/mimic contact follows void's annihilation rule instead.
- Aether crystal, magical freezing and fantasy liquid conversions: measured local material,
  biological and thermal changes are attributed to the named transmutation.
- Frost: an external cooling sink maintains the existing -40 C upper temperature limit. It is
  deliberately inexhaustible; no invented reserve or recharge rule is added.
- Bloom/tonic: finite carrier is spent at the existing rates; new moss biomass is supplied by
  named magic. Glowcaps remain decorative, with no invented biomass quota.
- Slime: terrain conversion, methane creation and heat/electrical destruction are explicit magical effects. Ordinary finite
  sediment methanogenesis remains separate.
- Liquid light: illumination and solar-panel power are unmetered external magical energy.
  Algae and ordinarily grown moss still pay actual CO2/N/P inputs. Coolant retains its enhanced transport and phase model;
  its actual 2 C withdrawal is measured, while legacy boiler output remains explicitly unmetered
  rather than being assigned invented joules. Losing liquid light records its carrier, ingredients
  and modeled heat; there is no stored radiative-energy reserve to erase or replenish.

Fantasy creatures' existing lifting, absorption, splitting, wards and imposed heat are documented
exceptions outside this first effect-accounting slice; no ordinary creature conservation claim
is extended to them. Other unaudited legacy ordinary chemical yields remain ordinary model gaps,
not silently relabeled magic.

## Persistence and inspection

Snapshots/world codes/undo already save the generic accounting object. A missing fantasy ledger
means an older, unmeasured history; loading establishes an explicitly marked baseline at the
loaded tick. Fresh worlds already have a zero ledger before their first snapshot.
Reading material descriptions, counters or inspection must never initialize state or add stocks.
Resetting the world removes the counters. Counters grow by named effect, not by unbounded event
history. The UI identifies fantasy materials, explains external sources/sinks and distinguishes
measured thermal changes from unmetered light/power.

## Verification

Headless controls cover partial/full carriers, signed oxygen, unrelated/excess ingredients,
first-contact priority and one-event mimic, pending heat erasure, repeated frost cooling,
magical moss and methane, ordinary negative controls, finite counters, and exact snapshot/code/
undo round trips with missing-ledger baselines. Short untouched generated observations must expose
the existing bloom-to-moss source. Final verification passes 1,240 checks, including hot and
electrically shocked slime sinks, both storm/metal quench variants, and void's priority over
mimic. The complete record is `research_notes/Tidepool living world audit/phase23-fantasy.log`.
No browser validation is claimed.
