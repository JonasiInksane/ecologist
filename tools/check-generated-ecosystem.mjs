// Actual fixed-step generated-world checks. Coordinator bounds workers; inspection never replenishes resources.
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ECO_DAY } from '../js/ecology-data.js';
import { GENERATED_ECOSYSTEM_GATE, assessGeneratedEcosystem, generatedSuiteComplete, permanentGeneratedFailures } from './generated-ecosystem-metrics.mjs';
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const days = Number(option('days', String(GENERATED_ECOSYSTEM_GATE.days)));
const seeds = option('seeds', GENERATED_ECOSYSTEM_GATE.seeds.join(',')).split(',').map(Number);
const jobs = Number(option('jobs', '3')), out = option('out', '');
const failFast = process.argv.includes('--fail-fast');
if (!Number.isFinite(days) || days <= 0 || !seeds.length || seeds.some(seed => !Number.isInteger(seed)) || new Set(seeds).size !== seeds.length || !Number.isInteger(jobs) || jobs < 1) throw new Error('Use finite positive days, distinct integer seeds and positive integer jobs');
if (out) writeFileSync(out, '');
const emit = row => { if (out) appendFileSync(out, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)); };
let next = 0, failed = 0, cancelled = false;
const children = new Set();
function cancelGeneratedRun() {
  cancelled = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', cancelGeneratedRun);
process.on('SIGTERM', cancelGeneratedRun);
await Promise.all(Array.from({ length: Math.min(jobs, seeds.length) }, async () => {
  while (!cancelled && next < seeds.length) {
    const seed = seeds[next++], samples = []; let stopReasons = [];
    const code = await new Promise(resolve => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./inspect-habitats.mjs', import.meta.url)),
        '--seeds=' + seed, '--ticks=' + Math.ceil(days * ECO_DAY), '--compact'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      children.add(child);
      const lines = createInterface({ input: child.stdout });
      let parseFailed = false;
      lines.on('line', line => {
        try {
          const sample = JSON.parse(line); samples.push(sample);
          if (out) appendFileSync(out, JSON.stringify({ type: 'sample', ...sample }) + '\n');
          console.log(JSON.stringify({ type: 'progress', seed, day: sample.day, fish: sample.fish, bees: sample.bees,
            plants: sample.plants, algae: sample.waterAlgae, deaths: sample.deaths,
            magicalBiologicalSources: sample.accounting?.fantasy?.biologicalSource,
            magicalBiologicalSinks: sample.accounting?.fantasy?.biologicalSink }));
          if (failFast && !stopReasons.length) {
            stopReasons = permanentGeneratedFailures(samples);
            if (stopReasons.length) child.kill(); // Only this coordinator's exact failed worker.
          }
        } catch (error) {
          parseFailed = true; console.error(`seed ${seed}: ${error.message}`);
          if (failFast && !stopReasons.length) {
            stopReasons = [{ name: 'valid ecosystem observation', ok: false, detail: error.message }]; child.kill();
          }
        }
      });
      child.stderr.on('data', chunk => process.stderr.write(`seed ${seed}: ${chunk}`));
      child.on('error', error => { console.error(error); resolve(1); });
      child.on('close', code => { children.delete(child); resolve(parseFailed ? 1 : code ?? 1); });
    });
    let checks;
    try { checks = samples.length ? assessGeneratedEcosystem(samples, { days }) : [{ name: 'observations produced', ok: false }]; }
    catch (error) { checks = [{ name: 'valid ecosystem observations', ok: false, detail: error.message }]; }
    const ok = code === 0 && checks.every(check => check.ok);
    if (!ok) failed++;
    emit({ type: 'result', seed, days, ok, workerExitCode: code, stoppedEarly: stopReasons.length > 0, stopReasons, checks, last: samples.at(-1) });
  }
}));
emit({ type: 'summary', days, seeds, failed, failFast, cancelled, completionGate: generatedSuiteComplete({ days, seeds, failed, cancelled }) });
process.exitCode = cancelled ? 130 : failed ? 1 : 0;
