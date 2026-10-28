// The explorer's tools: a bucket that holds one tile of liquid, and a pickaxe that digs blocks into a bag and places
// them again. Keys: Enter scoops or pours; D digs while held, or places the chosen block where there's nothing to dig;
// Shift+D chooses the next block in the bag. Holding Down aims below the explorer instead of in front.
import { sfx } from './audio.js';
import { keys } from './bodies.js';
import { AIR, BASALT, BRICK, CLAY, COMB, CRISP, CRYSTAL, DIRT, GLASS, H, ICE, MOSS, NBLOCK, NSOL, OBSIDIAN, PERMAFROST, SALT, SAND, SNOW, STONE, T, W, WATER, WOOD } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { S, bodies, devices, held, liq, markDirty, meltAmount, sol, solid, temp, typ, wake } from './world.js';
import { GEM, SODA } from './config.js';
import { BLEACHED, COPPER, CORAL, FUSE, MAGNET, POROUS, SPONGE, WETDIRT, WOOL } from './config.js';
import { ALUMINIUM, ASH, CHARCOAL, FNITRO, GOLD, LIME, LIMESTONE, ORE, PATINA, QUICKLIME, RUST, SLAG, SUGAR, ZINC } from './config.js';
import { POWDER, SLIDE_AT } from './powders.js';

const BAG_SLOTS = 8, STACK = 99;
// Ticks of digging each block takes; 0 means the pickaxe can't break it (machines, plants, metal).
const DIG_TICKS = new Uint8Array(NBLOCK);
DIG_TICKS[SNOW] = 4; DIG_TICKS[SAND] = 6; DIG_TICKS[DIRT] = 8; DIG_TICKS[MOSS] = 10; DIG_TICKS[CLAY] = 10; DIG_TICKS[COMB] = 10;
DIG_TICKS[CRISP] = 12; DIG_TICKS[SALT] = 12; DIG_TICKS[ICE] = 14; DIG_TICKS[WOOD] = 16; DIG_TICKS[GLASS] = 20; DIG_TICKS[PERMAFROST] = 24;
DIG_TICKS[STONE] = 28; DIG_TICKS[BRICK] = 30; DIG_TICKS[BASALT] = 34; DIG_TICKS[CRYSTAL] = 40; DIG_TICKS[OBSIDIAN] = 80; DIG_TICKS[SODA] = 6; DIG_TICKS[GEM] = 30;
DIG_TICKS[SPONGE] = 6; DIG_TICKS[WOOL] = 6; DIG_TICKS[FUSE] = 3; DIG_TICKS[WETDIRT] = 8; DIG_TICKS[CORAL] = 14; DIG_TICKS[BLEACHED] = 10;
DIG_TICKS[POROUS] = 20; DIG_TICKS[COPPER] = 40; DIG_TICKS[MAGNET] = 50; DIG_TICKS[ORE] = 32; DIG_TICKS[SLAG] = 14; DIG_TICKS[SUGAR] = 5; DIG_TICKS[RUST] = 8; DIG_TICKS[FNITRO] = 12;
DIG_TICKS[LIMESTONE] = 30; DIG_TICKS[QUICKLIME] = 8; DIG_TICKS[LIME] = 12; DIG_TICKS[CHARCOAL] = 8; DIG_TICKS[ASH] = 4; DIG_TICKS[ALUMINIUM] = 30; DIG_TICKS[ZINC] = 34; DIG_TICKS[GOLD] = 30; DIG_TICKS[PATINA] = 40;   // a wet sponge isn't dug: its water would be lost

function findExplorer() { return bodies.find(b => b.kind === 'explorer'); }
// Puzzles switch the tools off unless they list them.
function toolAllowed(name) { return !S.level || S.level.tools.includes(name); }
function bagOf(b) { return b.inv || (b.inv = { bucket: null, bag: [], pick: 0 }); }

function tileAt(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; }
// Tiles the explorer can reach, in the order they're tried: in front (feet, then head, then the one below that),
// or, holding Down, the one below the feet.
function reach(b) {
  const feet = Math.floor((b.y + b.h - 1) / T), head = feet - 1, cx = Math.floor((b.x + b.w / 2) / T);
  // the tile past the one the body's front edge is in (the body is narrower than a tile, so a pixel past the edge can
  // still be in its own tile)
  const fx = b.face > 0 ? Math.floor((b.x + b.w - 1) / T) + 1 : Math.floor(b.x / T) - 1;
  if (keys.ArrowDown) return [tileAt(cx, feet + 1), tileAt(cx, feet)];
  return [tileAt(fx, feet), tileAt(fx, head), tileAt(fx, feet + 1), tileAt(cx, feet)];
}
function firstOf(list, ok) { for (const k of list) if (k >= 0 && ok(k)) return k; return -1; }
function overlapsBody(k) {
  const x0 = (k % W) * T, y0 = ((k / W) | 0) * T;
  return bodies.some(o => o.x < x0 + T && o.x + o.w > x0 && o.y < y0 + T && o.y + o.h > y0);
}
const diggable = k => DIG_TICKS[solid[k]] > 0 && !devices.has(k);
const scoopable = k => !solid[k] && liq[k] > 0 && LIQ[typ[k]].grav > 0;   // not gases
const openFor = t => k => !solid[k] && !devices.has(k) && (!liq[k] || (typ[k] === t && liq[k] < 255));
const placeable = k => !solid[k] && !liq[k] && !devices.has(k) && !overlapsBody(k);

