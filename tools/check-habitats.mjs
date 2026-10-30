// Finite generated-producer setup, exclusions, accounting and persistence.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill, run } from './test-support.mjs';
import { addBody } from '../js/bodies.js';
import { devicesTick } from '../js/devices.js';
import { ECO_QUOTA } from '../js/ecology-data.js';
import { ecoInitializeWorld, ecoInventory, ecoState } from '../js/ecology.js';
import { generate, lineLakeBasin } from '../js/generate.js';
import { HABITAT_START_ALGAE, plantLakeBanks, seedGeneratedHabitats } from '../js/habitats.js';
import { drink, plants, REACH } from '../js/plants.js';
import { skyAbove } from '../js/oxygen.js';
import { capture, restore } from '../js/snapshot.js';
import { clearSol, soluteAmount } from '../js/solutes.js';
import { carryHeat } from '../js/sim.js';
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message) { ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`); }
function fixture() {
  clearWorld(73); fill(40, 40, 42, 41, C.WATER, 20);
  addBody('fish', 40 * C.T, 41 * C.T); ecoInitializeWorld();
}
{
  fixture(); Wd.liq[at(42, 41)] = 127;
  const before = ecoInventory(plants), introduced = { ...ecoState().introduced }, bank = structuredClone(ecoState().inoculum);
  const added = seedGeneratedHabitats(), after = ecoInventory(plants);
  near(added, HABITAT_START_ALGAE * (5 + 127 / 255), 'starting algae follows actual carrier amounts');
  for (const [key, quota] of [['c', 1], ['n', ECO_QUOTA.n], ['p', ECO_QUOTA.p]]) {
    near(after[key] - before[key], added * quota, `initial biomass ${key} appears in inventory`);
    near(ecoState().introduced[key] - introduced[key], added * quota, `initial biomass ${key} is recorded`);
  }
  near(soluteAmount(at(42, 41), C.SOL_ALGAE), HABITAT_START_ALGAE * 127 / 255, 'partial water is not over-endowed');
  assert.deepEqual(ecoState().inoculum, bank); checks++;
  Wd.sol[at(40, 40) * C.NSOL + C.SOL_ALGAE] = 0;
  near(seedGeneratedHabitats(), 0, 'later shortages do not trigger new food');
  near(soluteAmount(at(40, 40), C.SOL_ALGAE), 0, 'depleted water stays depleted');
  const saved = capture();
  clearWorld(7); restore(saved);
  near(seedGeneratedHabitats(), 0, 'save restore retains the one-time generation marker');
}
{
  fixture();
  // Each water column has a different exclusion; the last remains suitable.
  Wd.solid[at(40, 35)] = C.STONE;
  Wd.sol[at(41, 40) * C.NSOL + C.SOL_SALT] = 51;
  Wd.temp[at(41, 41)] = 7;
  Wd.temp[at(42, 40)] = 41;
  seedGeneratedHabitats();
  for (const [x, y] of [[40, 40], [40, 41], [41, 40], [41, 41], [42, 40]]) near(soluteAmount(at(x, y), C.SOL_ALGAE), 0, `unsuitable water ${x},${y} receives none`);
  near(soluteAmount(at(42, 41), C.SOL_ALGAE), HABITAT_START_ALGAE, 'suitable lit water receives starter biomass');
}
{
  clearWorld(73); fill(40, 40, 42, 41, C.WATER, 20); ecoInitializeWorld();
  near(seedGeneratedHabitats(), 0, 'unstocked water is left to the finite natural inoculum');
}
{
  fixture();
  Wd.sol[at(40, 40) * C.NSOL + C.SOL_ALGAE] = 25;
  seedGeneratedHabitats();
  near(soluteAmount(at(40, 40), C.SOL_ALGAE), 25, 'existing denser algae is retained');
}
for (const seed of [7, 73, 31337]) {
  Wd.S.seed = seed; generate();
  ok(ecoState().habitatsSeeded, `seed ${seed} initializes producer endowments`);
  const bank = plants.filter(p => p.bank);
  ok(bank.length >= 1 && bank.length <= 2, `seed ${seed} starts finite watered bank plants`);
  const bankY = { 7: 42, 73: 44, 31337: 41 }[seed];
  assert.deepEqual(bank.map(p => [p.root % C.W, (p.root / C.W) | 0]), [[50, bankY], [76, bankY]]); checks++;
  for (const plant of bank) {
    ok(Wd.solid[plant.root + C.W] === C.DIRT, `seed ${seed} bank seed has real soil`);
    const x = plant.root % C.W, y = (plant.root / C.W) | 0;
    let water = false;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const k = at(x + dx, y + dy); if (Wd.liq[k] >= 128 && Wd.typ[k] === C.WATER) water = true;
    }
    ok(water, `seed ${seed} bank roots reach actual retained water`);
  }
  ok(Wd.pumps.every(p => !p.on), `seed ${seed} leaves the demo pump idle`);
  const tankY = (Wd.pumps[0].out / C.W) | 0;
  const floor = Array.from({ length: 17 }, (_, offset) => 50 + offset).filter(x => x !== 52 && x !== 62);
  ok(floor.every(x => Wd.solid[at(x, tankY)] === C.GLASS), `seed ${seed} demo floor transmits light while containing water`);
  const walls = Array.from({ length: 6 }, (_, offset) => tankY - offset).flatMap(y => [at(50, y), at(66, y)]);
  ok(walls.every(k => Wd.solid[k] === C.GLASS), `seed ${seed} demo walls remain transparent physical blocks`);
  ok(!Wd.solid[at(62, tankY)], `seed ${seed} retains the demo tank's original leak`);
  ok(Wd.solid[Wd.pumps[0].out] === C.PUMP_OUT, `seed ${seed} retains the physical pump outlet`);
  const below = column => Array.from({ length: 31 }, (_, offset) => at(column, 30 + offset)).find(k => Wd.liq[k] && Wd.typ[k] === C.WATER);
  const lit = below(60), machineShade = below(52);
  ok(lit !== undefined && skyAbove(lit), `seed ${seed} daylight crosses the real glass tank and reaches lake water`);
  ok(machineShade !== undefined && !skyAbove(machineShade), `seed ${seed} pump outlet still casts its physical shadow`);
  let algae = 0; for (let k = 0; k < C.W * C.H; k++) if (Wd.liq[k] && Wd.typ[k] === C.WATER) algae += soluteAmount(k, C.SOL_ALGAE);
  ok(algae > 500, `seed ${seed} has material producer biomass before fish reserves run out`);
  const introduced = { ...ecoState().introduced };
  near(seedGeneratedHabitats(), 0, `seed ${seed} initialization is idempotent`);
  assert.deepEqual(ecoState().introduced, introduced); checks++;
  near(plantLakeBanks(64, 45, 16, 8), 0, `seed ${seed} bank initialization does not repeat`);
  const lever = [...Wd.devices.values()].find(d => d.kind === C.LEVER && d.targets.includes(Wd.pumps[0].in));
  ok(lever && !lever.on, `seed ${seed} retains an idle linked lever`);
  lever.on = true; devicesTick(); ok(Wd.pumps[0].on, `seed ${seed} demo still starts with its lever`);
  lever.on = false; devicesTick(); ok(!Wd.pumps[0].on, `seed ${seed} lever still stops the demo`);
  // Withdraw the top near-bank water layer into real remote liquid cells. This is a test
  // drawdown, not a refill: every original parcel/component remains in the world.
  const beforeDrawdown = ecoInventory(plants); let withdrawn = 0;
  for (let y = bankY - 3; y <= bankY + 2; y++) for (let x = 47; x <= 81; x++) {
    const k = at(x, y); if (!Wd.liq[k] || Wd.typ[k] !== C.WATER) continue;
    const destination = at(200 + withdrawn % 32, 2 + ((withdrawn / 32) | 0));
    assert.ok(!Wd.solid[destination] && !Wd.liq[destination]);
    const amount = Wd.liq[k]; carryHeat(k, destination, amount, 0);
    Wd.liq[destination] = amount; Wd.typ[destination] = C.WATER; Wd.liq[k] = 0; Wd.typ[k] = 0; clearSol(k); withdrawn++;
  }
  ok(withdrawn > 0, `seed ${seed} actual surface water was withdrawn`);
  ok(REACH === 3, 'root drinking range stays three tiles');
  for (const plant of bank) {
    const x = plant.root % C.W, y = (plant.root / C.W) | 0, reachable = [];
    for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
      const k = at(x + dx, y + dy); if (Wd.typ[k] === C.WATER && Wd.liq[k]) reachable.push(Math.max(Math.abs(dx), Math.abs(dy)));
    }
    ok(reachable.length && Math.min(...reachable) === REACH, `seed ${seed} lowered root reaches the next real water row at its unchanged limit`);
    ok(drink(plant.root, plant) > 0, `seed ${seed} actual plant drinking succeeds after one-row drawdown`);
  }
  const afterDrawdown = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(afterDrawdown[key], beforeDrawdown[key], `seed ${seed} test withdrawal and drinking retain ${key}`);
}
{
  clearWorld(73); fill(43, 49, 46, 50, C.WATER, 20);
  Wd.solid[at(44, 48)] = C.CLAY;
  for (let i = 0; i < C.NSOL; i++) Wd.sol[at(46, 50) * C.NSOL + i] = i === C.SOL_O2 ? -18.125 : 13.25 + i;
  const waterBefore = Wd.liq.slice(), typesBefore = Wd.typ.slice(), contentsBefore = Wd.sol.slice(), blocksBefore = Wd.solid.slice();
  const beforeWater = Wd.liq.reduce((a, b) => a + b, 0), before = ecoInventory(plants), introduced = { ...ecoState().introduced };
  ok(plantLakeBanks(44, 50, 5, 5) >= 1, 'bank fixture places an actual seed');
  const after = ecoInventory(plants), added = { c: ecoState().introduced.c - introduced.c, n: ecoState().introduced.n - introduced.n, p: ecoState().introduced.p - introduced.p };
  for (const key of ['c', 'n', 'p']) near(after[key] - before[key], added[key], `bank seed endowment records ${key}`);
  near(Wd.liq.reduce((a, b) => a + b, 0), beforeWater, 'bank construction does not replace existing water');
  assert.deepEqual(Wd.liq, waterBefore); checks++;
  assert.deepEqual(Wd.typ, typesBefore); checks++;
  assert.deepEqual(Wd.sol, contentsBefore); checks++;
  for (let k = 0; k < C.W * C.H; k++) if (blocksBefore[k] === C.CLAY) assert.equal(Wd.solid[k], C.CLAY);
  checks++;
  ok(Wd.solid[at(44, 48)] === C.CLAY, 'bank construction retains the clay seal');
  ecoInitializeWorld();
  const stock = { ...ecoState().introduced }, saved = capture();
  clearWorld(7); restore(saved);
  near(plantLakeBanks(44, 50, 5, 5), 0, 'bank setup marker survives save/restore');
  assert.deepEqual(ecoState().introduced, stock); checks++;
  ok(plants.some(p => p.bank), 'saved bank seed identity survives');
}
{
  // Both heights are viable; the lower supported site must win without adding seeds above it.
  clearWorld(73); fill(45, 49, 46, 50, C.WATER, 20);
  Wd.solid[at(43, 47)] = C.DIRT; Wd.solid[at(44, 49)] = C.DIRT;
  ok(plantLakeBanks(44, 50, 5, 5) >= 1, 'two-height fixture has a real bank seed');
  ok(plants.some(p => p.root === at(44, 48)), 'lowest viable supported bank is preferred');
  ok(!plants.some(p => p.root === at(43, 46)), 'nearby higher site does not displace the lower seed');
}
for (const condition of ['water roof', 'sealed neighbors']) {
  clearWorld(73); Wd.solid.fill(C.STONE);
  const root = at(44, 48); Wd.solid[root] = 0; Wd.solid[root + C.W] = C.DIRT;
  // The vertical column transmits daylight in both controls; physical air access differs.
  for (let y = 0; y < 48; y++) Wd.solid[at(44, y)] = 0;
  if (condition === 'water roof') {
    Wd.liq[root - C.W] = 255; Wd.typ[root - C.W] = C.WATER; Wd.solid[root - 1] = 0;
  } else {
    Wd.solid[root - C.W] = C.LEAF; Wd.solid[root - 1] = C.GLASS; Wd.solid[root + 1] = C.GLASS;
  }
  Wd.solid[at(46, 49)] = 0; Wd.liq[at(46, 49)] = 255; Wd.typ[at(46, 49)] = C.WATER;
  ok(skyAbove(root), `${condition} fixture actually has daylight`);
  near(plantLakeBanks(44, 50, 5, 5), 0, `${condition} is rejected despite nearby water and soil`);
  ok(!plants.length, `${condition} does not receive a seed`);
}
{
  clearWorld(73);
  const rim = at(48, 45), channels = [C.SOL_SALT, C.SOL_SUGAR, C.SOL_PHOSPHATE];
  Wd.liq[rim] = 37; Wd.typ[rim] = C.WATER; Wd.temp[rim] = 65; Wd.latent[rim] = 123.5;
  channels.forEach((channel, i) => { Wd.sol[rim * C.NSOL + channel] = 13.1 / (i + 1); });
  const before = channels.map(channel => soluteAmount(rim, channel));
  lineLakeBasin(64, 45, 16, 8);
  near(Wd.liq.reduce((a, b) => a + b, 0), 37, 'lining relocates pre-existing rim water rather than deleting it');
  near(Wd.latent.reduce((a, b) => a + b, 0), 123.5, 'lining retains parcel latent energy');
  channels.forEach((channel, i) => {
    let amount = 0; for (let k = 0; k < C.W * C.H; k++) if (Wd.liq[k]) amount += soluteAmount(k, channel);
    near(amount, before[i], `lining retains ingredient channel ${channel}`);
  });
  ok(Wd.solid[rim] === C.CLAY, 'parcel relocation permits the rim to close');
  clearWorld(73);
  // Every compatible interior cell is full: there is nowhere to relocate another parcel.
  for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (((x - 64) / 16) ** 2 + ((y - 45) / 8) ** 2 < 1) {
    Wd.liq[at(x, y)] = 255; Wd.typ[at(x, y)] = C.WATER;
  }
  Wd.liq[rim] = 37; Wd.typ[rim] = C.WATER;
  lineLakeBasin(64, 45, 16, 8);
  near(Wd.liq[rim], 37, 'a full interior preserves a blocked rim parcel');
  ok(!Wd.solid[rim], 'a blocked parcel is not sealed inside a new solid');
}
{
  clearWorld(73); Wd.S.pressure = false;
  const cx = 64, cy = 45, rx = 16, ry = 8;
  const inside = k => ((k % C.W - cx) / rx) ** 2 + ((((k / C.W) | 0) - cy) / ry) ** 2 < 1;
  lineLakeBasin(cx, cy, rx, ry);
  let initial = 0;
  for (let y = cy - 1; y < cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (inside(at(x, y))) {
    Wd.liq[at(x, y)] = 255; Wd.typ[at(x, y)] = C.WATER; initial += 255;
  }
  Wd.wakeAll(); run(240);
  let water = 0, outside = 0;
  for (let k = 0; k < C.W * C.H; k++) if (Wd.typ[k] === C.WATER) { water += Wd.liq[k]; if (!inside(k)) outside += Wd.liq[k]; }
  near(water, initial, 'idle lined lake retains its finite water with weather off');
  near(outside, 0, 'lower rim has no connected water leak');
  ok(!Wd.solid[at(cx, cy - ry)], 'lake keeps an open lit entrance');
  // A player's cut changes the world permanently; ordinary ticks must not regenerate the rim.
  for (let x = cx - rx - 4; x <= cx - rx + 1; x++) Wd.solid[at(x, cy + 2)] = 0;
  Wd.wakeAll(); run(120);
  outside = 0; water = 0;
  for (let k = 0; k < C.W * C.H; k++) if (Wd.typ[k] === C.WATER) { water += Wd.liq[k]; if (!inside(k)) outside += Wd.liq[k]; }
  near(water, initial, 'cut basin redistributes existing water without refilling');
  ok(outside > 0, 'cut bank actually releases water');
  for (let x = cx - rx - 4; x <= cx - rx + 1; x++) ok(!Wd.solid[at(x, cy + 2)], 'ordinary ticks do not reseal a cut bank');
  const saved = capture(); clearWorld(7); restore(saved);
  for (let x = cx - rx - 4; x <= cx - rx + 1; x++) ok(!Wd.solid[at(x, cy + 2)], 'save restore preserves the cut bank');
}
console.log(`${checks} generated habitat checks pass`);
process.exit(0);
