// Temperature: diffusion between tiles, heat sources, and phase changes (boil, freeze, melt, harden).
import { explode } from './blast.js';
import { LAPSE, SEA, ambient, skyColumns } from './climate.js';
import { ACID, AETHER, AIR, BASALT, BLOOM, BRICK, CHUNK, CLAY, COMB, CRISP, CRYSTAL, DIRT, FOAM, FROST, GLASS, H, HONEY, ICE, LAVA, METAL, MOLTEN, MUD, NBLOCK, NITRO, NLIQ, NSOL, OBSIDIAN, OIL, PERMAFROST, POISON, PUMP_IN, PUMP_OUT, QUICK, SALT, SLIME, SNOW, SOL_SALT, SOL_SILT, SOL_SUGAR, STEAM, STORM, TONIC, W, WATER, WOOD } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { solidify } from './reactions.js';
import { clearSol } from './solutes.js';
import { CHH, CW, HEAT_AWAKE, S, afloat, deco, drop, heatAwake, held, latent, liq, markDirty, meltAmount, sol, solid, temp, temp2, typ, under, wake } from './world.js';
import { COPPER, POROUS, SAND, STONE, WETDIRT, WOOL } from './config.js';
import { FNITRO, MSLAG, ORE, RUST, SLAG, SUGAR, THERMO } from './config.js';
import { vapour } from './air.js';
import { AIR_CAP, AIR_COND, BCAP, BCOND, HEAT_SPEED, LATENT, LCAP, LCOND, L_BOIL_WATER, L_FUSION_IRON, L_FUSION_ROCK, L_FUSION_WATER } from './matter.js';











