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

## Next in M3

- **Street life.** Neighbours, joggers, a postman and commuters pass the plot on their own schedules, with names and
  a line or two when you point at them.
- **Customers at the door.** Odd buyers knock and ask for a product at a grade and a price; you sell from stock or
  turn them away. Served well, they come back and pay more; the stock window stays as a wholesale outlet.
- **Property.** Neighbouring plots, floors and stairs, basements, and utilities that are metered and billed.

## Tests

`tests/integration.gd` checks the light at 08:00, 06:00, 20:00 and midnight, no overlay or stars by day, a dark
plot with stars and a lamp-lit shack at 23:00, and the morning again. `tests/ui_capture.gd` renders the plot at
22:30 (`ui-night.png`).
