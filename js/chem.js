// Chemistry as data: each reaction between a liquid (or what's dissolved in it) and a block, or of a block on its own
// when it's hot enough, is one rule below, from the real chemistry in CHEMISTRY.md. The engine (chemTick, every 4
// ticks) finds where each rule can happen and applies it: what's made, what's used up, and the heat given out (+) or
// taken in (−), in joules shared between the tiles that react. Reactions between two liquids are pairs in
// js/reactions.js (setR); the fantasy liquids keep their own code there for now.
//
// A rule touching a liquid names the kind of liquid it needs (`with`):
//   'acid'   strong acid, or water holding dissolved acid at CORRODE_AT or more; rates scale with the strength
//   'base'   lye, or water holding dissolved alkali at BASE_AT or more; likewise
//   'water'  water or stormwater
//   a liquid or gas id, for that one only
// and the block it acts on (`block`, one or a list). A rule marked `alone` acts on the block by itself above `above`°,
// optionally only while it `touching` another block (used up too if `usesTouching`), only in open air (`air`), or only
// shut off from air (`sealed`).
// What happens: the block becomes `to` (a block id, AIR, or { liquid, temp } for a melt); `gas` [id, amount] comes off
// into the nearest room; `sol` [[channel, amount]] goes into the liquid; `uses` is how much of the liquid's strength
// (acid, alkali) or amount (water, gas) it takes; `heat` J; `fx` a puff.
import { AIR, ALUMINIUM, ASH, BLEACHED, CHARCOAL, CHLORINE, CO2, COMB, COPPER, CORAL, CRISP, DIRT, FUSE, GLASS, H, HYDROGEN, ICE, LEAF, LIME, LIMESTONE, LYE, METAL, MOLTEN, MOSS, MSLAG, NBLOCK, NLIQ, NSOL, ORE, OXYGEN, PATINA, PLANT, QUICKLIME, RUST, SALT, SAND, SMOKE, SODA, SOL_ACID, SOL_BASE, SOL_METAL, SOL_SALT, SPONGE, STEAM, STORM, SUGAR, W, WATER, WETDIRT, WETSPONGE, WOOD, WOOL, ZINC } from './config.js';
import { ACID } from './config.js';
import { AIR_CAP, BCAP, LCAP } from './matter.js';
import { puff } from './particles.js';
import { CORRODE_AT } from './solutes.js';
import { S, held, liq, markDirty, sol, solid, temp, typ, wake } from './world.js';

const BASE_AT = 40;   // and CORRODE_AT (js/solutes.js) for acid
// How fast metal under water rusts (per contact per chemistry tick), faster in brine or acid, and how much slower it is
// with no air at the metal (only what's dissolved in the water reaches it).
const RUST_RATE = 0.0003, SUBMERGED = 0.15, PATINA_RATE = 0.00004;
const LIQUID_KINDS = { acid: 0, base: 1, water: 2 };   // then 3 + liquid id
const kindOf = w => typeof w === 'string' ? LIQUID_KINDS[w] : 3 + w;
const contact = Array.from({ length: 3 + NLIQ }, () => new Array(NBLOCK).fill(null));   // [kind][block] → rules
const hot = new Array(NBLOCK).fill(null), hotFrom = new Float32Array(NBLOCK).fill(Infinity);   // block → heat rules, lowest `above`
const RULES = [];
function rule(r) {
  RULES.push(r);
  for (const b of [].concat(r.block)) {
    if (r.alone) { (hot[b] = hot[b] || []).push(r); hotFrom[b] = Math.min(hotFrom[b], r.above ?? -Infinity); }
    else { const t = contact[kindOf(r.with)]; (t[b] = t[b] || []).push(r); }
  }
}
const inPuzzle = () => !!(S.level && !S.level.custom);

