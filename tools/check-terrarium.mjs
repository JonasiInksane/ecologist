// Focused preset/save/read controls. Optional --parity=<preserved Phase22 root> compares
// independent old/new workers without importing either runner's coordinator.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serialize } from 'node:v8';

const terrariumCheckRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const terrariumOption = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
async function terrariumParityWorker() {
  const base = resolve(terrariumOption('root', terrariumCheckRoot)), variant = terrariumOption('variant', 'new');
  const seed = Number(terrariumOption('seed', '7')), scenario = terrariumOption('scenario', 'balanced');
  const moduleAt = name => import(pathToFileURL(join(base, name)).href);
  const support = await moduleAt('tools/test-support.mjs');
  const [Eco, Bd, Pl, Sn, Day] = await Promise.all(['ecology', 'bodies', 'plants', 'snapshot', 'daynight'].map(name => moduleAt(`js/${name}.js`)));
  let original;
  if (variant === 'old') {
    const source = readFileSync(join(base, 'tools/check-ecosystem.mjs'), 'utf8');
    const constructor = source.match(/function ecosystemJar\(seed, mode\) \{[\s\S]*?\n\}(?=\r?\nfunction ecosystemSample)/)?.[0];
    assert.ok(constructor, 'preserved original constructor is present');
    const factory = new Function('C', 'Wd', 'at', 'clearWorld', 'box', 'fill', 'Pl', 'Eco', 'Bd', 'DAY_TICKS', `${constructor}; return ecosystemJar;`);
    original = factory(support.C, support.Wd, support.at, support.clearWorld, support.box, support.fill, Pl, Eco, Bd, Day.DAY_TICKS)(seed, scenario);
  } else {
    const { buildEcosystemJar } = await moduleAt('js/terrarium.js');
    support.reseed(seed); original = buildEcosystemJar(scenario);
  }
  const checkpoints = [];
  function digest(ticks) {
    const snap = Sn.capture();
    if (Object.hasOwn(snap.state, 'terrarium')) { assert.equal(snap.state.terrarium, null); delete snap.state.terrarium; }
    if (Object.hasOwn(snap.state, 'editing')) { assert.equal(snap.state.editing, false); delete snap.state.editing; }
    if (Object.hasOwn(snap.state, 'draft')) { assert.equal(snap.state.draft, null); delete snap.state.draft; }
    const ledger = snap.state.accounting?.fantasy;
    if (ledger) {
      // A jar has no magical materials. Only the newly registered, strictly zero ledger
      // metadata differs from Phase22; no physical or ecological field is excluded.
      const zero = { version: 1, baselineTick: 0, legacyBaseline: false, events: 0, carrierSource: {}, carrierSink: {}, blockSource: {}, blockSink: {},
        ingredientSource: Array(support.C.NSOL).fill(0), ingredientSink: Array(support.C.NSOL).fill(0), biologicalSource: { c: 0, n: 0, p: 0 }, biologicalSink: { c: 0, n: 0, p: 0 },
        sensibleHeatSource: 0, sensibleHeatSink: 0, latentHeatSource: 0, latentHeatSink: 0, unmeteredUses: 0, effects: {} };
      assert.deepEqual(ledger, zero, 'jar must have no magical resource/energy events');
      delete snap.state.accounting.fantasy;
    }
    checkpoints.push({ ticks, digest: createHash('sha256').update(serialize(snap)).digest('hex') });
  }
  digest(0);
  for (let i = 1; i <= 64; i++) { support.step(); if ([1, 8, 32, 64].includes(i)) digest(i); }
  console.log(JSON.stringify({ seed, scenario, original, checkpoints, nextRandom: Math.random() }));
}
if (process.argv.includes('--parity-worker')) { await terrariumParityWorker(); process.exit(0); }

