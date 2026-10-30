# Real chemistry: research and design

Goal: every block, liquid and gas behaves like the real material it stands for, reactions and mixing follow real
chemistry, and the living things run real cycles (photosynthesis, respiration, rot, fermentation), so a small world
works as a believable micro-biome. A handful of fantasy materials stay on the side, given properties in the same
system so they mix with the real ones consistently.

The research (October 2026) checked values against Wikipedia infoboxes, Engineering ToolBox, Fondriest (dissolved
oxygen), NOAA Coral Reef Watch and chemistry references; the source list is at the end. Values that couldn't be
checked online are marked ≈.

## 1. Pre-Phase 19 model and gaps (historical)

This baseline predates the Phase 19–22 implementation. Current quantity and life-cycle
contracts are recorded below and in the Phase 22 design documents; the missing features
listed in this section describe that earlier starting model.

### What's missing in the model itself

- **Heat isn't conserved.** Each tile drifts towards its neighbours' average temperature at a hand-picked rate
  (`hrate`, `BRATE`). A red-hot iron block dropped into a lake cools as fast as a drop of water would, and the lake
  barely warms. Real heat moves by conductivity and is shared by heat capacity: water stores 9× more heat per gram
  than iron.
- **No latent heat.** Ice melts, water boils and lava sets the moment a threshold is crossed, taking no energy. Real
  melting ice holds a drink at 0° until it's gone; boiling holds water at 100°.
- **Two densities per liquid.** Layering uses a hand-set order (`dens`); buoyancy uses real densities (`RHO`). They
  disagree in places (below).
- **The air has no chemistry.** Fires burn and creatures live without using oxygen or making CO₂ unless a gas tile
  happens to be beside them. There's no way for a sealed room to run out of air.
- **Water has no oxygen in it.** Fish suffocate only in a thick algae bloom, by a fixed rule; real fish die when
  dissolved oxygen runs low, which is what a bloom causes, at night.
- **Reactions are hand-written pairs** (`setR` in `js/reactions.js`, about 40 of them, plus block rules spread over
  heat, solutes, powders and materials). There's no common format to add real ones quickly, and no heat or mass
  bookkeeping.

### Values that differ from real life

| Thing | Game | Real | Note |
| --- | --- | --- | --- |
| Acid's layering | same as water | dilute 1.07, strong 1.84 g/cm³ | strong acid should sink under water (and heat it as it mixes) |
| Lye vs honey | lye floats on honey | lye 1.33–1.52, honey 1.38–1.45 | roughly equal; strong lye sinks |
| Nitro vs honey | nitro floats on honey | nitroglycerin 1.59 | nitro should sink under honey |
| Ferrofluid | sinks through lava (order 4.5 vs 4) | ≈1.2–1.4 | an oil carrier: floats on water-ish liquids, far above lava |
| Lava + water | obsidian | basaltic lava quenches to **glassy basalt**; obsidian needs silica-rich lava | keep obsidian, but as volcanic glass from rapid quench |
| Ice melts | above 40° (or by warm water) | 0° | thresholds were raised to make up for heat not being conserved |
| Metal melts | 1300° | iron 1538°, steel ≈1450° | |
| Ore smelts | 850° on its own | needs carbon (charcoal) and ≈1200–1500° | real smelting is a reaction, not melting |
| Clay bakes | 400° | 900–1100° | |
| Nitro explodes | 150° | ≈218°; shock-sensitive liquid; frozen is safer but dangerous while thawing | |
| Wood ignites | 180° | 250–300° piloted, ≈300–430° on its own | |
| Acid + metal | poison gas | **hydrogen** (iron, zinc, aluminium); copper and gold resist | |
| Poison gas | sinks, unnamed | real stand-in: **chlorine**, 2.5× air, pools low | mercury vapour is too thin to pool: it's an invisible hazard |
| Rust | needs water only | needs **water and oxygen**; salt speeds it | |
| Heat speed of mercury vs water | 3× | 30× (thermal diffusivity 4.5 vs 0.14 mm²/s) | metals are far quicker than any liquid |
| Coral bleaching | above 32° | ≈1° over the summer maximum, about 29–31° | |

Most of the hand-set thresholds are lower than real because heat isn't conserved; with a real heat model the real
temperatures can be used.

## 2. Reference: real properties

### Liquids (≈20 °C)

