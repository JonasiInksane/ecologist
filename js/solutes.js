// Dissolved contents: salt, sugar, essence and inks carried inside a liquid. Each tile has NSOL concentration channels
// (0-255) that move with the flow, slowly spread into touching tiles of the same liquid, and drive brewing.
import { CRISP, FROST, H, NSOL, SALT, SOL_BLUE, SOL_ESSENCE, SOL_RED, SOL_SALT, SOL_SILT, SOL_SUGAR, SOL_YELLOW, TONIC, W, WATER } from './config.js';
import { puff } from './particles.js';
import { liq, markDirty, sol, solid, temp, typ, wake } from './world.js';
import { GEM, SODA, SOL_ACID, SOL_BASE, CO2 } from './config.js';
import { ACIDITY } from './liquids.js';
import { DISSOLVES, fizz } from './reactions.js';
import { S, flux, held, meltAmount } from './world.js';
import { MOSS, SOL_FERT, STONE } from './config.js';
import { nbr } from './pumps.js';
import { LIGHT, SOL_ALGAE, SUGAR } from './config.js';
const DISSOLVE = 24;   // powder grains water dissolves at a time
import { sunHeight } from './daynight.js';
import { under } from './world.js';

const SOL_NAMES = ['salt', 'sugar', 'essence', 'red ink', 'yellow ink', 'blue ink', 'silt', 'acid', 'alkali', 'fertiliser', 'algae'];
const DIFFUSE = [0.01, 0.01, 0.1, 0.12, 0.12, 0.12, 0.01, 0.08, 0.08, 0.05, 0.03];   // share of a concentration difference that evens out per solute tick
// Brewing: a water tile holding at least `need` of each solute, inside the temperature range, slowly turns into `makes`.
const RECIPES = [
  { name: 'tonic', need: { [SOL_SUGAR]: 40, [SOL_ESSENCE]: 40 }, minT: 80, maxT: Infinity, makes: TONIC, fx: 'spark' },
  { name: 'frost', need: { [SOL_SALT]: 60, [SOL_ESSENCE]: 40 }, minT: -Infinity, maxT: 0, makes: FROST, fx: 'snow' },
];

// Mixes mv units of the liquid holding vector src[s..] into dst[d..], which holds `had` units. An empty tile takes it as is.
function mixSol(dst, d, had, src, s, mv) {
  if (!had) { for (let i = 0; i < NSOL; i++) dst[d + i] = src[s + i]; return; }
  const w = had + mv;
  for (let i = 0; i < NSOL; i++) if (dst[d + i] !== src[s + i]) dst[d + i] = (dst[d + i] * had + src[s + i] * mv) / w + 0.5;
}
function carrySol(src, dst, mv, had) { mixSol(sol, dst * NSOL, had, sol, src * NSOL, mv); }
function clearSol(k) { sol.fill(0, k * NSOL, k * NSOL + NSOL); }
function copySol(src, dst) { sol.copyWithin(dst * NSOL, src * NSOL, src * NSOL + NSOL); }
function swapSol(a, b) {
  for (let i = 0, p = a * NSOL, q = b * NSOL; i < NSOL; i++) { const v = sol[p + i]; sol[p + i] = sol[q + i]; sol[q + i] = v; }
}
// Salt, sugar and silt make a liquid heavier, so brine, syrup and muddy water sink under fresher water.
function heavy(k) { return sol[k * NSOL + SOL_SALT] + sol[k * NSOL + SOL_SUGAR] + sol[k * NSOL + SOL_SILT]; }
function addSol(k, i, n) { const p = k * NSOL + i; sol[p] = Math.min(255, sol[p] + n); }

