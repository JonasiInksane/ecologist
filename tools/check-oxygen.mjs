// Focused, deterministic gas-accounting checks; no long world simulation is needed.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
const Ox = await import('../js/oxygen.js');
const Mat = await import('../js/materials.js');
const Pl = await import('../js/plants.js');
const Air = await import('../js/air.js');
const Sol = await import('../js/solutes.js');
const Power = await import('../js/power.js');
const Matter = await import('../js/matter.js');
const Erosion = await import('../js/erosion.js');
const Eco = await import('../js/ecology.js');
const { sol, liq, solid, temp, airOx, airCarb, S } = Wd;
const { NSOL, SOL_O2, SOL_CO2, WATER, STONE } = C;
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);
const wetOxygen = k => Ox.oxygenIn(k) * liq[k] / 255;
const wetCarbon = k => sol[k * NSOL + SOL_CO2] * Ox.MG_PER_UNIT * liq[k] / 255;
const pairOxygen = (k, a) => wetOxygen(k) + airOx[a] * Ox.AIR_O2_MG_PER_UNIT;
const pairCarbon = (k, a) => wetCarbon(k) + airCarb[a] * Ox.AIR_CO2_EQ_MG_PER_UNIT;
const anoxic = k => { sol[k * NSOL + SOL_O2] = Ox.OXYGEN_REFERENCE / Ox.MG_PER_UNIT; };
const liquidHeat = k => (Matter.LCAP[Wd.typ[k]] * liq[k] / 255 + Matter.dissolvedHeatCapacity(liq[k], sol, k * NSOL)) * temp[k] + Wd.latent[k];
const poreHeat = k => Matter.poreHeatCapacity(solid[k], Wd.held[k], sol, k * NSOL) * temp[k] + Wd.latent[k];
let checks = 0;
function check(name, fn) { clearWorld(); Ox.busy.fill(0); fn(); checks++; console.log(`PASS ${name}`); }

check('temperature and salinity change equilibrium, not dissolved inventory', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 20);
  const initial = wetOxygen(k);
  temp[k] = 0; close(wetOxygen(k), initial, 'cooling');
  temp[k] = 70; sol[k * NSOL + C.SOL_SALT] = 255;
  close(wetOxygen(k), initial, 'warming and salt');
  assert.ok(Ox.saturation(0, 0) > Ox.saturation(70, 255));
});

check('fractional respiration and photosynthesis preserve gas molecule counts', () => {
  const a = at(30, 29), initial = airOx[a] + airCarb[a] / Ox.CARB_PER_OX;
  for (let i = 0; i < 1000; i++) close(Ox.respire(a, 0.25), 0.25, 'quarter-unit respiration');
  close(airCarb[a], Wd.AIR_CARB + 250, 'fractional CO2 retained');
  close(airOx[a] + airCarb[a] / Ox.CARB_PER_OX, initial, 'respiration total');
  close(Ox.fixCarbon(a, 250), 250, 'fix the same carbon');
  close(airOx[a], Wd.AIR_OX, 'oxygen restored');
  close(airCarb[a], Wd.AIR_CARB, 'carbon restored');
});

check('respiration cannot spend absent oxygen or overflow product storage', () => {
  const a = at(30, 29); airOx[a] = 0.01; airCarb[a] = 0;
  close(Ox.respire(a, 1), 0.1, 'limited respiration');
  close(airOx[a], 0, 'all available oxygen spent');
  close(Ox.respire(a, 1), 0, 'anoxic respiration stops');
  close(airCarb[a], 0.1, 'no free carbon dioxide');
  airOx[a] = 10; airCarb[a] = Ox.MAX_AIR_CARB;
  close(Ox.breatheAir(a, 2), 0, 'no product room');
  close(airOx[a], 10, 'reactant retained');
  airOx[a] = Ox.MAX_AIR_OX; airCarb[a] = 1;
  close(Ox.fixCarbon(a, 1), 0, 'photosynthesis requires product room');
  close(airCarb[a], 1, 'carbon retained');
});

check('water respiration accounts for fractional products and oxygen shortfalls', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 20, 51);
  const initial = wetOxygen(k) + wetCarbon(k);
  assert.equal(Ox.breatheWater(k, 0.001), true);
  close(wetOxygen(k) + wetCarbon(k), initial, 'fractional aquatic respiration');
  assert.equal(Ox.breatheWater(k, 100), false);
  close(wetOxygen(k), 0, 'anoxic');
  close(wetOxygen(k) + wetCarbon(k), initial, 'partial final respiration');
  assert.equal(Ox.breatheWater(k, -100), false);
  close(wetCarbon(k), 0, 'carbon-limited reverse exchange');
  close(wetOxygen(k), initial, 'no extra oxygen');
});