const { C, Wd, at, clearWorld, step, reseed } = await import('./test-support.mjs');
const Jar = await import('../js/terrarium.js');
const { plants } = await import('../js/plants.js');
const { ecoInventory, ecoState } = await import('../js/ecology.js');
const { capture, restore, packWorld, unpackWorld } = await import('../js/snapshot.js');
const { setTimeMode } = await import('../js/daynight.js');
const { MG_PER_UNIT, OXYGEN_REFERENCE } = await import('../js/oxygen.js');
const { history, checkpoint, clearHistory, undo } = await import('../js/history.js');
let terrariumChecks = 0;
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); terrariumChecks++; };
const ok = (condition, label) => { assert.ok(condition, label); terrariumChecks++; };
const close = (actual, expected, label, tolerance = 1e-8) => { ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`); };
const digest = () => createHash('sha256').update(serialize(capture())).digest('hex');
const stocks = () => ({ ...ecoInventory(plants) });
function compareStocks(actual, expected, label) { for (const key of ['c', 'n', 'p']) close(actual[key], expected[key], `${label} ${key}`); }

clearWorld(73);
same(Jar.terrariumReading(), null, 'no jar outside the preset');
Wd.S.seed = 246; Wd.S.weather = true; Wd.S.pressure = false; Wd.S.momentum = false;
Wd.S.timeMode = 'stop'; Wd.S.heldPhase = 0.72; Wd.S.timeShift = 0.19;
const settings = { seed: 246, weather: true, pressure: false, momentum: false, timeMode: 'stop', heldPhase: 0.72, timeShift: 0.19 };
const randomBefore = Math.random;
Jar.startTerrarium(73);
same(Math.random, randomBefore, 'construction restores caller random function');
ok(Jar.isTerrarium(), 'saved descriptor activates jar');
same(Wd.S.level, null, 'jar is not a puzzle');
same(Wd.S.terrarium.previousSettings, settings, 'entry captures ordinary settings');
same([Wd.S.weather, Wd.S.pressure, Wd.S.momentum, Wd.S.timeMode, Wd.S.timeShift], [false, true, true, 'cycle', 0], 'verified simulation settings');
same(Wd.S.tick, Math.round(0.95 * 10800), 'verified clock start');
same(Wd.bodies.map(b => b.kind), ['fish', 'fish'], 'exact two fish and no explorer');
same(plants.map(p => p.root), [at(42, 48), at(44, 48)], 'exact starting roots');
for (let x = 30; x <= 60; x++) { same(Wd.solid[at(x, 30)], C.GLASS, 'sealed glass top'); same(Wd.solid[at(x, 56)], C.GLASS, 'sealed glass bottom'); }
for (let y = 30; y <= 56; y++) { same(Wd.solid[at(30, y)], C.GLASS, 'sealed left wall'); same(Wd.solid[at(60, y)], C.GLASS, 'sealed right wall'); }
let water = 0; for (let y = 31; y < 56; y++) for (let x = 31; x < 60; x++) if (Wd.typ[at(x, y)] === C.WATER) water += Wd.liq[at(x, y)];
same(water, 80 * 255, 'exact finite starting water');
let reading = Jar.terrariumReading();
same([reading.fish, reading.plants, reading.births, reading.deaths, reading.algae, reading.algaeRatio, reading.foodState], [2, 2, 0, 0, 1600, 1, 'well-fed'], 'initial population, food and recorded turnover');
same(reading.elapsedDays, 0, 'new jar age');
close(reading.oxygenMin, 9.1, 'initial actual water oxygen');
close(reading.fishOxygenMin, 9.1, 'initial oxygen near fish');
const pureBefore = digest(), originalRandom = Math.random;
let randomCalls = 0; Math.random = () => { randomCalls++; return 0.37; };
for (let i = 0; i < 20; i++) Jar.terrariumReading();
Math.random = originalRandom;
same(randomCalls, 0, 'telemetry consumes no randomness'); same(digest(), pureBefore, 'telemetry does not change captured state');
const pristine = capture(), introduced = structuredClone(ecoState().introduced), initialStocks = stocks();
for (let i = 0; i < 64; i++) step();
same(ecoState().introduced, introduced, 'no introduction after setup'); compareStocks(stocks(), initialStocks, 'closed short jar');
close(Jar.terrariumReading().elapsedDays, 64 / 10800, 'age uses elapsed simulation ticks');

// Read only the fixed area: unrelated external water cannot inflate a jar's oxygen/food.
restore(pristine); const outside = at(100, 100); Wd.liq[outside] = 255; Wd.typ[outside] = C.WATER; Wd.sol[outside * C.NSOL + C.SOL_ALGAE] = 1e6;
close(Jar.terrariumReading().algae, 1600, 'external food excluded');
const fish = Wd.bodies[0], fishCell = Math.floor((fish.y + fish.h / 2) / C.T) * C.W + Math.floor((fish.x + fish.w / 2) / C.T);
Wd.sol[fishCell * C.NSOL + C.SOL_O2] = (OXYGEN_REFERENCE - 2) / MG_PER_UNIT;
close(Jar.terrariumReading().fishOxygenMin, 2, 'local hypoxia is visible rather than hidden by pond mean');
fish.bio.c = 12 + 10.8 * 0.25; same(Jar.terrariumReading().foodState, 'low', 'low reserve warning');
fish.bio.c = 12; same(Jar.terrariumReading().foodState, 'exhausted', 'exhausted reserve warning');
delete fish.bio; const missingFood = digest(); same(Jar.terrariumReading().foodState, 'unknown', 'missing food is not initialized on read'); same(digest(), missingFood, 'missing-food reading remains pure');
restore(pristine); Wd.bodies[0].x = 45 * C.T; Wd.bodies[0].y = 40 * C.T;
same(Jar.terrariumReading().fishOutsideWater, 1, 'stranded fish visible');
Wd.bodies[0].x = 100 * C.T; same(Jar.terrariumReading().fishOutsideJar, 1, 'escaped fish visible');
Wd.bodies.length = 0;
same([Jar.terrariumReading().fish, Jar.terrariumReading().foodState, Jar.terrariumReading().fishOxygenMin], [0, 'none', null], 'zero-fish reading does not respawn or invent oxygen near fish');
for (let y = 31; y < 56; y++) for (let x = 31; x < 60; x++) Wd.liq[at(x, y)] = 0;
same([Jar.terrariumReading().oxygenMin, Jar.terrariumReading().oxygenMean, Jar.terrariumReading().algae], [null, null, 0], 'dry jar has no invented water or food');
restore(pristine); Wd.S.diagnostics.births.fish = 3; Wd.S.diagnostics.deathCounts['fish:hypoxia'] = 2;
same([Jar.terrariumReading().births, Jar.terrariumReading().deaths, Jar.terrariumReading().deathCauses], [3, 2, [{ cause: 'hypoxia', count: 2 }]], 'actual recorded cause feedback');

restore(pristine); for (let i = 0; i < 32; i++) step(); setTimeMode('night');
const saved = capture(), descriptor = structuredClone(Wd.S.terrarium), savedStocks = stocks(), savedReading = Jar.terrariumReading();
Jar.restartTerrarium(); restore(saved);
same(Wd.S.terrarium, descriptor, 'snapshot retains descriptor and entry settings'); same(Jar.terrariumReading(), savedReading, 'snapshot retains age and actual readouts'); compareStocks(stocks(), savedStocks, 'snapshot inventory');
const code = await packWorld(saved); Jar.restartTerrarium(); restore(await unpackWorld(code));
same(Wd.S.terrarium, descriptor, 'world code retains descriptor'); close(Jar.terrariumReading().elapsedDays, savedReading.elapsedDays, 'world code retains age'); compareStocks(stocks(), savedStocks, 'world code inventory');
same(ecoState().introduced, saved.state.ecology.introduced, 'loading does not restock');
const legacy = capture(); delete legacy.state.terrarium; Jar.startTerrarium(7); restore(legacy);
same(Wd.S.terrarium, null, 'older save clears stale jar marker'); same(Jar.terrariumReading(), null, 'older save does not reconstruct jar'); compareStocks(stocks(), savedStocks, 'legacy load retains existing inventories');
const legacySandbox = capture(); delete legacySandbox.state.editing; delete legacySandbox.state.draft;
Wd.S.editing = true; Wd.S.draft = { name: 'unrelated editor draft' }; restore(legacySandbox);
same(Wd.S.editing, false, 'older sandbox save clears stale editor mode');
same(Wd.S.draft, null, 'older sandbox save clears unrelated editor draft');
const savedEditor = capture(); savedEditor.state.editing = true; savedEditor.state.draft = { name: 'saved editor draft' }; restore(savedEditor);
same(Wd.S.editing, true, 'explicit saved editor mode still restores');
same(Wd.S.draft, savedEditor.state.draft, 'explicit saved editor draft still restores');
Jar.startTerrarium(73); const restartStart = Jar.terrariumReading(), oldSettings = structuredClone(Wd.S.terrarium.previousSettings);
same(Wd.S.editing, false, 'preset construction leaves editor mode');
for (let i = 0; i < 32; i++) step(); clearHistory(); checkpoint();
Jar.restartTerrarium(); same(Jar.terrariumReading().elapsedDays, 0, 'restart starts new age'); same(Jar.terrariumReading().algae, restartStart.algae, 'restart has exactly one initial endowment'); same(Wd.S.terrarium.previousSettings, oldSettings, 'restart does not overwrite exit settings');
ok(undo() >= 0, 'restart is undoable'); close(Jar.terrariumReading().elapsedDays, 32 / 10800, 'undo restores prior jar age');
ok(history.length === 0, 'undo consumed only its own checkpoint');
Jar.leaveTerrarium(); same(Wd.S.terrarium, null, 'exit clears mode');
for (const key of Object.keys(oldSettings)) same(Wd.S[key], oldSettings[key], 'exit restores ' + key);
clearWorld(); Wd.S.level = { index: 0 }; Wd.S.weather = false; Wd.S.pressure = true; Wd.S.sandboxWeather = true; Wd.S.sandboxPressure = false;
Wd.S.timeMode = 'night'; Wd.S.timeShift = 0.32;
Jar.startTerrarium(7); same([Wd.S.terrarium.previousSettings.weather, Wd.S.terrarium.previousSettings.pressure, Wd.S.terrarium.previousSettings.timeMode, Wd.S.terrarium.previousSettings.timeShift], [true, false, 'night', 0.32], 'puzzle entry captures effective sandbox settings');
Jar.leaveTerrarium(); same([Wd.S.weather, Wd.S.pressure, Wd.S.timeMode, Wd.S.timeShift], [true, false, 'night', 0.32], 'puzzle through jar preserves sandbox settings');
Jar.startTerrarium(7); Wd.S.editing = true; clearWorld(); same(Wd.S.terrarium, null, 'blank reset clears jar'); same(Wd.S.editing, false, 'blank reset clears editor mode');
assert.throws(() => Jar.startTerrarium(NaN), RangeError); terrariumChecks++;
assert.throws(() => Jar.buildEcosystemJar('unsupported'), RangeError); terrariumChecks++;

const parityRoot = terrariumOption('parity', '');
if (parityRoot) {
  async function runParity(root, variant, seed, scenario) {
    return new Promise((resolveWorker, rejectWorker) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--parity-worker', '--root=' + root, '--variant=' + variant, '--seed=' + seed, '--scenario=' + scenario], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
      child.on('error', rejectWorker); child.on('close', code => {
        if (code !== 0) rejectWorker(new Error(`${variant} ${scenario}/${seed} exited ${code}: ${stderr}`));
        else { try { resolveWorker(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch (error) { rejectWorker(error); } }
      });
    });
  }
  for (const seed of [7, 73, 31337]) for (const scenario of ['balanced', 'dark', 'unfed', 'overfed']) {
    const [old, current] = await Promise.all([runParity(resolve(parityRoot), 'old', seed, scenario), runParity(terrariumCheckRoot, 'new', seed, scenario)]);
    same(current.original, old.original, 'initial fish identity parity');
    for (let i = 0; i < old.checkpoints.length; i++) same(current.checkpoints[i], old.checkpoints[i], `exact world parity ${scenario}/${seed} step ${old.checkpoints[i].ticks}`);
    same(current.nextRandom, old.nextRandom, 'construction and evolution preserve RNG consumption');
    console.log(JSON.stringify({ parity: true, seed, scenario, checkpoints: old.checkpoints.map(point => point.ticks), nextRandom: current.nextRandom }));
  }
}
console.log(`Terrarium checks: ${terrariumChecks} passed${parityRoot ? ' (including preserved Phase22 parity)' : ''}`);
process.exit(0);
