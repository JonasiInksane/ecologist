// Observational generated-world audit. Reports actual connected water/light/food, without replenishing it.
import { appendFileSync, writeFileSync } from 'node:fs';
import { C, Wd, step, reseed } from './test-support.mjs';
const { generate } = await import('../js/generate.js');
const { plants } = await import('../js/plants.js');
const { centre } = await import('../js/creatures.js');
const { ECO_ANIMALS, ECO_C, ECO_DAY } = await import('../js/ecology-data.js');
const { ecoState, ecoComb, ecoInventory } = await import('../js/ecology.js');
const { invalidEcosystemStores } = await import('./ecosystem-metrics.mjs');
const { soluteAmount } = await import('../js/solutes.js');
const { skyAbove, oxygenIn } = await import('../js/oxygen.js');
const { airWater } = await import('../js/air.js');
const { rivers } = await import('../js/biomes.js');
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seeds = arg('seeds', '7,73,31337').split(',').map(Number), ticks = Number(arg('ticks', '0')), out = arg('out', '');
const pumpMode = arg('pump', 'generated');
const weatherMode = arg('weather', 'generated');
const compact = process.argv.includes('--compact');
if (seeds.some(s => !Number.isInteger(s)) || !Number.isInteger(ticks) || ticks < 0 || !['generated', 'on', 'off'].includes(pumpMode) || !['generated', 'on', 'off'].includes(weatherMode)) throw new Error('Invalid seeds/ticks/pump/weather (generated|on|off)');
if (out) writeFileSync(out, '');
function observe(seed, elapsed, originals) {
  const pools = [], visited = new Uint8Array(C.W * C.H), animals = Wd.bodies.filter(b => ['fish', 'pike'].includes(b.kind));
  let waterVolume = 0, waterAlgae = 0;
  for (let origin = 0; origin < C.W * C.H; origin++) {
    if (visited[origin] || Wd.solid[origin] || !Wd.liq[origin] || Wd.typ[origin] !== C.WATER) continue;
    const queue = [origin]; visited[origin] = 1; const members = new Set();
    let algae = 0, light = 0, oxygen = 0, volume = 0, nitrogen = 0, phosphorus = 0, temperature = 0;
    let temperatureMin = Infinity, temperatureMax = -Infinity, coolDeepVolume = 0, hotVolume = 0;
    const coolRefuges = [];
    let x0 = C.W, x1 = 0, y0 = C.H, y1 = 0;
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i], x = k % C.W; members.add(k);
      const v = Wd.liq[k] / 255; volume += v; algae += soluteAmount(k, C.SOL_ALGAE); oxygen += oxygenIn(k) * v;
      nitrogen += soluteAmount(k, C.SOL_FERT) + soluteAmount(k, C.SOL_AMMONIA); phosphorus += soluteAmount(k, C.SOL_PHOSPHATE); temperature += Wd.temp[k] * v;
      temperatureMin = Math.min(temperatureMin, Wd.temp[k]); temperatureMax = Math.max(temperatureMax, Wd.temp[k]);
      if (Wd.liq[k] >= 160 && Wd.temp[k] < 35) {
        coolDeepVolume += v;
        if (coolRefuges.length < 8) coolRefuges.push({ x, y: (k / C.W) | 0, temperature: Wd.temp[k] });
      }
      if (Wd.temp[k] > 45) hotVolume += v;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, (k / C.W) | 0); y1 = Math.max(y1, (k / C.W) | 0);
      if (skyAbove(k)) light++;
      for (const n of [k - C.W, k + C.W, x ? k - 1 : -1, x < C.W - 1 ? k + 1 : -1]) {
        if (n < 0 || n >= visited.length || visited[n] || Wd.solid[n] || !Wd.liq[n] || Wd.typ[n] !== C.WATER) continue;
        visited[n] = 1; queue.push(n);
      }
    }
    const occupants = animals.filter(b => members.has(centre(b)));
    waterVolume += volume; waterAlgae += algae;
    if (volume < 4 && !occupants.length) continue;
    pools.push({ bounds: { x0, x1, y0, y1 }, tiles: queue.length, volume, litTiles: light, algae, nitrogen, phosphorus,
      temperature: temperature / volume, temperatureMin, temperatureMax, coolDeepVolume, hotVolume, coolRefuges, oxygen: oxygen / volume,
      animals: occupants.map(b => ({ id: b.id, kind: b.kind, original: originals.includes(b.id),
        x: b.x / C.T, y: b.y / C.T,
        foodDays: Math.max(0, b.bio.c - ECO_ANIMALS[b.kind].body) / (ECO_ANIMALS[b.kind].burn * ECO_DAY),
        stress: b.starving || 0 })) });
  }
  let honey = 0; for (let k = 0; k < C.W * C.H; k++) if (Wd.solid[k] === C.COMB) honey += ecoComb(k);
  const storage = { unit: 'carrier units', poreWater: 0, ice: 0, steam: 0, vapor: airWater(), river: rivers.reduce((s, r) => s + r.store, 0),
    pump: Wd.pumps.reduce((s, p) => s + (p.t === C.WATER ? p.buf : 0), 0),
    lakeWindow: { bounds: { x0: 16, x1: 100, y0: 25, y1: 80 }, water: 0, poreWater: 0, ice: 0, steam: 0 } };
  let invalid = invalidEcosystemStores({ ecology: ecoState(), bodies: Wd.bodies, plants, mossSugar: Wd.S.mossSugar });
  for (let k = 0; k < C.W * C.H; k++) {
    const x = k % C.W, y = (k / C.W) | 0, inLake = x >= 16 && x <= 100 && y >= 25 && y <= 80;
    if ([C.WETDIRT, C.WETSPONGE].includes(Wd.solid[k])) { storage.poreWater += Wd.held[k]; if (inLake) storage.lakeWindow.poreWater += Wd.held[k]; }
    if (Wd.solid[k] === C.ICE) { const amount = Wd.held[k] || 255; storage.ice += amount; if (inLake) storage.lakeWindow.ice += amount; }
    if (Wd.typ[k] === C.STEAM) { storage.steam += Wd.liq[k]; if (inLake) storage.lakeWindow.steam += Wd.liq[k]; }
    if (inLake && Wd.typ[k] === C.WATER) storage.lakeWindow.water += Wd.liq[k];
    if (!Number.isFinite(Wd.temp[k])) invalid++;
    if (Wd.liq[k] || ([C.WETDIRT, C.WETSPONGE, C.ICE].includes(Wd.solid[k]) && Wd.held[k])) {
      for (let channel = 0; channel < C.NSOL; channel++) if (channel !== C.SOL_O2) {
        const value = Wd.sol[k * C.NSOL + channel]; if (!Number.isFinite(value) || value < -1e-8) invalid++;
      }
    }
  }
  const total = ecoInventory(plants), ecology = ecoState(), bees = Wd.bodies.filter(b => b.kind === 'bee');
  const reportedPools = compact ? pools.filter(pool => pool.animals.length || (pool.bounds.x1 >= 16 && pool.bounds.x0 <= 100 && pool.bounds.y1 >= 25 && pool.bounds.y0 <= 80)) : pools;
  return { seed, pumpMode, weatherMode, compact, elapsedTicks: elapsed, day: elapsed / ECO_DAY, pools: reportedPools, waterVolume, waterAlgae, storage,
    total, introduced: { ...ecology.introduced }, removed: { ...ecology.removed }, invalid,
    accounting: structuredClone(Wd.S.accounting),
    fish: animals.filter(b => b.kind === 'fish').length, pike: animals.filter(b => b.kind === 'pike').length,
    pumps: Wd.pumps.map(p => ({ on: p.on, buffer: p.buf, active: p.active })),
    fishOutsideWater: animals.filter(b => !Wd.liq[centre(b)] || Wd.typ[centre(b)] !== C.WATER).map(b => b.id),
    plants: plants.length, flowers: plants.filter(p => p.flower >= 0).length,
    bankPlants: plants.filter(p => p.bank).map(p => ({ id: p.id, x: p.root % C.W, y: (p.root / C.W) | 0, height: p.h, flower: p.flower, sugar: p.sugar, nitrogen: p.nitrogen, phosphorus: p.phosphorus, thirst: p.thirst })),
    honey, honeyCarbon: honey * ECO_C.honey, bees: bees.length,
    beeStates: bees.map(b => { const k = centre(b); return {
      id: b.id, x: b.x / C.T, y: b.y / C.T, tile: k, solid: Wd.solid[k], liquid: Wd.typ[k],
      temperature: Wd.temp[k], chill: b.chill ?? 0, home: b.home ?? -1, target: b.target ?? -1,
      load: b.load ?? 0, reserveCarbon: Math.max(0, (b.bio?.c ?? 0) - ECO_ANIMALS.bee.body),
      routeGoal: b.hiveRouteHome ?? -1, routeAt: b.hiveRouteAt ?? -1,
      routeSteps: b.hivePath?.length ?? 0, nextSteps: b.hivePath?.slice(0, 2) ?? [] }; }),
    nectarCollected: Wd.S.accounting.nectarCollected ?? 0, honeyEaten: Wd.S.accounting.honeyEaten ?? 0,
    fixedAir: Wd.S.accounting.photosynthesisAirC ?? 0, fixedWater: Wd.S.accounting.photosynthesisWaterC ?? 0,
    inoculum: ecoState().inoculum, births: Wd.S.diagnostics.births, deaths: Wd.S.diagnostics.deathCounts,
    deathRecords: Wd.S.diagnostics.deaths.filter(d => ['fish', 'pike', 'bee'].includes(d.kind)) };
}
for (const seed of seeds) {
  Wd.S.seed = seed; generate(); reseed(seed); const original = Wd.bodies.map(b => b.id);
  if (weatherMode !== 'generated') Wd.S.weather = weatherMode === 'on';
  // Set both the demo switch and its target. A live lever would otherwise restore the pump next tick.
  if (pumpMode !== 'generated') {
    for (const p of Wd.pumps) p.on = pumpMode === 'on';
    for (const d of Wd.devices.values()) if (d.kind === C.LEVER) d.on = pumpMode === 'on';
  }
  const emit = elapsed => { const line = JSON.stringify(observe(seed, elapsed, original)); console.log(line); if (out) appendFileSync(out, line + '\n'); };
  emit(0);
  for (let i = 1; i <= ticks; i++) { step(); if (i % (ECO_DAY / 8) === 0 || i === ticks) emit(i); }
}
process.exit(0);
