// Blocks that work with liquid over time: sponges and soil soak water up and give it back, porous rock lets liquid
// seep through, coral grows in warm salt water and bleaches when it's too hot, magnets pull ferrofluid (and iron
// weights) towards them, lake ice floats, trees regrow the leaves moths eat, and moss breathes. Runs every 4 ticks.
// Groundwater: wet soil holds up to SOIL_CAP, soaks up water lying on or beside it (rain), sinks into the soil below,
// and evens out sideways, so water collects into a saturated zone over the rock: a water table. Soaked soil seeps
// water out wherever it meets open space, so hillsides grow springs and a pit dug down into it fills up like a well.
import { BLEACHED, CORAL, DIRT, FERRO, H, MAGNET, NSOL, POROUS, SOL_SALT, SPONGE, STEAM, T, W, WATER, WETDIRT, WETSPONGE } from './config.js';
import { KINDS } from './bodies.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { plantSeed } from './plants.js';
import { ecoDeposit, ecoTreeLeaf } from './ecology.js';
import { bioPool } from './ecology-core.js';
import { nbr } from './pumps.js';
import { carryHeat } from './sim.js';
import { mixSol, clearSol, swapSol } from './solutes.js';
import { S, bodies, devices, heatWake, held, latent, liq, markDirty, redraw, sol, solid, temp, typ, wake } from './world.js';
import { EMAGNET, ICE, LEAF, WOOD } from './config.js';
import { windAt } from './air.js';
import { afloat, under, vel } from './world.js';
import { vapour } from './air.js';
import { MOSS, SOL_O2 } from './config.js';
import { sunHeight } from './daynight.js';
import { fixCarbon, respire, skyAbove, MG_PER_UNIT, OXYGEN_REFERENCE } from './oxygen.js';
import { LCAP, dissolvedHeatCapacity, poreHeatCapacity } from './matter.js';

const SOAK = 32, SQUEEZE = 32, SPONGE_HOT = 60, SOIL_HOLDS = 32, SEEP = 8, MAGNET_REACH = 8, PULL = 24;
const SOIL_CAP = 96, SOAKED = 86, SINK = 32, LEVEL = 0.25, SPRING_OUT = 8, SPRING_CHANCE = 0.1;   // soil holds about 38% water
const DRIFT = 0.4;   // how readily a piece of lake ice drifts, per unit of current or wind
const magnets = [], pulled = new Uint32Array(W * H);
let pullPass = 0;

