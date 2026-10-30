// Funded winter shelter: actual honey/O2/CO2/heat, local access, controls and saved continuation.
import assert from 'node:assert/strict';
import { C, Wd, at, box, clearWorld, step } from './test-support.mjs';
import { addBody } from '../js/bodies.js';
import { centre, driveBee, driveCreature } from '../js/creatures.js';
import { ECO_ANIMALS, ECO_C, ECO_RATE } from '../js/ecology-data.js';
import { ecoComb, ecoInitializeWorld, ecoInventory, ecoSetComb, ecoState, ecoTissue } from '../js/ecology.js';
import { feedHiveBee, hiveCells, hiveContext, hiveNeighbors, hiveReturnCell, warmHiveBee } from '../js/hives.js';
import { AIR_CAP } from '../js/matter.js';
import { AIR_CO2_EQ_MG_PER_UNIT, CARB_PER_OX, MAX_AIR_CARB } from '../js/oxygen.js';
import { ambient, colTemp, colSwing, skyTempAt } from '../js/climate.js';
import { DAY_TICKS } from '../js/daynight.js';
import { plants } from '../js/plants.js';
import { capture, restore, packWorld, unpackWorld } from '../js/snapshot.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message, tolerance = 1e-7) { ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }
function budget(before, message) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${message} ${key}`);
}
function hiveFixture(honey = 1, temperature = -10) {
  clearWorld(73); Wd.temp.fill(temperature); ambient.fill(temperature);
  const home = at(40, 50), k = home + 1;
  Wd.solid[home] = C.COMB; ecoSetComb(home, honey); ecoTissue(home);
  const bee = addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3);
  bee.home = home; bee.homeAt = Wd.S.tick;
  assert.equal(centre(bee), k);
  return { home, k, bee, context: hiveContext(home, k) };
}
{
  const { home, k, bee, context } = hiveFixture();
  const before = ecoInventory(plants), oxygen = Wd.airOx[k], carbon = Wd.airCarb[k], temperature = Wd.temp[k], honey = ecoComb(home);
  const heat = warmHiveBee(bee, k, context), paid = Wd.S.accounting.hiveMetabolicCarbon;
  ok(heat > 0, 'cold home air receives funded heat');
  near(paid, ECO_RATE.hiveBurn, 'heat generation has a per-bee carbon power limit');
  near((honey - ecoComb(home)) * ECO_C.honey, paid, 'metabolic carbon debits actual honey');
  near((oxygen - Wd.airOx[k]) * CARB_PER_OX, paid, 'actual oxygen pays heating respiration');
  near(Wd.airCarb[k] - carbon, paid, 'heating respiration retains its CO2');
  near((Wd.temp[k] - temperature) * AIR_CAP, heat, 'added air energy matches paid heat', 1e-6);
  near(heat, paid * ECO_RATE.hiveJoulesPerCarbon, 'named game energy conversion is applied');
  budget(before, 'heating');
}
{
  const { home, k, bee, context } = hiveFixture(1e-6), before = ecoInventory(plants), honey = ecoComb(home);
  const heat = warmHiveBee(bee, k, context);
  near(heat, honey * ECO_C.honey * ECO_RATE.hiveJoulesPerCarbon, 'a fractional final honey store limits heat');
  near(ecoComb(home), 0, 'last honey is spent without a full-comb sentinel'); budget(before, 'last honey');
  near(warmHiveBee(bee, k, context), 0, 'exhausted comb cannot keep heating');
}
{
  const { home, k, bee, context } = hiveFixture(); Wd.airOx.fill(0);
  Wd.airOx[k] = ECO_RATE.hiveBurn / CARB_PER_OX / 4;
  const before = ecoInventory(plants), honey = ecoComb(home), expected = ECO_RATE.hiveBurn / 4;
  const heat = warmHiveBee(bee, k, context);
  near(heat, expected * ECO_RATE.hiveJoulesPerCarbon, 'fractional available oxygen limits heat');
  near((honey - ecoComb(home)) * ECO_C.honey, expected, 'oxygen shortage retains unpaid honey'); budget(before, 'limited oxygen');
  near(warmHiveBee(bee, k, context), 0, 'anoxic hive cannot heat');
}
{
  const { home, k, bee, context } = hiveFixture(); Wd.airCarb.fill(MAX_AIR_CARB);
  const honey = ecoComb(home), temperature = Wd.temp[k];
  near(warmHiveBee(bee, k, context), 0, 'blocked CO2 storage stops heating respiration');
  near(ecoComb(home), honey, 'product blockage retains honey'); near(Wd.temp[k], temperature, 'product blockage grants no heat');
}
{
  const { home, k, bee, context } = hiveFixture(0);
  const before = ecoInventory(plants); near(warmHiveBee(bee, k, context), 0, 'empty hive is not a heat source'); budget(before, 'empty hive');
  ecoSetComb(home, 1); Wd.temp[k] = ECO_RATE.hiveTarget + 5;
  near(warmHiveBee(bee, k, context), 0, 'warm hive does not burn honey for heating');
  near(ecoComb(home), 1, 'warm control retains heating stock');
  near(warmHiveBee(bee, k + 3, context), 0, 'distant bee cannot draw remote hive heat');
  near(warmHiveBee(bee, k, null), 0, 'a missing hive supplies no heat');
}
{
  const { home, k, bee } = hiveFixture(0), other = home - C.W;
  Wd.solid[other] = C.COMB; ecoSetComb(other, 1); ecoTissue(other);
  const context = hiveContext(home, k), before = ecoInventory(plants);
  ok(warmHiveBee(bee, k, context) > 0, 'connected honey behind an empty front cell can fund shelter');
  ok(ecoComb(other) < 1 && ecoComb(home) === 0, 'connected source is actually debited'); budget(before, 'connected honey');
  bee.bio.c = ECO_ANIMALS.bee.body; const foodBefore = ecoInventory(plants);
  ok(feedHiveBee(bee, k, context) > 0, 'ordinary feeding can also reach connected honey'); budget(foodBefore, 'connected feeding');
}
{
  clearWorld(73); const edge = at(C.W - 1, 50), wrapped = edge + 1;
  Wd.solid[edge] = Wd.solid[wrapped] = C.COMB; ecoSetComb(edge, 0); ecoSetComb(wrapped, 1);
  assert.deepEqual(hiveCells(edge), [edge]); checks++;
  ok(!hiveContext(edge, edge - 1).cells.includes(wrapped), 'adjacent rows do not connect across the horizontal world edge');
  for (const n of [edge - 1, edge - C.W, edge + C.W]) Wd.solid[n] = C.STONE;
  near(hiveContext(edge, edge - 2).rest, -1, 'fully blocked comb has no physical resting air');
}
{
  const { home, bee } = hiveFixture(1, 20), pocket = home + 1;
  for (const n of hiveNeighbors(home)) if (n !== pocket) Wd.solid[n] = C.STONE;
  for (const n of hiveNeighbors(pocket)) if (n !== home) Wd.solid[n] = C.STONE;
  bee.x = 45 * C.T + 2.5; const k = centre(bee), context = hiveContext(home, k), before = ecoInventory(plants);
  ok(context.rest === pocket, 'sealed-air-pocket control has a real but inaccessible comb face');
  near(hiveReturnCell(bee, k, context), -1, 'an inaccessible comb face is not returned as a planned waypoint');
  const path = bee.hivePath, attempted = bee.hiveRouteAt; Wd.S.tick++;
  near(hiveReturnCell(bee, k, context), -1, 'failed route remains a failed route on its next tick');
  ok(bee.hivePath === path && bee.hiveRouteAt === attempted, 'failed route retry reuses its bounded cached result');
  budget(before, 'failed route search');
}
{
  const { home, k, bee } = hiveFixture(0, 20); Wd.S.timeMode = 'day';
  const flower = at(45, 50); Wd.solid[flower] = C.FLOWER; Wd.held[flower] = 1; ecoInitializeWorld();
  const cargo = ECO_RATE.beeLoad - ECO_RATE.epsilon / 2; bee.load = cargo; bee.target = flower;
  const before = ecoInventory(plants); driveBee(bee, { lava: 0, acid: 0 }, k, 20, addBody);
  near(bee.load, 0, 'a fractionally full cargo returns home instead of making negligible nectar visits');
  assert.equal(ecoComb(home), cargo, 'behavioral fullness retains the exact fractional cargo in honey'); checks++;
  budget(before, 'fractionally full cargo');
}
{
  const { home, bee } = hiveFixture(0, 20); Wd.S.timeMode = 'day'; bee.x = 46 * C.T + 2.5;
  bee.load = ECO_RATE.beeLoad; const k = centre(bee), before = ecoInventory(plants);
  driveBee(bee, { lava: 0, acid: 0 }, k, 20, addBody);
  near(bee.load, ECO_RATE.beeLoad, 'a loaded bee retains cargo while following a home waypoint');
  near(ecoComb(home), 0, 'a nearby waypoint cannot deposit honey into a remote hive'); budget(before, 'enroute cargo');
}
{
  const { bee } = hiveFixture(0, 20), flower = at(44, 50); Wd.S.timeMode = 'day';
  Wd.solid[flower] = C.FLOWER; Wd.held[flower] = 1; ecoInitializeWorld();
  for (const n of hiveNeighbors(flower)) Wd.solid[n] = C.STONE;
  bee.x = 42 * C.T + 2.5; bee.target = flower; const k = centre(bee), before = ecoInventory(plants);
  for (let i = 0; i < 50; i++) driveBee(bee, { lava: 0, acid: 0 }, k, 20, addBody);
  near(bee.load, 0, 'a fully obstructed flower cannot be harvested through its walls');
  near(ecoState().nectar[flower], 1, 'blocked flower retains its real nectar'); budget(before, 'blocked nectar');
}
{
  const { home, bee } = hiveFixture(0, 20), flower = at(46, 50); Wd.S.timeMode = 'day';
  box(35, 43, 50, 43, C.STONE); box(35, 57, 50, 57, C.STONE);
  box(35, 43, 35, 57, C.STONE); box(50, 43, 50, 57, C.STONE); box(43, 47, 43, 52, C.STONE);
  Wd.solid[flower] = C.FLOWER; Wd.held[flower] = 0.5; ecoInitializeWorld(); bee.target = flower;
  const before = ecoInventory(plants); let remoteDeposit = false;
  for (let i = 0; i < 1800; i++) {
    const k = centre(bee), adjacent = hiveContext(home, k).adjacent.has(k), stored = Wd.S.accounting.honeyStored || 0;
    step(); if ((Wd.S.accounting.honeyStored || 0) > stored && !adjacent) remoteDeposit = true;
  }
  ok((Wd.S.accounting.nectarCollected || 0) > 0, 'a forager can physically route around a trunk to real nectar');
  ok((Wd.S.accounting.honeyStored || 0) > 0 && !remoteDeposit, 'forager delivers its load only after physically returning to comb');
  budget(before, 'obstructed foraging and return');
}
{
  const { home, bee } = hiveFixture(1, -10);
  box(35, 43, 50, 43, C.STONE); box(35, 57, 50, 57, C.STONE);
  box(35, 43, 35, 57, C.STONE); box(50, 43, 50, 57, C.STONE);
  box(43, 47, 43, 52, C.STONE);
  bee.x = 46 * C.T + 2.5; bee.y = 50 * C.T + 3; Wd.S.timeMode = 'night';
  const k = centre(bee), before = ecoInventory(plants), waypoint = hiveReturnCell(bee, k, hiveContext(home, k));
  ok(hiveNeighbors(k).includes(waypoint), 'return route starts with an actual adjacent air waypoint');
  ok(bee.hivePath.length > 6 && bee.hivePath.every(n => !Wd.solid[n] && !Wd.liq[n]), 'return route detours around the obstructing trunk through open air');
  budget(before, 'route planning');
  const snapshot = capture(), path = [...bee.hivePath]; restore(snapshot);
  assert.deepEqual(Wd.bodies[0].hivePath, path); checks++;
  near(hiveReturnCell(Wd.bodies[0], k, hiveContext(home, k)), waypoint, 'saved homing route retains its next physical waypoint');
  addBody('bee', 46 * C.T + 2.5, 50 * C.T + 3); addBody('bee', 46 * C.T + 2.5, 50 * C.T + 3);
  for (const b of Wd.bodies) { b.home = home; b.homeAt = Wd.S.tick; }
  const routeBefore = ecoInventory(plants);
  for (let i = 0; i < 1500; i++) step();
  ok(Wd.bodies.length === 3 && Wd.bodies.every(b => hiveContext(home, centre(b)).adjacent.has(centre(b))), 'returning bees physically navigate around a trunk and reach their comb before freezing');
  ok((Wd.S.accounting.hiveHeatJ || 0) > 0 && ecoComb(home) < 1, 'navigating bees receive funded heat only after reaching their comb');
  budget(routeBefore, 'physical return');
}
{
  const { home, bee } = hiveFixture(1, -10);
  for (const n of hiveNeighbors(home)) Wd.solid[n] = C.STONE;
  bee.x = 44 * C.T + 2.5;
  Wd.S.timeMode = 'night'; const before = ecoInventory(plants);
  for (let i = 0; i < 1900 && Wd.bodies.length; i++) step();
  ok(!Wd.bodies.length && bee.deathCause === 'cold', 'a fully obstructed hive still cannot protect a returning bee');
  near(Wd.S.accounting.hiveHeatJ || 0, 0, 'route failure cannot grant remote heat');
  // The open atmosphere can remove respiration products in this negative control.
  const after = ecoInventory(plants), boundary = (Wd.S.accounting.gasAtmosphereCarbonEqMg || 0) / AIR_CO2_EQ_MG_PER_UNIT;
  near(after.c - before.c, boundary, 'failed homing retains carbon including its atmosphere boundary');
  for (const key of ['n', 'p']) near(after[key], before[key], `failed homing retains ${key}`);
}
{
  const { home, k, bee } = hiveFixture(1, -10); Wd.S.timeMode = 'day';
  Wd.temp[k] = ECO_RATE.hiveTarget;
  const flower = at(45, 50); Wd.solid[flower] = C.FLOWER; Wd.held[flower] = 1;
  bee.target = flower; bee.since = Wd.S.tick;
  const x = bee.x; driveBee(bee, { lava: 0, acid: 0 }, k, Wd.temp[k], addBody);
  near(bee.load || 0, 0, 'artificially warm shelter is not mistaken for foraging weather');
  ok(Math.abs(bee.vx) < 0.1 && Math.abs(bee.x - x) < 1e-10, 'cold-weather bee rests at its physical comb face');
  ok(hiveContext(home, k).outside < 0, 'weather sample remains outside heated comb faces');
}
{
  const { home, k, bee } = hiveFixture(); bee.target = home; Wd.S.timeMode = 'night';
  const before = ecoInventory(plants), introduced = { ...ecoState().introduced };
  driveBee(bee, { lava: 0, acid: 0 }, k, Wd.temp[k], addBody);
  near(bee.load || 0, 0, 'a former flower target replaced by comb cannot be collected as nectar');
  ok(ecoState().nectar[home] === undefined, 'stale target creates no duplicate nectar inventory on comb');
  assert.deepEqual(ecoState().introduced, introduced); checks++; budget(before, 'stale winter target');
}
{
  const { k, bee } = hiveFixture(); Wd.airOx.fill(0);
  const before = ecoInventory(plants), area = bee.w * bee.h;
  let alive = true;
  for (let i = 0; i < 400 && alive; i++) alive = driveCreature(bee, { water: 0, lava: 0, acid: 0 }, 0, false, area, addBody);
  ok(!alive && bee.deathCause === 'stale-air', 'a stocked but anoxic winter hive cannot prevent choking');
  near(Wd.S.accounting.hiveHeatJ || 0, 0, 'anoxic mortality control receives no free heat'); budget(before, 'anoxic winter bee');
}
{
  clearWorld(73); Wd.temp.fill(-10); ambient.fill(-10);
  const bee = addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3), k = centre(bee);
  const before = ecoInventory(plants), area = bee.w * bee.h;
  let alive = true;
  for (let i = 0; i < 1900 && alive; i++) alive = driveCreature(bee, { water: 0, lava: 0, acid: 0 }, 0, false, area, addBody);
  ok(!alive && bee.deathCause === 'cold', 'a cold bee without a physical hive still freezes');
  near(Wd.S.accounting.hiveHeatJ || 0, 0, 'missing hive mortality control receives no heat'); budget(before, 'missing winter hive');
}
{
  const { home, k, bee, context } = hiveFixture(); warmHiveBee(bee, k, context);
  const code = await packWorld(capture());
  warmHiveBee(bee, k, hiveContext(home, k));
  const expected = { temp: Wd.temp[k], honey: ecoComb(home), oxygen: Wd.airOx[k], carbon: Wd.airCarb[k], heat: Wd.S.accounting.hiveHeatJ };
  clearWorld(); restore(await unpackWorld(code));
  warmHiveBee(Wd.bodies[0], k, hiveContext(home, k));
  near(Wd.temp[k], expected.temp, 'saved shelter retains air heat and future warming');
  near(ecoComb(home), expected.honey, 'saved shelter retains future finite honey debit');
  near(Wd.airOx[k], expected.oxygen, 'saved shelter retains future oxygen debit');
  near(Wd.airCarb[k], expected.carbon, 'saved shelter retains future CO2');
  near(Wd.S.accounting.hiveHeatJ, expected.heat, 'saved shelter retains heat ledger');
}
// Real body movement, heat diffusion, day/night steps and oxygen mixing under a fixed cold cave boundary.
// This controls the weather boundary so differences are caused by stored food, without matter top-ups.
function coldCycle(honey) {
  const { home } = hiveFixture(honey, -10);
  box(36, 46, 44, 46, C.STONE); box(36, 54, 44, 54, C.STONE);
  box(36, 46, 36, 54, C.STONE); box(44, 46, 44, 54, C.STONE);
  Wd.S.timeMode = 'cycle'; Wd.S.tick = 6 * DAY_TICKS;
  addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3); addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3);
  for (const b of Wd.bodies) { b.home = home; b.homeAt = Wd.S.tick; }
  const initial = ecoInventory(plants), introductions = { ...ecoState().introduced };
  let lowest = Infinity;
  for (let i = 0; i < DAY_TICKS; i++) {
    step();
    for (const b of Wd.bodies) if (b.kind === 'bee') lowest = Math.min(lowest, Wd.temp[centre(b)]);
  }
  budget(initial, `cold-cycle ${honey ? 'fed' : 'unfed'}`);
  assert.deepEqual(ecoState().introduced, introductions); checks++;
  return { bees: Wd.bodies.filter(b => b.kind === 'bee').length, honey: ecoComb(home), heat: Wd.S.accounting.hiveHeatJ || 0,
    deaths: { ...Wd.S.diagnostics.deathCounts }, lowest };
}
const fed = coldCycle(1), unfed = coldCycle(0);
ok(fed.bees === 3 && fed.honey < 1 && fed.heat > 0, `fed winter shelter sustains bees through a real day/night cycle: ${JSON.stringify(fed)}`);
ok(unfed.bees === 0 && unfed.heat === 0 && unfed.deaths['bee:cold'] === 3, `unfed cold control loses its bees: ${JSON.stringify(unfed)}`);
// A separate open fixture includes actual winter weather, moving bodies and recorded atmosphere exchange.
const { home: winterHome } = hiveFixture(1, -10);
Wd.under.fill(0); Wd.S.weather = true; Wd.S.timeMode = 'cycle'; Wd.S.tick = 6 * DAY_TICKS;
colTemp.fill(-10); colSwing.fill(0.3);
addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3); addBody('bee', 41 * C.T + 2.5, 50 * C.T + 3);
for (const b of Wd.bodies) { b.home = winterHome; b.homeAt = Wd.S.tick; }
const winterInitial = ecoInventory(plants), winterIntroduced = { ...ecoState().introduced };
const boundaryBefore = Wd.S.accounting.gasAtmosphereCarbonEqMg || 0;
let outdoorMin = Infinity, outdoorMax = -Infinity;
for (let i = 0; i < DAY_TICKS; i++) {
  step(); const outdoor = skyTempAt(40, 50);
  outdoorMin = Math.min(outdoorMin, outdoor); outdoorMax = Math.max(outdoorMax, outdoor);
}
const winterFinal = ecoInventory(plants);
near(winterFinal.c - winterInitial.c, ((Wd.S.accounting.gasAtmosphereCarbonEqMg || 0) - boundaryBefore) / AIR_CO2_EQ_MG_PER_UNIT,
  'open winter carbon matches recorded atmosphere exchange');
for (const key of ['n', 'p']) near(winterFinal[key], winterInitial[key], `open winter retains ${key}`);
assert.deepEqual(ecoState().introduced, winterIntroduced); checks++;
const winter = { bees: Wd.bodies.filter(b => b.kind === 'bee').length, honey: ecoComb(winterHome),
  heat: Wd.S.accounting.hiveHeatJ || 0, deaths: { ...Wd.S.diagnostics.deathCounts }, outdoorMin, outdoorMax };
ok(winter.outdoorMin < -10 && winter.outdoorMax > 0, 'integrated weather actually crosses freezing over a winter day');
ok(winter.bees === 3 && winter.heat > 0 && winter.honey < 1, `funded open hive survives actual winter weather: ${JSON.stringify(winter)}`);
console.log(JSON.stringify({ fed, unfed, winter }));
console.log(`Hive checks: ${checks} passed`);
process.exit(0);