| Game | Stand-in | ρ g/cm³ | Viscosity mPa·s | cp J/g·K | k W/m·K | Freezes / boils °C | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| water | water | 1.00 | 1.0 | 4.18 | 0.60 | 0 / 100 | densest at 4°; weak conductor |
| (brine) | 3.5% / 26% NaCl | 1.024 / 1.20 | 1.1 / 1.9 | 4.0 / 3.3 | 0.6 | −2 / −21 (eutectic) | strong conductor; sinks under fresh water |
| (syrup) | 65% sucrose | 1.32 | 100–200 | 2.6 | 0.4 | — / 105–110 | caramelises, then chars |
| honey | honey | 1.38–1.45 | 2,000–10,000 (≈600× thinner at 70° than at 14°) | 2.3 | 0.5 | crystals melt 40–50 | crystallises fastest at 13–17° |
| lava | basalt melt | 2.6–2.8 | 10⁴–10⁵ | 1.2–1.5 | 1–2 | sets ≈1000 | crusts fast, runs on inside |
| quicksilver | mercury | 13.55 | 1.55 | 0.14 | 8.3 | −39 / 357 | metal conductor; iron floats on it; toxic vapour |
| acid | H₂SO₄ 98% / 10% | 1.84 / 1.07 | 27 / 1.2 | 1.4 / 3.9 | 0.3 / 0.6 | 10 / 337 | mixing with water is violently hot |
| lye | NaOH 30–50% | 1.33–1.52 | 15–78 | 3.2 | 0.6 | 5–12 / ≈140 | gives H₂ with aluminium; soaps fats |
| oil | crude / vegetable | 0.80–0.95 | 5–1000 / 50–85 | 2.0 | 0.15 | — | floats; burning oil + water sprays fire |
| mud | clay slurry | 1.2–1.9 | yield stress, 100–10,000 | 2.5–3.5 | 1–1.5 | as water | non-Newtonian; dries solid |
| molten metal | molten iron | 6.98 | 5–6 | 0.82 | 35–40 | 1538 | water on it can explode |
| molten slag | blast-furnace slag | 2.6–2.8 | 300–1000 | 1.2 | ≈1 | 1300–1400 | floats on molten iron |
| nitro | nitroglycerin | 1.59 | ≈36 | 1.6 | 0.2 | 13 / explodes 218 | |
| coolant | ethylene glycol (50%) | 1.11 (1.07) | 16 (4) | 2.4 (3.3) | 0.25 (0.4) | −13 (−37) / 197 | toxic |
| ferrofluid | magnetite in oil | ≈1.2–1.4 | thickens in a field | 1.5–2 | 0.2 | — | loses magnetism when hot |
| fertiliser | UAN-32 | 1.32 | 6–8 | 2.9 | 0.5 | −2 | nitrate + ammonium + urea |
| *new* ethanol | ethanol | 0.79 | 1.2 | 2.44 | 0.17 | −114 / 78 | flash 13°, near-invisible blue flame |
| *new* vinegar | 5% acetic acid | 1.01 | 1.0 | 4.0 | 0.6 | −2 / 100 | weak acid, pH 2.4–3 |
| *new* bleach | 5% NaOCl | 1.09 | 1.1 | 3.9 | 0.6 | −6 | + acid → chlorine |
| *new* liquid nitrogen | N₂ | 0.81 | 0.16 | 2.0 | 0.14 | −210 / −196 | expands 694× |

### Gases (relative to air, 1.2 kg/m³)

| Gas | ρ vs air | Notes |
| --- | --- | --- |
| hydrogen | 0.07 | burns 4–74% in air, invisible flame, → water only |
| methane | 0.55 | burns 4.4–17% in air, autoignition 537° |
| steam (100°) | 0.49 | condensing releases 2257 J/g: why steam scalds |
| hot smoke / cooled smoke | 0.5–0.75 / ≈1 | soot, CO (flammable, toxic), CO₂, water |
| oxygen | 1.10 | makes everything burn fiercer |
| CO₂ | 1.52 | pools in hollows, smothers fire and creatures |
| chlorine | 2.49 | yellow-green, toxic, pools; water dissolves some → acid |

### Solids

| Game | Stand-in | ρ | cp | k | Heat makes it | Acid | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dirt | soil | 1.1–1.6 bulk | 0.8 (dry) | 0.3 dry → 1.4 wet | | | 40–60% pores |
| stone | granite | 2.7 | 0.79 | 1.7–4 | melts ≈1250 | resists | |
| *new* limestone | CaCO₃ | 2.6 | 0.91 | 1.3 | >825° → quicklime + CO₂ | **fizzes CO₂** | |
| sand | quartz | 1.6 dry, 2.0 wet | 0.8 | 0.2 dry, 2–4 wet | ≈1700° → glass; with soda 1000–1500° | resists | wet sand holds steep slopes |
| glass | soda-lime | 2.5 | 0.85 | 1.0 | softens ≈720°, runs >1000° | resists | |
| clay / brick | clay | 1.9 / 1.9 | 0.92 / 0.9 | 0.15–2.5 / 0.6–1 | fires to brick 900–1100° | resists | |
| wood | oak / pine | 0.7 / 0.45 | 1.7–2.0 | 0.12–0.17 | 200–300° without air → **charcoal** + smoke | | burns 250–430° → CO₂, water, ≈1% ash |
| *new* charcoal | | 0.2–0.6 | 1.0 | 0.08 | | | burns hotter, little smoke; reduces ore |
| *new* ash | wood ash | 0.5–0.9 | 0.84 | 0.1 | | fizzes a little | water leaches **lye** out of it |
| ice | | 0.917 | 2.09 | 2.18 | 0° | | floats |
| snow | | 0.05–0.5 | 2.09 | 0.05–0.25 | | | an insulator; packs to firn, then ice |
| salt | NaCl | 2.17 | 0.86 | ≈6.5 | melts 801° | dissolves | 36 g/100 mL, flat with temperature |
| sugar | sucrose | 1.59 | 1.25 | 0.1–0.2 | caramel ≈160–186°, chars >200° | strong acid → carbon foam | 200 g/100 mL at 20°, 480 at 100° |
| baking soda | NaHCO₃ | 2.2 | 1.04 | | 50–200° → soda + water + CO₂ | **fizzes CO₂** | an extinguisher |
| basalt | | 2.95 | 0.84 | 1.7 | melts 1100–1250 → lava | resists | |
| obsidian | volcanic glass | 2.4 | 0.8 | 1.2 | melts 700–1050 | resists | |
| metal | iron / steel | 7.85 | 0.49 | 84 / 45 | melts 1538 / ≈1450 | **→ hydrogen** | rusts with water + oxygen |
| copper | | 8.96 | 0.39 | 401 | melts 1085 | resists (not nitric) | green patina; best common conductor |
| wool | | low | 1.26 | 0.04 | hard to light, self-extinguishes | | dissolves in hot lye |
| coral | aragonite | 2.9 | 0.8 | ≈2 | >825° → quicklime + CO₂ | **fizzes** | bleaches ≈29–31° |
| rust | FeO(OH) | 3.6–4.3 | 0.7 | 0.6 | ≈200° → red oxide + steam | dissolves | thermite with aluminium |
| ore | hematite | 5.25 | 0.67 | ≈11 | + carbon ≈1200° → iron + CO₂ | slowly | |
| crystal | quartz / amethyst | 2.65 | 0.71 | 3–11 | amethyst → yellow citrine ≈400° | resists | |
| *new* quicklime | CaO | 3.34 | 0.75 | | | | + water → **up to 300°**, slaked lime |
| *new* slaked lime / mortar | Ca(OH)₂ | 2.2 | 1.2 | | | neutralises | takes CO₂ from air → limestone again |
| *new* sulfur | | 2.07 | 0.71 | 0.2 | melts 115°, burns blue ≈232° → SO₂ | | |
| *new* aluminium, zinc, gold | | 2.7 / 7.1 / 19.3 | | 236 / 122 / 318 | 660 / 420 / 1064 | Al, Zn → H₂; gold inert | Al and Zn give H₂ in lye too |

