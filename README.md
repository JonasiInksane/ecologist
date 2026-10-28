# Tidepool

A pixel-art sandbox for tile-based liquids: every tile holds one liquid and an amount from 0 to 255 that falls, spreads,
reacts, carries heat and burns. Plain JavaScript ES modules with no dependencies.

## Run

ES modules need a web server, not `file://`:

```
npm run serve        # then open http://localhost:8765/tidepool.html
npm test             # quick headless checks (about 30 s), one or two per system: run after every change
npm test -- pipes    # only the scenes whose name contains a word, e.g. while working on pipes
npm run test:full    # every scene (about 8 minutes): run before publishing or sharing
npm test -- --list   # list the scenes; the quick ones are marked
npm run build        # bundle everything into dist/tidepool.html, one self-contained page for sharing
node tools/profile.mjs 400 --hot   # time the simulation and the drawing on the default world, and list the slowest functions
node tools/shot.mjs out.png --seed 7 --at 130,44 --hour 12 --zoom 2   # render one frame headlessly and save it as a PNG (--level N for a puzzle, --day D to move the season on)
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
| `js/gases.js`, `js/blast.js` | Smoke, poison and carbon dioxide fading, gases escaping into the sky; nitro explosions |
| `js/pumps.js`, `js/devices.js` | Pumps; switches (lever, plate, liquid, temperature and depth sensors, timer), generators (turbine, water wheel, windmill, solar panel), batteries, logic (AND, OR, NOT, counter) and targets (gate, spring, drain, valve, boiler, separator, lamp, pixel, motor, electromagnet) |
| `js/power.js` | Power networks: metal, stormwater and brine carry power from the switches touching them to the machines they touch; power fades along them (copper least, liquid most); electrolysis splits the water they touch into hydrogen and oxygen |
| `js/pipes.js` | Pipe networks: liquid moves from the highest mouth to the lowest, through valves and filters |
| `js/bodies.js` | Floating bodies: buoyancy, collision, rafts and boats, balloons on ropes, and the explorer's movement, air and health |
| `js/creatures.js`, `js/plants.js` | Fish (grazing algae and snapping up moths), pike that hunt them, salamanders, slimelings, moths that eat leaves and birds that eat moths, rotting when they die; plants that drink water to grow, regrow leaves and drop seeds |
| `js/levels.js`, `js/editor.js` | Puzzle levels (nine): their scenes, goals, ways to lose and allowed tools; custom levels as data, made in the level editor and shared as level codes |
| `js/particles.js`, `js/audio.js`, `js/music.js`, `js/daynight.js` | Effects and bubbles, synthesized sound (each liquid its own), generative music, time of day (which the Time of day setting can hold or stop) |
| `js/climate.js` | Each column's biome, temperature, humidity and wind; seasons (and which of eight looks the leaves and grass show); air colder with height, ground warmer with depth |
| `js/air.js` | The air grid: vapour, clouds, wind, rain, snow and hail, fog, lightning, gases drifting on the wind; moist air gathering over humid biomes |
| `js/biomes.js` | The eleven biomes: their climate, ground and features; dry and wet spells; tides fed from the open sea beyond the edge; rivers that return their water underground to their source; the underground layers and deep caverns; flash floods |
| `js/momentum.js` | Sideways speed per tile: sloshing waves, jets, splashes, whirlpools at drains |
| `js/erosion.js`, `js/weather.js` | Flowing water carrying dirt away as silt (undercutting banks, so valleys open) and dropping it as mud where it stills (deltas); the sun drying mud and thawing ice |
| `js/generate.js` | World generation from the biomes, and `resetWorld` |
| `js/util.js`, `js/canvas.js` | Seeded hashing, noise and colour helpers; the canvas, its pixel buffers and blending |
| `js/render/*` | Drawing: terrain, the scrolling background (`backdrop.js`), liquids (with reflections and caustics), devices, lighting, sky, camera and frame composition |
| `js/snapshot.js`, `js/history.js` | Snapshots of the whole world and world codes (binary, with temperatures rounded to 1/4°: about 70 KB); undo |
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

New per-tile or per-column state must be added to `ARRAYS` (or `LISTS`) in `js/snapshot.js`, or undo, saves and
world codes will silently leave it out.

## Adding a liquid

1. Add an id in `js/config.js`. Liquid ids 1–31 are all taken, so a new liquid has to raise `NLIQ` first; block ids 67–95 are free.
2. Add a row to `LIQ` in `js/liquids.js`, plus its `HEAT` (pouring temperature) and `DRAG` entries, and its real properties in `LIQUID_MATTER` (or `GAS_MATTER`) in `js/matter.js`.
3. Add its reactions in `js/reactions.js` (`setR`) and any effect on touching blocks in `blockEffects`. A reaction `fn` gets
   `(k, o, t, above)` and returns true if tile `k` was used up.
4. Add a tool in `js/input.js`, and a scene in `tools/simtest.mjs` that checks its behaviour.

Keep mass in mind: anything that turns liquid into a block should use `solidify` (it remembers the amount), and anything
that melts a block back should use `meltAmount(k)`, so freezing and thawing neither make nor lose liquid.

## Adding a solute or a recipe

A solute is a channel id (`SOL_*`, raise `NSOL`) in `js/config.js` plus its name, diffusion rate and tint in `js/solutes.js`.
A recipe is one row in `RECIPES`: the minimum of each solute, a temperature range, and the liquid it becomes.
Solutes are concentrations (0–255 per tile), so the amount of a solute in a tile is its concentration × the liquid / 255.
