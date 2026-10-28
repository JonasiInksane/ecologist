// Gases: steam, smoke, methane and poison gas are liquids that flow like the rest (most of them fall upward) and are
// drawn thin. Smoke thins out as it drifts and poison does too, very slowly; smoke and methane that reach the top of
// the world in open sky escape. Their sources: fires smoke, rotting slime bubbles methane, acid on metal gives poison.
import { H, METHANE, POISON, SMOKE, W } from './config.js';
import { liq, typ, under } from './world.js';
import { CO2, HYDROGEN, OXYGEN } from './config.js';

const FADE = { [SMOKE]: 3, [POISON]: 0.15, [CO2]: 0.1, [OXYGEN]: 0.05 };   // amount lost per gas tick; a fraction is a chance of losing one
const ESCAPES = new Set([SMOKE, METHANE, HYDROGEN]);   // gases that rise out of the top of the open sky

function gasTick() {
  for (let k = 0; k < W * H; k++) {
    if (!liq[k]) continue;
    const t = typ[k];
    if (t !== SMOKE && t !== METHANE && t !== POISON && t !== CO2 && t !== HYDROGEN && t !== OXYGEN) continue;
    if (ESCAPES.has(t) && k < W && !under[k]) { liq[k] = 0; typ[k] = 0; continue; }
    const f = FADE[t];
    if (!f || (t === OXYGEN && under[k])) continue;   // oxygen only mixes away into the open air
    const n = Math.floor(f) + (Math.random() < f % 1 ? 1 : 0);
    if (!n) continue;
    liq[k] = Math.max(0, liq[k] - n);
    if (!liq[k]) typ[k] = 0;
  }
}

export { FADE, ESCAPES, gasTick };
