// Dissolved contents: salt, sugar, essence and inks carried inside a liquid. Each tile has NSOL concentration channels
// that move with the flow, slowly spread into touching tiles of the same liquid, and drive brewing. Fractional
// concentrations can exceed the usual 0-255 range when solvent leaves; oxygen uses a signed reference deficit.
import { CRISP, FROST, H, NSOL, SALT, SOL_BLUE, SOL_ESSENCE, SOL_RED, SOL_SALT, SOL_SILT, SOL_SUGAR, SOL_YELLOW, TONIC, W, WATER } from './config.js';
import { puff } from './particles.js';
import { liq, markDirty, sol, solid, temp, typ, wake } from './world.js';
import { vel } from './world.js';
import { GEM, SODA, SOL_ACID, SOL_BASE, CO2 } from './config.js';
import { ACIDITY } from './liquids.js';
import { S, flux, held, meltAmount } from './world.js';
import { MOSS, SOL_FERT, STONE } from './config.js';
import { nbr } from './pumps.js';
import { CHLORINE, LIGHT, METAL, RUST, SOL_ALGAE, SOL_METAL, SOL_O2, SUGAR } from './config.js';
import { MG_PER_UNIT, OXYGEN_REFERENCE, breatheWater, oxygenIn, skyAbove, surfaceOx } from './oxygen.js';
import { emitGas } from './chem.js';
import { DIRT, SOL_AMMONIA, SOL_CO2, SOL_ETHANOL, SOL_YEAST, WETDIRT } from './config.js';
import { LRHO } from './matter.js';
import { EMULSION, OIL, SOL_OIL, SOL_SOAP, STORM } from './config.js';
import { SOAPY } from './reactions.js';
const DISSOLVE = 24;   // powder grains water dissolves at a time
import { sunHeight } from './daynight.js';
import { under } from './world.js';
import { ecoAcetify, ecoAlgae, ecoDenitrify, ecoDeposit, ecoFixWater, ecoInstallTissue, ecoSpore, ecoYeast } from './ecology.js';
import { ECO_DISSOLVED_C } from './ecology.js';
import { bioTissue } from './ecology-core.js';
import { ECO_COST, ECO_QUOTA, ECO_RATE } from './ecology-data.js';
import { SOL_PHOSPHATE } from './config.js';
import { recordFantasyUse, withFantasyEffect } from './fantasy.js';

const SOL_NAMES = ['salt', 'sugar', 'essence', 'red ink', 'yellow ink', 'blue ink', 'silt', 'acid', 'alkali', 'fertiliser', 'algae', 'metal salts', 'oxygen deficit', 'soap', 'oil', 'ammonium', 'yeast', 'alcohol', 'CO₂', 'phosphate', 'acetate'];
const DIFFUSE = [0.01, 0.01, 0.1, 0.12, 0.12, 0.12, 0.01, 0.08, 0.08, 0.05, 0.03, 0.01, 0.005, 0.05, 0.05, 0.05, 0.02, 0.08, 0.005, 0.05, 0.08];
// Brewing: a water tile holding at least `need` of each solute, inside the temperature range, slowly turns into `makes`.
const RECIPES = [
  { name: 'tonic', need: { [SOL_SUGAR]: 40, [SOL_ESSENCE]: 40 }, minT: 80, maxT: Infinity, makes: TONIC, fx: 'spark' },
  { name: 'frost', need: { [SOL_SALT]: 60, [SOL_ESSENCE]: 40 }, minT: -Infinity, maxT: 0, makes: FROST, fx: 'snow' },
];