// Moves up to n units of liquid from tile a into tile b (empty, or holding the same liquid), with its heat and contents.
function flowInto(a, b, n) {
  const mv = Math.min(n, liq[a], 255 - liq[b]);
  if (mv <= 0 || (liq[b] && typ[b] !== typ[a])) return 0;
  carryHeat(a, b, mv, liq[b]);   // carries the dissolved contents too
  liq[b] += mv; typ[b] = typ[a];
  liq[a] -= mv; if (!liq[a]) { typ[a] = 0; clearSol(a); }
  wake(a); wake(b);
  return mv;
}
const isWater = k => liq[k] > 0 && typ[k] === WATER;
// Pore water keeps its concentrations in the tile's existing sol vector, with held (not liq) as its volume.
// Transfer before resizing either reservoir. A wet tile shares one temperature between its dry matrix, pore water
// and dissolved ingredients; only the departing water parcel carries sensible heat and pending phase energy.
function movePoreWater(a, b, requested, fromPore, toPore) {
  const hadA = fromPore ? held[a] : liq[a], hadB = toPore ? held[b] : liq[b];
  const mv = Math.max(0, Math.min(Math.floor(requested), Math.floor(hadA), Math.floor(255 - hadB)));
  if (!mv) return 0;
  const sentCapacity = LCAP[WATER] * mv / 255 + dissolvedHeatCapacity(mv, sol, a * NSOL);
  const receivingCapacity = toPore ? poreHeatCapacity(solid[b], hadB, sol, b * NSOL)
    : LCAP[WATER] * hadB / 255 + dissolvedHeatCapacity(hadB, sol, b * NSOL);
  temp[b] = (temp[b] * receivingCapacity + temp[a] * sentCapacity) / (receivingCapacity + sentCapacity);
  mixSol(sol, b * NSOL, hadB, sol, a * NSOL, mv);
  const energy = latent[a] * mv / hadA;
  latent[a] -= energy; latent[b] += energy;
  if (toPore) held[b] += mv;
  else {
    liq[b] += mv; typ[b] = WATER; wake(b);
  }
  if (fromPore) held[a] -= mv;
  else { liq[a] -= mv; if (!liq[a]) typ[a] = 0; wake(a); }
  if (mv === hadA) clearSol(a);
  heatWake(a); heatWake(b);
  return mv;
}
// Evaporation/transpiration takes carrier water only. Retain dissolved quantities, including oxygen measured from
// its fixed reference. Until a dry-residue store is available, a last unit holds any remaining dissolved matter.
function removePoreCarrier(k, requested) {
  const had = held[k], p = k * NSOL, reference = OXYGEN_REFERENCE / MG_PER_UNIT;
  if (!had) return 0;
  let contents = false;
  for (let i = 0; i < NSOL; i++) if ((i === SOL_O2 ? reference - sol[p + i] : sol[p + i]) > 0) { contents = true; break; }
  const mv = Math.max(0, Math.min(Math.floor(requested), Math.floor(had - (contents ? 1 : 0))));
  if (!mv) return 0;
  held[k] -= mv;
  if (!held[k]) clearSol(k);
  else for (let i = 0; i < NSOL; i++) {
    sol[p + i] = i === SOL_O2 ? reference - (reference - sol[p + i]) * had / held[k] : sol[p + i] * had / held[k];
  }
  return mv;
}
// Adds pure water vapor to a gas tile without adding dissolved oxygen or duplicating its existing components.
function poreSteam(k, amount, temperature) {
  const had = liq[k], p = k * NSOL, reference = OXYGEN_REFERENCE / MG_PER_UNIT;
  const receivingCapacity = LCAP[STEAM] * had / 255 + dissolvedHeatCapacity(had, sol, p);
  const sentCapacity = LCAP[STEAM] * amount / 255;
  temp[k] = (temp[k] * receivingCapacity + temperature * sentCapacity) / (receivingCapacity + sentCapacity);
  for (let i = 0; i < NSOL; i++) sol[p + i] = i === SOL_O2 ? reference - (had ? reference - sol[p + i] : 0) * had / (had + amount)
    : had ? sol[p + i] * had / (had + amount) : 0;
  liq[k] += amount; typ[k] = STEAM; wake(k);
}
// A body heavy enough (40 or more) resting on the tile squeezes it.
function squeezed(x, y) {
  return bodies.some(b => b.x < x * T + T && b.x + b.w > x * T && Math.abs(b.y + b.h - y * T) < 2 && KINDS[b.kind].rho * b.w * b.h >= 40);
}
function sponge(k, x, y) {
  if (temp[k] > SPONGE_HOT || squeezed(x, y)) {   // heat or a weight wrings it out: below first, then the sides, then up
    for (const d of [3, 1, 2, 0]) {
      const n = nbr(x, y, d);
      if (n < 0 || solid[n] || !held[k] || (liq[n] && typ[n] !== WATER && typ[n] !== STEAM)) continue;
      const hot = temp[k] > 100, t = hot ? STEAM : WATER;
      if (liq[n] && typ[n] !== t) continue;
      const mv = Math.floor(Math.min(SQUEEZE, held[k], 255 - liq[n]));
      if (mv <= 0) continue;
      if (hot) { const evaporated = removePoreCarrier(k, mv); if (evaporated) poreSteam(n, evaporated, 110); }
      else movePoreWater(k, n, mv, true, false);
    }
  } else {
    for (let d = 0; d < 4 && held[k] < 255; d++) {
      const n = nbr(x, y, d);
      if (n < 0 || !isWater(n)) continue;
      const mv = Math.min(SOAK, liq[n], 255 - held[k]);
      movePoreWater(n, k, mv, false, true);
    }
  }
  const want = held[k] ? WETSPONGE : SPONGE;
  if (solid[k] !== want) { solid[k] = want; markDirty(x, y); }
}
// Soil getting wet or drying out only needs redrawing (redraw): it moves no liquid or heat.
// Dirt soaks up a little water from what touches it; wet soil drips into open space below, passes moisture down into
// dry dirt, dries out in the heat, and sprouts plants where it's open to the sky.
function soil(k, x, y) {
  if (solid[k] === DIRT) {
    if (Math.random() > 0.01) return;
    for (let d = 0; d < 4; d++) {
      const n = nbr(x, y, d);
      if (n < 0 || !isWater(n)) continue;
      const mv = Math.min(SOIL_HOLDS, liq[n]);
      movePoreWater(n, k, mv, false, true);
      solid[k] = WETDIRT; redraw(x, y);
      return;
    }
    return;
  }
  groundwater(k, x, y);
  if (!held[k]) { solid[k] = DIRT; redraw(x, y); return; }
  const below = y < H - 1 ? k + W : -1;
  if (below >= 0 && !solid[below] && (!liq[below] || typ[below] === WATER) && liq[below] < 255 && Math.random() < 0.005) {
    const mv = Math.min(held[k], 255 - liq[below]);   // what doesn't fit stays in the soil
    movePoreWater(k, below, mv, true, false);
  } else if (below >= 0 && solid[below] === DIRT && Math.random() < 0.01) {
    movePoreWater(k, below, held[k], true, true); solid[below] = WETDIRT; redraw(x, y + 1);
  } else if (temp[k] > 35 && Math.random() < 0.01) { const evaporated = removePoreCarrier(k, held[k]); if (evaporated) vapour(k, evaporated); }
  // Natural seedlings come from paid parental seeds (plants.js), rather than appearing from wet soil.
  if (!held[k]) { solid[k] = DIRT; redraw(x, y); }
}
// Wet soil's groundwater: soaks up water it touches, sinks, levels out sideways, and seeps out where it's soaked.
function groundwater(k, x, y) {
  if (held[k] < SOIL_CAP && Math.random() < 0.05) {   // rain and puddles soak in: from above until full, else until soaked
    for (let d = 0; d < 4; d++) {
      const n = nbr(x, y, d), room = (d === 0 ? SOIL_CAP : SOAKED) - held[k];
      if (n < 0 || room <= 0 || !isWater(n)) continue;
      const mv = Math.min(SINK, liq[n], room);
      movePoreWater(n, k, mv, false, true);
    }
  }
  const below = y < H - 1 ? k + W : -1;
  if (below >= 0 && solid[below] === WETDIRT && held[below] < SOIL_CAP && Math.random() < 0.5) {   // sinks
    const mv = Math.min(SINK, held[k], SOIL_CAP - held[below]);
    movePoreWater(k, below, mv, true, true);
  }
  if (Math.random() < LEVEL) {   // evens out with the soil beside it
    const n = nbr(x, y, Math.random() < 0.5 ? 1 : 2);
    if (n >= 0 && (solid[n] === DIRT || solid[n] === WETDIRT) && held[k] > held[n] + 4) {
      const mv = (held[k] - held[n]) >> 1;
      movePoreWater(k, n, mv, true, true);
      if (solid[n] === DIRT) { solid[n] = WETDIRT; redraw(n % W, (n / W) | 0); }
    }
  }
  if (held[k] >= SOAKED && Math.random() < SPRING_CHANCE) {   // a spring: soaked soil seeps into open space beside or below it
    const n = nbr(x, y, [1, 2, 3][(Math.random() * 3) | 0]);
    if (n >= 0 && !solid[n] && (!liq[n] || typ[n] === WATER) && liq[n] <= 255 - SPRING_OUT) {
      movePoreWater(k, n, SPRING_OUT, true, false);
    }
  }
}
// Lake ice (afloat) floats: it drops as the water under it drains away, rises through water that comes over it, and
// a piece at a sheet's edge breaks off and drifts with the current under it and, in the open, the wind, onto open water.
const floated = new Uint32Array(W * H);
let floatPass = 0;
function moveIce(k, n) {
  const oldTemp = temp[n], oldLatent = latent[n];
  sol.copyWithin(n * NSOL, k * NSOL, k * NSOL + NSOL); clearSol(k);
  latent[n] = latent[k]; latent[k] = oldLatent;
  solid[n] = ICE; held[n] = held[k]; temp[n] = temp[k]; afloat[n] = 1; floated[n] = floatPass;
  solid[k] = 0; held[k] = 0; afloat[k] = 0; temp[k] = oldTemp;
  markDirty(k % W, (k / W) | 0); markDirty(n % W, (n / W) | 0);
}
// Ice in tile k trades places with the water in tile w.
function swapIce(k, w) {
  const t = temp[k], h = held[k], energy = latent[k];
  swapSol(k, w); latent[k] = latent[w]; latent[w] = energy;
  liq[k] = liq[w]; typ[k] = WATER; temp[k] = temp[w];
  liq[w] = 0; typ[w] = 0;
  solid[k] = 0; held[k] = 0; afloat[k] = 0;
  solid[w] = ICE; held[w] = h; temp[w] = t; afloat[w] = 1; floated[w] = floatPass;
  markDirty(k % W, (k / W) | 0); markDirty(w % W, (w / W) | 0); wake(k);
}
function floe(k, x, y) {
  if (floated[k] === floatPass || y === 0 || y === H - 1) return;
  const below = k + W, up = k - W;
  if (!solid[below] && !liq[below]) { moveIce(k, below); return; }
  if (!solid[up] && isWater(up)) { swapIce(k, up); return; }   // water over it: the ice comes up and the water goes under
  if (!isWater(below)) return;   // resting on the ground or on other ice
  const push = vel[below] + (under[k] ? 0 : windAt(x, y) * 0.5);
  if (Math.abs(push) < 0.1 || Math.random() > Math.abs(push) * DRIFT) return;
  const dx = push > 0 ? 1 : -1, n = k + dx;
  if (x + dx < 0 || x + dx >= W || solid[n] || !isWater(n + W)) return;   // only out over open water
  if (!liq[n]) moveIce(k, n);
  else if (isWater(n)) swapIce(k, n);   // the water it floats in moves round it
}
// A tree's crown regrows: now and then a leaf grows a new leaf into open air beside or above it, if that spot is within
// two tiles of the tree's wood, so a crown fills back in but never spreads beyond it.
const REGROW = 0.0005;
function regrow(x, y) {
  if (Math.random() > REGROW) return;
  const n = nbr(x, y, [0, 1, 2][(Math.random() * 3) | 0]);
  if (n < 0 || solid[n] || liq[n]) return;
  const nx = n % W, ny = (n / W) | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = nx + dx, yy = ny + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && solid[yy * W + xx] === WOOD && ecoTreeLeaf(y * W + x, yy * W + xx, n, sunHeight() > 0)) { solid[n] = LEAF; redraw(nx, ny); return; }
  }
}
// Liquid resting on porous rock seeps down through it into open space below; rising gases seep up through it.
function seep(k, x, y) {
  if (y === 0 || y === H - 1) return;
  const up = k - W, down = k + W;
  if (liq[up] && LIQ[typ[up]].grav > 0 && !solid[down]) flowInto(up, down, SEEP);
  else if (liq[down] && LIQ[typ[down]].grav < 0 && !solid[up]) flowInto(down, up, SEEP);
}
// Living coral grows into warm (15–32°) salt water, taking that water into itself (kept in held, like ice); above 32°
// it bleaches and dies.
function coral(k, x, y) {
  if (temp[k] > 32) { solid[k] = BLEACHED; markDirty(x, y); puff(k, 'fizz'); return; }
  if (Math.random() > 0.02) return;
  const n = nbr(x, y, Math.floor(Math.random() * 4));
  if (n < W || !isWater(n) || sol[n * NSOL + SOL_SALT] < 60 || temp[n] < 15 || temp[n] > 32) return;
  held[n] = liq[n] < 255 ? liq[n] : 0; liq[n] = 0; typ[n] = 0; clearSol(n);
  solid[n] = CORAL; markDirty(n % W, (n / W) | 0); wake(n);
}
// Ferrofluid within reach of a magnet (or a powered electromagnet) flows one tile towards it per pass; iron weights
// are drawn to it too.
function pullFerro() {
  pullPass++;
  for (const m of magnets) {
    const mx = m % W, my = (m / W) | 0;
    for (let y = Math.max(0, my - MAGNET_REACH); y <= Math.min(H - 1, my + MAGNET_REACH); y++) {
      for (let x = Math.max(0, mx - MAGNET_REACH); x <= Math.min(W - 1, mx + MAGNET_REACH); x++) {
        const k = y * W + x;
        if (!liq[k] || typ[k] !== FERRO || pulled[k] === pullPass) continue;
        const dx = mx - x, dy = my - y;
        if (Math.abs(dx) + Math.abs(dy) <= 1) continue;   // already against the magnet
        const n = Math.abs(dx) >= Math.abs(dy) ? k + Math.sign(dx) : k + Math.sign(dy) * W;
        if (solid[n]) continue;
        if (flowInto(k, n, PULL)) pulled[n] = pullPass;
      }
    }
    for (const b of bodies) {
      if (b.kind !== 'weight') continue;
      const dx = mx * T + 4 - (b.x + b.w / 2), dy = my * T + 4 - (b.y + b.h / 2), d = Math.hypot(dx, dy);
      if (d > MAGNET_REACH * T || d < 6) continue;
      b.vx += dx / d * 0.25; b.vy += dy / d * 0.25;
    }
  }
}

