// Bank recovery must seek actual submersible water, without preventing real stranding.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
import { addBody, sampleLiquid, updateBodies } from '../js/bodies.js';
import { towardWater, seekFishTemperature, centre } from '../js/creatures.js';
import { ecoInventory } from '../js/ecology.js';
import { plants } from '../js/plants.js';
import { beginNets } from '../js/power.js';
// The ordinary step initializes power before bodies; these movement-only fixtures do so once.
beginNets();
let checks = 0;
const ok = (value, name) => { assert.ok(value, name); checks++; };
const near = (a, b, name) => ok(Math.abs(a - b) < 1e-7, `${name}: ${a} != ${b}`);
function budget(before) { const after = ecoInventory(plants); for (const key of ['c', 'n', 'p']) near(before[key], after[key], `retained ${key}`); }
{
  clearWorld(7);
  fill(45, 50, 45, 50, C.WATER, 20, 1); // nearest left-hand film
  fill(50, 50, 52, 52, C.WATER, 20);
  ok(towardWater(at(46, 50), 4) === 1, 'fish ignores the closer drying film and seeks its right-hand refuge');
  Wd.liq[at(45, 50)] = 140;
  ok(towardWater(at(46, 50), 4) === -1, 'a small fish can use physically deep partial water');
  ok(towardWater(at(46, 50), 5) === 1, 'a larger pike needs a deeper refuge');
}
{
  clearWorld(73); fill(40, 52, 42, 52, C.WATER, 20);
  ok(towardWater(at(41, 50), 4) === 0, 'water directly below calls for falling rather than jumping away');
  Wd.solid[at(41, 51)] = C.STONE;
  fill(46, 50, 47, 51, C.WATER, 20);
  ok(towardWater(at(41, 50), 4) === -1, 'the adjacent open descent is preferred to water behind the immediate floor');
}
{
  clearWorld(7);
  for (let x = 40; x < 51; x++) Wd.solid[at(x, 51)] = C.STONE;
  // A transient drying bank with a tiny film to the left and a substantial pool to the right.
  Wd.solid[at(49, 51)] = 0; Wd.solid[at(50, 51)] = 0;
  fill(49, 51, 50, 53, C.WATER, 20);
  fill(43, 50, 43, 50, C.WATER, 20, 1);
  const fish = addBody('fish', 46 * C.T, 51 * C.T - 4), before = ecoInventory(plants);
  let recovered = false;
  for (let i = 0; i < 350; i++) {
    Wd.S.tick++; updateBodies();
    if (sampleLiquid(fish).water / (fish.w * fish.h) > 0.6 && fish.air === 0) recovered = true;
  }
  ok(Wd.bodies.includes(fish) && !fish.deathCause, `a stranded fish can physically return to a nearby refuge: ${JSON.stringify(fish)}`);
  ok(recovered, 'recovery actually submerges and restores breathing rather than treating a film as a refuge');
  budget(before);
}
{
  clearWorld(73); fill(40, 50, 43, 52, C.WATER, 40);
  const fish = addBody('fish', 41 * C.T, 51 * C.T), k = centre(fish), before = ecoInventory(plants);
  Wd.temp[k + 1] = 22;
  ok(seekFishTemperature(fish, k) && fish.vx > 0, 'a warm fish steers toward actual adjacent cool water');
  budget(before);
  fish.vx = fish.vy = 0; Wd.temp[k] = 2; Wd.temp[k + 1] = 20;
  ok(seekFishTemperature(fish, k) && fish.vx > 0, 'a cold fish steers toward actual adjacent warmer water');
  Wd.temp[k] = 40; Wd.solid[k + 1] = C.STONE; fish.vx = fish.vy = 0;
  ok(!seekFishTemperature(fish, k), 'a solid wall blocks access to the thermal refuge');
  Wd.solid[k + 1] = 0; Wd.liq[k + 1] = 1;
  ok(!seekFishTemperature(fish, k), 'a film cannot serve as a thermal refuge');
}
{
  clearWorld(73); fill(40, 50, 46, 53, C.WATER, 40);
  for (let y = 50; y <= 53; y++) for (let x = 43; x <= 46; x++) Wd.temp[at(x, y)] = 22;
  const fish = addBody('fish', 42 * C.T, 51 * C.T);
  let reached = false;
  for (let i = 0; i < 120; i++) { Wd.S.tick++; updateBodies(); if (Wd.temp[centre(fish)] === 22) reached = true; }
  ok(reached && !fish.deathCause, 'ordinary body movement can reach its real cool-water refuge');
  clearWorld(73); fill(40, 50, 46, 53, C.WATER, 46);
  const exposed = addBody('fish', 42 * C.T, 51 * C.T);
  Wd.S.tick++; updateBodies();
  ok(exposed.deathCause === 'heat', 'water above the lethal limit still kills without a refuge');
}
{
  clearWorld(7); Wd.solid[at(40, 51)] = C.STONE;
  const fish = addBody('fish', 40 * C.T, 51 * C.T - 4), before = ecoInventory(plants);
  for (let i = 0; i < 450 && Wd.bodies.includes(fish); i++) { Wd.S.tick++; updateBodies(); }
  ok(fish.deathCause === 'stranded' && !Wd.bodies.includes(fish), 'an isolated fish still strands without a water refuge');
  budget(before);
}
console.log(`${checks} fish recovery checks pass`);
process.exit(0);
