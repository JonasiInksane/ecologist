// Plants: a seed on dirt grows into a stem of plant blocks, drinking water from around its root (tonic counts four
// times over) and putting out leaves. Without water it wilts from the top down and dies; it doesn't grow while its
// root is frozen. The water a plant drinks it breathes out into the air above it. Plants burn, and acid eats them.
// Wilted tissue retains finite organic matter, which can decay and return mineral nutrients.
// A grown plant that's drinking regrows the leaves it loses (moths eat them) and now and then drops a seed on open
// soil a few tiles away, if no other plant stands too close, so plants spread where there's water for them.
// Plants live on sugar they make themselves: in daylight, with water, a plant takes carbon dioxide from the air round
// its top and gives back oxygen (photosynthesis), storing sugar; day and night it burns some of that sugar to live,
// using oxygen and giving back CO2 (respiration). Growing a tile costs sugar, so a plant in the dark or in air with no
// CO2 left stops growing and, once its sugar runs out, wilts. A grown plant with sugar to spare flowers, and its flower
// fills with nectar, which bees carry off (js/creatures.js). Roots take up the nitrate (fertiliser) and ammonium in the
// water they drink, even traces, which is what keeps a sealed jar's water from going green.
import { DIRT, H, LEAF, MOSS, MUD, PLANT, TONIC, W, WATER, WETDIRT } from './config.js';
import { S, liq, markDirty, solid, temp, typ, wake } from './world.js';
import { NSOL, SOL_AMMONIA, SOL_FERT } from './config.js';
import { sol } from './world.js';
import { FERT } from './config.js';
import { vapour } from './air.js';
import { FLOWER } from './config.js';
import { sunHeight } from './daynight.js';
import { fixCarbon, skyAir, respire, skyAbove } from './oxygen.js';
import { held } from './world.js';
import { removeCarrier } from './solutes.js';
import { removePoreCarrier } from './materials.js';
import { ecoNectar, ecoPlantCost, ecoPlantPool, ecoReleaseFlower, ecoReleasePlant, ecoRootMinerals, ecoRootSoil, ecoSeedPlant, ecoState, ecoStorePlant } from './ecology.js';
import { ECO_COST, ECO_RATE } from './ecology-data.js';

const plants = [];   // { root, top, h, max, drunk, thirst, sugar, nitrogen, flower }
const REACH = 3, SIP = 8, GROW_AT = 6, WILT_AT = 700, MAX_HEIGHT = [5, 10];   // WILT_AT: plant ticks of drought or hunger before it wilts, about a day
const SOIL = new Set([DIRT, MOSS]);
// Per plant tick (every 16 ticks), per stem tile: CO2 taken in daylight (hundredths of a percent of a tile of air),
// and sugar burnt to live; sugar a new tile costs; what a seed starts with; sugar a plant needs to flower, and the
// sugar each plant tick turns into nectar.
const PHOTO = 1, RESPIRE = 0.25, GROW_COST = ECO_COST.stem, SEED_SUGAR = ECO_COST.seed, FLOWER_AT = 40, NECTAR = 2, NECTAR_MAX = ECO_RATE.nectarMax;
const SEED_CHANCE = 0.004, LEAF_CHANCE = 0.02, SEED_REACH = 6, SPACING = 2, MAX_PLANTS = 200;   // chances per plant tick

