// Generated nests reserve physical flight air through neighboring shrubs' future growth.
import assert from 'node:assert/strict';
import { C, Wd, at, box, clearWorld, fill } from './test-support.mjs';
import { placeWildHive } from '../js/biomes.js';
import { ecoComb, ecoFood, ecoInitialBody, ecoInitializeWorld, ecoIntroduce, ecoInventory, ecoPlantPool, ecoState, ecoTissue } from '../js/ecology.js';
import { ECO_COST } from '../js/ecology-data.js';
import { generate } from '../js/generate.js';
import { hiveCells, hiveNeighbors } from '../js/hives.js';
import { airTickOx } from '../js/oxygen.js';
import { dropSeed, hiveSeedSpace, plantSeed, plantTick, plants } from '../js/plants.js';
import { capture, restore } from '../js/snapshot.js';
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message) { ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`); }
function exteriorAccess(home, origin) {
  const faces = new Set(hiveCells(home).flatMap(hiveNeighbors).filter(k => !Wd.solid[k] && !Wd.liq[k]));
  const queue = [origin], visited = new Uint8Array(C.W * C.H); visited[origin] = 1;
  for (let i = 0; i < queue.length; i++) {
    if (faces.has(queue[i])) return true;
    for (const k of hiveNeighbors(queue[i])) if (!visited[k] && !Wd.solid[k] && !Wd.liq[k]) { visited[k] = 1; queue.push(k); }
  }
  return false;
}
function treeFixture() {
  clearWorld(73); Wd.S.timeMode = 'day';
  box(50, 35, 50, 46, C.WOOD); box(48, 47, 56, 48, C.DIRT);
  fill(54, 44, 56, 46, C.WATER, 20);
  ok(plantSeed(at(52, 46)), 'neighboring shrub starts with ordinary seed funding');
}
{
  treeFixture(); ecoInitializeWorld();
  const before = ecoInventory(plants), introduced = { ...ecoState().introduced };
  ok(placeWildHive(50, 45), 'tree has a clear face outside the neighboring seed envelope');
  const home = at(49, 45);
  ok(Wd.solid[home] === C.COMB && Wd.solid[home - 1] === C.COMB && !Wd.solid[home - C.W], 'two connected horizontal cells use the opposite left trunk face');
  ok(!Wd.solid[at(51, 45)], 'unsafe right face is left unused');
  const bees = Wd.bodies.filter(body => body.kind === 'bee');
  ok(bees.length === 3, 'wild nest keeps three finite starting bees');
  for (const bee of bees) ok(at(((bee.x + bee.w / 2) / C.T) | 0, ((bee.y + bee.h / 2) / C.T) | 0) === at(47, 45)
    && !Wd.solid[at(47, 45)] && !Wd.liq[at(47, 45)], 'bee spawns in the actual outer comb face');
  for (const k of [home, home - 1]) { ecoTissue(k); near(ecoComb(k), 255, 'wild comb retains its finite initial honey'); }
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key] - before[key], ecoState().introduced[key] - introduced[key], `nest stocks are recorded in ${key}`);
  const honey = ecoFood(510), beeStock = ecoInitialBody('bee');
  for (const key of ['c', 'n', 'p']) near(after[key] - before[key], honey[key] + 3 * beeStock[key] + (key === 'c' ? 2 * ECO_COST.wax : 0), `exactly two wax/honey cells and three bee stocks in ${key}`);
  ok(exteriorAccess(home, at(42, 40)), 'new nest has physical exterior air access');
  const shrub = plants[0];
  for (let i = 0; i < 400 && shrub.h < shrub.max; i++) { Wd.S.tick += 16; airTickOx(); plantTick(); }
  ok(shrub.h === shrub.max && shrub.h > 3, 'ordinary paid plant growth reaches its full height');
  ok(exteriorAccess(home, at(42, 40)), 'mature neighboring stems and leaves retain nest air access');
  const saved = capture(); clearWorld(7); restore(saved);
  ok(exteriorAccess(home, at(42, 40)), 'saved mature surroundings retain nest access');
  ok(hiveCells(home).length === 2 && hiveCells(home).every(k => ((k / C.W) | 0) === 45), 'save restore retains horizontal two-cell geometry');
  near(hiveCells(home).reduce((sum, k) => sum + ecoComb(k), 0), 510, 'save restore retains finite original honey');
  ok(Wd.bodies.filter(b => b.kind === 'bee').length === 3, 'save restore retains three original bees');
}
{
  treeFixture(); ok(plantSeed(at(48, 46)), 'opposite shrub starts with ordinary seed funding');
  const before = { ...ecoState().introduced };
  ok(!placeWildHive(50, 45), 'both unsafe growth envelopes reject a nest site');
  ok(!Wd.bodies.some(body => body.kind === 'bee'), 'rejected site introduces no bees');
  assert.deepEqual(ecoState().introduced, before); checks++;
}
{
  treeFixture(); Wd.solid[at(46, 47)] = C.DIRT;
  ok(plantSeed(at(46, 46)), 'existing shrub can begin three columns from the inner comb but two from its outer cell');
  const before = { ...ecoState().introduced };
  ok(!placeWildHive(50, 45), 'outer comb also reserves its full initial plant growth envelope');
  ok(!Wd.bodies.some(b => b.kind === 'bee'), 'outer-envelope rejection creates no bee');
  assert.deepEqual(ecoState().introduced, before); checks++;
}
{
  Wd.S.seed = 7; generate();
  const comb = []; for (let k = 0; k < C.W * C.H; k++) if (Wd.solid[k] === C.COMB) comb.push(k);
  ok(comb.length === 2 && Wd.bodies.filter(body => body.kind === 'bee').length === 3, 'generated seed7 retains two comb cells and three bees');
  assert.deepEqual(comb, [at(472, 37), at(473, 37)]); checks++;
  const parent = plants.find(p => p.root === at(476, 38)); ok(parent, 'the actual neighboring seed7 parent exists');
  const extra = { c: 100, n: 5, p: 0.5 }; ecoIntroduce(extra); parent.sugar += extra.c; parent.nitrogen += extra.n; parent.phosphorus += extra.p;
  const stock = ecoPlantPool(parent), introduced = { ...ecoState().introduced }, count = plants.length, savedRandom = Math.random;
  ok(!hiveSeedSpace(at(470, 38)), 'outer comb excludes the exact former root470 sealing site');
  try { let draw = 0; Math.random = () => [0.999, 0, 0.5][draw++] ?? 0.5; dropSeed(parent); } finally { Math.random = savedRandom; }
  ok(plants.length === count && !plants.some(p => p.root === at(470, 38)), 'actual natural seed attempt at former root470 is rejected');
  assert.deepEqual(ecoPlantPool(parent), stock); checks++;
  assert.deepEqual(ecoState().introduced, introduced); checks++;
  // Reserve every possible opaque stem/leaf/flower cell simultaneously: a conservative
  // geometric bound, alongside the real plant-growth fixture above.
  for (const plant of plants) {
    const px = plant.root % C.W, py = (plant.root / C.W) | 0;
    for (let y = Math.max(0, py - plant.max); y <= py; y++) for (let x = Math.max(0, px - 1); x <= Math.min(C.W - 1, px + 1); x++) {
      const k = at(x, y); if (!Wd.solid[k] && !Wd.liq[k]) Wd.solid[k] = C.LEAF;
    }
  }
  for (const home of comb) ok(exteriorAccess(home, at(0, 0)), 'all initial plants at maximum opaque extent leave exterior nest access');
  // A conservative copied-envelope bound: fill every dry empty target eligible near any
  // current WOOD, regardless of leaf RNG/funding. The outer face must still connect outside.
  for (let k = 0; k < C.W * C.H; k++) if (!Wd.solid[k] && !Wd.liq[k]) {
    const x = k % C.W, y = (k / C.W) | 0;
    let eligible = false;
    for (let dy = -2; dy <= 2 && !eligible; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < C.W && ny >= 0 && ny < C.H && Wd.solid[at(nx, ny)] === C.WOOD) { eligible = true; break; }
    }
    if (eligible) Wd.solid[k] = C.LEAF;
  }
  ok(!Wd.solid[at(471, 37)] && !Wd.liq[at(471, 37)], 'outer face stays outside every tree-regrowth envelope');
  for (const home of comb) ok(exteriorAccess(home, at(0, 0)), 'all eligible tree regrowth still leaves exterior hive access');
}
{
  clearWorld(73); box(469, 39, 476, 39, C.DIRT); ok(plantSeed(at(476, 38)), 'natural-seeding positive-control parent exists');
  const parent = plants[0], extra = { c: 100, n: 5, p: 0.5 }; ecoIntroduce(extra); parent.sugar += extra.c; parent.nitrogen += extra.n; parent.phosphorus += extra.p;
  const before = ecoPlantPool(parent), savedRandom = Math.random;
  try { let draw = 0; Math.random = () => [0.999, 0, 0.5][draw++] ?? 0.5; dropSeed(parent); } finally { Math.random = savedRandom; }
  ok(plants.some(p => p.root === at(470, 38)), 'the same natural-seed draw succeeds when no comb occupies its flight space');
  ok(ecoPlantPool(parent).c < before.c, 'successful positive-control seed actually spends parent resources');
}
for (const blocker of ['comb solid', 'comb liquid', 'outer air solid', 'outer air liquid', 'nearby wood']) {
  clearWorld(73); box(50, 35, 50, 46, C.WOOD);
  for (const side of [-1, 1]) {
    const k = at(50 + side * (blocker.startsWith('comb') ? 2 : 3), 45);
    if (blocker === 'nearby wood') Wd.solid[at(50 + side * 5, 45)] = C.WOOD;
    else if (blocker.endsWith('liquid')) { Wd.liq[k] = 37; Wd.typ[k] = C.WATER; Wd.sol[k * C.NSOL + C.SOL_CO2] = 27.125; Wd.latent[k] = 6.25; }
    else Wd.solid[k] = C.STONE;
  }
  const before = { blocks: Wd.solid.slice(), carrier: Wd.liq.slice(), types: Wd.typ.slice(), ingredients: Wd.sol.slice(), latent: Wd.latent.slice(), introduced: { ...ecoState().introduced } };
  ok(!placeWildHive(50, 45), `${blocker} rejects both unsafe nest sides`);
  assert.deepEqual(Wd.solid, before.blocks); assert.deepEqual(Wd.liq, before.carrier); assert.deepEqual(Wd.typ, before.types);
  assert.deepEqual(Wd.sol, before.ingredients); assert.deepEqual(Wd.latent, before.latent); checks++;
  assert.deepEqual(ecoState().introduced, before.introduced); checks++;
  ok(!Wd.bodies.some(b => b.kind === 'bee'), `${blocker} introduces no bees`);
}
for (const x of [2, C.W - 3]) {
  clearWorld(73); box(x, 35, x, 46, C.WOOD);
  ok(placeWildHive(x, 45), `edge trunk ${x} uses its valid inward face`);
  const comb = []; for (let k = 0; k < C.W * C.H; k++) if (Wd.solid[k] === C.COMB) comb.push(k);
  ok(comb.length === 2 && comb.every(k => ((k / C.W) | 0) === 45), 'edge placement never wraps comb cells across rows');
  ok(Wd.bodies.filter(b => b.kind === 'bee').every(b => b.x >= 0 && b.x + b.w <= C.W * C.T), 'edge placement keeps every bee inside the world');
}
for (const [x, y] of [[1, 45], [C.W - 2, 45], [50, 2], [50, C.H - 2]]) {
  clearWorld(73); Wd.solid[at(x, y)] = C.WOOD;
  ok(!placeWildHive(x, y), 'excluded boundary site rejects cleanly'); ok(!Wd.bodies.length, 'boundary rejection creates no bee');
}
{
  clearWorld(73); box(50, 35, 50, 46, C.WOOD); ok(placeWildHive(50, 45), 'ordinary blocked-hive negative starts at a valid site');
  const home = at(49, 45), cells = new Set(hiveCells(home));
  for (const k of [...cells].flatMap(hiveNeighbors)) if (!cells.has(k) && !Wd.solid[k] && !Wd.liq[k]) Wd.solid[k] = C.STONE;
  ok(!exteriorAccess(home, at(42, 40)), 'ordinary later blocking still seals the generated hive');
  const saved = capture(); clearWorld(7); restore(saved);
  ok(!exteriorAccess(home, at(42, 40)), 'save restore does not clear a blocked hive');
}
console.log(`${checks} generated hive placement checks pass`);
process.exit(0);