check('sealed air and a partial water tile conserve both gases during exchange', () => {
  const k = at(30, 30), a = k - C.W; fill(30, 30, 30, 30, WATER, 0, 51);
  anoxic(k); airOx[a] = 100; airCarb[a] = 600;
  const oxygen = pairOxygen(k, a), carbon = pairCarbon(k, a);
  for (let i = 0; i < 500; i++) Ox.surfaceOx(k, k * NSOL);
  close(pairOxygen(k, a), oxygen, 'closed oxygen');
  close(pairCarbon(k, a), carbon, 'closed carbon');
  assert.ok(airOx[a] < 100 && Ox.oxygenIn(k) > 0, 'water debits the air');
  assert.ok(airCarb[a] < 600 && wetCarbon(k) > 0, 'dissolved carbon debits the air');
  temp[k] = 80;
  for (let i = 0; i < 500; i++) Ox.surfaceOx(k, k * NSOL);
  close(pairOxygen(k, a), oxygen, 'outgassing conserves oxygen');
  close(pairCarbon(k, a), carbon, 'outgassing conserves carbon');
});

check('exchange cannot draw gas from an empty headspace', () => {
  const k = at(30, 30), a = k - C.W; fill(30, 30, 30, 30);
  anoxic(k); airOx[a] = 0; airCarb[a] = 0;
  for (let i = 0; i < 20; i++) Ox.surfaceOx(k, k * NSOL);
  close(wetOxygen(k), 0, 'no oxygen source'); close(wetCarbon(k), 0, 'no carbon source');
  airOx[a] = 0.001; airCarb[a] = 0.001;
  const oxygen = pairOxygen(k, a), carbon = pairCarbon(k, a);
  for (let i = 0; i < 100; i++) Ox.surfaceOx(k, k * NSOL);
  close(pairOxygen(k, a), oxygen, 'tiny finite oxygen');
  close(pairCarbon(k, a), carbon, 'tiny finite carbon');
  assert.ok(airOx[a] >= 0 && airCarb[a] >= 0);
});

check('a sealed pair of air cells mixes without gas creation', () => {
  solid.fill(STONE);
  const a = at(30, 29), b = a + 1; solid[a] = solid[b] = 0;
  airOx[a] = 12.125; airOx[b] = 210.875; airCarb[a] = 0.25; airCarb[b] = 600.75;
  const oxygen = airOx[a] + airOx[b], carbon = airCarb[a] + airCarb[b];
  Ox.stir(a);
  for (let i = 0; i < 80; i++) Ox.airTickOx();
  close(airOx[a] + airOx[b], oxygen, 'air oxygen');
  close(airCarb[a] + airCarb[b], carbon, 'air carbon');
  close(airOx[a], airOx[b], 'oxygen equalized', 1e-6);
  close(airCarb[a], airCarb[b], 'carbon equalized', 1e-6);
  assert.equal(S.accounting.gasAtmosphereOxygenMg || 0, 0, 'sealed cells have no atmosphere source');
});

check('direct atmosphere exchange has a named boundary total', () => {
  const k = at(30, 0); fill(30, 0, 30, 0); anoxic(k);
  const oxygen = wetOxygen(k), carbon = wetCarbon(k);
  Ox.surfaceOx(k, k * NSOL);
  close(wetOxygen(k) - oxygen, S.accounting.gasAtmosphereOxygenMg, 'logged O2 source');
  close(wetCarbon(k) - carbon, S.accounting.gasAtmosphereCarbonEqMg, 'logged CO2 source');
});

