// Carrier, biological ingredients and modeled heat must survive each erosion representation change.
import assert from 'node:assert/strict';
import { C, Wd, at, box, clearWorld, step } from './test-support.mjs';
const E = await import('../js/erosion.js');
const Eco = await import('../js/ecology.js');
const M = await import('../js/matter.js');
const Ox = await import('../js/oxygen.js');
const Pl = await import('../js/plants.js');
const { addBody } = await import('../js/bodies.js');
const { colBiome } = await import('../js/climate.js');
const { BIOMES } = await import('../js/biomes.js');
const { seedWoodlandMoisture } = await import('../js/habitats.js');
const { solid, held, liq, typ, sol, temp, latent } = Wd;
const a = at(40, 40), b = a + 1, cells = [a, b];
let checks = 0;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} versus ${expected}`);
function check(name, fn) { clearWorld(73); Eco.ecoState(); fn(); checks++; console.log(`PASS ${name}`); }
function parcel(k, amount, type, index = 0, block = 0) {
  solid[k] = block; typ[k] = block ? 0 : type; liq[k] = block ? 0 : amount; held[k] = block ? amount : 0;
  temp[k] = index ? 37.125 : 13.625; latent[k] = index ? -4.125 : 9.375;
  for (let i = 0; i < C.NSOL; i++) sol[k * C.NSOL + i] = i === C.SOL_O2 ? (index ? 88.125 : -23.25) : (i + 1) * (index ? 3.125 : 1.75);
}
function capacity(k) {
  if (solid[k] === C.DIRT || solid[k] === C.WETDIRT) return M.poreHeatCapacity(solid[k], held[k], sol, k * C.NSOL);
  if (solid[k] === C.SAND) { const fraction = (held[k] || 255) / 255; return M.BCAP[C.SAND] * fraction + M.AIR_CAP * (1 - fraction); }
  if (solid[k]) return M.BCAP[solid[k]];
  return liq[k] ? M.LCAP[typ[k]] * liq[k] / 255 + M.dissolvedHeatCapacity(liq[k], sol, k * C.NSOL) + M.AIR_CAP * (1 - liq[k] / 255) : M.AIR_CAP;
}
function snapshot() {
  const state = Eco.ecoState(), quantities = new Float64Array(C.NSOL), biology = { c: 0, n: 0, p: 0 };
  let carrier = 0, heat = 0, phase = 0;
  for (const k of cells) {
    const amount = solid[k] === C.DIRT || solid[k] === C.WETDIRT ? held[k] : liq[k]; carrier += amount;
    for (let i = 0; i < C.NSOL; i++) quantities[i] += (i === C.SOL_O2 ? Ox.OXYGEN_REFERENCE / Ox.MG_PER_UNIT - sol[k * C.NSOL + i] : sol[k * C.NSOL + i]) * amount / 255;
    for (const pool of [Eco.ecoTileInventory(k), state.soil[k], state.dead[k]]) if (pool)
      for (const key of ['c', 'n', 'p']) biology[key] += pool[key];
    heat += temp[k] * capacity(k) + latent[k]; phase += latent[k];
  }
  return { carrier, quantities, biology, heat, phase, introduced: { ...state.introduced }, removed: { ...state.removed } };
}
function retained(before, label, siltAdded = 0) {
  const after = snapshot(); close(after.carrier, before.carrier, `${label} carrier`);
  for (let i = 0; i < C.NSOL; i++) close(after.quantities[i], before.quantities[i] + (i === C.SOL_SILT ? siltAdded : 0), `${label} ingredient ${i}`);
  for (const key of ['c', 'n', 'p']) close(after.biology[key], before.biology[key], `${label} biological ${key}`);
  close(after.heat, before.heat, `${label} sensible plus pending heat`, 0.0001);
  close(after.phase, before.phase, `${label} pending phase energy`);
  assert.deepEqual(after.introduced, before.introduced, 'no new biological endowment');
  assert.deepEqual(after.removed, before.removed, 'no hidden biological removal');
}
function soilStock(k) { Eco.ecoState().soil[k] = { c: 3.125, n: 2.25, p: 0.875 }; Eco.ecoState().dead[k] = { c: 0.25, n: 0.125, p: 0.0625 }; }

for (const [water, pore] of [[48, 106], [250, 255], [255, 73], [17, 0], [1, 255]]) check(`wet-bank erosion preserves mixed parcels (${water} river, ${pore} pore)`, () => {
  parcel(a, water, C.WATER); parcel(b, pore, C.WATER, 1, C.WETDIRT); soilStock(b);
  const before = snapshot(); assert.equal(E.erodeBank(a, b), true);
  retained(before, 'wet bank', E.SILT_PER_BLOCK * liq[a] / 255);
  assert.equal(solid[b], 0); assert.equal(Eco.ecoState().soil[b], undefined);
  close(Eco.ecoState().dead[b].n, 2.375, 'old soil remains available as sediment');
});
check('fractional wet bank retains its unrepresentable porewater and soil', () => {
  parcel(a, 240, C.WATER); parcel(b, 37.5, C.WATER, 1, C.WETDIRT); soilStock(b);
  const before = snapshot(); assert.equal(E.erodeBank(a, b), false); retained(before, 'fractional bank');
  assert.equal(solid[b], C.WETDIRT); close(held[b], 22.5, 'whole water transferred, last fractional residue retained');
  assert.ok(Eco.ecoState().soil[b]);
});
for (const powder of [0, 63.5, 255]) check(`sand erosion retains the actual partial-powder thermal charge (${powder})`, () => {
  parcel(a, 81, C.WATER); solid[b] = C.SAND; held[b] = powder; temp[b] = 53.125; latent[b] = 4.25;
  const before = snapshot(); assert.equal(E.erodeBank(a, b), true); retained(before, 'sand bank', E.SILT_PER_BLOCK * liq[a] / 255);
});
for (const [water, pore] of [[200, 0], [100, 80], [1, 255], [160, 0], [25, 160]]) check(`slump uses actual finite water (${water} river, ${pore} pore)`, () => {
  parcel(a, water, C.WATER); parcel(b, pore, C.WATER, 1, pore ? C.WETDIRT : C.DIRT); soilStock(b);
  const before = snapshot(); assert.equal(E.slumpBank(a, b), true); retained(before, 'slump');
  assert.equal(typ[b], C.MUD); assert.equal(liq[b], Math.max(160, pore)); assert.equal(Eco.ecoState().soil[b], undefined);
});
for (const [water, pore] of [[159, 0], [79, 80], [255, 37.5]]) check(`slump defers absent or fractional carrier (${water} river, ${pore} pore)`, () => {
  parcel(a, water, C.WATER); parcel(b, pore, C.WATER, 1, C.WETDIRT); soilStock(b);
  const before = snapshot(); assert.equal(E.slumpBank(a, b), false); retained(before, 'blocked slump');
  assert.equal(solid[b], C.WETDIRT); assert.equal(held[b], pore); assert.ok(Eco.ecoState().soil[b]);
});
for (const amount of [1, 48, 255]) check(`washing whole mud retains water and every component (${amount})`, () => {
  parcel(a, 255, C.WATER); parcel(b, amount, C.MUD, 1); soilStock(b);
  const before = snapshot(), siltAdded = Math.max(0, amount - before.quantities[C.SOL_SILT] + sol[a * C.NSOL + C.SOL_SILT]);
  assert.equal(E.washMud(b), true); retained(before, 'mud wash', siltAdded);
  assert.equal(liq[a], 255, 'full river does not need to erase or absorb the washed parcel'); assert.equal(typ[b], C.WATER);
});
for (const concentration of [12.5, 255, 413.75]) check(`repeated settling/washing retains its first sediment load (${concentration})`, () => {
  parcel(a, 73, C.MUD); sol[a * C.NSOL + C.SOL_SILT] = concentration;
  const before = snapshot(), siltAdded = Math.max(0, 255 - concentration) * liq[a] / 255;
  assert.equal(E.washMud(a), true); retained(before, 'first wash top-up', siltAdded);
  const afterFirst = snapshot();
  for (let i = 0; i < 100; i++) { assert.equal(E.settleMud(a), true); assert.equal(E.washMud(a), true); }
  retained(afterFirst, 'repeated phase cycle'); close(sol[a * C.NSOL + C.SOL_SILT], Math.max(255, concentration), 'stable sediment concentration');
});
for (const [upper, lower, concentration] of [[255, 17, 250], [17, 255, 23], [47, 93, 255], [47, 93, 320]]) check(`silt sinking conserves amount across unequal/full carriers (${upper}/${lower}, ${concentration})`, () => {
  parcel(a, upper, C.WATER); parcel(b, lower, C.WATER, 1); sol[b * C.NSOL + C.SOL_SILT] = concentration;
  const before = snapshot(); const moved = E.settleSilt(a, b); retained(before, 'silt sink');
  assert.equal(moved > 0, concentration < 255); assert.ok(sol[b * C.NSOL + C.SOL_SILT] <= Math.max(255, concentration));
});
for (const [water, mud] of [[48, 254], [3, 240], [255, 255], [53, 177]]) check(`bed deposition transfers real whole carrier with all contents (${water}/${mud})`, () => {
  parcel(a, water, C.WATER); parcel(b, mud, C.MUD, 1); sol[a * C.NSOL + C.SOL_SILT] = water <= 3 ? 400.125 : 180.125;
  const before = snapshot(); const moved = E.depositMud(a, b); retained(before, 'bed deposit');
  assert.equal(moved > 0, mud < 255); assert.equal(liq[a], water - moved); assert.equal(liq[b], mud + moved);
});
for (const amount of [1, 32, 255]) check(`settling keeps the entire water parcel (${amount})`, () => {
  parcel(a, amount, C.WATER); const before = snapshot(); assert.equal(E.settleMud(a), true); retained(before, 'settled mud');
  assert.equal(liq[a], amount); assert.equal(typ[a], C.MUD);
});
for (const amount of [1, 73, 255]) check(`packing retains porewater, solutes and existing soil (${amount})`, () => {
  parcel(a, amount, C.MUD); soilStock(a); const before = snapshot(); assert.equal(E.packMud(a), true); retained(before, 'packed mud');
  assert.equal(solid[a], C.WETDIRT); assert.equal(liq[a], 0); assert.equal(held[a], amount); assert.ok(Eco.ecoState().soil[a]);
});
check('empty/incorrect/out-of-world parcels do not trigger transformations', () => {
  parcel(a, 255, C.WATER); solid[b] = C.STONE; const before = snapshot();
  assert.equal(E.erodeBank(a, b), false); assert.equal(E.slumpBank(a, b), false); assert.equal(E.washMud(a), false);
  assert.equal(E.packMud(a), false); assert.equal(E.depositMud(a, b), 0); assert.equal(E.settleSilt(a, b), 0);
  assert.equal(E.erodeBank(a, -1), false); assert.equal(E.slumpBank(-1, b), false); assert.equal(E.settleMud(-1), false);
  retained(before, 'blocked operations');
});
check('live erosion tick reproduces the wet-bank carrier-mixing case conservatively', () => {
  parcel(a, 48, C.WATER); parcel(b, 106, C.WATER, 1, C.WETDIRT); soilStock(b);
  Wd.S.tick = 145; Wd.flux[a] = 145; Wd.vel[a] = 1;
  const before = snapshot(), savedRandom = Math.random;
  try { Math.random = () => 0; E.erosionTick(); } finally { Math.random = savedRandom; }
  retained(before, 'actual erosion tick', E.SILT_PER_BLOCK * liq[a] / 255); assert.equal(liq[a], 154); assert.equal(solid[b], 0);
});
check('whole-parcel wash retains the legacy expected-volume probability', () => {
  const mud = a + C.W; parcel(a, 255, C.WATER); parcel(mud, 255, C.MUD, 1);
  Wd.S.tick = 145; Wd.flux[a] = 145; Wd.vel[a] = 1;
  const savedRandom = Math.random; try { Math.random = () => 0.02; E.erosionTick(); } finally { Math.random = savedRandom; }
  assert.equal(typ[mud], C.MUD, '0.02 would wash with unscaled 0.04 chance; a full parcel requires 0.00753');
});
for (const sterile of [false, true]) check(`original exposed woodland bank closes C/N/P at every actual step (${sterile ? 'microbial banks removed' : 'ordinary finite microbes'})`, () => {
  colBiome.fill(BIOMES.findIndex(biome => biome.name === 'forest'));
  box(35, 30, 51, 30, C.GLASS); box(35, 55, 51, 55, C.GLASS);
  box(35, 30, 35, 55, C.GLASS); box(51, 30, 51, 55, C.GLASS);
  // Preserve the original unsupported lower face: supporting or sealing this bed hid the old erosion defect.
  box(37, 51, 43, 53, C.DIRT); Pl.plantSeed(at(40, 50)); Pl.plants[0].max = 5;
  const home = at(48, 45); solid[home] = C.COMB; Eco.ecoSetComb(home, 0);
  const bee = addBody('bee', 49 * C.T + 2.5, 45 * C.T + 3); bee.home = home;
  seedWoodlandMoisture(); Eco.ecoInitializeWorld(); Wd.S.timeMode = 'day';
  const state = Eco.ecoState();
  if (sterile) for (const pool of Object.values(state.inoculum)) for (const key of ['c', 'n', 'p']) { state.removed[key] += pool[key]; pool[key] = 0; }
  const before = Eco.ecoInventory(Pl.plants), introduction = { ...state.introduced }, removal = { ...state.removed }, drift = { c: 0, n: 0, p: 0 };
  for (let tick = 1; tick <= 3000; tick++) {
    step(); const after = Eco.ecoInventory(Pl.plants);
    for (const key of ['c', 'n', 'p']) {
      drift[key] = Math.max(drift[key], Math.abs(after[key] - before[key]));
      close(after[key], before[key], `exposed-bank ${key} at actual tick ${tick}`, 2e-7);
    }
  }
  assert.deepEqual(state.introduced, introduction, 'no repair by fresh introductions');
  assert.deepEqual(state.removed, removal, 'no repair by hidden removals');
  console.log(JSON.stringify({ exposedBank: true, sterile, ticks: 3000, maximumAbsoluteDrift: drift }));
});
console.log(`${checks} erosion accounting checks passed`);
