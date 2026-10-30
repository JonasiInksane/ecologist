# Tidepool

A pixel-art sandbox for tile-based liquids: every tile holds one liquid and an amount from 0 to 255 that falls, spreads,
reacts, carries heat and burns. Plain JavaScript ES modules with no dependencies.

## Run

ES modules need a web server, not `file://`:

```
npm run serve        # then open http://localhost:8765/tidepool.html
npm test             # quick headless checks (about a minute), one or two per system: run after every change
npm test -- pipes    # only the scenes whose name contains a word, e.g. while working on pipes
npm run test:full    # every regression scene and focused check; run the two long gates below too
npm run test:feeding # finite grazing and hungry/satiated predator controls
npm run test:ecosystem # ten-day, three-seed jar gate with dark/unfed/overfed controls
npm run test:generated # eight actual days across three generated worlds, with bounded workers
npm run test:hives    # finite winter heat, food, air, physical flights and saved continuation
npm run test:bee-routing # bounded routes, physical obstacles and reachable flowers
npm run test:cold     # paid cold-water metabolism, debt, starvation and producer budgets
npm run test:ice-light # finite photosynthesis through clear ice; snow/rock/empty-carbon controls
npm run test:erosion  # retained water, ingredients and heat in wet banks and mud
npm run test:habitats # finite initial producers, water retention and bank plants
npm run test:woodland # finite woodland soil moisture and real flower/bee forage controls
npm run test:plant-air # owned canopy access to finite air, sealed and anoxic controls
npm run test:bundle  # build and execute its first frame under DOM/canvas stubs
npm run test:showcase # terrarium, fantasy budgets, two chemistry puzzles, input events and bundle
npm test -- --list   # list the scenes; the quick ones are marked
npm run build        # bundle everything into dist/tidepool.html, one self-contained page for sharing
node tools/check-accounting.mjs  # fractional transfers, pumps, gas quantities and legacy saves
node tools/check-oxygen.mjs      # finite air/water exchange, roots, porewater and evaporation
node tools/check-thermal.mjs     # distillation, combustion and retained residues
node tools/check-life.mjs        # mortality causes, crowding and nighttime oxygen controls
node tools/check-ecology.mjs     # finite food, C/N/P transfers, growth, decay and save migration
node tools/check-devices.mjs     # machine transfers, salt separation and boundary quantities
node tools/profile.mjs 400 --hot   # time the simulation and the drawing on the default world, and list the slowest functions
node tools/shot.mjs out.png --seed 7 --at 130,44 --hour 12 --zoom 2   # render one frame headlessly and save it as a PNG (--level N for a puzzle, --day D to move the season on)
node tools/shot.mjs jar.png --terrarium --seed 7 --ticks 64 # frame the shared sealed jar
```

## Layout

