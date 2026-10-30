// Erosion: water flowing fast past dirt or sand wears it away and carries it as silt (a dissolved channel, so it
// moves with the flow and sinks like brine). Where the water lies still, the silt settles out as mud on the bottom,
// and mud on the bottom under still water or more mud slowly packs down into wet soil, so rivers carve channels and
// build up deltas. Over time a river cuts a valley: it wears the soil over it as well as beside and under it, and a
// bank it has undercut slumps into it as mud, which it washes away. At its mouth, in still water, the silt sinks to
// the bottom and settles there, and even lightly silty water lays its silt on a mud bed, so the delta grows.
import { DIRT, H, MUD, NSOL, SAND, SOL_SILT, W, WATER, WETDIRT } from './config.js';
import { ecoDecay, ecoDeposit, ecoMethane, ecoState } from './ecology.js';
import { AIR_CAP, BCAP, LCAP, dissolvedHeatCapacity, poreHeatCapacity } from './matter.js';
import { movePoreWater } from './materials.js';
import { carryHeat } from './sim.js';
import { addSoluteAmount, clearSol, soluteAmount, takeSoluteAmount } from './solutes.js';
import { S, drop, flux, heatWake, held, latent, liq, markDirty, sol, solid, temp, typ, vel, wake } from './world.js';

const ERODE = 0.004, FALL_BOOST = 3;   // chance per eroding side per erosion tick; water landing from a fall erodes more
const SILT_PER_BLOCK = 48, STILL_TICKS = 40, SETTLE_SILT = 120, PACK = 0.002, SWAMP_GAS = 0.004, MUD_WASH = 0.04;
const MUD_BREATH = 1, ANOXIC = 0.5;   // mud's use of oxygen; the water's oxygen (mg/L) below which mud gives methane
const SLUMP = 0.5, BED_SILT = 24;   // a slump's chance relative to wearing; silt that settles onto a mud bed