check('pore water carries every dissolved component through soil and back into a pool', () => {
  const a = at(30, 30), soil = a + 1, deeper = soil + C.W, b = deeper + 1;
  fill(30, 30, 30, 30, WATER, 20, 100); fill(32, 31, 32, 31, WATER, 20, 51);
  solid[soil] = solid[deeper] = C.WETDIRT;
  for (let i = 0; i < NSOL; i++) { sol[a * NSOL + i] = i * 0.375; sol[b * NSOL + i] = i * 0.125; }
  Wd.latent[a] = 70;
  const amount = (k, volume, channel) => (channel === SOL_O2 ? Ox.OXYGEN_REFERENCE / Ox.MG_PER_UNIT - sol[k * NSOL + channel] : sol[k * NSOL + channel]) * volume / 255;
  const total = i => amount(a, liq[a], i) + amount(b, liq[b], i) + amount(soil, Wd.held[soil], i) + amount(deeper, Wd.held[deeper], i);
  const before = Array.from({ length: NSOL }, (_, i) => total(i));
  assert.equal(Mat.movePoreWater(a, soil, 32, false, true), 32);
  assert.equal(Mat.movePoreWater(soil, deeper, 17, true, true), 17);
  assert.equal(Mat.movePoreWater(deeper, b, 17, true, false), 17);
  for (let i = 0; i < NSOL; i++) close(total(i), before[i], `pore channel ${i}`);
  close(Wd.latent[a] + Wd.latent[soil] + Wd.latent[deeper] + Wd.latent[b], 70, 'pending phase energy');
  const poreBefore = Array.from({ length: NSOL }, (_, i) => amount(soil, Wd.held[soil], i));
  assert.equal(Mat.removePoreCarrier(soil, 8), 8);
  for (let i = 0; i < NSOL; i++) close(amount(soil, Wd.held[soil], i), poreBefore[i], `evaporated pore channel ${i}`);
});

check('sponge soaking and cold wringing preserve salt and dissolved oxygen', () => {
  const a = at(30, 29), sponge = a + C.W; fill(30, 29, 30, 29, WATER, 20, 32);
  solid[sponge] = C.SPONGE; sol[a * NSOL + C.SOL_SALT] = 90;
  const salt = 90 * 32 / 255, oxygen = wetOxygen(a);
  Mat.sponge(sponge, 30, 30);
  assert.equal(liq[a], 0); assert.equal(Wd.held[sponge], 32);
  close(sol[sponge * NSOL + C.SOL_SALT] * Wd.held[sponge] / 255, salt, 'stored salt');
  temp[sponge] = 80; Mat.sponge(sponge, 30, 30);
  const out = sponge + C.W;
  assert.equal(Wd.held[sponge], 0); assert.equal(liq[out], 32);
  close(sol[out * NSOL + C.SOL_SALT] * liq[out] / 255, salt, 'returned salt');
  close(wetOxygen(out), oxygen, 'returned oxygen');
});

check('pore transfers conserve water, dissolved and dry-matrix sensible heat', () => {
  const a = at(30, 30), soil = a + 1, sponge = soil + C.W, b = sponge + 1;
  fill(30, 30, 30, 30, WATER, 70, 64); fill(32, 31, 32, 31, WATER, 10, 51);
  solid[soil] = C.DIRT; temp[soil] = 40; solid[sponge] = C.SPONGE; temp[sponge] = 30;
  sol[a * NSOL + C.SOL_SALT] = 200; sol[b * NSOL + C.SOL_SUGAR] = 150; Wd.latent[a] = 5;
  const total = () => liquidHeat(a) + liquidHeat(b) + poreHeat(soil) + poreHeat(sponge);
  const before = total();
  assert.equal(Mat.movePoreWater(a, soil, 32, false, true), 32);
  close(total(), before, 'water into dry soil', 2e-5);
  assert.equal(Mat.movePoreWater(a, sponge, 32, false, true), 32);
  close(total(), before, 'water into dry sponge', 2e-5);
  assert.equal(Mat.movePoreWater(soil, sponge, 16, true, true), 16);
  close(total(), before, 'wet soil into wet sponge', 2e-5);
  assert.equal(Mat.movePoreWater(sponge, b, 48, true, false), 48);
  close(total(), before, 'pore water into a different solution', 2e-5);
  const evaporated = Mat.removePoreCarrier(soil, 16);
  assert.equal(evaporated, 15, 'residue retains the last pore-water unit');
  const carrierHeat = Matter.LCAP[WATER] * evaporated / 255 * temp[soil];
  close(total() + carrierHeat, before, 'pure pore carrier takes only its own sensible heat', 2e-5);
});

