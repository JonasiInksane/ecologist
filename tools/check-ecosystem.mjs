// Long-duration checks use the actual fixed-step simulation. No resources are replenished after setup.
// node tools/check-ecosystem.mjs --days=10 --seeds=7,73,31337 --case=balanced --jobs=3
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { ECOSYSTEM_GATE } from './ecosystem-data.mjs';
import { assessEcosystem, invalidEcosystemPools } from './ecosystem-metrics.mjs';
// The coordinator owns no world arrays. Only workers load the simulation and browser stubs.
let C, Wd, at, clearWorld, box, fill, step, Eco, Bd, Pl, Oxy, Air, Sol, DAY_TICKS, dayPhase;
if (process.env.ECOSYSTEM_SEED) {
  ({ C, Wd, at, clearWorld, box, fill, step } = await import('./test-support.mjs'));
  [Eco, Bd, Pl, Oxy, Air, Sol] = await Promise.all(['ecology.js', 'bodies.js', 'plants.js', 'oxygen.js', 'air.js', 'solutes.js'].map(name => import('../js/' + name)));
  ({ DAY_TICKS, dayPhase } = await import('../js/daynight.js'));
}
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const days = Number(option('days', String(ECOSYSTEM_GATE.days))), scenario = option('case', 'balanced');
const out = option('out', '');
if (!Number.isFinite(days) || !(days > 0) || !['balanced', 'dark', 'overfed', 'unfed'].includes(scenario)) throw new Error('Use finite positive --days and --case=balanced|dark|overfed|unfed');