function addToBag(inv, block) {
  const slot = inv.bag.find(s => s.b === block);
  if (slot) { if (slot.n >= STACK) return false; slot.n++; return true; }
  if (inv.bag.length >= BAG_SLOTS) return false;
  inv.bag.push({ b: block, n: 1 });
  return true;
}
function breakBlock(inv, k) {
  const block = solid[k], x = k % W, y = (k / W) | 0;
  if (block === ICE) {   // ice shatters into the water it froze from
    solid[k] = AIR; liq[k] = meltAmount(k); typ[k] = WATER; sol.fill(0, k * NSOL, k * NSOL + NSOL);
  } else {
    const pinch = POWDER[block] && held[k] && held[k] < SLIDE_AT;   // a thin layer of powder is swept away, not bagged
    if (!pinch && !addToBag(inv, block)) return false;
    solid[k] = AIR; held[k] = 0;
  }
  markDirty(x, y); wake(k);
  puff(k, 'smoke'); sfx('click', x * T + 4, y * T + 4);
  return true;
}
function scoopBucket(inv, k) {
  inv.bucket = { t: typ[k], a: liq[k], temp: temp[k], sol: Array.from(sol.subarray(k * NSOL, k * NSOL + NSOL)) };
  liq[k] = 0; typ[k] = 0; sol.fill(0, k * NSOL, k * NSOL + NSOL); wake(k);
  sfx('splash', (k % W) * T + 4, ((k / W) | 0) * T + 4);
}
// Pours what fits into tile k, mixing heat and dissolved contents by amount; the rest stays in the bucket.
function pourBucket(inv, k) {
  const bk = inv.bucket, had = liq[k], put = Math.min(bk.a, 255 - had);
  if (put <= 0) return;
  const f = put / (had + put);
  temp[k] = had ? temp[k] + (bk.temp - temp[k]) * f : bk.temp;
  for (let i = 0; i < NSOL; i++) sol[k * NSOL + i] = had ? Math.round(sol[k * NSOL + i] + (bk.sol[i] - sol[k * NSOL + i]) * f) : bk.sol[i];
  liq[k] = had + put; typ[k] = bk.t; wake(k);
  bk.a -= put;
  if (!bk.a) inv.bucket = null;
  sfx('splash', (k % W) * T + 4, ((k / W) | 0) * T + 4);
}

// Called every tick for the explorer, from js/bodies.js.
function explorerTools(b) {
  const inv = bagOf(b);
  const enter = !!keys.Enter, dig = !!keys.d, cycle = !!keys.D;
  // the bucket: Enter scoops when empty and pours when full
  if (enter && !b.enterHeld && toolAllowed('bucket')) {
    const list = reach(b);
    if (!inv.bucket) { const k = firstOf(list, scoopable); if (k >= 0) scoopBucket(inv, k); }
    else { const k = firstOf(list, openFor(inv.bucket.t)); if (k >= 0) pourBucket(inv, k); }
  }
  // the pickaxe: hold D to dig; a fresh press with nothing to dig places the chosen block
  if (dig && toolAllowed('pickaxe')) {
    const k = firstOf(reach(b), diggable);
    if (k >= 0) {
      if (!b.mining || b.mining.k !== k) b.mining = { k, done: 0, need: DIG_TICKS[solid[k]] };
      if (++b.mining.done >= b.mining.need) { breakBlock(inv, k); b.mining = null; }
    } else {
      b.mining = null;
      const slot = inv.bag[inv.pick];
      if (!b.digHeld && slot) {
        const p = firstOf(reach(b), placeable);
        if (p >= 0) {
          solid[p] = slot.b; held[p] = 0; markDirty(p % W, (p / W) | 0);
          if (--slot.n <= 0) { inv.bag.splice(inv.pick, 1); inv.pick = Math.min(inv.pick, Math.max(0, inv.bag.length - 1)); }
          sfx('click', (p % W) * T + 4, ((p / W) | 0) * T + 4);
        }
      }
    }
  } else b.mining = null;
  if (cycle && !b.cycleHeld && inv.bag.length) inv.pick = (inv.pick + 1) % inv.bag.length;
  b.enterHeld = enter; b.digHeld = dig; b.cycleHeld = cycle;
}

export { BAG_SLOTS, STACK, DIG_TICKS, findExplorer, toolAllowed, bagOf, tileAt, reach, firstOf, overlapsBody, diggable, scoopable, openFor, placeable, addToBag, breakBlock, scoopBucket, pourBucket, explorerTools };