| File | What it does |
| --- | --- |
| `tidepool.html`, `css/tidepool.css` | Page, toolbar and notes |
| `js/config.js` | World size, tile size, block and liquid ids |
| `js/world.js` | Tile arrays (`solid`, `liq`, `typ`, `temp`, `fire`, `sol`, `vel`, …), shared state `S`, the camera `VIEW`, chunk sleep (`wake` for liquids, `heatWake` for heat) |
| `js/oxygen.js` | Oxygen and carbon dioxide in each pocket of air (topped up from the open sky, mixing between tiles, used by fire and breathing) and dissolved oxygen in water (saturation by temperature and salt, taken in at the surface) |
| `js/chem.js` | Chemistry as data: one rule per real reaction of a liquid (or what's dissolved in it) with a block, or of a hot block on its own, with what it makes, uses and gives off as heat; the engine that applies them |
| `js/matter.js` | Real physical properties of every block, liquid and gas: density, heat capacity, conductivity, latent heats, and how they're compressed for play (see `CHEMISTRY.md`) |
| `js/liquids.js` | The liquid property table: one row per liquid (gravity, viscosity, colours, glow, pouring temperature; densities from `js/matter.js`) |
| `js/reactions.js` | What happens when two liquids touch, and what liquids do to touching blocks |
| `js/sim.js` | The per-tick update: react, fall, spread; then momentum, devices, pumps, pipes, powders, bodies, heat, fire, pressure, solutes, gases, erosion, air, biomes, weather, plants |
| `js/solutes.js` | Dissolved contents (salt, sugar, essence, inks, acid, alkali, fertiliser, algae): carried with the flow, diffused, dissolved from salt blocks, brewed by the recipe table; acid and alkali neutralising and corroding, fizzing, salt crystals growing, metal rusting under water; algae growing in the light and dying back in the dark; pH; tint colours |
| `js/powders.js` | Sand, salt, sugar, baking soda and snow: amounts per tile (in `held`), falling and settling into piles, slopes, sinking through lighter liquids; sand into mud and glass |
| `js/heat.js`, `js/fire.js`, `js/pressure.js` | Conserved heat flow by conductivity and capacity (settled chunks sleep), latent heat, and phase changes (including smelting ore and rust, and nitro freezing), burning (methane and hydrogen flashes, explosive mixtures with oxygen), optional communicating vessels |
| `js/gases.js`, `js/blast.js` | Finite gas clouds, oxygen/CO₂ joining available headspace, gases escaping into the sky; nitro explosions |
| `js/pumps.js`, `js/devices.js` | Pumps; switches (lever, plate, liquid, temperature and depth sensors, timer), generators (turbine, water wheel, windmill, solar panel), batteries, logic (AND, OR, NOT, counter) and targets (gate, spring, drain, valve, boiler, separator, lamp, pixel, motor, electromagnet) |
| `js/power.js` | Power networks: metal, stormwater and brine carry power from the switches touching them to the machines they touch; power fades along them (copper least, liquid most); electrolysis splits the water they touch into hydrogen and oxygen |
| `js/pipes.js` | Pipe networks: liquid moves from the highest mouth to the lowest, through valves and filters |
| `js/bodies.js` | Floating bodies: buoyancy, collision, rafts and boats, balloons on ropes, and the explorer's movement, air and health |
| `js/creatures.js`, `js/plants.js` | Fish (grazing algae and snapping up moths, breathing the water's oxygen), pike that hunt them, salamanders, slimelings, moths that eat leaves, birds that eat moths and bees that carry nectar to their hive as honey, rotting when they die; plants that live on the sugar they make from light and CO₂, drink water to grow, regrow leaves, flower and drop seeds |
| `js/hives.js`, `js/habitats.js` | Connected hive food, oxygen-funded heating and physical bee flight routes; finite generated producer endowments and watered bank seeds |
| `js/ecology-core.js`, `js/ecology-data.js`, `js/ecology.js` | Finite carbon/nitrogen/phosphorus pools, food reserves, paid growth and offspring, organic decay, fermentation and saved biological inventories |
| `js/levels.js`, `js/level-observer.js`, `js/editor.js` | Eleven puzzle levels, physics-cadence event evidence and custom levels made in the editor and shared as codes |
| `js/terrarium.js` | Saved sealed-jar mode, shared gate construction and pure population/oxygen/food readings |
| `js/fantasy.js` | Declared magical material rules and separate saved carrier, ingredient, biological and modeled heat budgets |
| `js/particles.js`, `js/audio.js`, `js/music.js`, `js/daynight.js` | Effects and bubbles, synthesized sound (each liquid its own), generative music, time of day (which the Time of day setting can hold or stop) |
| `js/climate.js` | Each column's biome, temperature, humidity and wind; seasons (and which of eight looks the leaves and grass show); air colder with height, ground warmer with depth |
| `js/air.js` | The air grid: vapour, clouds, wind, rain, snow and hail, fog, lightning, gases drifting on the wind; moist air gathering over humid biomes |
| `js/biomes.js` | The eleven biomes: their climate, ground and features; dry and wet spells; tides fed from the open sea beyond the edge; rivers that return their water underground to their source; the underground layers and deep caverns; flash floods |
| `js/momentum.js` | Sideways speed per tile: sloshing waves, jets, splashes, whirlpools at drains |
| `js/erosion.js`, `js/weather.js` | Flowing water carrying dirt away as silt (undercutting banks, so valleys open) and dropping it as mud where it stills (deltas); the sun drying mud and thawing ice |
| `js/generate.js` | World generation from the biomes, and `resetWorld` |
| `js/util.js`, `js/canvas.js` | Seeded hashing, noise and colour helpers; the canvas, its pixel buffers and blending |
| `js/render/*` | Drawing: terrain, the scrolling background (`backdrop.js`), liquids (with reflections and caustics), devices, lighting, sky, camera and frame composition |
| `js/snapshot.js`, `js/history.js` | Schema-3 snapshots and world codes (exact fractional ingredients and biological pools; temperatures rounded to 1/4° in codes); twelve undo entries. The reference world code is about 475 KiB; snapshot arrays use 14.4 MiB per entry, plus object pools. |
| `js/worldmenu.js` | The Save & share menu: undo, save slots, world codes and files, seeds |
| `js/materials.js` | Sponges and soil soaking water up and giving it back (groundwater: a water table, springs and wells), floating lake ice, porous rock seeping, coral growing and bleaching, magnets pulling ferrofluid |
| `js/explorer.js`, `js/hud.js` | The explorer's bucket, pickaxe and bag; the corner panel with health, air, bucket and bag |
| `js/palette.js` | The tool picker: current tool, search, recent tools, and the palette of tools by category |
| `js/input.js`, `js/main.js` | Toolbar and input; the entry point and loop |

The bundle puts every module in one scope, so `npm run build` stops if two modules declare the same top-level name, or
if an import renames something (`import { a as b }`), which the bundle can't follow.

The simulation modules never import from `js/render/` or `js/input.js`, so the sim runs headless (that's how
`tools/simtest.mjs` works) and can be ported to another engine without the browser code.

Planned features are listed in [ROADMAP.md](ROADMAP.md).

Phase 22 is still in progress. The [living-world audit](reports/Tidepool%20living%20world%20audit.md)
separates existing behavior from missing science; [Phase 22A](docs/design/phase22a-accounting.md)
repairs quantity accounting in existing systems. [Phase 22B](docs/design/phase22b-life-cycles.md)
adds finite food, biomass, phosphorus and recycling. Carrier and ingredient units are game units;
full chemical closure remains later work. [Phase 22C](docs/design/phase22c-ecosystems.md)
tests long-term producer renewal and survival. Sparse algae now take more searching to graze,
and pike stop hunting above half their ordinary food reserve. Paid offspring leave the parent a
food reserve, and local crowding has equal reach in both axes. The three-seed ten-day jar suite
passes, including dark/unfed/overfed controls. These are game archetype rules with finite food
and nutrient transfers. [Generated habitats and winter hives](docs/design/phase22c-generated-habitats.md)
add finite starting producers, retained banks, connected soil nutrients and honey-funded
shelter. The three generated seeds also pass eight actual days, with bees surviving and
collecting nectar in the stocked hive. These outdoor checks track recorded boundaries;
legacy fantasy sources prevent a global closure claim. Interactive playtesting and storm
rendering performance remain open. [Phase 23 Showcase](docs/design/phase23-showcase.md)
has its core implementation: a saved terrarium, chemistry puzzles and declared magical budgets.
Headless checks pass; browser playtesting and storm responsiveness remain open.

Choose **Sealed terrarium** in Mode to observe the same finite jar used by the survival gate.
Pause, speed, light schedule, inspection and Save & share work; ordinary editing and resource
injection are disabled. Restart begins a new experiment. Puzzles **10. The last breath** and
**11. Freshwater still** teach oxygen-limited fire and separation of finite brine. Fantasy
tooltips and the **Magical effects** panel identify named sources/sinks; they have their own
saved budget, separate from ordinary ecosystem transfers. Hovered animals show actual food
carbon reserves rather than a predicted number of days to live.
Run a subset with `npm test -- oxygen`, or use `--jobs=4 --progress`
to limit concurrent test workers and see long scenes advance.

To experiment with life cycles, use the Algae, Yeast, Nitrogen and Phosphate tools. Plants and
algae need carbon, light and mineral nutrients; animals need replenished food. Hover over animals
to inspect their reserves, or over soil/water to inspect nutrients and organic matter. An empty
hive supplies no food. Death returns stored material, so overfeeding can create oxygen demand.
Generated worlds receive finite starting nutrients and separate finite algae/yeast inoculum banks.
Stocked, illuminated freshwater also receives a recorded initial algae population. The starter
lake has watered bank seeds and a clay rim; the glass demo tank admits daylight and its pump starts off. Bees need physical access
to flowers and comb, honey and fresh air for winter shelter. Their warmth comes from finite food.
Saved games retain these pools; migration records the legacy biological inventories it initializes.
The habitat and soil-water setup runs only when creating a new world.

New per-tile or per-column state must be added to `ARRAYS` (or `LISTS`) in `js/snapshot.js`, or undo, saves and
world codes will silently leave it out.

## Adding a liquid

1. Add an id in `js/config.js`. Liquid ids 1–34 are taken; ids 35–39 fit the current `NLIQ` table size of 40. Raise `NLIQ` for ids 40 or above. Block ids 80–95 are free.
2. Add a row to `LIQ` in `js/liquids.js`, plus its `HEAT` (pouring temperature) and `DRAG` entries, and its real properties in `LIQUID_MATTER` (or `GAS_MATTER`) in `js/matter.js`.
3. Add its reactions in `js/reactions.js` (`setR`) and any effect on touching blocks in `blockEffects`. A reaction `fn` gets
   `(k, o, t, above)` and returns true if tile `k` was used up.
4. Add a tool in `js/input.js`, and a scene in `tools/simtest.mjs` that checks its behaviour.
5. For a fantasy effect, declare its rule and named boundary in `js/fantasy.js`, then account for actual mutations and test its receipts separately from ordinary transfers.

Keep mass in mind: anything that turns liquid into a block should use `solidify` (it remembers the amount), and anything
that melts a block back should use `meltAmount(k)`, so freezing and thawing neither make nor lose liquid.

## Adding a solute or a recipe

A solute is a channel id (`SOL_*`, raise `NSOL`) in `js/config.js` plus its name, diffusion rate and tint in `js/solutes.js`.
A recipe is one row in `RECIPES`: the minimum of each solute, a temperature range, and the liquid it becomes.
Solutes are fractional concentrations, so an ingredient amount is its concentration × the carrier amount / 255.
Concentrating a solution can raise a channel above 255. Oxygen uses a signed reference deficit; use the amount
helpers in `js/solutes.js` when adding or removing actual oxygen.
