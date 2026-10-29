// Shared headless fixture for focused simulation checks. Imports happen after browser stubs.
const fakeContext = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
function pageStub() {
  return new Proxy(function () {}, {
    get: (f, k) => k === 'getContext' ? () => fakeContext : k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? undefined : pageStub(),
    apply: () => pageStub(), construct: () => pageStub(), set: () => true,
  });
}
globalThis.document = pageStub();
globalThis.addEventListener = () => {};
globalThis.Option = function () {};
globalThis.matchMedia = () => ({ matches: false });
let fixtureSeed = 1;
function reseed(seed = 1) { fixtureSeed = seed | 0; }
Math.random = () => {
  fixtureSeed = (fixtureSeed + 0x6d2b79f5) | 0;
  let t = Math.imul(fixtureSeed ^ (fixtureSeed >>> 15), fixtureSeed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const C = await import('../js/config.js');
const Wd = await import('../js/world.js');
const { step } = await import('../js/sim.js');
const { resetWorld } = await import('../js/generate.js');
const at = (x, y) => y * C.W + x;
function clearWorld(seed = 1) {
  resetWorld(); reseed(seed);
  Wd.solid.fill(0); Wd.liq.fill(0); Wd.typ.fill(0); Wd.temp.fill(C.AMBIENT);
  Wd.sol.fill(0); Wd.latent.fill(0); Wd.vel.fill(0); Wd.drop.fill(0);
  Wd.under.fill(1); Wd.bodies.length = 0; Wd.pumps.length = 0;
  Wd.S.weather = false; Wd.S.momentum = true; Wd.S.pressure = true;
  for (let x = 0; x < C.W; x++) Wd.solid[at(x, C.H - 1)] = C.STONE;
  Wd.wakeAll();
}
function box(x0, y0, x1, y1, block) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) Wd.solid[at(x, y)] = block;
  Wd.wakeAll();
}
function fill(x0, y0, x1, y1, type = C.WATER, temperature = C.AMBIENT, amount = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = at(x, y); Wd.liq[k] = amount; Wd.typ[k] = type; Wd.temp[k] = temperature;
  }
  Wd.wakeAll();
}
function run(ticks) { for (let i = 0; i < ticks; i++) step(); }
export { C, Wd, at, clearWorld, box, fill, run, step, reseed };
