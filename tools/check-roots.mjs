// Finite connected-soil access, mineral uptake budgets and paid flowering.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, box, fill } from './test-support.mjs';
import { ECO_RATE } from '../js/ecology-data.js';
import { ecoInitializeWorld, ecoInventory, ecoPlantPool, ecoRootSoil, ecoState, ecoStorePlant } from '../js/ecology.js';
import { drink, dropSeed, hiveSeedSpace, plantSeed, plants, plantTick } from '../js/plants.js';
import { airTickOx } from '../js/oxygen.js';
let checks = 0;
const ok = (value, name) => { assert.ok(value, name); checks++; };
const near = (a, b, name) => ok(Math.abs(a - b) < 1e-7, `${name}: ${a} != ${b}`);
function budget(before) { const after = ecoInventory(plants); for (const key of ['c', 'n', 'p']) near(before[key], after[key], `root uptake retains ${key}`); }
function fixture() {
  clearWorld(73); box(40, 50, 48, 52, C.DIRT);
  plantSeed(at(44, 49)); ecoInitializeWorld();
  const p = plants[0], e = ecoState();
  for (const pool of Object.values(e.soil)) { pool.n = 0; pool.p = 0; }
  return { p, e, root: at(44, 50) };
}
{
  const { p, e, root } = fixture(); e.soil[root + 2].n = 1; e.soil[root + 2].p = 0.1;
  const before = ecoInventory(plants), n = p.nitrogen, phos = p.phosphorus;
  ecoRootSoil(root, p);
  near(p.nitrogen - n, ECO_RATE.rootNitrogen, 'connected neighbors supply the existing total N uptake budget');
  near(p.phosphorus - phos, ECO_RATE.rootPhosphorus, 'connected neighbors supply the existing total P uptake budget');
  budget(before);
  for (let i = 0; i < 100; i++) ecoRootSoil(root, p);
  near(p.nitrogen - n, 1, 'depleted finite soil cannot keep supplying nitrogen');
  near(p.phosphorus - phos, 0.1, 'depleted finite soil cannot keep supplying phosphorus');
  budget(before);
}
{
  const { p, e, root } = fixture();
  e.soil[root + 4].n = 10; e.soil[root + 4].p = 1;
  const n = p.nitrogen, before = ecoInventory(plants); ecoRootSoil(root, p);
  near(p.nitrogen, n, 'roots cannot reach beyond the named radius'); budget(before);
  Wd.solid[root + 1] = C.STONE; Wd.solid[root + C.W + 1] = C.STONE; Wd.solid[root + 2 * C.W + 1] = C.STONE;
  e.soil[root + 2].n = 10; e.soil[root + 2].p = 1;
  ecoRootSoil(root, p);
  near(p.nitrogen, n, 'rock blocks access to neighboring mineral stores');
}
{
  const { p, e, root } = fixture();
  Wd.solid[root + 1] = 0; Wd.solid[root + C.W + 1] = 0; Wd.solid[root + 2 * C.W + 1] = 0;
  e.soil[root + 2].n = 10; e.soil[root + 2].p = 1;
  const n = p.nitrogen; ecoRootSoil(root, p);
  near(p.nitrogen, n, 'an air gap is not a connected root path');
}
{
  const { p, e, root } = fixture();
  e.soil[root - 1].n = 0.06; e.soil[root - 1].p = 0.005;
  e.soil[root + 1].n = 0.08; e.soil[root + 1].p = 0.02;
  const before = ecoInventory(plants), n = p.nitrogen, phos = p.phosphorus;
  ecoRootSoil(root, p);
  near(p.nitrogen - n, ECO_RATE.rootNitrogen, 'branched sources share one nitrogen budget');
  near(p.phosphorus - phos, ECO_RATE.rootPhosphorus, 'branched sources share one phosphorus budget');
  budget(before);
}
{
  clearWorld(7); box(0, 50, 0, 51, C.DIRT); box(C.W - 1, 49, C.W - 1, 51, C.DIRT);
  plantSeed(at(0, 49)); ecoInitializeWorld();
  const p = plants[0], e = ecoState(), n = p.nitrogen;
  e.soil[at(0, 50)].n = e.soil[at(0, 50)].p = 0;
  e.soil[at(0, 51)].n = e.soil[at(0, 51)].p = 0;
  const before = ecoInventory(plants); ecoRootSoil(at(0, 50), p);
  near(p.nitrogen, n, 'connected roots cannot wrap across world row edges'); budget(before);
}
{
  clearWorld(7); box(40, 50, 48, 52, C.DIRT); fill(42, 49, 42, 49, C.WATER, 20);
  box(39, 30, 49, 30, C.GLASS); box(39, 30, 39, 53, C.GLASS); box(49, 30, 49, 53, C.GLASS);
  for (let y = 31; y < 50; y++) for (let x = 40; x <= 48; x++) Wd.airCarb[at(x, y)] = 60;
  plantSeed(at(44, 49)); ecoInitializeWorld(); Wd.S.timeMode = 'day';
  const p = plants[0]; p.max = 5;
  ecoState().soil[at(44, 50)].n = ecoState().soil[at(44, 50)].p = 0;
  const before = ecoInventory(plants), intro = { ...ecoState().introduced };
  for (let i = 0; i < 1500; i++) {
    Wd.S.tick += 16; airTickOx(); plantTick();
    if (p.flower >= 0 && ecoState().nectar[p.flower] > 0) break;
  }
  ok(p.h === 5 && p.flower >= 0 && Wd.solid[p.flower] === C.FLOWER, 'connected finite nutrients can fund a mature flowering plant');
  ok((ecoState().nectar[p.flower] || 0) > 0, 'the flowering plant makes paid nectar');
  budget(before);
  assert.deepEqual(ecoState().introduced, intro); checks++;
}
{
  clearWorld(7); box(30, 61, 50, 62, C.DIRT); plantSeed(at(40, 60)); ecoInitializeWorld();
  const p = plants[0]; p.sugar = 100; p.nitrogen = 10; p.phosphorus = 1;
  box(34, 57, 46, 57, C.COMB);
  ok(!hiveSeedSpace(at(46, 60)), 'natural seed growth envelopes leave existing hive entrances clear');
  ok(hiveSeedSpace(at(50, 60)), 'distant natural seeds are not excluded');
  const before = ecoInventory(plants), resources = [p.sugar, p.nitrogen, p.phosphorus], random = Math.random;
  Math.random = () => 0.99;
  try { dropSeed(p); } finally { Math.random = random; }
  ok(plants.length === 1, 'natural seed placement does not grow into occupied hive flight space');
  assert.deepEqual([p.sugar, p.nitrogen, p.phosphorus], resources); checks++;
  budget(before);
  ok(plantSeed(at(46, 60)), 'manual seed placement can still deliberately block a hive');
  clearWorld(7); Wd.solid[at(C.W - 1, 49)] = C.COMB;
  ok(hiveSeedSpace(at(0, 50)), 'hive seed spacing does not wrap across row edges');
}
{
  clearWorld(7); box(40, 61, 45, 62, C.DIRT); plantSeed(at(40, 60)); ecoInitializeWorld();
  const parent = plants[0]; parent.sugar = 100; parent.nitrogen = 10; parent.phosphorus = 1;
  const soil = at(44, 61); Wd.solid[soil] = C.WETDIRT; Wd.held[soil] = 128;
  const before = ecoInventory(plants), intro = structuredClone(ecoState().introduced), funding = ecoPlantPool(parent);
  ok(plantSeed(at(44, 60), funding), 'existing wet soil can support a paid seed'); ecoStorePlant(parent, funding);
  ok(Wd.held[soil] === 128, 'seeding on wet soil preserves its finite water'); budget(before);
  assert.deepEqual(ecoState().introduced, intro); checks++;
  Wd.solid[at(45, 61)] = C.STONE;
  ok(!plantSeed(at(45, 60)), 'wet-soil support does not permit seeding on rock');
}
{
  clearWorld(7); box(44, 50, 44, 51, C.DIRT); plantSeed(at(44, 49));
  const film = at(43, 49), source = at(42, 49);
  fill(43, 49, 43, 49, C.WATER, 20, 1); fill(42, 49, 42, 49, C.WATER, 20, 64);
  Wd.sol[film * C.NSOL + C.SOL_FERT] = 255;
  const before = ecoInventory(plants), p = plants[0];
  ok(drink(p.root, p) > 0, 'an unusable nearby film does not hide farther root-reachable water');
  ok(Wd.liq[source] === 56 && Wd.liq[film] === 1, 'root drinking spends actual usable carrier and retains the film');
  near(Wd.sol[film * C.NSOL + C.SOL_FERT], 255, 'a skipped film does not grant an extra mineral uptake'); budget(before);
  Wd.liq[source] = 0; Wd.typ[source] = 0; Wd.sol.fill(0, source * C.NSOL, (source + 1) * C.NSOL);
  const dry = ecoInventory(plants);
  ok(drink(p.root, p) === 0, 'a lone retained film cannot supply open-air transpiration'); budget(dry);
}
console.log(`${checks} connected-root checks pass`);
process.exit(0);
