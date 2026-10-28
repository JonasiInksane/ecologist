// Plants: a seed on dirt grows into a stem of plant blocks, drinking water from around its root (tonic counts four
// times over) and putting out leaves. Without water it wilts from the top down and dies; it doesn't grow while its
// root is frozen. The water a plant drinks it breathes out into the air above it. Plants burn, and acid eats them. What wilts rots into a little fertiliser that drips down.
// A grown plant that's drinking regrows the leaves it loses (moths eat them) and now and then drops a seed on open
// soil a few tiles away, if no other plant stands too close, so plants spread where there's water for them.
import { DIRT, H, LEAF, MOSS, MUD, PLANT, TONIC, W, WATER } from './config.js';
import { liq, markDirty, solid, temp, typ, wake } from './world.js';
import { NSOL, SOL_FERT } from './config.js';
import { sol } from './world.js';
import { FERT } from './config.js';
import { vapour } from './air.js';

const plants = [];   // { root, top, h, max, drunk, thirst }
const REACH = 3, SIP = 8, GROW_AT = 6, WILT_AT = 160, MAX_HEIGHT = [5, 10];
const SOIL = new Set([DIRT, MOSS]);
const SEED_CHANCE = 0.004, LEAF_CHANCE = 0.02, SEED_REACH = 6, SPACING = 2, MAX_PLANTS = 200;   // chances per plant tick

// Plants a seed in empty tile k if it sits on soil. Returns whether it took.
function plantSeed(k) {
  if (k < 0 || k >= W * H - W || solid[k] || liq[k] || !SOIL.has(solid[k + W])) return false;
  solid[k] = PLANT; markDirty(k % W, (k / W) | 0);
  plants.push({ root: k, top: k, h: 1, max: MAX_HEIGHT[0] + ((Math.random() * (MAX_HEIGHT[1] - MAX_HEIGHT[0])) | 0), drunk: 0, thirst: 0 });
  return true;
}
// Takes a sip from the nearest water (or tonic, or wet mud) around the root. Returns how much growth it gives.
function drink(root) {
  const x = root % W, y = (root / W) | 0;
  for (let r = 1; r <= REACH; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx, t = typ[k];
    if (!liq[k] || (t !== WATER && t !== TONIC && t !== MUD)) continue;
    const fed = t === WATER && sol[k * NSOL + SOL_FERT] >= 30;
    if (fed) sol[k * NSOL + SOL_FERT] -= 5;
    const sip = Math.min(liq[k], SIP);
    liq[k] -= sip; if (!liq[k]) typ[k] = 0;
    vapour(root, sip);   // breathed out
    wake(k);
    return t === TONIC ? 4 : fed ? 3 : 1;   // tonic and fertilised water make plants grow faster
  }
  return 0;
}
function plantTick() {
  for (let i = plants.length - 1; i >= 0; i--) {
    const p = plants[i];
    if (solid[p.root] !== PLANT) { plants.splice(i, 1); continue; }   // burnt, eaten or dug up
    while (p.top !== p.root && solid[p.top] !== PLANT && solid[p.top] !== LEAF) { p.top += W; p.h--; }   // lost its top
    if (temp[p.root] < 0) continue;
    const g = drink(p.root);
    if (!g) {
      if (++p.thirst < WILT_AT) continue;
      p.thirst = WILT_AT * 0.8;   // wilts one tile at a time
      solid[p.top] = 0; markDirty(p.top % W, (p.top / W) | 0);
      liq[p.top] = 24; typ[p.top] = FERT; sol.fill(0, p.top * NSOL, p.top * NSOL + NSOL); wake(p.top);   // rots
      if (p.top === p.root) { plants.splice(i, 1); continue; }
      p.top += W; p.h--;
      continue;
    }
    p.thirst = 0;
    if (p.h >= p.max) {   // grown: regrow a leaf, or drop a seed
      if (Math.random() < LEAF_CHANCE) regrowLeaf(p);
      if (Math.random() < SEED_CHANCE && plants.length < MAX_PLANTS) dropSeed(p);
      continue;
    }
    if ((p.drunk += g) < GROW_AT) continue;
    p.drunk = 0;
    const up = p.top - W;
    if (up < 0 || solid[up] || liq[up]) continue;
    solid[up] = PLANT; p.top = up; p.h++;
    markDirty(up % W, (up / W) | 0);
    if (p.h >= 3 && Math.random() < 0.5) {   // a leaf to one side
      const dx = Math.random() < 0.5 ? -1 : 1, sx = up % W + dx, side = up + dx;
      if (sx >= 0 && sx < W && !solid[side] && !liq[side]) { solid[side] = LEAF; markDirty(side % W, (side / W) | 0); }
    }
  }
}

// A leaf beside a random stem tile at least three tiles up, if there's room.
function regrowLeaf(p) {
  const up = (Math.min(p.h, 3) - 1 + ((Math.random() * Math.max(1, p.h - 2)) | 0)) * W, k = p.root - up;
  if (k < 0 || solid[k] !== PLANT) return;
  const dx = Math.random() < 0.5 ? -1 : 1, sx = k % W + dx, side = k + dx;
  if (sx >= 0 && sx < W && !solid[side] && !liq[side]) { solid[side] = LEAF; markDirty(sx, (side / W) | 0); }
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
    plantSeed(k);
    return;
  }
}

export { SEED_CHANCE, LEAF_CHANCE, SEED_REACH, SPACING, MAX_PLANTS, regrowLeaf, dropSeed, plants, REACH, SIP, GROW_AT, WILT_AT, MAX_HEIGHT, SOIL, plantSeed, drink, plantTick };