// ---- the rules ----
// Acid on carbonates: limestone, coral, baking soda and ash fizz carbon dioxide and leave salt in the water.
for (const [b, rate, co2, salt] of [[LIMESTONE, 0.05, 160, 10], [CORAL, 0.06, 160, 10], [BLEACHED, 0.06, 160, 10], [SODA, 0.15, 200, 12], [ASH, 0.05, 60, 4]]) {
  rule({ name: 'acid on carbonate', with: 'acid', block: b, rate, to: AIR, gas: [CO2, co2], sol: [[SOL_SALT, salt]], uses: 45, heat: 20, fx: 'fizz' });
}
// Acid on lime (a base): neutralised, hot, no gas.
rule({ name: 'acid on lime', with: 'acid', block: [QUICKLIME, LIME], rate: 0.06, to: AIR, sol: [[SOL_SALT, 16]], uses: 60, heat: 150, fx: 'fizz' });
// Acid on metals: zinc briskly, iron steadily, aluminium slowly at first (its oxide skin), giving hydrogen and metal
// salts; rust and ore dissolve without gas. Copper and gold resist it, as do glass, sand and stone.
rule({ name: 'acid on zinc', with: 'acid', block: ZINC, rate: 0.03, to: AIR, gas: [HYDROGEN, 160], sol: [[SOL_METAL, 40]], uses: 50, heat: 60, fx: 'fizz' });
rule({ name: 'acid on iron', with: 'acid', block: METAL, rate: 0.012, to: AIR, gas: [HYDROGEN, 160], sol: [[SOL_METAL, 40]], uses: 50, heat: 60, fx: 'fizz' });
rule({ name: 'acid on aluminium', with: 'acid', block: ALUMINIUM, rate: 0.006, to: AIR, gas: [HYDROGEN, 200], sol: [[SOL_METAL, 40]], uses: 50, heat: 80, fx: 'fizz' });
rule({ name: 'acid on rust', with: 'acid', block: RUST, rate: 0.04, to: AIR, sol: [[SOL_METAL, 30]], uses: 40 });
rule({ name: 'acid on ore', with: 'acid', block: ORE, rate: 0.004, to: AIR, sol: [[SOL_METAL, 40]], uses: 60 });
// Acid eats soft and living things: soil, wood, plants, wax, sugar, wool.
rule({ name: 'acid eats', with: 'acid', block: [DIRT, WETDIRT, COMB, CRISP, ICE, WOOD, MOSS, SALT, PLANT, LEAF, SPONGE, WETSPONGE, WOOL, FUSE], rate: 0.025, to: AIR, uses: 32, fx: 'fizz' });
// Strong acid chars sugar into a black, steaming lump of carbon.
rule({ name: 'acid chars sugar', with: ACID, block: SUGAR, rate: 0.05, to: CHARCOAL, gas: [STEAM, 120], uses: 20, heat: 100, fx: 'smoke' });
// Lye eats aluminium and zinc too, giving hydrogen, and dissolves wool.
rule({ name: 'lye on aluminium', with: 'base', block: ALUMINIUM, rate: 0.01, to: AIR, gas: [HYDROGEN, 200], uses: 50, heat: 80, fx: 'fizz' });
rule({ name: 'lye on zinc', with: 'base', block: ZINC, rate: 0.006, to: AIR, gas: [HYDROGEN, 120], uses: 50, heat: 40, fx: 'fizz' });
rule({ name: 'lye dissolves wool', with: 'base', block: WOOL, rate: 0.01, to: AIR, uses: 30 });
// Quicklime and water: slaked lime, and a lot of heat (enough to boil the water and light wood).
rule({ name: 'slaking lime', with: 'water', block: QUICKLIME, rate: 0.08, to: LIME, uses: 40, heat: 600, fx: 'steam' });
// Iron rusts and copper goes green where water and air both reach it (water alone, much more slowly).
rule({ name: 'rusting', with: 'water', block: METAL, rate: RUST_RATE, wetAir: true, to: RUST, saltFaster: true, notInPuzzles: true });
rule({ name: 'patina', with: 'water', block: COPPER, rate: PATINA_RATE, wetAir: true, to: PATINA, notInPuzzles: true });
// Lime mortar hardens back into limestone by taking up carbon dioxide: quickly from CO2 gas, slowly from the air.
rule({ name: 'mortar sets in CO2', with: CO2, block: LIME, rate: 0.03, to: LIMESTONE, uses: 40 });
rule({ name: 'mortar sets in air', alone: true, block: LIME, air: true, rate: 0.0008, to: LIMESTONE });
// Heat: limestone and coral burn to quicklime above 825°, giving off CO2 and taking in heat; slaked lime dries back to
// quicklime above 550°; baking soda breaks down above 150°; rust dries to red iron oxide (ore) above 200°; wood shut
// off from air chars into charcoal above 300°.
rule({ name: 'lime kiln', alone: true, block: [LIMESTONE, CORAL, BLEACHED], above: 825, rate: 0.05, to: QUICKLIME, gas: [CO2, 160], heat: -300 });
rule({ name: 'slaked lime dries', alone: true, block: LIME, above: 550, rate: 0.05, to: QUICKLIME, gas: [STEAM, 60], heat: -100 });
rule({ name: 'baking soda breaks down', alone: true, block: SODA, above: 150, rate: 0.05, to: AIR, gas: [CO2, 120], heat: -50, fx: 'fizz' });
rule({ name: 'rust dries', alone: true, block: RUST, above: 200, rate: 0.05, to: ORE, gas: [STEAM, 40] });
rule({ name: 'charcoal burning', alone: true, block: WOOD, above: 300, sealed: true, rate: 0.03, to: CHARCOAL, gas: [SMOKE, 60] });
// Glass: sand melts with soda or ash as a flux above 1000°, on its own only above 1700°.
rule({ name: 'glass with a flux', alone: true, block: SAND, above: 1000, touching: [SODA, ASH], usesTouching: true, rate: 0.05, to: GLASS, gas: [CO2, 60], fx: 'spark' });
rule({ name: 'glass', alone: true, block: SAND, above: 1700, rate: 0.05, to: GLASS, fx: 'spark' });
// Smelting: iron ore touching charcoal above 900° (where charcoal's carbon monoxide starts taking the oxygen out of
// it; a bloomery runs at 1000–1200°) gives molten, carbon-rich (cast) iron and carbon dioxide, using the charcoal; a
// third of it comes out as slag. Ore on its own just melts, above 1565°, into slag.
rule({ name: 'smelting', alone: true, block: ORE, above: 900, touching: CHARCOAL, usesTouching: true, rate: 0.08, to: { liquid: MOLTEN, temp: 1450, slag: 1 / 3 }, gas: [CO2, 120] });
rule({ name: 'ore melts', alone: true, block: ORE, above: 1565, rate: 0.05, to: { liquid: MSLAG, temp: 1600 } });
// Thermite: aluminium touching rust or ore above 1500° burns into white-hot iron and alumina slag, with no air needed.
rule({ name: 'thermite', alone: true, block: ALUMINIUM, above: 1500, touching: [RUST, ORE], usesTouching: { liquid: MOLTEN, temp: 2500 }, rate: 0.5, to: { liquid: MSLAG, temp: 2500 }, fx: 'spark' });

