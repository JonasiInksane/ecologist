// Builds a new world: biomes and their ground (js/biomes.js), caves, liquid pockets, the underground layers, the pump
// demo where the explorer starts, and the floaters and creatures.
import { resetAir, drifted } from './air.js';
import { features, groundBlock, planBiomes, resetBiomes, shapeColumns, underground } from './biomes.js';
import { addBody } from './bodies.js';
import { ambient, rebuildAmbient, resetClimate, surface } from './climate.js';
import { AETHER, AIR, AMBIENT, BLOOM, FROST, H, HONEY, LEAF, LEVER, OIL, PLANT, PUMP_IN, PUMP_OUT, QUICK, SAND, SLIME, STONE, T, W, WATER, WOOD } from './config.js';
import { placeDevice } from './devices.js';
import { LIQ } from './liquids.js';
import { parts } from './particles.js';
import { plantSeed, plants } from './plants.js';
import { step } from './sim.js';
import { vnoise, seededRandom } from './util.js';
import { pipeShow, pipeTick } from './pipes.js';
import { moved } from './momentum.js';
import { restorePristine } from './snapshot.js';
import { S, afloat, bodies, deco, devices, drop, fire, flux, held, liq, pumps, sol, solid, stamp, temp, typ, under, vel, wakeAll } from './world.js';
import { resetPressure } from './pressure.js';












