// Temperature: diffusion between tiles, heat sources, and phase changes (boil, freeze, melt, harden).
import { explode } from './blast.js';
import { LAPSE, SEA, ambient, skyColumns } from './climate.js';
import { ACID, AETHER, AIR, BASALT, BLOOM, BRICK, CHUNK, CLAY, COMB, CRISP, CRYSTAL, DIRT, FOAM, FROST, GLASS, H, HONEY, ICE, LAVA, METAL, MOLTEN, MUD, NBLOCK, NITRO, NLIQ, NSOL, OBSIDIAN, OIL, PERMAFROST, POISON, PUMP_IN, PUMP_OUT, QUICK, SALT, SLIME, SNOW, SOL_SALT, SOL_SILT, SOL_SUGAR, STEAM, STORM, TONIC, W, WATER, WOOD } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { solidify } from './reactions.js';
import { ecoHoneyCaramel, ecoMeltComb } from './ecology.js';
import { addSoluteAmount, clearSol, soluteAmount, setSoluteAmount } from './solutes.js';
import { CHH, CW, HEAT_AWAKE, S, afloat, deco, drop, heatAwake, held, latent, liq, markDirty, meltAmount, sol, solid, temp, temp2, typ, under, wake } from './world.js';
import { ASH, COPPER, LIMESTONE, POROUS, QUICKLIME, SAND, SODA, SPONGE, STONE, WETDIRT, WETSPONGE, WOOL } from './config.js';
import { FNITRO, MSLAG, ORE, RUST, SLAG, SUGAR, THERMO } from './config.js';
import { SOL_ETHANOL, SOL_O2, SOL_CO2 } from './config.js';
import { AIR_CAP, AIR_COND, BCAP, BCOND, HEAT_SPEED, LATENT, LCAP, LCOND, L_BOIL_WATER, L_FUSION_IRON, L_FUSION_ROCK, L_FUSION_WATER, dissolvedHeatCapacity, poreHeatCapacity } from './matter.js';











// Real temperatures (°C) at which things change; latent heat (js/matter.js) holds a tile at the first five while it
// melts, boils, freezes, condenses or sets.
const MELT_ICE = 0, BOIL_WATER = 100, LAVA_SETS = 1000, IRON_MELTS = 1538, CAST_IRON_SETS = 1150, SLAG_SETS = 1300;   // molten iron is carbon-rich (cast) iron, liquid down to 1150°
const LAVA_HEAT = 1150, LAVA_KEEP = 0.08;   // deep lava is kept hot by the melt around it (a pool's own reservoir)
const NITRO_FREEZE = 12, NITRO_THAW = 14;   // nitroglycerin melts at 13°; it freezes into a block that's safe to drop and dig
const NITRO_HEAT = 218, QUICK_BOIL = 357, WAX_MELT = 64, METAL_MELT = IRON_MELTS, SNOW_MELT = MELT_ICE, SNOW_WATER = 64, CLAY_BAKE = 900;
const ACID_BOIL = 300, SUGAR_BURNS = 170, HONEY_BURNS = 160, MUD_DRIES = 100;
const SALT_FREEZE = 0.085, SOLUTE_BOIL = 0.035;   // degrees lower freezing, higher boiling, per unit of dissolved salt (and sugar)
const ETHANOL_BOILS = 78.37, DISTIL = 0.1, DISTIL_TAKE = 255;
// A bounded game-scale equilibrium approximation. Concentration is relative to the carrier, not measured ABV.
// The full ethanol/water activity-coefficient model remains a later material-data task. Dilute liquid neither boils
// at pure ethanol's boiling point nor yields pure ethanol vapor in one pass.
const ETHANOL_VOLATILITY = 4, DISTIL_ENRICH_LIMIT = 0.96, L_BOIL_ETHANOL = 846, ETHANOL_RHO = 0.789;
const ETHANOL_DEW = (BOIL_WATER - ETHANOL_BOILS) / 255;
const vaporOffset = fraction => (1 - fraction) * (L_BOIL_WATER * LATENT + (LCAP[WATER] - LCAP[STEAM]) * BOIL_WATER)
  + fraction * (L_BOIL_ETHANOL * ETHANOL_RHO * LATENT + (LCAP[WATER] - LCAP[STEAM]) * ETHANOL_BOILS);