check('mud respiration credits only the oxygen actually present', () => {
  const water = at(30, 30), mud = water + C.W;
  fill(30, 30, 30, 30, WATER, 20, 51); fill(30, 31, 30, 31, C.MUD, 20);
  sol[water * NSOL + SOL_O2] = (Ox.OXYGEN_REFERENCE - 0.02) / Ox.MG_PER_UNIT;
  Eco.ecoDeposit(mud, { c: 1, n: 0.1, p: 0.01 });
  const oxygen = wetOxygen(water), carbon = wetCarbon(water);
  Eco.ecoDecay(mud, water, 1);
  close(wetOxygen(water), 0, 'mud uses finite oxygen');
  close(wetCarbon(water), carbon + oxygen, 'matching carbon product');
  Eco.ecoDecay(mud, water, 1);
  close(wetCarbon(water), carbon + oxygen, 'anoxic mud cannot invent respiration products');
});

check('roots store taken nitrogen and transpiration retains the remaining contents', () => {
  const root = at(40, 40), water = root + 1; solid[root + C.W] = C.DIRT;
  assert.equal(Pl.plantSeed(root), true); const plant = Pl.plants[0];
  fill(41, 40, 41, 40, WATER, 20, 100);
  sol[water * NSOL + C.SOL_FERT] = 40; sol[water * NSOL + C.SOL_SALT] = 20;
  const nitrogen = 40 * 100 / 255 + plant.nitrogen, salt = 20 * 100 / 255, oxygen = wetOxygen(water);
  assert.equal(Pl.drink(root, plant), 3);
  close(sol[water * NSOL + C.SOL_FERT] * liq[water] / 255 + plant.nitrogen, nitrogen, 'root nitrogen');
  close(sol[water * NSOL + C.SOL_SALT] * liq[water] / 255, salt, 'retained salt');
  close(wetOxygen(water), oxygen, 'retained oxygen');
  assert.equal(liq[water], 92);
});

check('roots withdraw pure water and store nitrogen from damp soil too', () => {
  const root = at(40, 40), soil = root + C.W; solid[soil] = C.DIRT;
  assert.equal(Pl.plantSeed(root), true); const plant = Pl.plants[0];
  solid[soil] = C.WETDIRT; Wd.held[soil] = 32;
  sol[soil * NSOL + C.SOL_AMMONIA] = 0.25; sol[soil * NSOL + C.SOL_SALT] = 20;
  const nitrogen = 0.25 * 32 / 255 + plant.nitrogen, salt = 20 * 32 / 255;
  assert.equal(Pl.drink(root, plant), 1);
  close(sol[soil * NSOL + C.SOL_AMMONIA] * Wd.held[soil] / 255 + plant.nitrogen, nitrogen, 'pore nitrogen');
  close(sol[soil * NSOL + C.SOL_SALT] * Wd.held[soil] / 255, salt, 'pore salt');
  assert.equal(Wd.held[soil], 24);
});

check('a plant without oxygen retains unmetabolized sugar and accumulates stress', () => {
  const root = at(40, 40); solid[root + C.W] = C.DIRT; assert.equal(Pl.plantSeed(root), true);
  const plant = Pl.plants[0]; fill(41, 40, 41, 40); S.timeMode = 'night'; airOx.fill(0);
  const sugar = plant.sugar, carbon = airCarb[root - C.W];
  Pl.plantTick();
  close(plant.sugar, sugar, 'unmetabolized sugar'); close(airCarb[root - C.W], carbon, 'no invented CO2');
  assert.equal(plant.thirst, 1, 'oxygen stress');
});

check('moss cannot respire without a reserve and removed moss loses its saved reserve explicitly', () => {
  const k = at(40, 40); solid[k] = C.MOSS; S.timeMode = 'night';
  const a = k - C.W, carbon = airCarb[a], oxygen = airOx[a];
  for (let i = 0; i < 100; i++) Mat.moss(k, 40, 40);
  close(airOx[a], oxygen, 'no unbacked moss respiration'); close(airCarb[a], carbon, 'no unbacked carbon');
  S.mossSugar[k] = 2; solid[k] = C.STONE; Mat.materialsTick();
  assert.equal(S.mossSugar[k], undefined); close(Eco.ecoState().dead[k].c, 2, 'removed moss reserve is retained as detritus');
});

