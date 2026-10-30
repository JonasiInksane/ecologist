// The per-tick liquid update: react, fall, spread; then the other systems.
import { airTick } from './air.js';
import { biomeTick } from './biomes.js';
import { updateBodies } from './bodies.js';
import { CHUNK, FOAM, H, NLIQ, NSOL, OIL, W, WATER } from './config.js';
import { devicesTick } from './devices.js';
import { erosionTick } from './erosion.js';
import { fireTick } from './fire.js';
import { gasTick } from './gases.js';
import { heatTick } from './heat.js';
import { LIQ, VISC_TEMP, viscAt } from './liquids.js';
import { AIR_CAP, LCAP, dissolvedHeatCapacity } from './matter.js';
import { chemTick } from './chem.js';
import { airTickOx } from './oxygen.js';
import { momentumTick } from './momentum.js';
import { puff, splash } from './particles.js';
import { pipesTick } from './pipes.js';
import { plantTick } from './plants.js';
import { powderTick } from './powders.js';
import { pressureOff, pressureTick } from './pressure.js';
import { pumpTick } from './pumps.js';
import { REACT, SWAP, blockEffects, reactAll } from './reactions.js';
import { carrySol, densityOf, soluteTick, swapSol } from './solutes.js';
import { weatherTick } from './weather.js';
import { CW, S, awake, drop, flux, latent, liq, sol, solid, stamp, temp, typ, vel, wake } from './world.js';
import { materialsTick } from './materials.js';
import { ecoTick } from './ecology.js';
import { observeLevel } from './level-observer.js';