function materialsTick() {
  // Fixed carbon belongs to the moss that made it. Clearing a moss tile removes its reserve explicitly; a later
  // moss tile at the same coordinate cannot inherit it. Full detritus/biomass recycling follows in Phase 22B.
  for (const key of Object.keys(S.mossSugar)) if (solid[key] !== MOSS) {
    ecoDeposit(+key, bioPool(S.mossSugar[key]));
    delete S.mossSugar[key];
  }
  magnets.length = 0;
  floatPass++;
  for (let k = 0; k < W * H; k++) {
    const b = solid[k];
    if (!b) continue;
    const x = k % W, y = (k / W) | 0;
    if (b === SPONGE || b === WETSPONGE) sponge(k, x, y);
    else if (b === DIRT || b === WETDIRT) soil(k, x, y);
    else if (b === POROUS) seep(k, x, y);
    else if (b === CORAL) coral(k, x, y);
    else if (b === MOSS) moss(k, x, y);
    else if (b === MAGNET) magnets.push(k);
    else if (b === ICE && afloat[k]) floe(k, x, y);
    else if (b === LEAF) regrow(x, y);
  }
  for (const [k, d] of devices) if (d.kind === EMAGNET && d.active) magnets.push(k);   // electromagnets pull only while powered
  if (magnets.length) pullFerro();
}

