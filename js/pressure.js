// Pressure (communicating vessels; on unless the Pressure button turns it off). Liquid resting on a full body of the
// same liquid searches through that body for an open tile lower than itself and moves there, so the far arm of a U-bend
// rises to match. Only awake chunks are searched for surfaces: a body that has levelled out falls asleep, and digging
// into it or pouring into it wakes it again.
import { H, W } from './config.js';
import { LIQ } from './liquids.js';
import { nbr } from './pumps.js';
import { carryHeat } from './sim.js';
import { CW, S, awake, liq, solid, typ, wake, wakeAll } from './world.js';
import { CHUNK, FERRO } from './config.js';
import { MAGNET_REACH, magnets } from './materials.js';








const seen = new Uint32Array(W * H), queue = new Int32Array(W * H);
// A search that finds nowhere lower marks its body: for LEVEL_FOR ticks, no surface at that row or lower is searched
// from (a higher surface still is: it may have somewhere to go).
const levelUntil = new Uint32Array(W * H), levelRow = new Uint16Array(W * H);
const LEVEL_FOR = 120;
let pass = 0;
const SEARCH_LIMIT = 2000, MOVE = 32, SAMPLES = 32;

let wasOn = false;
// Ferrofluid within reach of a working magnet is held up by it, so pressure leaves it be.
function magnetHeld(k) {
  const x = k % W, y = (k / W) | 0;
  return magnets.some(m => Math.abs(m % W - x) <= MAGNET_REACH && Math.abs(((m / W) | 0) - y) <= MAGNET_REACH);
}
function pressureTick() {
  if (!wasOn) { wasOn = true; wakeAll(); }   // just turned on: water that settled without it gets another look
  const surfaces = [];
  for (let c = 0; c < awake.length; c++) {
    if (!awake[c]) continue;
    const cx = (c % CW) * CHUNK, cy = ((c / CW) | 0) * CHUNK;
    for (let y = Math.max(1, cy); y < Math.min(H - 1, cy + CHUNK); y++) for (let x = cx, k = y * W + x; x < cx + CHUNK; x++, k++) {
      const t = typ[k];
      if (!liq[k] || LIQ[t].grav < 0) continue;
      if (liq[k + W] === 255 && typ[k + W] === t && !(liq[k - W] && typ[k - W] === t) && !(levelUntil[k + W] > S.tick && y >= levelRow[k + W]) && !(t === FERRO && magnetHeld(k))) surfaces.push(k);
    }
  }
  for (let i = 0; i < SAMPLES && surfaces.length; i++) push(surfaces[(Math.random() * surfaces.length) | 0]);
}
function push(s) {
  const t = typ[s], sy = (s / W) | 0;
  if (!liq[s]) return;
  pass++;
  let head = 0, tail = 0;
  queue[tail++] = s + W; seen[s + W] = pass; seen[s] = pass;
  while (head < tail && tail < SEARCH_LIMIT) {
    const k = queue[head++], x = k % W, y = (k / W) | 0;
    for (let d = 0; d < 4; d++) {
      const n = nbr(x, y, d);
      if (n < 0 || seen[n] === pass || solid[n]) continue;
      seen[n] = pass;
      if (liq[n] === 255 && typ[n] === t) { queue[tail++] = n; continue; }
      if ((n / W | 0) > sy + 1 && (!liq[n] || typ[n] === t)) {   // at least two rows lower, so nearly level water isn't stirred
        const mv = Math.min(liq[s], 255 - liq[n], MOVE);
        carryHeat(s, n, mv, liq[n]);
        liq[n] += mv; typ[n] = t;
        liq[s] -= mv; if (!liq[s]) typ[s] = 0;
        wake(s); wake(n);
        return;
      }
    }
  }
  if (head >= tail) for (let i = 0; i < tail; i++) { levelUntil[queue[i]] = S.tick + LEVEL_FOR; levelRow[queue[i]] = sy; }   // searched it all: level up to here
}

// Called while pressure is off, so turning it on again wakes the world.
function pressureOff() { wasOn = false; }
// A new or restored world: nothing from the last one (which bodies were level, at which ticks) carries over.
function resetPressure() { wasOn = false; levelUntil.fill(0); }

export { resetPressure, pressureOff, levelUntil, levelRow, LEVEL_FOR, seen, queue, pass, SEARCH_LIMIT, MOVE, SAMPLES, pressureTick, push };
