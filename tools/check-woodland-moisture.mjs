// Finite generation-only rooting water, protected stores, saved state and actual producer/bee use.
import assert from 'node:assert/strict';
import { C, Wd, at, box, clearWorld, step } from './test-support.mjs';
import { BIOMES } from '../js/biomes.js';
import { colBiome } from '../js/climate.js';
import { addBody } from '../js/bodies.js';
import { airWater } from '../js/air.js';
import { ecoComb, ecoInitializeWorld, ecoInventory, ecoSetComb, ecoState, ecoTissue } from '../js/ecology.js';
import { seedWoodlandMoisture, WOODLAND_MOISTURE } from '../js/habitats.js';
import { BCAP, LCAP, poreHeatCapacity } from '../js/matter.js';
import { drink, plantSeed, plants, SIP } from '../js/plants.js';
import { capture, restore, packWorld, unpackWorld } from '../js/snapshot.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message, tolerance = 1e-7) { ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }
function budget(before, message) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${message} ${key}`);
}
function fixture(biome = 'forest', x = 40) {
  clearWorld(73); colBiome.fill(BIOMES.findIndex(b => b.name === biome));
  box(Math.max(0, x - 3), 51, Math.min(C.W - 1, x + 3), 53, C.DIRT);
  plantSeed(at(x, 50)); ecoInitializeWorld(); return plants[0];
}
function storedWater() {
  let total = airWater();
  for (let k = 0; k < C.W * C.H; k++) {
    if (Wd.solid[k] === C.WETDIRT) total += Wd.held[k];
    if ([C.WATER, C.STEAM].includes(Wd.typ[k])) total += Wd.liq[k];
  }
  return total;
}
{
  fixture(); Wd.temp.fill(23.5); const before = ecoInventory(plants), introduced = { ...ecoState().introduced };
  const added = seedWoodlandMoisture();
  near(added, 21 * WOODLAND_MOISTURE, 'one seed receives no more than its 21 reachable dry dirt cells');
  near(storedWater(), added, 'the added carrier exists in physical porewater');
  near(Wd.S.accounting.woodlandMoistureIntroduced, added, 'initial-world ledger records exact added carrier');
  let cells = 0;
  for (let k = 0; k < C.W * C.H; k++) if (Wd.solid[k] === C.WETDIRT) {
    cells++; const x = k % C.W, y = (k / C.W) | 0;
    ok(x >= 37 && x <= 43 && y >= 51 && y <= 53, 'moisture stays inside the actual drinking reach');
    near(Wd.held[k], 255, 'each initial store is a bounded full carrier');
    near(Wd.temp[k], 23.5, 'initial water shares native soil temperature');
    near(poreHeatCapacity(C.WETDIRT, Wd.held[k], Wd.sol, k * C.NSOL) - BCAP[C.DIRT], LCAP[C.WATER], 'water adds its ordinary sensible capacity');
    ok(Array.from(Wd.sol.slice(k * C.NSOL, (k + 1) * C.NSOL)).every(n => n === 0), 'initial moisture contains no added nutrient or food channels');
  }
  near(cells, 21, 'only the finite rooting zone was moistened'); budget(before, 'sterile moisture');
  assert.deepEqual(ecoState().introduced, introduced); checks++;
  near(seedWoodlandMoisture(), 0, 'moisture endowment does not repeat');
}
{
  fixture();
  const protectedCells = Array.from({ length: 7 }, (_, i) => at(37 + i, 51));
  Wd.solid[protectedCells[0]] = C.STONE;
  Wd.solid[protectedCells[1]] = C.WETDIRT; Wd.held[protectedCells[1]] = 12;
  Wd.sol[protectedCells[1] * C.NSOL + C.SOL_SALT] = 4;
  Wd.held[protectedCells[2]] = 5;
  Wd.liq[protectedCells[3]] = 23; Wd.typ[protectedCells[3]] = C.WATER;
  Wd.sol[protectedCells[4] * C.NSOL + C.SOL_SALT] = 17;
  Wd.solid[protectedCells[5]] = C.COMB; ecoSetComb(protectedCells[5], 0); ecoTissue(protectedCells[5]);
  Wd.solid[protectedCells[6]] = C.CLAY;
  const parcel = k => ({ block: Wd.solid[k], held: Wd.held[k], liquid: Wd.liq[k], type: Wd.typ[k], temp: Wd.temp[k], latent: Wd.latent[k], sol: Array.from(Wd.sol.slice(k * C.NSOL, (k + 1) * C.NSOL)) });
  const before = protectedCells.map(parcel);
  near(seedWoodlandMoisture(), 14 * WOODLAND_MOISTURE, 'protected materials and existing stores reduce the finite endowment');
  protectedCells.forEach((k, i) => { assert.deepEqual(parcel(k), before[i], 'existing material, water and ingredients are preserved'); checks++; });
}
for (const biome of ['forest', 'jungle']) {
  fixture(biome); ok(seedWoodlandMoisture() > 0, `${biome} seeds can receive initial rooting water`);
}
{
  fixture('grassland'); near(seedWoodlandMoisture(), 0, 'ordinary grassland plants are outside this woodland setup');
  ok(!ecoState().woodlandMoistureSeeded && Wd.S.accounting.woodlandMoistureIntroduced === undefined, 'inapplicable worlds receive no moisture marker or counter');
}
for (const x of [0, C.W - 1]) {
  fixture('forest', x); near(seedWoodlandMoisture(), 12 * WOODLAND_MOISTURE, 'world-edge rooting zones clip instead of wrapping rows');
}
{
  clearWorld(73); colBiome.fill(BIOMES.findIndex(b => b.name === 'forest'));
  box(37, 51, 45, 53, C.DIRT); plantSeed(at(40, 50)); plantSeed(at(42, 50)); ecoInitializeWorld();
  near(seedWoodlandMoisture(), 27 * WOODLAND_MOISTURE, 'overlapping rooting zones do not introduce water twice');
}
{
  const p = fixture(); seedWoodlandMoisture(); const before = storedWater(), pore = Wd.held.reduce((sum, n) => sum + n, 0);
  ok(drink(p.root, p) > 0, 'an ordinary root can withdraw the actual initial water');
  near(Wd.held.reduce((sum, n) => sum + n, 0), pore - SIP, 'root withdrawal spends the existing porewater');
  near(storedWater(), before, 'transpiration retains the same water in the atmosphere');
  near(seedWoodlandMoisture(), 0, 'a spent rooting store cannot request a top-up');
  const counter = Wd.S.accounting.woodlandMoistureIntroduced, savedWater = storedWater(), code = await packWorld(capture());
  clearWorld(); restore(await unpackWorld(code));
  near(storedWater(), savedWater, 'world codes retain the fractional porewater/air inventory');
  near(Wd.S.accounting.woodlandMoistureIntroduced, counter, 'world codes retain the initial-water ledger');
  near(seedWoodlandMoisture(), 0, 'saved one-time marker prevents restocking');
  const legacy = capture(); delete legacy.state.ecology.woodlandMoistureSeeded; delete legacy.state.accounting.woodlandMoistureIntroduced;
  clearWorld(); restore(legacy);
  near(storedWater(), savedWater, 'loading an older save does not run woodland moisture setup');
  ok(ecoState().woodlandMoistureSeeded === undefined && Wd.S.accounting.woodlandMoistureIntroduced === undefined, 'older saves retain their existing lack of setup metadata');
}
function producerFixture(watered) {
  clearWorld(73); colBiome.fill(BIOMES.findIndex(b => b.name === 'forest'));
  box(35, 30, 51, 30, C.GLASS); box(35, 55, 51, 55, C.GLASS);
  box(35, 30, 35, 55, C.GLASS); box(51, 30, 51, 55, C.GLASS);
  // A supported, clay-sided rooting bed tests plant use without an eroding overhang.
  box(37, 51, 43, 54, C.DIRT); box(36, 51, 36, 54, C.CLAY); box(44, 51, 44, 54, C.CLAY);
  plantSeed(at(40, 50)); plants[0].max = 5;
  const home = at(48, 45); Wd.solid[home] = C.COMB; ecoSetComb(home, 0);
  const bee = addBody('bee', 49 * C.T + 2.5, 45 * C.T + 3); bee.home = home;
  if (watered) seedWoodlandMoisture(); ecoInitializeWorld(); Wd.S.timeMode = 'day';
  const before = ecoInventory(plants), initialWater = storedWater(), introduced = { ...ecoState().introduced };
  for (let i = 0; i < 3000; i++) step();
  budget(before, watered ? 'watered producer and bee' : 'dry producer control');
  near(storedWater(), initialWater, 'closed producer/bee fixture retains finite water', 1e-5);
  assert.deepEqual(ecoState().introduced, introduced); checks++;
  return { height: plants[0]?.h || 0, flower: plants.some(p => p.flower >= 0), nectarCollected: Wd.S.accounting.nectarCollected || 0, honeyStored: Wd.S.accounting.honeyStored || 0 };
}
const watered = producerFixture(true), dry = producerFixture(false);
ok(watered.height === 5 && watered.flower && watered.nectarCollected > 0 && watered.honeyStored > 0, `finite rooting water funds real growth, nectar and physical bee delivery: ${JSON.stringify(watered)}`);
ok(!dry.flower && dry.nectarCollected === 0 && dry.honeyStored === 0, `the matched dry control cannot produce nectar: ${JSON.stringify(dry)}`);
console.log(JSON.stringify({ watered, dry }));
console.log(`${checks} woodland moisture checks pass`);
process.exit(0);
