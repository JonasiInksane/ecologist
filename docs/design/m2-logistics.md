# M2 Logistics: supplies by truck, tanks and pipes, beet sugar

M2 is the third milestone of the game plan. It connects the shack to the outside world and to itself: supplies are
ordered on a laptop and arrive by truck, tanks and kettles have ports that pipes couple to, a tanker fills a tank
through a coupling at the road, and the kitchen grows a second product chain, sugar from beets. Gate G1 follows:
a new player should enjoy twenty minutes in the shack without help.

## Playing

**The laptop.** It stands on the work table. Click it to open the shop: pick a supplier, an item and a count, and
order. Orders are paid when placed and arrive after the supplier's lead time on the game clock, which starts on
Day 1 at 08:00 and runs one game minute per real second (the HUD shows it, with the next delivery). The suppliers
are fictional:

| Supplier | Sells | Lead time |
| --- | --- | --- |
| Hollis Family Farm | sugar beets, 25 kg sacks | 3 h |
| Calcium & Sons | slaked lime, 5 kg bags | 2 h |
| SweetCo Wholesale | sugar, 5 kg bags or 25 kg sacks (cheaper per kg) | 1.5 h |
| Brackwater Haulage | sea water in 20 L jerrycans by van, or 200 to 1000 L by tanker | 4 h |
| Pipe Dreams Plumbing & Steel | crated drums, totes, couplings, kettles and a centrifuge | 4 h |

**Deliveries.** One truck parks at the curb at a time; the others wait their turn. Walk over to a van and click
it to unload: goods go into stock, equipment arrives as crates. A van waits two game hours. If nobody unloads it,
the driver takes the goods back and refunds them less a return fee (the larger of 5 credits and 15 %).

**The tanker** needs a fill coupling standing by the road (anywhere right of x 356). It hooks a hose to the
coupling nearest the road and pumps 300 g of sea water a tick into it. While it pumps, the coupling pushes into
the pipe run from it, uphill to a tank's filling port at any height. When the coupling stops taking water for three
seconds (the tank is full, a valve is shut, the pipe leaks into nowhere), the tanker leaves and refunds what it
still carries, less the fee.

**Crates and the kit.** Press **K** for the kitchen kit. Crated pieces show how many crates wait in the yard
(Drum ×1); placing one unpacks a crate, and picking it up again (right click, empty) packs it back. Kitchen pieces
are still bought on the spot. A piece with more than 60 kg in it is too heavy to carry.

**Pipes, valves and pumps** are on the build bar. **Pipe** (1 credit a cell): drag to lay it cell by cell; a fast
drag fills the gaps. **Valve** (8): place it in a run; click a valve to open or shut it. **Pump** (40): click the
inlet cell, then the outlet cell; click either end to switch it. Right click removes one fitting for half its cost
(removing either end removes the pump). A pipe end next to an equipment port that faces it is coupled to that port
and nothing else, so a fitting does not leak; a pipe end in the open spills into the world, and an open pipe end
over a pan fills it.

**New equipment:**

| Piece | Holds | Notes |
| --- | --- | --- |
| Steel drum | 200 L | closed; taps low on each side, a bung on top |
| IBC tote | 1000 L | closed; outlets low on each side, two filling ports on top |
| Fill coupling | 20 L | closed; ports on top, left and bottom; the tanker hooks up here |
| Jacketed kettle | 60 L | open, with its own gas ring (simmer 2.5 kW, medium 10 kW, high 30 kW) and a drain each side |
| Basket centrifuge | 30 L basket, 30 L casing | spins syrup off crystals into its casing; the casing drains through the side outlets |

Closed vessels take nothing from the kitchen panel: fill them through their ports. **Collect** on a tank bottles
what it holds if it is a known liquid (water, sea water, syrup, molasses).

**New tools:** the **pH meter** (25 credits) and the **beet shredder** (45). With the shredder, beets added from
stock go in as cossettes.

## Beet sugar

1. **Diffusion.** Put 10 kg of cossettes and about 12 kg of water in the kettle and hold it at 70 to 75 °C. Sugar
   diffuses out of the cut tissue into the water (whole beets give up very little). Hotter extracts faster but above
   80 °C the pectin in the tissue breaks down and clouds the juice. After a minute about half the sugar is out; it
   slows as the juice approaches the tissue. **Collect** takes the spent pulp out first (cattle feed).
2. **Liming.** Raw juice is slightly acid and cloudy. Add slaked lime until the pH meter reads about 8 (about 70 g
   for 10 kg of beets) and hold it at 85 °C: the lime binds the colloids and settles as lime mud, the pH falls back
   towards 7. **Collect** scoops out the mud. Too much lime browns the sugar when it boils.
3. **Boiling.** Boil the clear juice on high. The refractometer shows the Brix and where the syrup saturates at the
   current temperature. Boil it past saturation (about 86 % Brix) and seed it with 20 g of sugar, then turn it down
   to a simmer and let the crystals grow until about half the mass is crystal: that is massecuite, and it is not
   sold as it is. Seeded too early, the seed dissolves; never seeded, a pure syrup only grains when it cools, and an
   impure one hardly at all.
4. **Spinning.** Pour the massecuite into the centrifuge and **Spin**: the syrup runs off through the basket into
   the casing. **Wash** sprays a little mains water (3 % of the crystals) over them; spin again. **Collect** takes the
   sugar, then the molasses from the casing.

