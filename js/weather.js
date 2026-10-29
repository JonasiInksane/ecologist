// Weather: rain and snow come from the clouds in js/air.js, and the air temperature from js/climate.js (cold nights
// freeze open lakes). Here the daytime sun bakes mud it shines on into dirt and melts ice it shines on, less under
// cloud; the water in the mud goes up into the air. Puddles dry by evaporating into the air (js/air.js).
import { seedRain, vapour } from './air.js';
import { shade, skyTempAt } from './climate.js';
import { DIRT, H, ICE, MUD, W, WATER } from './config.js';
import { sunHeight } from './daynight.js';
import { S, afloat, drop, liq, markDirty, meltAmount, typ, solid, under } from './world.js';

const THAW_CHANCE = 0.01, MUD_DRY = 0.004;

// "Rain now": gathers the air's vapour into cloud over the view.
function startRain() { seedRain(); }
function weatherTick() {
  if (S.weather && (S.tick & 3) === 3 && sunHeight() > 0.15) sunshine();
}
// The sun bakes mud it shines on into dirt, and melts ice it shines on if the air is above freezing.
function sunshine() {
  for (let k = W; k < W * H; k++) {
    if (solid[k] !== ICE && !(liq[k] && typ[k] === MUD)) continue;
    const sun = 1 - shade[k % W];
    if (solid[k] === ICE && !under[k] && !solid[k - W] && !liq[k - W] && Math.random() < THAW_CHANCE * sun && skyTempAt(k % W, (k / W) | 0) > 0) {
      solid[k] = 0; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; drop[k] = 0; markDirty(k % W, (k / W) | 0);
      continue;
    }
    if (liq[k] && typ[k] === MUD && !under[k] && !solid[k - W] && !liq[k - W] && (k >= W * H - W || solid[k + W]) && Math.random() < MUD_DRY * sun) {
      vapour(k, liq[k]); solid[k] = DIRT; liq[k] = 0; typ[k] = 0; markDirty(k % W, (k / W) | 0);
    }
  }
}

export { THAW_CHANCE, MUD_DRY, startRain, weatherTick, sunshine };
