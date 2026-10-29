// Power networks: metal blocks, stormwater and brine carry power from the switches and generators that touch them to
// the machines they touch. Networks are rebuilt every tick outward from the sources, so a conductor only counts when
// a source touches it; a network is live while any of its sources is on. Live liquid shocks slime and the explorer.
// Power fades with distance: every conductor tile it passes through costs some of its strength (copper least, liquid
// most), and tiles it can't strengthAt with strength left aren't live, so far machines need a closer source.
import { H, METAL, NSOL, SLIME, SOL_O2, SOL_SALT, STORM, W, WATER } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { nbr } from './pumps.js';
import { liq, sol, solid, temp, typ, wake } from './world.js';
import { ALUMINIUM, CHLORINE, COPPER, GOLD, HYDROGEN, OXYGEN, PATINA, QUICK, SOL_BASE, ZINC } from './config.js';
import { mixSol, removeCarrier } from './solutes.js';
import { OXYGEN_REFERENCE, MG_PER_UNIT } from './oxygen.js';

const BRINE_SALT = 60, NET_LIMIT = 8000;
const netOf = new Int32Array(W * H), netStamp = new Uint32Array(netOf.length), netQueue = new Int32Array(netOf.length);
const nets = [];   // { live, tiles }
let netGen = 0;
const STRENGTH = 120;   // a source's strength; each conductor tile costs 1 (copper), 2 (metal) or 3 (brine, stormwater)
const strengthAt = new Int16Array(W * H), reachStamp = new Uint32Array(W * H);   // strength left at each tile this tick
const buckets = Array.from({ length: STRENGTH + 1 }, () => []), seeds = [];
let reachGen = 0;

function conductive(k) {
  const b = solid[k];
  if (b) return b === METAL || b === COPPER || b === ALUMINIUM || b === ZINC || b === GOLD || b === PATINA;   // patina is skin-deep: the copper under it still conducts
  if (liq[k] >= 32 && typ[k] === QUICK) return true;   // mercury is a metal
  if (liq[k] < 32) return false;
  return typ[k] === STORM || (typ[k] === WATER && sol[k * NSOL + SOL_SALT] >= BRINE_SALT);
}
function netAt(k) { return netStamp[k] === netGen ? netOf[k] : -1; }
function beginNets() { netGen++; nets.length = 0; seeds.length = 0; reachGen++; }
function flood(s) {
  const id = nets.length, tiles = [];
  let head = 0, tail = 0;
  netQueue[tail++] = s; netStamp[s] = netGen; netOf[s] = id;
  while (head < tail) {
    const k = netQueue[head++], x = k % W, y = (k / W) | 0;
    tiles.push(k);
    for (let d = 0; d < 4 && tail < NET_LIMIT; d++) {
      const n = nbr(x, y, d);
      if (n < 0 || netStamp[n] === netGen || !conductive(n)) continue;
      netStamp[n] = netGen; netOf[n] = id; netQueue[tail++] = n;
    }
  }
  nets.push({ live: false, tiles });
  return id;
}
// Source tile k labels the networks it touches, and makes them live if it is on.
function feed(k, on) {
  const x = k % W, y = (k / W) | 0;
  for (let d = 0; d < 4; d++) {
    const n = nbr(x, y, d);
    if (n < 0) continue;
    let id = netAt(n);
    if (id < 0) { if (!conductive(n)) continue; id = flood(n); }
    if (on) { nets[id].live = true; seeds.push(n); }
  }
}
function cost(k) { const b = solid[k]; return b === COPPER || b === PATINA || b === GOLD || b === ALUMINIUM ? 1 : b === METAL || b === ZINC ? 2 : 3; }   // copper, gold and aluminium conduct best
function relax(k, left) {
  if (left < 0 || (reachStamp[k] === reachGen && strengthAt[k] >= left)) return;
  reachStamp[k] = reachGen; strengthAt[k] = left; buckets[left].push(k);
}
// Spreads the power from the live sources' tiles (seeds) through their networks, strongest first, so each tile gets
// the most strength any source can bring it. Run again after more sources are fed; it starts over each time.
function spread() {
  reachGen++;
  for (const k of seeds) relax(k, STRENGTH - cost(k));
  for (let left = STRENGTH; left >= 0; left--) {
    const b = buckets[left];
    for (let i = 0; i < b.length; i++) {
      const k = b[i];
      if (strengthAt[k] !== left) continue;   // reached more strongly since
      const x = k % W, y = (k / W) | 0;
      for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && netAt(n) >= 0) relax(n, left - cost(n)); }
    }
    b.length = 0;
  }
}
// A lightning strike powers the conductor it hits at full strength for a moment.
function seed(k) { seeds.push(k); }
// Whether any tile of network id touching tile k has power reaching it.
function liveFrom(k, id) {
  const x = k % W, y = (k / W) | 0;
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && netAt(n) === id && charged(n)) return true; }
  return false;
}
// The share of a source's strength left at tile k (0 where no power reaches).
function powerLeft(k) { return charged(k) ? strengthAt[k] / STRENGTH : 0; }
// The networks touching tile k, each once.
function netsTouching(k) {
  const x = k % W, y = (k / W) | 0, out = [];
  for (let d = 0; d < 4; d++) {
    const n = nbr(x, y, d), id = n < 0 ? -1 : netAt(n);
    if (id >= 0 && !out.includes(id)) out.push(id);
  }
  return out;
}
function charged(k) { return reachStamp[k] === reachGen && netAt(k) >= 0; }
// Live liquid kills slime it touches and throws off sparks.
function shockTick() {
  for (const net of nets) {
    if (!net.live) continue;
    for (let i = 0; i < 6; i++) {
      const k = net.tiles[(Math.random() * net.tiles.length) | 0];
      if (solid[k] || !charged(k)) continue;
      const x = k % W, y = (k / W) | 0;
      for (let d = 0; d < 4; d++) {
        const n = nbr(x, y, d);
        if (n >= 0 && liq[n] && typ[n] === SLIME) { liq[n] = 0; typ[n] = 0; wake(n); puff(n, 'zap'); }
      }
      if (Math.random() < 0.02 && y > 0 && !liq[k - W] && !solid[k - W]) puff(k, 'zap');
    }
  }
}

