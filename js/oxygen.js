// Oxygen and carbon dioxide, in the air and in water.
// Air: every empty tile holds air of its own (airOx, airCarb in js/world.js). Air open to the sky (nothing solid or
// liquid above it in its column) is the atmosphere and stays at 21% oxygen; everywhere else the air mixes with the
// air beside it, quickly, so a cave or a room with a door is topped up from outside while a sealed room is not. Fires
// use oxygen and make CO2 (js/fire.js), breathing does the same (js/bodies.js), and oxygen and CO2 gas that thins out
// joins the air it's in (js/gases.js). Below 15% oxygen nothing burns; below 12%, or above 5% CO2, the explorer chokes.
// Water: SOL_O2 is a signed deficit from a fixed 9.1 mg/L reference. Zero-initialized fresh water starts at that
// concentration; negative deficits represent supersaturation. Temperature and salt change the exchange target, not
// the oxygen already present. A full water tile and an empty air tile each represent a 1 L reference reservoir for
// gas accounting. Surface exchange debits both finite reservoirs; only the open atmosphere is an external source.
// This is a fixed-volume, room-temperature air reference, not a pressure simulation. Dissolved CO2 uses oxygen-
// equivalent mass (equal molecule counts), so its actual mass is the reported equivalent times 44/32.
import { SOL_CO2, CHUNK, FLOWER, GLASS, H, LEAF, NBLOCK, NSOL, PLANT, SOL_O2, SOL_SALT, W, WATER } from './config.js';
import { LIQ } from './liquids.js';
import { AIR_CARB, AIR_OX, CHH, CW, S, airCarb, airOx, liq, sol, solid, temp, typ, vel } from './world.js';

const RISING = 20;   // degrees hotter that makes air below rise into the air above, mixing fully
const MIX_AIR = 0.45;   // share of the difference two neighbouring air tiles even out per pass (draughts and convection stir a room's air quickly)
const FIRE_OX = 150, CHOKE_OX = 120, CHOKE_CARB = 500;   // 15% and 12% oxygen; 5% CO2
const CARB_PER_OX = 10;   // CO2 counts in hundredths of a percent, oxygen in tenths: a breath trades them one for one
const STILL_FOR = 6;   // passes a chunk's air keeps mixing after it last changed
const busy = new Uint8Array(CW * CHH);
const MG_PER_UNIT = 15 / 255, OXYGEN_REFERENCE = 9.1;   // deficit units are mg/L; the reference never follows temperature
const AIR_GAS_MOLAR_VOLUME = 24.055;   // L/mol at the chosen 20°C, 1 atm reference
const AIR_O2_MG_PER_UNIT = 32 / AIR_GAS_MOLAR_VOLUME;   // mg O2 per 0.1% of the reference litre
const AIR_CO2_EQ_MG_PER_UNIT = AIR_O2_MG_PER_UNIT / CARB_PER_OX;
const MAX_AIR_OX = 1000, MAX_AIR_CARB = 10000;   // a reference litre of pure gas; fractional quantities are retained
const GAS_MIX_EPSILON = 1e-7, SURFACE_STILL = 0.05, SURFACE_MOVING = 0.15, MOVING_SURFACE = 0.3;
const SAT = [[0, 14.6], [10, 11.3], [20, 9.1], [30, 7.6], [40, 6.4], [60, 4.7], [80, 2.9], [100, 0]];
const FISH_GASPS = 3, PIKE_GASPS = 1.5;
const CO2_PER_AIR = 2.5;   // coarse equilibrium coefficient: dissolved CO2 units per airCarb unit

