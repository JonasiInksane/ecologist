// Fire: hot fuel ignites, burns while it touches open air, heats its surroundings (which spreads it),
// and goes out when doused from above or the side, smothered, or out of fuel. Oxygen counts as open air and feeds
// a fire, and lit methane or hydrogen touching oxygen explodes instead of burning.
import { explode } from './blast.js';
import { windAt } from './air.js';
import { AIR, BLOOM, COMB, CRISP, FROST, H, LEAF, METHANE, NBLOCK, OIL, PLANT, SMOKE, W, WATER, WOOD } from './config.js';
import { puff } from './particles.js';
import { nbr } from './pumps.js';
import { clearSol } from './solutes.js';
import { fire, held, liq, markDirty, solid, temp, typ, wake } from './world.js';
import { COOLANT, FUSE, WOOL } from './config.js';
import { ASH, CHARCOAL, CHLORINE, HYDROGEN, OXYGEN, STEAM } from './config.js';
import { breatheAir, burnable } from './oxygen.js';






const IGNITE_BLOCK = new Float32Array(NBLOCK), BURN_TIME = new Uint8Array(NBLOCK);
IGNITE_BLOCK[WOOD] = 260; BURN_TIME[WOOD] = 240;
IGNITE_BLOCK[COMB] = 200; BURN_TIME[COMB] = 140;
IGNITE_BLOCK[CRISP] = 200; BURN_TIME[CRISP] = 180;
IGNITE_BLOCK[PLANT] = 250; BURN_TIME[PLANT] = 60;
IGNITE_BLOCK[WOOL] = 570; BURN_TIME[WOOL] = 120;
IGNITE_BLOCK[FUSE] = 120; BURN_TIME[FUSE] = 10;   // a fuse burns fast and lights the next fuse tile in any direction
IGNITE_BLOCK[LEAF] = 230;
IGNITE_BLOCK[CHARCOAL] = 350; BURN_TIME[CHARCOAL] = 255;   // charcoal glows a long time, hotter and with little smoke
const BURN_DRAW = 2;   // oxygen (tenths of a percent) a flame takes from each tile of air beside it per tick
const CHARCOAL_FLAME = 1300, ASH_LEFT = 0.4, ASH_PINCH = 48;   // burnt wood leaves a pinch of ash, sometimes BURN_TIME[LEAF] = 30;
const OIL_IGNITE = 250, OIL_SMOKE = 200, METHANE_IGNITE = 537, HYDROGEN_IGNITE = 500, FLAME_TEMP = 1000, RADIANT = 0.04, FLASH = 0.6;   // a flash heats the gas beside it past its ignition point, so the flame runs on
const FED = 4;   // oxygen a fire uses up per tick from each oxygen tile it touches, burning hotter for it
const DOUSERS = new Set([WATER, FROST, BLOOM, COOLANT]);