const mixtureBoiling = concentration => BOIL_WATER - Math.max(0, Math.min(255, concentration)) * ETHANOL_DEW;
const vaporFraction = fraction => Math.min(Math.max(fraction, DISTIL_ENRICH_LIMIT), ETHANOL_VOLATILITY * fraction / (1 + (ETHANOL_VOLATILITY - 1) * fraction));
const vaporDew = concentration => {
  const f = Math.max(0, Math.min(1, concentration / 255));
  return mixtureBoiling(255 * f / (ETHANOL_VOLATILITY - (ETHANOL_VOLATILITY - 1) * f));
};
// Dirt's held field stores pore water, so a partial silt residue cannot use that block inventory yet.
const RESIDUE_BLOCK = { [SOL_SALT]: SALT, [SOL_SUGAR]: SUGAR };
const VOLATILE_SOLUTES = new Set([SOL_ETHANOL, SOL_O2, SOL_CO2]);
const NONVOLATILE_CHANNELS = Array.from({ length: NSOL }, (_, i) => i).filter(i => !VOLATILE_SOLUTES.has(i));
const PARTIAL_HEAT = new Set([SALT, SUGAR, SAND, SNOW, SODA, ASH, QUICKLIME, ICE, CRISP, FNITRO, METAL, SLAG, BASALT]);
const PORE_HEAT = new Set([DIRT, WETDIRT, SPONGE, WETSPONGE]);
const ALIVE = new Uint8Array(NLIQ);
[ACID, LAVA, FROST, AETHER, SLIME, BLOOM, TONIC, FOAM, MOLTEN, MSLAG, NITRO].forEach(t => { ALIVE[t] = 1; });
// Natural ground: it rests at the climate's temperature for its depth (js/climate.js), standing in for the earth
// around it. Everything else, liquids and placed blocks included, only trades heat with its neighbours.
const GROUND = new Uint8Array(NBLOCK);
[STONE, DIRT, WETDIRT, SAND, CLAY, BASALT, OBSIDIAN, PERMAFROST, ORE, POROUS, BRICK, LIMESTONE].forEach(b => { GROUND[b] = 1; });
// Each tile's heat capacity (J/K) and conductance this heat tick, from what's in it.
const cap = new Float32Array(W * H), cond = new Float32Array(W * H);
const occupiedCapacity = (capacity, amount) => capacity * amount / 255 + AIR_CAP * (1 - amount / 255);
const liquidCapacity = (k, amount = liq[k]) => LCAP[typ[k]] * amount / 255 + dissolvedHeatCapacity(amount, sol, k * NSOL);

