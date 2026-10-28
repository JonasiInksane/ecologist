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

const { generate } = await import('../js/generate.js');
const { step } = await import('../js/sim.js');
const { render } = await import('../js/render/render.js');
const { setZoom, snapToExplorer } = await import('../js/render/camera.js');
const ticks = +process.argv.find(a => /^\d+$/.test(a)) || 600, hot = process.argv.includes('--hot');

let t0 = performance.now();
generate(); setZoom(1); snapToExplorer();
console.log(`generate  ${(performance.now() - t0).toFixed(0)} ms`);
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
