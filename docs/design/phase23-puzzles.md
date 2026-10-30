# Phase 23 chemistry puzzles

The first showcase increment adds two built-in levels after the nine existing puzzles.
It uses their existing `build`, `progress` and `failed` hooks, plus an optional
per-physics-step `observe` hook for transient evidence. Custom/editor goals and
the snapshot schema stay unchanged. The fixed puzzle clock, weather-off setting,
pressure setting and explorer fainting rule continue to apply.
Static callbacks register through `js/level-observer.js`, keeping functions out of
saved state and avoiding a simulation dependency on level construction/reset.

## 10. The last breath (index 9)

- Tools: lever and heat. A stone chamber spans `(40,40)` to `(52,50)` and contains
  eleven ordinary wood blocks at `(41..51,49)`. Its vent is a gate at `(52,45)`,
  initially shut, wired to an off lever beside the chamber at `(36,49)`.
  Its initial camera centers on `(46,46)` at zoom 2, showing the roof and local lever.
- The chamber starts unlit with a measured oxygen charge of `FIRE_OX + 0.1` in
  the model's air units: approximately 15.01%. Closing a room initially at 21%
  would leave enough oxygen for this fuel, so that is a separate negative control.
- The closed vent retains that charge while the player reads, however long they
  wait. The player keeps it shut and heats the first log until it lights. The fire
  consumes finite fuel and available oxygen, then goes out with fuel remaining.
- Win: a real flame has been observed while the vent is shut, no chamber flame remains,
  and at least eight pieces of wood/charcoal fuel remain. Charcoal conversion alone
  does not count as fuel destruction. The observed-flame boolean is saved on
  `S.level.seenFire`. A physics-step observer records actual flames, so fast-forward
  or sparse UI polling cannot miss ignition. An unlit chamber cannot win by waiting.
- Lose: fewer than eight pieces of fuel remain, or the explorer faints.
- Acceptance: ordinary allowed heat/lever actions solve within 600 ticks, including
  after a 3,000-tick reading delay and with 128/256-tick goal polling. Opening
  the vent before ignition loses within 1,200 ticks. Idle, open-but-unlit and
  initially oxygen-free controls cannot win. Save continuation retains ignition
  evidence; restart clears it and restores the original charge and fuel.

## 11. Freshwater still (index 10)

- Tools: heat and chill. A closed vessel spans `(40,40)` to `(60,52)`, with a glass
  roof. A divider at `x=50, y=46..51` separates the receiving basin on the left
  from a finite charge of 36 full brine tiles at `(51..59,48..51)`, initially 20°C
  with salt concentration 80. There is no spring, drain or other material source.
  Its initial camera centers on `(50,46)` at zoom 2 to show the complete apparatus.
- The player heats the right-hand pot and riser, then chills the roof above the
  left-hand basin. Vapor crosses above the divider; condensed water falls into the
  receiver while nonvolatile salt remains behind.
- Win: the receiver `(41,46)` to `(49,51)` contains at least ten full tiles of liquid
  water, with at most one game unit of salt in all its liquid, ice or salt solids.
  Frozen water does not count toward the liquid-water target.
- Lose: the receiver contains more than one salt unit, or the explorer faints.
  There is no additional timer failure; a wrong temperature arrangement can be
  restarted. The progress text shows collected water and receiver salt.
- Acceptance: replay actual `input.applyAt` heat/chill increments and brush masks,
  without setting temperatures to ideal values each tick. One verified solution
  heats `(55,46)` with radius 5 for 30 ticks, then chills the two roof positions
  `(43,40)` and `(47,40)` with radius 3; it collects more than ten fresh tiles by
  150 ticks. Bound the scripted solution at 1,200 ticks, with multiple fixture seeds.
- Negative controls: no heat cannot collect water; keeping the whole vessel hot
  cannot collect liquid in the receiver. A quantity-only fake consisting of ten
  tiles of unchanged brine must fail. Salt-bearing ice or crystals in the receiver
  must also trigger the contamination rule. Save continuation preserves the finite
  charge and can finish; restart restores the empty receiver and original brine.
- The closed vessel retains all 9,180 initial water/steam/ice carrier units and
  2,880 salt units through the solution, within floating-point tolerance. Heating
  and chilling are explicit player energy inputs. This demonstrates separation of
  a nonvolatile ingredient; it makes no calibrated ABV or industrial-yield claim.

`tools/check-showcase-puzzles.mjs` will own focused allowed-action solutions,
negative controls, material accounting, save/restore and restart checks. The
existing scripted puzzle scene remains responsible for the original nine levels.