// ---- the engine ----
const capOf = k => solid[k] ? BCAP[solid[k]] : liq[k] ? LCAP[typ[k]] * liq[k] / 255 + AIR_CAP * (1 - liq[k] / 255) : AIR_CAP;
const sides = (k, f) => {
  const x = k % W;
  if (k >= W && f(k - W)) return true;
  if (x > 0 && f(k - 1)) return true;
  if (x < W - 1 && f(k + 1)) return true;
  return k < W * H - W && f(k + W);
};
const openAir = o => !solid[o] && (!liq[o] || typ[o] === OXYGEN);
// Puts `amount` of gas t into tile k if it's empty, or else into the nearest side with room.
function emitGas(k, t, amount) {
  const room = o => !solid[o] && (!liq[o] || (typ[o] === t && liq[o] + amount <= 255));
  let at = room(k) ? k : -1;
  if (at < 0) sides(k, o => room(o) && (at = o, true));
  if (at < 0) return;
  if (!liq[at]) { temp[at] = temp[k]; sol.fill(0, at * NSOL, at * NSOL + NSOL); }
  liq[at] += amount; typ[at] = t; wake(at);
}
// Turns block tile k into `to`: a block, nothing, or a melt.
function become(k, to) {
  if (typeof to === 'object') {
    const t = Math.random() < (to.slag || 0) ? MSLAG : to.liquid;
    solid[k] = AIR; held[k] = 0; liq[k] = 255; typ[k] = t; temp[k] = to.temp; sol.fill(0, k * NSOL, k * NSOL + NSOL); wake(k);
  } else { solid[k] = to; held[k] = 0; }
  markDirty(k % W, (k / W) | 0);
}
function warm(k, j) { temp[k] += j / capOf(k); }
// The strength of a liquid tile of the given kind (0 if it isn't one).
function strength(k, kind) {
  const t = typ[k], p = k * NSOL, watery = t === WATER || t === STORM;
  if (kind === 0) return t === ACID ? 255 : watery && sol[p + SOL_ACID] >= CORRODE_AT ? sol[p + SOL_ACID] : 0;
  if (kind === 1) return t === LYE ? 255 : watery && sol[p + SOL_BASE] >= BASE_AT ? sol[p + SOL_BASE] : 0;
  if (kind === 2) return watery ? 255 : 0;
  return t === kind - 3 ? 255 : 0;
}
// Uses up n of liquid k's strength: dissolved acid or alkali from water, or the liquid itself.
function use(k, kind, n) {
  const p = k * NSOL, t = typ[k];
  if (kind === 0 && t !== ACID) sol[p + SOL_ACID] = Math.max(0, sol[p + SOL_ACID] - n);
  else if (kind === 1 && t !== LYE) sol[p + SOL_BASE] = Math.max(0, sol[p + SOL_BASE] - n);
  else { liq[k] = Math.max(0, liq[k] - n); if (!liq[k]) { typ[k] = 0; sol.fill(0, p, p + NSOL); } }
  wake(k);
}
function apply(r, k, o, kind) {   // liquid tile k (or -1) acting on block tile o
  if (r.heat) { if (k >= 0) { warm(k, r.heat / 2); warm(o, r.heat / 2); } else warm(o, r.heat); }
  if (k >= 0 && r.sol) for (const [i, n] of r.sol) if (typ[k] === WATER || typ[k] === STORM) sol[k * NSOL + i] = Math.min(255, sol[k * NSOL + i] + n);
  if (k >= 0 && r.uses) use(k, kind, r.uses);
  become(o, r.to);
  if (r.gas) emitGas(o, r.gas[0], r.gas[1]);
  if (r.fx) puff(o, r.fx);
}
// One pass: liquids against the blocks they touch, then blocks that react on their own.
function chemTick() {
  const puzzle = inPuzzle();
  for (let k = 0; k < W * H; k++) {
    if (liq[k]) {
      const t = typ[k];
      for (let kind = 0; kind < 3 + NLIQ; kind = kind < 2 ? kind + 1 : kind === 2 ? 3 + t : 3 + NLIQ) {
        const s = strength(k, kind);
        if (!s) continue;
        const table = contact[kind];
        if (sides(k, o => {
          const rules = solid[o] && table[solid[o]];
          if (!rules) return false;
          for (const r of rules) {
            if (r.notInPuzzles && puzzle) continue;
            let rate = r.rate * s / 255;
            if (r.saltFaster) rate = r.rate * (1 + sol[k * NSOL + SOL_SALT] / 30 + sol[k * NSOL + SOL_ACID] / 30);
            if (r.wetAir && !sides(o, openAir)) rate *= SUBMERGED;
            if (Math.random() < rate) { apply(r, k, o, kind); return true; }
          }
          return false;
        })) break;
        if (!liq[k]) break;
      }
    } else {
      const b = solid[k], rules = b && hot[b];
      if (!rules || temp[k] <= hotFrom[b]) continue;
      for (const r of rules) {
        if (r.above !== undefined && temp[k] <= r.above) continue;
        if (r.air && !sides(k, openAir)) continue;
        if (r.sealed && sides(k, openAir)) continue;
        let other = -1;
        if (r.touching) { const want = [].concat(r.touching); sides(k, o => want.includes(solid[o]) && (other = o, true)); if (other < 0) continue; }
        if (Math.random() >= r.rate) continue;
        if (other >= 0 && r.usesTouching) {
          if (typeof r.usesTouching === 'object') become(other, r.usesTouching);
          else { const gasAt = other; become(other, AIR); if (r.gas) { emitGas(gasAt, r.gas[0], r.gas[1]); } }
        }
        apply({ ...r, gas: other >= 0 && r.usesTouching === true ? null : r.gas }, -1, k, -1);
        break;
      }
    }
  }
}

export { RULES, rule, contact, hot, BASE_AT, RUST_RATE, SUBMERGED, PATINA_RATE, emitGas, strength, chemTick };
