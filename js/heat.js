// Temperature: diffusion between tiles, heat sources, and phase changes (boil, freeze, melt, harden).
import { explode } from './blast.js';
import { LAPSE, SEA, ambient, skyColumns } from './climate.js';
import { ACID, AETHER, AIR, BASALT, BLOOM, BRICK, CHUNK, CLAY, COMB, CRISP, CRYSTAL, DIRT, FOAM, FROST, GLASS, H, HONEY, ICE, LAVA, METAL, MOLTEN, MUD, NBLOCK, NITRO, NLIQ, NSOL, OBSIDIAN, OIL, PERMAFROST, POISON, PUMP_IN, PUMP_OUT, QUICK, SALT, SLIME, SNOW, SOL_SALT, SOL_SILT, SOL_SUGAR, STEAM, STORM, TONIC, W, WATER, WOOD } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { solidify } from './reactions.js';
import { clearSol } from './solutes.js';
import { CHH, CW, HEAT_AWAKE, S, afloat, deco, drop, heatAwake, held, liq, markDirty, meltAmount, sol, solid, temp, temp2, typ, under, wake } from './world.js';
import { COPPER, WOOL } from './config.js';
import { FNITRO, MSLAG, ORE, RUST, SLAG, SUGAR, THERMO } from './config.js';
import { vapour } from './air.js';











const BRATE = new Float32Array(NBLOCK).fill(0.05);   // how fast each block follows its neighbours' temperature
BRATE[ICE] = BRATE[OBSIDIAN] = BRATE[CRYSTAL] = BRATE[WOOD] = BRATE[GLASS] = BRATE[BRICK] = 0.03; BRATE[PUMP_IN] = BRATE[PUMP_OUT] = 0.12;
BRATE[METAL] = 0.25;
BRATE[WOOL] = 0.003; BRATE[COPPER] = 0.45;   // insulation and a conductor
BRATE[THERMO] = 0.25;   // a temperature sensor reads its surroundings quickly
// Liquids that keep acting on their surroundings while still; their chunks never fall asleep.
const NITRO_FREEZE = 10, NITRO_THAW = 14;   // nitro freezes into a block that's safe to drop and dig, and thaws again
const NITRO_HEAT = 150, QUICK_BOIL = 357, WAX_MELT = 70, METAL_MELT = 1300, SNOW_MELT = 2, SNOW_WATER = 64, CLAY_BAKE = 400, ORE_MELT = 850;
const ALIVE = new Uint8Array(NLIQ);
[ACID, LAVA, FROST, AETHER, SLIME, BLOOM, TONIC, FOAM, MOLTEN, MSLAG, NITRO].forEach(t => { ALIVE[t] = 1; });

