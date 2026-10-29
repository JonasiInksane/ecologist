// Biomes: regions of the world with their own climate, ground and features. A biome is mostly numbers the other
// systems already read (a temperature offset, humidity, wind exposure, how far day and night swing, how often dry and
// wet spells come), plus how the generator shapes and dresses its ground. Climate and height blend across BLEND tiles
// at the borders. This file also runs the biomes' moving parts: dry and wet spells, the coast's tides, and rivers.
import { AW, CELL, hum } from './air.js';
import { colBiome, colHum, colSwing, colTemp, colWind, drought, spellTemp } from './climate.js';
import { cloud, gather, lowCell, measure } from './air.js';
import { AETHER, AIR, CRYSTAL, ORE } from './config.js';
import { COMB, BASALT, BLOOM, BRICK, CLAY, DIRT, GEYSER, H, ICE, LAVA, LEAF, MOSS, MUD, NSOL, OBSIDIAN, OIL, PERMAFROST, QUICK, SALT, SAND, SLIME, SNOW, SOL_SALT, SOL_SILT, STONE, VENT, W, WATER, WOOD } from './config.js';
import { DAY_TICKS, dayPhase } from './daynight.js';
import { placeDevice } from './devices.js';
import { LIQ } from './liquids.js';
import { plantSeed } from './plants.js';
import { hash, vnoise } from './util.js';
import { S, latent, liq, markDirty, sol, solid, temp, typ, wake } from './world.js';
import { mixSol } from './solutes.js';
import { LCAP, dissolvedHeatCapacity } from './matter.js';
import { ecoContents, ecoState } from './ecology.js';
import { bioAdd } from './ecology-core.js';
import { T } from './config.js';
import { addBody } from './bodies.js';

const BASE = (H * 0.36) | 0, BLEND = 16, SEA_ROW = BASE + 10, START = 96;
// temp: °C offset; hum: evaporation relative to grassland; wind: exposure; swing: day/night temperature swing;
// drought, wet: chance per day of a dry or wet spell starting; height: rows lower (+) or higher (−) than the base;
// rough: how hilly; flood: chance per day of a flash flood (a cloudburst) in a dry region.
const BIOMES = [
  { name: 'grassland',  temp: 0,   hum: 1,    wind: 1,   swing: 1,   drought: 0.1,  wet: 0.1,  height: 0,   rough: 1 },
  { name: 'forest',     temp: -2,  hum: 1.3,  wind: 0.6, swing: 0.8, drought: 0.08, wet: 0.15, height: -2,  rough: 1 },
  { name: 'jungle',     temp: 10,  hum: 2.2,  wind: 0.5, swing: 0.5, drought: 0.02, wet: 0.4,  height: -1,  rough: 0.8 },
  { name: 'swamp',      temp: 6,   hum: 1.8,  wind: 0.3, swing: 0.6, drought: 0.05, wet: 0.3,  height: 6,   rough: 0.2 },
  { name: 'desert',     temp: 14,  hum: 0.15, wind: 1.2, swing: 1.6, drought: 0.6,  wet: 0.03, height: 2,   rough: 0.6, flood: 0.3 },
  { name: 'salt flats', temp: 12,  hum: 0.2,  wind: 1.3, swing: 1.4, drought: 0.5,  wet: 0.03, height: 5,   rough: 0.05 },
  { name: 'badlands',   temp: 8,   hum: 0.3,  wind: 1.1, swing: 1.3, drought: 0.4,  wet: 0.05, height: -4,  rough: 2, flood: 0.3 },
  { name: 'tundra',     temp: -32, hum: 0.6,  wind: 1.3, swing: 0.7, drought: 0.1,  wet: 0.1,  height: 0,   rough: 0.6 },
  { name: 'glacier',    temp: -36, hum: 0.8,  wind: 1.5, swing: 0.6, drought: 0.05, wet: 0.15, height: -22, rough: 1.4 },
  { name: 'coast',      temp: 2,   hum: 1.5,  wind: 1.6, swing: 0.6, drought: 0.05, wet: 0.2,  height: 2,   rough: 0.4 },
  { name: 'volcanic',   temp: 8,   hum: 0.7,  wind: 1,   swing: 1,   drought: 0.2,  wet: 0.05, height: -4,  rough: 1.2 },
];
const byName = n => BIOMES.findIndex(b => b.name === n);
const regions = [];   // { b, x0, x1, spell: null | 'drought' | 'wet', left, hum } along the world, left to right
let tide = null;      // { x0, store } where the coast's sea starts, and the water out in the open sea beyond the edge
const rivers = [];    // { src, mouth, level, store }: a river's source tile, its pond's middle column and level, water underground