// Plants a seed in empty tile k if it sits on soil. Returns whether it took.
function plantSeed(k, funding) {
  if (k < 0 || k >= W * H - W || solid[k] || liq[k] || !SOIL.has(solid[k + W])) return false;
  const seed = { root: k, top: k, h: 1, max: MAX_HEIGHT[0] + ((Math.random() * (MAX_HEIGHT[1] - MAX_HEIGHT[0])) | 0), drunk: 0, thirst: 0, flower: -1 };
  seed.id = (S.nextPlantId || 0) + 1;
  if (!ecoSeedPlant(seed, funding)) return false;
  S.nextPlantId = seed.id;
  solid[k] = PLANT; markDirty(k % W, (k / W) | 0);
  plants.push(seed);
  return true;
}
// Takes a sip from the nearest water (or tonic, or wet mud, or damp soil) around the root. Returns how much growth it gives.
function drink(root, plant = plants.find(p => p.root === root)) {
  const x = root % W, y = (root / W) | 0;
  for (let r = 1; r <= REACH; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx, t = typ[k];
    if (solid[k] === WETDIRT && held[k] >= SIP) {   // roots drink the water held in damp soil, too
      const fed = takeRootNitrogen(k, held[k], plant);
      if (skyAir(root)) {
        const sip = removePoreCarrier(k, SIP);
        if (!sip) return 0;
        vapour(root, sip);
        if (!held[k]) { solid[k] = DIRT; markDirty(nx, ny); }
      }
      return fed ? 3 : 1;
    }
    if (!liq[k] || (t !== WATER && t !== TONIC && t !== MUD)) continue;
    const fed = t === WATER && takeRootNitrogen(k, liq[k], plant);
    if (skyAir(root)) {   // breathed out into the open air; under a roof it condenses and runs back where it came from
      const sip = removeCarrier(k, SIP);
      if (!sip) return 0;
      vapour(root, sip);
    }
    wake(k);
    return t === TONIC ? 4 : fed ? 3 : 1;   // tonic and fertilised water make plants grow faster
  }
  return 0;
}
// Water loss changes concentration; mineral uptake removes an amount and stores it on the plant.
function takeRootNitrogen(k, volume, plant) {
  const p = k * NSOL, fert = Math.max(0, sol[p + SOL_FERT]), fed = fert >= 30;
  if (!plant || !volume) return fed;
  ecoRootMinerals(k, volume, plant);
  return fed;
}
function plantTick() {
  for (let i = plants.length - 1; i >= 0; i--) {
    const p = plants[i];
    if (solid[p.root] !== PLANT || (ecoState().tissue[p.root]?.owner !== p.id)) { dropFlower(p); ecoReleasePlant(p); plants.splice(i, 1); continue; }
    while (p.top !== p.root && ((solid[p.top] !== PLANT && solid[p.top] !== LEAF) || ecoState().tissue[p.top]?.owner !== p.id)) { p.top += W; p.h--; }
    if (p.flower >= 0 && (solid[p.flower] !== FLOWER || p.flower !== p.top - W || ecoState().tissue[p.flower]?.owner !== p.id)) p.flower = -1;
    if (temp[p.root] < 0) continue;
    ecoRootSoil(p.root + W, p);
    const g = drink(p.root, p);
    if (p.sugar === undefined) p.sugar = SEED_SUGAR * 4;   // a plant from before plants made sugar
    const air = airBeside(p.top);
    if (g && sunHeight() > 0 && skyAbove(p.top)) p.sugar += fixCarbon(air, PHOTO * p.h);   // photosynthesis
    const need = RESPIRE * p.h, burn = respire(air, Math.min(need, Math.max(0, p.sugar)));
    p.sugar = Math.max(0, p.sugar - burn);   // only sugar actually metabolized becomes CO2
    if (!g || burn < need) {   // insufficient oxygen is stress even when sugar remains in storage
      if (++p.thirst < WILT_AT) continue;
      p.thirst = WILT_AT * 0.8;   // wilts one tile at a time
      dropFlower(p);
      if (ecoState().tissue[p.top]?.owner === p.id) { solid[p.top] = 0; markDirty(p.top % W, (p.top / W) | 0); }
      if (p.top === p.root) { ecoReleasePlant(p); plants.splice(i, 1); continue; }
      p.top += W; p.h--;
      continue;
    }
    p.thirst = 0;
    if (p.h >= p.max) {   // grown: regrow a leaf, or drop a seed; flower, and fill the flower with nectar
      if (Math.random() < LEAF_CHANCE) regrowLeaf(p);
      if (Math.random() < SEED_CHANCE && plants.length < MAX_PLANTS) dropSeed(p);
      bloom(p);
      continue;
    }
    if ((p.drunk += g) < GROW_AT || p.sugar < GROW_COST) continue;
    const up = p.top - W;
    if (up < 0 || solid[up] || liq[up]) continue;
    if (!ecoPlantCost(p, GROW_COST, up, PLANT)) continue;
    p.drunk = 0;
    solid[up] = PLANT; p.top = up; p.h++;
    markDirty(up % W, (up / W) | 0);
    if (p.h >= 3 && Math.random() < 0.5) {   // a leaf to one side
      const dx = Math.random() < 0.5 ? -1 : 1, sx = up % W + dx, side = up + dx;
      if (sx >= 0 && sx < W && !solid[side] && !liq[side] && ecoPlantCost(p, ECO_COST.leaf, side, LEAF)) { solid[side] = LEAF; markDirty(side % W, (side / W) | 0); }
    }
  }
}

