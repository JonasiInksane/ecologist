import assert from 'node:assert/strict';
import { assessGeneratedEcosystem, generatedSuiteComplete, permanentGeneratedFailures } from './generated-ecosystem-metrics.mjs';
const baseline = { day: 0, fish: 3, pike: 1, bees: 3, plants: 2, waterAlgae: 20, honey: 100,
  invalid: 0, fixedAir: 0, fixedWater: 0, nectarCollected: 0, births: {}, deaths: {},
  total: { c: 1000, n: 100, p: 10 }, introduced: { c: 100, n: 10, p: 1 }, removed: { c: 0, n: 0, p: 0 } };
let checks = 0;
function assess(change = () => {}) {
  const samples = Array.from({ length: 65 }, (_, i) => ({ ...structuredClone(baseline), day: i / 8, fixedAir: i, fixedWater: i, nectarCollected: i / 10 }));
  change(samples); return assessGeneratedEcosystem(samples, { days: 8 });
}
function rejects(name, change) { assert.equal(assess(change).find(check => check.name === name).ok, false, name); checks++; }
assert.ok(assess().every(check => check.ok)); checks++;
rejects('requested horizon completed', samples => samples.pop());
rejects('continuous sampled timeline', samples => samples.splice(20, 1));
rejects('ordinary fish remain throughout sampled timeline', samples => { samples[30].fish = 0; });
rejects('reported organism counts are finite nonnegative integers', samples => { samples[0].bees = NaN; });
rejects('finite nonnegative biological stores', samples => { samples[20].invalid = 1; });
rejects('finite reported inventories', samples => { samples[40].total.n = NaN; });
for (const value of [NaN, Infinity, -1, null]) {
  rejects('production counters are finite nonnegative and monotonic', samples => { samples.at(-1).fixedWater = value; });
  rejects('birth and death counts are finite nonnegative integers', samples => { samples.at(-1).births.fish = value; });
}
for (const map of ['births', 'deaths']) for (const value of [1, [], false, null, 'not a record', new Date(0)]) {
  rejects('birth and death counts are finite nonnegative integers', samples => { for (const sample of samples) sample[map] = value; });
}
rejects('production counters are finite nonnegative and monotonic', samples => { samples[40].nectarCollected = 0; });
rejects('birth and death counters are monotonic', samples => { samples[20].births.bee = 5; });
rejects('birth and death counters are monotonic', samples => { samples[20].deaths['bee:cold'] = 5; });
rejects('finite nonnegative biological ledgers', samples => { samples.forEach(sample => { sample.introduced.c = Infinity; }); });
for (const key of ['c', 'n', 'p']) {
  rejects(`no biological ${key} introductions after setup`, samples => { samples.at(-1).introduced[key]++; });
  rejects(`no biological ${key} removals after setup`, samples => { samples.at(-1).removed[key]++; });
}
rejects('fish population changes have recorded births and deaths', samples => { samples.at(-1).fish--; samples.at(-1).deaths['bee:cold'] = 1; });
assert.ok(assess(samples => { const s = samples.at(-1); s.fish--; s.deaths['fish:starvation'] = 1; }).every(check => check.ok)); checks++;
for (const [kind, field] of [['pike', 'pike'], ['bee', 'bees']]) {
  rejects(`${kind} population changes have recorded births and deaths`, samples => { samples.at(-1)[field]++; });
  rejects(`${kind} population changes have recorded births and deaths`, samples => { samples.at(-1)[field]--; });
  assert.ok(assess(samples => { const s = samples.at(-1); s[field]++; s.births[kind] = 1; }).every(check => check.ok)); checks++;
  assert.ok(assess(samples => { const s = samples.at(-1); s[field]--; s.deaths[kind + ':cold'] = 1; }).every(check => check.ok)); checks++;
}
rejects('producer biomass remains at horizon', samples => { samples.at(-1).waterAlgae = 0; });
rejects('measured aquatic photosynthetic renewal', samples => { samples.at(-1).fixedWater = 0; });
rejects('measured plant photosynthetic renewal', samples => { samples.at(-1).fixedAir = 0; });
rejects('aquatic production continues during final day', samples => samples.forEach(sample => { sample.fixedWater = Math.min(sample.day, 1); }));
rejects('plant production continues during final day', samples => samples.forEach(sample => { sample.fixedAir = Math.min(sample.day, 1); }));
rejects('stocked bees remain through the sampled seasons', samples => { samples[50].bees = 0; });
rejects('hive stores remain finite and nonnegative', samples => { samples[50].honey = -1; });
rejects('warm season nectar actually collected', samples => { samples.at(-1).nectarCollected = 0; });
assert.ok(assess(samples => samples.forEach(s => { s.bees = 0; s.honey = 0; s.nectarCollected = 0; })).every(check => check.ok)); checks++;
const suite = { days: 8, seeds: [7, 73, 31337], failed: 0 };
const short = [{ ...structuredClone(baseline), day: 0 }, { ...structuredClone(baseline), day: 0.125 }];
short[1].plants = 0; short[1].waterAlgae = 0;
assert.deepEqual(permanentGeneratedFailures(short), [], 'temporary producer/plant lows and seasonal inactivity do not stop a run'); checks++;
short[1].fish = 0; short[1].deaths['fish:starvation'] = 3;
assert.ok(permanentGeneratedFailures(short).some(check => check.name === 'ordinary fish remain throughout sampled timeline')); checks++;
short[1].fish = 3; short[1].deaths = {}; short[1].bees = 0;
assert.ok(permanentGeneratedFailures(short).some(check => check.name === 'stocked bees remain through the sampled seasons')); checks++;
short[1].bees = 3; short[1].introduced.c++;
assert.ok(permanentGeneratedFailures(short).some(check => check.name === 'no biological c introductions after setup')); checks++;
assert.equal(assessGeneratedEcosystem(short, { days: 8 }).find(check => check.name === 'requested horizon completed').ok, false); checks++;
assert.ok(generatedSuiteComplete(suite)); checks++;
for (const change of [{ days: 2 }, { seeds: [1, 2, 3] }, { seeds: [7, 73] }, { seeds: [7, 73, 31337, 7] }, { failed: 1 }, { cancelled: true }]) {
  assert.equal(generatedSuiteComplete({ ...suite, ...change }), false); checks++;
}
console.log(`${checks} generated ecosystem acceptance checks pass`);
