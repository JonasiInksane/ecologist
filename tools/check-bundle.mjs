// Check the built flat bundle's entry point and first frame with DOM/canvas stubs.
// This is headless integration coverage; it does not exercise browser controls or player feel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
const context = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} };
function stub() {
  return new Proxy(function () {}, {
    get: (f, key) => key === 'getContext' ? () => context : key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? undefined : stub(),
    apply: () => stub(), construct: () => stub(), set: () => true,
  });
}
globalThis.document = stub(); globalThis.addEventListener = () => {};
globalThis.Option = function () {}; globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { hash: '#seed-7' }; globalThis.setInterval = () => 0;
const frames = []; globalThis.requestAnimationFrame = callback => frames.push(callback);
const html = readFileSync('dist/ecologist.html', 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const errors = [], report = console.error; console.error = (...args) => errors.push(args.map(String).join(' '));
try {
  runInThisContext(script, { filename: 'ecologist.bundle.js' });
  assert.equal(frames.length, 1);
  frames[0](performance.now() + 1000 / 60);
  assert.equal(frames.length, 2, 'first frame schedules its continuation');
  assert.deepEqual(errors, []);
} finally { console.error = report; }
console.log('PASS bundled initialization and first animation frame under DOM/canvas stubs');
process.exit(0);