const CONVECT = 8;   // how much warmer liquid must be than the liquid above it to rise through it
const LAYER = 0.0004;   // g/cm³ of difference that makes a layer turn over (about 2° near room temperature)
// Moving liquid carries its temperature, what's dissolved in it and its momentum; for heat, an empty tile counts as a
// little air.
// Mix material heat capacities before mixing concentrations; concentrated salt/sugar carries heat too.
// Empty-tile air keeps the existing small heat charge. Displaced sub-tile air is still a coarse flow approximation.
function carryHeat(src, dst, mv, had, available = liq[src]) {
  if (!(mv > 0) || !(available > 0)) return;
  const incomingCap = LCAP[typ[src]] * mv / 255 + dissolvedHeatCapacity(mv, sol, src * NSOL);
  const receiverCap = had > 0 ? LCAP[typ[dst] || typ[src]] * had / 255 + dissolvedHeatCapacity(had, sol, dst * NSOL) : AIR_CAP;
  temp[dst] = (temp[dst] * receiverCap + temp[src] * incomingCap) / (receiverCap + incomingCap);
  vel[dst] = had > 0 ? (vel[dst] * had + vel[src] * mv) / (had + mv) : vel[src];
  carrySol(src, dst, mv, had);
  const energy = latent[src] * mv / available;
  latent[src] -= energy; latent[dst] += energy;
}
// Separately callable transport pass for native-port comparisons. Ordinary step() retains all hooks.
function liquidTick(withReactions = true, withEffects = true) {
  for (let y = H - 1; y >= 0; y--) {
    const ltr = ((S.tick + y) & 1) === 0;
    const crow = ((y / CHUNK) | 0) * CW;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      // Test the live counter at this segment: earlier liquid movement can wake later chunks.
      if (i % CHUNK === 0 && !awake[crow + ((x / CHUNK) | 0)]) { i += CHUNK - 1; continue; }
      const k = y * W + x;
      if (!liq[k] || stamp[k] === S.tick) continue;
      const t = typ[k], L = LIQ[t];
      if (S.tick % (VISC_TEMP[t] ? viscAt(t, temp[k]) : L.visc)) continue;
      if (withReactions && reactAll(x, y, k, t)) continue;
      let a = withReactions ? blockEffects(x, y, k, t, liq[k]) : liq[k];
      if (a < 0) continue;
      if (a !== liq[k]) wake(k);
      if (a === 0) { liq[k] = 0; typ[k] = 0; continue; }

      // 1. fall in this liquid's gravity direction
      const g = L.grav;
      let fell = false;
      if (g > 0 ? y < H - 1 : y > 0) {
        const b = k + W * g;
        if (!solid[b]) {
          const ba = liq[b], bt = typ[b];
          if (ba === 0 || bt === t) {
            const room = 255 - ba;
            if (room > 0) {
              const mv = a < room ? a : room;
              carryHeat(k, b, mv, ba, a); liq[b] = ba + mv; typ[b] = t; a -= mv; wake(k);
              if (mv >= 8) flux[b] = S.tick;
              drop[b] = Math.max(ba ? drop[b] : 0, Math.min(255, drop[k] + 1)); fell = true;
              if (g < 0) stamp[b] = S.tick;   // rows above run later this tick; don't move it twice
              else if (ba > 0 && mv > 24 && (y + 2 >= H || solid[b + W] || liq[b + W] >= 250) && Math.random() < 0.04) { if (withEffects) splash(x, y + 1, t, ba + mv); }
            } else if (g > 0 && stamp[b] !== S.tick && Math.random() < 0.5 && densityOf(k) > densityOf(b) + LAYER) {
              // denser liquid sinks through lighter liquid of the same kind under it: saltier or sweeter water, and
              // water nearer 4° (convection; a cooling lake turns over)
              swapSol(k, b);
              liq[k] = ba; liq[b] = a;
              const ek = latent[k]; latent[k] = latent[b]; latent[b] = ek;
              const tk = temp[k]; temp[k] = temp[b]; temp[b] = tk;
              const vk = vel[k]; vel[k] = vel[b]; vel[b] = vk;
              wake(k); stamp[k] = S.tick; stamp[b] = S.tick;
              continue;
            }
          } else if (t === WATER && bt === OIL && Math.random() < 0.1) {
            // water crashing down onto oil churns both into foam
            typ[k] = FOAM; typ[b] = FOAM; wake(k);
            stamp[k] = S.tick; stamp[b] = S.tick;
            continue;
          } else if (REACT[t * NLIQ + bt] === SWAP && (g < 0 ? L.dens < LIQ[bt].dens : L.dens > LIQ[bt].dens)) {
            if (g < 0 && L.gas && !LIQ[bt].gas && Math.random() < 0.2) { if (withEffects) puff(b, 'bubble'); }   // gas rising through liquid
            liq[k] = ba; typ[k] = bt; liq[b] = a; typ[b] = t;
            const tk = temp[k]; temp[k] = temp[b]; temp[b] = tk;
            const vk = vel[k]; vel[k] = vel[b]; vel[b] = vk;
            swapSol(k, b);
            const ek = latent[k]; latent[k] = latent[b]; latent[b] = ek;
            wake(k);
            stamp[k] = S.tick; stamp[b] = S.tick;
            continue;
          }
        }
      }
      if (!fell) drop[k] = 0;
      if (!a) { liq[k] = 0; typ[k] = 0; drop[k] = 0; continue; }

      // 2. spread to lower side neighbours
      let useL = 0, useR = 0, la = 0, ra = 0;
      if (x > 0) {
        const l = k - 1;
        if (!solid[l] && (liq[l] === 0 || typ[l] === t)) { la = liq[l]; useL = la === 0 ? +(a >= L.minSpread) : +(a - la >= L.minDiff); }
      }
      if (x < W - 1) {
        const r = k + 1;
        if (!solid[r] && (liq[r] === 0 || typ[r] === t)) { ra = liq[r]; useR = ra === 0 ? +(a >= L.minSpread) : +(a - ra >= L.minDiff); }
      }
      if (useL || useR) {
        const n = 1 + useL + useR;
        const sum = a + (useL ? la : 0) + (useR ? ra : 0);
        const avg = (sum / n) | 0;
        // A side can exceed the three-way average even though it started below the centre. Move its excess
        // back first; assigning the final amounts directly used to discard its ingredients and energy.
        if (useL && la > avg) { carryHeat(k - 1, k, la - avg, a); a += la - avg; liq[k - 1] = avg; }
        if (useR && ra > avg) { carryHeat(k + 1, k, ra - avg, a); a += ra - avg; liq[k + 1] = avg; }
        if (useL) { if (avg > la) { carryHeat(k, k - 1, avg - la, la, a); a -= avg - la; } if (avg - la >= 8) flux[k - 1] = S.tick; liq[k - 1] = avg; typ[k - 1] = t; stamp[k - 1] = S.tick; }
        if (useR) { if (avg > ra) { carryHeat(k, k + 1, avg - ra, ra, a); a -= avg - ra; } if (avg - ra >= 8) flux[k + 1] = S.tick; liq[k + 1] = avg; typ[k + 1] = t; stamp[k + 1] = S.tick; }
        a = sum - avg * (n - 1);
        wake(k);
      }
      liq[k] = a;
    }
  }
}
function step() {
  S.tick++;
  liquidTick();
  momentumTick();
  devicesTick();
  pumpTick();
  if (S.tick & 1) pipesTick();
  powderTick();
  updateBodies();
  if (!(S.tick & 1)) heatTick();
  fireTick();
  observeLevel();
  if (S.pressure) { if (!(S.tick & 3)) pressureTick(); } else pressureOff();
  if (!(S.tick & 3)) soluteTick();
  if ((S.tick & 3) === 2) gasTick();
  if ((S.tick & 3) === 1) erosionTick();
  airTick();
  biomeTick();
  weatherTick();
  if ((S.tick & 15) === 5) plantTick();
  if ((S.tick & 15) === 7) ecoTick();
  if ((S.tick & 3) === 2) materialsTick();
  if ((S.tick & 3) === 3) chemTick();
  if ((S.tick & 3) === 1) airTickOx();
  for (let i = 0; i < awake.length; i++) if (awake[i]) awake[i]--;
}

export { CONVECT, carryHeat, liquidTick, step };
