// Oxygen and carbon dioxide, in the air and in water.
// Air: every empty tile holds air of its own (airOx, airCarb in js/world.js). Air open to the sky (nothing solid or
// liquid above it in its column) is the atmosphere and stays at 21% oxygen; everywhere else the air mixes with the
// air beside it, quickly, so a cave or a room with a door is topped up from outside while a sealed room is not. Fires
// use oxygen and make CO2 (js/fire.js), breathing does the same (js/bodies.js), and oxygen and CO2 gas that thins out
// joins the air it's in (js/gases.js). Below 15% oxygen nothing burns; below 12%, or above 5% CO2, the explorer chokes.
// Water: SOL_O2 is how far a water tile's dissolved oxygen is below saturation, so plain water is full of it. How much
// that is depends on temperature (14.6 mg/L at 0°, 9.1 at 20°, 7.6 at 30°) and salt (a fifth less in strong brine), so
// warming water loses oxygen by itself. Water open to the air takes oxygen back in at its surface, faster where it's
// moving; below, only mixing brings it down. Fish use it up and suffocate below 3 mg/L (pike below 1.5); algae make it
// in the light and use it in the dark; mud on the bottom uses it (js/erosion.js).
import { SOL_CO2, CHUNK, FLOWER, GLASS, H, LEAF, NBLOCK, NSOL, PLANT, SOL_O2, SOL_SALT, W, WATER } from './config.js';
import { LIQ } from './liquids.js';
import { AIR_CARB, AIR_OX, CHH, CW, airCarb, airOx, liq, sol, solid, temp, typ, vel } from './world.js';

const RISING = 20;   // degrees hotter that makes air below rise into the air above, mixing fully
const MIX_AIR = 0.45;   // share of the difference two neighbouring air tiles even out per pass (draughts and convection stir a room's air quickly)
const FIRE_OX = 150, CHOKE_OX = 120, CHOKE_CARB = 500;   // 15% and 12% oxygen; 5% CO2
const CARB_PER_OX = 10;   // CO2 counts in hundredths of a percent, oxygen in tenths: a breath trades them one for one
const STILL_FOR = 6;   // passes a chunk's air keeps mixing after it last changed
const busy = new Uint8Array(CW * CHH);
const MG_PER_UNIT = 15 / 255;   // SOL_O2 counts missing oxygen in these steps, mg/L
const SAT = [[0, 14.6], [10, 11.3], [20, 9.1], [30, 7.6], [40, 6.4], [60, 4.7], [80, 2.9], [100, 0]];
const FISH_GASPS = 3, PIKE_GASPS = 1.5;
const CO2_PER_AIR = 2.5;   // dissolved CO2 units in water at rest with air of each hundredth of a percent of CO2 (0.6 mg/L at 0.04%)   // mg/L below which they suffocate

// Marks tile k's air as changed, so it keeps mixing.
function stir(k) { busy[((k / W / CHUNK) | 0) * CW + (((k % W) / CHUNK) | 0)] = STILL_FOR; }
const isAir = k => !solid[k] && !liq[k];
// Oxygen saturation of water at temperature T with salt s (mg/L).
function saturation(T, s) {
  let v = 0;
  if (T <= 0) v = SAT[0][1];
  else if (T >= 100) v = 0;
  else for (let i = 1; i < SAT.length; i++) if (T <= SAT[i][0]) { const [t0, a] = SAT[i - 1], [t1, b] = SAT[i]; v = a + (b - a) * (T - t0) / (t1 - t0); break; }
  return v * (1 - 0.2 * s / 255);
}
// Dissolved oxygen in water tile k, mg/L.
function oxygenIn(k) { return Math.max(0, saturation(temp[k], sol[k * NSOL + SOL_SALT]) - sol[k * NSOL + SOL_O2] * MG_PER_UNIT); }
// Uses up mg of the water's oxygen (or gives it back, for negative mg); returns false if there wasn't enough.
function breatheWater(k, mg) {
  const p = k * NSOL + SOL_O2, have = oxygenIn(k);
  if (mg > 0 && have < mg) { sol[p] = Math.min(255, sol[p] + Math.ceil(have / MG_PER_UNIT)); return false; }
  const d = mg / MG_PER_UNIT, n = Math.floor(Math.abs(d)) + (Math.random() < Math.abs(d) % 1 ? 1 : 0);
  sol[p] = Math.max(0, Math.min(255, sol[p] + Math.sign(d) * n));
  if (d > 0) sol[k * NSOL + SOL_CO2] = Math.min(255, sol[k * NSOL + SOL_CO2] + n);   // what breathes out carbon dioxide
  return true;
}
// Breathing air at tile k: uses n tenths of a percent of oxygen and gives back as much CO2.
function breatheAir(k, n = 1) {
  if (!isAir(k)) return;
  airOx[k] = Math.max(0, airOx[k] - n); airCarb[k] = Math.min(65535, airCarb[k] + n * CARB_PER_OX); stir(k);
}
// Respiration at tile k, in photosynthesis's units: gives back `carb` hundredths of a percent of CO2 and takes the
// matching oxygen (in its coarser steps, by chance).
function respire(k, carb) {
  if (!isAir(k)) return;
  const ox = carb / CARB_PER_OX, whole = Math.floor(ox) + (Math.random() < ox % 1 ? 1 : 0);
  airOx[k] = Math.max(0, airOx[k] - whole); airCarb[k] = Math.min(65535, airCarb[k] + Math.round(carb)); stir(k);
}
// Photosynthesis at tile k: takes up to n hundredths of a percent of CO2 from the air and gives back as much oxygen
// (in its coarser steps, by chance). Returns how much CO2 it took.
function fixCarbon(k, n) {
  if (!isAir(k)) return 0;
  const got = Math.min(n, airCarb[k]);
  airCarb[k] -= got;
  const ox = got / CARB_PER_OX, whole = Math.floor(ox) + (Math.random() < ox % 1 ? 1 : 0);
  airOx[k] = Math.min(255, airOx[k] + whole); stir(k);
  return got;
}
// Whether tile k's air is open to the sky: nothing solid or liquid (gas aside) above it, as for the air's top-up.
function skyAir(k) {
  for (let o = k - W; o >= 0; o -= W) if (solid[o] || (liq[o] && !LIQ[typ[o]].gas)) return false;
  return true;
}
// Whether daylight reaches tile k: nothing opaque above it in its column. Glass, water, gas and a plant's own leaves
// and flower let it through.
function skyAbove(k) {
  for (let o = k - W; o >= 0; o -= W) if (solid[o] && !SEE_THROUGH[solid[o]]) return false;
  return true;
}
const SEE_THROUGH = new Uint8Array(NBLOCK);
[GLASS, LEAF, PLANT, FLOWER].forEach(b => { SEE_THROUGH[b] = 1; });
// Whether a fire can draw on the air at tile k.
const burnable = k => isAir(k) && airOx[k] >= FIRE_OX;
const stifling = k => isAir(k) && (airOx[k] < CHOKE_OX || airCarb[k] > CHOKE_CARB);

