# Tidepool roadmap

Ideas for more liquid interactions and mixing. Today two liquids can only swap places, harden into a block, or
destroy each other; they can't blend. Phase 1 adds blending, and much of the rest builds on it.

Each phase fits the current layout: new liquids are rows in `js/liquids.js`, mixing rules go in `js/reactions.js`,
and every phase gets its own scenes in `tools/simtest.mjs`.

## Suggested order

1. ~~Phase 1, plus sand, mud and glass from Phase 2: the most new mixing for the effort.~~ Done; see the notes below.
2. ~~Stormwater and power (Phases 3 and 5): liquid starts doing logic.~~ Done, with molten metal from Phase 3.
3. ~~Gases and nitro: chain reactions.~~ Done.
4. ~~Erosion and weather.~~ Done.
5. ~~Momentum, last: it's the hardest, and nothing earlier depends on it.~~ Done.

## Phase 1: Real mixing (the foundation)

- [x] **Dissolved contents.** A second channel per tile: what is dissolved in its liquid, and how much. It moves with
  the flow and slowly spreads into neighbouring tiles of the same liquid. Lives next to the tile arrays in
  `js/world.js` and updates in `js/sim.js`.
- [x] **Salt and brine.** Salt dissolves into water and makes brine. Brine is heavier, so it sinks under fresh water
  and lakes form visible layers. It freezes at a lower temperature, and evaporating brine leaves salt crystals.
- [x] **Dyes.** Coloured inks that tint water, so two streams visibly swirl together where they meet.
- [x] **Brewing.** A recipe table checks what's dissolved in each water tile and its temperature (diffusion evens a pool
  out, so a whole pool brews together). Example: water with
  bloomwater and honey, heated past 80°, becomes a healing tonic that heals the explorer or makes plants grow fast.
- [x] **Emulsions.** Oil and water churned hard (for example at a pump outlet) become a cloudy foam that slowly
  separates back into oil on top of water.

### What was built for Phase 1

- `sol` in `js/world.js` holds six channels per tile: salt, sugar, essence and red, yellow and blue ink. Moving liquid
  carries them (`carryHeat` also calls `carrySol`), swaps exchange them, pumps keep them in their buffer, and every fourth
  tick `soluteTick` lets them spread into touching tiles of the same liquid. Salt and sugar spread much more slowly than ink.
- Water dissolves salt blocks. Salty or sweet water sinks through fresher water a row at a time, so lakes layer. Salt
  lowers the freezing point (down to about −36°) and raises the boiling point; boiling brine or syrup can leave a salt or
  crisp-honey block. Frost can't freeze strong brine.
- Water dissolves honey into sugar; icy water (below 10°) sets it into honeycomb instead. Bloomwater dissolves into water
  as essence.
- Recipes: sugar + essence above 80° brew **tonic** (grows moss and glowcaps fast, wards the explorer against lava, acid
  and heat for ten seconds); salt + essence below 0° brew **frost**.
- **Foam**: a pump outlet pushing oil into water (or water into oil), or water falling onto oil, churns foam. It floats
  on water, sits under oil, and slowly splits back into oil and water.

## Phase 2: Powders and solids that react with liquid

- [x] **Sand**: a falling powder that piles up at a slope instead of spreading flat.
- [x] **Sand + water → mud**: slow and sticky; heat dries it into clay brick.
- [x] **Sand + lava → glass**: a see-through block that lets light into caves.
- [ ] **Absorbent dirt**: soaks up water and turns darker; wet dirt grows grass and slowly releases its water.
- [ ] **Sponge blocks**: fill up with liquid and squeeze it back out when heated.

## Phase 3: New liquids with new kinds of behaviour

- [x] **Stormwater**: an electric liquid. A connected body of water carries a switch's power to any machine it touches,
  so liquid becomes wiring. Shocks slime and the explorer, and lights up the water it flows through.
- [x] **Nitro**: explodes from heat or a hard landing. The blast breaks blocks within a radius, pushes nearby liquid
  outward and throws objects.
- [x] **Gases**: smoke, poisonous gas from acid meeting metal, and methane from rotting slime. Gases rise and spread;
  methane catches fire.
- [ ] **Void ink**: deletes any liquid it touches. If it meets aether, both vanish in a flash of light.
- [ ] **Mimic**: turns into whatever liquid it touches first.
- [x] **Molten metal**: cools into metal blocks that carry electricity and heat (ties into the power system in Phase 5).

## Phase 4: Liquids changing the world

- [x] **Erosion**: fast-moving water wears away dirt, carries it as sediment and drops it as mud where it slows down,
  so rivers carve their own channels.
- [x] **Weather**: rain fills lakes, daytime sun dries shallow puddles, nights freeze lake surfaces.
- [x] **Temperature changes thickness**: honey runs when warm, oil thickens in the cold, lava slows as it cools.
- [x] **Breakable floating debris**: broken wood and ice turn into floating objects (ice floes, drifting planks). (Built
  later: lake ice in Phase 17, planks with the loose ends below.)
- [x] **Momentum** (biggest change): each tile remembers which way its liquid is moving. Gives waves that slosh,
  whirlpools at drains, and waterfalls that shove objects. The hardest item here, and it costs performance.

## Phase 5: Machines built around liquid

