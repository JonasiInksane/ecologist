// Pure acceptance logic: observations in, explicit checks out. No simulation or file access.
import { ECOSYSTEM_GATE } from './ecosystem-data.mjs';
function invalidEcosystemPools(pools) {
  return pools.filter(pool => ['c', 'n', 'p'].some(key => !Number.isFinite(pool[key]) || pool[key] < -1e-8)).length;
}
function invalidEcosystemStores({ ecology: e, bodies = [], plants = [], mossSugar = {} }) {
  const pools = [...Object.values(e.tissue), ...Object.values(e.dead), ...Object.values(e.soil),
    ...Object.values(e.inoculum), ...bodies.map(b => b.bio).filter(Boolean), e.introduced, e.removed, e.riverInventory,
    ...plants.map(p => ({ c: p.sugar, n: p.nitrogen, p: p.phosphorus }))];
  const amounts = [...Object.values(e.comb), ...Object.values(e.nectar), ...Object.values(e.methane),
    ...Object.values(e.oxygenCredit), ...Object.values(mossSugar), e.nitrogenGas,
    ...bodies.filter(b => b.load !== undefined).map(b => b.load)];
  return invalidEcosystemPools(pools) + amounts.filter(n => !Number.isFinite(n) || n < -1e-8).length;
}
function ecosystemSuiteComplete({ suite, days, seeds, failed }, gate = ECOSYSTEM_GATE) {
  return suite === true && Number.isFinite(days) && days >= gate.days && failed === 0 &&
    Array.isArray(seeds) && seeds.every(Number.isInteger) && new Set(seeds).size === seeds.length &&
    gate.seeds.every(seed => seeds.includes(seed));
}
function assessEcosystem(samples, { scenario, days, gate = ECOSYSTEM_GATE }) {
  if (!samples.length) throw new Error('At least an initial sample is required');
  const initial = samples[0], last = samples.at(-1), checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  check('requested horizon completed', last.day >= days - 1e-9, last.day);
  check('continuous sampled timeline', initial.day === 0 && samples.every((s, i) => Number.isFinite(s.day) && (!i || (s.day > samples[i - 1].day && s.day - samples[i - 1].day <= 1 / gate.samplesPerDay + 1e-9))));
  for (const key of ['c', 'n', 'p']) {
    const drift = Math.max(...samples.map(s => Math.abs(s.total[key] - initial.total[key] - (s.introduced[key] - initial.introduced[key]) + s.removed[key] - initial.removed[key])));
    check(`closed ${key} inventory`, drift < gate.inventoryTolerance, drift);
    check(`no ${key} introductions after setup`, samples.every(s => s.introduced[key] === initial.introduced[key]), last.introduced[key] - initial.introduced[key]);
    check(`no ${key} removals after setup`, samples.every(s => s.removed[key] === initial.removed[key]), last.removed[key] - initial.removed[key]);
  }
  check('closed water inventory', Math.max(...samples.map(s => Math.abs(s.water - initial.water))) < gate.waterTolerance, last.water - initial.water);
  check('no atmosphere intervention', samples.every(s => s.atmosphereCarbon === initial.atmosphereCarbon && s.atmosphereOxygen === initial.atmosphereOxygen));
  check('finite nonnegative biological stores', samples.every(s => !s.invalid));
  const fishBirths = s => s.births.fish ?? 0;
  const fishDeaths = s => Object.entries(s.deaths).filter(([key]) => key.startsWith('fish:')).reduce((sum, [, n]) => sum + n, 0);
  const deaths = fishDeaths(last) - fishDeaths(initial), births = fishBirths(last) - fishBirths(initial);
  check('population changes have recorded births and deaths', samples.every(s => s.fish === initial.fish + fishBirths(s) - fishBirths(initial) - fishDeaths(s) + fishDeaths(initial)), { fish: last.fish, births, deaths });
  if (scenario === 'balanced') {
    check('viable fish population throughout', samples.every(s => s.fish >= gate.fishMin && s.fish <= gate.fishMax), samples.map(s => s.fish));
    check('living plants at horizon', last.plants >= 1, last.plants);
    check('producer biomass remains at horizon', last.algae > 0, last.algae);
    check('measured photosynthetic renewal', last.fixedAir > initial.fixedAir && last.fixedWater > initial.fixedWater);
    if (days >= gate.days) {
      const tail = [...samples].reverse().find(s => s.day <= days - 1);
      check('production continues during final day', tail && last.fixedAir > tail.fixedAir && last.fixedWater > tail.fixedWater);
    }
  }
  if (scenario === 'unfed' && days >= gate.unfedDays) check('unfed fish spend reserves and starve', last.fish === 0 && last.deaths['fish:starvation'] === initial.fish, last.deaths);
  if (scenario === 'dark') {
    check('darkness draws down producer biomass', last.algae < initial.algae, { initial: initial.algae, last: last.algae });
    check('darkness stops photosynthetic fixation', last.fixedAir === initial.fixedAir && last.fixedWater === initial.fixedWater);
  }
  if (scenario === 'overfed') check('overfed losses have a specific recorded cause', deaths > 0 && !last.deaths['fish:other'], last.deaths);
  return checks;
}
export { assessEcosystem, invalidEcosystemPools, invalidEcosystemStores, ecosystemSuiteComplete };
