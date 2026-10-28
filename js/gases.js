// Gases: steam, smoke, methane and poison gas are liquids that flow like the rest (most of them fall upward) and are
// drawn thin. Smoke thins out as it drifts and poison does too, very slowly; smoke and methane that reach the top of
// the world in open sky escape. Their sources: fires smoke, rotting slime bubbles methane, acid on metal gives poison.
// Different gases also diffuse into each other: now and then two neighbouring tiles of different gases trade places,
// so where a rising and a sinking gas meet there's a mixed band rather than a clean line (and hydrogen or methane
// mixed with oxygen is what explodes, js/fire.js).
import { H, METHANE, CHLORINE, POISON, SMOKE, W } from './config.js';
import { liq, temp, typ, under, wake } from './world.js';
import { LIQ } from './liquids.js';
import { CO2, HYDROGEN, OXYGEN } from './config.js';

const FADE = { [SMOKE]: 3, [POISON]: 0.15, [CHLORINE]: 0.1, [CO2]: 0.1, [OXYGEN]: 0.05 };   // amount lost per gas tick; a fraction is a chance of losing one
const ESCAPES = new Set([SMOKE, METHANE, HYDROGEN]);   // gases that rise out of the top of the open sky
const MIX = 0.3;   // chance per gas tick that a gas tile trades places with a different gas beside it

function gasTick() {
  for (let k = 0; k < W * H; k++) {
    if (!liq[k]) continue;
    const t = typ[k];
    if (t !== SMOKE && t !== METHANE && t !== POISON && t !== CHLORINE && t !== CO2 && t !== HYDROGEN && t !== OXYGEN) continue;
    if (ESCAPES.has(t) && k < W && !under[k]) { liq[k] = 0; typ[k] = 0; continue; }
    if (Math.random() < MIX) mix(k, t);
    const f = FADE[t];
    if (!f || (t === OXYGEN && under[k])) continue;   // oxygen only mixes away into the open air
    const n = Math.floor(f) + (Math.random() < f % 1 ? 1 : 0);
    if (!n) continue;
    liq[k] = Math.max(0, liq[k] - n);
    if (!liq[k]) typ[k] = 0;
  }
}

// Trades places with a random neighbour holding a different gas.
function mix(k, t) {
  const x = k % W, d = (Math.random() * 4) | 0;
  const n = d === 0 ? k - W : d === 1 ? k + W : d === 2 ? (x > 0 ? k - 1 : -1) : (x < W - 1 ? k + 1 : -1);
  if (n < 0 || n >= W * H || !liq[n] || typ[n] === t || !LIQ[typ[n]].gas) return;
  const a = liq[k], tk = temp[k];
  liq[k] = liq[n]; typ[k] = typ[n]; temp[k] = temp[n];
  liq[n] = a; typ[n] = t; temp[n] = tk;
  wake(k);
}

export { MIX, mix, FADE, ESCAPES, gasTick };