## 3. Reference: real reactions and cycles

Real timescales range from instant (fizzing) to years (mortar, patina). The game compresses each class of process to
something you can watch (see the time-scale decision in section 6).

**Life and carbon**
- Photosynthesis: 6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂. Needs light, water and CO₂; best at 20–30°, stops near
  0° and above 40°.
- Respiration: sugar + 6 O₂ → 6 CO₂ + 6 H₂O + energy, day and night, every living thing; about doubles per 10°.
  Plants are net CO₂ sources at night.
- Fermentation (yeast, no oxygen, 20–35°): sugar → 2 ethanol + 2 CO₂, mildly warm; stalls at 12–15% alcohol.
- Vinegar (Acetobacter, needs air): ethanol + O₂ → acetic acid + water, at the surface.
- Rot with air: dead matter + O₂ → CO₂ + water + ammonium (a compost heap warms to 50–70°). Without air (under water
  or mud): → methane + CO₂ (marsh gas).
- Dissolved oxygen: fresh water holds 14.6 mg/L at 0°, 9.0 at 20°, 7.6 at 30° (salt water ≈20% less). Fish avoid
  < 3–5, die < 2–3; **pike survive 1.5**. Oxygen enters only at the surface (faster when churned). A bloom
  supersaturates by day, crashes at night, then rot uses the rest: fish die. Ice cover causes winterkill.
- CO₂ dissolves into carbonic acid; cold water takes more. Enough of it dissolves coral and limestone.

**Nutrients**
- Rot gives ammonium (toxic to fish); bacteria turn it into nitrate using oxygen (days–weeks). In airless mud nitrate
  becomes nitrogen gas. Lightning and blue-green algae fix nitrogen from the air.
- Algae grow by light × the scarcer of nitrogen and phosphate (Redfield ratio 106 C : 16 N : 1 P).

**Sugar**
- Plants move sugar as sap (2–3%); nectar is 20–30% sugar; bees thicken it to honey (17% water).
- Syrup boiled down and cooled grows sugar crystals; caramel 160–186°, carbon above 200°; sugar burns (16.5 kJ/g) and
  sugar dust explodes.

**Inorganic**
- Acid + carbonate (limestone, coral, baking soda, ash) → salt + water + CO₂ (instant fizz).
- Acid + iron/zinc/aluminium → hydrogen + dissolved metal (exothermic); copper, gold resist.
- Acid + base → salt + water + heat (57 kJ/mol); NaOH dissolving is hot too.
- Oil/fat + lye → soap (hours); soap lets oil mix into water as an emulsion.
- Rust: iron + water + oxygen (salt, acid speed it); copper + O₂ + CO₂ + water → green patina, which protects.
- Electrolysis: water → H₂ + O₂ (needs salt to conduct); brine → chlorine + hydrogen + lye; mixed, chlorine + lye →
  bleach.
- Lime cycle: limestone >825° → quicklime + CO₂; quicklime + water → slaked lime, up to 300° (can light wood);
  slaked lime + CO₂ from the air → limestone (mortar hardening).
- Glass: sand + soda >1000° → glass + CO₂; pure sand needs ≈1700°.
- Smelting: ore + charcoal + air blast ≈1200–1500° → iron + slag + CO₂.
- Thermite: rust + aluminium → iron + alumina, ≈2500°, needs no air, water can't put it out.
- Combustion needs oxygen: methane, hydrogen, oil, wood → CO₂ + water (+ smoke, CO and soot when starved of oxygen).
  Real fires run 600–1100°.
- Bleach + acid (even vinegar) → chlorine; bleach + ammonia → chloramines.
- Salt lowers the freezing point (to −21° at 23%), raises the boiling point (108° saturated), conducts.
- Lava + water → glassy basalt + steam; water trapped under lava → steam explosion.
- Dry ice sublimes at −78.5° into sinking CO₂.

**Mixing**
- Miscible with water: brine, syrup, honey (slowly), acid, lye, ethanol, vinegar, fertiliser, bleach.
- Immiscible: oil floats; mercury sinks under everything; slag floats on molten iron.
- Stratification: warm over cold (thermocline) and brine under fresh (halocline) stay layered and cut the bottom off
  from oxygen.
- Diffusion: heat spreads ~100× faster than salt in still water; solutes spread very slowly (1 cm in hours), so
  mixing is mostly done by flow.
