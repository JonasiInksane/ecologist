// Momentum: each tile remembers how fast its liquid is moving sideways (vel, in tiles per tick, -1 to 1). A sloping
// surface speeds it up towards the low side, thick liquids slow it down, and moving liquid keeps going: it carries
// part of itself into the next tile (over an edge only in big parcels), passes its push on through a full tile,
// and runs up walls before bouncing back off them. That gives waves that slosh, jets from pumps and springs, splashes
// where falls land, and whirlpools at drains.
import { CHUNK, DRAIN, H, T, W } from './config.js';
import { LIQ, VISC_TEMP, viscAt } from './liquids.js';
import { carryHeat } from './sim.js';
import { CW, S, awake, devices, drop, flux, liq, solid, temp, typ, vel, wake } from './world.js';

const ACCEL = 0.12, BOUNCE = 0.4, MIN_V = 0.03, CARRY = 0.5, SPLASH = 0.1, MAX_SPLASH = 0.8, DEAD_ZONE = 16;
const JET = 0.9, RUN_UP = 0.2, CHUNK_OFF = 96, DRAIN_PULL = 0.04, DRAIN_REACH = 5;
const moved = new Uint32Array(W * H);
const whirlpools = [];   // { x, y } pixel centres of active drains with liquid around them, rebuilt every tick

// How high liquid t stands in side tile k; a wall counts as level with the tile itself (self).
function sideLevel(k, t, self) {
  if (solid[k]) return self;
  if (!liq[k]) return 0;
  return typ[k] === t ? liq[k] : 255;
}
// Whether liquid t in tile k rests on something in its gravity direction (g), rather than falling freely: a block,
// or liquid it can't fall into that isn't falling itself.
function landed(k, y, t, g = 1) {
  if (g > 0 ? y === H - 1 : y === 0) return true;
  const b = k + W * g;
  return !!solid[b] || (liq[b] > 0 && (typ[b] !== t || liq[b] === 255) && drop[b] === 0);
}
function clampV(v) { return v > 1 ? 1 : v < -1 ? -1 : v; }

function momentumTick() {
  if (!S.momentum) return;
  drainPull();
  for (let y = H - 1; y >= 0; y--) {
    const crow = ((y / CHUNK) | 0) * CW, ltr = ((S.tick + y) & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      const k = y * W + x, a = liq[k];
      if (!a) { vel[k] = 0; continue; }
      if (!awake[crow + ((x / CHUNK) | 0)] || moved[k] === S.tick) continue;
      const t = typ[k], L = LIQ[t];
      let v = vel[k];
      // a fall that just landed splashes out sideways; only resting liquid feels the slope of its surface
      const rests = landed(k, y, t, L.grav);
      if (L.grav > 0 && drop[k] >= 3 && rests) v += (v > 0 || (v === 0 && Math.random() < 0.5) ? 1 : -1) * Math.min(MAX_SPLASH, drop[k] * SPLASH);
      const lv = x > 0 ? sideLevel(k - 1, t, a) : a, rv = x < W - 1 ? sideLevel(k + 1, t, a) : a;
      if (rests && Math.abs(lv - rv) > DEAD_ZONE) v += (lv - rv) / 255 * ACCEL;
      v = clampV(v * (1 - 0.015 * (VISC_TEMP[t] ? viscAt(t, temp[k]) : L.visc)));
      if (Math.abs(v) < MIN_V) { vel[k] = 0; continue; }
      const dir = v > 0 ? 1 : -1, nx = x + dir, n = k + dir;
      if (nx < 0 || nx >= W || solid[n] || (liq[n] && typ[n] !== t)) { runUp(k, y, t, a, v); vel[k] = -v * BOUNCE; continue; }   // bounce off
      const room = 255 - liq[n];
      if (!room) { vel[n] = clampV(vel[n] + v * 0.5 * a / 255); vel[k] = v * 0.5; continue; }   // push on through
      vel[k] = v;
      if (!rests) continue;
      const m = Math.min(room, Math.round(a * Math.abs(v) * CARRY));
      if (!m || (!liq[n] && m < L.minSpread)) continue;   // no drops smaller than the liquid's smallest puddle
      if (m < CHUNK_OFF && !landed(n, y, t, L.grav)) continue;   // only big parcels go over an edge, never thin dribbles
      if (!liq[n]) drop[n] = drop[k];
      carryHeat(k, n, m, liq[n]);
      liq[n] += m; typ[n] = t; moved[n] = S.tick;
      liq[k] = a - m; if (!liq[k]) { typ[k] = 0; vel[k] = 0; }
      if (m >= 8) flux[n] = S.tick;
      wake(k); wake(n);
    }
  }
}
// Liquid running fast into a wall surges up it: part of the tile is lifted into the one above, and falls back.
function runUp(k, y, t, a, v) {
  const up = k - W, sp = Math.abs(v);
  if (sp < RUN_UP || y === 0 || solid[up] || (liq[up] && typ[up] !== t)) return;
  const m = Math.min(255 - liq[up], Math.round(a * sp * CARRY));
  if (m < LIQ[t].minSpread) return;
  carryHeat(k, up, m, liq[up]);
  liq[up] += m; typ[up] = t; vel[up] = v * 0.7; moved[up] = S.tick;
  liq[k] -= m; if (!liq[k]) typ[k] = 0;
  wake(up);
}
// Active drains under liquid draw it in from the sides, and are remembered as whirlpools.
function drainPull() {
  whirlpools.length = 0;
  for (const [k, d] of devices) {
    if (d.kind !== DRAIN || !d.active) continue;
    const x = k % W, y = (k / W) | 0;
    let wet = false;
    for (let dy = -DRAIN_REACH; dy <= 1; dy++) for (let dx = -DRAIN_REACH; dx <= DRAIN_REACH; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!dx || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!liq[n]) continue;
      wet = true;
      vel[n] = clampV(vel[n] - Math.sign(dx) * DRAIN_PULL);
    }
    if (wet) whirlpools.push({ x: x * T + 4, y: y * T + 4 });
  }
}
// Mixes speed v into tile n as `put` units of liquid arrive on top of `had` units.
function addVel(n, v, had, put) { vel[n] = (vel[n] * had + v * put) / (had + put); }

export { moved, ACCEL, BOUNCE, MIN_V, CARRY, SPLASH, MAX_SPLASH, DEAD_ZONE, JET, RUN_UP, CHUNK_OFF, DRAIN_PULL, DRAIN_REACH, whirlpools, sideLevel, landed, clampV, momentumTick, runUp, drainPull, addVel };