const skyRow = new Float32Array(W);
// Heat sleeps where it has settled. A chunk whose tiles all changed by less than SETTLED in a heat tick falls asleep
// after HEAT_AWAKE such ticks; a sleeping chunk is updated only every SLEEP_EVERY heat ticks (a different eighth of
// them each tick), and that update stands in for the ticks it skipped. Any bigger change wakes it, as do
// `heatWake` (js/world.js) and `markDirty`.
const SETTLED = 0.05, SLEEP_EVERY = 8;
const steps = new Uint8Array(CW * CHH);   // heat ticks each chunk covers this tick: 0 skipped, 1 awake, SLEEP_EVERY catching up
const change = new Float32Array(CW * CHH);   // the biggest change of temperature in each chunk this tick
const chunkSlime = new Uint16Array(CW * CHH);   // slime tiles in each chunk when it was last updated
// Fills in every tile's heat capacity and conductance: a block's own, a liquid's mixed with the air in the rest of its
// tile, or air's. An empty tile forgets any half-finished melting or boiling.
function fillMatter() {
  for (let k = 0; k < W * H; k++) {
    const b = solid[k];
    if (PORE_HEAT.has(b)) { cap[k] = poreHeatCapacity(b, held[k], sol, k * NSOL); cond[k] = BCOND[b]; continue; }
    if (b) { cap[k] = occupiedCapacity(BCAP[b], PARTIAL_HEAT.has(b) ? (held[k] || 255) : 255) + (b === ICE ? dissolvedHeatCapacity(held[k] || 255, sol, k * NSOL) : 0); cond[k] = BCOND[b]; continue; }
    const a = liq[k];
    if (!a) { cap[k] = AIR_CAP; cond[k] = AIR_COND; latent[k] = 0; continue; }
    const f = a / 255, t = typ[k];
    cap[k] = liquidCapacity(k) + (1 - f) * AIR_CAP; cond[k] = f * LCOND[t] + (1 - f) * AIR_COND;
  }
}
// The new temperature of tile k after m heat ticks. Heat flows to and from each neighbour in proportion to the
// difference in temperature and the pair's conductance (the harmonic mean of theirs: the poorer one limits it), and
// changes the tile's temperature by that heat over its capacity. The same flow leaves one tile and enters the other,
// so heat is conserved; only the surroundings (the sky, the rock's resting temperature, lava's own reservoir) add or
// take it. One tick closes a fraction r of the gap to the conductance-weighted average of the neighbours; m ticks
// close 1 - (1 - r)^m of it (m is 1, or 8 for a sleeping chunk catching up).
function tileHeat(k, x, y, m) {
  const T0 = temp[k], g = cond[k], sky = skyRow[x] + (y - SEA) * LAPSE, rest = under[k] ? ambient[k] : sky;
  let s = 0, gs = 0, q, o;
  if (x > 0) { o = cond[k - 1]; q = 2 * g * o / (g + o); s += q * temp[k - 1]; gs += q; }
  if (x < W - 1) { o = cond[k + 1]; q = 2 * g * o / (g + o); s += q * temp[k + 1]; gs += q; }
  if (y > 0) { o = cond[k - W]; q = 2 * g * o / (g + o); s += q * temp[k - W]; gs += q; }
  if (y < H - 1) { o = cond[k + W]; q = 2 * g * o / (g + o); s += q * temp[k + W]; gs += q; }
  let r = Math.min(0.9, HEAT_SPEED * gs / cap[k]);
  let Tn = gs ? T0 + (s / gs - T0) * r : T0;
  const b = solid[k], a = liq[k];
  if (b) { if (GROUND[b]) { Tn += (ambient[k] - T0) * 0.0005; r += 0.0005; } }   // the earth's own heat holds natural ground at its resting temperature
  else if (a) {
    if (typ[k] === LAVA) { Tn += (LAVA_HEAT - Tn) * LAVA_KEEP * a / 255; r += LAVA_KEEP * a / 255; }   // deep lava keeps itself hot; thin films can't
    if (!under[k] && y > 0 && !solid[k - W] && !liq[k - W]) { Tn += (sky - Tn) * 0.01; r += 0.01; }   // a surface open to the sky follows the weather
  } else {   // air settles to the sky or cave temperature
    const rr = under[k] ? 0.01 : 0.05;
    Tn += (rest - T0) * rr; r += rr;
  }
  if (m > 1) { const q1 = 1 - Math.min(1, r), q2 = q1 * q1, q4 = q2 * q2; Tn = T0 + (Tn - T0) * (1 - q4 * q4) / r; }
  return Tn;
}
function heatTick() {
  skyColumns(skyRow);
  fillMatter();
  for (let c = 0; c < steps.length; c++) {
    steps[c] = heatAwake[c] ? 1 : ((c + (S.tick >> 1)) & (SLEEP_EVERY - 1)) === 0 ? SLEEP_EVERY : 0;
    change[c] = 0;
  }
  for (let cy = 0; cy < CHH; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx, m = steps[c];
    if (!m) continue;
    let most = 0;
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK, k = y * W + x; x < (cx + 1) * CHUNK; x++, k++) {
      const Tn = tileHeat(k, x, y, m), d = Math.abs(Tn - temp[k]);
      if (d > most) most = d;
      temp2[k] = Tn;
    }
    change[c] = most;
  }
  for (let cy = 0; cy < CHH; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx;
    if (!steps[c]) continue;
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) { const k = y * W + cx * CHUNK; temp.set(temp2.subarray(k, k + CHUNK), k); }
    if (change[c] > SETTLED * steps[c]) heatAwake[c] = HEAT_AWAKE;
    else if (heatAwake[c]) heatAwake[c]--;
  }
  // phase changes, in the chunks updated this tick; chances per tick are multiplied by the ticks the update covers
  let slime = 0;
  for (let c = 0; c < steps.length; c++) {
    const m = steps[c];
    if (m) chunkSlime[c] = phaseChanges(c, m);
    slime += chunkSlime[c];
  }
  S.slimeCount = slime;
}
// Latent heat. A tile's heat is its temperature × capacity plus latent[k]: heat taken in (+) part-way through melting
// or boiling, or given out (−) part-way through freezing, condensing or setting. Each heat tick `balance` looks at the
// total: between the two points where the tile changes state (lo, hi) it's all temperature; past one, the tile is held
// at that point and the rest is latent, and once that reaches the change's latent heat (need, J for the tile) the change
// happens. It returns +1 (melt or boil), −1 (freeze, condense or set) or 0, and leaves the heat left over in `spare`.
// Liquid transport also transports latent[k]; it belongs to the material whose phase change is in progress.
let spare = 0;
function balance(k, lo, hi, needLo, needHi) {
  const Te = temp[k] + latent[k] / cap[k];
  if (Te > hi) {
    latent[k] = (Te - hi) * cap[k]; temp[k] = hi;
    if (latent[k] >= needHi) { spare = latent[k] - needHi; latent[k] = 0; return 1; }
  } else if (Te < lo) {
    latent[k] = -(lo - Te) * cap[k]; temp[k] = lo;
    if (-latent[k] >= needLo) { spare = -latent[k] - needLo; latent[k] = 0; return -1; }
  } else { temp[k] = Te; latent[k] = 0; }
  return 0;
}
// Whether the liquid in tile k is resting on something: falling water, lava or metal doesn't freeze or set in mid-air.
const restsOn = k => k >= W * H - W || solid[k + W] || liq[k + W];
// The latent heat (J) to melt, boil or set the tile: per gram × density × how full it is.
const needOf = (perGram, rho, amount) => perGram * LATENT * rho * (amount || 255) / 255;
// After a change of state the tile's capacity is the new material's: the left-over heat warms (or cools) it from `at`.
function afterChange(k, at, extra, newCap, up) { temp[k] = at + (up ? 1 : -1) * extra / newCap; }