const skyRow = new Float32Array(W);
// Heat sleeps where it has settled. A chunk whose tiles all changed by less than SETTLED in a heat tick falls asleep
// after HEAT_AWAKE such ticks; a sleeping chunk is updated only every SLEEP_EVERY heat ticks (a different eighth of
// them each tick), and that update stands in for the ticks it skipped. Any bigger change wakes it, as do
// `heatWake` (js/world.js) and `markDirty`.
const SETTLED = 0.05, SLEEP_EVERY = 8;
const steps = new Uint8Array(CW * CHH);   // heat ticks each chunk covers this tick: 0 skipped, 1 awake, SLEEP_EVERY catching up
const change = new Float32Array(CW * CHH);   // the biggest change of temperature in each chunk this tick
const chunkSlime = new Uint16Array(CW * CHH);   // slime tiles in each chunk when it was last updated
// The new temperature of tile k after m heat ticks. One tick moves it towards its neighbours and its resting
// temperature by a fraction r of the gap; m ticks move it by 1 - (1 - r)^m of it (m is 1 or 8).
function tileHeat(k, x, y, m) {
  const T0 = temp[k], sky = skyRow[x] + (y - SEA) * LAPSE, rest = under[k] ? ambient[k] : sky;
  let s = 0, n = 0;
  if (x > 0) { s += temp[k - 1]; n++; }
  if (x < W - 1) { s += temp[k + 1]; n++; }
  if (y > 0) { s += temp[k - W]; n++; }
  if (y < H - 1) { s += temp[k + W]; n++; }
  const b = solid[k], a = liq[k];
  let Tn, r;
  if (b) { Tn = T0 + (s / n - T0) * BRATE[b] + (ambient[k] - T0) * 0.0005; r = BRATE[b] + 0.0005; }
  else if (a) {
    const hr = LIQ[typ[k]].hrate * (a < 64 ? 3 : 1);
    Tn = T0 + (s / n - T0) * hr + (ambient[k] - T0) * 0.0005; r = hr + 0.0005;
    if (typ[k] === LAVA) { Tn += (1000 - Tn) * 0.01 * a / 255; r += 0.01 * a / 255; }   // deep lava keeps itself hot; thin films can't
    if (!under[k] && y > 0 && !solid[k - W] && !liq[k - W]) { Tn += (sky - Tn) * 0.01; r += 0.01; }   // a surface open to the sky follows the weather
  } else {   // air settles to the sky or cave temperature
    const rr = under[k] ? 0.01 : 0.05;
    Tn = T0 + (s / n - T0) * 0.2 + (rest - T0) * rr; r = 0.2 + rr;
  }
  if (m > 1) { const q = 1 - Math.min(1, r), q2 = q * q, q4 = q2 * q2; Tn = T0 + (Tn - T0) * (1 - q4 * q4) / r; }
  return Tn;
}
function heatTick() {
  skyColumns(skyRow);
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
// Boils, freezes, melts and hardens the tiles of chunk c, standing in for m heat ticks; returns its slime tiles.
function phaseChanges(c, m) {
  const cx = c % CW, cy = (c / CW) | 0;
  let slime = 0;
  for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK, k = y * W + x; x < (cx + 1) * CHUNK; x++, k++) {
    const Tk = temp[k];
    if (deco[k] && (solid[k] || Tk > 150 || (liq[k] > 128 && typ[k] !== BLOOM))) deco[k] = 0;
    if (liq[k]) {
      const t = typ[k];
      if (ALIVE[t]) wake(k);
      if (t === FROST) temp[k] = Math.min(Tk, -40);
      else if (t === LAVA) { if (Tk < 650) { solidify(k, BASALT); puff(k, 'steam'); } }
      else if (t === QUICK) { if (Tk > QUICK_BOIL) { typ[k] = POISON; wake(k); puff(k, 'smoke'); } }   // toxic mercury vapour
      else if (t === FOAM) { if (Tk > 90) { typ[k] = OIL; liq[k] = Math.max(1, liq[k] >> 1); wake(k); puff(k, 'steam'); } }   // its water boils off
      else if (t === WATER) {
        // salt and sugar raise the boiling point and salt lowers the freezing point; boiling leaves them behind.
        // Falling water doesn't freeze, so cold rain lands as water.
        const p = k * NSOL;
        if (Tk > 100 + (sol[p + SOL_SALT] + sol[p + SOL_SUGAR]) * 0.1) { if (!leaveResidue(k)) { typ[k] = STEAM; temp[k] = 110; clearSol(k); wake(k); if (Math.random() < 0.3) puff(k, 'steam'); } }
        else if (Tk < -5 - sol[p + SOL_SALT] * 0.12 && (k >= W * H - W || solid[k + W] || liq[k + W])) {
          afloat[k] = k < W * H - W && !solid[k + W] ? 1 : 0;   // frozen on water: lake ice, which floats
          solidify(k, ICE);
        }
      }
      else if (t === STEAM) { if (Tk < 70 && Math.random() < 0.04 * m) { typ[k] = WATER; wake(k); } }
      else if (t === HONEY) { if (Tk > 180) { solidify(k, CRISP); puff(k, 'smoke'); } }
      else if (t === ACID) { if (Tk > 120) { liq[k] = 0; typ[k] = 0; wake(k); puff(k, 'smoke'); } }
      else if (t === STORM) { if (Tk > 100) { typ[k] = STEAM; temp[k] = 110; clearSol(k); wake(k); if (Math.random() < 0.3) puff(k, 'steam'); } }
      else if (t === NITRO) {   // nitro must go off at once, so its heat never sleeps
        heatAwake[c] = HEAT_AWAKE;
        if (Tk > NITRO_HEAT) explode(k);
        else if (Tk < NITRO_FREEZE && (k >= W * H - W || solid[k + W] || liq[k + W])) { drop[k] = 0; solidify(k, FNITRO); }   // falling nitro doesn't freeze
      }
      else if (t === MOLTEN) { if (Tk < 1000) { solidify(k, METAL); puff(k, 'smoke'); } }
      else if (t === MSLAG) { if (Tk < 1000) { solidify(k, SLAG); puff(k, 'smoke'); } }
      else if (t === MUD) { if (Tk > 120) { solidify(k, BRICK); puff(k, 'steam'); } }
      else if (t === SLIME) { slime++; if (Tk > 150) { liq[k] = 0; typ[k] = 0; wake(k); puff(k, 'smoke'); } }
    } else if (solid[k] === SNOW && Tk > SNOW_MELT && Math.random() < 0.05 * m) {   // snow melts into a quarter of its amount in water
      const melt = Math.max(1, Math.round((held[k] || 255) * SNOW_WATER / 255));
      held[k] = 0; solid[k] = AIR; liq[k] = melt; typ[k] = WATER; clearSol(k); markDirty(x, y);
    } else if (solid[k] === SNOW && !held[k] && k >= 3 * W && solid[k - W] === SNOW && solid[k - 2 * W] === SNOW && solid[k - 3 * W] && Math.random() < 0.0005 * m) {
      solid[k] = ICE; held[k] = SNOW_WATER; markDirty(x, y);   // deep snow packs into ice under its own weight
    } else if (solid[k] === PERMAFROST && Tk > 2 && Math.random() < 0.01 * m) {   // frozen ground thaws into mud
      solid[k] = AIR; liq[k] = 200; typ[k] = MUD; clearSol(k); markDirty(x, y);
    } else if (solid[k] === FNITRO) {   // heat (a blast's, say) still sets frozen nitro off
      heatAwake[c] = HEAT_AWAKE;
      if (Tk > NITRO_THAW) { solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = NITRO; clearSol(k); markDirty(x, y); wake(k); if (Tk > NITRO_HEAT) explode(k); }
    } else if (solid[k] === RUST && Tk > ORE_MELT) {   // rust smelts back into metal, like ore
      solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = MOLTEN; temp[k] = 1300; clearSol(k); markDirty(x, y);
    } else if (solid[k] === SUGAR && Tk > 180) {   // sugar caramelises into crisp honey
      solid[k] = CRISP; held[k] = 0; markDirty(x, y); puff(k, 'smoke');
    } else if (solid[k] === CLAY && Tk > CLAY_BAKE) {
      solid[k] = BRICK; markDirty(x, y);
    } else if (solid[k] === COMB && Tk > WAX_MELT) {   // the wax melts and the honey runs out
      solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = HONEY; clearSol(k); markDirty(x, y);
    } else if (solid[k] === ORE && Tk > ORE_MELT) {   // smelting: two ore tiles in three melt into molten metal, the rest into slag
      solid[k] = AIR; liq[k] = 255; typ[k] = (x + y) % 3 ? MOLTEN : MSLAG; temp[k] = 1300; clearSol(k); markDirty(x, y);
    } else if (solid[k] === METAL && Tk > METAL_MELT) {
      solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = MOLTEN; temp[k] = 1400; clearSol(k); markDirty(x, y);
    } else if (solid[k] === ICE && Math.random() < 0.01 * m && touches(k, SALT)) {   // salt melts ice into brine, and the salt block dissolves into it
      const s = neighbourOf(k, SALT), salt = Math.max(1, Math.round(120 * (held[s] || 255) / 255));   // a pinch makes weaker brine
      solid[s] = AIR; held[s] = 0; markDirty(s % W, (s / W) | 0);
      solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; clearSol(k); sol[k * NSOL + SOL_SALT] = salt; markDirty(x, y);
    } else if (solid[k] === ICE && (Tk > 40 || (Math.random() < 0.006 * m && warmWater(k)))) {
      solid[k] = AIR; afloat[k] = 0; liq[k] = meltAmount(k); typ[k] = WATER; clearSol(k); markDirty(x, y);
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

export { NITRO_FREEZE, NITRO_THAW, ORE_MELT, SETTLED, SLEEP_EVERY, steps, tileHeat, phaseChanges, NITRO_HEAT, QUICK_BOIL, WAX_MELT, METAL_MELT, SNOW_MELT, SNOW_WATER, CLAY_BAKE, touches, BRATE, ALIVE, heatTick, warmWater, leaveResidue };
