// Times the simulation and the drawing on the default world, headless: `node tools/profile.mjs [ticks] [--hot]`.
// --hot also samples the CPU and lists the functions that take the most time.
import { Session } from 'node:inspector/promises';

const fakeCtx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} };
function stub() {
  return new Proxy(function () {}, {
    get: (f, k) => k === 'getContext' ? () => fakeCtx : k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? undefined : stub(),
    apply: () => stub(), construct: () => stub(), set: () => true,
  });
}
globalThis.document = stub();
globalThis.addEventListener = () => {};
globalThis.Option = function () {};
globalThis.matchMedia = () => ({ matches: false });

const profileOption = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const profileScene = profileOption('scene', 'generated');
if (!['generated', 'calm', 'storm', 'burning', 'crowded', 'terrarium'].includes(profileScene)) throw new Error('Unknown profiling scene');
const { S, solid, liq, typ, temp, markDirty } = await import('../js/world.js');
const { W, H, T, WATER, WOOD } = await import('../js/config.js');
const { seededRandom } = await import('../js/util.js');
const { generate } = await import('../js/generate.js');
const { step } = await import('../js/sim.js');
const { render } = await import('../js/render/render.js');
const { centerOn, setZoom, snapToExplorer } = await import('../js/render/camera.js');
const ticks = +process.argv.find(a => /^\d+$/.test(a)) || 600, hot = process.argv.includes('--hot');

let t0 = performance.now();
S.seed = Number(profileOption('seed', String(S.seed)));
generate(); setZoom(1); snapToExplorer();
if (profileScene === 'terrarium') {
  const { startTerrarium } = await import('../js/terrarium.js');
  startTerrarium(S.seed); S.follow = false; setZoom(2); centerOn(45 * T, 43 * T);
}
console.log(`generate  ${(performance.now() - t0).toFixed(0)} ms`);
Math.random = seededRandom(S.seed);
if (profileScene === 'calm') { S.weather = false; S.wind = S.windTarget = 0; }
if (profileScene === 'storm') {
  const air = await import('../js/air.js');
  S.weather = true; S.wind = S.windTarget = 2; S.windTimer = 1e9;
  air.cloud.fill(air.STORM_AT * 3); air.hum.fill(air.RAIN_AT);
}
if (profileScene === 'burning') {
  const { surface } = await import('../js/climate.js');
  for (let x = 20; x < 100; x += 3) {
    const y = surface[x] - 1, k = y * W + x;
    if (y < 0 || solid[k] || liq[k]) continue;
    solid[k] = WOOD; temp[k] = 450; markDirty(x, y);
  }
}
if (profileScene === 'crowded') {
  const { addBody } = await import('../js/bodies.js'); let added = 0;
  for (let k = 0; k < W * H && added < 24; k++) if (typ[k] === WATER && liq[k] > 200 && !solid[k]) {
    if (addBody('fish', (k % W) * T, Math.floor(k / W) * T)) added++;
  }
}
console.log(`scenario  ${profileScene} · seed ${S.seed} · ${ticks} ticks`);
const session = new Session();
if (hot) { session.connect(); await session.post('Profiler.enable'); await session.post('Profiler.start'); }
const sim = [], draw = [];
for (let i = 0; i < ticks; i++) {
  t0 = performance.now(); step(); sim.push(performance.now() - t0);
  if (i % 2 === 0) { t0 = performance.now(); render(i / 60); draw.push(performance.now() - t0); }
}
const stats = a => { const s = [...a].sort((x, y) => x - y); return `mean ${(a.reduce((x, y) => x + y) / a.length).toFixed(2)} ms · median ${s[s.length >> 1].toFixed(2)} · 95th ${s[(s.length * 0.95) | 0].toFixed(2)} · worst ${s[s.length - 1].toFixed(2)}`; };
console.log(`step      ${stats(sim)}`);
console.log(`render    ${stats(draw)}  (every other tick)`);
if (hot) {
  const { profile: p } = await session.post('Profiler.stop');
  const byId = new Map(p.nodes.map(n => [n.id, n])), self = new Map();
  let total = 0;
  p.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame, key = `${cf.functionName || '(anonymous)'}  ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (p.timeDeltas[i] || 0)); total += p.timeDeltas[i] || 0;
  });
  console.log('\nself time by function:');
  for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(t / 1000).toFixed(0).padStart(7)} ms ${(t / total * 100).toFixed(1).padStart(5)}%  ${k}`);
}
process.exit(0);   // a module keeps a timer running, which would hold the process open