// Mixes mv units of the liquid holding vector src[s..] into dst[d..], which holds `had` units. An empty tile takes it as is.
function mixSol(dst, d, had, src, s, mv) {
  if (!had) { for (let i = 0; i < NSOL; i++) dst[d + i] = src[s + i]; return; }
  const w = had + mv;
  for (let i = 0; i < NSOL; i++) if (dst[d + i] !== src[s + i]) dst[d + i] = (dst[d + i] * had + src[s + i] * mv) / w;
}
// Conserved game-scale quantity: one unit is one concentration unit in a full (255-unit) carrier tile.
// A signed oxygen deficit is allowed; all ordinary ingredient amounts are non-negative.
function soluteAmount(k, i) {
  const concentration = i === SOL_O2 ? Math.max(0, OXYGEN_REFERENCE / MG_PER_UNIT - sol[k * NSOL + i]) : sol[k * NSOL + i];
  return concentration * liq[k] / 255;
}
function setSoluteAmount(k, i, amount) {
  if (!liq[k]) return false;
  const concentration = Math.max(0, amount) * 255 / liq[k];
  sol[k * NSOL + i] = i === SOL_O2 ? OXYGEN_REFERENCE / MG_PER_UNIT - concentration : concentration;
  return true;
}
function addSoluteAmount(k, i, amount, maximum = Infinity) {
  if (!liq[k]) return 0;
  const before = soluteAmount(k, i), added = Math.max(-before, Math.min(amount, Math.max(0, maximum - before)));
  setSoluteAmount(k, i, before + added); return added;
}
function takeSoluteAmount(k, i, amount) {
  const taken = Math.min(Math.max(0, amount), Math.max(0, soluteAmount(k, i)));
  if (taken) setSoluteAmount(k, i, soluteAmount(k, i) - taken);
  return taken;
}
// Pure solvent withdrawal: retain every ingredient. A final occupied unit waits for a process that can place residues.
function removeCarrier(k, requested) {
  const before = liq[k], take = Math.min(Math.max(0, Math.floor(requested)), Math.max(0, before - 1));
  if (!take) return 0;
  const ratio = before / (before - take), p = k * NSOL;
  for (let i = 0; i < NSOL; i++) {
    if (i === SOL_O2) sol[p + i] = OXYGEN_REFERENCE / MG_PER_UNIT - (OXYGEN_REFERENCE / MG_PER_UNIT - sol[p + i]) * ratio;
    else sol[p + i] *= ratio;
  }
  liq[k] -= take; wake(k); return take;
}
function carrySol(src, dst, mv, had) { mixSol(sol, dst * NSOL, had, sol, src * NSOL, mv); }
function clearSol(k) { sol.fill(0, k * NSOL, k * NSOL + NSOL); }
function copySol(src, dst) { sol.copyWithin(dst * NSOL, src * NSOL, src * NSOL + NSOL); }
function swapSol(a, b) {
  for (let i = 0, p = a * NSOL, q = b * NSOL; i < NSOL; i++) { const v = sol[p + i]; sol[p + i] = sol[q + i]; sol[q + i] = v; }
}
// Salt, sugar and silt make a liquid heavier, so brine, syrup and muddy water sink under fresher water.
function heavy(k) { return sol[k * NSOL + SOL_SALT] + sol[k * NSOL + SOL_SUGAR] + sol[k * NSOL + SOL_SILT]; }
// A tile's real density (g/cm³): its liquid's, plus what's dissolved in it (saturated brine is 1.2, thick syrup 1.33),
// and changed by temperature: water is densest at 4°, so both warmer and colder water floats on it; other liquids
// expand as they warm. Same liquid over same liquid, the denser sinks (js/sim.js): brine under fresh water, warm water
// over cold, and in autumn the cooling surface turns a lake over.
// Oil beside water mixes into it as an emulsion (both tiles become oily water, each remembering how much of it was oil)
// where the water is soapy, or where they're churned together fast. Without soap it separates again (js/reactions.js).
function emulsify(k, x, p) {
  const soapy = sol[p + SOL_SOAP] >= SOAPY;
  if (!soapy && Math.abs(vel[k]) < 1.5) return;   // shaken hard
  if (Math.random() > 0.05) return;
  const o = nbr(x, (k / W) | 0, (Math.random() * 4) | 0);
  if (o < 0 || !liq[o] || typ[o] !== OIL) return;
  typ[k] = EMULSION; sol[p + SOL_OIL] = 0;
  typ[o] = EMULSION; clearSol(o); sol[o * NSOL + SOL_SOAP] = sol[p + SOL_SOAP]; sol[o * NSOL + SOL_OIL] = 255;
  wake(k); wake(o);
}
// The nitrogen cycle in water. Rot gives ammonium (js/creatures.js, algae above); with oxygen, bacteria turn it into
// nitrate (fertiliser), using some of that oxygen; where the water is airless, other bacteria turn nitrate into
// nitrogen gas, which leaves. Algae and plants take nitrate up.
const NITRIFY = 0.05, NITRIFY_OX = 0.2, DENITRIFY = 0.02, ROT_OX = 0.05, SOIL_BREATH = 0.1;   // ROT_OX: mg/L of oxygen per unit rotted
function nitrogen(k, p) {
  if (sol[p + SOL_AMMONIA] > 0 && Math.random() < NITRIFY && oxygenIn(k) >= 2) {
    const converted = Math.min(1, sol[p + SOL_AMMONIA], Math.max(0, 255 - sol[p + SOL_FERT]), oxygenIn(k) / NITRIFY_OX);
    sol[p + SOL_AMMONIA] -= converted; addSol(k, SOL_FERT, converted); sol[p + SOL_O2] += NITRIFY_OX * converted / MG_PER_UNIT;
  } else if (sol[p + SOL_FERT] > 0 && Math.random() < DENITRIFY && oxygenIn(k) < 0.5) {
    const lost = ecoDenitrify(k, liq[k] / 255);
    S.accounting.denitrifiedNitrogen = (S.accounting.denitrifiedNitrogen || 0) + lost;
  }
}
// Yeast and the bacteria after it. Sugar water open to the air catches wild yeast now and then. With oxygen, yeast
// burns sugar and multiplies; without it, it ferments sugar into alcohol and carbon dioxide (which bubbles out at the
// surface), warming slightly, up to the chosen yeast limit. SOL_ETHANOL is a game-scale concentration,
// not a calibrated alcohol-by-volume percentage. Distillation enriches it; strong mixtures can burn. Yeast lives
// between 10° and 40° and dies past 45°. With oxygen, alcohol slowly turns to vinegar (weak acid).
const YEAST_SPORE = 0.002, YEAST_MAX = ECO_RATE.yeastMax, STRONGEST = ECO_RATE.yeastTolerance, VINEGAR = 0.004;
function ferment(k, p) {
  const sugar = sol[p + SOL_SUGAR], y = sol[p + SOL_YEAST], T = temp[k];
  if (!y) { if (sugar >= 20 && k >= W && !solid[k - W] && !liq[k - W] && Math.random() < YEAST_SPORE) ecoSpore(k, SOL_YEAST); }
  else if (T > 45) { const dead = takeSoluteAmount(k, SOL_YEAST, soluteAmount(k, SOL_YEAST)); ecoDeposit(k, bioTissue(dead, ECO_QUOTA)); }
  else if (sugar && T >= 10 && T <= 40 && Math.random() < y / 300) {
    ecoYeast(k);
  }
  if (sol[p + SOL_ETHANOL] > 0 && Math.random() < VINEGAR && oxygenIn(k) >= 2) {
    ecoAcetify(k);
  }
}
function densityOf(k) {
  const t = typ[k], T = temp[k], p = k * NSOL;
  const base = t === WATER || t === STORM ? LRHO[t] * (1 - 6.8e-6 * (T - 4) * (T - 4)) : LRHO[t] * (1 - 0.0005 * (T - 20));
  return base + (sol[p + SOL_SALT] * 0.2 + sol[p + SOL_SUGAR] * 0.33 + sol[p + SOL_SILT] * 0.3 + sol[p + SOL_METAL] * 0.1) / 255;
}
function addSol(k, i, n) {
  const p = k * NSOL + i, before = sol[p], limit = i === SOL_CO2 ? Infinity : 255;
  const added = n >= 0 ? Math.min(n, Math.max(0, limit - before)) : Math.max(n, -before);
  sol[p] = before + added; return added;
}