- Surface tension: insects stand on clean water, not soapy water; mercury beads up.

## 4. The design

Five parts, each built on the one before.

### A. One material table

Every block, liquid, gas and dissolved substance gets one row in a single table (`js/matter.js`): density, specific
heat, thermal conductivity, melting and boiling points with their latent heats and products, ignition temperature,
heat of combustion and what burning makes, solubility in water, acid/base strength, electrical conductivity,
toxicity, and a `fantasy` flag. Everything else (layering, buoyancy, heat, fire, power) reads from it instead of its
own constants. Values are real, scaled by a few global constants (one for how fast heat moves, one for time).

### B. Heat that's conserved, with latent heat

Each tile stores heat energy; neighbouring tiles exchange it by conductivity (series average of the two), and
temperature is energy ÷ (mass × specific heat). Melting, boiling, freezing and condensing take or give their latent
heat: ice sits at 0° while it melts, a pot holds at 100° while it boils, steam scalds because it gives up its heat as
it condenses. Real thresholds replace the raised ones. The sleep system stays: settled chunks still sleep.

### C. Real layering and mixing

One density per material, from the table, adjusted by what's dissolved (brine and syrup sink under fresh water) and by
temperature (warm water rises, 4° water sinks), so lakes stratify. Miscible liquids dissolve into each other as
solutions; immiscible ones layer. Emulsions: shaken oil and water make a cloudy mix that separates over minutes, or
stays mixed with soap.

### D. A reaction engine

Reactions become data instead of code:

```js
{ name: 'acid on iron', a: SOL_ACID, b: METAL, where: 'touching', needs: { acid: 40 },
  rate: 0.02, makes: { gas: HYDROGEN, sol: SOL_IRON }, uses: { acid: 30, block: 1 }, heat: +40 }
```

Reactants can be liquids, blocks, gases, dissolved substances or air; conditions are temperature, light, oxygen,
pH, a catalyst or a living thing; each rule states its heat and keeps mass. The existing ~40 pair reactions and the
block rules move into it, and the real set in section 3 is added, plus new materials: limestone, quicklime, slaked
lime and mortar, charcoal, ash, sulfur, aluminium, zinc, gold, chlorine (replacing "poison gas"), bleach, ethanol,
vinegar, soap, liquid nitrogen, dry ice.

### E. Air, water and life chemistry

- **Air**: each air cell (the weather grid) carries oxygen and CO₂ along with its water vapour. Fires use oxygen and
  make CO₂ and water; a sealed room's fire goes out; creatures breathe; plants and algae swap them by day and night.
  Concentrated gases stay as gas tiles, as now.
- **Water**: new dissolved channels for oxygen, CO₂ (sets pH), nitrogen, phosphate, ethanol, acetic acid, soap and
  dissolved metals. Oxygen enters at the surface and holds less when warm.
- **Life**: plants, moss and algae photosynthesise (sugar and oxygen), everything respires, fish need dissolved
  oxygen (pike less), rot is aerobic (CO₂, ammonium, heat) or anaerobic (methane), nitrogen cycles, yeast ferments
  sugar into alcohol and CO₂, and alcohol turns to vinegar in air. Plants carry sap; flowers give nectar; bees
  (a new creature) turn it into honey in a hive.

### Fantasy on the side

Aether, frost, tonic, slime, bloomwater (essence), void ink, mimic, liquid light and stormwater stay, each given a full
row in the table and its reactions written as rules, so they obey the same heat, density and mixing. They're marked
fantasy in the notes and tool palette.

## 5. Phased plan

| Phase | Builds | Done when |
| --- | --- | --- |
| 19. Matter (built) | The material table; one density everywhere; conserved heat with latent heat; real thresholds | Tests: ice holds a drink at 0°, hot iron in water warms it by the right amount, boiling holds at 100°; every existing scene passes or is re-tuned with a note |
| 20. Reactions (built) | The reaction engine; existing reactions moved into it; the inorganic set (acid + metals/carbonates, lime cycle, chlorine and bleach, rust with oxygen, patina, charcoal, glass, smelting with carbon, thermite) and new materials | Every reaction in section 3's inorganic list has a test and conserves mass |
| 21. Air and water (built) | Oxygen and CO₂ in the air grid; dissolved oxygen and CO₂ in water; combustion that needs oxygen; layering by concentration and temperature; emulsions and soap | A sealed fire goes out; a stratified pond's bottom goes anoxic; brine stays under fresh water |
| 22. Life cycles (headless gates verified; playtesting/performance open) | Photosynthesis, respiration, dissolved-oxygen stress, rot, nitrogen, fermentation, vinegar, sap, nectar, bees and honey; quantity repairs and finite inventories | Three-seed ten-day closed jars and eight-day generated worlds pass; winter hive survives and forages. Scope and evidence: `docs/design/phase22c-generated-habitats.md` |
| 23. Showcase (core implemented; player validation open) | Declared fantasy effects and budgets; a saved sealed-jar terrarium mode; oxygen and distillation puzzles | Shared jar construction/parity and save/load without refill; scripted solutions and adverse controls; separate magical budgets pass. Browser playtesting remains unverified. Contract: `docs/design/phase23-showcase.md` |

Each phase is about the size of Phase 17. Phase 19 changes how everything feels, so the puzzles will need re-tuning.

## 6. Decisions to make

1. **Time scale.** Real processes take seconds (fizz) to years (mortar). Proposal: fast reactions run in real time;
   slow ones are compressed so a game day (3 minutes) stands for about a week of growth and rot.
2. **Strictness.** Proposal: real values wherever they don't break play; where they would (lava at 10⁵ mPa·s would
   barely move), keep the ordering and ratios right but cap the extremes, and note each cap.
