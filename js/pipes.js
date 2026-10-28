// Pipes: touching pipe tiles (plain pipes, valves and filters) form a network, closed along its length. The open tiles
// beside its end tiles are its mouths. Liquid moves through the network from the mouth with the highest liquid surface
// to the lowest mouth that can take it, like communicating vessels. Valves pass only while open; filters pass only
// their own liquid, so a filtered branch pulls one liquid out of a mix.
import { FILTER, H, PIPE, VALVE, W } from './config.js';
import { nbr } from './pumps.js';
import { carryHeat } from './sim.js';
import { S, devices, flux, liq, solid, typ, wake } from './world.js';

const PIPE_RATE = 96, MAX_SOURCES = 4, MIN_DROP = 32;
const netSeen = new Uint32Array(W * H), walkSeen = new Uint32Array(W * H), mouthSeen = new Uint32Array(W * H);
const parent = new Int32Array(W * H), pipeQueue = new Int32Array(W * H);
const pipeShow = new Uint8Array(W * H), pipeTick = new Uint32Array(W * H);   // last liquid moved through each pipe tile
let pipeGen = 0, walkPass = 0;

function isPipe(b) { return b === PIPE || b === VALVE || b === FILTER; }
function passes(k, t) {
  const b = solid[k];
  if (b === PIPE) return true;
  const d = devices.get(k);
  if (b === VALVE) return !!(d && d.open);
  return b === FILTER && !!d && d.liquid === t;
}
function pipeLinks(x, y) {
  let n = 0;
  for (let d = 0; d < 4; d++) { const o = nbr(x, y, d); if (o >= 0 && isPipe(solid[o])) n++; }
  return n;
}
// Height of the liquid surface standing on tile k; smaller is higher. An empty tile's level is its floor.
function level(k) {
  if (!liq[k]) return ((k / W) | 0) * 256 + 255;
  let top = k;
  while (top >= W && liq[top - W] && typ[top - W] === typ[k]) top -= W;
  return ((top / W) | 0) * 256 + 255 - liq[top];
}

// Where liquid t pushed into mouth n ends up: the mouth itself, or the top of the full column standing on it.
function fillPoint(n, t) {
  let k = n;
  while (liq[k] === 255 && typ[k] === t) { if (k < W || solid[k - W]) return -1; k -= W; }
  return !liq[k] || typ[k] === t ? k : -1;
}
function pipesTick() {
  pipeGen++;
  for (let s = 0; s < W * H; s++) {
    if (!isPipe(solid[s]) || netSeen[s] === pipeGen) continue;
    // gather the network and its mouths
    const mouths = [];
    let head = 0, tail = 0;
    pipeQueue[tail++] = s; netSeen[s] = pipeGen;
    while (head < tail) {
      const k = pipeQueue[head++], x = k % W, y = (k / W) | 0, end = pipeLinks(x, y) <= 1;
      for (let d = 0; d < 4; d++) {
        const n = nbr(x, y, d);
        if (n < 0) continue;
        if (isPipe(solid[n])) { if (netSeen[n] !== pipeGen) { netSeen[n] = pipeGen; pipeQueue[tail++] = n; } }
        else if (end && !solid[n] && mouthSeen[n] !== pipeGen) { mouthSeen[n] = pipeGen; mouths.push([n, k]); }
      }
    }
    if (mouths.length < 2) continue;
    const sources = mouths.filter(m => liq[m[0]] >= 8).sort((a, b) => level(a[0]) - level(b[0])).slice(0, MAX_SOURCES);
    for (const [src, entry] of sources) if (liq[src]) flowFrom(src, entry);
  }
}
// Moves liquid from mouth src (entering at pipe tile entry) to the lowest reachable mouth that can take it.
function flowFrom(src, entry) {
  const t = typ[src], from = level(src);
  if (!passes(entry, t)) return;
  walkPass++;
  let head = 0, tail = 0, best = -1, bestPipe = -1, bestLevel = from + MIN_DROP;
  pipeQueue[tail++] = entry; walkSeen[entry] = walkPass; parent[entry] = -1;
  while (head < tail) {
    const k = pipeQueue[head++], x = k % W, y = (k / W) | 0, end = pipeLinks(x, y) <= 1;
    for (let d = 0; d < 4; d++) {
      const n = nbr(x, y, d);
      if (n < 0 || n === src) continue;
      if (isPipe(solid[n])) {
        if (walkSeen[n] !== walkPass && passes(n, t)) { walkSeen[n] = walkPass; parent[n] = k; pipeQueue[tail++] = n; }
      } else if (end && !solid[n]) {
        const f = fillPoint(n, t);
        if (f < 0) continue;
        const lv = level(f);
        if (lv > bestLevel) { bestLevel = lv; best = f; bestPipe = k; }
      }
    }
  }
  if (best < 0) return;
  const mv = Math.min(PIPE_RATE, liq[src], 255 - liq[best]);
  carryHeat(src, best, mv, liq[best]);
  liq[best] += mv; typ[best] = t; flux[best] = S.tick;
  liq[src] -= mv; if (!liq[src]) typ[src] = 0;
  wake(src); wake(best);
  for (let k = bestPipe; k >= 0; k = parent[k]) { pipeShow[k] = t; pipeTick[k] = S.tick; }
}

export { PIPE_RATE, MAX_SOURCES, MIN_DROP, pipeShow, pipeTick, isPipe, passes, pipeLinks, level, fillPoint, pipesTick, flowFrom };