// Lays the biomes out along the world: grassland where the explorer starts, then three or four others in an order
// set by the seed (the coast, if any, always at the right-hand edge).
function planBiomes() {
  regions.length = 0;
  regions.push({ b: 0, x0: 0, x1: START - 1 });
  const order = BIOMES.map((_, i) => i).slice(1).sort((a, b) => hash(a, 911) - hash(b, 911));
  const picks = [];
  let x = START;
  for (const b of order) {
    const w = 80 + ((hash(b, 913) * 40) | 0);
    if (x + w > W + 30) break;
    picks.push(b); x += w;
  }
  const coast = picks.indexOf(byName('coast'));
  if (coast >= 0) picks.push(picks.splice(coast, 1)[0]);
  x = START;
  picks.forEach((b, i) => {
    const w = i === picks.length - 1 ? W - x : Math.round((W - START) / picks.length);
    regions.push({ b, x0: x, x1: x + w - 1 }); x += w;
  });
  for (const r of regions) Object.assign(r, { spell: null, left: 0, hum: BIOMES[r.b].hum });
}
// How much each region counts at column x: 1 inside it, fading to 0 across BLEND tiles at its borders.
function weights(x) {
  const out = [];
  for (const r of regions) {
    const w = Math.max(0, Math.min(1, (Math.min(x - r.x0, r.x1 - x) + BLEND / 2) / BLEND));
    if (w > 0) out.push([r, w]);
  }
  const sum = out.reduce((s, [, w]) => s + w, 0);
  return out.map(([r, w]) => [r, w / sum]);
}
// The region whose ground column x takes: the strongest one, with a ragged edge where two blend.
function regionAt(x) {
  const ws = weights(x);
  let pick = hash(x, 13);
  for (const [r, w] of ws) { if (pick < w) return r; pick -= w; }
  return ws[ws.length - 1][0];
}
// Fills in each column's climate and returns its ground surface row.
function shapeColumns() {
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let t = 0, hu = 0, wi = 0, sw = 0, h = 0, rough = 0;
    for (const [r, w] of weights(x)) {
      const B = BIOMES[r.b];
      t += B.temp * w; hu += B.hum * w; wi += B.wind * w; sw += B.swing * w; h += B.height * w; rough += B.rough * w;
      const f = (x - r.x0) / Math.max(1, r.x1 - r.x0);
      if (B.name === 'glacier') h += (vnoise(x / 12, 5, 61) - 0.5) * 24 * w;                  // jagged peaks
      if (B.name === 'desert') h += (vnoise(x / 9, 2, 71) - 0.5) * 10 * w;                    // dunes
      if (B.name === 'coast') h += f * f * 26 * w;                                            // sloping down into the sea
      if (B.name === 'volcanic') {                                                            // a cone with a crater
        const d = Math.abs(f - 0.5) * (r.x1 - r.x0);
        h -= Math.max(0, 20 - d * 0.8) * w;
        if (d < 5) h += 7 * w;
      }
    }
    colTemp[x] = t; colHum[x] = hu; colWind[x] = wi; colSwing[x] = sw; colBiome[x] = regionAt(x).b;
    let s = BASE + h + ((vnoise(x / 18, 0, 11) - 0.5) * 16 + (vnoise(x / 6, 3, 23) - 0.5) * 4) * rough;
    if (BIOMES[colBiome[x]].name === 'badlands') s = Math.round(s / 3) * 3;                     // flat-topped mesas
    surf[x] = Math.max(8, Math.min(H - 20, Math.round(s)));
  }
  return surf;
}
// The block at depth d below the surface of column x (row y), for the biome that column belongs to.
function groundBlock(x, y, d) {
  const name = BIOMES[colBiome[x]].name, n = vnoise(x / 5, 9, 31) * 5;
  switch (name) {
    case 'desert': return d < 9 + n ? SAND : STONE;
    case 'salt flats': return d < 2 ? SALT : d < 7 ? CLAY : STONE;
    case 'badlands': return d < 18 ? ((y >> 1) % 3 === 1 ? BRICK : CLAY) : STONE;
    case 'tundra': return d < 1 ? SNOW : d < 10 + n ? PERMAFROST : STONE;
    case 'glacier': return d < 2 ? SNOW : d < 10 + n ? ICE : STONE;
    case 'coast': return d < 5 ? SAND : STONE;
    case 'volcanic': return d < 6 + n ? (hash(x, y) > 0.85 ? OBSIDIAN : BASALT) : STONE;
    case 'swamp': return d < 7 + n ? DIRT : STONE;
    default: return d < 5 + n ? DIRT : STONE;
  }
}
const setLiquid = (k, t, amount = 255) => { solid[k] = 0; liq[k] = amount; typ[k] = t; temp[k] = LIQ[t].paintT; sol.fill(0, k * NSOL, k * NSOL + NSOL); };
// A tree: a wooden trunk with a diamond of leaves on top.
function tree(x, surf, tall) {
  const y0 = surf[x] - 1;
  for (let i = 0; i < tall; i++) if (y0 - i >= 0 && !solid[(y0 - i) * W + x]) solid[(y0 - i) * W + x] = WOOD;
  const cy = y0 - tall, r = tall > 7 ? 3 : 2;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, yy = cy + dy, k = yy * W + xx;
    if (Math.abs(dx) + Math.abs(dy) > r + 0.5 || xx < 0 || xx >= W || yy < 0 || solid[k]) continue;
    solid[k] = LEAF;
  }
}
// A dip carved into the ground at x0..x1 and filled: fill(x, y, depthFromTop) gives the liquid (or 0) for each tile.
function pool(x0, x1, surf, depth, fill) {
  const top = Math.min(...Array.from({ length: x1 - x0 + 1 }, (_, i) => surf[x0 + i]));
  for (let x = x0; x <= x1; x++) {
    const edge = Math.min(x - x0, x1 - x), dd = Math.min(depth, edge + 1);
    for (let y = top; y < top + dd; y++) {
      const k = y * W + x, t = fill(x, y, y - top);
      solid[k] = 0; liq[k] = 0; typ[k] = 0;
      if (t) setLiquid(k, t);
    }
    surf[x] = top;
  }
  return top;
}
// A river: it rises at the highest ground of x0..x1, runs downhill in a shallow channel, and ends in a pond at the
// first low point. Returns the pond's middle column and top row and the columns the river spans, or null where the land
// is too flat or short for one.
function river(x0, x1, surf) {
  let src = x0 + 8;
  for (let x = x0 + 8; x <= x1 - 8; x++) if (surf[x] < surf[src]) src = x;
  let left = 0, right = 0;
  for (let i = 1; i <= 12; i++) { left += surf[Math.max(x0, src - i)]; right += surf[Math.min(x1, src + i)]; }
  const dir = right >= left ? 1 : -1;   // towards the lower ground (a larger row is lower)
  let x = src;
  while (x + dir > x0 + 8 && x + dir < x1 - 8 && surf[x + dir] >= surf[x] - 1 && Math.abs(x - src) < RIVER_LONGEST) x += dir;   // leave room for the region's own features
  if (Math.abs(x - src) < 16) return null;
  const mid = x - dir * 6, top = pool(mid - 7, mid + 7, surf, 4, () => WATER);
  for (let c = src; c !== mid - dir * 7; c += dir) {   // the channel: the top tile of ground, part filled, on a bed of clay
    const k = surf[c] * W + c;
    if (solid[k] && solid[k] !== WOOD && solid[k] !== LEAF) setLiquid(k, WATER, 120);
    if (liq[k]) solid[k + W] = CLAY;
  }
  for (let c = mid - 8; c <= mid + 8; c++) for (let y = top; y <= top + 5; y++) {   // the pond in a clay basin, dammed on its low side
    const k = y * W + c;
    if (liq[k]) continue;
    if ([k - 1, k + 1, k - W].some(n => liq[n] && typ[n] === WATER)) { solid[k] = CLAY; liq[k] = 0; typ[k] = 0; }
  }
  for (let c = Math.min(src, mid - 8); c <= Math.max(src, mid + 8); c++) {   // no caves under it to drain it
    for (let y = surf[c] + 2; y <= surf[c] + 9 && y < H - 2; y++) if (!solid[y * W + c] && !liq[y * W + c]) solid[y * W + c] = STONE;
  }
  for (const y of [surf[src], surf[src] - 1]) { const k = y * W + src - dir; if (!liq[k]) solid[k] = CLAY; }   // a lip, so the source runs only downstream
  rivers.push({ src: surf[src] * W + src, mouth: mid, level: top, store: RIVER_START });
  return { mid, top, from: Math.min(src, mid - 7), to: Math.max(src, mid + 7) };
}
// Rivers keep flowing without making or losing water: what raises a river's pond above its level seeps back
// underground to the source (store), which lets it out again a little at a time, like the tide's open sea. If the pond
// dries up (it evaporates in a drought), so does the river until rain refills it.
const RIVER_LONGEST = 44, RIVER_EVERY = 4, RIVER_RATE = 8, RIVER_START = 255 * 200;   // the spring's groundwater: wets the banks, and outlasts dry weather a while
function riversTick() {
  for (const r of rivers) {
    if (!r.sol) r.sol = Array(NSOL).fill(0);
    if (r.sol.length !== NSOL) r.sol = Array.from({ length: NSOL }, (_, i) => r.sol[i] || 0);
    if (!Number.isFinite(r.temp)) r.temp = 12;
    if (!Number.isFinite(r.latent)) r.latent = 0;
    if (!r.bioRegistered) { bioAdd(ecoState().riverInventory, ecoContents(r.sol, 0, r.store)); r.bioRegistered = true; }
    for (const x of [r.mouth - 1, r.mouth, r.mouth + 1]) {   // a brimming pond's top goes underground
      let y = 0;
      while (y < H && !liq[y * W + x] && !solid[y * W + x]) y++;
      const k = y * W + x;
      const keep = y === r.level ? 128 : 0;   // a pond keeps its top row half full and sends the rest back
      if (y > r.level || solid[k] || typ[k] !== WATER || liq[k] <= keep) continue;
      const m = Math.min(liq[k] - keep, RIVER_RATE);
      const storedCap = LCAP[WATER] * r.store / 255 + dissolvedHeatCapacity(r.store, r.sol);
      const incomingCap = LCAP[WATER] * m / 255 + dissolvedHeatCapacity(m, sol, k * NSOL);
      r.temp = (r.temp * storedCap + temp[k] * incomingCap) / (storedCap + incomingCap);
      bioAdd(ecoState().riverInventory, ecoContents(sol, k * NSOL, m));
      mixSol(r.sol, 0, r.store, sol, k * NSOL, m);
      const energy = latent[k] * m / liq[k]; latent[k] -= energy; r.latent += energy;
      liq[k] -= m; if (!liq[k]) typ[k] = 0; r.store += m; wake(k);
    }
    const k = r.src;   // and comes up at the source
    if (solid[k] || (liq[k] && typ[k] !== WATER)) continue;
    const m = Math.min(r.store, RIVER_RATE, 255 - liq[k]);
    if (m <= 0) continue;
    const receiverCap = LCAP[WATER] * liq[k] / 255 + dissolvedHeatCapacity(liq[k], sol, k * NSOL);
    const sentCap = LCAP[WATER] * m / 255 + dissolvedHeatCapacity(m, r.sol);
    temp[k] = (temp[k] * receiverCap + r.temp * sentCap) / (receiverCap + sentCap);
    const exported = ecoContents(r.sol, 0, m);
    for (const key of ['c', 'n', 'p']) ecoState().riverInventory[key] -= exported[key];
    mixSol(sol, k * NSOL, liq[k], r.sol, 0, m);
    const energy = r.latent * m / r.store; r.latent -= energy; latent[k] += energy;
    liq[k] += m; typ[k] = WATER; r.store -= m; wake(k);
  }
}
// Dresses each region with its features once the ground is laid.
function features(surf) {
  for (const r of regions) {
    const B = BIOMES[r.b], { x0, x1 } = r, mid = (x0 + x1) >> 1, rnd = i => hash(r.x0 + i, 977);
    let pond = null;
    if ((B.name === 'forest' || B.name === 'jungle' || (B.name === 'grassland' && r !== regions[0])) && x1 - x0 >= 70) {
      pond = river(x0, x1, surf);   // a river, with fish and a pike in its pond
      if (pond) { for (let i = 0; i < 6; i++) addBody('fish', (pond.mid - 6 + i * 2) * T, (pond.top + 2) * T); addBody('pike', (pond.mid + 4) * T, (pond.top + 2) * T); }
    }
    if (B.name === 'forest' || B.name === 'jungle') {
      const jungle = B.name === 'jungle';
      for (let x = x0 + 4; x < x1 - 4; x += (jungle ? 5 : 8) + ((rnd(x) * 4) | 0)) {
        if (pond && x >= pond.from - 3 && x <= pond.to + 3) continue;   // no trees in the river
        tree(x, surf, (jungle ? 7 : 5) + ((rnd(x + 1) * 4) | 0));
        if (jungle || rnd(x + 2) > 0.6) plantSeed((surf[x + 2] - 1) * W + x + 2);
        if (jungle && rnd(x + 3) > 0.5) solid[surf[x + 1] * W + x + 1] = MOSS;
      }
      if (jungle) {   // a bloomwater spring, clear of the river (water would dissolve it)
        const bx = !pond || mid < pond.from - 6 || mid > pond.to + 6 ? mid : pond.from - 10 > x0 + 4 ? pond.from - 10 : pond.to + 10, y = surf[bx] + 3;
        for (let x = bx - 2; x <= bx + 2; x++) setLiquid(y * W + x, BLOOM);
      }
      for (let i = 0; i < 3; i++) { const mx = x0 + 10 + ((rnd(40 + i) * (x1 - x0 - 20)) | 0); addBody('moth', mx * T, (surf[mx] - 4) * T); }   // moths among the trees
      for (let i = 0; i < 2; i++) { const bx = x0 + 20 + ((rnd(50 + i) * (x1 - x0 - 40)) | 0); addBody('bird', bx * T, (surf[bx] - 10) * T); }   // and birds that hunt them
      for (let x = (x0 + x1) >> 1; x < x1 - 2; x++) {   // a wild bees' nest: a little honeycomb against a trunk, and its bees
        const y = surf[x] - 3, k = y * W + x;
        if (solid[k] !== WOOD || solid[k + 1] || solid[k + 1 - W]) continue;
        solid[k + 1] = COMB; solid[k + 1 - W] = COMB;
        for (let i = 0; i < 3; i++) addBody('bee', (x + 2) * T, (y - 1 - i) * T);
        break;
      }
    } else if (B.name === 'swamp') {
      for (let x = x0 + 6; x < x1 - 12; x += 14 + ((rnd(x) * 6) | 0)) {
        const w = 6 + ((rnd(x + 1) * 4) | 0);
        pool(x, x + w, surf, 3, (xx, y, d) => d === 2 ? MUD : WATER);
        for (let xx = x; xx <= x + w; xx++) for (let y = 0; y < H; y++) { const k = y * W + xx; if (liq[k] && typ[k] === WATER) sol[k * NSOL + SOL_SILT] = 60; }
        plantSeed((surf[x - 1] - 1) * W + x - 1);
      }
      const y = surf[mid] + 2;
      for (let x = mid - 2; x <= mid + 2; x++) setLiquid(y * W + x, SLIME);   // a slime nest
    } else if (B.name === 'desert') {
      if (rnd(0) > 0.4) {   // an oasis with plants round it
        const ox = x0 + 20 + ((rnd(1) * (x1 - x0 - 40)) | 0);
        pool(ox, ox + 8, surf, 3, () => WATER);
        for (const px of [ox - 2, ox + 10]) for (let y = surf[px]; y < surf[px] + 2; y++) solid[y * W + px] = DIRT;
        plantSeed((surf[ox - 2] - 1) * W + ox - 2); plantSeed((surf[ox + 10] - 1) * W + ox + 10);
      }
    } else if (B.name === 'salt flats') {
      const lx = mid - 10;
      pool(lx, lx + 20, surf, 2, () => WATER);
      for (let x = lx; x <= lx + 20; x++) for (let y = 0; y < H; y++) { const k = y * W + x; if (liq[k] && typ[k] === WATER) sol[k * NSOL + SOL_SALT] = 220; }
    } else if (B.name === 'tundra') {
      const lx = mid - 6;
      pool(lx, lx + 12, surf, 3, (x, y, d) => d === 0 ? 0 : WATER);
      for (let x = lx + 1; x < lx + 12; x++) { const k = surf[x] * W + x; solid[k] = ICE; liq[k] = 0; typ[k] = 0; temp[k] = -10; }   // frozen over
    } else if (B.name === 'glacier') {
      for (const cx of [x0 + 25, x1 - 25]) for (let y = surf[cx]; y < surf[cx] + 8; y++) { solid[y * W + cx] = 0; if (rnd(cx) > 0.5) solid[y * W + cx + 1] = 0; }   // crevasses
    } else if (B.name === 'coast') {
      tide = { x0, store: TIDE_STORE };
      for (let x = x0; x < W; x++) for (let y = SEA_ROW; y < surf[x]; y++) { setLiquid(y * W + x, WATER); sol[(y * W + x) * NSOL + SOL_SALT] = 200; }
    } else if (B.name === 'volcanic') {
      const top = pool(mid - 4, mid + 4, surf, 4, () => LAVA);   // the crater's lava lake
      for (let x = mid - 5; x <= mid + 5; x++) for (let y = top + 4; y < top + 8; y++) if (!liq[y * W + x]) solid[y * W + x] = BASALT;
      // a geyser: a vent over a water pocket over hot rock, on the flattest ground on the volcano's lower slopes, inside
      // a basalt mound (as real geysers build) so no hillside can cut into its pockets
      let gx = x0 + 14, best = H;
      for (let x = x0 + 10; x < mid - 12; x++) { let d = 0; for (let i = -6; i <= 6; i++) d += Math.abs(surf[x + i] - surf[x]); if (d < best) { best = d; gx = x; } }
      const gy = surf[gx];
      for (let x = gx - 5; x <= gx + 5; x++) for (let y = gy; y <= gy + 9; y++) { solid[y * W + x] = BASALT; liq[y * W + x] = 0; typ[y * W + x] = 0; }
      for (let x = gx - 3; x <= gx + 3; x++) {
        for (let y = gy + 1; y <= gy + 4; y++) setLiquid(y * W + x, WATER);
        for (let y = gy + 6; y <= gy + 7; y++) setLiquid(y * W + x, LAVA);
        solid[(gy + 8) * W + x] = BASALT;
      }
      solid[gy * W + gx] = 0; placeDevice(GEYSER, gy * W + gx);
      const vx = x1 - 14;   // a gas vent
      solid[surf[vx] * W + vx] = 0; placeDevice(VENT, surf[vx] * W + vx);
    }
  }
}
// The layers under every biome: water-filled aquifers below the water table, larger caves deeper down with oil and
// quicksilver seeps and veins of ore, then the deep caverns, and a sea of magma at the bottom under a basalt crust.
function underground(surf) {
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const k = y * W + x, d = y - surf[x];
    if (y >= H - 6 && y <= H - 3) { setLiquid(k, LAVA); continue; }
    if (y >= H - 8 && y <= H - 7) { solid[k] = BASALT; continue; }
    if (d < 16 || solid[k] !== STONE) continue;
    if (d >= 24 && vnoise(x / 3, y / 2, 400) > 0.84) { solid[k] = ORE; continue; }   // thin veins of ore, deeper down
    if (y > H * 0.72) continue;
    if (vnoise(x / 7, y / 5, 200) > 0.74) setLiquid(k, WATER);   // aquifer
  }
  for (let i = 0; i < 6; i++) {
    const cx = 20 + ((hash(i, 301) * (W - 40)) | 0), cy = ((H * 0.7) | 0) + ((hash(i, 303) * 12) | 0), t = i % 3 ? OIL : QUICK;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx / 9 + dy * dy / 4 < 1) setLiquid((cy + dy) * W + cx + dx, t);
  }
  caverns();
}
// The deep caverns: one wide, ragged hall in each fifth of the world, just above the basalt crust, where the rock is
// warm. Crystals hang from their ceilings and stand on their floors, glowing, so a cavern lights itself; each has a
// pool: quicksilver or oil on the floor, or aether, which rises, gathered under the roof.
const CAVERNS = 5, CAVERN_ROW = (H * 0.8) | 0;
function caverns() {
  const seg = W / CAVERNS;
  for (let i = 0; i < CAVERNS; i++) {
    const rx = 12 + ((hash(i, 601) * 9) | 0), ry = 5 + ((hash(i, 602) * 3) | 0);
    const cx = Math.round(seg * i + rx + 4 + hash(i, 603) * (seg - 2 * rx - 8)), cy = Math.min(H - 10 - ry, CAVERN_ROW + ((hash(i, 604) * 5) | 0));
    const inside = (x, y) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy + (vnoise(x / 4, y / 3, 610) - 0.5) * 0.5; };
    const fill = i % 3 === 0 ? QUICK : i % 3 === 1 ? OIL : AETHER;
    for (let y = cy - ry - 3; y <= cy + ry + 2; y++) for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      const k = y * W + x, d = inside(x, y);
      if (d < 1) { solid[k] = AIR; liq[k] = 0; typ[k] = 0; }
      else if (d < 1.6 && liq[k]) { solid[k] = STONE; liq[k] = 0; typ[k] = 0; }   // line it, so groundwater doesn't drain in
      else if (d < 1.8 && fill === AETHER && y < cy && !solid[k]) solid[k] = STONE;   // and roof it in, so the aether stays
    }
    for (let x = cx - rx; x <= cx + rx; x++) for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
      const k = y * W + x;
      if (solid[k] || inside(x, y) >= 1) continue;
      const left = x < cx - rx * 0.1 && x > cx - rx * 0.7, right = x > cx + rx * 0.1 && x < cx + rx * 0.7;
      if (fill === AETHER ? right && y <= cy - ry + 2 : left && y >= cy + ry - 2) setLiquid(k, fill);
    }
    for (let x = cx - rx - 2; x <= cx + rx + 2; x++) for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
      const k = y * W + x;
      if (solid[k] || liq[k]) continue;
      if (solid[k - W] && solid[k - W] !== CRYSTAL && hash(x, y + 5000) < 0.25) {   // hanging from the ceiling, 1–3 long
        for (let j = 0, n = 1 + ((hash(x, y + 5001) * 3) | 0); j < n && !solid[k + j * W] && !liq[k + j * W]; j++) solid[k + j * W] = CRYSTAL;
      } else if (solid[k + W] && solid[k + W] !== CRYSTAL && hash(x, y + 5002) < 0.12) {   // standing on the floor
        for (let j = 0, n = 1 + ((hash(x, y + 5003) * 2) | 0); j < n && !solid[k - j * W] && !liq[k - j * W]; j++) solid[k - j * W] = CRYSTAL;
      }
    }
  }
}
// Every 600 ticks: dry and wet spells start and end, region by region. A drought warms the air there, so clouds
// passing over dissolve and puddles dry twice as fast; a wet spell cools the air and draws moist air in from the rest
// of the world (it doesn't make any), so it rains more.
const SPELL_EVERY = 600, TIDE_EVERY = 16, DROUGHT_WARM = 12, WET_COOL = -4, WET_DRAW = 30, TIDE_STORE = 255 * 600;   // enough to raise the whole coastal sea by its three rows
function biomeTick() {
  if (!(S.tick % RIVER_EVERY)) riversTick();
  if (!S.weather) return;
  if (tide && !(S.tick % TIDE_EVERY)) tidesTick();
  if (S.tick % SPELL_EVERY) return;
  for (const r of regions) {
    const B = BIOMES[r.b];
    if (r.spell) {
      r.left -= SPELL_EVERY;
      if (r.spell === 'wet') {
        const cx0 = (r.x0 / CELL) | 0, cx1 = Math.min(AW - 1, (r.x1 / CELL) | 0);
        measure();
        const got = gather(WET_DRAW * (cx1 - cx0 + 1));
        for (let cx = cx0; cx <= cx1; cx++) hum[cx + AW * 2] += got / (cx1 - cx0 + 1);
      }
      if (r.left <= 0) setSpell(r, null);
    } else if (B.flood && Math.random() < B.flood * SPELL_EVERY / DAY_TICKS) cloudburst(r);
    else if (Math.random() < B.drought * SPELL_EVERY / DAY_TICKS) setSpell(r, 'drought');
    else if (Math.random() < B.wet * SPELL_EVERY / DAY_TICKS) setSpell(r, 'wet');
  }
}
// A flash flood in a dry region: a cloudburst gathers vapour from the whole sky (it makes none) and heaps it as heavy
// cloud low over the region, which rains out all at once; the runoff tears down the dry ground.
const CLOUDBURST = 1500;
function cloudburst(r) {
  measure();
  const cx0 = (r.x0 / CELL) | 0, cx1 = Math.min(AW - 1, (r.x1 / CELL) | 0), cells = [];
  for (let cx = cx0; cx <= cx1; cx++) { const c = lowCell(cx); if (c >= 0) cells.push(c - AW >= 0 ? c - AW : c); }
  if (!cells.length) return 0;
  const got = gather(CLOUDBURST * cells.length);
  for (const c of cells) cloud[c] += got / cells.length;
  r.flood = S.tick;
  return got;
}
function setSpell(r, spell) {
  r.spell = spell; r.left = spell ? DAY_TICKS * (1 + Math.random()) : 0;
  for (let x = r.x0; x <= r.x1; x++) {
    drought[x] = spell === 'drought' ? 1 : 0; colHum[x] = r.hum * (spell ? 2 : 1);
    spellTemp[x] = spell === 'drought' ? DROUGHT_WARM : spell === 'wet' ? WET_COOL : 0;
  }
}
// Tides: twice a day the sea at the world's right edge rises and falls by three rows, a tile at a time every
// TIDE_EVERY ticks. The water comes in from the open sea beyond the edge and goes back out to it (tide.store), so the
// tide moves water but never makes or loses any.
function tidesTick() {
  const target = SEA_ROW - 3 * Math.sin(dayPhase() * Math.PI * 4);
  if (tide.store === undefined) tide.store = TIDE_STORE;   // a world saved before the open sea was kept
  for (let x = W - 3; x < W; x++) {
    let top = 0;
    while (top < H && !liq[top * W + x] && !solid[top * W + x]) top++;
    // a salt crust left where sea water dried is washed back out to sea by the tide (it would hold the tide back)
    if (top < H && solid[top * W + x] === SALT && top >= SEA_ROW - 4) { solid[top * W + x] = 0; markDirty(x, top); continue; }
    if (top >= H || solid[top * W + x]) continue;
    if (top > target + 0.5 && top > 0 && tide.store >= 255) {
      const k = (top - 1) * W + x; setLiquid(k, WATER, 255); sol[k * NSOL + SOL_SALT] = 200; wake(k); tide.store -= 255;
    } else if (top < target - 0.5) {
      let b = top; while (b + 1 < H && liq[(b + 1) * W + x]) b++;
      const k = b * W + x, m = liq[k];
      tide.store += m; liq[k] = 0; typ[k] = 0; wake(k);
    }
  }
}
function biomeAt(x) { return BIOMES[colBiome[Math.max(0, Math.min(W - 1, x | 0))]]; }
function spellAt(x) { const r = regions.find(q => x >= q.x0 && x <= q.x1); return r ? r.spell : null; }
function resetBiomes() { regions.length = 0; tide = null; rivers.length = 0; }
// For snapshots (js/snapshot.js): the coast's tide state.
function tideState() { return tide; }
function setTideState(t) { tide = t; }

export { CAVERNS, CAVERN_ROW, caverns, CLOUDBURST, cloudburst, RIVER_LONGEST, rivers, river, riversTick, RIVER_EVERY, RIVER_RATE, RIVER_START, DROUGHT_WARM, WET_COOL, WET_DRAW, TIDE_STORE, TIDE_EVERY, BASE, BLEND, SEA_ROW, START, BIOMES, regions, planBiomes, weights, regionAt, shapeColumns, groundBlock, tree, pool, features, underground, SPELL_EVERY, biomeTick, setSpell, tidesTick, biomeAt, spellAt, resetBiomes, tideState, setTideState };