// Boils, freezes, melts and hardens the tiles of chunk c, standing in for m heat ticks; returns its slime tiles.
function phaseChanges(c, m) {
  const cx = c % CW, cy = (c / CW) | 0;
  let slime = 0;
  for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK, k = y * W + x; x < (cx + 1) * CHUNK; x++, k++) {
    const Tk = temp[k];
    if (deco[k] && (solid[k] || Tk > 150 || (liq[k] > 128 && typ[k] !== BLOOM))) deco[k] = 0;
    if (liq[k]) {
      const t = typ[k], a = liq[k];
      if (ALIVE[t]) wake(k);
      if (t === FROST) temp[k] = Math.min(Tk, -40);
      else if (t === LAVA) {
        if (balance(k, restsOn(k) ? LAVA_SETS : -Infinity, Infinity, needOf(L_FUSION_ROCK, 2.7, a), 0) < 0) { solidify(k, BASALT); afterChange(k, LAVA_SETS, spare, occupiedCapacity(BCAP[BASALT], a), false); puff(k, 'steam'); }
      }
      else if (t === QUICK) { if (Tk > QUICK_BOIL) { typ[k] = POISON; wake(k); puff(k, 'smoke'); } }   // toxic mercury vapour
      else if (t === FOAM) { if (Tk > 90) { typ[k] = OIL; liq[k] = Math.max(1, liq[k] >> 1); wake(k); puff(k, 'steam'); } }   // its water boils off
      else if (t === WATER) {
        // salt and sugar raise the boiling point and salt lowers the freezing point; boiling leaves them behind.
        // Falling water doesn't freeze, so cold rain lands as water.
        const p = k * NSOL, boils = mixtureBoiling(sol[p + SOL_ETHANOL]) + Math.min(255, sol[p + SOL_SALT] + sol[p + SOL_SUGAR]) * SOLUTE_BOIL, freezes = MELT_ICE - sol[p + SOL_SALT] * SALT_FREEZE;
        const hasResidue = hasNonvolatile(k);
        if ((sol[p + SOL_ETHANOL] || hasResidue) && Math.random() < DISTIL) distil(k, p);
        if (!liq[k] || typ[k] !== WATER) continue;
        // A solution evaporates incrementally, retaining its ingredients. Unsupported residues keep their last
        // carrier drop until a material definition can represent them; they must not be silently discarded.
        const now = liq[k];
        cap[k] = liquidCapacity(k) + AIR_CAP * (1 - now / 255);
        const d = balance(k, restsOn(k) ? freezes : -Infinity, hasResidue || sol[p + SOL_ETHANOL] ? Infinity : boils, needOf(L_FUSION_WATER, 1, now), needOf(L_BOIL_WATER, 1, now));
        if (d > 0) {
          typ[k] = STEAM; afterChange(k, boils, spare, LCAP[STEAM] * now / 255 + AIR_CAP * (1 - now / 255), true); wake(k); if (Math.random() < 0.3) puff(k, 'steam');
        } else if (d < 0) {
          afloat[k] = k < W * H - W && !solid[k + W] ? 1 : 0;   // frozen on water: lake ice, which floats
          const contents = sol.slice(p, p + NSOL);
          solidify(k, ICE); sol.set(contents, p); afterChange(k, freezes, spare, occupiedCapacity(BCAP[ICE], now) + dissolvedHeatCapacity(now, contents), false);
        }
      }
      else if (t === STEAM) {   // condensing gives back the heat boiling took: steam scalds and warms what it touches
        const f = Math.max(0, Math.min(1, sol[k * NSOL + SOL_ETHANOL] / 255)), dew = vaporDew(sol[k * NSOL + SOL_ETHANOL]);
        const release = (vaporOffset(f) - (LCAP[WATER] - LCAP[STEAM]) * dew) * a / 255;
        if (balance(k, dew, Infinity, release, 0) < 0) { typ[k] = WATER; afterChange(k, dew, spare, liquidCapacity(k) + AIR_CAP * (1 - a / 255), false); wake(k); }
      }
      else if (t === HONEY) { if (Tk > HONEY_BURNS) { ecoHoneyCaramel(k); solidify(k, CRISP); puff(k, 'smoke'); } }
      else if (t === ACID) { if (Tk > ACID_BOIL) { liq[k] = 0; typ[k] = 0; wake(k); puff(k, 'smoke'); } }
      else if (t === STORM) { if (Tk > BOIL_WATER) { typ[k] = STEAM; temp[k] = 110; clearSol(k); wake(k); if (Math.random() < 0.3) puff(k, 'steam'); } }
      else if (t === NITRO) {   // nitro must go off at once, so its heat never sleeps
        heatAwake[c] = HEAT_AWAKE;
        if (Tk > NITRO_HEAT) explode(k);
        else if (Tk < NITRO_FREEZE && (k >= W * H - W || solid[k + W] || liq[k + W])) { drop[k] = 0; solidify(k, FNITRO); }   // falling nitro doesn't freeze
      }
      else if (t === MOLTEN) {
        if (balance(k, restsOn(k) ? CAST_IRON_SETS : -Infinity, Infinity, needOf(L_FUSION_IRON, 7, a), 0) < 0) { solidify(k, METAL); afterChange(k, CAST_IRON_SETS, spare, occupiedCapacity(BCAP[METAL], a), false); puff(k, 'smoke'); }
      }
      else if (t === MSLAG) {
        if (balance(k, restsOn(k) ? SLAG_SETS : -Infinity, Infinity, needOf(L_FUSION_ROCK, 2.7, a), 0) < 0) { solidify(k, SLAG); afterChange(k, SLAG_SETS, spare, occupiedCapacity(BCAP[SLAG], a), false); puff(k, 'smoke'); }
      }
      else if (t === MUD) { if (Tk > MUD_DRIES) { solidify(k, DIRT); puff(k, 'steam'); } }   // its water boils off; firing it into brick takes lava
      else if (t === SLIME) { slime++; if (Tk > 150) { liq[k] = 0; typ[k] = 0; wake(k); puff(k, 'smoke'); } }
    } else if (solid[k] === SNOW) {
      const melt = Math.max(1, Math.round((held[k] || 255) * SNOW_WATER / 255));   // snow melts into a quarter of its amount in water, taking the latent heat of that water
      if (balance(k, -Infinity, SNOW_MELT, 0, needOf(L_FUSION_WATER, 1, melt)) > 0) { held[k] = 0; solid[k] = AIR; liq[k] = melt; typ[k] = WATER; clearSol(k); afterChange(k, SNOW_MELT, spare, LCAP[WATER] * melt / 255 + AIR_CAP * (1 - melt / 255), true); markDirty(x, y); }
      else {
        if (!held[k] && k >= 3 * W && solid[k - W] === SNOW && solid[k - 2 * W] === SNOW && solid[k - 3 * W] && Math.random() < 0.0005 * m) {
          solid[k] = ICE; held[k] = SNOW_WATER; markDirty(x, y);   // deep snow packs into ice under its own weight
        }
      }
    } else if (solid[k] === FNITRO) {   // heat (a blast's, say) still sets frozen nitro off
      heatAwake[c] = HEAT_AWAKE;
      if (Tk > NITRO_THAW) { solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = NITRO; clearSol(k); markDirty(x, y); wake(k); if (Tk > NITRO_HEAT) explode(k); }
    } else if (solid[k] === PERMAFROST && Tk > MELT_ICE && Math.random() < 0.01 * m) {   // frozen ground thaws into mud
      solid[k] = AIR; liq[k] = 200; typ[k] = MUD; clearSol(k); markDirty(x, y);
    } else if (solid[k] === SUGAR && Tk > SUGAR_BURNS) {   // sugar caramelises into crisp honey
      solid[k] = CRISP; markDirty(x, y); puff(k, 'smoke');
    } else if (solid[k] === CLAY && Tk > CLAY_BAKE) {
      solid[k] = BRICK; markDirty(x, y);
    } else if (solid[k] === COMB && Tk > WAX_MELT) {   // the wax melts and the honey runs out
      const honey = ecoMeltComb(k);
      solid[k] = AIR; held[k] = 0; liq[k] = honey; typ[k] = honey ? HONEY : 0; clearSol(k); markDirty(x, y);
    } else if (solid[k] === METAL) {
      if (balance(k, -Infinity, METAL_MELT, 0, needOf(L_FUSION_IRON, 7.85, held[k])) > 0) { solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = MOLTEN; clearSol(k); afterChange(k, METAL_MELT, spare, occupiedCapacity(LCAP[MOLTEN], liq[k]), true); markDirty(x, y); }
    } else if (solid[k] === ICE && Math.random() < 0.01 * m && touches(k, SALT)) {   // salt melts ice into brine, and the salt block dissolves into it
      const s = neighbourOf(k, SALT), salt = held[s] || 255;
      solid[s] = AIR; held[s] = 0; markDirty(s % W, (s / W) | 0);
      latent[k] = 0; solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER;
      addSoluteAmount(k, SOL_SALT, salt); markDirty(x, y);
    } else if (solid[k] === ICE) {
      if (balance(k, -Infinity, MELT_ICE, 0, needOf(L_FUSION_WATER, 1, held[k])) > 0) { solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; afterChange(k, MELT_ICE, spare, liquidCapacity(k) + AIR_CAP * (1 - liq[k] / 255), true); markDirty(x, y); }
    }
  }
  return slime;
}