function soluteTick() {
  daylight = sunHeight() > 0;
  for (let k = 0; k < W * H; k++) {
    if (!liq[k]) continue;
    const t = typ[k], x = k % W, p = k * NSOL;
    if (t === EMULSION) {
      // oil and water shaken together separate again within a minute or so, each drop back into whichever it mostly
      // was; soap holds them together
      if (sol[p + SOL_SOAP] < SOAPY && Math.random() < 0.016) {
        const oily = sol[p + SOL_OIL] >= 128, soap = sol[p + SOL_SOAP];
        typ[k] = oily ? OIL : WATER; clearSol(k); if (!oily) sol[p + SOL_SOAP] = soap; wake(k);
      }
      continue;
    }
    if (t === WATER) {
      // water dissolves the salt, sugar and crisp honey (caramel) it touches, a little at a time: a powder's grains
      // go into the water as so much more salt or sugar (more concentrated in less water); caramel by whole blocks
      for (let d = 0; d < 4; d++) {
        const o = d === 0 ? (k >= W ? k - W : -1) : d === 1 ? (x > 0 ? k - 1 : -1) : d === 2 ? (x < W - 1 ? k + 1 : -1) : (k < W * H - W ? k + W : -1);
        if (o < 0) continue;
        const b = solid[o], i = b === SALT || b === GEM ? SOL_SALT : b === SUGAR || b === CRISP ? SOL_SUGAR : -1;
        // A salt crystal grows above saturation and only redissolves below it; using the powder's
        // higher concentration ceiling here made each new crystal immediately dissolve again.
        const limit = b === GEM ? SATURATED : 255;
        if (i < 0 || (b === GEM ? sol[p + i] >= SATURATED : sol[p + i] > 220) || Math.random() > (b === CRISP ? 0.05 : 0.15)) continue;
        wake(k);
        const have = held[o] || 255, capacity = Math.max(0, limit - sol[p + i]) * liq[k] / 255;
        const take = Math.min(have, DISSOLVE, capacity);
        if (!take) continue;
        addSoluteAmount(k, i, take);
        if (have - take > 1e-12) held[o] = have - take; else { solid[o] = 0; held[o] = 0; }
        markDirty(o % W, (o / W) | 0);
      }
      for (const r of RECIPES) if (brews(k, r) && Math.random() < 0.05) {
        withFantasyEffect(`brew-${r.name}`, [k], () => {
          for (const [channel, concentration] of Object.entries(r.need)) takeSoluteAmount(k, +channel, concentration * liq[k] / 255);
          typ[k] = r.makes; wake(k); puff(k, r.fx);
        });
        break;
      }
      if (typ[k] === WATER) { surfaceOx(k, p); chemistry(k, x, p); emulsify(k, x, p); nitrogen(k, p); ferment(k, p); }
    }
    // spread into the tile to the right and the one below when they hold the same liquid
    if (x < W - 1 && liq[k + 1] && typ[k + 1] === t) diffuse(p, p + NSOL);
    if (k < W * H - W && liq[k + W] && typ[k + W] === t) diffuse(p, p + W * NSOL);
  }
}
// What dissolved acid and alkali do in water. Strength is concentration: the stronger, the faster it acts.
const CORRODE_AT = 40, FIZZ_AT = 30, SATURATED = 200, STILL = 120, GROW = 0.004, REDISSOLVE = 0.01;
function chemistry(k, x, p) {
  // acid and alkali in the same water cancel out, warming it and leaving salt
  const m = Math.min(sol[p + SOL_ACID], sol[p + SOL_BASE]);
  if (m) { sol[p + SOL_ACID] -= m; sol[p + SOL_BASE] -= m; addSol(k, SOL_SALT, m >> 1); temp[k] += m * 0.25; wake(k); if (m > 20) puff(k, 'fizz'); }
  const acid = sol[p + SOL_ACID];
  algae(k, x, p);
  if (sol[p + SOL_FERT] >= 30 && Math.random() < 0.004) {   // fertilised water greens the stone it touches with moss
    const o = nbr(x, (k / W) | 0, Math.floor(Math.random() * 4));
    const cost = ECO_COST.moss; let illumination = 0;
    if (o >= 0 && solid[o] === STONE && (illumination = algaeLightSource(k, x)) && soluteAmount(k, SOL_FERT) >= cost * ECO_QUOTA.n && soluteAmount(k, SOL_PHOSPHATE) >= cost * ECO_QUOTA.p && soluteAmount(k, SOL_CO2) * ECO_DISSOLVED_C >= cost) {
      const fixed = ecoFixWater(k, cost);
      if (illumination === 2 && fixed > 0) recordFantasyUse('liquid-light-moss');
      takeSoluteAmount(k, SOL_FERT, fixed * ECO_QUOTA.n); takeSoluteAmount(k, SOL_PHOSPHATE, fixed * ECO_QUOTA.p);
      solid[o] = MOSS; ecoInstallTissue(o, MOSS, bioTissue(fixed, ECO_QUOTA)); markDirty(o % W, (o / W) | 0);
    }
  }
  for (let d = 0; d < 4; d++) {
    const o = d === 0 ? (k >= W ? k - W : -1) : d === 1 ? (x > 0 ? k - 1 : -1) : d === 2 ? (x < W - 1 ? k + 1 : -1) : (k < W * H - W ? k + W : -1);
    if (o < 0) continue;
    if (solid[o]) {
      // (dissolved acid and alkali acting on blocks, and rust: rules in js/chem.js)
      // salt crystals grow from still, saturated brine onto any surface, and dissolve again into fresher water
      if (sol[p + SOL_SALT] > SATURATED && S.tick - flux[k] > STILL && Math.random() < GROW) precipitateSalt(k, x, p);
    } else if (liq[o] && typ[o] === CHLORINE && sol[p + SOL_SALT] < 100 && Math.random() < 0.05) {
      // chlorine dissolves into fresh water as acid (hydrochloric and hypochlorous); hardly at all into brine
      liq[o] = Math.max(0, liq[o] - 16); if (!liq[o]) typ[o] = 0; addSol(k, SOL_ACID, 6); wake(o);
    } else if (liq[o] && typ[o] === CO2 && sol[p + SOL_ACID] < 30 && Math.random() < 0.05) {
      // carbon dioxide dissolves into water, making it faintly acidic (sparkling water)
      liq[o] = Math.max(0, liq[o] - 16); if (!liq[o]) typ[o] = 0; addSol(k, SOL_ACID, 4); wake(o);
    }
  }
}
// A crystal occupies spare space, never the solution carrying it. Other ingredients and the solvent remain intact.
function precipitateSalt(k, x, p) {
  const excess = (sol[p + SOL_SALT] - SATURATED) * liq[k] / 255;
  for (let d = 0; d < 4; d++) {
    const o = nbr(x, (k / W) | 0, d);
    if (o < 0 || liq[o] || (solid[o] && solid[o] !== GEM)) continue;
    const had = solid[o] === GEM ? held[o] || 255 : 0;
    const take = Math.min(DISSOLVE, excess, 255 - had);
    if (take <= 1e-12) continue;
    takeSoluteAmount(k, SOL_SALT, take);
    solid[o] = GEM; held[o] = had + take >= 255 ? 0 : had + take;
    markDirty(o % W, (o / W) | 0); puff(o, 'spark'); return take;
  }
  return 0;
}
// Algae needs light, actual dissolved carbon and mineral N/P. A finite saved inoculum bank supplies wild starters;
// maintenance and death debit biomass, retaining nutrients in minerals/detritus. The chosen freshwater archetype
// grows more slowly in cool water and dies outside its temperature/salinity range (ecology-data.js).
const ALGAE_WILD = 24, ALGAE_CROWDED = 200, SPORE = 0.01, FED_AT = 5, ALGAE_COLD = 8, ALGAE_COOL = 15;
let daylight = false;   // set once per solute pass
function algaeLightSource(k, x) {
  if (daylight && skyAbove(k)) return 1;
  for (let d = 0; d < 4; d++) { const o = nbr(x, (k / W) | 0, d); if (o >= 0 && liq[o] && typ[o] === LIGHT) return 2; }
  return 0;
}
function lit(k, x) { return algaeLightSource(k, x) > 0; }
// Runs for every water tile; an empty tile can receive a finite starter, otherwise ecology handles its budget.
function algae(k, x, p) {
  if (!sol[p + SOL_ALGAE]) { if (daylight && Math.random() < SPORE) ecoSpore(k, SOL_ALGAE); return; }
  const source = algaeLightSource(k, x);
  if (source === 2) recordFantasyUse('liquid-light-algae');
  ecoAlgae(k, source > 0);
}
// pH of a tile's liquid: its own for most liquids; water's from the acid and alkali dissolved in it.
function phOf(k) {
  if (!liq[k]) return 7;
  if (typ[k] !== WATER) return ACIDITY[typ[k]];
  const p = k * NSOL;
  return Math.max(0, Math.min(14, 7 - sol[p + SOL_ACID] / 255 * 6 + sol[p + SOL_BASE] / 255 * 6));
}
function diffuse(p, q) {
  const a = liq[p / NSOL], b = liq[q / NSOL];
  if (!a || !b) return;
  for (let i = 0; i < NSOL; i++) {
    const d = sol[p + i] - sol[q + i];
    if (!d) continue;
    const moved = d * (2 * DIFFUSE[i]) * a * b / (a + b);
    sol[p + i] -= moved / a; sol[q + i] += moved / b;
  }
}
function brews(k, r) {
  if (temp[k] < r.minT || temp[k] > r.maxT) return false;
  for (const i in r.need) if (sol[k * NSOL + +i] < r.need[i]) return false;
  return true;
}
// Ink colours mix like paint (red, yellow, blue primaries); salt, sugar and essence add faint tints.
const RYB = [[255, 255, 255], [230, 30, 40], [250, 215, 40], [235, 120, 20], [40, 95, 200], [130, 40, 150], [40, 160, 70], [50, 30, 20]];
function inkColor(r, y, b) {
  const out = [0, 0, 0];
  for (let c = 0; c < 8; c++) {
    const w = ((c & 1) ? r : 1 - r) * ((c & 2) ? y : 1 - y) * ((c & 4) ? b : 1 - b);
    for (let j = 0; j < 3; j++) out[j] += RYB[c][j] * w;
  }
  return out;
}
const TINTS = [[SOL_SALT, [215, 240, 235], 0.25], [SOL_SUGAR, [235, 170, 60], 0.45], [SOL_ESSENCE, [235, 130, 205], 0.5], [SOL_SILT, [130, 92, 55], 0.7],
  [SOL_ACID, [170, 240, 140], 0.3], [SOL_BASE, [190, 200, 255], 0.3], [SOL_FERT, [150, 130, 80], 0.3], [SOL_ALGAE, [50, 140, 40], 0.85], [SOL_METAL, [200, 175, 90], 0.35], [SOL_YEAST, [235, 225, 190], 0.35]];   // yeast makes it cloudy   // metal salts: iron chloride's yellow   // algae turns water green, a bloom almost opaque
