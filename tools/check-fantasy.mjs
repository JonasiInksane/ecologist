// Headless fantasy boundaries: named external changes, ordinary stocks, and persistence.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill, step } from './test-support.mjs';
const F = await import('../js/fantasy.js');
const R = await import('../js/reactions.js');
const Heat = await import('../js/heat.js');
const Eco = await import('../js/ecology.js');
const Sol = await import('../js/solutes.js');
const Ox = await import('../js/oxygen.js');
const Matter = await import('../js/matter.js');
const Plants = await import('../js/plants.js');
const Snap = await import('../js/snapshot.js');
const History = await import('../js/history.js');
const Devices = await import('../js/devices.js');
const { shade } = await import('../js/climate.js');
const { generate } = await import('../js/generate.js');
const { ECO_C, ECO_COST, ECO_QUOTA } = await import('../js/ecology-data.js');
const { S, liq, typ, solid, sol, temp, latent, held } = Wd;
const k = at(40, 40), o = k + 1;
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(actual, expected, message, tolerance = 1e-7) { ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected}`); }
function check(name, fn) { clearWorld(73); fn(); console.log(`PASS ${name}`); }
function random(value, fn) { const prior = Math.random; try { Math.random = () => value; return fn(); } finally { Math.random = prior; } }
function heatIn(cells) { Heat.fillMatter(); return cells.reduce((sum, q) => sum + Heat.cap[q] * temp[q] + latent[q], 0); }
function baseline(cells) {
  const inventory = Eco.ecoInventory(Plants.plants);
  return { inventory, ledger: structuredClone(F.fantasyLedger()), introduced: { ...Eco.ecoState().introduced }, removed: { ...Eco.ecoState().removed }, heat: heatIn(cells) };
}
function reconciles(before, cells, label) {
  const after = Eco.ecoInventory(Plants.plants), ledger = F.fantasyLedger();
  for (const key of ['c', 'n', 'p']) near(after[key] - before.inventory[key], ledger.biologicalSource[key] - before.ledger.biologicalSource[key]
    - ledger.biologicalSink[key] + before.ledger.biologicalSink[key], `${label} reconciles biological ${key}`);
  near(heatIn(cells) - before.heat, ledger.sensibleHeatSource - before.ledger.sensibleHeatSource - ledger.sensibleHeatSink + before.ledger.sensibleHeatSink
    + ledger.latentHeatSource - before.ledger.latentHeatSource - ledger.latentHeatSink + before.ledger.latentHeatSink, `${label} reconciles modeled sensible/pending heat`, 0.0002);
  assert.deepEqual(Eco.ecoState().introduced, before.introduced); checks++;
  assert.deepEqual(Eco.ecoState().removed, before.removed); checks++;
}
function stock(q, seed = 1) {
  for (let i = 0; i < C.NSOL; i++) sol[q * C.NSOL + i] = i === C.SOL_O2 ? -21.125 * seed : (i + 1) * 0.125 * seed;
}

check('description, ledger, inventory and snapshot reads do not initialize state', () => {
  delete S.accounting.fantasy; S.ecology = null; S.tick = 432;
  const before = structuredClone(S.accounting);
  ok(F.fantasyLedger() === null, 'missing ledger is an explicit unmeasured history');
  ok(F.fantasyInfo({ liquid: C.VOID }).description.includes('sink'), 'void explains its sink');
  ok(F.fantasyInfo({ liquid: C.LIGHT }).energy.includes('unmetered'), 'light does not invent stored joules');
  ok(F.fantasyInfo({ liquid: C.COOLANT }).description.includes('unmetered'), 'enhanced coolant documents its abstract boiler power');
  ok(F.fantasyInfo({ liquid: 'toString' }) === null && F.fantasyInfo({ liquid: C.WATER }) === null, 'ordinary and unknown materials remain ordinary');
  F.fantasyInventory([k]); Snap.capture(); F.withFantasyEffect('bloom-moss', [k], () => {});
  assert.deepEqual(S.accounting, before); checks++; ok(S.ecology === null, 'local reads do not seed biological banks');
});
check('new worlds have a stable zero ledger before reads or saves', () => {
  const before = structuredClone(F.fantasyLedger()); ok(before.events === 0 && before.baselineTick === 0 && !before.legacyBaseline, 'fresh baseline is zero');
  F.fantasyInfo({ block: C.CRYSTAL }); F.fantasyLedger(); F.fantasyInventory([k]);
  assert.deepEqual(F.fantasyLedger(), before); checks++;
  Snap.restore(Snap.capture()); assert.deepEqual(F.fantasyLedger(), before); checks++;
});
check('pure local receipts match existing ecology and heat definitions across material states', () => {
  const state = Eco.ecoState(), cells = [];
  const blocks = [C.PLANT, C.LEAF, C.WOOD, C.MOSS, C.FLOWER, C.COMB, C.CHARCOAL, C.SUGAR, C.CRISP, C.ICE, C.WETDIRT, C.WETSPONGE, C.SAND, C.STONE];
  for (let i = 0; i < blocks.length; i++) {
    const q = at(30 + i, 35); cells.push(q); solid[q] = blocks[i]; held[q] = 73.5; temp[q] = 23.125; latent[q] = i - 4.125; stock(q, 2);
    state.dead[q] = { c: 0.375, n: 0.025, p: 0.00125 }; state.soil[q] = { c: 0.125, n: 0.75, p: 0.0625 };
    state.methane[q] = 0.75; S.mossSugar[q] = 1.125;
  }
  state.tissue[cells[0]] = { block: C.PLANT, owner: 17, c: 5.125, n: 0.525, p: 0.0525 };
  state.comb[cells[5]] = 73.125; state.nectar[cells[4]] = 1.125;
  for (const [i, type] of [C.WATER, C.HONEY, C.FERT, C.CO2, C.METHANE].entries()) {
    const q = at(30 + i, 37); cells.push(q); fill(30 + i, 37, 30 + i, 37, type, 31.125, 127); stock(q, 3); latent[q] = 1.125;
  }
  const unchanged = structuredClone(S.ecology), actual = F.fantasyInventory(cells), expected = { c: 0, n: 0, p: 0 };
  assert.deepEqual(S.ecology, unchanged); checks++;
  for (const q of cells) {
    for (const value of [Eco.ecoTileInventory(q), state.dead[q], state.soil[q]]) if (value) for (const key of ['c', 'n', 'p']) expected[key] += value[key];
    expected.c += Wd.airCarb[q] + (state.methane[q] ?? 0) + (S.mossSugar[q] ?? 0);
  }
  for (const key of ['c', 'n', 'p']) near(actual.biological[key], expected[key], `pure receipt matches actual ecological ${key}`);
  near(actual.sensible + actual.latent, heatIn(cells), 'pure receipt matches actual fillMatter heat', 0.0002);
});
for (const [voidAmount, otherAmount] of [[7, 127], [255, 1], [255, 255]]) check(`void sink retains quantitative meaning (${voidAmount}/${otherAmount})`, () => {
  fill(40, 40, 40, 40, C.VOID, 43.25, voidAmount); fill(41, 40, 41, 40, C.HONEY, 17.125, otherAmount); stock(k); stock(o, 2);
  latent[k] = 9.25; latent[o] = 11.5;
  const before = baseline([k, o]), oldOxygen = Sol.soluteAmount(o, C.SOL_O2);
  R.react(k, o, C.VOID, false); reconciles(before, [k, o], 'void');
  const b = F.fantasyLedger(); near(b.carrierSink[C.HONEY], otherAmount, 'all contacted carrier reaches sink');
  near(b.carrierSink[C.VOID], Math.min(48, voidAmount), 'only available void is spent');
  near(latent[k], 9.25 * Math.max(0, voidAmount - 48) / voidAmount, 'remaining void retains its proportional pending heat');
  near(latent[o], 0, 'deleted parcel has no orphan phase heat');
  ok(b.ingredientSink[C.SOL_O2] >= oldOxygen, 'signed oxygen is recorded as actual oxygen amount');
  ok(b.effects['void-annihilation'].events === 1, 'one named sink event');
});
check('void/aether destroys both parcels and their pending heat once', () => {
  fill(40, 40, 40, 40, C.VOID, 20, 31); fill(41, 40, 41, 40, C.AETHER, 30, 73); latent[k] = 4; latent[o] = -7;
  const before = baseline([k, o]); R.react(k, o, C.VOID, false); reconciles(before, [k, o], 'void/aether');
  near(F.fantasyLedger().carrierSink[C.VOID], 31, 'all void is consumed'); near(F.fantasyLedger().carrierSink[C.AETHER], 73, 'all aether is consumed');
  near(latent[k] + latent[o], 0, 'both pending stores are gone'); ok(F.fantasyLedger().effects['void-aether'].events === 1, 'distinct annihilation contract');
});
check('void priority annihilates mimic instead of copying the void identity', () => {
  fill(40, 40, 40, 40, C.MIMIC, 20, 127); fill(41, 40, 41, 40, C.VOID, 20, 1); stock(k); latent[k] = 7.125;
  const before = baseline([k, o]); R.react(k, o, C.MIMIC, false); reconciles(before, [k, o], 'void priority');
  near(liq[k] + liq[o], 0, 'both actual parcels vanish under existing priority');
  ok(!F.fantasyLedger().effects['mimic-copy'] && F.fantasyLedger().effects['void-annihilation'].events === 1, 'only annihilation is receipted');
});
check('void light loss records material/thermal loss without inventing a radiative reserve', () => {
  fill(40, 40, 40, 40, C.VOID, 20, 255); fill(41, 40, 41, 40, C.LIGHT, 20, 37);
  const receiver = o + 1; fill(42, 40, 42, 40, C.WATER, 20); solid[receiver - C.W] = C.STONE;
  ok(Sol.lit(receiver, 42), 'light supplies actual illumination before loss');
  const before = baseline([k, o]); R.react(k, o, C.VOID, false); reconciles(before, [k, o], 'void/light');
  near(F.fantasyLedger().carrierSink[C.LIGHT], 37, 'light carrier reaches named sink');
  near(F.fantasyLedger().unmeteredUses, 0, 'destroying light is not a made-up electrical joule debit');
  ok(!Sol.lit(receiver, 42), 'light loss actually stops its illumination');
});
check('mimic copies only the first contacted liquid and stops this step', () => {
  fill(40, 40, 40, 40, C.MIMIC, 20, 127); stock(k);
  for (const [x, y, t] of [[40, 41, C.WATER], [39, 40, C.HONEY], [41, 40, C.OIL], [40, 39, C.AETHER]]) fill(x, y, x, y, t, 20, 1);
  const contacts = [k + C.W, k - 1, k + 1, k - C.W], beforeContact = contacts.map(q => ({ t: typ[q], a: liq[q] })), contents = Array.from(sol.subarray(k * C.NSOL, (k + 1) * C.NSOL));
  const before = baseline([k, ...contacts]);
  ok(R.reactAll(40, 40, k, C.MIMIC), 'transformed current parcel ends its step');
  ok(typ[k] === C.WATER, 'below contact wins over later honey/oil/aether');
  assert.deepEqual(contacts.map(q => ({ t: typ[q], a: liq[q] })), beforeContact); checks++;
  assert.deepEqual(Array.from(sol.subarray(k * C.NSOL, (k + 1) * C.NSOL)), contents); checks++;
  ok(F.fantasyLedger().effects['mimic-copy'].events === 1, 'exactly one transformation is recorded');
  reconciles(before, [k, ...contacts], 'first-contact mimic');
});
for (const material of [C.HONEY, C.FERT, C.CO2, C.LAVA]) check(`mimic identity ${material} records its material/biological/heat delta`, () => {
  fill(40, 40, 40, 40, C.MIMIC, 21.125, 127); fill(41, 40, 41, 40, material, 19.25, 1); stock(k); latent[k] = 5;
  const before = baseline([k, o]); R.react(k, o, C.MIMIC, false); reconciles(before, [k, o], 'mimic identity');
  near(F.fantasyLedger().carrierSink[C.MIMIC], 127, 'old identity debited'); near(F.fantasyLedger().carrierSource[material], 127, 'new identity supplied by magic');
  near(liq[o], 1, 'contact is a catalyst, not a consumed copy source'); near(latent[k], 5, 'pending heat follows unchanged carrier');
});
check('ordinary swaps, same-material contacts and blocked brine do not register magic', () => {
  fill(40, 40, 40, 40, C.WATER, 20); fill(41, 40, 41, 40, C.OIL, 20); R.react(k, o, C.WATER, false);
  typ[o] = C.WATER; R.react(k, o, C.WATER, false);
  typ[o] = C.FROST; sol[k * C.NSOL + C.SOL_SALT] = 101; R.react(k, o, C.WATER, false);
  near(F.fantasyLedger().events, 0, 'ineligible and ordinary contacts remain outside magical budgets');
});
for (const amount of [1, 127, 255]) check(`repeated frost cooling has measured heat sink (${amount})`, () => {
  fill(40, 40, 40, 40, C.FROST, 13.25, amount); stock(k); latent[k] = 7.125;
  const before = baseline([k]), chunk = ((40 / C.CHUNK) | 0) + ((40 / C.CHUNK) | 0) * (C.W / C.CHUNK);
  Heat.phaseChanges(chunk, 1); reconciles(before, [k], 'frost clamp');
  near(temp[k], -40, 'existing frost temperature cap'); near(latent[k], 7.125, 'cooling does not consume pending phase inventory');
  const count = F.fantasyLedger().events, sink = F.fantasyLedger().sensibleHeatSink;
  Heat.phaseChanges(chunk, 1); near(F.fantasyLedger().events, count, 'unchanged frost is not another event'); near(F.fantasyLedger().sensibleHeatSink, sink, 'no phantom repeated cooling');
  temp[k] = -50; Heat.phaseChanges(chunk, 1); near(temp[k], -50, 'frost does not add heat below its cap');
  temp[k] = -30; const heat = baseline([k]); Heat.phaseChanges(chunk, 1); reconciles(heat, [k], 'new heat extracted again');
});
for (const [a, b, effect, product] of [[C.AETHER, C.LAVA, 'aether-crystal', C.CRYSTAL], [C.FROST, C.WATER, 'frost-water', C.ICE], [C.COOLANT, C.LAVA, 'coolant-quench', C.BASALT], [C.SLIME, C.BLOOM, 'slime-moss', C.MOSS]]) check(`${effect} records an actual representation change`, () => {
  fill(40, 40, 40, 40, a, 20, 127); fill(41, 40, 41, 40, b, 20, 255); stock(k); stock(o); latent[o] = 9;
  const before = baseline([k, o]); R.react(k, o, a, false); reconciles(before, [k, o], effect);
  ok(solid[k] === product || solid[o] === product, 'legacy product geometry retained'); ok(F.fantasyLedger().effects[effect].events === 1, 'named transformation recorded');
  if (product === C.MOSS) { const intro = { ...Eco.ecoState().introduced }; Eco.ecoTissue(o); assert.deepEqual(Eco.ecoState().introduced, intro); checks++; }
});
check('non-phase crystal retains injected pending heat through subsequent heat passes', () => {
  fill(40, 40, 40, 40, C.AETHER, 20, 127); fill(41, 40, 41, 40, C.LAVA, 20, 73); latent[o] = 9.125;
  R.react(k, o, C.AETHER, false); const before = heatIn([o]), ledger = structuredClone(F.fantasyLedger());
  for (let i = 0; i < 3; i++) { Heat.fillMatter(); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1); }
  near(latent[o], 9.125, 'occupied crystal does not drop its pending reservoir'); near(heatIn([o]), before, 'future representation passes retain modeled energy');
  assert.deepEqual(F.fantasyLedger(), ledger); checks++;
});
check('storm boiling records transmutation and retains pending heat for ordinary steam balance', () => {
  fill(40, 40, 40, 40, C.STORM, 105, 127); stock(k); latent[k] = 7.125;
  const before = baseline([k]), chunk = 2 + 2 * (C.W / C.CHUNK);
  random(0.9, () => Heat.phaseChanges(chunk, 1)); reconciles(before, [k], 'storm boiling');
  ok(typ[k] === C.STEAM, 'legacy storm boiling product'); near(latent[k], 7.125, 'steam receives pending phase energy');
  const energy = heatIn([k]), ledger = structuredClone(F.fantasyLedger());
  Heat.phaseChanges(chunk, 1); near(heatIn([k]), energy, 'ordinary steam balancing does not silently discard pending heat', 0.0002);
  assert.deepEqual(F.fantasyLedger(), ledger); checks++;
});
for (const [molten, product, name] of [[C.MOLTEN, C.METAL, 'storm-metal-quench'], [C.MSLAG, C.SLAG, 'storm-slag-quench']]) check(`${name} records both phase products and all passenger losses`, () => {
  fill(40, 40, 40, 40, C.STORM, 20, 127); fill(41, 40, 41, 40, molten, 1600, 73); stock(k); stock(o, 2); latent[k] = 9.125; latent[o] = 3.75;
  const before = baseline([k, o]); R.react(k, o, C.STORM, false); reconciles(before, [k, o], name);
  ok(typ[k] === C.STEAM && solid[o] === product, 'legacy steam and solid product retained');
  ok(F.fantasyLedger().effects[name].events === 1 && F.fantasyLedger().ingredientSink[C.SOL_SUGAR] > 0, 'named phase rule includes erased passengers');
  near(latent[k], 9.125, 'steam retains its pending heat'); near(latent[o], 3.75, 'solid product retains its pending heat');
  const energy = heatIn([k, o]); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1); near(heatIn([k, o]), energy, 'later heat balancing has no unreceipted loss', 0.0002);
  clearWorld(73); fill(40, 40, 40, 40, C.WATER, 20, 127); fill(41, 40, 41, 40, molten, 1600, 73);
  R.react(k, o, C.WATER, false); ok(typ[k] === C.STEAM && solid[o] === product, 'ordinary water variant retains its old behavior');
  near(F.fantasyLedger().events, 0, 'ordinary water variant is not relabeled magical');
});
for (const [material, cost, id] of [[C.BLOOM, 24, 'bloom-moss'], [C.TONIC, 6, 'tonic-moss']]) check(`${id} registers magical tissue exactly once`, () => {
  fill(40, 40, 40, 40, material, 20, 32); solid[o] = C.STONE;
  const before = baseline([k, o]); const result = random(0, () => R.blockEffects(40, 40, k, material, liq[k])); reconciles(before, [k, o], id);
  near(result, 32 - cost, 'legacy rate/cost retained'); near(liq[k], 32 - cost, 'actual carrier expenditure is measured');
  near(F.fantasyLedger().biologicalSource.c, ECO_COST.moss, 'external magic supplies moss carbon');
  near(F.fantasyLedger().biologicalSource.n, ECO_COST.moss * ECO_QUOTA.n, 'external magic supplies moss nitrogen');
  near(F.fantasyLedger().biologicalSource.p, ECO_COST.moss * ECO_QUOTA.p, 'external magic supplies moss phosphorus');
  const intro = { ...Eco.ecoState().introduced }; Eco.ecoTissue(o); Eco.ecoInitializeWorld();
  assert.deepEqual(Eco.ecoState().introduced, intro); checks++; ok(Eco.ecoState().tissue[o]?.block === C.MOSS, 'moss has explicit registered tissue');
});
check('moss conjured before ordinary initialization is not introduced a second time', () => {
  fill(40, 40, 40, 40, C.BLOOM, 20, 32); solid[o] = C.STONE;
  random(0, () => R.blockEffects(40, 40, k, C.BLOOM, 32));
  const intro = { ...Eco.ecoState().introduced }; Eco.ecoInitializeWorld(); assert.deepEqual(Eco.ecoState().introduced, intro); checks++;
  near(F.fantasyLedger().biologicalSource.c, 3, 'one magic moss stock');
});
check('slime methane is distinct from ordinary finite detrital methanogenesis', () => {
  fill(40, 40, 40, 40, C.SLIME, 20); const up = k - C.W, before = baseline([k, up]);
  random(0, () => R.blockEffects(40, 40, k, C.SLIME, 255)); reconciles(before, [k, up], 'slime methane');
  near(liq[k], 255, 'existing inexhaustible slime behavior retained'); near(liq[up], 48, 'existing methane parcel size retained');
  near(F.fantasyLedger().biologicalSource.c, 48 * Eco.ECO_GAS_C, 'named external methane carbon'); ok(F.fantasyLedger().effects['slime-methane'].events === 1, 'not attributed to ordinary sediment');
});
check('heat-destroyed slime records all passengers and pending heat immediately', () => {
  fill(40, 40, 40, 40, C.SLIME, 160, 127); stock(k); latent[k] = 9.125;
  const before = baseline([k]); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1); reconciles(before, [k], 'slime heat');
  near(liq[k], 0, 'existing hot slime destruction still occurs'); near(latent[k], 0, 'no phase heat waits outside its receipt');
  near(F.fantasyLedger().effects['slime-heat'].carrierSink[C.SLIME], 127, 'actual carrier reaches named sink');
  const ledger = structuredClone(F.fantasyLedger()); Heat.fillMatter(); assert.deepEqual(F.fantasyLedger(), ledger); checks++;
  clearWorld(73); fill(40, 40, 40, 40, C.SLIME, 150, 127); Heat.fillMatter(); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1);
  near(liq[k], 127, 'unchanged threshold does not destroy cool slime'); near(F.fantasyLedger().events, 0, 'cool slime has no sink receipt');
});
for (const on of [false, true]) check(`slime shock receipt requires actual powered contact (${on ? 'live' : 'unpowered'})`, () => {
  const lever = k - 1; Devices.placeDevice(C.LEVER, lever); Wd.devices.get(lever).on = on;
  fill(40, 40, 40, 40, C.STORM, 20); fill(41, 40, 41, 40, C.SLIME, 20, 127); stock(o); latent[o] = 9.125;
  const before = baseline([o]); Devices.devicesTick();
  if (on) {
    reconciles(before, [o], 'slime shock'); near(liq[o], 0, 'existing live-contact destruction occurs'); near(latent[o], 0, 'shock records phase heat immediately');
    near(F.fantasyLedger().effects['slime-shock'].carrierSink[C.SLIME], 127, 'actual carrier is in its named electrical sink');
    const ledger = structuredClone(F.fantasyLedger()); Heat.fillMatter(); assert.deepEqual(F.fantasyLedger(), ledger); checks++;
  } else { near(liq[o], 127, 'unpowered contact cannot destroy slime'); near(latent[o], 9.125, 'unpowered pending heat retained'); near(F.fantasyLedger().events, 0, 'unpowered contact has no magical receipt'); }
});
for (const amount of [17, 127, 255]) check(`tonic recipe preserves excess and unrelated stocks (${amount})`, () => {
  fill(40, 40, 40, 40, C.WATER, 90, amount);
  sol[k * C.NSOL + C.SOL_SUGAR] = 70; sol[k * C.NSOL + C.SOL_ESSENCE] = 55; sol[k * C.NSOL + C.SOL_SALT] = 19;
  sol[k * C.NSOL + C.SOL_PHOSPHATE] = 0.75; sol[k * C.NSOL + C.SOL_FERT] = 3.125; sol[k * C.NSOL + C.SOL_O2] = -21.5; latent[k] = 7;
  const before = baseline([k]), channels = Array.from(sol.subarray(k * C.NSOL, (k + 1) * C.NSOL));
  random(0, () => Sol.soluteTick()); reconciles(before, [k], 'tonic recipe'); ok(typ[k] === C.TONIC, 'actual recipe brews');
  near(sol[k * C.NSOL + C.SOL_SUGAR], 30, 'only advertised sugar concentration spent'); near(sol[k * C.NSOL + C.SOL_ESSENCE], 15, 'excess essence remains');
  for (let i = 0; i < C.NSOL; i++) if (![C.SOL_SUGAR, C.SOL_ESSENCE].includes(i)) near(sol[k * C.NSOL + i], channels[i], `unrelated channel ${i} retained`);
  near(F.fantasyLedger().biologicalSink.c, 40 * amount / 255 * ECO_C.sugar, 'spent recipe carbon is an explicit magical sink');
  Heat.fillMatter(); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1); near(latent[k], 7, 'occupied tonic retains pending heat on the next representation pass');
});
check('frost recipe and missing-reagent control retain unrelated nutrients', () => {
  fill(40, 40, 40, 40, C.WATER, -2, 127); sol[k * C.NSOL + C.SOL_SALT] = 75; sol[k * C.NSOL + C.SOL_ESSENCE] = 52;
  sol[k * C.NSOL + C.SOL_FERT] = 2.25; sol[k * C.NSOL + C.SOL_PHOSPHATE] = 0.125;
  latent[k] = -4.125;
  random(0, () => Sol.soluteTick()); ok(typ[k] === C.FROST, 'actual cold recipe brews'); near(sol[k * C.NSOL + C.SOL_SALT], 15, 'only salt60 spent');
  near(sol[k * C.NSOL + C.SOL_ESSENCE], 12, 'only essence40 spent'); near(sol[k * C.NSOL + C.SOL_FERT], 2.25, 'nitrogen remains'); near(sol[k * C.NSOL + C.SOL_PHOSPHATE], 0.125, 'phosphorus remains');
  const next = baseline([k]); Heat.phaseChanges(2 + 2 * (C.W / C.CHUNK), 1); reconciles(next, [k], 'brewed frost next cooling pass'); near(latent[k], -4.125, 'brewed frost preserves pending cold reservoir');
  clearWorld(73); fill(40, 40, 40, 40, C.WATER, 90); sol[k * C.NSOL + C.SOL_SUGAR] = 100;
  random(0, () => Sol.soluteTick()); ok(typ[k] === C.WATER, 'missing essence cannot brew'); near(F.fantasyLedger().events, 0, 'missing recipe does not create magic accounting');
});
check('liquid light use is explicit and query helpers remain pure', () => {
  fill(40, 40, 40, 40, C.WATER, 20); fill(41, 40, 41, 40, C.LIGHT, 20); solid[k - C.W] = C.STONE;
  sol[k * C.NSOL + C.SOL_ALGAE] = 10; sol[k * C.NSOL + C.SOL_CO2] = 100; sol[k * C.NSOL + C.SOL_FERT] = 10; sol[k * C.NSOL + C.SOL_PHOSPHATE] = 1;
  const before = structuredClone(F.fantasyLedger()); ok(Sol.lit(k, 40), 'adjacent light actually illuminates algae'); assert.deepEqual(F.fantasyLedger(), before); checks++;
  Sol.algae(k, 40, k * C.NSOL); near(F.fantasyLedger().effects['liquid-light-algae'].unmeteredUses, 1, 'actual biological use is recorded');
  near(F.fantasyLedger().sensibleHeatSource + F.fantasyLedger().sensibleHeatSink, 0, 'light use does not invent calibrated joules');
});
check('liquid light supporting ordinarily paid moss records energy use without conjuring biomass', () => {
  S.timeMode = 'night'; fill(40, 40, 40, 40, C.WATER, 20); fill(40, 39, 40, 39, C.LIGHT, 20); solid[o] = C.STONE;
  sol[k * C.NSOL + C.SOL_FERT] = 60; sol[k * C.NSOL + C.SOL_PHOSPHATE] = 5; sol[k * C.NSOL + C.SOL_CO2] = 100;
  random(0.9, () => Sol.soluteTick()); const before = Eco.ecoInventory(Plants.plants), intro = { ...Eco.ecoState().introduced }, priorRandom = Math.random;
  try { let draw = 0; Math.random = () => [0, 0.5][draw++] ?? 0.9; Sol.chemistry(k, 40, k * C.NSOL); } finally { Math.random = priorRandom; }
  ok(solid[o] === C.MOSS, 'actual paid moss grows under liquid light');
  near(F.fantasyLedger().effects['liquid-light-moss'].unmeteredUses, 1, 'light-assisted moss energy is explicit');
  for (const key of ['c', 'n', 'p']) { near(Eco.ecoInventory(Plants.plants)[key], before[key], `light-assisted moss retains ordinary ${key}`); near(F.fantasyLedger().biologicalSource[key], 0, `light did not supply free ${key}`); }
  assert.deepEqual(Eco.ecoState().introduced, intro); checks++;
});
check('recorded unmetered power is named, finite, and zero uses are inert', () => {
  F.recordFantasyUse('liquid-light-solar'); F.recordFantasyUse('coolant-boiler', 2); const before = structuredClone(F.fantasyLedger());
  F.recordFantasyUse('coolant-boiler', 0); assert.deepEqual(F.fantasyLedger(), before); checks++;
  near(F.fantasyLedger().unmeteredUses, 3, 'abstract use counts remain distinct from energy');
  assert.throws(() => F.recordFantasyUse('coolant-boiler', -1)); assert.throws(() => F.recordFantasyEnergy('frost-cooling', Infinity));
  assert.throws(() => F.withFantasyEffect('unknown', [k], () => { liq[k] = 123; })); checks++; near(liq[k], 0, 'unknown contract cannot mutate first');
});
check('solar query is pure; actual liquid-light power is separated from ordinary sunlight', () => {
  S.timeMode = 'night'; Wd.under[k] = 1; shade[40] = 0;
  ok(Devices.placeDevice(C.SOLAR, k), 'actual solar panel exists'); fill(41, 40, 41, 40, C.LIGHT, 20, 63);
  const before = structuredClone(F.fantasyLedger()); ok(!Devices.sunlit(k, 40, 40), 'thin light below existing64 threshold cannot power panel');
  assert.deepEqual(F.fantasyLedger(), before); checks++;
  Devices.devicesTick(); near(F.fantasyLedger().events, 0, 'inactive solar has no magical use');
  liq[o] = 64; ok(Devices.sunlit(k, 40, 40), 'actual source reaches existing threshold');
  assert.deepEqual(F.fantasyLedger(), before); checks++;
  Devices.devicesTick(); near(F.fantasyLedger().effects['liquid-light-solar'].unmeteredUses, 1, 'only actual active solar use recorded');
  S.timeMode = 'day'; Wd.under[k] = 0; Devices.devicesTick();
  near(F.fantasyLedger().effects['liquid-light-solar'].unmeteredUses, 1, 'ordinary sunlight takes priority without duplicate magical use');
  S.timeMode = 'night'; Wd.under[k] = 1; liq[o] = 0; typ[o] = 0; Devices.devicesTick();
  ok(!Wd.devices.get(k).on, 'removed light actually stops panel'); near(F.fantasyLedger().effects['liquid-light-solar'].unmeteredUses, 1, 'no further use after source loss');
  near(F.fantasyLedger().sensibleHeatSource + F.fantasyLedger().sensibleHeatSink, 0, 'abstract solar work has no invented joule amount');
});
for (const amount of [1, 127, 255]) check(`hot coolant has measured cooling and separately unmetered boiler output (${amount})`, () => {
  ok(Devices.placeDevice(C.BOILER, k), 'actual boiler exists'); fill(41, 40, 41, 40, C.COOLANT, 250.125, amount); stock(o);
  const before = heatIn([o]), oldTemperature = temp[o]; Devices.devicesTick();
  near(temp[o], oldTemperature - Devices.COOLANT_DRAW, 'existing2C coolant draw retained');
  near(F.fantasyLedger().sensibleHeatSink, before - heatIn([o]), 'only actual coolant heat loss measured', 0.0002);
  near(F.fantasyLedger().effects['coolant-boiler'].unmeteredUses, 1, 'active output remains explicitly unmetered');
  near(F.fantasyLedger().sensibleHeatSource, 0, 'no fabricated output calibration'); ok(Wd.devices.get(k).active, 'hot coolant really runs boiler');
});
check('cold coolant stops boiler without spending heat or recording abstract output', () => {
  Devices.placeDevice(C.BOILER, k); fill(41, 40, 41, 40, C.COOLANT, 199.125, 127);
  Devices.devicesTick(); ok(!Wd.devices.get(k).active, 'cold supply really stops boiler'); near(temp[o], 199.125, 'cold supply is not debited'); near(F.fantasyLedger().events, 0, 'no phantom cooling or work');
  clearWorld(73); Devices.placeDevice(C.BOILER, k); Devices.devicesTick();
  ok(Wd.devices.get(k).active, 'legacy standalone ordinary boiler still runs'); near(F.fantasyLedger().events, 0, 'ordinary device boundary is not relabeled as coolant magic');
});

clearWorld(73); fill(40, 40, 40, 40, C.MIMIC, 20, 127); fill(41, 40, 41, 40, C.HONEY, 20, 1); R.react(k, o, C.MIMIC, false);
S.tick = 345; F.recordFantasyUse('liquid-light-solar');
const saved = Snap.capture(), expectedLedger = structuredClone(F.fantasyLedger()), expectedBio = Eco.ecoInventory(Plants.plants);
clearWorld(7); Snap.restore(saved); assert.deepEqual(F.fantasyLedger(), expectedLedger); checks++;
const encoded = Snap.encode(saved); clearWorld(7); Snap.restore(Snap.decode(encoded)); assert.deepEqual(F.fantasyLedger(), expectedLedger); checks++;
const code = await Snap.packWorld(saved); clearWorld(7); Snap.restore(await Snap.unpackWorld(code)); assert.deepEqual(F.fantasyLedger(), expectedLedger); checks++;
for (const key of ['c', 'n', 'p']) near(Eco.ecoInventory(Plants.plants)[key], expectedBio[key], `world code retains biological ${key}`);
History.clearHistory(); History.takeSnapshot(); F.recordFantasyUse('coolant-boiler', 3); S.tick += 40; History.undo(); assert.deepEqual(F.fantasyLedger(), expectedLedger); checks++;
const legacy = Snap.capture(); delete legacy.state.accounting.fantasy; Snap.restore(legacy);
ok(F.fantasyLedger().legacyBaseline && F.fantasyLedger().baselineTick === 345 && F.fantasyLedger().events === 0, 'older history receives explicit current-tick baseline');
const legacyRead = structuredClone(F.fantasyLedger()); F.fantasyInfo({ liquid: C.LIGHT }); F.fantasyLedger(); assert.deepEqual(F.fantasyLedger(), legacyRead); checks++;
console.log('PASS snapshots, binary/world codes, actual undo and missing-ledger baseline');

for (const seed of [7, 73, 31337]) {
  clearWorld(seed); S.seed = seed; S.timeMode = 'cycle'; S.weather = true; generate();
  const initial = structuredClone(F.fantasyLedger()), intro = { ...Eco.ecoState().introduced };
  for (let i = 0; i < 256; i++) step();
  const ledger = F.fantasyLedger(), events = (ledger.effects['bloom-moss']?.events ?? 0) - (initial.effects['bloom-moss']?.events ?? 0);
  ok(events > 0, `seed ${seed} actual no-input generated magic is recorded`);
  near(ledger.biologicalSource.c - initial.biologicalSource.c, events * ECO_COST.moss + ((ledger.effects['slime-methane']?.biologicalSource.c ?? 0) - (initial.effects['slime-methane']?.biologicalSource.c ?? 0)), `seed ${seed} visible magic sources have finite measured carbon`);
  assert.deepEqual(Eco.ecoState().introduced, intro); checks++;
  function finite(value) { if (typeof value === 'number') ok(Number.isFinite(value) && value >= 0, 'saved fantasy counters are finite/nonnegative'); else if (value && typeof value === 'object') for (const child of Object.values(value)) finite(child); }
  finite(ledger);
  console.log(JSON.stringify({ generatedSeed: seed, ticks: 256, bloomMossEvents: events, magicalBiologicalSource: ledger.biologicalSource }));
}
console.log(`${checks} fantasy boundary checks passed`);
process.exit(0);