// Air with enough oxygen to burn in next to the tile (15% or more), or oxygen gas.
function exposed(x, y) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && (burnable(n) || (liq[n] && typ[n] === OXYGEN))) return true; }
  return false;
}
// Burning takes oxygen from the air round the flame and gives back carbon dioxide (and the water in the smoke).
function draw(x, y, n) { for (let d = 0; d < 4; d++) { const o = nbr(x, y, d); if (o >= 0) breatheAir(o, n); } }
// The first neighbouring tile holding oxygen (or, for hydrogen, chlorine, which it explodes with just the same), or -1.
function oxygenBeside(x, y, h) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] >= 16 && (typ[n] === OXYGEN || (h && typ[n] === CHLORINE))) return n; }
  return -1;
}
// Water above or beside the tile. Water below doesn't count, so oil keeps burning on top of a lake.
function doused(x, y) {
  for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] >= 32 && DOUSERS.has(typ[n])) return true; }
  return false;
}
function burn(k, x, y) {
  draw(x, y, BURN_DRAW);
  temp[k] = Math.max(temp[k], solid[k] === CHARCOAL ? CHARCOAL_FLAME : FLAME_TEMP);
  wake(k);
  for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT; }   // flames heat up and sideways
  if (solid[k] === FUSE) for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] = Math.max(temp[n], 300); }   // a burning fuse lights what it touches, even below it
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] && (typ[n] === METHANE || typ[n] === HYDROGEN)) temp[n] = Math.max(temp[n], FLAME_TEMP); }   // a flame lights a burnable gas it touches
  const w = windAt(x, y);   // and the wind fans them downwind
  if (Math.abs(w) > 0.1) { const n = nbr(x, y, w > 0 ? 2 : 1); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT * 3 * Math.abs(w); }
  const o = oxygenBeside(x, y);   // oxygen feeds the fire: it burns hotter and uses the oxygen up
  if (o >= 0) {
    for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT * 2; }
    liq[o] = Math.max(0, liq[o] - FED); if (!liq[o]) typ[o] = 0; wake(o);
  }
  if (Math.random() < 0.2) puff(k, 'flame');
  if (Math.random() < 0.06) smokeAbove(k);
}
// Puts a little smoke into the open tile above k.
function smokeAbove(k) {
  const u = k - W;
  if (u < 0 || solid[u] || (liq[u] && typ[u] !== SMOKE)) return;
  if (!liq[u]) { clearSol(u); temp[u] = 200; }
  liq[u] = Math.min(255, liq[u] + 40); typ[u] = SMOKE; wake(u);
}
// Below this nothing can catch, smoke or flash, so a tile that isn't burning and is no hotter can be skipped.
const COLDEST_IGNITE = Math.min(OIL_SMOKE, METHANE_IGNITE, HYDROGEN_IGNITE, ...IGNITE_BLOCK.filter(t => t > 0));
function fireTick() {
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
    if (!fire[k] && temp[k] <= COLDEST_IGNITE) continue;
    const b = solid[k];
    if (!b && liq[k] && (typ[k] === METHANE || typ[k] === HYDROGEN)) {
      const h = typ[k] === HYDROGEN;
      if (temp[k] > (h ? HYDROGEN_IGNITE : METHANE_IGNITE) && !doused(x, y) && oxygenBeside(x, y, h) >= 0) {
        // mixed with oxygen it explodes; the oxygen it touches goes with it
        for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && (typ[n] === OXYGEN || (h && typ[n] === CHLORINE))) { liq[n] = 0; typ[n] = 0; } }
        fire[k] = 0; explode(k);
        continue;
      }
      if (h) {
        // pure hydrogen burns in a flash into hot steam (the water it was split from), heating its neighbours hard
        if (temp[k] > HYDROGEN_IGNITE && !doused(x, y)) {
          fire[k] = 1; typ[k] = STEAM; temp[k] = 400; wake(k); draw(x, y, BURN_DRAW);
          for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * FLASH; }
          if (Math.random() < 0.5) puff(k, 'flame');
        } else fire[k] = 0;
        continue;
      }
      // burning methane flashes through the cloud: each burning tile heats its neighbours hard and is gone in a few ticks
      if (temp[k] > METHANE_IGNITE && !doused(x, y)) {
        fire[k] = 1; temp[k] = FLAME_TEMP; wake(k); draw(x, y, BURN_DRAW);
        for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * FLASH; }
        if (Math.random() < 0.5) puff(k, 'flame');
        liq[k] = Math.max(0, liq[k] - 64);
        if (!liq[k]) { typ[k] = 0; fire[k] = 0; }
      } else fire[k] = 0;
      continue;
    }
    if (!b && liq[k] && typ[k] === OIL) {
      // burning oil is hot oil touching air; its heat flows with it, so the fire moves with the oil
      if (temp[k] > OIL_IGNITE && exposed(x, y) && !doused(x, y)) {
        fire[k] = 1; burn(k, x, y);
        if (!--liq[k]) typ[k] = 0;
      } else {
        if (fire[k] && doused(x, y)) { temp[k] = Math.min(temp[k], 90); puff(k, 'steam'); }
        fire[k] = 0;
        if (temp[k] > OIL_SMOKE && Math.random() < 0.02) smokeAbove(k);   // hot oil smokes before it catches
      }
      continue;
    }
    if (!IGNITE_BLOCK[b]) { fire[k] = 0; continue; }
    if (!fire[k]) { if (temp[k] > IGNITE_BLOCK[b] && exposed(x, y)) fire[k] = BURN_TIME[b]; continue; }
    if (doused(x, y)) { fire[k] = 0; temp[k] = Math.min(temp[k], 90); puff(k, 'steam'); continue; }
    if (!exposed(x, y)) { fire[k] = 0; continue; }   // smothered
    burn(k, x, y);
    if (--fire[k] === 0) {
      const ash = (b === WOOD || b === CHARCOAL || b === LEAF) && Math.random() < ASH_LEFT;
      solid[k] = ash ? ASH : AIR; held[k] = ash ? ASH_PINCH : 0; markDirty(x, y); puff(k, 'smoke');
    }
  }
}

export { HYDROGEN_IGNITE, FED, oxygenBeside, IGNITE_BLOCK, BURN_TIME, OIL_IGNITE, OIL_SMOKE, METHANE_IGNITE, FLAME_TEMP, RADIANT, FLASH, smokeAbove, DOUSERS, exposed, doused, burn, fireTick };