// Marks tile k's air as changed, so it keeps mixing.
function stir(k) { busy[((k / W / CHUNK) | 0) * CW + (((k % W) / CHUNK) | 0)] = STILL_FOR; }
function wakeAir() { busy.fill(STILL_FOR); }
const isAir = k => k >= 0 && k < W * H && !solid[k] && !liq[k];
// Oxygen saturation of water at temperature T with salt s (mg/L).
function saturation(T, s) {
  let v = 0;
  if (T <= 0) v = SAT[0][1];
  else if (T >= 100) v = 0;
  else for (let i = 1; i < SAT.length; i++) if (T <= SAT[i][0]) { const [t0, a] = SAT[i - 1], [t1, b] = SAT[i]; v = a + (b - a) * (T - t0) / (t1 - t0); break; }
  return v * (1 - 0.2 * s / 255);
}
// Dissolved oxygen in water tile k, mg/L.
function oxygenIn(k) { return liq[k] ? Math.max(0, OXYGEN_REFERENCE - sol[k * NSOL + SOL_O2] * MG_PER_UNIT) : 0; }
// Uses mg/L of this tile's oxygen, producing an equal molar concentration of CO2. Negative requests reverse that
// exchange, limited by dissolved CO2. The boolean result retains the existing API; a shortfall consumes only what
// exists. Concentrations multiplied by liq[k]/255 give the corresponding quantities in the reference litre.
function breatheWater(k, mg) {
  if (!liq[k] || !Number.isFinite(mg)) return false;
  const p = k * NSOL, have = oxygenIn(k), available = mg >= 0 ? have : sol[p + SOL_CO2] * MG_PER_UNIT;
  const amount = Math.min(Math.abs(mg), Math.max(0, available)), d = Math.sign(mg) * amount / MG_PER_UNIT;
  sol[p + SOL_O2] = (OXYGEN_REFERENCE - have) / MG_PER_UNIT + d;
  sol[p + SOL_CO2] = Math.max(0, sol[p + SOL_CO2] + d);
  return amount + GAS_MIX_EPSILON >= Math.abs(mg);
}
// Separate oxygen removal from respiratory products so combustion can use its own reaction stoichiometry.
function consumeAirOxygen(k, n) {
  if (!isAir(k) || !(n > 0)) return 0;
  const used = Math.min(n, airOx[k]);
  if (used) { airOx[k] -= used; stir(k); }
  return used;
}
function addAirCarbon(k, carb) {
  if (!isAir(k) || !(carb > 0)) return 0;
  const added = Math.min(carb, Math.max(0, MAX_AIR_CARB - airCarb[k]));
  if (added) { airCarb[k] += added; stir(k); }
  return added;
}
// Breathing air: reserve room for the CO2, consume available oxygen, then return how much was actually used.
function breatheAir(k, n = 1) {
  if (!isAir(k) || !(n > 0)) return 0;
  const used = consumeAirOxygen(k, Math.min(n, Math.max(0, MAX_AIR_CARB - airCarb[k]) / CARB_PER_OX));
  addAirCarbon(k, used * CARB_PER_OX);
  return used;
}
// Respiration at tile k, in photosynthesis's units: gives back `carb` hundredths of a percent of CO2 and takes the
// matching oxygen. Returning the actual conversion lets organisms spend only the sugar they metabolized.
function respire(k, carb) {
  return breatheAir(k, carb / CARB_PER_OX) * CARB_PER_OX;
}
// Photosynthesis at tile k: takes up to n hundredths of a percent of CO2 from the air and gives back as much oxygen
// in matching fractional units. Returns how much CO2 it took, limited by both reactant and product storage.
function fixCarbon(k, n) {
  if (!isAir(k) || !(n > 0)) return 0;
  const got = Math.min(n, airCarb[k], Math.max(0, MAX_AIR_OX - airOx[k]) * CARB_PER_OX);
  airCarb[k] -= got;
  airOx[k] += got / CARB_PER_OX;
  if (got) stir(k);
  return got;
}
// Signed exchange with the external atmosphere, in mg of O2 or the equal-molecule CO2 equivalent. These counters
// describe this boundary only; they are not a claim that every other source in the world is already audited.
function recordAtmosphere(oxygen, carbon) {
  const a = S.accounting;
  if (oxygen) a.gasAtmosphereOxygenMg = (a.gasAtmosphereOxygenMg || 0) + oxygen;
  if (carbon) a.gasAtmosphereCarbonEqMg = (a.gasAtmosphereCarbonEqMg || 0) + carbon;
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
    if (!liq[k] && (airOx[k] !== AIR_OX || airCarb[k] !== AIR_CARB)) {
      recordAtmosphere((AIR_OX - airOx[k]) * AIR_O2_MG_PER_UNIT, (AIR_CARB - airCarb[k]) * AIR_CO2_EQ_MG_PER_UNIT);
      airOx[k] = AIR_OX; airCarb[k] = AIR_CARB; stir(k);
    }
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
    if (Math.abs(d) < GAS_MIX_EPSILON) continue;
    const m = d * f;
    if (m) { arr[a] -= m; arr[b] += m; moved = true; }
  }
  return moved;
}
// Bidirectional gas exchange. Calculate an amount from the concentration difference and water volume, then debit
// the donor and credit the recipient with precisely that amount. Warming changes the target and causes outgassing
// over time; cooling cannot create oxygen in a closed vessel. A water surface at the top edge contacts the external
// atmosphere directly, and that exchange is recorded just like the open-air boundary above.
function surfaceOx(k, p) {
  if (!liq[k]) return;
  const up = k - W;
  if (up >= 0 && (solid[up] || liq[up])) return;
  const volume = liq[k] / 255, outside = up < 0;
  const airO = outside ? AIR_OX : airOx[up], airC = outside ? AIR_CARB : airCarb[up];
  const rate = Math.abs(vel[k]) > MOVING_SURFACE ? SURFACE_MOVING : SURFACE_STILL;
  const have = oxygenIn(k), target = saturation(temp[k], sol[p + SOL_SALT]) * airO / AIR_OX;
  let oxygen = (target - have) * volume * rate;
  oxygen = oxygen >= 0 ? Math.min(oxygen, outside ? Infinity : airO * AIR_O2_MG_PER_UNIT)
    : -Math.min(-oxygen, have * volume, outside ? Infinity : Math.max(0, MAX_AIR_OX - airO) * AIR_O2_MG_PER_UNIT);
  sol[p + SOL_O2] = (OXYGEN_REFERENCE - have) / MG_PER_UNIT - oxygen / (volume * MG_PER_UNIT);
  const carbonHave = Math.max(0, sol[p + SOL_CO2]), carbonTarget = airC * CO2_PER_AIR;
  let carbon = (carbonTarget - carbonHave) * volume * MG_PER_UNIT * SURFACE_STILL;
  carbon = carbon >= 0 ? Math.min(carbon, outside ? Infinity : airC * AIR_CO2_EQ_MG_PER_UNIT)
    : -Math.min(-carbon, carbonHave * volume * MG_PER_UNIT, outside ? Infinity : Math.max(0, MAX_AIR_CARB - airC) * AIR_CO2_EQ_MG_PER_UNIT);
  sol[p + SOL_CO2] = Math.max(0, carbonHave + carbon / (volume * MG_PER_UNIT));
  if (outside) recordAtmosphere(oxygen, carbon);
  else {
    airOx[up] = Math.max(0, airO - oxygen / AIR_O2_MG_PER_UNIT);
    airCarb[up] = Math.max(0, airC - carbon / AIR_CO2_EQ_MG_PER_UNIT);
    if (oxygen || carbon) stir(up);
  }
}

export { FIRE_OX, CHOKE_OX, CHOKE_CARB, MIX_AIR, MG_PER_UNIT, OXYGEN_REFERENCE, AIR_GAS_MOLAR_VOLUME, AIR_O2_MG_PER_UNIT, AIR_CO2_EQ_MG_PER_UNIT, MAX_AIR_OX, MAX_AIR_CARB, SAT, FISH_GASPS, PIKE_GASPS, CARB_PER_OX, busy, stir, wakeAir, skyAir, skyAbove, saturation, oxygenIn, breatheWater, consumeAirOxygen, addAirCarbon, breatheAir, respire, fixCarbon, burnable, stifling, airTickOx, surfaceOx, recordAtmosphere };