3. **Old saves.** Proposal: world codes keep loading; new channels default to sensible values (air at 21% oxygen,
   water saturated).
4. **Performance.** A tick is about 3.2 ms; the budget for all of this is about 5 ms.
5. **Renames.** "Poison gas" becomes chlorine; quenched lava makes glassy basalt as well as obsidian (obsidian stays
   for fast quenching of hot lava).

## 7. What was built

### Phase 19: Matter (built)

- **One material table** (`js/matter.js`): density, specific heat and thermal conductivity for every block (machines
  count as steel and parts), liquid and gas, each labelled with the real material it stands for, plus the latent heats.
  Layering (`dens`) and buoyancy (`RHO`) both read the one real density now. Fantasy liquids have rows too, marked.
- **Compressions**, all in one place: conductance is √k (copper still carries heat ~30× faster than water, not 800×);
  freely flowing liquids get ×3 for convection; air and gases a heat capacity of 0.1 J/cm³·K (≈80× real) so a tile of
  air can't swing further than a tick can follow, and steam counts as the water it holds; latent heats × 0.25; one
  `HEAT_SPEED` sets water to close 5% of the gap to its neighbours per heat tick, as before. Coolant is the one liquid
  given a better conductor than real (it's the game's heat-carrying fluid).
- **Conserved heat** (`tileHeat` in `js/heat.js`): heat flows between neighbours by the pair's conductance (the
  harmonic mean) times the temperature difference and changes each tile by that heat over its capacity, so what one
  tile loses its neighbour gains. Only the surroundings add or take heat: the open sky, the air's resting temperature,
  natural ground held at its depth's temperature (`GROUND`: stone, dirt, sand, clay, basalt and the like, standing in
  for the earth around it), and a lava pool's own reservoir (`LAVA_KEEP`). Liquids and placed blocks no longer drift
  to the ambient temperature on their own. Liquid flowing into an empty tile mixes with the air there by the air's
  real (small) heat capacity, not as 16 units of liquid.
- **Latent heat** (`balance`): a tile's heat is temperature × capacity plus `latent[k]` (saved with the world). Past a
  change point it's held there and the rest is latent until the change's heat is reached: ice melts at 0, water boils
  at 100 (+0.035° per unit of salt or sugar) and freezes at 0 (−0.085° per unit of salt, down to about −21°), steam
  condenses at 100 giving its heat back, lava sets at 1000, iron at 1538 (and melts there), slag at 1300, snow melts at
  0. Falling water, lava, iron and slag don't freeze or set in mid-air.
- **Real thresholds** elsewhere: clay → brick 900, nitro explodes 218 and freezes 12, wax 64, sugar 170, honey 160,
  acid boils off 300, mud dries into dirt at 100 (lava still fires it into brick), oil smokes 200 and ignites 250,
  wood 260, leaves 230, plants 250, wool 570, methane 537, hydrogen 500. Lava is poured at 1150, molten iron at 1600,
  slag at 1450; the Heat brush reaches 1800 so iron can be melted. The rock round the magma sea rests at 1100.
- **Flames light gases on contact**: a burning tile sets a methane or hydrogen tile beside it alight, and a blast lights
  burnable gas within its reach, so a flame front runs through a gas cloud as it really does (the higher, real
  ignition points would otherwise stop it).
- **Interim**: ore still melts on its own at 850° and its iron comes out at 1900° so it can run into a mould from a
  wood fire; Phase 20 replaces this with smelting by charcoal.
- **Re-tuned**: Thunder dome now asks you to fill the dome before lighting the fuse (the blast was only reliable about
  half the time before, too); tests heat to real temperatures (sparks at 1000°, clay fired at 950°); the tundra test
  uses a truly freezing day; the copper/wool test measures heat that gets through a wall into water.
- Test: `matter: heat is conserved, melting and boiling take latent heat, liquids layer by real density` (hot iron in
  water ends at the mixed temperature; ice keeps water near 0°; a boiling pot holds at 100°; ferrofluid sinks in water
  and oil, floats on honey, lye and acid). All 72 scenes pass.
- Cost: a tick went from about 3.2 to 3.8 ms on a quiet machine (4.1 → 4.7 with the machine busy), within the 5 ms
  budget.

### Phase 20: Reactions (built)

- **The engine** (`js/chem.js`, `chemTick` every 4 ticks): each reaction is a rule object: what kind of liquid
  (`'acid'`, `'base'`, `'water'`, or one liquid or gas) acts on which block, or which block reacts alone when hot
  (`alone`, `above`, optionally `touching` another block, in open `air` or `sealed` from it), at what rate (scaled by
  the acid's or alkali's strength), and what happens: the block becomes another block, nothing, or a melt; a gas comes
  off into the nearest room; solutes go into the liquid; the liquid's strength or amount is used up; heat in joules is
  shared between the two tiles. Liquid–liquid reactions stay pairs in `js/reactions.js`. The old hand-written acid,
  fizz and rust code (in `js/reactions.js` and `js/solutes.js`) and ore and rust melting (in `js/heat.js`) are now
  rules. The fantasy liquids keep their code until Phase 23.
- **New materials**: limestone (natural ground), quicklime and ash (powders), lime mortar, charcoal, aluminium, zinc,
  gold, green copper (patina); chlorine (a heavy gas) and bleach; dissolved metal salts (`SOL_METAL`). "Poison gas" is
  now "toxic fumes" (sulfur dioxide from vents, mercury vapour); acid on metal no longer makes it.
