// Splashes, steam, smoke, sparks, bubbles and other short-lived pixels. A bubble rises through liquid and pops when it
// reaches a tile without any (or with only gas).
import { sfx } from './audio.js';
import { H, T, W } from './config.js';
import { LIQ } from './liquids.js';
import { hex, pack } from './util.js';
import { liq, solid, typ } from './world.js';












const parts = [];
const PUFF = {
  steam: { c: pack(hex('#e6eef5')), n: 4, a: 0.55, g: -0.004, vy: -0.4, life: 50, float: true },
  smoke: { c: pack(hex('#8d8792')), n: 4, a: 0.6,  g: -0.004, vy: -0.35, life: 50, float: true },
  fizz:  { c: pack(hex('#c6ff8a')), n: 3, a: 0.9,  g: -0.01, vy: -0.3, life: 30, float: true, glow: true },
  snow:  { c: pack(hex('#ffffff')), n: 4, a: 0.9,  g: 0.02,  vy: -0.5, life: 40, float: true, glow: true },
  spark: { c: pack(hex('#f0d6ff')), n: 6, a: 1,    g: 0.04,  vy: -1.2, life: 30, glow: true },
  ember: { c: pack(hex('#ffb347')), n: 1, a: 1,    g: -0.01, vy: -0.6, life: 60, float: true, glow: true },
  flame: { c: pack(hex('#ffa040')), n: 1, a: 1,    g: -0.02, vy: -0.7, life: 22, float: true, glow: true },
  mote:  { c: pack(hex('#e9d2ff')), n: 1, a: 0.9,  g: 0.004, vy: 0.15, life: 90, float: true, glow: true },
  zap:   { c: pack(hex('#c9ecff')), n: 4, a: 1,    g: 0,     vy: -0.8, life: 10, glow: true },
  blast: { c: pack(hex('#fff2b0')), n: 10, a: 1,   g: 0.06,  vy: -2.2, life: 28, glow: true },
  bubble: { c: pack(hex('#e6f4ff')), n: 1, a: 0.8, g: -0.008, vy: -0.35, life: 160, float: true, bubble: true },
};
const PUFF_SOUND = { steam: 'sizzle', fizz: 'fizz', flame: 'crackle', spark: 'chime', snow: 'tinkle', zap: 'crackle', blast: 'boom', bubble: 'blub' };
function puff(k, kind) {
  if (parts.length > 700) return;
  const f = PUFF[kind], x = k % W, y = (k / W) | 0;
  sfx(PUFF_SOUND[kind], x * T + 4, y * T + 4);
  for (let n = 0; n < f.n; n++) parts.push({ x: x * T + Math.random() * 8, y: y * T + Math.random() * 6, vx: (Math.random() - 0.5) * (f.float ? 0.5 : 1.6), vy: f.vy * (0.5 + Math.random()), g: f.g, life: f.life * (0.6 + Math.random() * 0.6), c: f.c, a: f.a, float: f.float, glow: f.glow, bubble: f.bubble });
}
// A bubble at world pixel (px, py), such as a breath.
function bubbleAt(px, py) {
  if (parts.length > 700) return;
  const f = PUFF.bubble;
  parts.push({ x: px, y: py, vx: 0, vy: f.vy, g: f.g, life: f.life, c: f.c, a: f.a, float: true, bubble: true });
}
function splash(x, y, t, amt) {
  if (parts.length > 700) return;
  sfx('splash', x * T + 4, y * T + 4, t);
  const C = LIQ[t], h = Math.round(amt * 8 / 255);
  const col = pack([C.sr, C.sg, C.sb]);
  for (let n = 0; n < 2; n++) parts.push({ x: x * T + 1 + Math.random() * 6, y: y * T + T - h - 1, vx: (Math.random() - 0.5) * 1.8, vy: -0.7 - Math.random() * 1.3 * C.flow, g: 0.14, life: 14 + Math.random() * 12, c: col, a: 0.9, glow: !!C.emit });
}
function updateParticles() {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life--;
    if (p.float) p.vx += (Math.random() - 0.5) * 0.05;
    const tx = p.x / T | 0, ty = p.y / T | 0;
    const hit = tx < 0 || tx >= W || ty < 0 || ty >= H || solid[ty * W + tx] || (!p.float && p.vy > 0 && liq[ty * W + tx] > 0 && (p.y % T) >= T - liq[ty * W + tx] * 8 / 255) ||
      (p.bubble && (!liq[ty * W + tx] || LIQ[typ[ty * W + tx]].gas || (p.y % T) < T - liq[ty * W + tx] * 8 / 255));   // a bubble pops at the surface
    if (p.life <= 0 || hit) { parts[i] = parts[parts.length - 1]; parts.pop(); }
  }
}

export { parts, PUFF, PUFF_SOUND, puff, bubbleAt, splash, updateParticles };