// Whether a block of kind b touches tile k.
// The first neighbouring tile holding block b, or -1.
function neighbourOf(k, b) {
  const x = k % W, y = (k / W) | 0;
  if (y > 0 && solid[k - W] === b) return k - W;
  if (x > 0 && solid[k - 1] === b) return k - 1;
  if (x < W - 1 && solid[k + 1] === b) return k + 1;
  if (y < H - 1 && solid[k + W] === b) return k + W;
  return -1;
}
function touches(k, b) {
  const x = k % W, y = (k / W) | 0;
  return (y > 0 && solid[k - W] === b) || (x > 0 && solid[k - 1] === b) || (x < W - 1 && solid[k + 1] === b) || (y < H - 1 && solid[k + W] === b);
}
// Liquid water warmer than 15° touching ice slowly melts it.
function warmWater(k) {
  const x = k % W, y = (k / W) | 0;
  for (const o of [y > 0 ? k - W : -1, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y < H - 1 ? k + W : -1]) {
    if (o >= 0 && liq[o] && typ[o] === WATER && temp[o] > 15) return true;
  }
  return false;
}
function hasNonvolatile(k) {
  const p = k * NSOL;
  for (const i of NONVOLATILE_CHANNELS) if (sol[p + i] > 0) return true;
  return false;
}
// Material enthalpy used by the incremental evaporator. Empty-cell air is excluded: this inventory follows the
// water/steam carrier, its dissolved contents and its stored phase energy. The phase offset is linear in ethanol
// content, so mixing two vapor parcels does not create or destroy their evaporation energy.
function phaseInventory(k) {
  if (!liq[k]) return 0;
  const f = liq[k] / 255, e = Math.max(0, Math.min(1, sol[k * NSOL + SOL_ETHANOL] / 255));
  return liquidCapacity(k) * temp[k] + f * (typ[k] === STEAM ? vaporOffset(e) : 0) + latent[k];
}
function receiveVapor(k, amount, contents, energy) {
  const before = liq[k], total = before + amount, previousEnergy = before ? phaseInventory(k) : 0;
  const previous = new Float64Array(NSOL);
  if (before) for (let i = 0; i < NSOL; i++) previous[i] = soluteAmount(k, i);
  liq[k] = total; typ[k] = STEAM;
  for (let i = 0; i < NSOL; i++) setSoluteAmount(k, i, previous[i] + contents[i]);
  const fraction = Math.max(0, Math.min(1, sol[k * NSOL + SOL_ETHANOL] / 255));
  latent[k] = 0;
  temp[k] = (previousEnergy + energy - vaporOffset(fraction) * total / 255) / liquidCapacity(k);
  wake(k);
}
// A vapor parcel bubbles through a continuous water column to its headspace. This coarse transport keeps
// its energy and contents; a solid roof or another liquid still blocks the outlet.
function vaporOutlet(k) {
  let up = k - W;
  while (up >= 0 && !solid[up] && liq[up] && typ[up] === WATER) up -= W;
  return up;
}
// Moves carrier and an enriched (never automatically pure) ethanol fraction into an available vapor cell. The
// source pays the vaporization energy, and every other ingredient retains its amount. Dissolved gases travel with
// the vapor parcel in this coarse model, instead of being recreated when it condenses.
function distil(k, p) {
  const up = vaporOutlet(k);
  if (!liq[k] || typ[k] !== WATER || up < 0 || solid[up] || (liq[up] && typ[up] !== STEAM) || liq[up] >= 255) return 0;
  if (liq[k] === 1) return leaveResidue(k) ? 1 : 0;
  const amount = liq[k], fraction = Math.max(0, Math.min(1, sol[p + SOL_ETHANOL] / 255)), enriched = vaporFraction(fraction);
  const boils = mixtureBoiling(sol[p + SOL_ETHANOL]) + Math.min(255, sol[p + SOL_SALT] + sol[p + SOL_SUGAR]) * SOLUTE_BOIL;
  const energy = phaseInventory(k), liquidAtBoil = LCAP[WATER] * boils, vaporAtBoil = LCAP[STEAM] * boils + vaporOffset(enriched);
  const costPerUnit = (vaporAtBoil - liquidAtBoil) / 255;
  const retainedCapacity = dissolvedHeatCapacity(amount, sol, p);
  const available = Math.max(0, energy - liquidAtBoil * amount / 255 - retainedCapacity * boils);
  const fuelLimit = enriched > 0 ? soluteAmount(k, SOL_ETHANOL) / enriched : Infinity;
  const mv = Math.floor(Math.min(DISTIL_TAKE, amount - 1, 255 - liq[up], fuelLimit, available / costPerUnit));
  if (!(mv > 0)) return 0;
  const contents = new Float64Array(NSOL), remaining = new Float64Array(NSOL);
  for (let i = 0; i < NSOL; i++) {
    const have = soluteAmount(k, i);
    contents[i] = i === SOL_ETHANOL ? enriched * mv : VOLATILE_SOLUTES.has(i) ? have * mv / amount : 0;
    remaining[i] = have - contents[i];
  }
  // The outgoing vapor carries its share of superheat. Leaving it at the boiling point while retaining all
  // sensible heat in the source traps hot liquid in a cold reflux loop, even when the heater supplies ample heat.
  const sharedTemperature = (energy - vaporOffset(enriched) * mv / 255)
    / (LCAP[WATER] * (amount - mv) / 255 + retainedCapacity + LCAP[STEAM] * mv / 255);
  const sentEnergy = (LCAP[STEAM] * sharedTemperature + vaporOffset(enriched)) * mv / 255;
  liq[k] = amount - mv;
  for (let i = 0; i < NSOL; i++) setSoluteAmount(k, i, remaining[i]);
  latent[k] = 0;
  temp[k] = (energy - sentEnergy) / liquidCapacity(k);
  receiveVapor(up, mv, contents, sentEnergy); wake(k);
  return mv;
}
// Final dry-out is atomic. Reserve a vapor cell and space for EVERY known residue before consuming the last carrier.
// Unknown residues or blocked products postpone drying; the liquid retains them until they can be represented.
function leaveResidue(k) {
  const water = liq[k], up = vaporOutlet(k), p = k * NSOL, x = k % W;
  if (!water || up < 0 || solid[up] || (liq[up] && typ[up] !== STEAM) || liq[up] + water > 255) return false;
  const contents = new Float64Array(NSOL), allocations = new Map();
  const sites = [k, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k < W * H - W ? k + W : -1];
  for (let i = 0; i < NSOL; i++) {
    const amount = soluteAmount(k, i);
    if (VOLATILE_SOLUTES.has(i)) { contents[i] = amount; continue; }
    if (amount <= 0) continue;
    const block = RESIDUE_BLOCK[i];
    if (!block) return false;
    let left = amount;
    for (const n of sites) {
      if (n < 0 || (n !== k && liq[n])) continue;
      const plan = allocations.get(n), existing = plan ? plan.block : solid[n];
      if (existing && existing !== block) continue;
      const base = solid[n] ? held[n] || 255 : 0, used = plan ? plan.amount : 0;
      const take = Math.min(left, Math.max(0, 255 - base - used));
      if (take > 0) { allocations.set(n, { block, amount: used + take }); left -= take; }
      if (left <= 1e-10) break;
    }
    if (left > 1e-10) return false;
  }
  const fraction = Math.max(0, Math.min(1, sol[p + SOL_ETHANOL] / 255));
  const boils = mixtureBoiling(sol[p + SOL_ETHANOL]) + Math.min(255, sol[p + SOL_SALT] + sol[p + SOL_SUGAR]) * SOLUTE_BOIL;
  const residueCapacity = [...allocations.values()].reduce((n, plan) => n + BCAP[plan.block] * plan.amount / 255, 0);
  const energy = phaseInventory(k), required = (LCAP[STEAM] * boils + vaporOffset(fraction)) * water / 255 + residueCapacity * boils;
  if (energy < required) return false;
  const sharedTemperature = (energy - vaporOffset(fraction) * water / 255) / (LCAP[STEAM] * water / 255 + residueCapacity);
  receiveVapor(up, water, contents, energy - residueCapacity * sharedTemperature);
  liq[k] = 0; typ[k] = 0; latent[k] = 0; clearSol(k);
  for (const [n, plan] of allocations) {
    const before = solid[n] ? held[n] || 255 : 0, total = before + plan.amount;
    temp[n] = (temp[n] * before + sharedTemperature * plan.amount) / total;
    solid[n] = plan.block; held[n] = total >= 255 ? 0 : total;
    markDirty(n % W, (n / W) | 0);
  }
  markDirty(x, (k / W) | 0); puff(k, 'steam');
  return true;
}

export { ETHANOL_BOILS, DISTIL, distil, vaporFraction, vaporOffset, mixtureBoiling, phaseInventory, GROUND, MELT_ICE, BOIL_WATER, LAVA_SETS, IRON_MELTS, SLAG_SETS, LAVA_HEAT, LAVA_KEEP, ACID_BOIL, SUGAR_BURNS, HONEY_BURNS, MUD_DRIES, SALT_FREEZE, SOLUTE_BOIL, cap, cond, fillMatter, balance, NITRO_FREEZE, NITRO_THAW, CAST_IRON_SETS, SETTLED, SLEEP_EVERY, steps, tileHeat, phaseChanges, NITRO_HEAT, QUICK_BOIL, WAX_MELT, METAL_MELT, SNOW_MELT, SNOW_WATER, CLAY_BAKE, touches, ALIVE, heatTick, warmWater, leaveResidue };