// Electrolysis: power splits the water it runs through (brine) or touches (a live metal or copper electrode in fresh
// water) into hydrogen and oxygen. Each split takes SPLIT units of water and bubbles them up as one gas, hydrogen two
// times in three as in real water, so no water is made or lost. A bubble rises through the water and any other gas
// over it to the first tile that's empty or holds the same gas. What's dissolved stays
// behind, so brine gets saltier as it's split.
const SPLIT = 8, SPLIT_TRIES = 2;
const CHLORINE_SALT = 120;   // brine saltier than this gives chlorine, more the saltier
const ELECTROLYSIS_CONTENTS = new Float64Array(NSOL);   // reaction gas has no aqueous dissolved components
function electrolysis() {
  for (const net of nets) {
    if (!net.live) continue;
    for (let i = 0; i < SPLIT_TRIES; i++) {
      const k = net.tiles[(Math.random() * net.tiles.length) | 0];
      if (!charged(k)) continue;
      let w = k;
      if (solid[k]) { const n = nbr(k % W, (k / W) | 0, (Math.random() * 4) | 0); w = n; }   // an electrode: a random side
      if (w < 0 || solid[w] || !liq[w] || typ[w] !== WATER) continue;
      split(w);
    }
  }
}
// Splits SPLIT units of the water in tile w into a bubble above it, if the bubble finds room.
function split(w) {
  if (w < 0 || w >= W * H || solid[w] || typ[w] !== WATER || liq[w] <= 1) return 0;
  // two parts hydrogen to one of oxygen; strong brine gives chlorine instead of oxygen, and the water turns to lye
  // (the chlor-alkali process). Weak brine still gives mostly oxygen.
  const salt = sol[w * NSOL + SOL_SALT], cl = Math.max(0, Math.min(1, (salt - CHLORINE_SALT) / (255 - CHLORINE_SALT)));
  const gas = Math.random() < 2 / 3 ? HYDROGEN : Math.random() < cl ? CHLORINE : OXYGEN;
  let u = w - W;
  while (u >= 0 && !solid[u] && liq[u] && (typ[u] === WATER || (LIQ[typ[u]].gas && (typ[u] !== gas || liq[u] === 255)))) u -= W;
  if (u < 0 || solid[u] || (liq[u] && typ[u] !== gas)) return 0;
  // Reserve product space before withdrawing water. removeCarrier retains every component, including actual
  // dissolved oxygen (whose stored field is a signed deficit), and leaves the final residue-holding unit.
  const m = removeCarrier(w, Math.min(SPLIT, 255 - liq[u]));
  if (!m) return 0;
  ELECTROLYSIS_CONTENTS[SOL_O2] = OXYGEN_REFERENCE / MG_PER_UNIT;
  mixSol(sol, u * NSOL, liq[u], ELECTROLYSIS_CONTENTS, 0, m);
  if (!liq[u]) temp[u] = temp[w];
  liq[u] += m; typ[u] = gas;
  if (gas === CHLORINE) {
    const p = w * NSOL, converted = Math.min(sol[p + SOL_SALT], 2 * m / SPLIT);
    sol[p + SOL_SALT] -= converted; sol[p + SOL_BASE] += converted;   // existing coarse salt/base proxy; no clipping loss
  }
  wake(w); wake(u);
  if (Math.random() < 0.3) puff(w, 'bubble');
  return m;
}

export { STRENGTH, strengthAt, cost, spread, seed, liveFrom, powerLeft, SPLIT, SPLIT_TRIES, electrolysis, split, BRINE_SALT, NET_LIMIT, netOf, netStamp, netQueue, nets, conductive, netAt, beginNets, flood, feed, netsTouching, charged, shockTick };