function ecosystemJar(seed, mode) {
  clearWorld(seed); Wd.S.timeMode = mode === 'dark' ? 'night' : 'cycle'; Wd.S.timeShift = 0;
  box(30, 30, 60, 30, C.GLASS); box(30, 56, 60, 56, C.GLASS);
  box(30, 30, 30, 56, C.GLASS); box(60, 30, 60, 56, C.GLASS);
  box(31, 54, 59, 55, C.STONE); box(41, 50, 59, 53, C.STONE);
  fill(31, 46, 40, 53, C.WATER, 20);
  box(41, 49, 59, 49, C.DIRT); box(41, 46, 41, 48, C.STONE);
  for (let y = 46; y <= 53; y++) for (let x = 31; x <= 40; x++) {
    const k = at(x, y);
    Wd.sol[k * C.NSOL + C.SOL_ALGAE] = mode === 'unfed' ? 0 : 20;
    Wd.sol[k * C.NSOL + C.SOL_FERT] = mode === 'overfed' ? 200 : 10;
  }
  Pl.plantSeed(at(42, 48)); Pl.plantSeed(at(44, 48)); Eco.ecoInitializeWorld();
  if (mode === 'overfed') for (let y = 46; y <= 53; y++) for (let x = 31; x <= 40; x++) Eco.ecoDeposit(at(x, y), { c: 1000, n: 100, p: 10 });
  // This control is intentionally sterile: no producer, airborne starter or hidden food is available.
  if (mode === 'unfed') {
    for (const pool of Object.values(Eco.ecoState().inoculum)) { Eco.ecoState().removed.c += pool.c; Eco.ecoState().removed.n += pool.n; Eco.ecoState().removed.p += pool.p; pool.c = pool.n = pool.p = 0; }
  }
  const fish = [Bd.addBody('fish', 33 * C.T, 50 * C.T), Bd.addBody('fish', 37 * C.T, 51 * C.T)];
  Wd.S.tick = Math.round(0.95 * DAY_TICKS); // same 07:12 start as the existing jar scene
  Wd.wakeAll();
  return fish.map(b => b.id);
}
function ecosystemSample(start, original) {
  const e = Eco.ecoState(), total = Eco.ecoInventory(Pl.plants), minerals = { n: 0, p: 0 };
  let water = Air.airWater(), algae = 0, oxygenMin = Infinity, oxygen = 0, waterVolume = 0, biomass = 0, plantReserve = 0, invalid = 0;
  for (let k = 0; k < C.W * C.H; k++) {
    if (Wd.liq[k] || ([C.WETDIRT, C.WETSPONGE, C.ICE].includes(Wd.solid[k]) && Wd.held[k])) {
      for (let i = 0; i < C.NSOL; i++) if (i !== C.SOL_O2 && (!Number.isFinite(Wd.sol[k * C.NSOL + i]) || Wd.sol[k * C.NSOL + i] < -1e-8)) invalid++;
    }
    if (Wd.typ[k] === C.WATER && Wd.liq[k]) {
      const volume = Wd.liq[k] / 255, o2 = Oxy.oxygenIn(k);
      water += Wd.liq[k]; waterVolume += volume; oxygen += o2 * volume; oxygenMin = Math.min(oxygenMin, o2);
      algae += Sol.soluteAmount(k, C.SOL_ALGAE);
      minerals.n += Sol.soluteAmount(k, C.SOL_FERT) + Sol.soluteAmount(k, C.SOL_AMMONIA);
      minerals.p += Sol.soluteAmount(k, C.SOL_PHOSPHATE);
    }
    if ([C.WETDIRT, C.WETSPONGE, C.ICE].includes(Wd.solid[k])) water += Wd.held[k] || (Wd.solid[k] === C.ICE ? 255 : 0);
    if (Wd.typ[k] === C.STEAM) water += Wd.liq[k];
    if ([C.MUD, C.TONIC, C.STORM].includes(Wd.typ[k])) water += Wd.liq[k];
    if (!Number.isFinite(Wd.temp[k])) invalid++;
  }
  for (const pool of [...Object.values(e.tissue), ...Wd.bodies.map(b => b.bio).filter(Boolean)]) {
    biomass += pool.c;
  }
  invalid += invalidEcosystemPools([...Object.values(e.tissue), ...Object.values(e.dead), ...Object.values(e.soil),
    ...Object.values(e.inoculum), ...Wd.bodies.map(b => b.bio).filter(Boolean), e.introduced, e.removed, e.riverInventory,
    ...Pl.plants.map(p => ({ c: p.sugar ?? 0, n: p.nitrogen ?? 0, p: p.phosphorus ?? 0 }))]);
  for (const n of [...Object.values(e.methane), ...Object.values(e.oxygenCredit), ...Object.values(Wd.S.mossSugar), e.nitrogenGas]) if (!Number.isFinite(n) || n < -1e-8) invalid++;
  for (const p of Pl.plants) plantReserve += p.sugar;
  const dead = Object.values(e.dead).reduce((s, p) => s + p.c, 0);
  return { day: (Wd.S.tick - start) / DAY_TICKS, phase: dayPhase(), fish: Wd.bodies.filter(b => b.kind === 'fish').length,
    originals: Wd.bodies.filter(b => original.includes(b.id)).length, plants: Pl.plants.length, algae, biomass: biomass + algae,
    plantReserve, dead, minerals, water, oxygenMin: Number.isFinite(oxygenMin) ? oxygenMin : null,
    oxygenMean: waterVolume ? oxygen / waterVolume : null, total, introduced: { ...e.introduced }, removed: { ...e.removed },
    births: { ...Wd.S.diagnostics.births }, deaths: { ...Wd.S.diagnostics.deathCounts },
    fixedAir: Wd.S.accounting.photosynthesisAirC || 0, fixedWater: Wd.S.accounting.photosynthesisWaterC || 0,
    atmosphereCarbon: Wd.S.accounting.gasAtmosphereCarbonEqMg || 0, atmosphereOxygen: Wd.S.accounting.gasAtmosphereOxygenMg || 0, invalid };
}
async function ecosystemWorker(seed) {
  const original = ecosystemJar(seed, scenario), start = Wd.S.tick, samples = [], interval = DAY_TICKS / ECOSYSTEM_GATE.samplesPerDay, wallStart = performance.now();
  const emit = row => { const line = JSON.stringify({ ...row, elapsedMs: performance.now() - wallStart }); console.log(line); if (out) appendFileSync(out, line + '\n'); };
  const initial = ecosystemSample(start, original); samples.push(initial); emit({ type: 'sample', seed, scenario, ...initial });
  for (let i = 1; i <= Math.ceil(days * DAY_TICKS); i++) {
    step();
    if (i % interval && i !== Math.ceil(days * DAY_TICKS)) continue;
    const sample = ecosystemSample(start, original); samples.push(sample);
    emit({ type: 'sample', seed, scenario, ...sample });
  }
  const last = samples.at(-1), checks = assessEcosystem(samples, { scenario, days });
  emit({ type: 'result', seed, scenario, days, ok: checks.every(c => c.ok), checks, last });
  process.exitCode = checks.every(c => c.ok) ? 0 : 1;
}
if (process.env.ECOSYSTEM_SEED) {
  await ecosystemWorker(Number(process.env.ECOSYSTEM_SEED));
} else {
  const seeds = option('seeds', ECOSYSTEM_GATE.seeds.join(',')).split(',').map(Number), jobs = Number(option('jobs', '3'));
  if (!seeds.length || seeds.some(s => !Number.isInteger(s)) || new Set(seeds).size !== seeds.length || !Number.isInteger(jobs) || jobs < 1) throw new Error('Use distinct integer seeds and positive integer jobs');
  const suite = process.argv.includes('--suite');
  const tasks = seeds.map(seed => ({ seed, scenario: suite ? 'balanced' : scenario, days }));
  if (suite) tasks.push({ seed: seeds[0], scenario: 'dark', days }, { seed: seeds[0], scenario: 'unfed', days: ECOSYSTEM_GATE.unfedDays }, { seed: seeds[0], scenario: 'overfed', days: 2 });
  if (out) writeFileSync(out, '');
  let next = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      const code = await new Promise(resolve => {
        const args = process.argv.slice(1).filter(a => !a.startsWith('--days=') && !a.startsWith('--case='));
        args.push('--days=' + task.days, '--case=' + task.scenario);
        const child = spawn(process.execPath, args, { env: { ...process.env, ECOSYSTEM_SEED: String(task.seed) }, stdio: 'inherit', windowsHide: true });
        child.on('error', e => { console.error(e); resolve(1); }); child.on('exit', code => resolve(code ?? 1));
      });
      if (code) failed++;
    }
  }));
  console.log(JSON.stringify({ type: 'summary', scenario: suite ? 'suite' : scenario, days, seeds, runs: tasks.length, failed,
    completionGate: suite && days >= ECOSYSTEM_GATE.days && seeds.length >= 3 && !failed })); process.exitCode = failed ? 1 : 0;
}
// Imported modules install UI timers; the runner has completed all of its owned work.
process.exit(process.exitCode || 0);
