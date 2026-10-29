// The air: a coarse grid over the world, one cell per 4 × 4 tiles, holding water vapour, cloud and wind (all water
// amounts are in the same units as liquid, 255 to a full tile). Open water evaporates into it, faster when warm,
// sunny and windy; air holds less vapour the colder it is, so air that cools (at night, or rising up a mountain)
// condenses into cloud; clouds drift on the wind and rain on what's under them, or snow below 0°. Air pushed up a
// slope rains out on the windward side and arrives dry beyond it; calm, cold nights make fog in low cells; tall storm
// clouds over warm ground throw lightning. Humid biomes draw moist air in from the rest of the world and dry ones send
// theirs away. Water moves between the ground and the air, and around the world, without being made or lost.
import { sfx } from './audio.js';
import { colHum, colWind, drought, shade, skyTempAt } from './climate.js';
import { H, METHANE, NSOL, CHLORINE, POISON, SALT, SMOKE, SNOW, STEAM, T, W, WATER } from './config.js';
import { HYDROGEN, LEAF, OXYGEN, SOL_SALT, SOL_SUGAR, SUGAR, SOL_O2, SOL_CO2 } from './config.js';
import { hurt } from './bodies.js';
import { sunHeight } from './daynight.js';
import { puff } from './particles.js';
import { S, VIEW, bodies, drop, heatWake, held, latent, airOx, airCarb, liq, markDirty, sol, solid, temp, typ, under, vel, wake } from './world.js';
import { clearSol, mixSol, removeCarrier, soluteAmount } from './solutes.js';
import { carryHeat } from './sim.js';
import { MG_PER_UNIT, OXYGEN_REFERENCE, AIR_O2_MG_PER_UNIT, AIR_CO2_EQ_MG_PER_UNIT, MAX_AIR_OX, MAX_AIR_CARB, stir, recordAtmosphere } from './oxygen.js';
import { LCAP, dissolvedHeatCapacity } from './matter.js';

const CELL = 4, AW = W / CELL, AH = H / CELL, NC = AW * AH;
const hum = new Float32Array(NC), cloud = new Float32Array(NC), u = new Float32Array(NC), v = new Float32Array(NC);
const open = new Float32Array(NC);    // share of each cell that is open sky; 0 underground or inside rock
const cellT = new Float32Array(NC);   // air temperature at each cell's centre
const nh = new Float32Array(NC), nc = new Float32Array(NC);   // scratch for moving the air
const colShade = new Float32Array(AW), blurShade = new Float32Array(AW);
const AIR_EVERY = 8;                  // ticks between air updates
const SAT_BASE = 60, SAT_DOUBLING = 11, CONDENSE = 0.3, REEVAPORATE = 0.08;
// A flake is a quarter tile of snow; a full tile of snow melts into 64 units of water, so a flake costs its cloud 16.
const RAIN_AT = 160, DROP = 32, FLAKE = 64, SNOW_COST = 16, MAX_DROPS = 3;
const RAIN_CONTENTS = new Float64Array(NSOL);   // fresh water; its reference oxygen is an explicit atmosphere input
// Hail: a storm cloud that's above freezing but cold aloft (under HAIL_COLD) throws some of its drops as hail pellets,
// small grains of snow (HAIL, so a quarter of that in water) that melt where they land.
const HAIL = 32, HAIL_COLD = 8, HAIL_SHARE = 0.3;
const STORM_AT = 420, STORM_COLUMN = 1000, STRIKE_CHANCE = 0.01, STRIKE_HEAT = 900, STORM_WARM = 5;
const CONVERGE = 3, DIVERGE = 0.02, GATHER_MAX = 0.5;
const AIR_MOVE = 0.25, WIND_CHANGE = [7200, 18000];
const bolts = [];     // lightning being drawn: { x, y0, y1, life } in pixels
const strikes = [];   // tiles struck in the last few ticks; they power the networks they belong to: { k, ticks }