Grades: white "sugar" (purity 99.5 % and dry: the same as the shop's, so it goes in with your sugar), off-white
beet sugar B, brown sugar C, raw sugar. Unlimed juice gives B or C; unwashed crystals carry the syrup film and drop a
grade. A clear juice boiled down without seeding sells as beet syrup A to C by its Brix.

One batch takes about four minutes and turns 10 kg of beets (8 credits) and 70 g of lime into about 560 g of white
sugar, 300 g of molasses, 10 kg of pulp and 200 g of lime mud. The kettle burns about 15 MJ of gas. With gas at
0.0002 credits a kJ the sugar costs about 1 credit per 100 g against 2.5 to buy, so the beet line pays mostly by
feeding the candy line. Prices are first guesses for playtesting.

## The model

**Ports** (`native/core/equipment.cpp`). Each kind lists its ports: a cell of its footprint and the direction the
pipe must come from, and whether the port belongs to the second compartment (the centrifuge casing). A pipe end next
to a port that faces it is coupled only to that port. In the pipe network (`Sandbox::pipes_step`), a port is a
source while the vessel's surface stands above the port's bottom, at the level of that surface; it is a destination
at the lower of its surface and its own row. A coupling with its setting at 1 is a source above everything, which is
how the tanker's pump pushes uphill. Liquid leaving or entering through a port is converted exactly between the
vessel's grams and joules and the pipe's buffer, solutes included, and booked as `port_out_J` and `port_in_J`.
Pumps take from a coupled port at their inlet and push into one at their outlet. Pumps (750 W) and centrifuges
(1500 W) book `power_joules`; the game bills it at 0.0015 credits a kJ and gas at 0.0002.

**Beet tissue** is tracked inside the vessel: water, sugar, colloids (pectin) and ash in the beet, and how much of it
is cut. Each tick, sugar, colloids and ash diffuse between tissue and liquid in proportion to the difference in
concentration, faster when cut and hot (the tissue opens above 50 °C). Above 80 °C the tissue releases pectin. Lime
reacts with the colloids above 60 °C into mud (twice the colloid mass, with the lime). Lime left over browns sugar
above 100 °C. Crystal growth needs supersaturation; seeded growth is fast, unseeded growth only starts below 60 °C
in a nearly pure syrup, and colloids slow both. Growing crystals trap a little of the impurities in the liquor
(occlusion); that is what limits purity, with the syrup film on the crystals when spun.

**Conservation.** Every joule into or out of a vessel or the casing is booked; the native tests balance the books
through the tank, coupling and beet runs to within 10 mJ, and pipe transfers conserve water and every solute.

**Saves.** World saves are version 3: they add the beet fields, mud and occluded impurities of each vessel and the
centrifuge casing. The game also writes `user://logistics-v1.json` next to the world save (clock, orders, the
truck at the curb, crates), validated in full before it replaces anything.

## Data and art

- `godot/data/shop.json`: the clock, the curb, the vehicles, the return fee and the suppliers.
- `godot/data/equipment.json`: the kit with crated pieces, their sprite regions and clear insides; the new
  ingredients (beets become cossettes with the shredder, lime); the tools; gas and electricity prices; the carry
  limit.
- `godot/data/build_costs.json`: pipe, valve and pump as cell-by-cell build items.
- `godot/data/workshop.json`: beets, lime and the by-products and grades with their prices.
- `godot/art/equipment.png` (192 × 80) and `godot/art/vehicles.png` (the van and the tanker): placeholders from
  `tools/make-equipment-sprites.py`.
- `godot/core/logistics.gd` (`LogisticsModel`): the clock, orders, trucks, fees and crates, pure and fixed-step.
  `godot/shop_panel.gd` draws the shop, steps the model with the campaign, connects the tanker and draws the trucks.

The workshop panel no longer sells supplies on the spot; it is where products are sold until M3 brings buyers.

## Tests

- Native (`sandbox_tests.cpp`): tanks drain to an equal level through a pipe and conserve salt and water, a valve
  stops them, a pump lifts a drum into a tote, an open pipe end leaks, a tank bottles sea water; the tanker pushes
  100 kg up through the coupling into a tote and nothing flows without it; the beet chain from cossettes to white
  sugar at 99.7 % with pulp, lime mud and molasses, whole beets and unlimed juice for comparison, balanced books, an
  M2 save.
- Godot (`tests/logistics.gd`): the clock, prices, orders and their limits, arrivals after the lead time, one truck
  at a time, unloading to stock and crates, the return fee, a tanker waiting for a coupling, finishing and stalling,
  saves and their validation.
- Godot (`tests/integration.gd`): the laptop opens the shop, a kettle ordered, delivered, unpacked and packed again,
  its burner, beets through the shredder, the pH meter, pipes laid by dragging and removed, a valve, a pump paid
  for once, a tanker filling a tote through a coupling and a pipe run in the campaign world, delivery saves.
- `tests/m2_capture.gd` renders the yard with the tanker pumping and the kettle steeping beets.

## Not in M2

Selling to buyers (M3); condensers and stills (closed vessels with vapour ports); multiple-effect evaporation and
heat exchange to cut the gas bill; a second strike from molasses; real sprites; truck animation beyond driving in
and out. The economy needs a playtest before G1.
