// Gases: steam, smoke, methane and poison gas are liquids that flow like the rest (most of them fall upward) and are
// drawn thin. Smoke thins out as it drifts and poison does too, very slowly; smoke and methane that reach the top of
// the world in open sky escape. Their sources: fires smoke, rotting slime bubbles methane, acid on metal gives poison.
// Different gases also diffuse into each other: now and then two neighbouring tiles of different gases trade places,
// so where a rising and a sinking gas meet there's a mixed band rather than a clean line (and hydrogen or methane
// mixed with oxygen is what explodes, js/fire.js).
import { H, METHANE, CHLORINE, POISON, SMOKE, W } from './config.js';
import { S, airCarb, airOx, latent, liq, solid, temp, typ, under, wake } from './world.js';
import { skyAir, stir } from './oxygen.js';
import { swapSol } from './solutes.js';
import { LIQ } from './liquids.js';
import { AIR_CAP } from './matter.js';
import { CO2, HYDROGEN, OXYGEN } from './config.js';

const FADE = { [SMOKE]: 3, [POISON]: 0.15, [CHLORINE]: 0.1, [CO2]: 0.1, [OXYGEN]: 0.05 };   // amount lost per gas tick; a fraction is a chance of losing one
const ESCAPES = new Set([SMOKE, METHANE, HYDROGEN]);   // gases that rise out of the top of the open sky
const MIX = 0.3;   // chance per gas tick that a gas tile trades places with a different gas beside it
const GAS_AIR_OXYGEN = 1000 / 255, GAS_AIR_CARBON = 10000 / 255;
function escapedGas(t, amount) {
  const budget = S.accounting.gasEscaped || (S.accounting.gasEscaped = {});
  budget[t] = (budget[t] || 0) + amount;
}
function gasIntoAir(k, t, requested) {
  const x = k % W, arr = t === OXYGEN ? airOx : airCarb;
  const scale = t === OXYGEN ? GAS_AIR_OXYGEN : GAS_AIR_CARBON, maximum = t === OXYGEN ? 1000 : 10000;
  for (const n of [k - W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k + W]) {
    if (n < 0 || n >= W * H || solid[n] || liq[n]) continue;
    const moved = Math.min(requested, liq[k], Math.floor(Math.max(0, maximum - arr[n]) / scale));
    if (!moved) continue;
    const energy = latent[k] * moved / liq[k];
    latent[k] -= energy; temp[n] += energy / AIR_CAP;
    arr[n] += moved * scale; liq[k] -= moved; stir(n); return moved;
  }
  return 0;
}

function gasTick() {
  for (let k = 0; k < W * H; k++) {
    if (!liq[k]) continue;
    let t = typ[k];
    if (t !== SMOKE && t !== METHANE && t !== POISON && t !== CHLORINE && t !== CO2 && t !== HYDROGEN && t !== OXYGEN) continue;
    if (ESCAPES.has(t) && k < W && !under[k]) { escapedGas(t, liq[k]); liq[k] = 0; typ[k] = 0; latent[k] = 0; continue; }
    if (Math.random() < MIX) { mix(k, t); t = typ[k]; }
    const f = FADE[t];
    if (!f || ((t === SMOKE || t === POISON || t === CHLORINE) && !skyAir(k))) continue;
    const n = Math.floor(f) + (Math.random() < f % 1 ? 1 : 0);
    if (!n) continue;
    if (t === CO2 || t === OXYGEN) gasIntoAir(k, t, n);
    else { const removed = Math.min(n, liq[k]); liq[k] -= removed; escapedGas(t, removed); }
    if (!liq[k]) typ[k] = 0;
  }
}

// Trades places with a random neighbour holding a different gas.
function mix(k, t) {
  const x = k % W, d = (Math.random() * 4) | 0;
  const n = d === 0 ? k - W : d === 1 ? k + W : d === 2 ? (x > 0 ? k - 1 : -1) : (x < W - 1 ? k + 1 : -1);
  if (n < 0 || n >= W * H || !liq[n] || typ[n] === t || !LIQ[typ[n]].gas) return;
  const a = liq[k], tk = temp[k];
  const energy = latent[k]; latent[k] = latent[n]; latent[n] = energy; swapSol(k, n);
  liq[k] = liq[n]; typ[k] = typ[n]; temp[k] = temp[n];
  liq[n] = a; typ[n] = t; temp[n] = tk;
  wake(k);
}

export { MIX, mix, FADE, ESCAPES, gasIntoAir, gasTick };
