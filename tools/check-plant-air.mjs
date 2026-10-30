// Actual owned canopy surfaces must reach finite air; rock/liquid/foreign tissue cannot act as gas conduits.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld } from './test-support.mjs';
import { ECO_COST } from '../js/ecology-data.js';
import { ecoInitializeWorld, ecoIntroduce, ecoInventory, ecoPlantCost, ecoState } from '../js/ecology.js';
import { airBeside, MAX_HEIGHT, PHOTO, RESPIRE, plantSeed, plants, plantTick } from '../js/plants.js';
import { CARB_PER_OX } from '../js/oxygen.js';
import { capture, restore } from '../js/snapshot.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message, tolerance = 1e-7) { ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }
function budget(before, label) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${label} retains ${key}`);
}
function neighbors(k) {
  const x = k % C.W, y = (k / C.W) | 0, cells = [];
  if (y) cells.push(k - C.W); if (x) cells.push(k - 1);
  if (x < C.W - 1) cells.push(k + 1); if (y < C.H - 1) cells.push(k + C.W);
  return cells;
}
function fund(p, c = 100, n = 10, phos = 1) {
  ecoIntroduce({ c, n, p: phos }); p.sugar += c; p.nitrogen += n; p.phosphorus += phos;
}
function own(p, k, block, cost) {
  assert.ok(ecoPlantCost(p, cost, k, block)); Wd.solid[k] = block;
}
function fixture(sealed = false) {
  clearWorld(73); Wd.S.timeMode = 'night';
  const root = at(44, 50); Wd.solid[root + C.W] = C.DIRT;
  Wd.liq[root - 1] = 255; Wd.typ[root - 1] = C.WATER;
  assert.ok(plantSeed(root)); const p = plants[0]; fund(p);
  for (let i = 1; i < 5; i++) own(p, root - i * C.W, C.PLANT, ECO_COST.stem);
  Object.assign(p, { top: root - 4 * C.W, h: 5, max: 6 });
  own(p, p.top - 1, C.LEAF, ECO_COST.leaf); own(p, p.top + 1, C.LEAF, ECO_COST.leaf);
  own(p, p.top - C.W, C.FLOWER, ECO_COST.flower); p.flower = p.top - C.W;
  if (sealed) for (const [key, tissue] of Object.entries(ecoState().tissue)) {
    if (tissue.owner !== p.id || tissue.block !== Wd.solid[key]) continue;
    for (const cell of neighbors(+key)) if (!Wd.solid[cell] && !Wd.liq[cell]) Wd.solid[cell] = C.STONE;
  }
  ecoInitializeWorld();
  return p;
}
function physiology(p, mode, label) {
  Wd.S.timeMode = mode;
  const air = airBeside(p.top), before = ecoInventory(plants), intro = structuredClone(ecoState().introduced);
  const state = { sugar: p.sugar, thirst: p.thirst, oxygen: Wd.airOx[air], carbon: Wd.airCarb[air],
    fixed: Wd.S.accounting.photosynthesisAirC ?? 0 };
  plantTick(); budget(before, label);
  assert.deepEqual(ecoState().introduced, intro); checks++;
  return { air, ...state };
}

{
  const p = fixture(), air = airBeside(p.top);
  ok(air >= 0 && !Wd.solid[air] && !Wd.liq[air], 'owned leaves and flower expose actual air despite filling the three top neighbors');
  ok([p.top - C.W, p.top - 1, p.top + 1].every(k => Wd.solid[k]), 'reproduction has no direct air beside the top stem');
  const before = physiology(p, 'night', 'open owned canopy at night'), need = RESPIRE * p.h;
  near(before.sugar - p.sugar, need, 'a paid owned canopy actually spends sugar to breathe at night');
  near(before.oxygen - Wd.airOx[before.air], need / CARB_PER_OX, 'nighttime respiration debits the selected finite oxygen reservoir');
  near(Wd.airCarb[before.air] - before.carbon, need, 'nighttime respiration retains its CO2');
  near(p.thirst, 0, 'exposed own surfaces do not create false oxygen stress');
}
{
  const p = fixture(); Wd.S.timeMode = 'day';
  const air = airBeside(p.top); Wd.airCarb[air] = 100;
  const before = physiology(p, 'day', 'daylight owned canopy'), fixed = PHOTO * p.h, burn = RESPIRE * p.h;
  near((Wd.S.accounting.photosynthesisAirC ?? 0) - before.fixed, fixed, 'daylight owned canopy fixes measured carbon');
  near(p.sugar - before.sugar, fixed - burn, 'daylight net sugar pays respiration after fixation');
  near(before.carbon - Wd.airCarb[before.air], fixed - burn, 'daylight gain comes from the actual selected air reservoir');
  near(Wd.airOx[before.air] - before.oxygen, (fixed - burn) / CARB_PER_OX, 'daylight gas exchange retains equal-mole oxygen');
}
{
  const p = fixture(); Wd.airCarb.fill(0);
  const before = physiology(p, 'day', 'missing CO2');
  near((Wd.S.accounting.photosynthesisAirC ?? 0) - before.fixed, 0, 'accessible air without CO2 supplies no photosynthesis');
  near(before.sugar - p.sugar, RESPIRE * p.h, 'missing CO2 does not suppress paid respiration');
}
{
  const p = fixture(), air = airBeside(p.top); Wd.airCarb.fill(0); Wd.airCarb[air] = 0.375;
  const before = physiology(p, 'day', 'fractional CO2');
  near((Wd.S.accounting.photosynthesisAirC ?? 0) - before.fixed, 0.375, 'fractional available CO2 caps photosynthesis');
  near(p.sugar - before.sugar, 0.375 - RESPIRE * p.h, 'fractional gas cannot fund a full photosynthetic request');
}
{
  const p = fixture(), air = airBeside(p.top); Wd.airOx.fill(0); Wd.airOx[air] = 0.025;
  const before = physiology(p, 'night', 'fractional oxygen');
  near(before.sugar - p.sugar, 0.025 * CARB_PER_OX, 'fractional oxygen caps sugar combustion');
  near(Wd.airOx[air], 0, 'the finite oxygen source is exhausted exactly');
  near(p.thirst, 1, 'unpaid oxygen demand remains physiological stress');
}
{
  const p = fixture(); Wd.airOx.fill(0);
  const before = physiology(p, 'night', 'anoxic exposed canopy');
  near(p.sugar, before.sugar, 'anoxic canopy cannot burn sugar without oxygen');
  near(p.thirst, 1, 'finding physical air does not prevent anoxic stress');
  const start = ecoInventory(plants);
  for (let i = 0; i < 1500 && plants.length; i++) plantTick();
  ok(!plants.length, 'an exposed canopy still wilts and dies when its air remains anoxic'); budget(start, 'anoxic canopy mortality');
}
{
  const p = fixture(true), before = physiology(p, 'night', 'rock-sealed owned canopy');
  near(before.air, -1, 'rock-sealed canopy cannot access the air outside its enclosing rocks');
  near(p.sugar, before.sugar, 'rock-sealed canopy cannot respire through stone'); near(p.thirst, 1, 'rock sealing remains real oxygen stress');
}
for (const barrier of ['foreign', 'unowned', 'stale', 'other block', 'liquid', 'submerged own tissue']) {
  const p = fixture(true), leaf = p.top - 1, outside = leaf - 1;
  Wd.solid[outside] = 0; // This is the sole exposed face; every own alternative is rock-sealed.
  const tissue = ecoState().tissue[leaf];
  if (barrier === 'foreign') tissue.owner = p.id + 1000;
  if (barrier === 'unowned') delete tissue.owner;
  if (barrier === 'stale') tissue.block = C.PLANT;
  if (barrier === 'other block') { Wd.solid[leaf] = C.GLASS; tissue.block = C.GLASS; }
  if (barrier === 'liquid') { Wd.solid[leaf] = 0; Wd.liq[leaf] = 1; Wd.typ[leaf] = C.WATER; }
  if (barrier === 'submerged own tissue') { Wd.liq[leaf] = 1; Wd.typ[leaf] = C.WATER; }
  const before = physiology(p, 'night', `${barrier} gas barrier`);
  near(before.air, -1, `${barrier} cell is not an owned gas conduit`);
  near(p.sugar, before.sugar, `${barrier} barrier prevents gas spending`); near(p.thirst, 1, `${barrier} barrier retains oxygen stress`);
}
{
  clearWorld(73); const root = at(44, 50); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  near(airBeside(root), root - C.W, 'direct gas access keeps above-first ordering');
  Wd.solid[root - C.W] = C.STONE; near(airBeside(root), root - 1, 'direct gas access keeps left-second ordering');
  Wd.solid[root - 1] = C.STONE; near(airBeside(root), root + 1, 'direct gas access keeps right-third ordering');
}
for (const [x, y] of [[0, 50], [C.W - 1, 50], [44, 0]]) {
  clearWorld(73); const root = at(x, y); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  for (const n of neighbors(root)) if (n !== root + C.W) Wd.solid[n] = C.STONE;
  near(airBeside(root), -1, `world edge ${x},${y} does not wrap to unrelated air`);
}
{
  clearWorld(73); const root = at(44, 60); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  const p = plants[0]; fund(p, 500, 50, 5); const limit = MAX_HEIGHT[1] * 3 + 1;
  for (let i = 1; i <= limit; i++) own(p, root - i * C.W, C.PLANT, ECO_COST.stem);
  for (let i = 0; i <= limit; i++) { Wd.solid[root - i * C.W - 1] = C.STONE; Wd.solid[root - i * C.W + 1] = C.STONE; }
  near(airBeside(root), -1, 'a long owned tissue chain cannot bypass the bounded gas search');
}
{
  const p = fixture(); Wd.S.timeMode = 'day'; const air = airBeside(p.top); Wd.airCarb[air] = 100;
  const before = ecoInventory(plants), saved = capture(); plantTick();
  const expected = { plant: structuredClone(plants[0]), oxygen: Wd.airOx[air], carbon: Wd.airCarb[air], fixed: Wd.S.accounting.photosynthesisAirC };
  restore(saved); plantTick();
  assert.deepEqual(plants[0], expected.plant); checks++;
  near(airBeside(plants[0].top), air, 'saved ownership retains the same accessible gas face');
  near(Wd.airOx[air], expected.oxygen, 'saved canopy continues identical oxygen exchange');
  near(Wd.airCarb[air], expected.carbon, 'saved canopy continues identical carbon exchange');
  near(Wd.S.accounting.photosynthesisAirC, expected.fixed, 'saved canopy retains actual fixation counters'); budget(before, 'saved canopy continuation');
}
console.log(`Plant air checks: ${checks} passed`);
process.exit(0);