function soluteTick() {
  daylight = sunHeight() > 0;
  for (let k = 0; k < W * H; k++) {
    if (!liq[k]) continue;
    const t = typ[k], x = k % W, p = k * NSOL;
    if (t === WATER) {
      // water dissolves the salt, sugar and crisp honey (caramel) it touches, a little at a time: a powder's grains
      // go into the water as so much more salt or sugar (more concentrated in less water); caramel by whole blocks
      for (let d = 0; d < 4; d++) {
        const o = d === 0 ? (k >= W ? k - W : -1) : d === 1 ? (x > 0 ? k - 1 : -1) : d === 2 ? (x < W - 1 ? k + 1 : -1) : (k < W * H - W ? k + W : -1);
        if (o < 0) continue;
        const b = solid[o], i = b === SALT ? SOL_SALT : b === SUGAR || b === CRISP ? SOL_SUGAR : -1;
        if (i < 0 || sol[p + i] > 220 || Math.random() > (b === CRISP ? 0.05 : 0.15)) continue;
        wake(k);
        if (b === CRISP) { addSol(k, i, 48); if (Math.random() < 0.3) { solid[o] = 0; markDirty(o % W, (o / W) | 0); } continue; }
        const have = held[o] || 255, take = Math.min(have, DISSOLVE);
        addSol(k, i, Math.round(take * 255 / liq[k]));
        if (have > take) held[o] = have - take; else { solid[o] = 0; held[o] = 0; }
        markDirty(o % W, (o / W) | 0);
      }
      for (const r of RECIPES) if (brews(k, r) && Math.random() < 0.05) { typ[k] = r.makes; clearSol(k); wake(k); puff(k, r.fx); break; }
      if (typ[k] === WATER) chemistry(k, x, p);
    }
    // spread into the tile to the right and the one below when they hold the same liquid
    if (x < W - 1 && liq[k + 1] && typ[k + 1] === t) diffuse(p, p + NSOL);
    if (k < W * H - W && liq[k + W] && typ[k + W] === t) diffuse(p, p + W * NSOL);
  }
}
// What dissolved acid and alkali do in water. Strength is concentration: the stronger, the faster it acts.
const CORRODE_AT = 40, FIZZ_AT = 30, SATURATED = 200, STILL = 120, GROW = 0.004, REDISSOLVE = 0.01;
function chemistry(k, x, p) {
  // acid and alkali in the same water cancel out, warming it and leaving salt
  const m = Math.min(sol[p + SOL_ACID], sol[p + SOL_BASE]);
  if (m) { sol[p + SOL_ACID] -= m; sol[p + SOL_BASE] -= m; addSol(k, SOL_SALT, m >> 1); temp[k] += m * 0.25; wake(k); if (m > 20) puff(k, 'fizz'); }
  const acid = sol[p + SOL_ACID];
  algae(k, x, p);
  if (sol[p + SOL_FERT] >= 30 && Math.random() < 0.004) {   // fertilised water greens the stone it touches with moss
    const o = nbr(x, (k / W) | 0, Math.floor(Math.random() * 4));
    if (o >= 0 && solid[o] === STONE) { solid[o] = MOSS; markDirty(o % W, (o / W) | 0); sol[p + SOL_FERT] -= 10; }
  }
  for (let d = 0; d < 4; d++) {
    const o = d === 0 ? (k >= W ? k - W : -1) : d === 1 ? (x > 0 ? k - 1 : -1) : d === 2 ? (x < W - 1 ? k + 1 : -1) : (k < W * H - W ? k + W : -1);
    if (o < 0) continue;
    if (solid[o]) {
      if (solid[o] === SODA && acid >= FIZZ_AT && Math.random() < 0.1) { fizz(o); sol[p + SOL_ACID] = Math.max(0, acid - 50); wake(k); return; }
      // dilute acid eats the same blocks strong acid does, more slowly the weaker it is, and is used up doing it
      if (acid >= CORRODE_AT && DISSOLVES[solid[o]] && Math.random() < 0.025 * acid / 255) {
        solid[o] = 0; held[o] = 0; markDirty(o % W, (o / W) | 0); puff(o, 'fizz'); sol[p + SOL_ACID] = Math.max(0, acid - 30); wake(k); return;
      }
      // salt crystals grow from still, saturated brine onto any surface, and dissolve again into fresher water
      if (sol[p + SOL_SALT] >= SATURATED && S.tick - flux[k] > STILL && Math.random() < GROW) {
        held[k] = liq[k] < 255 ? liq[k] : 0; solid[k] = GEM; liq[k] = 0; typ[k] = 0; clearSol(k); markDirty(x, (k / W) | 0); puff(k, 'spark'); return;
      }
      if (solid[o] === GEM && sol[p + SOL_SALT] < 150 && Math.random() < REDISSOLVE) {
        solid[o] = 0; liq[o] = meltAmount(o); typ[o] = WATER; clearSol(o); sol[o * NSOL + SOL_SALT] = 255; markDirty(o % W, (o / W) | 0); wake(o); return;
      }
    } else if (liq[o] && typ[o] === CO2 && sol[p + SOL_ACID] < 30 && Math.random() < 0.05) {
      // carbon dioxide dissolves into water, making it faintly acidic (sparkling water)
      liq[o] = Math.max(0, liq[o] - 16); if (!liq[o]) typ[o] = 0; addSol(k, SOL_ACID, 4); wake(o);
    }
  }
}
// Algae lives in water that gets light: daylight under open sky, or liquid light beside it. Plain water holds enough
// trace nutrients for a thin wild growth (up to ALGAE_WILD); fertiliser feeds it beyond that, faster the more there is
// already, into a bloom. In the dark, and when a bloom grows too thick, algae dies and rots back into fertiliser.
// It needs warm water too: it grows half as fast below ALGAE_COOL and dies back below ALGAE_COLD, so open lakes,
// which follow the seasons, bloom in summer and clear in winter.
const ALGAE_WILD = 24, ALGAE_CROWDED = 200, SPORE = 0.01, FED_AT = 5, ALGAE_COLD = 8, ALGAE_COOL = 15;
let daylight = false;   // set once per solute pass
function lit(k, x) {
  if (!under[k] && daylight) return true;
  for (let d = 0; d < 4; d++) { const o = nbr(x, (k / W) | 0, d); if (o >= 0 && liq[o] && typ[o] === LIGHT) return true; }
  return false;
}
// Runs for every water tile, so the common cases leave early: no algae and nothing to feed it, and the three ticks
// in four when no chance below comes up (one roll serves them all).
function algae(k, x, p) {
  const a = sol[p + SOL_ALGAE], fert = sol[p + SOL_FERT];
  if (!a && fert < FED_AT) { if (!under[k] && daylight && Math.random() < SPORE) sol[p + SOL_ALGAE] = 2; return; }
  const r = Math.random();
  if (r >= 0.25) return;
  if (!lit(k, x) || temp[k] < ALGAE_COLD) {
    if (a && r < 0.02) { const m = Math.max(1, a >> 5); sol[p + SOL_ALGAE] = a - m; addSol(k, SOL_FERT, m >> 1); }
    return;
  }
  if (a >= ALGAE_CROWDED && r < 0.05) { sol[p + SOL_ALGAE] = a - 8; addSol(k, SOL_FERT, 4); return; }
  if (!a) { if (r < SPORE) sol[p + SOL_ALGAE] = 2; return; }
  if (temp[k] < ALGAE_COOL && r >= 0.125) return;
  if (fert >= FED_AT) { const g = Math.min(255 - a, Math.max(2, a >> 4), fert * 2); sol[p + SOL_ALGAE] = a + g; sol[p + SOL_FERT] = fert - Math.ceil(g / 2); }
  else if (a < ALGAE_WILD && r < 0.05) sol[p + SOL_ALGAE] = a + 1;
}
// pH of a tile's liquid: its own for most liquids; water's from the acid and alkali dissolved in it.
function phOf(k) {
  if (!liq[k]) return 7;
  if (typ[k] !== WATER) return ACIDITY[typ[k]];
  const p = k * NSOL;
  return Math.max(0, Math.min(14, 7 - sol[p + SOL_ACID] / 255 * 6 + sol[p + SOL_BASE] / 255 * 6));
}
function diffuse(p, q) {
  for (let i = 0; i < NSOL; i++) {
    const d = sol[p + i] - sol[q + i];
    if (!d) continue;
    const m = Math.trunc(d * DIFFUSE[i] + Math.random() * Math.sign(d));
    sol[p + i] -= m; sol[q + i] += m;
  }
}
function brews(k, r) {
  if (temp[k] < r.minT || temp[k] > r.maxT) return false;
  for (const i in r.need) if (sol[k * NSOL + +i] < r.need[i]) return false;
  return true;
}
// Ink colours mix like paint (red, yellow, blue primaries); salt, sugar and essence add faint tints.
const RYB = [[255, 255, 255], [230, 30, 40], [250, 215, 40], [235, 120, 20], [40, 95, 200], [130, 40, 150], [40, 160, 70], [50, 30, 20]];
function inkColor(r, y, b) {
  const out = [0, 0, 0];
  for (let c = 0; c < 8; c++) {
    const w = ((c & 1) ? r : 1 - r) * ((c & 2) ? y : 1 - y) * ((c & 4) ? b : 1 - b);
    for (let j = 0; j < 3; j++) out[j] += RYB[c][j] * w;
  }
  return out;
}
const TINTS = [[SOL_SALT, [215, 240, 235], 0.25], [SOL_SUGAR, [235, 170, 60], 0.45], [SOL_ESSENCE, [235, 130, 205], 0.5], [SOL_SILT, [130, 92, 55], 0.7],
  [SOL_ACID, [170, 240, 140], 0.3], [SOL_BASE, [190, 200, 255], 0.3], [SOL_FERT, [150, 130, 80], 0.3], [SOL_ALGAE, [50, 140, 40], 0.85]];   // algae turns water green, a bloom almost opaque
