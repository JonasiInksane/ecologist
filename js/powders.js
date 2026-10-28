// Powders: sand, salt, sugar, baking soda and snow are blocks that fall, slide off each other into slopes, and sink
// through liquids lighter than themselves. Sand turns to mud in water and to glass in lava.
// A powder tile holds an amount, like a liquid (held: 1-255, or 0 for a full tile, as placed and generated powders
// are): a pinch of salt left by drying brine is a thin layer. A powder falling onto the same powder tops it up, so
// layers build into piles, and only heaped tiles (SLIDE_AT or more) slide off into slopes; thin layers lie where they
// land.
import { GLASS, H, LAVA, MUD, NBLOCK, SALT, SAND, SNOW, T, W, WATER } from './config.js';
import { RHO } from './liquids.js';
import { puff } from './particles.js';
import { clearSol, copySol } from './solutes.js';
import { S, bodies, held, liq, markDirty, solid, temp, typ, wake } from './world.js';
import { SODA, SUGAR } from './config.js';

const POWDER = new Uint8Array(NBLOCK), POWDER_RHO = new Float32Array(NBLOCK);
POWDER[SAND] = 1; POWDER_RHO[SAND] = 2.5;
POWDER[SALT] = 1; POWDER_RHO[SALT] = 2.2;
POWDER[SODA] = 1; POWDER_RHO[SODA] = 2.2;
POWDER[SUGAR] = 1; POWDER_RHO[SUGAR] = 1.6;
POWDER[SNOW] = 1; POWDER_RHO[SNOW] = 0.3;   // light enough to float on water, where it melts
const SLIDE_AT = 128, THIN = 96;   // amounts: heaped enough to slide; too thin for a body to stand on

// A powder tile's amount, 1-255.
function grains(k) { return held[k] || 255; }
function setGrains(k, a) { held[k] = a >= 255 ? 0 : a; }
// Lays a units of powder b in tile k (open, or holding the same powder with room). Returns what didn't fit.
function deposit(k, b, a) {
  if (a <= 0) return 0;
  if (!solid[k] && !liq[k]) { const m = Math.min(255, a); solid[k] = b; setGrains(k, m); markDirty(k % W, (k / W) | 0); return a - m; }
  if (solid[k] !== b) return a;
  const m = Math.min(a, 255 - grains(k));
  if (m > 0) { setGrains(k, grains(k) + m); markDirty(k % W, (k / W) | 0); }
  return a - m;
}

function hasBody(k) {
  const x = (k % W) * T, y = ((k / W) | 0) * T;
  return bodies.some(b => b.x < x + T && b.x + b.w > x && b.y < y + T && b.y + b.h > y);
}
// A powder can move into an open tile, or one holding a liquid lighter than itself (which takes its old place).
function canEnter(k, b) { return !solid[k] && (!liq[k] || RHO[typ[k]] < POWDER_RHO[b]) && !hasBody(k); }
function move(k, n) {
  const b = solid[k], tk = temp[k];
  solid[n] = b; solid[k] = 0; held[n] = held[k]; held[k] = 0;
  liq[k] = liq[n]; typ[k] = typ[n]; temp[k] = liq[n] ? temp[n] : temp[k];
  if (liq[n]) copySol(n, k);
  liq[n] = 0; typ[n] = 0; temp[n] = tk;
  markDirty(k % W, (k / W) | 0); markDirty(n % W, (n / W) | 0);
}
function powderTick() {
  for (let y = H - 2; y >= 0; y--) {
    const ltr = ((S.tick + y) & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i, k = y * W + x, b = solid[k];
      if (!POWDER[b]) continue;
      if (b === SAND && sandReact(k, x, y)) continue;
      if (canEnter(k + W, b)) { move(k, k + W); continue; }
      const a = grains(k);
      if (solid[k + W] === b && grains(k + W) < 255) {   // tops up the same powder under it
        const m = Math.min(a, 255 - grains(k + W));
        setGrains(k + W, grains(k + W) + m);
        if (a > m) setGrains(k, a - m); else { solid[k] = 0; held[k] = 0; }
        markDirty(x, y); markDirty(x, y + 1);
        continue;
      }
      if (a < SLIDE_AT || Math.random() < 0.5) continue;   // thin layers lie where they land; heaps slide more slowly than they fall
      const s = Math.random() < 0.5 ? -1 : 1;
      for (const d of [s, -s]) {
        const nx = x + d;
        if (nx < 0 || nx >= W) continue;
        if (!solid[k + d] && !liq[k + d] && canEnter(k + W + d, b)) { move(k, k + W + d); break; }
      }
    }
  }
}
// Sand soaks up touching water into mud, and melts into glass against lava.
function sandReact(k, x, y) {
  for (let d = 0; d < 4; d++) {
    const o = d === 0 ? (y > 0 ? k - W : -1) : d === 1 ? (x > 0 ? k - 1 : -1) : d === 2 ? (x < W - 1 ? k + 1 : -1) : k + W;
    if (o < 0 || !liq[o]) continue;
    if (typ[o] === LAVA && Math.random() < 0.05) { solid[k] = GLASS; markDirty(x, y); puff(k, 'spark'); return true; }
    if (typ[o] === WATER && liq[o] >= 64 && Math.random() < 0.01) {
      const a = grains(k), drink = Math.max(1, Math.round(64 * a / 255));
      solid[k] = 0; held[k] = 0; liq[k] = Math.max(1, Math.round(200 * a / 255)); typ[k] = MUD; clearSol(k); markDirty(x, y);
      liq[o] -= drink; if (!liq[o]) typ[o] = 0;
      wake(o);
      return true;
    }
  }
  return false;
}

export { SLIDE_AT, THIN, grains, setGrains, deposit, POWDER, POWDER_RHO, hasBody, canEnter, move, powderTick, sandReact };