// Real temperatures (°C) at which things change; latent heat (js/matter.js) holds a tile at the first five while it
// melts, boils, freezes, condenses or sets.
const MELT_ICE = 0, BOIL_WATER = 100, LAVA_SETS = 1000, IRON_MELTS = 1538, SLAG_SETS = 1300;
const LAVA_HEAT = 1150, LAVA_KEEP = 0.08;   // deep lava is kept hot by the melt around it (a pool's own reservoir)
const NITRO_FREEZE = 12, NITRO_THAW = 14;   // nitroglycerin melts at 13°; it freezes into a block that's safe to drop and dig
const NITRO_HEAT = 218, QUICK_BOIL = 357, WAX_MELT = 64, METAL_MELT = IRON_MELTS, SNOW_MELT = MELT_ICE, SNOW_WATER = 64, CLAY_BAKE = 900;
const ORE_MELT = 850, SMELT_T = 1900;   // for now: real hematite needs carbon and a blast to smelt (Phase 20); the iron comes out white-hot enough to pour
const ACID_BOIL = 300, SUGAR_BURNS = 170, HONEY_BURNS = 160, MUD_DRIES = 100;
const SALT_FREEZE = 0.085, SOLUTE_BOIL = 0.035;   // degrees lower freezing, higher boiling, per unit of dissolved salt (and sugar)
const ALIVE = new Uint8Array(NLIQ);
[ACID, LAVA, FROST, AETHER, SLIME, BLOOM, TONIC, FOAM, MOLTEN, MSLAG, NITRO].forEach(t => { ALIVE[t] = 1; });
// Natural ground: it rests at the climate's temperature for its depth (js/climate.js), standing in for the earth
// around it. Everything else, liquids and placed blocks included, only trades heat with its neighbours.
const GROUND = new Uint8Array(NBLOCK);
[STONE, DIRT, WETDIRT, SAND, CLAY, BASALT, OBSIDIAN, PERMAFROST, ORE, POROUS, BRICK].forEach(b => { GROUND[b] = 1; });
// Each tile's heat capacity (J/K) and conductance this heat tick, from what's in it.
const cap = new Float32Array(W * H), cond = new Float32Array(W * H);

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
    if (b) { cap[k] = BCAP[b]; cond[k] = BCOND[b]; continue; }
    const a = liq[k];
    if (!a) { cap[k] = AIR_CAP; cond[k] = AIR_COND; latent[k] = 0; continue; }
    const f = a / 255, t = typ[k];
    cap[k] = f * LCAP[t] + (1 - f) * AIR_CAP; cond[k] = f * LCOND[t] + (1 - f) * AIR_COND;
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
// Liquid flows between heat ticks while latent[k] stays with the tile, which this absorbs: the heat isn't lost, it just
// counts towards the change in whatever is there now.
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
        if (balance(k, restsOn(k) ? LAVA_SETS : -Infinity, Infinity, needOf(L_FUSION_ROCK, 2.7, a), 0) < 0) { solidify(k, BASALT); afterChange(k, LAVA_SETS, spare, BCAP[BASALT], false); puff(k, 'steam'); }
      }
      else if (t === QUICK) { if (Tk > QUICK_BOIL) { typ[k] = POISON; wake(k); puff(k, 'smoke'); } }   // toxic mercury vapour
      else if (t === FOAM) { if (Tk > 90) { typ[k] = OIL; liq[k] = Math.max(1, liq[k] >> 1); wake(k); puff(k, 'steam'); } }   // its water boils off
      else if (t === WATER) {
        // salt and sugar raise the boiling point and salt lowers the freezing point; boiling leaves them behind.
        // Falling water doesn't freeze, so cold rain lands as water.
        const p = k * NSOL, boils = BOIL_WATER + (sol[p + SOL_SALT] + sol[p + SOL_SUGAR]) * SOLUTE_BOIL, freezes = MELT_ICE - sol[p + SOL_SALT] * SALT_FREEZE;
        const d = balance(k, restsOn(k) ? freezes : -Infinity, boils, needOf(L_FUSION_WATER, 1, a), needOf(L_BOIL_WATER, 1, a));
        if (d > 0 && !leaveResidue(k)) {
          typ[k] = STEAM; clearSol(k); afterChange(k, boils, spare, LCAP[STEAM] * a / 255 + AIR_CAP * (1 - a / 255), true); wake(k); if (Math.random() < 0.3) puff(k, 'steam');
        } else if (d < 0) {
          afloat[k] = k < W * H - W && !solid[k + W] ? 1 : 0;   // frozen on water: lake ice, which floats
          solidify(k, ICE); afterChange(k, freezes, spare, BCAP[ICE], false);
        }
      }
      else if (t === STEAM) {   // condensing gives back the heat boiling took: steam scalds and warms what it touches
        if (balance(k, BOIL_WATER, Infinity, needOf(L_BOIL_WATER, 1, a), 0) < 0) { typ[k] = WATER; afterChange(k, BOIL_WATER, spare, LCAP[WATER] * a / 255 + AIR_CAP * (1 - a / 255), false); wake(k); }
      }
      else if (t === HONEY) { if (Tk > HONEY_BURNS) { solidify(k, CRISP); puff(k, 'smoke'); } }
      else if (t === ACID) { if (Tk > ACID_BOIL) { liq[k] = 0; typ[k] = 0; wake(k); puff(k, 'smoke'); } }
      else if (t === STORM) { if (Tk > BOIL_WATER) { typ[k] = STEAM; temp[k] = 110; clearSol(k); wake(k); if (Math.random() < 0.3) puff(k, 'steam'); } }
      else if (t === NITRO) {   // nitro must go off at once, so its heat never sleeps
        heatAwake[c] = HEAT_AWAKE;
        if (Tk > NITRO_HEAT) explode(k);
        else if (Tk < NITRO_FREEZE && (k >= W * H - W || solid[k + W] || liq[k + W])) { drop[k] = 0; solidify(k, FNITRO); }   // falling nitro doesn't freeze
      }
      else if (t === MOLTEN) {
        if (balance(k, restsOn(k) ? IRON_MELTS : -Infinity, Infinity, needOf(L_FUSION_IRON, 7, a), 0) < 0) { solidify(k, METAL); afterChange(k, IRON_MELTS, spare, BCAP[METAL], false); puff(k, 'smoke'); }
      }
      else if (t === MSLAG) {
        if (balance(k, restsOn(k) ? SLAG_SETS : -Infinity, Infinity, needOf(L_FUSION_ROCK, 2.7, a), 0) < 0) { solidify(k, SLAG); afterChange(k, SLAG_SETS, spare, BCAP[SLAG], false); puff(k, 'smoke'); }
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
    } else if (solid[k] === RUST && Tk > ORE_MELT) {   // rust smelts back into metal, like ore
      solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = MOLTEN; temp[k] = 1600; clearSol(k); markDirty(x, y);
    } else if (solid[k] === PERMAFROST && Tk > MELT_ICE && Math.random() < 0.01 * m) {   // frozen ground thaws into mud
      solid[k] = AIR; liq[k] = 200; typ[k] = MUD; clearSol(k); markDirty(x, y);
    } else if (solid[k] === SUGAR && Tk > SUGAR_BURNS) {   // sugar caramelises into crisp honey
      solid[k] = CRISP; held[k] = 0; markDirty(x, y); puff(k, 'smoke');
    } else if (solid[k] === CLAY && Tk > CLAY_BAKE) {
      solid[k] = BRICK; markDirty(x, y);
    } else if (solid[k] === COMB && Tk > WAX_MELT) {   // the wax melts and the honey runs out
      solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = HONEY; clearSol(k); markDirty(x, y);
    } else if (solid[k] === ORE && Tk > ORE_MELT) {   // smelting: two ore tiles in three melt into molten metal, the rest into slag
      solid[k] = AIR; liq[k] = 255; typ[k] = (x + y) % 3 ? MOLTEN : MSLAG; temp[k] = typ[k] === MOLTEN ? SMELT_T : 1600; clearSol(k); markDirty(x, y);
    } else if (solid[k] === METAL) {
      if (balance(k, -Infinity, METAL_MELT, 0, needOf(L_FUSION_IRON, 7.85, held[k])) > 0) { solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = MOLTEN; clearSol(k); afterChange(k, METAL_MELT, spare, LCAP[MOLTEN], true); markDirty(x, y); }
    } else if (solid[k] === ICE && Math.random() < 0.01 * m && touches(k, SALT)) {   // salt melts ice into brine, and the salt block dissolves into it
      const s = neighbourOf(k, SALT), salt = Math.max(1, Math.round(120 * (held[s] || 255) / 255));   // a pinch makes weaker brine
      solid[s] = AIR; held[s] = 0; markDirty(s % W, (s / W) | 0);
      latent[k] = 0; solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; clearSol(k); sol[k * NSOL + SOL_SALT] = salt; markDirty(x, y);
    } else if (solid[k] === ICE) {
      if (balance(k, -Infinity, MELT_ICE, 0, needOf(L_FUSION_WATER, 1, held[k])) > 0) { solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; clearSol(k); afterChange(k, MELT_ICE, spare, LCAP[WATER] * liq[k] / 255 + AIR_CAP * (1 - liq[k] / 255), true); markDirty(x, y); }
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
// Boiling water leaves what was dissolved in it: salt or sugar as fine grains (exactly as much as there was: a pinch
// from weak brine, nearly a full tile from strong), its water going up as steam into the tile above (into the air
// if there's no room). Very muddy water can still crust over into a dirt block. Returns whether it left anything.
function leaveResidue(k) {
  const p = k * NSOL, s = sol[p + SOL_SALT], g = sol[p + SOL_SUGAR], m = sol[p + SOL_SILT];
  if (m > s && m > g) {
    if (s + g + m < 64 || Math.random() > (s + g + m) / 400) return false;
    solidify(k, DIRT); puff(k, 'steam');
    return true;
  }
  const amount = Math.round(Math.max(s, g) * liq[k] / 255);
  if (amount < 1) return false;
  const water = liq[k], up = k - W;
  liq[k] = 0; typ[k] = 0; clearSol(k);
  solid[k] = s >= g ? SALT : SUGAR; held[k] = amount >= 255 ? 0 : amount;   // a powder's amount (js/powders.js)
  let left = water;
  if (up >= 0 && !solid[up] && (!liq[up] || typ[up] === STEAM)) {
    const mv = Math.min(left, 255 - liq[up]);
    if (!liq[up]) { clearSol(up); temp[up] = 110; }
    liq[up] += mv; typ[up] = STEAM; left -= mv; wake(up);
  }
  if (left) vapour(k, left);
  markDirty(k % W, (k / W) | 0); puff(k, 'steam');
  return true;
}

export { GROUND, MELT_ICE, BOIL_WATER, LAVA_SETS, IRON_MELTS, SLAG_SETS, LAVA_HEAT, LAVA_KEEP, ACID_BOIL, SUGAR_BURNS, HONEY_BURNS, MUD_DRIES, SALT_FREEZE, SOLUTE_BOIL, cap, cond, fillMatter, balance, NITRO_FREEZE, NITRO_THAW, ORE_MELT, SETTLED, SLEEP_EVERY, steps, tileHeat, phaseChanges, NITRO_HEAT, QUICK_BOIL, WAX_MELT, METAL_MELT, SNOW_MELT, SNOW_WATER, CLAY_BAKE, touches, ALIVE, heatTick, warmWater, leaveResidue };