check('surface evaporation retains both salt and sugar in a mixed residue', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 25, 51);
  sol[k * NSOL + C.SOL_SALT] = 50; sol[k * NSOL + C.SOL_SUGAR] = 25;
  const salt = Sol.soluteAmount(k, C.SOL_SALT), sugar = Sol.soluteAmount(k, C.SOL_SUGAR), oxygen = wetOxygen(k);
  const water = liq[k] + Air.airWater();
  assert.equal(Air.evaporateSurface(k, 51), 50);
  assert.equal(liq[k], 1, 'last carrier keeps mixed residues representable');
  close(Sol.soluteAmount(k, C.SOL_SALT), salt, 'remaining salt');
  close(Sol.soluteAmount(k, C.SOL_SUGAR), sugar, 'remaining sugar');
  close(wetOxygen(k), oxygen, 'remaining oxygen');
  close(liq[k] + Air.airWater(), water, 'carrier water');
  assert.equal(Air.evaporateSurface(k, 1), 0, 'residues are not erased');
});

check('plain water can dry after releasing its gases into finite headspace', () => {
  const k = at(30, 30), a = k - C.W; fill(30, 30, 30, 30, WATER, 25, 3);
  sol[k * NSOL + SOL_CO2] = 50;
  const oxygen = pairOxygen(k, a), carbon = pairCarbon(k, a), water = liq[k] + Air.airWater();
  assert.equal(Air.evaporateSurface(k, 3), 3);
  assert.equal(liq[k], 0); assert.equal(Wd.typ[k], 0);
  close(pairOxygen(k, a), oxygen, 'gas release oxygen');
  close(pairCarbon(k, a), carbon, 'gas release carbon');
  close(Air.airWater(), water, 'dried carrier enters weather');
});

check('a drying living puddle preserves its algae in a one-unit film', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 25, 40);
  sol[k * NSOL + C.SOL_ALGAE] = 2;
  const algae = Sol.soluteAmount(k, C.SOL_ALGAE), water = liq[k] + Air.airWater();
  assert.equal(Air.evaporateSurface(k, 40), 39);
  assert.equal(liq[k], 1, 'unsupported dry biomass keeps the final carrier unit');
  close(Sol.soluteAmount(k, C.SOL_ALGAE), algae, 'retained algae');
  for (let i = 0; i < 20; i++) assert.equal(Air.evaporateSurface(k, 1), 0);
  close(Sol.soluteAmount(k, C.SOL_ALGAE), algae, 'repeated drying cannot erase biomass');
  close(liq[k] + Air.airWater(), water, 'living puddle carrier water');
});

check('the last drop waits when its gas products have no storage room', () => {
  const k = at(30, 30), a = k - C.W; fill(30, 30, 30, 30, WATER, 25, 1);
  airOx[a] = Ox.MAX_AIR_OX; airCarb[a] = Ox.MAX_AIR_CARB;
  const oxygen = pairOxygen(k, a), carbon = pairCarbon(k, a);
  assert.equal(Air.evaporateSurface(k, 1), 0);
  assert.equal(liq[k], 1);
  close(pairOxygen(k, a), oxygen, 'blocked gas release oxygen');
  close(pairCarbon(k, a), carbon, 'blocked gas release carbon');
});

check('wind drift carries dissolved ingredients and pending energy with gas', () => {
  const a = at(30, 30), b = a + 1; fill(30, 30, 30, 30, C.METHANE, 25, 100);
  fill(31, 30, 31, 30, C.METHANE, 25, 50);
  Wd.under[a] = Wd.under[b] = 0; Air.u[Air.cellOf(30, 30)] = 1; S.tick = 1;
  sol[a * NSOL + C.SOL_ETHANOL] = 200; sol[b * NSOL + C.SOL_ETHANOL] = 30;
  Wd.latent[a] = 20; Wd.latent[b] = 7;
  const ethanol = Sol.soluteAmount(a, C.SOL_ETHANOL) + Sol.soluteAmount(b, C.SOL_ETHANOL);
  Air.drift();
  close(Sol.soluteAmount(a, C.SOL_ETHANOL) + Sol.soluteAmount(b, C.SOL_ETHANOL), ethanol, 'wind-carried ethanol');
  close(Wd.latent[a] + Wd.latent[b], 27, 'wind-carried energy');
  assert.equal(liq[a], 0); assert.equal(liq[b], 150);
});