// The colour a tile's dissolved contents give it, as [r, g, b, strength 0-1], or null when it holds nothing visible.
function solTint(k) {
  const p = k * NSOL, r = sol[p + SOL_RED], y = sol[p + SOL_YELLOW], b = sol[p + SOL_BLUE];
  let cr = 0, cg = 0, cb = 0, wsum = 0;
  const ink = Math.max(r, y, b);
  if (ink > 4) { const c = inkColor(r / ink, y / ink, b / ink), w = ink / 255; cr += c[0] * w; cg += c[1] * w; cb += c[2] * w; wsum += w; }
  for (const [i, c, s] of TINTS) {
    const w = sol[p + i] / 255 * s;
    if (w > 0.02) { cr += c[0] * w; cg += c[1] * w; cb += c[2] * w; wsum += w; }
  }
  if (!wsum) return null;
  return [cr / wsum, cg / wsum, cb / wsum, Math.min(0.85, wsum)];
}

export { soluteAmount, setSoluteAmount, addSoluteAmount, takeSoluteAmount, removeCarrier, precipitateSalt, NITRIFY, DENITRIFY, ROT_OX, YEAST_SPORE, YEAST_MAX, STRONGEST, VINEGAR, nitrogen, ferment, ALGAE_COLD, ALGAE_COOL, daylight, ALGAE_WILD, ALGAE_CROWDED, SPORE, FED_AT, lit, algae, CORRODE_AT, FIZZ_AT, SATURATED, STILL, chemistry, phOf, SOL_NAMES, DIFFUSE, RECIPES, mixSol, carrySol, clearSol, copySol, swapSol, heavy, densityOf, addSol, soluteTick, diffuse, brews, RYB, inkColor, TINTS, solTint };
