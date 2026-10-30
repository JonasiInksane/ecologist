# M1 Shack slice: a kitchen that cooks for real

M1 is the second milestone of the game plan. It puts working equipment in the shack and three products on the
market: syrup, hard candy and sea salt. The milestone has to show two things before the G1 gate (after M2):

1. tuning a real process on a bench is fun, and
2. equipment connects to the simulated world without losing matter or heat.

## Playing the kitchen

The shack now starts with a sink, a work table with a candy mold on it, and a gas stove with a saucepan on it.

- **Click** a piece of equipment (or hover it and press **E**) to open the kitchen panel. The panel shows where
  the piece stands, what you can tell about its contents, and its actions. **Esc** closes it.
- **Flame** (Off, Low 600 W, Medium 1200 W, High 2000 W) appears for a stove and for anything standing on one.
- **Add** takes sugar or sea water from the workshop stock, or tap water from a sink within reach (billed per
  gram). **Pour into** moves everything that fits into another vessel within reach. **Drain liquid** pours the
  liquid down a sink within reach and keeps the crystals. **Tip out** spills the liquid onto the floor as world
  water. **Collect** grades the product and puts it in stock; sell it in the **Workshop** panel.
- **Move** picks a piece up with its contents; click where it should go (right click cancels). A pan stood in
  the sink sits in a cold bath and cools fast.
- **K** swaps the build bar to the **kitchen kit**: left click places the chosen piece for its price, right click
  picks an empty piece up for half back. Pans need a stove, sink, table or floor under them.
- Without tools you only get "warm", "steaming" and "boiling". The **thermometer** (15 credits) shows the
  temperature and the candy stage; the **refractometer** (40) shows Brix or salinity.
- Gas is billed as the stoves burn it, at the workshop's energy price (0.002 credits per kJ).

## Recipes the physics allows

**Hard candy.** Put sugar and water in the pan (600 g and 200 g works). Heat on medium until no undissolved
sugar is left, then turn it up. The syrup boils at its own boiling point, which climbs as water leaves: thread,
soft ball, hard ball, soft crack, hard crack (146 to 154 °C), caramel. Ease the flame near the end, pour into the
mold at 147 to 160 °C and let it cool below 45 °C to set. Pulled early it is soft (B or C); past 160 °C it darkens
(B), then scorches (C), then burns. Too little water or a hard boil before the sugar dissolves leaves crystals in
the melt, and they seed the whole batch: grainy (C).

**Syrup.** Dissolve 1:1 (simple) or 2:1 (rich) sugar and water on a low flame, cool below 50 °C and collect.
Grade A is within 1.5 % of the target Brix. Water keeps evaporating while it is hot, so cool it fast in the sink,
or check it with the refractometer and add water.

**Sea salt.** Fill the salt pan with sea water (3.5 % salts: 2.7 % sodium chloride and 0.8 % bitter magnesium
and calcium salts, the bitterns). Simmer it. Salt crystallizes once the brine is saturated; the bitterns stay
dissolved until the pan is nearly dry. Drain the bitter brine when most of the salt is out (about 3 % of the
water left), then dry the crystals. Grown below 90 °C on medium (about 7 minutes for 2 kg) it is flaky (A, the
best price); on high it boils and comes out fine (B, about 4 minutes). Boiled dry without draining, the bitterns
crystallize with it: road salt.

## The vessel model (`native/core/equipment.cpp`)

Equipment is a list of pieces in `Sandbox::equipment`, keyed by the anchor cell. Each piece fills its footprint
with `B_EQUIPMENT` (81) cells: liquids cannot enter them, the player walks in front of them, they conduct no heat
and the renderer draws them as background with the sprite on top. A piece standing on one that `support`s it
(stove, sink, table) is `resting_on` it; that is how stoves heat pans and sinks cool them.

A vessel tracks grams and joules: water, every dissolved channel the world has (sugar, salt, the bitterns in the
metal channel), sugar, salt and bittern crystals, burnt sugar, and its energy including the vessel's own body.
Its temperature is energy over heat capacity, with the same capacities as world water (water 4.18, sugar 1.0625,
salt 1.032 J/g·K). Each tick, in order: stoves add their power; the contents lose heat to the air cell above the
open top; water arriving in that cell is taken up; crystals dissolve or grow towards the temperature's
solubility (the world's curves); water boils or evaporates; sugar caramelizes past 160 °C and smokes past 190 °C.

Boiling is exact. The boiling point of a syrup rises with its sugar fraction (and up to 8 °C with salts), so each
tick finds by bisection the mass whose evaporation leaves the syrup exactly at its new boiling point. Below the
boil the surface still evaporates, scaled by vapour pressure (Clausius-Clapeyron) and the vessel's open surface,
and a thick syrup that has stopped boiling skins over. Equipment runs four times faster than real time
(`EQUIPMENT_TIME`), so a batch of candy takes about two minutes and salt a few.

## Conservation

Every exchange with the world goes through the same `take`/`put` buffers the pumps use, so mass, solutes and heat
cross the open top exactly. Every joule that enters or leaves a vessel is booked in `Sandbox::budget` under a
`*_J` key (`placed`, `added`, `stove`, `intake`, `loss`, `vented`, `sink`, `smoke`, `drained`, `spilled`,
`collected`, `removed`, `destroyed`), and the tests balance those books to within a millijoule through candy,
syrup and salt runs. Water is booked too: what the vessels hold plus `vented_vapour_g` stays equal to what went in.

**Vapour vents outside.** The plan had boiling pots release steam into the room. In the world, a steam cell over
a pot cools below 100 °C within a tick, condenses and drips straight back in, still carrying its heat of
condensation; the pot then boils the same water again and never thickens. The world has no humidity to hold the
vapour, so for now an open vessel vents it, with its full energy, to a booked sink (`vented_vapour_g`,
`vented_J`), and the game draws steam puffs over it. Water that condensed from steam elsewhere ("fog", which
still holds that heat) is not caught by a pan; rain, spills and pours are. Closed vessels with vapour ports that
send steam into pipes come with M2's couplings, which is also where stills will need it.

Smoke from burning sugar does go into the room as world smoke.

## Data and art

- `godot/data/equipment.json`: the kit (names, prices, salvage, sprite regions), ingredients, tap price.
- `godot/data/workshop.json`: sea water, the twelve products with their prices, the thermometer and
  refractometer, and a starting stock of 1 kg sugar and 2 kg sea water.
- `godot/art/equipment.png`: placeholder sprites from `tools/make-equipment-sprites.py`, cutaways so the game can
  paint the contents, bubbles and steam. PixelLab or hand-drawn art can replace the sheet region by region.

## Tests

- Native (`sandbox_tests.cpp`): placement rules, taking up poured water with its salt and heat, ignoring fog,
  spilling into the world, candy through the stages to grade A, soft and grainy candy, syrup cooled in the sink,
  flaky salt and road salt, carrying, destroyed equipment, the energy books, and a save that steps on identically
  with a pan cooking.
- Godot (`tests/integration.gd`): the adapter end to end (cook, pour, set, collect, carry, drain, place, save and
  load) and the game (kit bar, panel, stock and tap ingredients, tools, gas billing, placing, picking up, moving).
- `tests/kitchen_capture.gd` renders the kitchen mid-cook.

## Not in M1

Lids, ports and pipes on vessels, condensers and stills (M2); glucose syrup as a candy doctor; hiring someone to
stir; real sprites. Prices are first guesses for playtesting.