// Empties the world: no blocks, liquid, machines, bodies or plants, ambient temperature, plain grassland climate, still
// air, and the clock at zero.
function resetWorld() {
  solid.fill(0); liq.fill(0); typ.fill(0); drop.fill(0); vel.fill(0); stamp.fill(0); S.tick = 0; parts.length = 0;
  pumps.length = 0; bodies.length = 0; S.pendingIn = -1; temp.fill(AMBIENT); under.fill(0);
  devices.clear(); S.pendingLink = -1; fire.fill(0); deco.fill(0); sol.fill(0); held.fill(0); flux.fill(0); pipeTick.fill(0); pipeShow.fill(0); moved.fill(0); drifted.fill(0);   // tick stamps: the clock restarts
  plants.length = 0; afloat.fill(0); resetPressure();
  S.level = null; S.dirtyAll = true;
  S.rain = 0; S.wind = 0; S.windTarget = 0; S.windTimer = 0; S.flash = 0; S.shake = 0; S.slimeCount = 0;   // a new world starts with still, dry air
  resetClimate(); resetAir(); resetBiomes();
}
// Marks every tile below a column's ground surface as underground (cave). Trees and plants don't count as ground, so
// the sky shows under their leaves.
function markUnderground() {
  for (let x = 0; x < W; x++) {
    let y = 0;
    for (; y < H; y++) { const b = solid[y * W + x]; if (b && b !== WOOD && b !== LEAF && b !== PLANT) break; }
    surface[x] = y;
    for (let r = 0; r < H; r++) under[r * W + x] = r > y ? 1 : 0;
  }
}
// A world is built from its seed alone: generation, and the settling ticks inside it, draw from a random generator
// seeded by S.seed instead of Math.random, so the same seed always builds the same world (that's what sharing a seed relies on).
function generate() {
  const real = Math.random;
  Math.random = seededRandom(S.seed);
  // the player's settings survive a new world, but the world is built with the defaults so a seed builds the same everywhere
  const keep = { seed: S.seed, weather: S.weather, momentum: S.momentum, pressure: S.pressure, lastLiquid: S.lastLiquid, timeMode: S.timeMode, heldPhase: S.heldPhase };
  restorePristine();   // a blank slate: nothing from the previous world affects this one
  S.seed = keep.seed;
  try { buildWorld(); } finally { Math.random = real; Object.assign(S, keep); }
}
function buildWorld() {
  resetWorld();
  planBiomes();
  const surf = shapeColumns();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    under[k] = y > surf[x] ? 1 : 0;
    if (y < surf[x]) continue;
    const depth = y - surf[x];
    let b = groundBlock(x, y, depth);
    const n = vnoise(x / 9, y / 6, 50) * 0.65 + vnoise(x / 4, y / 3, 90) * 0.35;
    if (depth > 5 && n > (y > H * 0.62 ? 0.57 : 0.63) && !(b === SAND || (depth < 14 && groundBlock(x, surf[x] + 2, 2) === SAND))) b = AIR;   // caves, bigger deeper down; none just under sand, which would fall in
    if (y >= H - 2) b = STONE;
    solid[k] = b;
  }
  underground(surf);
  // fill(x, y) returns the liquid to place in a carved tile, or 0; a pocket of a rising liquid is lined above too
  const carve = (cx, cy, rx, ry, fill, rises = false) => {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H - 2) continue;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy >= 1) continue;
      const k = y * W + x, t = fill(x, y);
      solid[k] = AIR; liq[k] = 0; typ[k] = 0;
      if (t) { liq[k] = 255; typ[k] = t; temp[k] = LIQ[t].paintT; }
    }
    // line the pocket so caves next to it don't drain it on load
    for (let y = cy - ry - 2; y <= cy + ry + 2; y++) for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
      const k = y * W + x;
      if (d >= 1 && d < 1.6 && !solid[k] && !liq[k] && under[k] && (y >= cy - 1 || rises)) solid[k] = STONE;
    }
  };
  const lx = 64, ly = surf[lx] + 3;
  carve(lx, ly, 16, 8, (x, y) => y >= ly - 1 ? WATER : 0);                   // cave lake, under the start
  const hy = (H * 0.7) | 0;
  carve((W * 0.46) | 0, hy, 6, 4, (x, y) => y >= hy - 1 ? HONEY : 0);         // honey pocket
  const qy = (H * 0.8) | 0;
  carve((W * 0.3) | 0, qy, 6, 3, (x, y) => y < qy ? QUICK : WATER);          // quicksilver on top of water: it sinks
  const ay = (H * 0.72) | 0;
  carve((W * 0.88) | 0, ay, 7, 4, (x, y) => y >= ay ? AETHER : 0, true);    // aether on the floor: it rises
  const fy = (H * 0.55) | 0;
  carve(20, fy + 4, 4, 3, (x, y) => y >= fy + 4 ? FROST : 0);               // frost pocket
  const oy = (H * 0.6) | 0;
  carve((W * 0.16) | 0, oy, 5, 3, (x, y) => y >= oy ? OIL : 0);            // oil seep
  const sy = (H * 0.45) | 0;
  carve((W * 0.6) | 0, sy, 3, 2, (x, y) => y >= sy ? SLIME : 0);           // slime nest
  const gy = (H * 0.78) | 0;
  carve((W * 0.12) | 0, gy, 4, 2, (x, y) => y >= gy ? BLOOM : 0);          // bloomwater spring
  features(surf);
  markUnderground();
  rebuildAmbient();
  for (let i = 0; i < W * H; i++) if (under[i] && (!liq[i] || typ[i] === WATER)) temp[i] = ambient[i];   // the ground starts at its resting temperature
  // raised basin over the lake with a leak in its floor; a pump lifts lake water back into it
  const bx0 = lx - 14, bx1 = lx + 2;
  let minS = H;
  for (let x = bx0 - 1; x <= bx1 + 1; x++) minS = Math.min(minS, surf[x]);
  const by = Math.max(7, Math.min(13, minS - 6));
  for (let x = bx0; x <= bx1; x++) solid[by * W + x] = STONE;
  for (let y = by - 5; y <= by; y++) { solid[y * W + bx0] = STONE; solid[y * W + bx1] = STONE; }
  solid[by * W + lx - 2] = AIR;
  for (let y = by - 3; y < by; y++) for (let x = bx0 + 1; x < bx1; x++) { liq[y * W + x] = 255; typ[y * W + x] = WATER; }
  let iy = ly;
  while (iy < H - 1 && !solid[iy * W + lx + 6]) iy++;
  solid[iy * W + lx + 6] = PUMP_IN;
  solid[by * W + bx0 + 2] = PUMP_OUT;
  pumps.push({ in: iy * W + lx + 6, out: by * W + bx0 + 2, on: true, buf: 0, t: 0, active: 0, shown: 0 });
  S.dirtyAll = true;
  wakeAll();
  for (let i = 0; i < 40; i++) step();
  // floaters: crates bob on the lake, one weight sinks in it, another rests on the quicksilver
  addBody('crate', (lx + 4) * T, (ly - 6) * T);
  addBody('crate', (lx + 9) * T, (ly - 9) * T);
  addBody('weight', (lx + 1) * T, (ly - 4) * T);
  addBody('weight', ((W * 0.3) | 0) * T - 4, (qy - 1) * T);
  addBody('explorer', 14 * T, (surf[14] - 2) * T);
  for (let i = 0; i < 5; i++) addBody('fish', (lx - 10 + i * 4) * T, (ly + 3) * T);   // fish in the cave lake
  addBody('salamander', ((W * 0.4) | 0) * T, (H - 6) * T);   // and a salamander in the magma sea
  for (let x = 30; x < 90; x += 23 + ((x * 7) % 11)) plantSeed((surf[x] - 1) * W + x);   // plants on the start's meadow
  const lk = (surf[18] - 1) * W + 18;   // a lever beside the explorer switches the lake pump
  if (placeDevice(LEVER, lk)) { const lv = devices.get(lk); lv.on = true; lv.targets.push(pumps[0].in); }
}

export { resetWorld, markUnderground, generate, buildWorld };
