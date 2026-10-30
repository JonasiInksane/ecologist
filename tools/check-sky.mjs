// Pixel parity for the cloud renderer against the preceding per-pixel occupancy loop.
// --bench also compares both loops on the same seeded, static storm view; it is not a frame-rate test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { C, Wd, clearWorld } from './test-support.mjs';
import { drawClouds, openSky } from '../js/render/sky.js';
import { AW, AH, CELL, cloud, open } from '../js/air.js';
import { blend, frame } from '../js/canvas.js';
import { sunHeight } from '../js/daynight.js';
import { seededRandom, vnoise } from '../js/util.js';
import { capture } from '../js/snapshot.js';

const { VIEW, S } = Wd;
function referenceCloudCell(cx, cy) { return cy < 0 || cy >= AH ? 0 : cloud[cy * AW + ((cx % AW) + AW) % AW]; }
function referenceCloudBase(px, py) {
  const gx = px / (CELL * C.T) - 0.5, gy = py / (CELL * C.T) - 0.5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  return (referenceCloudCell(ix, iy) * (1 - fx) * (1 - fy) + referenceCloudCell(ix + 1, iy) * fx * (1 - fy) +
    referenceCloudCell(ix, iy + 1) * (1 - fx) * fy + referenceCloudCell(ix + 1, iy + 1) * fx * fy) / 255;
}
function referenceClouds(time) {
  const h = sunHeight(), day = Math.max(0.3, Math.min(1, (h + 0.25) / 0.5)), cs = CELL * C.T;
  const cx0 = Math.max(0, (VIEW.x / cs | 0) - 1), cx1 = Math.min(AW - 1, ((VIEW.x + VIEW.w) / cs | 0) + 1);
  const cy0 = Math.max(0, (VIEW.y / cs | 0) - 1), cy1 = Math.min(AH - 1, ((VIEW.y + VIEW.h) / cs | 0) + 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const y = cy + dy, x = cx + dx;
      if (y >= 0 && y < AH && x >= 0 && x < AW) near = Math.max(near, cloud[y * AW + x]);
    }
    if (near < 40) continue;
    const fog = cy + 1 < AH && open[(cy + 1) * AW + cx] < 0.5;
    for (let py = cy * cs; py < cy * cs + cs; py++) {
      if (py < VIEW.y || py >= VIEW.y + VIEW.h) continue;
      for (let px = cx * cs; px < cx * cs + cs; px++) {
        if (px < VIEW.x || px >= VIEW.x + VIEW.w || !openSky(px, py)) continue;
        const base = referenceCloudBase(px, py);
        const edge = Math.abs(base - 0.25) <= 0.150000000001 || Math.abs(base - 0.6) <= 0.150000000001 || (!fog && Math.abs(base - 1.6) <= 0.150000000001);
        const d = edge ? base + (vnoise(px / 22 + time * 0.03, py / 14, 7) - 0.5) * 0.3 : base;
        if (d < 0.25) continue;
        if (fog) { blend(py * C.PW + px, 222 * day, 228 * day, 236 * day, d > 0.6 ? 0.5 : 0.3); continue; }
        if (d > 1.6) blend(py * C.PW + px, 118 * day, 124 * day, 138 * day, 0.93);
        else if (d > 0.6) blend(py * C.PW + px, 238 * day, 242 * day, 248 * day, 0.9);
        else blend(py * C.PW + px, 208 * day, 215 * day, 226 * day, 0.62);
      }
    }
  }
}
const random = seededRandom(73), background = new Uint32Array(frame.length);
for (let k = 0; k < background.length; k++) background[k] = (0xff000000 | (random() * 0x1000000)) >>> 0;
let checks = 0;
function parity(time, label) {
  frame.set(background); referenceClouds(time); const expected = frame.slice();
  frame.set(background); drawClouds(time);
  assert.deepEqual(frame, expected, label); checks++;
}
clearWorld(7); Wd.under.fill(0); S.timeMode = 'day';
Object.assign(VIEW, { x: 31, y: 17, w: 320, h: 224 });
for (const fog of [false, true]) for (const density of [0, 40, 25.5, 63.75, 102, 114.75, 153, 191.25, 369.75, 408, 446.25, 1260]) {
  open.fill(fog ? 0 : 1); cloud.fill(density);
  parity(density * 0.73, `fog=${fog}, density=${density}`);
}
for (const seed of [7, 73, 31337]) for (const [x, y] of [[0, 0], [31, 17], [31.25, 17.75], [C.PW - 320, C.PH - 224]]) for (const fog of [false, true]) {
  clearWorld(seed); S.seed = seed; S.timeMode = seed === 73 ? 'night' : 'cycle'; S.tick = seed;
  Object.assign(VIEW, { x, y, w: 320, h: 224 });
  for (let k = 0; k < cloud.length; k++) cloud[k] = random() * 1300;
  open.fill(fog ? 0 : 1);
  for (let k = 0; k < C.W * C.H; k++) {
    const mask = random(); Wd.under[k] = mask < 0.1 ? 1 : 0;
    Wd.solid[k] = mask >= 0.1 && mask < 0.2 ? C.STONE : 0;
    Wd.liq[k] = mask >= 0.2 && mask < 0.3 ? 1 : 0;
  }
  parity(seed * 0.73, `seed=${seed}, view=${x},${y}, fog=${fog}, mixed blockers`);
}
Object.assign(VIEW, { x: 0, y: 0, w: C.PW, h: C.PH });
for (let k = 0; k < open.length; k++) open[k] = random() < 0.5 ? 0 : 1;
parity(123.45, 'all world pixel columns and rows, mixed fog and blockers');
Object.assign(VIEW, { x: 1536.25, y: 384.75, w: 320.5, h: 224.5 });
parity(77.25, 'middle-world fractional view origin and dimensions');
const digest = () => createHash('sha256').update(serialize(capture())).digest('hex');
const before = digest(); drawClouds(123.45);
assert.equal(digest(), before, 'cloud drawing does not mutate saved simulation state'); checks++;
console.log(JSON.stringify({ ok: true, checks, note: 'Exact full-frame parity for thresholds, fog, day/night, every world row/column, fractional views and terrain/liquid blockers' }));
if (process.argv.includes('--bench')) {
  clearWorld(7); Wd.under.fill(0); S.timeMode = 'day'; S.seed = 7;
  Object.assign(VIEW, { x: 31, y: 17, w: 1024, h: 576 });
  open.fill(1); cloud.fill(1260);
  const times = { referenceMs: [], optimizedMs: [] };
  for (let round = 0; round < 6; round++) for (const [name, draw] of round % 2 ? [['optimizedMs', drawClouds], ['referenceMs', referenceClouds]] : [['referenceMs', referenceClouds], ['optimizedMs', drawClouds]]) {
    const start = performance.now();
    for (let i = 0; i < 20; i++) draw((round * 20 + i) / 60);
    if (round) times[name].push((performance.now() - start) / 20);
  }
  console.log(JSON.stringify({ type: 'cloud-loop-benchmark', seed: 7, framesPerSample: 20, ...times,
    note: 'Interleaved static cloud-loop timing, excluding first warmup pair; not full rendering or browser responsiveness' }));
}
process.exit(0);
