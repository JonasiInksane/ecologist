import assert from 'node:assert/strict';
import { assessEcosystem, invalidEcosystemPools, invalidEcosystemStores, ecosystemSuiteComplete } from './ecosystem-metrics.mjs';
const baseline = { total: { c: 100, n: 10, p: 1 }, introduced: { c: 100, n: 10, p: 1 }, removed: { c: 0, n: 0, p: 0 },
  water: 2000, fish: 2, plants: 2, algae: 20, births: {}, deaths: {}, atmosphereCarbon: 0, atmosphereOxygen: 0, invalid: 0,
  day: 0, fixedAir: 0, fixedWater: 0 };
const evaluate = end => {
  const samples = Array.from({ length: 81 }, (_, i) => ({ ...structuredClone(baseline), day: i / 8, fixedAir: i / 4, fixedWater: i / 4 }));
  samples[80] = { ...end, day: 10, fixedAir: 20, fixedWater: 20 };
  return assessEcosystem(samples, { scenario: 'balanced', days: 10 });
};
assert.ok(evaluate(structuredClone(baseline)).every(c => c.ok));
const lostCarbon = structuredClone(baseline); lostCarbon.total.c -= 1;
assert.equal(evaluate(lostCarbon).find(c => c.name === 'closed c inventory').ok, false);
const replenished = structuredClone(baseline); replenished.total.c += 10; replenished.introduced.c += 10;
assert.equal(evaluate(replenished).find(c => c.name === 'closed c inventory').ok, true);
assert.equal(evaluate(replenished).find(c => c.name === 'no c introductions after setup').ok, false);
const removed = structuredClone(baseline); removed.total.p -= 0.1; removed.removed.p += 0.1;
assert.equal(evaluate(removed).find(c => c.name === 'no p removals after setup').ok, false);
const vanished = structuredClone(baseline); vanished.fish--;
assert.equal(evaluate(vanished).find(c => c.name === 'population changes have recorded births and deaths').ok, false);
vanished.deaths['fish:starvation'] = 1;
assert.equal(evaluate(vanished).find(c => c.name === 'population changes have recorded births and deaths').ok, true);
const wrongSpeciesDeath = structuredClone(baseline); wrongSpeciesDeath.fish--; wrongSpeciesDeath.deaths['bee:cold'] = 1;
assert.equal(evaluate(wrongSpeciesDeath).find(c => c.name === 'population changes have recorded births and deaths').ok, false,
  'a recorded bee death cannot conceal an unrecorded fish loss');
const wrongSpeciesBirth = structuredClone(baseline); wrongSpeciesBirth.fish++; wrongSpeciesBirth.births.bee = 1;
assert.equal(evaluate(wrongSpeciesBirth).find(c => c.name === 'population changes have recorded births and deaths').ok, false,
  'a recorded bee birth cannot explain an unrecorded fish addition');
const otherSpecies = structuredClone(baseline); otherSpecies.births.bee = 2; otherSpecies.deaths['moth:cold'] = 1;
assert.equal(evaluate(otherSpecies).find(c => c.name === 'population changes have recorded births and deaths').ok, true,
  'unrelated species do not change the fish bookkeeping');
const leak = structuredClone(baseline); leak.water -= 1;
assert.equal(evaluate(leak).find(c => c.name === 'closed water inventory').ok, false);
const intervention = structuredClone(baseline); intervention.atmosphereOxygen++;
assert.equal(evaluate(intervention).find(c => c.name === 'no atmosphere intervention').ok, false);
const invalid = structuredClone(baseline); invalid.total.n = NaN;
assert.equal(evaluate(invalid).find(c => c.name === 'closed n inventory').ok, false);
assert.equal(invalidEcosystemPools([{ c: 10, n: -1, p: 1 }, { c: 10, n: 11, p: 1 }]), 1, 'offsetting negative stores are rejected despite unchanged total');
const pool = () => ({ c: 0, n: 0, p: 0 });
function stores() {
  return { ecology: { tissue: {}, dead: {}, soil: {}, inoculum: { algae: pool() }, introduced: pool(), removed: pool(),
    riverInventory: pool(), comb: {}, nectar: {}, methane: {}, oxygenCredit: {}, nitrogenGas: 0 },
  bodies: [{ bio: pool(), load: 0 }], plants: [{ sugar: 0, nitrogen: 0, phosphorus: 0 }], mossSugar: {} };
}
assert.equal(invalidEcosystemStores(stores()), 0);
for (const map of ['comb', 'nectar', 'methane', 'oxygenCredit']) for (const amount of [-1, NaN, Infinity]) {
  const state = stores(); state.ecology[map][123] = amount;
  assert.equal(invalidEcosystemStores(state), 1, `${map} rejects ${amount}`);
}
for (const field of ['sugar', 'nitrogen', 'phosphorus']) for (const amount of [-1, NaN, Infinity, undefined, null]) {
  const state = stores(); state.plants[0][field] = amount;
  assert.equal(invalidEcosystemStores(state), 1, `plant ${field} rejects ${amount}`);
}
for (const location of ['moss', 'nitrogenGas', 'load']) {
  const state = stores();
  if (location === 'moss') state.mossSugar[123] = -1;
  else if (location === 'load') state.bodies[0].load = -1;
  else state.ecology.nitrogenGas = -1;
  assert.equal(invalidEcosystemStores(state), 1, `${location} rejects a negative amount`);
}
const offsetStores = stores(); offsetStores.ecology.nectar[123] = -1; offsetStores.ecology.comb[456] = 1;
const invalidStores = structuredClone(baseline); invalidStores.invalid = invalidEcosystemStores(offsetStores);
assert.equal(evaluate(invalidStores).find(c => c.name === 'finite nonnegative biological stores').ok, false,
  'offsetting honey and nectar cannot pass with an unchanged aggregate inventory');
const completeSuite = { suite: true, days: 10, seeds: [7, 73, 31337], failed: 0 };
assert.equal(ecosystemSuiteComplete(completeSuite), true);
assert.equal(ecosystemSuiteComplete({ ...completeSuite, seeds: [31337, 7, 73, 1] }), true, 'extra seeds retain the required coverage');
for (const seeds of [[1, 2, 3], [7, 73], [7, 73, 73], [7, 73, 31337, 31337]]) {
  assert.equal(ecosystemSuiteComplete({ ...completeSuite, seeds }), false, 'required distinct fixed seeds cannot be substituted');
}
assert.equal(ecosystemSuiteComplete({ ...completeSuite, days: 9 }), false);
assert.equal(ecosystemSuiteComplete({ ...completeSuite, failed: 1 }), false);
assert.equal(ecosystemSuiteComplete({ ...completeSuite, suite: false }), false);
console.log('PASS ecosystem acceptance rejects lost matter, replenishment, leaks, invalid stores, missing fixed seeds and unrecorded fish changes');
