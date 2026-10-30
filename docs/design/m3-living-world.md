# M3 Living world: day and night, people, customers

After the first playtest the shack worked, but the world around it felt still. M3 now opens with a living world, and
the property work (plots, floors, basements, utilities and bills) follows it. See the plan's "People and the living
world" section for the longer view: vampires, the dark web and crime come with the police in M5.

## Day and night

The light follows the game clock, which runs one game minute per real second from Day 1 at 08:00:

| Time | Light |
| --- | --- |
| 07:00 to 19:00 | full day |
| 19:00 to 21:00 | dusk: the light warms, then fades to night |
| 21:00 to 05:00 | night: a cool blue dark, stars over the hills |
| 05:00 to 07:00 | dawn |

Rooms stay lit after dark: any cell with a background wall counts as indoors and gets a warm lamp light, so the shack
glows at night. (Lamps you place, and their power draw, come with the utilities later in M3.) The HUD shows a sun
from 06:00 to 20:00 and a moon otherwise. The water's sun glints and solar machines follow the same light. The
sandbox keeps its fixed day or night switch; the campaign no longer has one.

**How it works.** `godot/lighting.gd` turns the clock into a light level (smoothstep over dawn and dusk) and an
outdoor colour (white, warmer around dusk, a cool blue at night). It is a node over the world with a multiply blend:
it draws the outdoor colour over every cell, and the lamp colour over each run of indoor cells, without overlaps, so
the world texture, equipment, trucks and the player are all lit the same way. It rebuilds its runs only when the
building layer changes. The world shader draws stars in the open sky when `stars` is above zero; `main.gd` sets it,
`sunlight` and the native `environment` from the light level.

## Street life

The plot sits at the end of a dead-end street to the east. Passers-by walk in from the east edge to a turning point
past the curb, stop for a moment, and walk back: a jogger in the morning, a woman walking her dog, the postman, a man
on the phone, a night shift nurse. How many come depends on the hour (busy around 08:00 and 17:00, almost nobody at
3 am). Point at one to see who it is and what they think of your shack.

## Customers at the door

Customers walk up the yard to the shack door and knock ("Knock knock. Theo the barista is at the door."). Walk to
the door and click them to answer. The window shows who they are, how much they like you (hearts), what they want
(a product, an amount and a minimum grade) and your stock of each grade. Then:

- **Sell** a grade at least as good as they asked for, if you have enough. They pay the product's stock sell price
  times their rate (1.4 to 2.2), 5 % more for each point of reputation, and a 15 % tip for a better grade than they
  asked for.
- **Promise for later**: they come back in two to four game hours. Promises show under the clock in the HUD. Not
  having it when they come back costs two points of reputation.
- **Not today** costs a quarter point; leaving them knocking until they give up costs the same.

Each sale earns a point of reputation (1.5 for a better grade), from -3 to 5. Every game hour, each customer whose
hours include it and who has not visited in the last six hours knocks with a 22 % chance, more with reputation and
almost twice as often when you have what they want in stock. On Day 1 at 08:20 Theo comes for simple syrup, which
the starting sugar can make.

| Customer | Wants | Hours | Pays |
| --- | --- | --- | --- |
| Theo the barista | 400-600 g simple syrup, grade C+ | 07-12 | 1.5x |
| Mrs. Agatha Crumb | 600-1500 g rich syrup, grade B+ | 08-13 | 1.5x |
| Dale Pickering, DDS | 200-400 g hard candy, grade B+ | 09-17 | 1.8x |
| Chef Ramona | 100-300 g flaky sea salt (grade A) | 14-20 | 2.0x |
| Gus from the gym | 100-200 g hard candy, grade C+ | 06-10 | 1.5x |
| Pastor Ingrid | 1-3 kg sugar, grade B+ | 10-16 | 1.4x |
| Kevin | 200-500 g sea salt, grade B+ | 15-21 | 1.6x |
| Nadia on the night shift | 100-300 g hard candy, grade A | 21-03 | 1.9x |
| Mister Velkov | 400-1000 g beet syrup, any grade | 22-04 | 2.2x |

Mister Velkov is pale, keeps civilised hours and hints at "other red things": the vampire clientele comes with M5.
The stock window still sells anything at the plain stock price, as a wholesale outlet.

**How it works.** `godot/core/people.gd` (`PeopleModel`) is the pure model: passers-by, the visitor, the queue,
promises, reputation and cooldowns, stepped on the shop's game clock with the real seconds of each tick, with its own
seeded dice. `godot/people_panel.gd` steps it, draws the people and dogs (walking, turning, knocking in bursts), is
the door window, and saves `user://people-v1.json` next to the world (validated in full before it replaces
anything). `godot/data/people.json` holds the street, the traffic by hour, the products and their grades, the
passers-by and the customers with their lines. `tools/make-people-sprites.py` draws `godot/art/people.png`: sixteen
looks with idle, walking and knocking frames, and three dogs.

## Next in M3

- **Property.** Neighbouring plots, floors and stairs, basements, and utilities that are metered and billed (the
  postman will bring the bills).

## Tests

- `tests/people.gd`: hours that wrap past midnight, grades, Theo's first visit, walking up and knocking, refusing a
  sale without stock or below the grade, the price with the tip, reputation, a promise and the return, a broken
  promise, patience running out, passers-by staying on the street, a day of knocks without pestering, saves and
  their validation.
- `tests/integration.gd`: the light at 08:00, 06:00, 20:00 and midnight, no overlay or stars by day, a dark plot
  with stars and a lamp-lit shack at 23:00; a customer knocking in a toast, the tooltip, answering the door only
  from nearby, a sale from the window, a promise on the HUD, the town save.
- `tests/ui_capture.gd` renders the plot at 22:30 (`ui-night.png`); `tests/m3_capture.gd` renders the street, Theo
  at the door and Mister Velkov at night.
