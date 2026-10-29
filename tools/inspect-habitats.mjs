// Observational generated-world audit. Reports actual connected water/light/food, without replenishing it.
import { appendFileSync, writeFileSync } from 'node:fs';
import { C, Wd, step, reseed } from './test-support.mjs';
const { generate } = await import('../js/generate.js');
const { plants } = await import('../js/plants.js');
const { centre } = await import('../js/creatures.js');
const { ECO_ANIMALS, ECO_C, ECO_DAY } = await import('../js/ecology-data.js');
const { ecoState, ecoComb } = await import('../js/ecology.js');
const { soluteAmount } = await import('../js/solutes.js');
const { skyAbove, oxygenIn } = await import('../js/oxygen.js');
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seeds = arg('seeds', '7,73,31337').split(',').map(Number), ticks = Number(arg('ticks', '0')), out = arg('out', '');
if (seeds.some(s => !Number.isInteger(s)) || !Number.isInteger(ticks) || ticks < 0) throw new Error('Invalid seeds/ticks');
if (out) writeFileSync(out, '');
function observe(seed, elapsed, originals) {
  const pools = [], visited = new Uint8Array(C.W * C.H), animals = Wd.bodies.filter(b => ['fish', 'pike'].includes(b.kind));
  for (const animal of animals) {
    const origin = centre(animal); if (visited[origin] || !Wd.liq[origin] || Wd.typ[origin] !== C.WATER) continue;
    const queue = [origin]; visited[origin] = 1; const members = new Set();
    let algae = 0, light = 0, oxygen = 0, volume = 0;
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i], x = k % C.W; members.add(k);
      const v = Wd.liq[k] / 255; volume += v; algae += soluteAmount(k, C.SOL_ALGAE); oxygen += oxygenIn(k) * v;
      if (skyAbove(k)) light++;
      for (const n of [k - C.W, k + C.W, x ? k - 1 : -1, x < C.W - 1 ? k + 1 : -1]) {
        if (n < 0 || n >= visited.length || visited[n] || !Wd.liq[n] || Wd.typ[n] !== C.WATER) continue;
        visited[n] = 1; queue.push(n);
      }
    }
    const occupants = animals.filter(b => members.has(centre(b)));
    pools.push({ tiles: queue.length, volume, litTiles: light, algae, oxygen: oxygen / volume,
      animals: occupants.map(b => ({ id: b.id, kind: b.kind, original: originals.includes(b.id),
        foodDays: Math.max(0, b.bio.c - ECO_ANIMALS[b.kind].body) / (ECO_ANIMALS[b.kind].burn * ECO_DAY),
        stress: b.starving || 0 })) });
  }
  let honey = 0; for (let k = 0; k < C.W * C.H; k++) if (Wd.solid[k] === C.COMB) honey += ecoComb(k);
  return { seed, elapsedTicks: elapsed, pools, fishOutsideWater: animals.filter(b => !Wd.liq[centre(b)] || Wd.typ[centre(b)] !== C.WATER).map(b => b.id),
    plants: plants.length, flowers: plants.filter(p => p.flower >= 0).length,
    honey, honeyCarbon: honey * ECO_C.honey, bees: Wd.bodies.filter(b => b.kind === 'bee').length,
    nectarCollected: Wd.S.accounting.nectarCollected || 0, honeyEaten: Wd.S.accounting.honeyEaten || 0,
    fixedAir: Wd.S.accounting.photosynthesisAirC || 0, fixedWater: Wd.S.accounting.photosynthesisWaterC || 0,
    inoculum: ecoState().inoculum, births: Wd.S.diagnostics.births, deaths: Wd.S.diagnostics.deathCounts };
}
for (const seed of seeds) {
  Wd.S.seed = seed; generate(); reseed(seed); const original = Wd.bodies.map(b => b.id);
  const emit = elapsed => { const line = JSON.stringify(observe(seed, elapsed, original)); console.log(line); if (out) appendFileSync(out, line + '\n'); };
  emit(0);
  for (let i = 1; i <= ticks; i++) { step(); if (i % (ECO_DAY / 8) === 0 || i === ticks) emit(i); }
}
process.exit(0);
