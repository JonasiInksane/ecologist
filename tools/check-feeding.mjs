// Feeding-response controls: no hidden food, dilute producer survival, satiation and C/N/P transfers.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
import { addBody } from '../js/bodies.js';
import { BITE, grazingRequest, hunt, centre, driveCreature, shoal } from '../js/creatures.js';
import { ECO_ANIMALS, ECO_RATE } from '../js/ecology-data.js';
import { ecoBirth, ecoGraze, ecoInventory, ecoState } from '../js/ecology.js';
import { plants } from '../js/plants.js';
import { soluteAmount } from '../js/solutes.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message) { ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`); }
function budget(before, message) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${message} ${key}`);
}
function fixture(amount = 255) {
  clearWorld(73); fill(40, 50, 43, 52, C.WATER, 20, amount);
  return at(41, 51);
}
{
  const k = fixture(), fish = addBody('fish', 41 * C.T, 51 * C.T);
  const before = ecoInventory(plants);
  near(grazingRequest(k), 0, 'sterile water supplies no grazing request');
  near(ecoGraze(fish, k, grazingRequest(k)), 0, 'sterile water cannot feed fish');
  budget(before, 'sterile control');
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = ECO_RATE.grazeHalf;
  near(grazingRequest(k), BITE / 2, 'half-response concentration has half the maximum bite');
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = 255;
  ok(grazingRequest(k) > BITE * 0.99 && grazingRequest(k) < BITE, 'dense blooms approach bounded maximum feeding');
}
{
  const k = fixture(), fish = addBody('fish', 41 * C.T, 51 * C.T);
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = 0.1;
  const before = ecoInventory(plants), initial = soluteAmount(k, C.SOL_ALGAE);
  for (let i = 0; i < 10000; i++) ecoGraze(fish, k, grazingRequest(k));
  const left = soluteAmount(k, C.SOL_ALGAE);
  ok(left > 0 && left < initial / 2, 'repeated dilute grazing consumes real food without clearing the final producers');
  near(fish.bio.c - (ECO_ANIMALS.fish.body + ECO_ANIMALS.fish.reserve), initial - left, 'fish receives exactly removed algal carbon');
  budget(before, 'dilute grazing');
}
{
  fixture(); const fish = addBody('fish', 41 * C.T, 51 * C.T), k = centre(fish);
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = 1;
  const expected = grazingRequest(k), algae = soluteAmount(k, C.SOL_ALGAE), before = ecoInventory(plants);
  const random = Math.random; Math.random = () => 0.01; // a grazing encounter, without births or other random events
  try {
    const area = fish.w * fish.h;
    ok(driveCreature(fish, { water: area, acid: 0, poison: 0, shock: 0, lava: 0 }, 1, false, area, addBody), 'grazing fish remains alive');
  } finally { Math.random = random; }
  near(algae - soluteAmount(k, C.SOL_ALGAE), expected, 'ordinary creature update uses the concentration-dependent request');
  budget(before, 'ordinary grazing update');
}
{
  const k = fixture(51), fish = addBody('fish', 41 * C.T, 51 * C.T);
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = ECO_RATE.grazeHalf;
  near(grazingRequest(k), BITE / 2 * 0.2, 'a partial carrier supplies a proportionate meal');
  const before = ecoInventory(plants); ecoGraze(fish, k, grazingRequest(k)); budget(before, 'partial carrier grazing');
  fish.bio.c = ECO_ANIMALS.fish.body + ECO_ANIMALS.fish.reserve * 4;
  const algae = soluteAmount(k, C.SOL_ALGAE);
  near(ecoGraze(fish, k, grazingRequest(k)), 0, 'a full fish leaves available producers uneaten');
  near(soluteAmount(k, C.SOL_ALGAE), algae, 'satiation does not discard algae');
}
{
  function crowd(rotated) {
    clearWorld(73); const parent = addBody('fish', 100, 100);
    for (const [dx, dy] of [[8, 8], [40, 0], [50, 0]]) addBody('fish', 100 + (rotated ? dy : dx), 100 + (rotated ? dx : dy));
    return shoal(parent);
  }
  ok(!crowd(false), 'four fish in a horizontal local neighborhood block another birth');
  ok(!crowd(true), 'the same crowded arrangement rotated vertically also blocks another birth');
  clearWorld(73); const parent = addBody('fish', 100, 100); addBody('fish', 108, 108);
  ok(shoal(parent), 'a pair with local space can reproduce');
  for (const [x, y] of [[180, 100], [188, 108], [100, 180], [108, 188]]) addBody('fish', x, y);
  ok(shoal(parent), 'distant populations in either axis do not fill local breeding space');
}
{
  const k = fixture(), parent = addBody('fish', 41 * C.T, 51 * C.T), archetype = ECO_ANIMALS.fish;
  const childCarbon = archetype.body + archetype.reserve;
  parent.bio = { c: childCarbon + archetype.body, n: 2 * archetype.body * archetype.n, p: 2 * archetype.body * archetype.p };
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = 1e-6;
  parent.hunger = 500; const before = ecoInventory(plants);
  ecoGraze(parent, k, 1e-7);
  near(parent.hunger, 0, 'a trace meal can be recent food');
  let attempted = 0;
  ok(!ecoBirth(parent, () => { attempted++; }), 'recent trace food cannot fund a birth that exhausts parental reserve');
  near(attempted, 0, 'unfunded reproduction does not attempt placement'); budget(before, 'unfunded birth after trace food');

  parent.bio.c = 2 * childCarbon - 1e-6;
  let fundedBefore = ecoInventory(plants);
  ok(!ecoBirth(parent, addBody), 'a near-threshold parent retains its reserve instead of giving it away'); budget(fundedBefore, 'near-threshold birth');
  parent.bio.c = 2 * childCarbon; fundedBefore = ecoInventory(plants);
  const unchanged = { ...parent.bio };
  ok(!ecoBirth(parent, () => null), 'a funded failed placement still creates no child');
  assert.deepEqual(parent.bio, unchanged); checks++; budget(fundedBefore, 'failed funded birth');
  const child = ecoBirth(parent, addBody);
  ok(child, 'fully funded repeated reproduction can succeed');
  near(child.bio.c, childCarbon, 'offspring receives its measured body and reserve');
  near(parent.bio.c, childCarbon, 'parent retains its measured body and ordinary reserve');
  budget(fundedBefore, 'successful funded birth');
}
{
  fixture();
  const pike = addBody('pike', 41 * C.T, 51 * C.T), prey = addBody('fish', 42 * C.T, 51 * C.T);
  pike.bio.c = ECO_ANIMALS.pike.body + ECO_ANIMALS.pike.reserve * 4;
  pike.full = 0;
  let before = ecoInventory(plants), dead = Object.values(ecoState().dead).reduce((sum, pool) => sum + pool.c, 0);
  hunt(pike, 1, addBody);
  ok(!prey.eaten, 'a satiated pike leaves nearby prey alive after digestion'); budget(before, 'satiated hunt');
  near(Object.values(ecoState().dead).reduce((sum, pool) => sum + pool.c, 0), dead, 'satiation creates no discarded prey');
  pike.bio.c = ECO_ANIMALS.pike.body + ECO_ANIMALS.pike.reserve - ECO_ANIMALS.pike.burn;
  before = ecoInventory(plants); hunt(pike, 1, addBody);
  ok(!prey.eaten, 'one maintenance debit does not make a nearly full pike hunt again');
  budget(before, 'nearly full hunt');
  pike.bio.c = ECO_ANIMALS.pike.body; before = ecoInventory(plants);
  hunt(pike, 1, addBody);
  ok(prey.eaten && pike.full > 0, 'a hungry pike can catch and digest nearby prey');
  budget(before, 'hungry hunt');
  ok(Wd.typ[centre(pike)] === C.WATER, 'predation fixture is submerged');
}
console.log(`Feeding checks: ${checks} passed`);
process.exit(0);