- [x] **Pipes**: pipe tiles carry liquid along a path, with valves and filters that separate a mix by density.
- [x] **Separator**: pulls a mixed tank apart: splits foam back into oil and water, and takes dissolved contents out
  (brine's salt comes out as salt blocks).
- [x] **Boiler and turbine**: steam spins a turbine that powers machines; a **water wheel** does the same with running
  water. Turns the switches into a real power network.
- [x] **Logic**: AND, OR and NOT gates and counters for the switch system, plus a sensor that only reacts to one
  kind of liquid.

### What was built for step 2

- Conductors are metal blocks, stormwater and brine (water with at least 60 salt). Every tick `js/power.js` floods
  outward from each switch and generator through the conductors it touches; a network is live while any of those is
  on. A target touching a network is controlled by it, like a wire; a network no source touches does nothing, so a
  drain in a salty lake keeps working.
- Live liquid crackles and glows, kills slime it touches, and throws the explorer out (tonic's ward protects).
- Generators: a **turbine** is on while steam presses on it, and cools that steam so it rains back down; a **water
  wheel** is on while liquid flows past it. A **boiler** holds itself at 200° while powered.
- Logic gates and counters read their wires and the networks they touch, and drive only their wires, so contact can't
  loop back into them. A gate's output reaches the next gate a tick later. NOT is on with no input; a counter is on at
  every Nth rising input (click it to pick N).
- A liquid sensor can be set to one liquid by clicking it with that liquid picked.
- **Pipes** only open at their ends. Every tick a network moves liquid from the mouth with the highest surface to the
  lowest mouth that can take it, pushing it up the column if that mouth is full, so two tanks joined by a pipe level out.
  A **valve** is a pipe tile that passes while powered (or clicked open); a **filter** passes one liquid.
- **Molten metal** is heavy and very hot; it sets into metal below 1000° or at once where water touches it.

### What was built for step 3

- **Gases** are liquids drawn thin: smoke and methane fall upward, poison gas is heavier than air and pools in low
  places and on water. A rising liquid only trades places with a heavier one above it, so methane layers over smoke
  and smoke over steam. `js/gases.js` thins smoke out, fades poison slowly, and lets smoke and methane escape at the
  top of the open sky.
- Sources: fires give off smoke, slime bubbles methane, and acid corrodes metal slowly into poison gas. Poison hurts
  the explorer and withers moss.
- Methane lights above 120° or against lava and burns in a flash: each burning tile heats its neighbours hard, so a
  spark burns a whole cloud in a few ticks.
- **Nitro** goes off above 150°, after falling six rows or more onto something it can't sink into, or when live power
  touches it, so a lever and a metal line make a detonator. Nitro is denser than water and sinks through it safely.
  `js/blast.js` breaks blocks (not obsidian, metal or machines), pushes liquid out, fills the hole with smoke, throws
  bodies, shakes the screen, and heats everything in reach, which sets off the next charge.
- `drop` in `js/world.js` counts how many rows a tile's liquid has fallen without stopping.

### What was built for step 4

- **Erosion** (`js/erosion.js`): silt is a seventh dissolved channel. Water that is flowing (it received a good amount
  of liquid in the last few ticks) wears away the dirt and sand under and beside it, three times faster where it lands
  from a fall, and carries it as silt. Silt sinks like brine and turns water brown. Still, silty water on the bottom
  becomes mud, and mud on the bottom under still water or more mud packs into dirt, so a waterfall digs a plunge pool
  and the dirt it takes comes to rest downstream.
- **Weather** (`js/weather.js`, the **Weather** toggle, key I): showers of 20 to 60 seconds come every one to
  three minutes (or with **Rain now**). Raindrops fall from the top of the open sky and the sky dims while it rains.
  The open air follows `skyTemp()`: 45° at noon, −15° at midnight, cooler in rain. Surfaces open to the sky follow it
  too, so lakes in the open freeze over at night; the ice insulates the water under it. The daytime sun dries shallow
  puddles and melts ice it shines on, and water warmer than 15° slowly melts ice it touches. Falling water never
  freezes, so cold rain still lands as water. Caves keep their steady 20°.
- Boiling muddy water can leave a dirt block, like brine leaves salt.

### What was built for step 5

- `vel` in `js/world.js` holds each tile's sideways speed, from −1 to 1 tiles per tick. Every tick `js/momentum.js`
  speeds resting liquid towards the low side of its surface, slows it by the liquid's thickness (honey and mud hardly
  slosh), then moves part of the tile on in the direction it's going. Fast liquid hitting a wall surges up it, then
  bounces back at 40%; pushing into a full tile passes half the push on, so waves travel through a body of liquid.
  Only liquid resting on something feels the slope or moves; it goes over an edge only in big parcels, and never
  makes drops smaller than its smallest puddle, so it doesn't spray thin dribbles. Moving liquid carries its speed
  like its heat.
- Sources: pump outlets and springs jet sideways, falls splash outward where they land (harder from higher), blasts
  throw liquid out, and a body landing fast in liquid sends out a wave. Active drains pull liquid in and become
  whirlpools that drag floating bodies round.
- Bodies ride currents, and falling water shoves them down. Fast surface water shows soft whitecaps; whirlpools draw
  a spiral. Waves die down and the chunks fall asleep again.
- It costs about a tenth of a millisecond per tick; the **Momentum** button turns it off.

## Real-world reactions (audit after step 5)

Every pair of real liquids, and each real liquid against heat and blocks, was checked for a natural reaction that was
missing. Added:

- Quicksilver boils above 357° into toxic vapour (poison gas, which is heavy and pools low, as mercury vapour does).
- Foam heated past 90° breaks: its water boils off and the oil is left.
- Honeycomb's wax melts above 70° and the honey runs out; metal melts above 1300°.
- Water soaks up smoke and poison gas that touch it (gas bubbling up through water is washed out); diluting acid
  warms the water; water dissolves crisp honey (caramel) into sugar; salt melts ice into brine.
- Acid no longer eats sand: silica, like glass, resists it.
- Flowing water washes mud away as silt, the sun dries mud into dirt, and mud rotting under still water bubbles
  methane (swamp gas) up to the surface.
- Oil hot enough to smoke but not yet burn (110–150°) smokes; steam scalds the explorer.

Left for later: rust on metal under water, ice floating (needs the floating-debris item), nitro freezing.

## Phase 6: Living things and goals

- [x] **Creatures**: fish that swim in water and die in acid, salamanders that live in lava, slime monsters that split
  in two, and plants that drink water to grow.
- [x] **Puzzle levels**: goals like "make 20 tiles of glass", "brew a tonic in the cauldron" or "flood the lower
  chamber without touching the lava".

### What was built for Phase 6

- **Creatures** are bodies (so they float, sink and are pushed like crates) moved by `js/creatures.js`:
  - **Fish** swim about in water and breed in a pool with others. Out of water they flop towards water they can see
    and die after about seven seconds; acid, poison, live power, lava, water above 45° and being frozen in kill them.
  - **Salamanders** swim in lava and walk out of it, heating what they stand on enough to light wood and oil. They
    glow. Water kills them, and so does staying cool (below 200°) for fifteen seconds.
  - **Slimelings** hop about, towards the explorer when close, and hurt it. They soak up slime and split in two when
    they've absorbed a tile's worth. Acid, lava, heat, live power and touching salt kill them.
- **Plants** (`js/plants.js`, the Seed tool) grow from a seed on dirt or moss: each sip of water (or mud) from within
  three tiles of the root adds growth, tonic four times as much, and they grow up to 5–10 tiles with leaves. Without
  water they wilt from the top; they stop growing while the root is frozen. They burn and acid eats them. A few grow
  along the surface of a new world, which also has fish in the cave lake and a salamander in the lava pool.
- **Puzzle levels** (`js/levels.js`, the Mode menu): five hand-built scenes in a sunlit stone room, each with a goal,
  sometimes a way to lose, a dashed goal region (green once solved), and only the tools the puzzle needs. Right-click
  digging is allowed only where digging is. The goal bar shows progress, Restart and Next.
  1. **Glassworks**: open the hopper over the lava to melt 15 tiles of glass.
  2. **The cauldron**: fill, heat, add honey and bloomwater, and brew 10 tiles of tonic.
  3. **The lower chamber**: fill it with 60 tiles of water through the valve and the pipe under the lava; the
     floodgate drops the water straight onto the lava and loses.
  4. **Save the fish**: dig down from their pond so at least 4 fish fall into the lake below.
  5. **Steam power**: open the valve so water floods the room over the lava, and the steam turns the turbine that
     opens the vault.
- Every level is played through by a scripted solution in `tools/simtest.mjs`, so the tests show each one can be
  solved (and that the lower chamber's wrong route loses).
- Changes made while building the levels: boilers run at 200° (gentler, so a pot simmers instead of flashing to
  steam); warmer liquid now rises through cooler liquid above it (convection), so a pot heats evenly; and honey sets
  into honeycomb only in icy water (below 10°), dissolving into sugar in any other water.

## Phase 7: Sky — clouds and wind (built; the plan follows, then what was built)

Today rain is a timer: showers start at random and fall evenly across the whole sky. This phase replaces that with a
small water cycle in the open air, so rain comes from clouds that form where there's water to evaporate and drift
on the wind.

### The air grid

- A coarse grid over the open sky: one **air cell** per 4 × 4 tiles (64 × 32 cells for today's world), in a new
  `js/air.js`. Each cell holds humidity (water vapour, 0–255), cloud (condensed water, 0–255), temperature, and wind
  (u, v). Cells under ground or filled with blocks are inert.
- Updated every 8 ticks, so it costs far less than the tile simulation.

### The water cycle

- **Evaporation:** open water surfaces (and wet ground, puddles, steam vents, boiling lakes) add humidity to the
  air cell above them, faster when warm, sunny and windy. The water taken comes off the surface, so the water cycle
  roughly balances instead of flooding the world.
- **Rising air:** warm ground (sunlit surfaces, lava, fires) makes updrafts. Air cools as it rises (about −0.5° per
  tile of height), so humidity carried up condenses into cloud once the air reaches its dew point.
- **Clouds** grow, merge and drift with the wind; in dry air they slowly evaporate back into humidity.
- **Rain** falls from cells whose cloud passes a threshold, straight down from that cloud (slanted by the wind), and
  uses up the cloud. Below 0° it falls as **snow** (a new powder block that piles like sand, melts above 2° and packs
  into ice under its own weight).
- **Fog:** on calm, cold nights, humid air near the ground condenses into a low fog in valleys and over lakes; the
  morning sun burns it off.
- **Shade:** clouds dim the sky light under them and cut the sun's drying and warming there.
- **Thunderstorms:** tall, dense clouds occasionally strike the highest exposed tile below with **lightning**: it sets
  wood alight, sends a power pulse through metal, stormwater and brine, and sets off nitro.

### Wind

- A **prevailing wind** (direction and strength) that changes slowly, so weather comes in fronts; plus gusts.
- Each air cell's wind relaxes towards the prevailing wind, is slowed near the ground, is turned upward where it
  meets rising terrain, and is lifted by updrafts over warm ground.
- **Mountains make rain shadows:** air pushed up a slope cools and rains on the windward side, then arrives dry on
  the far side. This is what will make deserts behind mountain ranges in Phase 8.
- **What wind moves:** clouds; smoke, steam and gases in the open (a sideways push on gas tiles); falling rain and
  snow; waves on open water (it feeds the momentum of surface tiles); floating bodies and the explorer, slightly;
  fire, which spreads faster downwind; and drying, which is faster in wind.
- A **windmill** machine for the power system: on while the wind at its tile is strong enough.

### Drawing

- Clouds as soft, flat shapes in two or three tones, matching the plain gradient sky (no dithering, no noise).
  Darker and lower for storm clouds. Rain and snow streaks slanted by the wind. A wind arrow and strength in the
  status line.

### Order and tests

1. Air grid with humidity, evaporation and condensation; rain from clouds replaces the random showers.
2. Wind field and drifting clouds; wind on gases, rain, waves and fire.
3. Rain shadows over terrain, fog, snow.
4. Lightning and the windmill.

Tests: a lake in the sun loses water to humidity and gets it back as rain (total water roughly conserved); clouds
drift downwind; smoke in the open drifts downwind; a hill gets more rain on its windward side; a cold night makes fog
in a valley; lightning lights a lone wooden post.

### What was built for Phase 7

- `js/air.js`: one air cell per 4 × 4 tiles (128 × 32), updated every 8 ticks. Vapour and cloud are in liquid units,
  and water moves between the ground and the air without being made or lost (a test checks this to 2%).
  - Evaporation from each column's open water surface: faster when warm, sunny, windy and in dry air, three times as
    fast for a thin puddle. Steam that reaches the open joins the air. Dried-out brine leaves a salt block.
  - Air holds `60 × 2^(t / 11)` units of vapour per cell; above that it condenses into cloud, and below it cloud
    evaporates back. Air is 0.5° colder per tile of height, so rising air condenses: mountains wring rain out of air
    pushed up them and leave a dry shadow behind (tested), and calm, cold nights make fog in the cells on the ground.
  - Clouds over 160 units rain (or snow below 0°) from their underside. Storm clouds (420+ in a cell, 1000+ in the
    column) can strike the first thing below with lightning: it heats it by 900° (wood catches, nitro goes off),
    powers the network it hits for a moment, stuns the explorer, and flashes.
  - Wind: a prevailing wind that shifts every two to five minutes, a third as strong at the ground, turned upward
    where it meets a slope and lifted over sunlit ground. It carries vapour and cloud (the world wraps sideways), drifts
    smoke, methane and poison gas in the open every other tick, ruffles open water (feeding its momentum), pushes things
    in the air, and fans fire downwind.
  - Humid biomes add vapour near the ground and dry ones bleed it away; clouds shade what's under them (cooler, less
    light, less drying).
- Random showers are gone: rain only comes from clouds, and **Rain now** heaps cloud over the view.
- Snow is a powder that floats on water, melts above 2° into a quarter tile of water, and packs into ice under three
  tiles of snow. A **windmill** is a power source that turns while the wind at it is over 0.2.
- Clouds are drawn as flat shapes in three tones (pale fringe, white body, grey storm core), fog paler; rain streaks
  only under raining clouds, slanted by the wind, and snowflakes where the air is below 0°; a lightning bolt and flash.
  The status line shows the season, day and wind.

## Phase 8: Biomes (built; the plan follows, then what was built)

The world gets regions with their own climate, ground and features. A biome is a set of numbers the existing systems
already read (air temperature offset, humidity, how often it rains, wind exposure) plus what the generator builds
there. Most of the behaviour then comes for free: freezing, drying, erosion, swamp gas and the Phase 7 water cycle
all respond to the climate.

### Climate mechanics (needed first)

- **Per-column climate:** each column of the world has a temperature offset and a humidity, blended across biome
  borders over about 16 tiles. `skyTemp()` becomes per column; the Phase 7 air grid starts from these values.
- **Altitude:** air gets colder with height above sea level, so peaks keep snow while valleys thaw.
- **Depth:** the ground gets warmer the deeper you go (a geothermal gradient), towards the magma layer at the bottom.
- **Seasons:** a long cycle (several days) that shifts temperatures, so temperate lakes freeze in winter and deserts
  bake in summer.
- **Droughts and wet spells:** each biome has its own chance of long dry spells (no rain, faster evaporation, plants
  wither, fires spread) and of wet spells (daily rain, rising lakes, floods).
- **A wider world:** 256 tiles fits only three or four biomes. Widening it (for example to 1024 × 192) keeps working
  because sleeping chunks cost almost nothing; the camera already scrolls.

### Biomes

| Biome | Climate | Ground and features |
| --- | --- | --- |
| Grassland (today's world) | mild, some rain | dirt and grass, small lakes |
| Forest | mild, rainy | trees of wood with moss, leaf litter; fires spread in droughts |
| Jungle | hot, wet; rain most days | deep moss, bloomwater springs, fast plant growth |
| Swamp | warm, wet, still air | mud flats, shallow silty water, swamp gas, slime nests |
| Desert | hot by day, cold at night, very dry | sand dunes, long droughts, rare flash floods that carve dry channels (wadis), buried oases |
| Salt flats | hot, dry | brine lakes that evaporate into salt crust |
| Badlands | dry | layered clay and brick cliffs that flash floods carve into canyons |
| Tundra | cold, light snow | permafrost (frozen dirt), lakes frozen most of the year, snow cover |
| Glacier mountains | very cold, snowy peaks | ice and snow caps, meltwater streams on warm days, crevasses |
| Coast | mild, windy | a sea of brine at the world's edge, sand beaches, tides that rise and fall with the day, waves |
| Volcanic | hot ground | lava lakes, basalt and obsidian, hot springs, geysers, poison gas vents, ash smoke |

Underground layers, under every biome:

| Layer | Features |
| --- | --- |
| Shallow caves | today's caves and pockets |
| Aquifers | water-filled rock below the water table, so digging down floods |
| Deep caverns | warmer, quicksilver and oil seeps, crystal and aether (fantasy, later) |
| Magma layer | lava sea and molten metal at the bottom |

### New things the biomes need

- **Snow** (shared with Phase 7) and **permafrost** (frozen dirt that thaws into mud above 0°).
- **Trees**: wood trunks and leaf blocks (leaves burn fast, fall as litter); Phase 6 plants grow them.
- **Geysers**: a water pocket over hot rock that builds pressure and erupts steam and water on a cycle.
- **Tides**: the coast's sea level follows the day.
- **Clay**: a dirt-like block that bakes into brick (badlands, riverbanks).

### Order

1. Climate mechanics: per-column temperature and humidity, altitude, depth, seasons.
2. Generator: a biome map along the world, three or four biomes per seed at first, then the wider world.
3. Biomes in this order: desert and tundra (strongest contrast with today's world), swamp, coast, volcanic, forest,
   jungle, glacier, salt flats, badlands; then the underground layers.

Tests per biome: the climate it promises (a tundra lake stays frozen, a desert puddle dries in a day, swamp mud
bubbles methane), and a generated world contains each biome it lists.

### What was built for Phase 8

- The world is 512 × 128 tiles (twice as wide). Lighting is now worked out only around the view, which keeps a frame
  at about 7 ms; a tick is about 2.6 ms, as more of the deep underground stays awake (groundwater and the magma sea).
- `js/climate.js`: per-column temperature offset, humidity, wind exposure and day/night swing, blended across 16
  tiles; the sky temperature at any tile (`skyTempAt`: time of day, biome, season ±12° over an eight-day year, cloud
  cover, and −0.5° per tile of height); and the resting temperature underground, which follows the biome near the
  surface and warms by 0.35° per tile of depth.
- `js/biomes.js`: grassland always where the explorer starts, then three to five of the other ten in an order set by
  the seed (a coast always at the right-hand edge). Each has its ground layers, terrain shape and features:
  forest and jungle trees, jungle moss and a bloomwater spring, swamp pools of silty water over mud with a slime nest,
  desert dunes and sometimes an oasis, a salt-flat brine lake on a salt crust, badland mesas of clay and brick, tundra
  snow over permafrost with a frozen lake, glacier peaks of ice under snow with crevasses, a coast sloping into a sea of
  brine with tides, and a volcano with a crater lava lake, a geyser and a gas vent.
- Underground in every world: water-filled aquifers below the water table, larger caverns deeper down with oil and
  quicksilver seeps, and a magma sea under a basalt crust at the bottom.
- Dry and wet spells: each biome has a chance per day of each. A drought stops clouds raining there and doubles
  evaporation; a wet spell doubles it and brings in moist air. The status line names the biome under the view and any
  spell.
- New blocks: snow, permafrost (thaws into mud above 2°), clay (bakes into brick above 400°); new machines: windmill,
  geyser and gas vent.
- Rule changes: the sun thaws ice only when the air is above freezing, and evaporation is faster in dry air (it was
  wrongly slower).

### Audit after Phase 15: nothing from nowhere

Weather now follows the water cycle everywhere; before, a few rules made or deleted water.
- Humid biomes draw moist air in from the rest of the world, and dry ones send theirs away, instead of creating and
  deleting vapour. A wet spell does the same, and cools the air by 4°.
- A drought warms the air by 12°, so passing clouds dissolve and less rain falls, instead of a rule that stopped rain.
- The tide fills the coast from a store of open sea beyond the edge (600 tiles) and drains back into it.
- Rain now gathers vapour that's already in the air into cloud over the view.
- Mud baked dry, soil drying out, and the water plants drink all go up into the air as vapour.
- Lightning needs warm ground under the storm (above 5°), so frozen biomes don't get thunderstorms.
- Already conserved: rain and snow from clouds (a snow tile costs a cloud 64 units and melts back into 64), evaporation,
  steam, the sun thawing ice. Still made from nothing on purpose: the player's liquid tools and springs, the gas vent
  (volcanic gas from the magma below).

## Extensions (phases 9–16)

Ideas from the review after Phase 8. The toolbar already has 79 buttons, so Phase 9 comes first: almost every later
phase adds tools.

### Suggested order

1. ~~Phase 9, the tool picker: needed before adding much else.~~ Done.
2. ~~Phase 10, save, load and undo: every later feature is more fun when you can keep and rewind your work.~~ Done,
   except the level editor.
3. ~~Phase 11, the explorer's bucket and inventory: the biggest change to how the game plays.~~ Done.
4. ~~Phase 12, acidity and alkali (with the other chemistry): the most new mixing for the effort.~~ Done.
5. ~~Phase 14, expanded electricity, then Phase 15, ecology.~~ Done.
6. Phase 13's blocks and liquids fit in whenever a phase above needs them; Phase 16 (performance) when the world or
   the tests outgrow the main thread.

## Phase 9: A tool picker

- [x] **Compact palette**: tools grouped into categories (liquids, terrain, objects, machines) in a palette that opens
  on demand, with the display and world toggles in a dropdown, so the playfield is visible when the page opens. The
  toolbar went from 482 px to 91 px tall at 1280 × 800.
- [x] **Search**: type a few letters to find a tool among dozens (`/` jumps to the box, Enter picks the first match).
- [x] **Recent tools**: the last six tools used stay one click away, remembered between visits. In a puzzle the bar
  shows the puzzle's tools instead.

## Phase 10: Keeping and sharing work

- [x] **Save and load**: four save slots in the browser (IndexedDB), a world code (the whole world as compressed text,
  about 350 KB) to copy and paste anywhere, and export and import of the same code as a `.tidepool` file. The shared page
  can't start downloads, so there the world code is the way to move a world.
- [x] **Share by seed**: `#seed-123` at the end of the page's link opens that seed's world, and the menu builds any
  seed. Generation now draws from a random generator seeded by the world's seed and starts from a blank slate, so the
  same seed builds the same world every time.
- [x] **Undo and rewind**: a snapshot before every edit and every 4 s of play, the last 12 kept (about 30 MB);
  Ctrl+Z or the Undo button steps back through them.
- [x] **Level editor**: build a puzzle, set its goal and allowed tools, and share it; reuses the level system in
  `js/levels.js`. (Built after Phase 18; see "Level editor" below.)

## Phase 11: The explorer's tools

- [x] **Bucket**: Enter scoops up one tile of liquid (with its heat and dissolved contents) and pours it somewhere
  else; what doesn't fit stays in the bucket, so no liquid is made or lost.
- [x] **Pickaxe and a small inventory**: hold D to dig (harder blocks take longer, with cracks showing progress),
  press D with nothing to dig to place the chosen block, Shift+D or a click on the bag picks the next block. The bag
  holds 8 kinds of block, 99 of each. Ice shatters into its water instead of going in the bag; machines and plants
  can't be dug. Holding Down aims below the explorer. Puzzles switch both tools off unless they list them.
- [x] **Raft and boat**: wooden floating objects (Objects tools). Standing on one that floats, the arrows paddle it
  instead of walking off (the boat is twice as fast); Up jumps off. They burn and rot like crates.
- [x] **Balloon**: placed above a body, it ties itself to it with a rope. A taut rope hands the balloon's lift to the
  body: it lifts a crate or the explorer, but a weight holds it down. Heat, lava or acid pops it.
- [x] **Air meter and health**: liquid over the face (or smoke and poison) uses up air in about 6 s; out of air,
  health drains. Lava, shocks, acid, scalding and heat hurt; bitter cold slowly does. Health comes back after 3 s
  without harm. At 0 the explorer faints and wakes at the spawn point, losing the bucket's contents; in a puzzle,
  fainting fails it. The corner panel shows health, and air while it's below full.

## Phase 12: Chemistry

- [x] **Acidity**: a pH for every liquid (water's comes from what's dissolved in it), and lye. Acid and lye dissolve
  into water as concentrations (two new dissolved channels); where they meet they cancel, warming the water and leaving
  salt. Lye turns oil into soapy foam and kills slime. Older world codes and saves still load.
- [x] **Fizz**: acid (strong, or dissolved in water) on baking soda fizzes into carbon dioxide: a heavy gas that sinks
  and pools, smothers fire and can't be breathed. A little dissolves into water as weak acid.
- [x] **Reactions that depend on concentration**: dissolved acid eats blocks at a rate set by its strength and is
  used up doing it; below a threshold it's harmless. Neutralising and fizzing depend on concentration too.
- [x] **Growing crystals**: still, saturated brine grows glowing salt crystals on any surface; fresh water dissolves
  them back.

## Phase 13: More blocks and liquids

Blocks:
- [x] **Sponge and absorbent soil** (carried over from Phase 2): a sponge soaks up a tile of water and gives it back
  when a weight stands on it, or as steam when heated. Dirt soaks up a little water as wet soil, passes it down into
  dry dirt, drips it into caves below, dries in the heat, and sprouts plants under open sky.
- [x] **Porous rock**: liquid resting on it seeps through to the space below (rising gases seep up).
- [x] **Insulation and copper**: wool barely takes up heat (and burns); copper takes it up fast and carries power
  like metal.
- [x] **Membrane**: a device set to one liquid (click it to switch to the liquid you last picked); that liquid passes
  down through it, up for gases, and sideways towards the lower side, and everything else is stopped.
- [x] **Coral**: grows into warm (15–32°) salt water and bleaches above 32°.
- [x] **Fuse cord**: burns fast and lights the next fuse tile in any direction, so it can turn corners and climb;
  its heat sets off nitro at the end.

Liquids:
- [x] **Void ink and mimic** (carried over from Phase 3): void ink deletes any liquid it touches and is used up
  doing it (meeting aether, both vanish in a flash); mimic turns into the first liquid it touches.
- [x] **Coolant**: never freezes or boils, carries heat fast, puts out fires and quenches lava into basalt. (Feeding
  boilers was added in Phase 14.)
- [x] **Ferrofluid**: heavy and dark; a magnet block pulls any within 8 tiles towards it (into spikes), and draws
  iron weights too.
- [x] **Liquid light**: glows brightly. (It powers solar panels since Phase 14.)
- [x] **Fertiliser**: dissolves into water as a new dissolved channel. Plants on fertilised water grow faster, moss
  creeps over stone beside it, and in the light it feeds algae (Phase 15) into a bloom that kills its fish.

## Phase 14: Electricity, expanded

- [x] **Batteries**: charge from a live line or a wire (up to 20 s of power), and feed their line and wires once nothing
  else does. A battery only counts the power from other sources, so it never charges from itself.
- [x] **Lamps**: light up only while powered.
- [x] **Motors**: a running motor drives every machine it touches, as if wired to it, and pushes liquid through itself
  towards its marked side (click it to turn it round).
- [x] **Magnets**: an electromagnet device pulls ferrofluid and iron weights like the magnet block, but only while
  powered.
- [x] **Solar panels**: power in daylight under open sky (not at night or under heavy cloud), or beside liquid light
  underground.
- [x] **Coolant in boiler circuits** (carried over from Phase 13): a boiler touching coolant runs on the coolant's heat,
  boiling while it is above 200° and drawing that heat off.

## Phase 15: Ecology

- [x] **Food chains**: algae is a dissolved channel in water that grows only in the light (daylight under open sky,
  or liquid light beside it). Plain water feeds a thin wild growth; fertiliser feeds it much further, faster the
  thicker it gets. Fish graze it and breed only while fed. (Hungry fish don't die: the new world's cave-lake fish
  have no light, so starvation would kill them within minutes.)
- [x] **Rot**: dead fish and slimelings rot into the water as fertiliser, or leave a little fertiliser where they
  fall (burnt ones don't); wilting plants drip fertiliser; algae in the dark, or too crowded, dies back into
  fertiliser.
- [x] **Algae blooms**: thick algae (120+) turns a lake green and suffocates the fish in it; the dead fish rot and
  feed it more.

## Phase 16: Performance

Status: done (see "What was built" below). The Web Worker stays deferred.

### Measurements (default world, headless, `node tools/profile.mjs 400 --hot`)

A simulation tick takes about 12 ms on average (median 9, 95th percentile 24) and drawing a frame about 23 ms (median
19, 95th percentile 55). At 60 ticks a second on one thread that is roughly 30 frames a second. Share of the CPU time:

| Where | Function | Share |
| --- | --- | --- |
| Heat spreading | `heatTick` (js/heat.js) | 13% |
| Computing light | `computeLight` (js/render/lighting.js) | 12% |
| Applying light to the frame | `applyLight` (js/render/lighting.js) | 11% |
| Compositing the frame | `render` (js/render/render.js) | 9% |
| Liquid flow | `step` (js/sim.js) | 9% |
| Drawing liquids | `drawBody` (js/render/liquids.js) | 8% |
| Momentum (waves) | `momentumTick` (js/momentum.js) | 7% |
| Fire | `fireTick` (js/fire.js) | 6% |
| Spreading light outward | `sweep` (js/render/lighting.js) | 4% |
| Powders, solutes, pipes, gas drift, sunshine | various | 1–3% each |

Drawing is about half the time and the simulation the other half. Several systems scan all 65,536 tiles every tick even
where nothing happens (fire looks at every tile to find the few burning ones; heat spreads everywhere, also where
temperatures have settled; gas drift and sunshine scan the whole world), and the light is worked out from scratch
every frame although it changes slowly.

### Decision: optimise in place first; the Web Worker is deferred

A worker would take the 12 ms of simulation off the main thread, but drawing alone is 23 ms, so frames would improve less
than it sounds, and every module that edits the world from the page (input, the explorer, devices, undo, levels) would
have to send messages instead. That architecture is specific to the browser and doesn't carry over to a game engine,
while the techniques below do (Tidepool is the reference for a later engine port).

- [x] **Active lists instead of full scans**: done as cheap early exits instead of lists (see below).
- [x] **Heat that sleeps**: settled chunks are updated an eighth as often. Momentum already ran only in awake chunks.
- [x] **Cheaper lighting**: the light is worked out every other frame; `applyLight` still runs every frame.
- [x] **Faster frame drawing**: profiled headless, checking every change against frames rendered before it (same
  seeded world, same pixels).
- [x] **Check**: numbers below; `npm run test:full` passes.
- [ ] *Deferred:* **simulation in a Web Worker**, only if the page is still not smooth after the steps above.

### What was built for Phase 16

- **Fire** (`fireTick`) skips any tile that isn't burning and is no hotter than 110°, the lowest temperature at which
  anything catches, smokes or flashes. Those tiles did nothing before either, so fire behaves exactly as it did. This
  is used instead of a list of burning tiles: a list would have to be kept up to date by every piece of code that heats
  a tile (lightning, blasts, salamanders, boilers, the heat tool, …), and the early exit needs none of that. Sunshine
  likewise checks for ice or mud before anything else. Gas drift was already cheap and is unchanged.
- **Heat sleeps** (`js/heat.js`): heat is worked out chunk by chunk. A chunk whose tiles all changed by less than
  0.05° in a heat tick falls asleep after 4 such ticks (`heatAwake` in `js/world.js`, separate from the liquids'
  `awake`, since most chunks are awake for the liquids). A sleeping chunk is updated every 8th heat tick, a different
  eighth of them each tick (staggered by `S.tick`), and that update stands in for the 8 ticks: each tile moves
  `1 - (1 - r)^8` of the way instead of `r`, so it settles at the same speed and can't overshoot. The chances of
  random phase changes (snow melting, steam condensing, …) are multiplied by 8. Any bigger change wakes the chunk,
  and so do `markDirty`, `heatWake(k)` (called by the heat and chill tools, blasts, lightning, salamanders and boilers)
  and nitro, whose chunk never sleeps so it goes off at once. Other sudden heat in a sleeping chunk is noticed at its
  next update, at most 16 ticks later. On the default world about a quarter of the chunks stay awake: the magma sea
  (convecting lava) and the coast's tide.
- **Lighting** (`updateLight` in `js/render/lighting.js`) is worked out every other frame, and at once when the
  view shows other tiles. Falling streams are classified only in the view's columns.

Measured on the default world, headless, 1200 ticks (`node tools/profile.mjs 1200`, two runs each, on a different
machine from the first measurements above):

| | Before | After |
| --- | --- | --- |
| Simulation tick | mean 2.6 ms, median 3.0, 95th 4.0 | mean 2.3 ms, median 2.35, 95th 3.65 |
| Frame | mean 7.05 ms, median 6.9, 95th 7.3 | mean 5.6 ms, median 5.2, 95th 7.1 |
| `heatTick` alone | 1.22 ms | 0.70 ms |
| `fireTick` share of CPU | 6.1% | 2.9% |
| Full tests | 72 s | 51 s |

Drawing the liquids (`drawBody` and the loop in `render`) is now the largest cost, then `applyLight`.

Then the drawing, checked pixel for pixel: a harness rendered frames from a seeded world and compared hashes of the
whole frame before and after each change; all matched.

- `drawBody` read its palette (`C.br`, `C.dr`, `C.ba`, …) about a dozen times per pixel. The palettes are objects of
  several shapes (table rows with and without `gas`, tinted copies), so each read was slow; it now reads them into
  locals once per tile. This was the single biggest cost in a frame: liquids went from about 3.8 ms to 1.2 ms. (CPU
  profiles had blamed part of it on `render`; timing the calls directly showed it.)
- The light's vertical sweeps go a row at a time instead of a column at a time (same result, memory read in order),
  and `applyLight` takes pixel centres from a table instead of dividing per pixel.
- Tried and left out: giving every liquid row the same shape didn't speed up the simulation measurably.

| | Before Phase 16 | After |
| --- | --- | --- |
| Frame, frozen world (300 frames) | 6.15 ms | 3.6 ms |
| Frame, `node tools/profile.mjs 1200` | mean 7.05 ms, median 6.9, 95th 7.3 | mean 3.9 ms, median 4.2, 95th 4.8 |

## Extensions (phases 17–18)

Ideas from the review after Phase 15. Tidepool is the reference for a later port to a game engine, so these phases
favour rules and looks that carry over; touch controls are left to the engine.

### Suggested order

1. Phase 16 (performance) first: every phase below makes the world heavier. Its measurements and plan are in the
   Phase 16 section.
2. Phase 17 one system at a time, each with its own scene in the tests.
3. Phase 18 whenever the rules settle, since looks depend on what the liquids do.

## Phase 17: Deeper simulation

Ecology (built; see below):
- [x] **Predator fish**: bigger fish that hunt small ones, so a lake keeps a balance instead of filling up.
- [x] **Spreading plants**: grown plants drop seeds that take root on nearby soil.
- [x] **Insects or birds**: small creatures over land that feed on plants and are food for something else.
- [x] **Seasonal algae**: blooms in a warm summer, dies back in winter.

Chemistry (built; see below):
- [x] **Electrolysis**: power through water splits it into hydrogen and oxygen gas.
- [x] **Smelting**: ore blocks melt into molten metal in lava or a hot boiler, leaving slag. (Lava, molten metal or a
  wood fire instead: a boiler only reaches 200°.)
- [x] **Gas mixtures**: hydrogen or methane mixed with oxygen explodes when lit; pure gas only burns.

Electricity (built; see below):
- [x] **Temperature and pressure sensors**: switches that read how hot a tile is, or how deep the liquid over it is.
- [x] **Pixel displays**: blocks that light up when powered, to build signs and counters.
- [x] **Long wires lose power**: a network's strength falls with its length, so far machines need a closer source.

Water landscapes (built; see below):
- [x] **Groundwater**: a water table in soil and porous rock that rises with rain and feeds springs and wells. (Soil
  only: porous rock still lets water seep straight through.)
- [x] **Rivers that carve valleys**: erosion over a long time cuts channels and builds deltas.
- [x] **Floating ice sheets**: lake ice forms as a sheet that floats, cracks and drifts.

### What was built for Phase 17's chemistry

- New liquids **hydrogen** (29), **oxygen** (30) and **molten slag** (31), and blocks **ore** (62) and **slag** (63).
  That fills both id tables (`NLIQ` 32, `NBLOCK` 64); the next liquid or block has to raise them. The block names in
  `js/input.js` gained the five devices from Phase 14 that were missing before ore and slag.
- **Electrolysis** (`electrolysis` in `js/power.js`, after `shockTick`): fresh water doesn't conduct, so water splits
  where it's part of a live brine network or touches a live metal or copper electrode. Each live network tries two
  random tiles a tick; a split takes 8 units of water and bubbles them up through the water and any other gas to the
  first tile that's empty or holds the same gas, as hydrogen two times in three, else oxygen. Water in equals gas out
  exactly (tested). What's dissolved stays behind, so split brine gets saltier and can saturate and grow crystals.
- **Hydrogen** rises above methane and escapes from the top of the open sky. It lights above 100° (or against lava) and
  burns in a flash: each tile becomes steam at 400° and heats its neighbours hard, so the water comes back.
- **Oxygen** is heavier than air but lighter than carbon dioxide; it pools, drifts on the wind and fades only in the
  open air (so caves keep it, and the test's water balance holds). It counts as open air for fire, so it never
  smothers one: a fire touching it heats twice as hard and uses up 4 units a tick. The explorer can breathe it.
- **Mixtures**: hydrogen or methane that lights while touching oxygen explodes (`explode` in `js/blast.js`, sized by
  the tile's amount), taking the oxygen it touches; the blast heats the rest of the mixture, which goes off in turn.
- **Smelting** (`js/heat.js`): ore melts above 850° into molten metal or molten slag, two tiles in three metal by
  position (`(x + y) % 3`), not chance, so every vein yields the same share. Molten slag is lighter than lava and
  molten metal and floats on both, sets into slag below 1000°, and water quenches it at once. A wood fire built round
  ore gets it there; a boiler (200°) doesn't. Ore and slag break in blasts and can be dug.
- **World generation**: thin veins of ore in the stone at least 24 tiles below the surface, about a thousand tiles a
  world (`underground` in `js/biomes.js`). This changes every seed's underground a little.
- Tests: `electrolysis splits water into hydrogen and oxygen`, `hydrogen burns into steam; mixed with oxygen, hydrogen
  and methane explode` (quick tier) and `smelting: ore melts into molten metal and slag`; the world test checks for ore.

### What was built for Phase 17's water landscapes

- **Groundwater** (`groundwater` in `js/materials.js`, for wet soil every materials tick): soil holds up to 96 units
  (about 38% of a tile). It soaks water from above until full and from the sides and below until soaked (86), so it
  doesn't churn with the water it seeps out. It sinks into wet soil below, evens out with the soil beside it (a
  quarter of the time, when 4 units apart), and soaked soil seeps 8 units into open space beside or below it (10%),
  which makes springs on hillsides and fills wells. Water is conserved exactly (tested). Lakes on soil lose some
  water into the ground until it's soaked.
- Fixed on the way: wet soil dripping into a nearly full tile below emptied itself and lost what didn't fit.
- Soil getting wet or drying out now calls `redraw` (in `js/world.js`: mark for drawing only) instead of
  `markDirty`, which also woke the liquid and heat; spreading groundwater otherwise kept a third more heat chunks
  awake.
- **Valleys** (`js/erosion.js`): flowing water also wears the soil over it (at half the rate), wet soil wears 1.5×
  as fast as dry, and a bank it has undercut (soil diagonally above the water with open space under it) slumps into
  it as mud, which the river washes away as silt. A wet bank's water goes into the river (and stays where the bank
  was if the river tile is full).
- **Deltas**: in still water, silt sinks down the column to the bottom water tile, which settles as mud once it's
  silty enough (the old rule), and still water over a mud bed with room lays even light silt on it.
- **Lake ice** (`floe`): water that freezes with liquid under it is marked `afloat` (a new per-tile array, saved
  with the world; older saves load with none). Lake ice drops into empty space under it, trades places with water
  over it (ice floats up), and a piece with open water beside it moves over by trading places with that water, when
  the current under it plus half the wind (in the open) pushes it hard enough; pieces inside a sheet are held in by
  their neighbours, so a sheet breaks up from its edges.
- Rivers are generated since; see "Rivers and creatures in new worlds" below.
- Test: `water landscapes: groundwater, valleys and deltas, floating ice`.

### Loose ends, pressure and fine powders (after the level editor)

- **Pressure is on by default.** Two shafts joined by a tunnel didn't level out because pressure was an option, off.
  It's on now (the Pressure button turns it off). It only looks for surfaces in awake chunks, a search covers up to
  2000 tiles (was 600), a body found to be level isn't searched again from that row for two seconds, it only moves
  liquid at least two rows down (so nearly level water isn't stirred), it leaves ferrofluid a magnet holds alone, and
  turning it on wakes the world once. Its state is reset with the world (it made the same seed build differently). It
  costs about a tenth of a simulation tick.
- **Fine powders** (`js/powders.js`): a powder tile's amount is in `held` (0 = full, so placed and generated powders,
  and old saves, are unchanged). Powder falling onto the same powder tops it up; only tiles of 128 or more slide; thin
  ones (under 96) don't stop bodies; they're drawn as deep as their amount, in single-pixel grains with a ragged top
  and no outline. New block **sugar** (67). Boiling water leaves exactly the salt or sugar it held (its water goes up
  as steam, or into the air), drying brine or syrup leaves its pinch (the rule used to make a whole block from a
  puddle), the separator lays salt out 32 grains at a time, water dissolves powder 24 grains at a time (more
  concentrated in less water), a pinch of salt melts ice into weaker brine, and snow falls in quarter-tile flakes
  costing their cloud 16 (a full tile still melts into 64). Digging a thin layer sweeps it away instead of bagging it.
- **Gases don't shove bodies.** Bodies treated gas tiles as liquid: in oxygen the explorer swam, and falling oxygen
  pushed it down. Gases now only count where they hurt (poison gas, scalding steam). Oxygen sinks at a third of the
  speed (visc 3).
- **Thickness with temperature** (`viscAt` in `js/liquids.js`): honey 10 below 5°, 6 at room temperature, 3 above 40°,
  2 above 90°; oil 6 below 0°, 2 above 80°; lava 4 above 900°, 6 above 800°, 9 below; molten metal and slag thicker
  below 1100°. Unchanged at the temperatures they usually sit at.
- **Planks**: wood broken by a blast flies out as planks half the time (a small wooden body that floats, drifts and
  burns); there's a Plank tool too.
- **Tide**: a salt crust left where the coast's sea dried is washed out by the tide instead of stopping it.
- Smaller fixes: `npm run serve` uses `python3`; erosion needs water that's really moving (sideways, or fallen two rows
  or more), so a still pool topping itself up as its floor soaks doesn't wear the floor away; the explorer's "tile in
  front" no longer depends on a fraction of a pixel; fish swim in under a moth before leaping at it, aiming the leap;
  `resetWorld` now clears plants (`plants.length = 0` had ended up inside a comment) and lake ice.
- Test: `fine powders, gases that don’t shove, warm honey, planks, and pressure on by default`. Two older tests were
  set up for pressure being off and were fixed: the acid test's tanks had a soil floor over empty space (they drained
  away), and the moth test relied on a lucky leap.

### Level editor (after Phase 18)

- **Custom levels are data** (`js/levels.js`): `S.level.custom` holds the goal (`kind`: fill the region with N tiles of
  a liquid, N blocks in it, N bodies of a kind in it, the explorer in it, or N lamps and pixels lit in it) and a way to
  lose (a liquid getting into the region, or fewer than N bodies of a kind left; fainting always loses), with labels
  for the text. `describe` writes the goal as a sentence when the maker doesn't. Custom levels are played in whatever
  world they start in and keep its time and weather (the built-in puzzles hold late morning).
- **The editor** (`js/editor.js`, Mode › Level editor, a panel under the goal bar): the draft (`S.draft`) and
  `S.editing` are world state, so saves and undo keep them. The goal area is marked by dragging on the playfield after
  pressing Mark the goal area (drawn as a blue dashed box). Play test captures the world twice, as it is (for Back to
  editor) and as the level starts (for Restart). Choosing the editor from a custom level edits that level from its
  start; from a built-in puzzle, it edits that puzzle's arena with its tools and region.
- **Level codes** are world codes taken as the level starts, so the existing Load code (and save slots and files) plays
  them; no new format. A code is about 450 KB, like any world code. Each start has an id (`started`), so undo inside a
  level keeps Restart going back to the real start.
- A level code comes from whoever made it, so its name, goal text and labels are shown escaped, never as markup.
- `npm run build` now stops on an import that renames (`import { a as b }`): the bundle drops imports, and an alias
  had left a name undefined in the built page while the module version worked.
- Test: `custom levels: goals, ways to lose, and a level code that starts in the level`. The editor's panel was tried
  in the browser: marking an area, play test, completing, Restart, Back to editor, copying a code and loading it.

### Rivers and creatures in new worlds (after Phase 17)

- `river` in `js/biomes.js`: each forest, jungle and grassland region (not the starting one) at least 70 tiles wide
  gets a river where the land allows. It rises at the region's highest ground and runs downhill (no more than 44
  columns, to leave room for the region's trees) in a channel one tile deep on a clay bed, to a pond 15 tiles wide and
  4 deep in a clay basin, dammed with clay on its low side. Caves within 9 rows under it are filled with stone, and a
  clay lip behind the source sends the water only downstream. About 5 worlds in 12 have one.
- A river never makes or loses water (`riversTick`, every 4 ticks, run whether or not weather is on): whatever brims
  over the pond (above half of its top row) seeps back underground to the source (`store`), which lets out 8 units at
  a time; the store starts with 200 tiles' worth, which wets the banks and outlasts dry weather. The sun evaporates
  some of the pond and channel (into the air, which rains it back), so in a long drought a river can run dry. Rivers
  are saved with the world (`LISTS` in `js/snapshot.js`).
- Each river pond gets six fish and a pike at its far end; forests and jungles get three moths. Tuning that came out
  of watching them in generated worlds:
  - A pike rests for 20 seconds after each meal (`PIKE_DIGEST`); before that it emptied a pond in a few seconds and
    starved. Only small fish leap at moths now, more gently and only at a moth almost straight above, since fish leaping
    sideways landed on the bank, and a pike leaping into hot noon air died of the heat. Fish die of heat only in hot
    water.
  - Moths drown only under water (rain killed them), rest clinging where they are below 5° instead of dropping into
    ponds, freeze only after 20 seconds below −20° (ordinary nights killed them), starve after three minutes, look for
    leaves within 16 tiles, eat within a tile and a half, and give up on a leaf they can't reach.
- Tree crowns regrow (`regrow` in `js/materials.js`): a leaf now and then grows a new leaf into open air beside or
  above it within two tiles of the tree's wood.
- The jungle's bloomwater spring is placed clear of a river (water dissolves it).
- Tests: the world test checks that rivers turn up with pike and moths; `a generated river keeps flowing and keeps its
  pond full` runs one for 3000 ticks.

### What was built for Phase 17's ecology

- **Seasonal algae** (`algae` in `js/solutes.js`): algae follows its water's temperature. Below 15° it grows at
  half speed, and below 8° it dies back as it does in the dark. Open lakes follow the sky and so the seasons (±12°
  over the eight-day year), so they bloom in summer and clear in winter.
- **Spreading plants** (`js/plants.js`): a grown plant that's drinking regrows a lost leaf (2% a plant tick) and drops
  a seed (0.4%) in a random column 2–6 tiles away, on the first open tile over soil within four rows of its root
  level, unless another plant stands within two tiles; at most 200 plants. Seedlings still need water within three
  tiles, so plants spread along water, not across dry ground.
- **Pike** (`hunt` in `js/creatures.js`): an 11 × 5 fish with the small fish's deaths, which chases the nearest small
  fish within six tiles and eats it on touching it (bodies push apart, so "touching" is boxes within a pixel). After
  two fish, with another pike near, it can breed (at most six). It starves after two minutes without prey and rots
  into fertiliser like other creatures. Small fish swim away from a pike within four tiles. Small fish still don't
  starve (the cave-lake rule from Phase 15).
- **Moths** (insects; `driveMoth`): 3 × 2 bodies marked `small`, which other bodies don't push. They hold themselves up
  against gravity, flutter two to five tiles over whatever is below, and head for the nearest leaf within eight
  tiles, eating it (3% a tick when beside it). After two leaves, with another moth near, they breed (at most 20). They
  die in water, lava, acid, above 60°, below 2° (winter), or after a minute without food. Fish near the surface leap
  at a moth just above them and eat it in the water or mid-leap, which counts as a meal (they're then fed and can
  breed).
- So the food chains are algae → fish → pike → fertiliser → algae, and plants → moths → fish. New worlds have pike in
  their river ponds and moths in forests and jungles (see below).
- Test: `ecology: seasonal algae, spreading plants, pike and moths`.

### What was built for Phase 17's electricity

- `NBLOCK` went from 64 to 96 (blocks are bytes everywhere, saves included), for three new devices: **temperature
  sensor** (64), **depth sensor** (65) and **pixel** (66). Ids 67–95 are free.
- The **temperature sensor** is a switch that's on while its own tile is hotter than its setting (0, 50, 100, 200,
  500 or 1000°, clicked through; 100 to start). It takes up heat like metal (rate 0.25), so it reads its surroundings
  within a second or so. The **depth sensor** is on while the unbroken column of liquid over it adds up to at least its
  setting (1, 2, 4, 8 or 16 tiles; 4 to start). Gases don't press down. Both power the conductors they touch, like the
  liquid sensor; the hover text shows the reading.
- A **pixel** is a target that lights in one of five colours while powered (click to change). It's drawn as a square
  with a dark seam, has no status light, shows at full brightness in the dark but only glows faintly, and doesn't
  conduct, so neighbouring pixels can be driven one by one.
- **Power fades** (`spread` in `js/power.js`): each source's power starts at strength 120 on the conductor tiles it
  touches and loses 1 per copper tile, 2 per metal tile and 3 per brine or stormwater tile, spreading strongest first.
  Tiles it reaches with strength left are live (`charged`); the rest of the network isn't, so it doesn't power
  machines, shock, crackle, set off nitro or split water there. Batteries charge from what reaches them before they
  feed in themselves, as before. Wire-tool links are logic links and don't fade. Hovering a conductor shows the share
  of power left. The puzzle levels and every older test still pass.
- Also fixed: the toolbar row and the explorer panel's meters shared the class `.bar`, so the meters' 90 × 7 px rule
  squashed the whole toolbar and its controls overlapped; the meters are `.meter` now. The **Explorer panel** button in
  Display & world hides the health and inventory panel (remembered between visits).

## Phase 18: Look and feel (built; see below)

- [x] **Water surfaces**: reflections of the sky and the shore, and moving light patterns (caustics) on the bottom.
- [x] **Bubbles**: from gas rising through liquid, fizzing, boiling and breathing.
- [x] **Background layers**: distant hills and cave walls that scroll slower than the world (parallax).
- [x] **Sound per liquid**: lava bubbling, honey gloop, acid hiss, each liquid with its own pour and splash.
- [x] **Music**: a soft score that follows the time of day and the weather.

### What was built for Phase 18

- `tools/shot.mjs` renders a frame headlessly and writes the view as a PNG (seed, tile to centre on, hour, zoom), so
  looks can be checked without a browser. Every visual change below was checked with it.
- **Parallax** (`js/render/backdrop.js`): two ranges of distant hills (moving at 30% and 55% of the camera's speed,
  flat in two tones each, hazier further off) and the cave walls (65%, the walls' own colours from a 512 × 512 tile,
  with broad darker patches). The terrain image is still copied into the frame as before; `drawTile` records which
  background each tile shows (`bgTile`), and only those tiles are filled in: sky pixels (recognised by the sky row's
  colour) where the hills reach, never behind liquid, and cave-wall pixels (marked in their alpha byte) where there's
  light enough to see them. Copying every pixel through the layers cost 1.9 ms a frame; this costs 0.7.
- **Reflections and caustics** (`drawBody` in `js/render/liquids.js`): clear liquids (water, stormwater, tonic, acid
  and the like; not lava, mud, oil or gases) under open sky mirror the six pixel rows above their surface into their
  surface tile, faintly and with a slight wobble; on the bottom tile of sunlit water less than eight tiles deep, bands
  of light shift across the floor, brighter in shallow water and full sun.
- **Bubbles** (`js/particles.js`): a pale pixel that rises with a wobble and pops at the surface. From gas rising
  through liquid, fizzing under liquid, electrolysis (instead of its green fizz), boiling water in the view (more as it
  gets hotter), the explorer breathing out underwater, and fish now and then. Bubbles blub.
- **Sounds per liquid** (`js/audio.js`): splashes and pours take the sound of their liquid's family (water, lava,
  thick, acid, oil, metal, glow; gases are silent), and the view's liquids give an ambience a few times a second:
  lava pops, thick liquids gloop and acid fizzes, more often the more there is.
- **Music** (`js/music.js`, the Music button): a slow pad over chords (C, Am, F, G by day; Am, F, C, G at night, an
  octave lower and slower) and a sparse pentatonic melody, through a lowpass that darkens at night and in rain, which
  also thins the melody. It runs whether or not Sound is on.
- Also: the Explorer panel and Music settings are kept out of undo and saves, like the other viewer settings.
- Afterwards, a **Time of day** setting (Display & world): day and night as before, always day (noon), always night
  (midnight), or stopped where it is. All time of day goes through `dayPhase()`, so that's the only place it applies;
  back on day and night it carries on from the held time (`S.timeShift`). Seasons keep running. It's world state
  (saved and undone with the world) and carries over to new worlds, like Weather. Test: `the time of day can be held
  at day or night, or stopped, and carries on from there`.
- Cost: a frame went from about 3.9 to 4.8 ms headless (backdrop 0.7, reflections, caustics and bubbles the rest). The
  sounds and music can't be checked headlessly: they were tried in the browser for errors only.

