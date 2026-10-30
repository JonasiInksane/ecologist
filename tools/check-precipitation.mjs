// Focused weather-source and presentation regressions. No browser or dependencies needed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { C, Wd, at, clearWorld } from './test-support.mjs';
import * as Air from '../js/air.js';
import { drawPrecipitation } from '../js/render/sky.js';
import { frame } from '../js/canvas.js';
import { capture } from '../js/snapshot.js';

const { S, VIEW, solid, liq, typ, under } = Wd;
const BACKGROUND = 0xff000000, TIME = 3.25;
let checks = 0, failed = 0;
function check(name, test) {
  try { test(); checks++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
function scene() {
  clearWorld(7); under.fill(0); Air.resetAir(); Air.open.fill(1);
  Air.cellT.fill(12); S.weather = true; S.rain = 1;
  Object.assign(VIEW, { x: 0, y: 0, w: 1024, h: 768 });
}
function layer(cy, temperature = 12, density = 1000) {
  for (let cx = 0; cx < Air.AW; cx++) {
    const c = cy * Air.AW + cx;
    Air.cloud[c] = density; Air.cellT[c] = temperature;
  }
}
function draw(time = TIME) {
  frame.fill(BACKGROUND); drawPrecipitation(time); return frame.slice();
}
function pixels(image, rect = VIEW) {
  let n = 0;
  for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(C.PH, rect.y + rect.h); y++)
    for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(C.PW, rect.x + rect.w); x++)
      if (image[y * C.PW + x] !== BACKGROUND) n++;
  return n;
}
function sameCrop(actual, expected, rect) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const start = y * C.PW + rect.x;
    assert.deepEqual(actual.subarray(start, start + rect.w), expected.subarray(start, start + rect.w), `world row ${y}`);
  }
}
function clipped(image) {
  let inside = 0, outside = 0;
  for (let k = 0; k < image.length; k++) if (image[k] !== BACKGROUND) {
    const x = k % C.PW, y = (k / C.PW) | 0;
    if (x >= VIEW.x && x < VIEW.x + VIEW.w && y >= VIEW.y && y < VIEW.y + VIEW.h) inside++;
    else outside++;
  }
  assert.equal(outside, 0, 'no pixels outside the view or across a map edge');
  assert.ok(inside > 0, 'positive precipitation control');
}

check('stale rain status cannot draw precipitation without clouds', () => {
  scene(); assert.equal(pixels(draw()), 0);
  layer(3, 12, Air.RAIN_AT); assert.equal(pixels(draw()), 0, 'non-raining clouds also draw nothing');
});
check('cloud state controls precipitation and the weather switch disables it', () => {
  scene(); layer(3); S.rain = 0;
  assert.ok(pixels(draw()) > 0, 'a new raining cloud does not wait for the rain summary to catch up');
  S.rain = 1; S.weather = false;
  assert.equal(pixels(draw()), 0, 'disabled weather draws no precipitation');
});
for (const [kind, temperature] of [['rain', 12], ['snow', -12]]) {
  check(`${kind} never appears above its source cloud`, () => {
    scene(); layer(16, temperature);
    Object.assign(VIEW, { x: 0, y: 0, w: 512, h: 256 });
    assert.equal(pixels(draw()), 0, 'the only cloud is below this view');
  });
  check(`${kind} starts at the cloud underside and remains visible below an offscreen cloud`, () => {
    scene(); const cy = 5, sourceY = (cy * Air.CELL + Air.CELL - 1) * C.T;
    layer(cy, temperature);
    const image = draw();
    assert.equal(pixels(image, { x: 0, y: 0, w: VIEW.w, h: sourceY }), 0, 'no precipitation above the emission row');
    assert.ok(pixels(image, { x: 0, y: sourceY, w: VIEW.w, h: VIEW.h - sourceY }) > 0);
    Object.assign(VIEW, { y: sourceY + 96, h: 288 });
    assert.ok(pixels(draw()) > 0, 'cloud can remain above the camera');
  });
  check(`${kind} uses cloud temperature and wind independently of the camera`, () => {
    scene(); const cy = 3;
    layer(cy, temperature);
    for (let cx = 0; cx < Air.AW; cx++) Air.u[cy * Air.AW + cx] = 0.7;
    const expected = draw(); assert.ok(pixels(expected) > 0);
    Air.cellT.fill(-temperature); Air.u.fill(-0.8);
    layer(cy, temperature);
    for (let cx = 0; cx < Air.AW; cx++) Air.u[cy * Air.AW + cx] = 0.7;
    assert.deepEqual(draw(), expected, 'changing only non-source air must not change precipitation');
  });
  check(`${kind} remains anchored to the world when panning and zooming`, () => {
    scene(); layer(3, temperature);
    for (const wind of [-1.6, 0, 1.6]) {
      Object.assign(VIEW, { x: 0, y: 0, w: 1024, h: 768 });
      Air.u.fill(wind); const expected = draw();
      for (const view of [{ x: 160, y: 240, w: 512, h: 288 }, { x: 211, y: 311, w: 320, h: 224 },
        { x: 299, y: 96, w: 320, h: 576 }]) {
        Object.assign(VIEW, view); const actual = draw();
        assert.ok(pixels(actual) > 0); sameCrop(actual, expected, view);
      }
    }
  });
  check(`${kind} clips at the view and both horizontal map edges`, () => {
    scene(); layer(0, temperature);
    for (const x of [0, C.PW - 128]) for (const wind of [-1, 1]) {
      Air.u.fill(wind); Object.assign(VIEW, { x, y: 128, w: 128, h: 288 });
      clipped(draw());
    }
  });
  check(`${kind} respects fractional view boundaries`, () => {
    scene(); layer(3, temperature); const expected = draw();
    Object.assign(VIEW, { x: 31.25, y: 183.75, w: 320.5, h: 224.5 });
    const actual = draw(); clipped(actual);
    const x = Math.ceil(VIEW.x), y = Math.ceil(VIEW.y);
    sameCrop(actual, expected, { x, y, w: Math.ceil(VIEW.x + VIEW.w) - x, h: Math.ceil(VIEW.y + VIEW.h) - y });
  });
  check(`${kind} from the lowest cloud stays inside the map`, () => {
    scene(); solid.fill(0); layer(Air.AH - 1, temperature);
    Object.assign(VIEW, { x: 0, y: C.PH - 24, w: C.PW, h: 24 });
    const image = draw(); clipped(image);
    assert.equal(pixels(image, { x: 0, y: 0, w: C.PW, h: C.PH - C.T }), 0);
  });
}