- **Rules** (section 3): acid on carbonates (CO₂ + salt), on lime (neutralised, hot), on zinc / iron / aluminium
  (hydrogen + metal salts, fastest to slowest), on rust and ore (dissolved), on soft and living things; strong acid
  chars sugar; lye on aluminium and zinc (hydrogen) and wool; water slakes quicklime (hot enough to boil); iron rusts
  and copper goes green where water and air meet (submerged: ×0.15); lime mortar hardens in CO₂ or slowly in open air;
  limestone and coral → quicklime above 825°; mortar → quicklime above 550°; baking soda → CO₂ above 150°; rust →
  ore above 200°; wood sealed from air → charcoal above 300°; sand + soda or ash → glass above 1000°, sand alone above
  1700°; ore + charcoal → molten cast iron above 900° (a third slag); ore alone → slag above 1565°; aluminium + rust
  or ore above 1500° → thermite (2500° iron and slag).
- **Elsewhere**: strong brine (salt over 120) gives chlorine instead of oxygen when split, and lye builds up in it;
  chlorine dissolves into fresh water as acid but hardly into brine, makes bleach with lye, comes back from bleach and
  acid, and explodes with hydrogen like oxygen does; bleach kills algae. Charcoal lights at 350° and burns at 1300°
  for longer; burnt wood, leaves and charcoal leave ash. Molten iron is carbon-rich cast iron and sets at 1150°
  (steel still melts at 1538°). Aluminium, zinc, gold, green copper and quicksilver conduct power.
- **The Furnace puzzle** packs the ore in charcoal now: lit, it smelts the ore for real, and the iron runs into the
  mould. The interim "ore melts on its own at 850°" is gone.
- Tests: `chemistry: acids, bases, lime, charcoal, glass, thermite, chlorine and bleach` (19 checks, one per reaction
  or two), smelting rewritten (ore alone in lava stays ore; with charcoal it smelts; a charcoal fire smelts it), rust
  rewritten (needs air; brine faster; dries to ore), acid on iron gives hydrogen. All 73 scenes pass.
- Cost: none measurable (a tick about 3.8 ms).
- Left for Phase 21–22, where they fit: ethanol, vinegar, soap, liquid nitrogen and dry ice, sulfur; molten aluminium,
  zinc, copper and gold; bleach mixing into water as a solution.

### Phase 21: Air and water (built)

- **Air** (`js/oxygen.js`): every empty tile holds oxygen (tenths of a percent, 210 normal) and CO₂ (twentieths of a
  percent, 1 normal), saved with the world. Each pass (every 4 ticks) the air open to the sky (nothing solid or
  liquid above it in its column; gas lets it through) is reset to fresh; elsewhere neighbouring air evens out 45% of
  its difference, in chunks that changed lately, and fully where the lower tile is 20° hotter (hot air rising draws
  fresh air in: a crude stand-in for convection). Flames take 0.2% oxygen from each tile of air beside them per tick
  and give back as much CO₂; nothing catches or keeps burning beside air under 15% oxygen. The explorer chokes below
  12% oxygen or above 5% CO₂, and breathes a little; moths and birds choke too. Oxygen and CO₂ gas thinning out join
  the tile's air.
- **Dissolved oxygen** (`SOL_O2`): stored as how far below saturation the water is, so water is saturated unless
  something uses it (old saves, poured water and generated lakes are all full of oxygen). Saturation follows the real
  curve (14.6 mg/L at 0°, 9.1 at 20°, 7.6 at 30°, none at 100°) and is a fifth lower in strong brine. Water with air
  above it takes oxygen back in (5% of the shortfall per solute tick, 15% when moving) up to what that air allows;
  oxygen diffuses slowly (as slowly as salt). Fish use 0.001 mg/L a tick (pike twice that) and suffocate after 5 s
  below 3 mg/L (pike 1.5); the old fixed rule that a bloom kills fish is gone, because algae now make oxygen in the
  light and use it in the dark (in proportion to how thick they are), so a bloom kills at night. Mud uses the oxygen
  in the water over it and gives methane only once that water is airless.
- **Layering by real density** (`densityOf` in `js/solutes.js`): the liquid's density, plus salt (+0.2 g/cm³ at
  saturation), sugar (+0.33), silt and metal salts, and temperature (water by 1 − 6.8·10⁻⁶ (T − 4)², densest at 4°;
  other liquids expand 0.05% per degree). Same liquid over same liquid swaps when the upper is denser by 0.0004
  g/cm³ (about 2° near room temperature), replacing the old fixed thresholds (16 units of salt, 8°).
- **Soap and emulsions**: lye on oil makes foam carrying soap (`SOL_SOAP`), which settles into soapy water (foam
  churned from plain oil and water still separates into them). Water beside oil becomes oily water (an emulsion, a new
  liquid at 0.95 g/cm³, layering between oil and water) where the water is soapy or churned hard (speed over 1.5);
  each tile remembers its oil share (`SOL_OIL`), and without soap a tile turns back into oil or water at 1.6% a solute
  tick.
- **Elsewhere**: heated baking soda breaks down into soda ash (shown as ash) rather than vanishing, so it still fluxes
  glass. Hover shows the air's oxygen and CO₂ when it isn't fresh, and water's dissolved oxygen.
- Tests: `air and water: oxygen, fire that needs it, stratified water, soap and emulsions` (16 checks); the algae
  bloom test now grows a bloom by day and watches it kill the fish at night; the bird test puts its moth within reach
  (it had passed by luck); the glass test heats until the glass forms. All 74 scenes pass.
- Cost: the air pass is about 1% of the time, the tick about 3.9 ms.
- Left for later: oxygen and CO₂ don't drift with the weather's wind; plants and the explorer's respiration are
  token; insects standing on clean water (surface tension) aren't modelled.

