import assert from 'node:assert/strict';
import { assessEcosystem, invalidEcosystemPools } from './ecosystem-metrics.mjs';
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
const leak = structuredClone(baseline); leak.water -= 1;
assert.equal(evaluate(leak).find(c => c.name === 'closed water inventory').ok, false);
const intervention = structuredClone(baseline); intervention.atmosphereOxygen++;
assert.equal(evaluate(intervention).find(c => c.name === 'no atmosphere intervention').ok, false);
const invalid = structuredClone(baseline); invalid.total.n = NaN;
assert.equal(evaluate(invalid).find(c => c.name === 'closed n inventory').ok, false);
assert.equal(invalidEcosystemPools([{ c: 10, n: -1, p: 1 }, { c: 10, n: 11, p: 1 }]), 1, 'offsetting negative stores are rejected despite unchanged total');
console.log('PASS ecosystem acceptance rejects lost matter, replenishment, leaks and unrecorded deaths');
