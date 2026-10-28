// Erosion: water flowing fast past dirt or sand wears it away and carries it as silt (a dissolved channel, so it
// moves with the flow and sinks like brine). Where the water lies still, the silt settles out as mud on the bottom,
// and mud on the bottom under still water or more mud slowly packs down into dirt, so rivers carve channels and
// build up deltas. Over time a river cuts a valley: it wears the soil over it as well as beside and under it, and a
// bank it has undercut slumps into it as mud, which it washes away. At its mouth, in still water, the silt sinks to
// the bottom and settles there, and even lightly silty water lays its silt on a mud bed, so the delta grows.
import { DIRT, H, METHANE, MUD, NSOL, SAND, SOL_O2, SOL_SILT, W, WATER, WETDIRT } from './config.js';
import { oxygenIn } from './oxygen.js';
import { held } from './world.js';
import { S, drop, flux, liq, markDirty, sol, solid, typ, vel, wake } from './world.js';

const ERODE = 0.004, FALL_BOOST = 3;   // chance per eroding side per erosion tick; water landing from a fall erodes more
const SILT_PER_BLOCK = 48, STILL_TICKS = 40, SETTLE_SILT = 120, PACK = 0.002, SWAMP_GAS = 0.004, MUD_WASH = 0.04;
const MUD_BREATH = 1, ANOXIC = 0.5;   // mud's use of oxygen; the water's oxygen (mg/L) below which mud gives methane
const SLUMP = 0.5, BED_SILT = 24;   // a slump's chance relative to wearing; silt that settles onto a mud bed

// Water that's really moving: it has had a good amount flow in lately, and it's running sideways or has fallen from
// two rows up or more (a still pool topping itself up as its floor soaks some in doesn't count).
function flowing(k) { return S.tick - flux[k] < 5 && (Math.abs(vel[k]) > 0.05 || drop[k] >= 2); }
const SOFT = b => b === DIRT || b === SAND || b === WETDIRT;   // what water wears away
function erosionTick() {
  for (let k = W; k < W * H - W; k++) {
    if (!liq[k]) continue;
    const t = typ[k], x = k % W, p = k * NSOL + SOL_SILT;
    if (t === WATER) {
      if (flowing(k)) {
        if (sol[p] > 200) continue;
        const chance = ERODE * (drop[k] >= 4 ? FALL_BOOST : 1);
        for (const o of [k + W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W]) {   // under, beside, and over it
          if (o < 0 || !SOFT(solid[o])) continue;
          if (Math.random() > chance * (solid[o] === SAND ? 2 : solid[o] === WETDIRT ? 1.5 : 1) * (o === k - W ? 0.5 : 1)) continue;
          const wet = solid[o] === WETDIRT ? held[o] : 0, into = Math.min(wet, 255 - liq[k]);
          solid[o] = 0; held[o] = 0; markDirty(o % W, (o / W) | 0);
          liq[k] += into;   // a wet bank's water joins the river; what doesn't fit stays where the bank was
          if (wet > into) { liq[o] = wet - into; typ[o] = WATER; sol.fill(0, o * NSOL, o * NSOL + NSOL); }
          sol[p] = Math.min(255, sol[p] + SILT_PER_BLOCK); wake(k);
        }
        // a bank the river has undercut (soil over open water or air beside it) slumps into the river as mud
        for (const o of [x > 0 ? k - 1 - W : -1, x < W - 1 ? k + 1 - W : -1]) {
          if (o < 0 || !SOFT(solid[o]) || solid[o + W] || Math.random() > chance * SLUMP) continue;
          const wet = solid[o] === WETDIRT ? held[o] : 0;
          solid[o] = 0; held[o] = 0; liq[o] = Math.min(255, 160 + wet); typ[o] = MUD; sol.fill(0, o * NSOL, o * NSOL + NSOL);
          markDirty(o % W, (o / W) | 0); wake(o);
        }
        // and washes away mud lying beside or under it
        for (const o of [k + W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1]) {
          if (o < 0 || !liq[o] || typ[o] !== MUD || Math.random() > MUD_WASH) continue;
          const take = Math.min(liq[o], 48);
          liq[o] -= take; if (!liq[o]) typ[o] = 0;
          sol[p] = Math.min(255, sol[p] + take); wake(o);
        }
      } else if (sol[p] && S.tick - flux[k] > STILL_TICKS && liq[k + W] && typ[k + W] === WATER) {
        // in still water silt sinks out of suspension, so it gathers at the bottom, where it settles as mud
        const q = (k + W) * NSOL + SOL_SILT, m = Math.min(sol[p], 255 - sol[q]);
        sol[q] += m; sol[p] -= m;
      } else if (sol[p] >= BED_SILT && S.tick - flux[k] > STILL_TICKS && liq[k + W] && typ[k + W] === MUD && liq[k + W] < 255) {
        // still water over a mud bed lays its silt on the bed, however little: a delta grows where a river stills
        const m = Math.min(255 - liq[k + W], Math.max(1, (liq[k] * sol[p] / 255) | 0));
        liq[k + W] += m; sol[p] = 0; wake(k);
      } else if (sol[p] >= SETTLE_SILT && S.tick - flux[k] > STILL_TICKS && (solid[k + W] || typ[k + W] === MUD)) {
        // still, silty water on the bottom drops its load as mud
        liq[k] = Math.max(32, (liq[k] * sol[p] / 255) | 0); typ[k] = MUD; sol.fill(0, k * NSOL, k * NSOL + NSOL); wake(k);
      }
    } else if (t === MUD && liq[k - W] && typ[k - W] === WATER && rots(k)) {
      // with the water's oxygen gone, mud rotting under it bubbles methane up to the surface
      let s = k - W;
      while (s >= W && liq[s - W] && typ[s - W] === WATER) s -= W;
      const top = s - W;
      if (top >= 0 && !solid[top] && (!liq[top] || (typ[top] === METHANE && liq[top] < 220))) { liq[top] += 32; typ[top] = METHANE; wake(top); }
    } else if (t === MUD && solid[k + W] && liq[k - W] && (typ[k - W] === WATER || typ[k - W] === MUD) && !flowing(k - W) && Math.random() < PACK) {
      solid[k] = DIRT; liq[k] = 0; typ[k] = 0; markDirty(x, (k / W) | 0);
    }
  }
}

// Rot in a mud bed uses the oxygen in the water over it; true when, with that oxygen gone, it gives off swamp gas.
function rots(k) {
  const p = (k - W) * NSOL + SOL_O2;
  if (Math.random() < MUD_BREATH) sol[p] = Math.min(255, sol[p] + 1);
  return oxygenIn(k - W) < ANOXIC && Math.random() < SWAMP_GAS;
}

export { rots, SLUMP, BED_SILT, SOFT, ERODE, FALL_BOOST, SILT_PER_BLOCK, STILL_TICKS, SETTLE_SILT, PACK, SWAMP_GAS, MUD_WASH, flowing, erosionTick };