### Phase 22: Life cycles (initial implementation; completion pending)

The notes below describe the original implementation. The October 2026 audit found three failing
checks and several quantity defects; the 22A correction below supersedes its oxygen storage,
alcohol percentage, conservation and completion claims. A two-day jar does not establish a
self-sustaining ecosystem.

- **CO₂ in finer steps**: the air's CO₂ is now hundredths of a percent (normal 4, the real 0.04%; stored as 16-bit),
  so plants can live on it. A breath or a flame trades oxygen and CO₂ one for one.
- **Plants** (`js/plants.js`): each plant has a sugar store (a seed starts with 12). Every plant tick, in daylight
  that reaches its top (glass, water, leaves and its own flower let light through) and while it drinks, it takes
  1 hundredth of a percent of CO₂ per stem tile from the air beside its top and gains that much sugar, giving back
  oxygen; always, it burns 0.25 sugar per stem tile, giving CO₂ back. A new tile costs 6 sugar. Out of sugar it wilts
  as from thirst; wilting now takes about a day (700 plant ticks) instead of a seventh of one, which let generated
  plants in dry soil die before the first rain. Roots drink from damp soil as well as water. Under a roof (no open
  sky above the plant), transpired water runs back instead of leaving as vapour, as on a jar's glass.
- **Flowers, nectar, bees, honey**: a grown plant with 40 sugar flowers (a new block on its top, holding nectar in
  `held`) and turns 2 sugar a plant tick into 4 nectar, up to 200. Bees (`driveBee` in `js/creatures.js`): by day
  above 10° a bee flies to the nearest flower with nectar within 30 tiles and drinks 32, carries it to its hive (the
  nearest honeycomb within 40) and adds 8 to a comb cell's honey (0 means a full cell, so old comb counts as full),
  building a new cell when they're all full; a delivery may raise a new bee (up to 12). They eat at the hive, rest
  there at night, and die like moths. Forests generate a two-cell nest on a trunk with three bees.
- **Nitrogen** (`nitrogen` in `js/solutes.js`): rot (dead creatures in water, dying algae) gives ammonium
  (`SOL_AMMONIA`) and uses 0.05 mg/L of oxygen per unit; fed fish give off ammonium; over 80 kills fish. With 2 mg/L
  of oxygen or more, ammonium becomes nitrate (fertiliser, which stands for nitrate) using oxygen; under 0.5 mg/L,
  nitrate is lost (denitrification). Soil under water uses a little oxygen. Phosphate isn't modelled separately.
- **Dissolved CO₂** (`SOL_CO2`): anything that uses the water's oxygen adds as much CO₂; algae need it to make
  oxygen; water trades it with the air above it towards 2.5 units per hundredth of a percent of the air's CO₂.
- **Yeast** (`ferment`): sugar water with air above catches yeast at 0.2% a solute tick. Between 10° and 40°, with
  oxygen yeast burns sugar and grows; without, it turns sugar into alcohol (`SOL_ETHANOL`) and bubbles CO₂ out at the
  surface, warming slightly, up to 150 (about 14%). Above 45° it dies. With oxygen, alcohol turns slowly into acid
  (vinegar).
- Tests: `life: plants make sugar from light, rot and the nitrogen cycle, yeast, bees and a sealed jar` (14 checks),
  including a sealed glass jar with a pool, algae, two fish and two plants that lives through two game days; the
  drought test dries the soil and waits longer. All 75 scenes pass; the full run takes about 3.8 minutes now (the
  jar is two days long).
- Cost: a tick about 4 ms.
- Left for later: alcohol doesn't burn or distil; plants don't take nitrate from the air; moss doesn't photosynthesise;
  a generated world's fish multiply quickly in the cave lake (they did before this phase too).

### Phase 22A: quantity corrections (October 2026)

- Dissolved channels, porewater/powder amounts, air fractions and latent energy retain fractional
  values. An ingredient amount is its concentration times carrier fullness divided by 255.
  `SOL_O2` is an exception in storage: it is a signed deficit from a fixed 9.1 mg/L reference;
  the amount helpers expose actual oxygen. Cooling changes equilibrium without creating oxygen.
- Surface gas exchange and respiration debit the available source and credit the receiver.
  The air/water conversion uses explicit one-litre reference cells at 20°C/one atmosphere;
  dissolved CO₂ is tracked in equal-mole oxygen equivalents. Open-sky replenishment has a ledger.
  This does not yet model displaced air pressure or every atmospheric species.
- Flow, pumps, buckets, membranes, motors, geysers and porewater retain transported contents;
  carrier-only evaporation concentrates nonvolatile ingredients. Springs/rain dilute existing
  contents. Salt separation retains other ingredients and stops when its storage is full.
- Distillation spends available thermal energy and preserves carrier, ethanol and residues.
  Its bounded enrichment and composition-dependent boiling curve are a game approximation,
  not an ABV calibration or full vapor–liquid equilibrium solver. Blocked residue output waits.
  Dissolved salt/sugar retain an approximate additive heat capacity through liquid transfers,
  freezing and drying; wet soil/sponges include dry matrix plus porewater capacity. These are
  consistent game quantities, not measured solution properties. Legacy dissolution/diffusion,
  other chemical reactions and displaced sub-tile air still have simplified heat accounting.
  Unsupported organic/silt residues retain the last carrier unit until a residue representation
  exists; a sterile water film can evaporate completely. Salt crystals remain stable in saturated
  brine and dissolve again in fresh water.
  Ordinary spirit burning requires measured oxygen and debits ethanol; named counters retain
  the model's reaction products. Legacy explosive reactions remain separately simplified.