// One pass (every 4 ticks): the atmosphere tops up the air open to the sky, then air mixes with its neighbours in the
// chunks that have changed lately (and the chunks beside them).
function airTickOx() {
  for (let x = 0; x < W; x++) for (let y = 0, k = x; y < H; y++, k += W) {
    if (solid[k] || (liq[k] && !LIQ[typ[k]].gas)) break;   // gas lets the sky's air through; anything else roofs it over
    if (!liq[k] && (airOx[k] !== AIR_OX || airCarb[k] !== AIR_CARB)) { airOx[k] = AIR_OX; airCarb[k] = AIR_CARB; stir(k); }
  }
  for (let cy = 0; cy < CHH; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx;
    if (!busy[c] && !(cx > 0 && busy[c - 1]) && !(cx < CW - 1 && busy[c + 1]) && !(cy > 0 && busy[c - CW]) && !(cy < CHH - 1 && busy[c + CW])) continue;
    let moved = false;
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK, k = y * W + x; x < (cx + 1) * CHUNK; x++, k++) {
      if (!isAir(k)) continue;
      if (x < W - 1 && isAir(k + 1)) moved = share(k, k + 1, MIX_AIR) || moved;
      if (y < H - 1 && isAir(k + W)) moved = share(k, k + W, temp[k + W] > temp[k] + RISING ? 0.5 : MIX_AIR) || moved;   // hot air rises and draws fresh air in behind it
    }
    if (moved) busy[c] = STILL_FOR; else if (busy[c]) busy[c]--;
  }
}
function share(a, b, f) {
  let moved = false;
  for (const arr of [airOx, airCarb]) {
    const d = arr[a] - arr[b];
    if (!d) continue;
    const m = Math.trunc(d * f) || (Math.random() < 0.5 ? Math.sign(d) : 0);
    if (m) { arr[a] -= m; arr[b] += m; moved = true; }
  }
  return moved;
}
// Water's oxygen at its surface: water with air above it takes oxygen in (towards what that air allows), faster when
// it's moving. Called for each water tile from js/solutes.js.
function surfaceOx(k, p) {
  const up = k - W;
  if (up >= 0 && (solid[up] || liq[up])) return;
  // carbon dioxide: the water evens out with the air above it, in step with that air's CO2 (giving off what it
  // breathed out, or taking some in where the air is rich in it)
  if (up >= 0) {
    const want = Math.min(255, Math.round(airCarb[up] * CO2_PER_AIR)), c = sol[p + SOL_CO2];
    if (c !== want) { const m = Math.sign(c - want) * Math.max(1, Math.round(Math.abs(c - want) * 0.05)); sol[p + SOL_CO2] = c - m; airCarb[up] = Math.max(0, airCarb[up] + m); stir(up); }
  }
  const want = up >= 0 && airOx[up] < AIR_OX ? Math.round(255 * (1 - airOx[up] / AIR_OX)) : 0, d = sol[p + SOL_O2];
  if (d <= want) return;
  const rate = Math.abs(vel[k]) > 0.3 ? 0.15 : 0.05;
  sol[p + SOL_O2] = Math.max(want, d - Math.max(1, Math.round((d - want) * rate)));
}

export { FIRE_OX, CHOKE_OX, CHOKE_CARB, MIX_AIR, MG_PER_UNIT, SAT, FISH_GASPS, PIKE_GASPS, CARB_PER_OX, busy, stir, skyAir, skyAbove, saturation, oxygenIn, breatheWater, breatheAir, respire, fixCarbon, burnable, stifling, airTickOx, surfaceOx };
