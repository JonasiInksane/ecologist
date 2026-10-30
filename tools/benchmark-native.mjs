// Comparable transport-only workload, not a full-game frame-rate benchmark.
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { C, Wd, clearWorld, fill } from './test-support.mjs';
import { liquidTick } from '../js/sim.js';
const ticks = 240;
const results = [];
for (const [width, height] of [[512, 128], [1024, 1024]]) {
  const run = spawnSync('native/build/ecologist-core.exe', ['--benchmark', String(width), String(height), String(ticks)], {encoding: 'utf8'});
  if (run.status !== 0) throw new Error(run.error?.message || run.stderr || run.stdout);
  results.push({runtime: 'C++', initial_liquid_cells: width * height / 4, ...JSON.parse(run.stdout)});
}
clearWorld(7);
fill(0, C.H / 8, C.W - 1, C.H * 3 / 8 - 1, C.WATER, 20);
const before = Wd.liq.reduce((a, b) => a + b, 0);
let elapsed = 0, worst = 0, active = 0;
for (let i = 0; i < ticks; i++) {
  for (const chunk of Wd.awake) if (chunk) active += C.CHUNK * C.CHUNK;
  const start = performance.now();
  Wd.S.tick++;
  liquidTick(false, false);
  for (let c = 0; c < Wd.awake.length; c++) if (Wd.awake[c]) Wd.awake[c]--;
  const ms = performance.now() - start;
  elapsed += ms; worst = Math.max(worst, ms);
}
results.push({runtime: `JavaScript / Node ${process.version}`, cells: C.W * C.H, ticks,
  initial_liquid_cells: C.W * C.H / 4, mean_ms: elapsed / ticks, worst_ms: worst,
  mean_active_cells: Math.floor(active / ticks), water_conserved: before === Wd.liq.reduce((a, b) => a + b, 0),
  scope: 'isolated liquid transport, no rendering or ecology'});
const report = {cpu: cpus()[0].model, platform: `${process.platform} ${process.arch}`, ticks, results};
mkdirSync('.test-artifacts', {recursive: true});
writeFileSync('.test-artifacts/native-benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(results.every(r => r.water_conserved) ? 0 : 1);