// Moss keeps the carbon it fixes as a saved sugar reserve, measured in the same airCarb units as plants. Respiration
// can spend only that reserve and available oxygen. This small reserve does not yet model the mineral block's full
// biomass or nutrient costs (Phase 22B).
const MOSS_PHOTO = 0.5, MOSS_RESPIRE = 0.125;
function moss(k, x, y) {
  if (Math.random() >= MOSS_PHOTO / 4) return;   // one materials tick in eight
  let air = -1;
  for (let d = 0; d < 4 && air < 0; d++) { const n = nbr(x, y, d); if (n >= 0 && !solid[n] && !liq[n]) air = n; }
  if (air < 0) return;
  let reserve = S.mossSugar[k] || 0;
  if (sunHeight() > 0 && skyAbove(k)) reserve += fixCarbon(air, 1);
  if (Math.random() < MOSS_RESPIRE / MOSS_PHOTO) reserve -= respire(air, Math.min(1, reserve));
  if (reserve > 0) S.mossSugar[k] = reserve;
  else delete S.mossSugar[k];
}

export { movePoreWater, removePoreCarrier, MOSS_PHOTO, MOSS_RESPIRE, moss, REGROW, regrow, SOIL_CAP, SOAKED, SINK, LEVEL, SPRING_OUT, SPRING_CHANCE, DRIFT, groundwater, floated, moveIce, swapIce, floe, SOAK, SQUEEZE, SPONGE_HOT, SOIL_HOLDS, SEEP, MAGNET_REACH, PULL, magnets, flowInto, squeezed, sponge, soil, seep, coral, pullFerro, materialsTick };