// The colour a tile's dissolved contents give it, as [r, g, b, strength 0-1], or null when it holds nothing visible.
function solTint(k) {
  const p = k * NSOL, r = sol[p + SOL_RED], y = sol[p + SOL_YELLOW], b = sol[p + SOL_BLUE];
  let cr = 0, cg = 0, cb = 0, wsum = 0;
  const ink = Math.max(r, y, b);
  if (ink > 4) { const c = inkColor(r / ink, y / ink, b / ink), w = ink / 255; cr += c[0] * w; cg += c[1] * w; cb += c[2] * w; wsum += w; }
  for (const [i, c, s] of TINTS) {
    const w = sol[p + i] / 255 * s;
    if (w > 0.02) { cr += c[0] * w; cg += c[1] * w; cb += c[2] * w; wsum += w; }
  }
  if (!wsum) return null;
  return [cr / wsum, cg / wsum, cb / wsum, Math.min(0.85, wsum)];
}

export { ALGAE_COLD, ALGAE_COOL, daylight, ALGAE_WILD, ALGAE_CROWDED, SPORE, FED_AT, lit, algae, CORRODE_AT, FIZZ_AT, SATURATED, STILL, chemistry, phOf, SOL_NAMES, DIFFUSE, RECIPES, mixSol, carrySol, clearSol, copySol, swapSol, heavy, addSol, soluteTick, diffuse, brews, RYB, inkColor, TINTS, solTint };
