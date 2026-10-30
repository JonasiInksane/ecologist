// Generated worlds exchange air, weather and legacy chemistry. These gates demonstrate ordinary
// population/producer persistence and expose recorded ordinary biological introductions, not closure
// of every atom. Separate declared magical sources/sinks are reported in sample.accounting.fantasy.
const GENERATED_ECOSYSTEM_GATE = Object.freeze({ days: 8, seeds: [7, 73, 31337], samplesPerDay: 8 });
function assessGeneratedEcosystem(samples, { days, gate = GENERATED_ECOSYSTEM_GATE }) {
  if (!samples.length) throw new Error('Generated ecosystem observations are required');
  const initial = samples[0], last = samples.at(-1), checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  check('requested horizon completed', last.day >= days - 1e-9, last.day);
  check('continuous sampled timeline', initial.day === 0 && samples.every((s, i) => Number.isFinite(s.day) && (!i || (s.day > samples[i - 1].day && s.day - samples[i - 1].day <= 1 / gate.samplesPerDay + 1e-9))));
  check('ordinary fish remain throughout sampled timeline', samples.every(s => Number.isInteger(s.fish) && s.fish >= 1), samples.map(s => s.fish));
  check('reported organism counts are finite nonnegative integers', samples.every(s => ['fish', 'pike', 'plants', 'bees'].every(key => Number.isInteger(s[key]) && s[key] >= 0)));
  check('finite nonnegative biological stores', samples.every(s => s.invalid === 0));
  check('finite reported inventories', samples.every(s => ['c', 'n', 'p'].every(key => Number.isFinite(s.total[key]) && s.total[key] >= 0)));
  check('finite nonnegative biological ledgers', samples.every(s => ['introduced', 'removed'].every(map => ['c', 'n', 'p'].every(key => Number.isFinite(s[map][key]) && s[map][key] >= 0))));
  const counters = ['fixedAir', 'fixedWater', 'nectarCollected'];
  check('production counters are finite nonnegative and monotonic', samples.every((s, i) => counters.every(key => Number.isFinite(s[key]) && s[key] >= 0 && (!i || s[key] >= samples[i - 1][key]))));
  const validCounts = counts => counts !== null && typeof counts === 'object' && !Array.isArray(counts)
    && (Object.getPrototypeOf(counts) === Object.prototype || Object.getPrototypeOf(counts) === null)
    && Object.values(counts).every(n => Number.isInteger(n) && n >= 0);
  check('birth and death counts are finite nonnegative integers', samples.every(s => validCounts(s.births) && validCounts(s.deaths)));
  check('birth and death counters are monotonic', samples.every((s, i) => !i || ['births', 'deaths'].every(map => Object.entries(samples[i - 1][map] ?? {}).every(([key, count]) => (s[map]?.[key] ?? 0) >= count))));
  for (const key of ['c', 'n', 'p']) {
    check(`no biological ${key} introductions after setup`, samples.every(s => s.introduced[key] === initial.introduced[key]), last.introduced[key] - initial.introduced[key]);
    check(`no biological ${key} removals after setup`, samples.every(s => s.removed[key] === initial.removed[key]), last.removed[key] - initial.removed[key]);
  }
  for (const kind of ['fish', 'pike', 'bee']) {
    const field = kind === 'bee' ? 'bees' : kind;
    const deaths = s => Object.entries(s.deaths ?? {}).filter(([key]) => key.startsWith(kind + ':')).reduce((sum, [, n]) => sum + n, 0);
    check(`${kind} population changes have recorded births and deaths`, samples.every(s => s[field] === initial[field]
      + (s.births?.[kind] ?? 0) - (initial.births?.[kind] ?? 0) - deaths(s) + deaths(initial)));
  }
  check('producer biomass remains at horizon', Number.isFinite(last.waterAlgae) && last.waterAlgae > 0, last.waterAlgae);
  check('living plants remain at horizon', Number.isInteger(last.plants) && last.plants > 0, last.plants);
  check('measured aquatic photosynthetic renewal', last.fixedWater > initial.fixedWater, last.fixedWater - initial.fixedWater);
  check('measured plant photosynthetic renewal', last.fixedAir > initial.fixedAir, last.fixedAir - initial.fixedAir);
  if (days >= gate.days) {
    const tail = [...samples].reverse().find(sample => sample.day <= days - 1);
    check('aquatic production continues during final day', tail && last.fixedWater > tail.fixedWater, tail ? last.fixedWater - tail.fixedWater : null);
    check('plant production continues during final day', tail && last.fixedAir > tail.fixedAir, tail ? last.fixedAir - tail.fixedAir : null);
  }
  if (initial.bees > 0) {
    check('stocked bees remain through the sampled seasons', samples.every(s => Number.isInteger(s.bees) && s.bees >= 1), samples.map(s => s.bees));
    check('hive stores remain finite and nonnegative', samples.every(s => Number.isFinite(s.honey) && s.honey >= 0));
    check('warm season nectar actually collected', last.nectarCollected > initial.nectarCollected, last.nectarCollected - initial.nectarCollected);
  }
  return checks;
}
function generatedSuiteComplete({ days, seeds, failed, cancelled = false }, gate = GENERATED_ECOSYSTEM_GATE) {
  return !cancelled && Number.isFinite(days) && days >= gate.days && failed === 0 && Array.isArray(seeds) &&
    seeds.every(Number.isInteger) && new Set(seeds).size === seeds.length && gate.seeds.every(seed => seeds.includes(seed));
}
function permanentGeneratedFailures(samples, gate = GENERATED_ECOSYSTEM_GATE) {
  const permanent = new Set(['continuous sampled timeline', 'ordinary fish remain throughout sampled timeline',
    'reported organism counts are finite nonnegative integers', 'finite nonnegative biological stores',
    'finite reported inventories', 'finite nonnegative biological ledgers',
    'production counters are finite nonnegative and monotonic', 'birth and death counts are finite nonnegative integers',
    'birth and death counters are monotonic', 'fish population changes have recorded births and deaths',
    'pike population changes have recorded births and deaths', 'bee population changes have recorded births and deaths',
    'stocked bees remain through the sampled seasons', 'hive stores remain finite and nonnegative']);
  return assessGeneratedEcosystem(samples, { days: gate.days, gate }).filter(check => !check.ok &&
    (permanent.has(check.name) || check.name.startsWith('no biological ')));
}
export { GENERATED_ECOSYSTEM_GATE, assessGeneratedEcosystem, generatedSuiteComplete, permanentGeneratedFailures };