- Death records distinguish hypoxia, ammonia, heat and other causes. A controlled crowded tank
  tests reproduction separately from a nighttime algae-respiration experiment and aerated control.
  The overfed jar's observed losses were ammonia deaths; they are no longer labelled night hypoxia.
- Snapshot schema 2 stores the new array types. Legacy byte-array saves migrate dissolved oxygen
  to retain its prior actual concentration; undo/reset also reset transient air mixing state.

These are corrections to existing systems. Phase 22B adds biological C/N/P inventories below;
calibrated chemical yields and further powder processing remain later work; the ten-day gate is covered by 22C below. The scope and
acceptance checks are in `docs/design/phase22a-accounting.md`; scientific sources and limitations
are collected in `reports/Tidepool living world audit.md` and its linked research notes.

### Phase 22B: finite life cycles (October 2026)

Ordinary animals now spend finite food reserves. Feeding, grazing and predation transfer measured
contents; offspring require parental carbon, nitrogen and phosphorus. Plants pay for stems,
leaves, flowers, nectar and seeds. Algae require actual dissolved CO₂ and both mineral nutrients.
Generated soil and water receive finite recorded initial nutrient stores, and microbial starter
banks are finite and separate for algae and yeast. Fantasy creatures keep their fantasy rules.

All ordinary mortality routes retain biomass and carried food. Aerobic decay spends organic
carbon and oxygen, returning CO₂, ammonium and phosphate. Anoxic methane production spends
substrate too; sterile mineral mud cannot make gas. Nitrification spends oxygen, and
denitrification spends an organic donor and retains nitrogen gas in the inventory.

Fermentation partitions available glucose-equivalent carbon into yeast, ethanol and CO₂;
nitrogen/phosphorus shortages limit new yeast biomass. Acetate retains oxidized ethanol carbon
separately from the legacy acidity indicator. Honey, nectar, wax and charcoal retain finite
stores through harvesting, melting, burning and transport. Empty comb cannot refill itself.
Schema 3 preserves pools and migrates older saves with recorded introductions.

These are game-scale quotas and reference quantities, not universal species composition or an
ABV calibration. Hydrogen/oxygen atoms, reaction water volumes, every industrial/mineral reaction,
smoke composition and displaced gas pressure are not fully closed. Sediment transport and soil
adsorption remain simplified. The approved rules, tunables and verification limits are in
`docs/design/phase22b-life-cycles.md`; ecosystem balance and the ten-day gate belong to 22C.

### Phase 22C: closed jars and generated habitats (headless gates verified)

Three balanced jars pass ten actual days, with matched dark/unfed/overfed adverse controls.
Three generated worlds pass eight actual days, retaining fish and producers; the stocked hive
survives winter and collects nectar through physical routes. Initial habitats and woodland
moisture are finite, roots reach connected soil and exposed own canopy, cold aquatic activity
slows both production and maintenance, and clear ice admits daylight. Wet-bank transfers retain
their modeled water, ingredients and heat. Evidence and limits are in
`docs/design/phase22c-generated-habitats.md`.

Interactive browser feedback and storm rendering performance remain open. Outdoor recorded
boundaries do not establish global elemental closure; legacy fantasy biology needed separate
accounting, implemented in the Showcase work below.

### Phase 23: Showcase (implementation and headless verification)

Mode now offers a saved sealed terrarium sharing the tested jar constructor. Observation,
pause/speed, light schedules, restart, undo and world-code sharing work without a recurring
endowment. Editing and resource injection are guarded. Two new puzzles use actual allowed
tools: keep a finite-air fire chamber sealed while lighting its fuel, and distill a finite
brine charge into a fresh receiving basin. Fire evidence is sampled at simulation cadence.

Existing fantasy effects now have named separate receipts for material, dissolved ingredients,
biological C/N/P and modeled heat. Inexhaustible frost cooling is explicit; magical light and
abstract power remain unmetered. Mimic retains its first transformation, and brewing consumes
only its advertised ingredients. Tool marks, descriptions and a world panel expose the rules.
Fantasy creature powers and unaudited industrial yields remain declared modeling limits.
Contract, tests and remaining player validation: `docs/design/phase23-showcase.md`.

## Sources

- Wikipedia: Nitroglycerin, Mercury (element), Lava, Sulfuric acid, Hydrochloric acid, Sodium hydroxide, Ethylene
  glycol, Ferrofluid, Honey, Slag, Liquid nitrogen, Sodium hypochlorite, Seawater, Brine, Petroleum, Iron, Wood smoke,
  Ethanol, UAN, Methane, Hydrogen, Sodium bicarbonate, Calcium oxide, Sucrose, Snow, Gypsum, Sulfur, Iron(III) oxide,
  Obsidian, Sodium chloride, Photosynthesis, Cellular respiration, Ethanol fermentation, Methanogenesis, Oxygen
  saturation, Ocean acidification, Nitrification, Nitrogen fixation, Caramelization, Vinegar, Saponification, Rust,
  Chloralkali process, Glass production, Thermite, Adiabatic flame temperature, Solubility table, Mass diffusivity
- Engineering ToolBox: gas density, specific gravities of gases, thermal conductivity, specific heat of solids,
  thermal conductivity of metals
- Fondriest Environmental: dissolved oxygen
- NOAA Coral Reef Watch: bleaching threshold
- University of Cambridge safety office (autoignition), CFI Trainer wood-ignition review, Valley Design and Continental
  Trade (soda-lime glass), CTU Prague lecture notes (glass melting)