// How much vapour a whole cell of air holds at temperature t before it condenses.
function sat(t) { return SAT_BASE * Math.pow(2, Math.max(-30, Math.min(45, t)) / SAT_DOUBLING); }
function cellOf(x, y) { return ((y / CELL) | 0) * AW + ((x / CELL) | 0); }
function windAt(x, y) { return u[cellOf(x, y)]; }
// How hard it is raining over column x, 0–1.
function rainAt(x) {
  let r = 0;
  for (let cy = 0, c = (x / CELL) | 0; cy < AH; cy++, c += AW) if (cloud[c] > RAIN_AT) r = Math.max(r, Math.min(1, (cloud[c] - RAIN_AT) / 200));
  return r;
}
function resetAir() {
  hum.fill(0); cloud.fill(0); u.fill(0); v.fill(0); bolts.length = 0; strikes.length = 0;
  S.wind = 0; S.windTarget = 0; S.windTimer = 0; S.rain = 0;
}

function airTick() {
  for (const s of strikes) s.ticks--;
  while (strikes.length && strikes[0].ticks <= 0) strikes.shift();
  if (!S.weather) { S.rain = 0; shade.fill(0); return; }
  if (!(S.tick & 1)) drift();   // gases move with the wind every other tick, so a plume bends as fast as it spreads
  if (S.tick % AIR_EVERY) return;
  measure();
  blow();
  moveAir();
  condense();
  precipitate();
  surfaces();
}
// Which cells are open sky, how warm each is, how much cloud each column has overhead, and how widespread rain is.
function measure() {
  open.fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!under[k] && !solid[k]) open[cellOf(x, y)] += 1 / (CELL * CELL);
  }
  let raining = 0;
  for (let cx = 0; cx < AW; cx++) {
    let col = 0;
    for (let cy = 0; cy < AH; cy++) {
      const c = cy * AW + cx;
      cellT[c] = skyTempAt(cx * CELL + 2, cy * CELL + 2);
      col += cloud[c];
    }
    colShade[cx] = Math.min(1, col / 500);
    if (rainAt(cx * CELL) > 0) raining++;
  }
  // shade blends smoothly across columns (blurred over a few cells, then interpolated tile by tile), so the light under
  // clouds has no stripes
  for (let cx = 0; cx < AW; cx++) {
    let s = 0;
    for (let d = -2; d <= 2; d++) s += colShade[(cx + d + AW) % AW] * (3 - Math.abs(d));
    blurShade[cx] = s / 9;
  }
  for (let x = 0; x < W; x++) {
    const g = x / CELL - 0.5, i = Math.floor(g), f = g - i;
    shade[x] = blurShade[(i + AW) % AW] * (1 - f) + blurShade[(i + 1) % AW] * f;
  }
  S.rain = raining / AW;
}
// The wind: a prevailing wind that shifts every few minutes, weaker near the ground, turned upward where it meets a
// slope, and lifted over ground the sun has warmed.
function blow() {
  if (--S.windTimer <= 0) { S.windTarget = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7); S.windTimer = (WIND_CHANGE[0] + Math.random() * (WIND_CHANGE[1] - WIND_CHANGE[0])) / AIR_EVERY; }
  S.wind += (S.windTarget - S.wind) * 0.01;
  const sun = Math.max(0, sunHeight());
  for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
    const c = cy * AW + cx;
    if (!open[c]) { u[c] = 0; v[c] = 0; continue; }
    let ground = 0;
    for (let y = cy + 1; y < AH && open[y * AW + cx] > 0.3; y++) ground++;
    let ut = S.wind * colWind[cx * CELL] * Math.min(1, 0.35 + 0.2 * ground), vt = 0;
    const down = cy * AW + (cx + (ut > 0 ? 1 : AW - 1)) % AW;
    if (open[down] < 0.4) vt -= Math.abs(ut) * 0.8;   // pushed up a slope
    if (ground === 0) vt -= 0.06 * sun;               // updraft over sunlit ground
    u[c] += (ut - u[c]) * 0.2; v[c] += (vt - v[c]) * 0.3;
  }
}
// Moves vapour and cloud with the wind: a share of each cell passes to its downwind neighbours, if they are open sky.
// Sideways the world wraps around, so nothing blows off its edge.
function moveAir() {
  nh.set(hum); nc.set(cloud);
  for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
    const c = cy * AW + cx;
    if (!open[c]) continue;
    const fx = Math.min(0.5, Math.abs(u[c]) * AIR_MOVE), tx = cy * AW + (cx + (u[c] > 0 ? 1 : AW - 1)) % AW;
    if (fx > 0 && open[tx]) { const h = hum[c] * fx, k = cloud[c] * fx; nh[c] -= h; nh[tx] += h; nc[c] -= k; nc[tx] += k; }
    const fy = Math.min(0.5, Math.abs(v[c]) * AIR_MOVE), ny = cy + (v[c] > 0 ? 1 : -1);
    if (fy > 0 && ny >= 0 && ny < AH && open[ny * AW + cx]) { const t = ny * AW + cx, h = hum[c] * fy, k = cloud[c] * fy; nh[c] -= h; nh[t] += h; nc[c] -= k; nc[t] += k; }
  }
  hum.set(nh); cloud.set(nc);
}
// Vapour over what the air can hold condenses into cloud; cloud in air with room to spare evaporates back.
function condense() {
  for (let c = 0; c < NC; c++) {
    if (!open[c]) continue;
    const s = sat(cellT[c]) * open[c];
    if (hum[c] > s) { const d = (hum[c] - s) * CONDENSE; hum[c] -= d; cloud[c] += d; }
    else if (cloud[c] > 0) { const d = Math.min(cloud[c], (s - hum[c]) * REEVAPORATE); cloud[c] -= d; hum[c] += d; }
  }
}
// Heavy clouds rain (or snow, below 0°) from their underside; storm clouds throw lightning if the ground under them is
// warm enough to drive the rising air a thunderstorm needs.
function precipitate() {
  for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
    const c = cy * AW + cx;
    if (cloud[c] <= RAIN_AT) continue;
    let n = Math.min(MAX_DROPS, Math.floor((cloud[c] - RAIN_AT) / DROP * 0.5 + Math.random()));
    for (; n > 0; n--) {
      const x = cx * CELL + ((Math.random() * CELL) | 0), y = cy * CELL + CELL - 1, k = y * W + x;
      if (solid[k] || under[k]) continue;
      if (cellT[c] < 0) {
        if (liq[k]) continue;
        solid[k] = SNOW; held[k] = FLAKE; temp[k] = Math.min(0, cellT[c]); markDirty(x, y); cloud[c] -= SNOW_COST;   // it settles onto the snow below
      } else if (cloud[c] > STORM_AT && cellT[c] < HAIL_COLD && !liq[k] && Math.random() < HAIL_SHARE) {
        solid[k] = SNOW; held[k] = HAIL; temp[k] = Math.min(0, cellT[c]); markDirty(x, y); cloud[c] -= HAIL / 4;
        hailStrikes(x, y);
      } else {
        if (liq[k] && (typ[k] !== WATER || liq[k] > 255 - DROP)) continue;
        const added = rainInto(k, DROP, Math.max(2, cellT[c]));
        cloud[c] -= added;
      }
    }
    if (cloud[c] > STORM_AT && Math.random() < STRIKE_CHANCE) {
      let col = 0;
      for (let y = 0; y < AH; y++) col += cloud[y * AW + cx];
      if (col > STORM_COLUMN && cellT[lowCell(cx)] > STORM_WARM) strike(cx, cy);
    }
  }
}
// Rain adds a fresh-water vector, diluting rather than duplicating existing salts, sugar and other ingredients.
// The weather grid tracks carrier water only; its initial dissolved oxygen is a named atmospheric source.
function rainInto(k, requested, temperature) {
  if (solid[k] || (liq[k] && typ[k] !== WATER)) return 0;
  const had = liq[k], added = Math.max(0, Math.min(Math.floor(requested), 255 - had));
  if (!added) return 0;
  const receivingCapacity = LCAP[WATER] * had / 255 + dissolvedHeatCapacity(had, sol, k * NSOL);
  const rainCapacity = LCAP[WATER] * added / 255;
  temp[k] = (temp[k] * receivingCapacity + temperature * rainCapacity) / (receivingCapacity + rainCapacity);
  mixSol(sol, k * NSOL, had, RAIN_CONTENTS, 0, added);
  if (!had) { drop[k] = 0; vel[k] = 0; }
  liq[k] += added; typ[k] = WATER; wake(k); heatWake(k);
  S.accounting.rainOxygenMg = (S.accounting.rainOxygenMg || 0) + OXYGEN_REFERENCE * added / 255;
  S.accounting.rainSensibleHeat = (S.accounting.rainSensibleHeat || 0) + rainCapacity * temperature;
  return added;
}
// A hailstone falling down column x from row y knocks a leaf off the first thing it reaches, and stings the explorer
// if it's standing in the open below.
function hailStrikes(x, y) {
  let yy = y + 1;
  while (yy < H && (!solid[yy * W + x] || solid[yy * W + x] === SNOW)) yy++;   // past falling rain and hail to what it lands on
  if (yy < H && solid[yy * W + x] === LEAF && Math.random() < 0.3) { solid[yy * W + x] = 0; markDirty(x, yy); }
  for (const b of bodies) if (b.kind === 'explorer' && !b.ward && b.x <= x * T + 7 && b.x + b.w >= x * T && b.y >= y * T && b.y < yy * T && !b.ouch) { hurt(b, 1); b.ouch = 20; }
}
// Lightning from cell (cx, cy) down to the first thing below it: it heats the tile hard (lighting wood, setting off
// nitro), powers the network it's part of for a moment, and stuns the explorer if it's close.
function strike(cx, cy) {
  const x = cx * CELL + ((Math.random() * CELL) | 0);
  let y = cy * CELL + CELL;
  while (y < H - 1 && !solid[y * W + x] && !liq[y * W + x] && !under[y * W + x]) y++;
  const k = y * W + x;
  temp[k] = Math.min(1400, temp[k] + STRIKE_HEAT);
  if (y > 0) temp[k - W] = Math.min(1400, temp[k - W] + STRIKE_HEAT / 2);
  wake(k); heatWake(k);
  strikes.push({ k, ticks: 12 });
  bolts.push({ x: x * T + 4, y0: cy * CELL * T, y1: y * T, life: 10, seed: Math.random() * 1000 });
  S.flash = 6;
  puff(k, 'zap'); puff(k, 'spark');
  sfx('boom', x * T + 4, y * T);
  for (const b of bodies) if (b.kind === 'explorer' && !b.ward && Math.abs(b.x + b.w / 2 - x * T - 4) < 16 && Math.abs(b.y + b.h - y * T) < 24) { b.ouch = 40; b.vy = -3; }
}
// The ground surface of each column: water there evaporates (a thin puddle fast, a lake slowly), steam rising into
// the open joins the air, and the wind ruffles open water.
function surfaces() {
  const sun = Math.max(0, sunHeight());
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H && !solid[y * W + x] && !liq[y * W + x]) y++;
    if (y >= H || solid[y * W + x]) continue;
    const k = y * W + x;
    if (under[k]) continue;
    const c = cellOf(x, Math.max(0, y - 1));
    if (typ[k] === STEAM) {
      const before = liq[k], m = Math.min(before, 48);
      // This path reaches the open atmosphere, rather than a sealed vessel. Preserve a named component-outflow
      // record when weather vapor cannot represent the steam's carried ethanol or other dissolved ingredients.
      const escaped = S.accounting.openSteamComponents || (S.accounting.openSteamComponents = Array(NSOL).fill(0));
      for (let i = 0; i < NSOL; i++) escaped[i] += soluteAmount(k, i) * m / before;
      const energy = latent[k] * m / before;
      S.accounting.weatherVapourLatent = (S.accounting.weatherVapourLatent || 0) + energy;
      latent[k] -= energy;
      liq[k] -= m; if (!liq[k]) { typ[k] = 0; clearSol(k); }
      hum[c] += m; wake(k);
      continue;
    }
    if (typ[k] !== WATER) continue;
    const warmth = Math.max(0, Math.min(1.6, (temp[k] + 5) / 35));
    const dry = Math.max(0.3, Math.min(1.6, 1.6 - 0.6 * colHum[x]));   // drier air takes up water faster
    const rate = (0.1 + 0.5 * sun * (1 - shade[x])) * warmth * dry * (1 + Math.abs(u[c])) * (drought[x] ? 2 : 1) * (liq[k] < 64 ? 3 : 1);
    const m = Math.min(liq[k], Math.floor(rate + Math.random()));
    if (m) {
      evaporateSurface(k, m);
    }
    if (S.momentum && Math.abs(u[c]) > 0.1) vel[k] = Math.max(-1, Math.min(1, vel[k] + u[c] * 0.03 * colWind[x]));
  }
  converge();
}
// Evaporation keeps all nonvolatile components in the remaining liquid. A final plain-water unit may dry only after
// its O2 and CO2 have somewhere to go. Mixed residues retain a carrier unit until a precipitation process can place
// every constituent; choosing just the largest ingredient would destroy the rest.
function evaporateSurface(k, requested) {
  if (!liq[k] || typ[k] !== WATER) return 0;
  const before = liq[k], energyBefore = latent[k], p = k * NSOL;
  let removed = removeCarrier(k, requested);
  if (requested > removed && liq[k] === 1) {
    let residue = false;
    for (let i = 0; i < NSOL; i++) if (i !== SOL_O2 && i !== SOL_CO2 && sol[p + i] > 0) { residue = true; break; }
    const up = k - W, outside = up < 0;
    if (!residue && (outside || (!solid[up] && !liq[up]))) {
      const oxygen = soluteAmount(k, SOL_O2) * MG_PER_UNIT, carbon = soluteAmount(k, SOL_CO2) * MG_PER_UNIT;
      const oxUnits = oxygen / AIR_O2_MG_PER_UNIT, carbUnits = carbon / AIR_CO2_EQ_MG_PER_UNIT;
      if (outside || (airOx[up] + oxUnits <= MAX_AIR_OX && airCarb[up] + carbUnits <= MAX_AIR_CARB)) {
        if (outside) recordAtmosphere(-oxygen, -carbon);
        else { airOx[up] += oxUnits; airCarb[up] += carbUnits; stir(up); }
        liq[k] = 0; typ[k] = 0; clearSol(k); removed++;
      }
    }
  }
  if (removed) {
    const energy = energyBefore * removed / before;
    latent[k] -= energy;
    S.accounting.weatherVapourLatent = (S.accounting.weatherVapourLatent || 0) + energy;
    // The coarse weather grid has no temperature inventory. Record carrier sensible heat at this boundary;
    // retained salt and sugar keep all of their heat capacity at the unchanged liquid temperature.
    S.accounting.weatherVapourSensibleHeat = (S.accounting.weatherVapourSensibleHeat || 0) + LCAP[WATER] * removed / 255 * temp[k];
    vapour(k, removed); wake(k);
  }
  return removed;
}
// The lowest open cell of air in column cx, just above the ground.
function lowCell(cx) {
  let cy = 0;
  while (cy < AH - 1 && open[(cy + 1) * AW + cx] > 0.3) cy++;
  return cy * AW + cx;
}
// Takes up to `want` vapour from all the open air, the same share from every cell (at most GATHER_MAX of it), and
// returns how much it took.
function gather(want) {
  let total = 0;
  for (let c = 0; c < NC; c++) if (open[c]) total += hum[c];
  if (total <= 0 || want <= 0) return 0;
  const f = Math.min(GATHER_MAX, want / total);
  let got = 0;
  for (let c = 0; c < NC; c++) if (open[c]) { const t = hum[c] * f; hum[c] -= t; got += t; }
  return got;
}
// Spreads vapour evenly over all the open air.
function scatter(m) {
  let n = 0;
  for (let c = 0; c < NC; c++) if (open[c]) n++;
  if (n) for (let c = 0; c < NC; c++) if (open[c]) hum[c] += m / n;
}
// Humid biomes draw moist air in near the ground from the rest of the world, and dry ones send theirs away (grassland,
// at 1, does neither), the way moist air gathers over real jungles. The vapour only moves: what the dry columns give
// up goes first to the humid ones, they take the rest from all the air, and anything left over spreads back out.
function converge() {
  let pool = 0, want = 0;
  for (let cx = 0; cx < AW; cx++) {
    const m = colHum[cx * CELL] - 1;
    if (m < 0) { const c = lowCell(cx), out = hum[c] * -m * DIVERGE; hum[c] -= out; pool += out; }
    else if (m > 0) want += m * CONVERGE;
  }
  if (want > pool) pool += gather(want - pool);
  const give = Math.min(pool, want);
  if (give > 0) for (let cx = 0; cx < AW; cx++) {
    const m = colHum[cx * CELL] - 1;
    if (m > 0) hum[lowCell(cx)] += give * m * CONVERGE / want;
  }
  if (pool > give) scatter(pool - give);
}
// Adds vapour from tile k (drying ground, a plant breathing out) to the air just above it.
function vapour(k, m) { if (m > 0) hum[cellOf(k % W, Math.max(0, ((k / W) | 0) - 1))] += m; }
// Smoke, methane, poison gas, hydrogen and oxygen in the open drift with the wind (each puff at most one tile per call).
const drifted = new Uint32Array(W * H);
function drift() {
  for (let k = 0; k < W * H; k++) {
    const t = typ[k];
    if (!liq[k] || drifted[k] === S.tick || (t !== SMOKE && t !== METHANE && t !== POISON && t !== CHLORINE && t !== HYDROGEN && t !== OXYGEN) || under[k]) continue;
    const x = k % W, w = u[cellOf(x, (k / W) | 0)], nx = x + (w > 0 ? 1 : -1);
    if (Math.abs(w) < 0.05 || nx < 0 || nx >= W) continue;
    const n = k + (w > 0 ? 1 : -1);
    if (solid[n] || (liq[n] && typ[n] !== t)) continue;
    const m = Math.min(liq[k], 255 - liq[n], Math.ceil(liq[k] * Math.min(1, Math.abs(w))));   // about a tile per update at full wind, like the clouds
    if (m <= 0) continue;
    carryHeat(k, n, m, liq[n]);
    liq[n] += m; typ[n] = t; liq[k] -= m; if (!liq[k]) { typ[k] = 0; clearSol(k); }
    drifted[n] = S.tick; wake(n);
  }
}
// "Rain now": gathers vapour from all the air into a bank of cloud over the view, which soon rains out. In dry air
// there is little to gather, so little rain.
function seedRain(amount = 500) {
  measure();
  const cx0 = Math.max(0, ((VIEW.tx0 / CELL) | 0) - 2), cx1 = Math.min(AW - 1, ((VIEW.tx1 / CELL) | 0) + 2), cells = [];
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = 1; cy < AH; cy++) {
    const c = cy * AW + cx;
    if (open[c] < 0.9) continue;
    cells.push(c);
    break;
  }
  const got = gather(amount * cells.length);
  for (const c of cells) cloud[c] += got / cells.length;
  return got;
}
// All the water in the air, for checks that water is conserved.
function airWater() { let s = 0; for (let c = 0; c < NC; c++) s += hum[c] + cloud[c]; return s; }

export { rainInto, evaporateSurface, HAIL, HAIL_COLD, HAIL_SHARE, hailStrikes, FLAKE, drifted, CELL, AW, AH, NC, hum, cloud, u, v, open, cellT, AIR_EVERY, SAT_BASE, SAT_DOUBLING, RAIN_AT, DROP, SNOW_COST, STORM_AT, STORM_COLUMN, STORM_WARM, CONVERGE, DIVERGE, GATHER_MAX, lowCell, gather, scatter, converge, vapour, bolts, strikes, sat, cellOf, windAt, rainAt, resetAir, airTick, measure, blow, moveAir, condense, precipitate, strike, surfaces, drift, seedRain, airWater };