check('steam entering open weather records the components it carries out', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, C.STEAM, 110, 80); Wd.under[k] = 0;
  sol[k * NSOL + C.SOL_ETHANOL] = 100; Wd.latent[k] = 20;
  const ethanol = Sol.soluteAmount(k, C.SOL_ETHANOL), water = liq[k] + Air.airWater();
  Air.surfaces();
  close(Sol.soluteAmount(k, C.SOL_ETHANOL) + S.accounting.openSteamComponents[C.SOL_ETHANOL], ethanol, 'partial atmospheric ethanol outflow');
  Air.surfaces();
  assert.equal(liq[k], 0);
  close(S.accounting.openSteamComponents[C.SOL_ETHANOL], ethanol, 'complete atmospheric ethanol outflow');
  close(Air.airWater(), water, 'steam carrier enters weather');
  close(S.accounting.weatherVapourLatent, 20, 'phase energy transferred to coarse weather recorded');
});

check('rain dilutes existing solutes and records its atmospheric oxygen', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 25, 51);
  sol[k * NSOL + C.SOL_SALT] = 100; sol[k * NSOL + C.SOL_SUGAR] = 50;
  const salt = Sol.soluteAmount(k, C.SOL_SALT), sugar = Sol.soluteAmount(k, C.SOL_SUGAR), oxygen = wetOxygen(k);
  assert.equal(Air.rainInto(k, 32, 10), 32);
  close(Sol.soluteAmount(k, C.SOL_SALT), salt, 'rain-retained salt');
  close(Sol.soluteAmount(k, C.SOL_SUGAR), sugar, 'rain-retained sugar');
  close(wetOxygen(k) - oxygen, S.accounting.rainOxygenMg, 'explicit rain oxygen');
  assert.equal(liq[k], 83);
  assert.ok(sol[k * NSOL + C.SOL_SALT] < 100, 'rain dilutes concentration');
});

check('rain and evaporation retain dissolved sensible heat and record carrier boundary heat', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 70, 51);
  sol[k * NSOL + C.SOL_SALT] = 200; sol[k * NSOL + C.SOL_SUGAR] = 150; Wd.latent[k] = 8;
  const initial = liquidHeat(k);
  assert.equal(Air.rainInto(k, 32, 10), 32);
  close(liquidHeat(k), initial + S.accounting.rainSensibleHeat, 'rain sensible energy', 1e-5);
  const beforeDrying = liquidHeat(k);
  assert.equal(Air.evaporateSurface(k, 83), 82);
  close(liquidHeat(k) + S.accounting.weatherVapourSensibleHeat + S.accounting.weatherVapourLatent,
    beforeDrying, 'evaporation preserves retained dissolved energy', 1e-5);
});

check('electrolysis retains salt, sugar and actual dissolved oxygen in its remaining water', () => {
  const k = at(30, 30); fill(30, 30, 30, 30, WATER, 20, 10);
  sol[k * NSOL + C.SOL_SALT] = 100; sol[k * NSOL + C.SOL_SUGAR] = 250;
  sol[k * NSOL + SOL_O2] = -5;   // supersaturated: multiplying this deficit would invent more oxygen
  const salt = Sol.soluteAmount(k, C.SOL_SALT), sugar = Sol.soluteAmount(k, C.SOL_SUGAR), oxygen = wetOxygen(k);
  const removed = Power.split(k);
  assert.equal(removed, 8); assert.equal(liq[k], 2); assert.equal(liq[k - C.W], 8);
  close(Sol.soluteAmount(k, C.SOL_SALT), salt, 'electrolysis salt');
  close(Sol.soluteAmount(k, C.SOL_SUGAR), sugar, 'electrolysis sugar');
  close(wetOxygen(k), oxygen, 'electrolysis dissolved oxygen');
  assert.ok(sol[k * NSOL + C.SOL_SUGAR] > 255, 'supersaturated contents are not clipped');
});

check('electrolysis reserves product space and leaves the final carrier unit', () => {
  const k = at(30, 30), up = k - C.W; fill(30, 30, 30, 30, WATER, 20, 3);
  solid[up] = STONE;
  const oxygen = wetOxygen(k);
  assert.equal(Power.split(k), 0); assert.equal(liq[k], 3);
  close(wetOxygen(k), oxygen, 'blocked reaction retains oxygen');
  solid[up] = 0;
  assert.equal(Power.split(k), 2); assert.equal(liq[k], 1); assert.equal(liq[up], 2);
  close(wetOxygen(k), oxygen, 'limited source retains oxygen');
  assert.equal(Power.split(k), 0, 'last carrier waits for residue handling');
});

console.log(`All ${checks} focused oxygen checks passed.`);