check('a freezing source produces a different effect from a warm source', () => {
  scene(); layer(3, 12); const rain = draw();
  layer(3, -12); const snow = draw();
  assert.ok(pixels(rain) > 0 && pixels(snow) > 0);
  assert.notDeepEqual(snow, rain, 'source temperature must affect the visible precipitation');
});

check('stacked clouds use the source immediately above each precipitation region', () => {
  scene(); layer(3, -12); layer(10, 12);
  const mixed = draw(), below = { x: 160, y: 384, w: 512, h: 288 }, between = { x: 160, y: 160, w: 512, h: 144 };
  assert.ok(pixels(mixed, below) > 0 && pixels(mixed, between) > 0);
  layer(3, 12);
  for (let cx = 0; cx < Air.AW; cx++) Air.u[3 * Air.AW + cx] = 0.8;
  sameCrop(draw(), mixed, below);
  layer(3, -12); Air.u.fill(0); layer(10, -12);
  for (let cx = 0; cx < Air.AW; cx++) Air.u[10 * Air.AW + cx] = -0.8;
  sameCrop(draw(), mixed, between);
});

check('terrain, liquids and covered tiles hide precipitation', () => {
  scene(); layer(3);
  const image = draw(), tiles = [];
  for (let k = 0; k < image.length && tiles.length < 3; k++) if (image[k] !== BACKGROUND) {
    const tile = at(((k % C.PW) / C.T) | 0, (((k / C.PW) | 0) / C.T) | 0);
    if (!tiles.includes(tile)) tiles.push(tile);
  }
  assert.equal(tiles.length, 3, 'three visible precipitation tiles available');
  solid[tiles[0]] = C.STONE; liq[tiles[1]] = 255; typ[tiles[1]] = C.WATER; under[tiles[2]] = 1;
  const masked = draw();
  for (const k of tiles) assert.equal(pixels(masked, { x: (k % C.W) * C.T, y: ((k / C.W) | 0) * C.T, w: C.T, h: C.T }), 0);
});

check('precipitation drawing preserves saved state and consumes no randomness', () => {
  scene(); layer(3, -12);
  const digest = () => createHash('sha256').update(serialize(capture())).digest('hex');
  const before = digest(), random = Math.random;
  Math.random = () => { throw new Error('drawing consumed simulation randomness'); };
  try { draw(); } finally { Math.random = random; }
  assert.equal(digest(), before);
});

check('cloudless physical weather creates no rain, snow, hail or lightning', () => {
  scene();
  for (let i = 0; i < 100; i++) Air.precipitate();
  assert.equal(liq.reduce((sum, amount) => sum + amount, 0), 0);
  assert.ok(!solid.includes(C.SNOW)); assert.equal(Air.bolts.length, 0); assert.equal(Air.strikes.length, 0);
});

check('natural lightning requires a heavy storm and begins in its cloud', () => {
  scene(); const cx = 8, cy = 4, c = cy * Air.AW + cx, random = Math.random;
  Math.random = () => 0;
  try {
    Air.cloud[c] = 500; Air.precipitate();
    assert.equal(Air.bolts.length, 0, 'a light column cannot strike even when the chance succeeds');
    Air.cloud[c] = 1500; Air.precipitate();
    assert.ok(Air.bolts.length > 0, 'heavy warm storm can strike');
    for (const bolt of Air.bolts) {
      assert.equal(bolt.y0, cy * Air.CELL * C.T);
      assert.ok(bolt.x >= cx * Air.CELL * C.T && bolt.x < (cx + 1) * Air.CELL * C.T);
      assert.ok(bolt.y1 >= bolt.y0 && bolt.y1 < C.PH);
    }
  } finally { Math.random = random; }
});

console.log(JSON.stringify({ ok: failed === 0, checks, failed, note: 'Cloud sources, source weather, world anchoring, clipping, purity and physical lightning controls' }));
process.exit(failed ? 1 : 0);