// The air a plant breathes: above its top, or beside it.
function airBeside(top) {
  const x = top % W;
  for (const o of [top - W, x > 0 ? top - 1 : -1, x < W - 1 ? top + 1 : -1]) if (o >= 0 && o < W * H && !solid[o] && !liq[o]) return o;
  return -1;
}
// A grown plant with sugar to spare opens a flower on its top, and turns some of its sugar into nectar there.
function bloom(p) {
  const f = p.top - W;
  if (p.flower < 0) {
    if (p.sugar < FLOWER_AT || f < 0 || solid[f] || liq[f] || sunHeight() <= 0) return;
    if (!ecoPlantCost(p, ECO_COST.flower, f, FLOWER)) return;
    solid[f] = FLOWER; held[f] = 0; p.flower = f; markDirty(f % W, (f / W) | 0);
  }
  if (p.sugar > FLOWER_AT / 2 && held[f] < NECTAR_MAX) ecoNectar(p, f, NECTAR);
}
function dropFlower(p) {
  if (p.flower >= 0 && solid[p.flower] === FLOWER && ecoState().tissue[p.flower]?.owner === p.id) { ecoReleaseFlower(p.flower); solid[p.flower] = 0; markDirty(p.flower % W, (p.flower / W) | 0); }
  p.flower = -1;
}
// A leaf beside a random stem tile at least three tiles up, if there's room.
function regrowLeaf(p) {
  const up = (Math.min(p.h, 3) - 1 + ((Math.random() * Math.max(1, p.h - 2)) | 0)) * W, k = p.root - up;
  if (k < 0 || solid[k] !== PLANT || ecoState().tissue[k]?.owner !== p.id) return;
  const dx = Math.random() < 0.5 ? -1 : 1, sx = k % W + dx, side = k + dx;
  if (sx >= 0 && sx < W && !solid[side] && !liq[side] && ecoPlantCost(p, ECO_COST.leaf, side, LEAF)) { solid[side] = LEAF; markDirty(sx, (side / W) | 0); }
}
// A seed falls in a random column within SEED_REACH and takes root on the first open tile over soil near the parent's
// root level, unless a plant already stands within SPACING.
function dropSeed(p) {
  const x = p.root % W, y = (p.root / W) | 0, d = 2 + ((Math.random() * (SEED_REACH - 1)) | 0), sx = x + (Math.random() < 0.5 ? -d : d);
  if (sx < SPACING || sx >= W - SPACING) return;
  for (let sy = Math.max(1, y - 4); sy <= Math.min(H - 2, y + 4); sy++) {
    const k = sy * W + sx;
    if (solid[k] || liq[k] || !SOIL.has(solid[k + W])) continue;
    for (let dy = -SPACING; dy <= SPACING; dy++) for (let dx = -SPACING; dx <= SPACING; dx++) {
      const o = k + dy * W + dx;
      if (o >= 0 && o < W * H && solid[o] === PLANT) return;
    }
    const funding = ecoPlantPool(p);
    if (plantSeed(k, funding)) ecoStorePlant(p, funding);
    return;
  }
}

export { takeRootNitrogen, PHOTO, RESPIRE, GROW_COST, SEED_SUGAR, FLOWER_AT, NECTAR, NECTAR_MAX, airBeside, bloom, dropFlower, SEED_CHANCE, LEAF_CHANCE, SEED_REACH, SPACING, MAX_PLANTS, regrowLeaf, dropSeed, plants, REACH, SIP, GROW_AT, WILT_AT, MAX_HEIGHT, SOIL, plantSeed, drink, plantTick };