// Water that's really moving: it has had a good amount flow in lately, and it's running sideways or has fallen from
// two rows up or more (a still pool topping itself up as its floor soaks some in doesn't count).
function flowing(k) { return S.tick - flux[k] < 5 && (Math.abs(vel[k]) > 0.05 || drop[k] >= 2); }
const SOFT = b => b === DIRT || b === SAND || b === WETDIRT;   // what water wears away
const erosionCell = k => Number.isInteger(k) && k >= 0 && k < W * H;
function erosionCapacity(k) {
  if (solid[k] === DIRT || solid[k] === WETDIRT) return poreHeatCapacity(solid[k], held[k], sol, k * NSOL);
  if (solid[k] === SAND) { const f = (held[k] || 255) / 255; return BCAP[SAND] * f + AIR_CAP * (1 - f); }
  if (solid[k]) return BCAP[solid[k]];
  const f = liq[k] / 255;
  return liq[k] ? LCAP[typ[k]] * f + dissolvedHeatCapacity(liq[k], sol, k * NSOL) + AIR_CAP * (1 - f) : AIR_CAP;
}
function erosionEnergy(cells) { return cells.reduce((sum, k) => sum + temp[k] * erosionCapacity(k) + latent[k], 0); }
function retainErosionHeat(cells, before) {
  // Mineral grains remain a coarse representation. Preserve the old modeled energy when a
  // dry matrix disappears or WATER/MUD/porewater changes capacity, rather than preserving T
  // and silently adding/removing heat. Pending phase energy already follows the actual parcel.
  const receiver = cells.reduce((best, k) => erosionCapacity(k) > erosionCapacity(best) ? k : best);
  temp[receiver] += (before - erosionEnergy(cells)) / erosionCapacity(receiver);
  for (const k of cells) heatWake(k);
}
function releaseErodedSoil(k) {
  const soil = ecoState().soil;
  if (soil[k]) { ecoDeposit(k, soil[k]); delete soil[k]; } // existing sediment settles/recycles; no fresh endowment
}
function erodeBank(k, bank) {
  if (!erosionCell(k) || !erosionCell(bank) || !liq[k] || typ[k] !== WATER || !SOFT(solid[bank]) || liq[bank]) return false;
  const wet = solid[bank] !== SAND ? held[bank] : 0;
  if (!Number.isFinite(wet) || wet < 0 || wet > 255) return false;
  const before = erosionEnergy([k, bank]);
  if (wet) movePoreWater(bank, k, Math.min(wet, 255 - liq[k]), true, false);
  const remaining = solid[bank] !== SAND ? held[bank] : 0;
  // Liquid storage is integral; retain a fractional porewater residue in its bank.
  if (!Number.isInteger(remaining)) { retainErosionHeat([k, bank], before); return false; }
  solid[bank] = 0; held[bank] = 0;
  if (remaining) { liq[bank] = remaining; typ[bank] = WATER; }
  else { liq[bank] = 0; typ[bank] = 0; clearSol(bank); latent[k] += latent[bank]; latent[bank] = 0; }
  addSoluteAmount(k, SOL_SILT, SILT_PER_BLOCK * liq[k] / 255);
  releaseErodedSoil(bank); retainErosionHeat([k, bank], before);
  markDirty(bank % W, (bank / W) | 0); wake(k); wake(bank); return true;
}
function slumpBank(k, bank) {
  if (!erosionCell(k) || !erosionCell(bank) || !liq[k] || typ[k] !== WATER || !SOFT(solid[bank]) || liq[bank]) return false;
  const wet = solid[bank] !== SAND ? held[bank] : 0;
  if (!Number.isInteger(wet) || wet < 0 || wet > 255) return false;
  const wanted = Math.max(160, wet), additional = wanted - wet;
  if (additional > liq[k]) return false; // a dry bank cannot create its wetting water
  const before = erosionEnergy([k, bank]);
  if (!wet) { held[bank] = 0; clearSol(bank); }
  solid[bank] = wet ? WETDIRT : DIRT;
  if (additional) movePoreWater(k, bank, additional, false, true);
  solid[bank] = 0; liq[bank] = held[bank]; held[bank] = 0; typ[bank] = MUD;
  releaseErodedSoil(bank); retainErosionHeat([k, bank], before);
  markDirty(bank % W, (bank / W) | 0); wake(k); wake(bank); return true;
}
function washMud(k) {
  if (!erosionCell(k) || !liq[k] || typ[k] !== MUD || solid[k]) return false;
  const before = erosionEnergy([k]);
  // MUD's implicit sediment fills a missing load once; reclassification must not add it again.
  typ[k] = WATER; addSoluteAmount(k, SOL_SILT, Math.max(0, liq[k] - soluteAmount(k, SOL_SILT)));
  releaseErodedSoil(k); retainErosionHeat([k], before); wake(k); return true;
}
function settleSilt(k, below) {
  if (!erosionCell(k) || !erosionCell(below) || !liq[k] || !liq[below] || typ[k] !== WATER || typ[below] !== WATER) return 0;
  const room = Math.max(0, (255 - sol[below * NSOL + SOL_SILT]) * liq[below] / 255);
  const moved = takeSoluteAmount(k, SOL_SILT, Math.min(Math.max(0, soluteAmount(k, SOL_SILT)), room));
  addSoluteAmount(below, SOL_SILT, moved); return moved;
}
function depositMud(k, bed) {
  if (!erosionCell(k) || !erosionCell(bed) || !liq[k] || typ[k] !== WATER || !liq[bed] || typ[bed] !== MUD) return 0;
  const moved = Math.min(liq[k], 255 - liq[bed], Math.max(1, Math.floor(soluteAmount(k, SOL_SILT))));
  if (!(moved > 0)) return 0;
  const before = erosionEnergy([k, bed]);
  carryHeat(k, bed, moved, liq[bed]); liq[k] -= moved; liq[bed] += moved;
  if (!liq[k]) { typ[k] = 0; clearSol(k); }
  retainErosionHeat([k, bed], before); wake(k); wake(bed); return moved;
}
function settleMud(k) {
  if (!erosionCell(k) || !liq[k] || typ[k] !== WATER || solid[k]) return false;
  const before = erosionEnergy([k]); typ[k] = MUD;
  retainErosionHeat([k], before); wake(k); return true;
}
function packMud(k) {
  if (!erosionCell(k) || !liq[k] || typ[k] !== MUD || solid[k]) return false;
  const before = erosionEnergy([k]);
  solid[k] = WETDIRT; held[k] = liq[k]; liq[k] = 0; typ[k] = 0;
  retainErosionHeat([k], before); markDirty(k % W, (k / W) | 0); wake(k); return true;
}
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
          erodeBank(k, o);
        }
        // a bank the river has undercut (soil over open water or air beside it) slumps into the river as mud
        for (const o of [x > 0 ? k - 1 - W : -1, x < W - 1 ? k + 1 - W : -1]) {
          if (o < 0 || !SOFT(solid[o]) || solid[o + W] || Math.random() > chance * SLUMP) continue;
          slumpBank(k, o);
        }
        if (!liq[k]) continue;
        // and washes away mud lying beside or under it
        for (const o of [k + W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1]) {
          if (o < 0 || !liq[o] || typ[o] !== MUD || Math.random() > MUD_WASH * Math.min(1, 48 / liq[o])) continue;
          washMud(o);
        }
      } else if (sol[p] && S.tick - flux[k] > STILL_TICKS && liq[k + W] && typ[k + W] === WATER) {
        // in still water silt sinks out of suspension, so it gathers at the bottom, where it settles as mud
        settleSilt(k, k + W);
      } else if (sol[p] >= BED_SILT && S.tick - flux[k] > STILL_TICKS && liq[k + W] && typ[k + W] === MUD && liq[k + W] < 255) {
        // still water over a mud bed lays its silt on the bed, however little: a delta grows where a river stills
        depositMud(k, k + W);
      } else if (sol[p] >= SETTLE_SILT && S.tick - flux[k] > STILL_TICKS && (solid[k + W] || typ[k + W] === MUD)) {
        // still, silty water on the bottom drops its load as mud
        settleMud(k);
      }
    } else if (t === MUD && liq[k - W] && typ[k - W] === WATER && rots(k)) {
      // with the water's oxygen gone, mud rotting under it bubbles methane up to the surface
      // rots() already debited finite substrate and retained/emitted the measured products.
    } else if (t === MUD && solid[k + W] && liq[k - W] && (typ[k - W] === WATER || typ[k - W] === MUD) && !flowing(k - W) && Math.random() < PACK) {
      packMud(k);
    }
  }
}

// Rot in a mud bed uses the oxygen in the water over it; true when, with that oxygen gone, it gives off swamp gas.
function rots(k) {
  const used = ecoDecay(k, k - W);
  return !used && ecoMethane(k, k - W) > 0;
}

export { erosionCapacity, erosionEnergy, erodeBank, slumpBank, washMud, settleSilt, depositMud, settleMud, packMud,
  rots, SLUMP, BED_SILT, SOFT, ERODE, FALL_BOOST, SILT_PER_BLOCK, STILL_TICKS, SETTLE_SILT, PACK, SWAMP_GAS, MUD_WASH, flowing, erosionTick };
