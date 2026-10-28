// Explosions: a nitro blast breaks the blocks around it, throws liquid and bodies outward, fills the hole with smoke,
// and heats everything in reach, which sets off nearby nitro, methane and fuel in a chain. Broken wood flies out as
// planks, which float.
import { sfx } from './audio.js';
import { BASALT, BRICK, COMB, CRISP, CRYSTAL, DIRT, GLASS, H, ICE, MOSS, NBLOCK, SALT, SAND, SMOKE, STONE, T, W, WOOD } from './config.js';
import { puff } from './particles.js';
import { addBody } from './bodies.js';
import { carryHeat } from './sim.js';
import { clearSol } from './solutes.js';
import { S, bodies, heatWake, liq, markDirty, solid, temp, typ, vel, wake } from './world.js';
import { GEM, SODA } from './config.js';
import { BLEACHED, CORAL, FUSE, POROUS, SPONGE, WETDIRT, WETSPONGE, WOOL } from './config.js';
import { HYDROGEN, METHANE, ORE, RUST, SLAG, SUGAR } from './config.js';

const BREAKS = new Uint8Array(NBLOCK);   // obsidian, metal and machines survive
[DIRT, STONE, COMB, CRISP, ICE, CRYSTAL, BASALT, WOOD, MOSS, SALT, SAND, GLASS, BRICK, SODA, GEM, SPONGE, WETSPONGE, WETDIRT, POROUS, WOOL, CORAL, BLEACHED, FUSE, ORE, SLAG, SUGAR, RUST].forEach(b => { BREAKS[b] = 1; });   // frozen nitro isn't broken: the blast's heat sets it off
const BLAST_HEAT = 700, MAX_RADIUS = 6;
// Offsets within MAX_RADIUS, furthest first, so outer liquid moves out of the way before inner liquid follows it.
const RING = [];
for (let dy = -MAX_RADIUS; dy <= MAX_RADIUS; dy++) for (let dx = -MAX_RADIUS; dx <= MAX_RADIUS; dx++) {
  const d = Math.hypot(dx, dy);
  if (d <= MAX_RADIUS) RING.push([dx, dy, d]);
}
RING.sort((a, b) => b[2] - a[2]);

// Blows up the nitro in tile k; a fuller tile makes a bigger blast.
function explode(k) {
  const x = k % W, y = (k / W) | 0, r = 2 + Math.round(liq[k] / 255 * (MAX_RADIUS - 2));
  liq[k] = 0; typ[k] = 0; clearSol(k);
  S.shake = Math.max(S.shake, r * 2);
  heatWake(k);   // the blast heats everything in reach (r is at most MAX_RADIUS, within the chunks around k)
  sfx('boom', x * T + 4, y * T + 4);
  for (const [dx, dy, d] of RING) {
    if (d > r) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const n = ny * W + nx, f = 1 - d / (r + 1);
    if (BREAKS[solid[n]] && Math.random() < f * 1.5) {
      if (solid[n] === WOOD && Math.random() < 0.5) addBody('plank', nx * T, ny * T + 2);   // thrown outward with the other bodies below
      solid[n] = 0; markDirty(nx, ny);
    }
    temp[n] = Math.min(1400, temp[n] + BLAST_HEAT * f);
    if (liq[n] && (typ[n] === METHANE || typ[n] === HYDROGEN)) temp[n] = Math.max(temp[n], 1000);   // the flame front runs on through any burnable gas it reaches
    if (liq[n] && d > 0) pushOut(n, nx, ny, dx, dy);
    else if (!liq[n] && !solid[n] && d <= r / 2) { liq[n] = Math.round(160 * f); typ[n] = SMOKE; clearSol(n); }
    wake(n);
  }
  for (const b of bodies) {
    const bx = (b.x + b.w / 2) / T - x - 0.5, by = (b.y + b.h / 2) / T - y - 0.5, d = Math.hypot(bx, by), reach = r * 1.8;
    if (d >= reach) continue;
    const f = 1 - d / reach, s = 7 * f / Math.max(0.5, d);
    b.vx += bx * s; b.vy += by * s - 2 * f;
    if (b.kind === 'explorer' && !b.ward) b.ouch = 40;
    else if (b.kind === 'crate') b.heat += 30 * f;
  }
  for (let i = 0; i < r; i++) puff(k, 'blast');
  puff(k, 'flame'); puff(k, 'ember'); puff(k, 'smoke');
}
// Moves liquid tile n one tile further from the blast, where there's room.
function pushOut(n, nx, ny, dx, dy) {
  const sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, sy = sx ? 0 : Math.sign(dy);
  const tx = nx + sx, ty = ny + sy;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
  const o = ty * W + tx;
  if (solid[o] || (liq[o] && typ[o] !== typ[n])) return;
  const mv = Math.min(liq[n], 255 - liq[o]);
  if (!mv) return;
  carryHeat(n, o, mv, liq[o]);
  liq[o] += mv; typ[o] = typ[n]; vel[o] = sx;
  liq[n] -= mv; if (!liq[n]) typ[n] = 0;
}

export { BREAKS, BLAST_HEAT, MAX_RADIUS, RING, explode, pushOut };
