// Named external fantasy boundaries. Reading descriptions, budgets or local inventories is pure.
import { AETHER, ASH, BASALT, BLOOM, CHARCOAL, COMB, COOLANT, CRISP, CRYSTAL, DIRT, FERT, FLOWER, FNITRO, FROST, H, HONEY, ICE, LEAF, LIGHT, METHANE, METAL, MIMIC, MOSS, NSOL, PLANT, QUICKLIME, SALT, SAND, SLAG, SLIME, SNOW, SODA, SOL_ACETATE, SOL_ALGAE, SOL_AMMONIA, SOL_CO2, SOL_ETHANOL, SOL_FERT, SOL_O2, SOL_PHOSPHATE, SOL_SUGAR, SOL_YEAST, SPONGE, STORM, SUGAR, TONIC, VOID, W, WATER, WETDIRT, WETSPONGE, WOOD, CO2 } from './config.js';
import { ECO_C, ECO_COST, ECO_QUOTA } from './ecology-data.js';
import { AIR_CAP, BCAP, LCAP, dissolvedHeatCapacity, poreHeatCapacity } from './matter.js';
import { AIR_CO2_EQ_MG_PER_UNIT, MG_PER_UNIT, OXYGEN_REFERENCE } from './oxygen.js';
import { S, airCarb, deco, held, latent, liq, sol, solid, temp, typ } from './world.js';

const FANTASY_VERSION = 1;
// Same inventory definitions as ecology, expressed without importing its simulation dependency
// graph: snapshot/reset may initialize this module before air/plants have finished loading.
const FANTASY_DISSOLVED_C = MG_PER_UNIT / AIR_CO2_EQ_MG_PER_UNIT, FANTASY_GAS_C = 10000 / 255;
const FANTASY_ORGANIC_COST = { [PLANT]: ECO_COST.stem, [LEAF]: ECO_COST.leaf, [WOOD]: ECO_COST.wood,
  [MOSS]: ECO_COST.moss, [FLOWER]: ECO_COST.flower, [COMB]: ECO_COST.wax, [CHARCOAL]: ECO_COST.wood };
const FANTASY_EFFECTS = Object.freeze(Object.fromEntries([
  'bloom-essence', 'aether-crystal', 'frost-quench', 'frost-honeycomb', 'frost-acid', 'slime-lye',
  'mimic-copy', 'void-aether', 'void-annihilation', 'coolant-quench', 'frost-water', 'slime-acid',
  'slime-lava', 'slime-heat', 'slime-shock', 'slime-freeze', 'slime-moss', 'bloom-acid', 'bloom-freeze', 'bloom-lava', 'tonic-lava',
  'storm-quench', 'storm-freeze', 'storm-metal-quench', 'storm-slag-quench', 'frost-solidification', 'slime-terrain', 'slime-methane', 'bloom-moss',
  'bloom-glowcaps', 'tonic-moss', 'tonic-glowcaps', 'frost-cooling', 'storm-boiling', 'brew-tonic',
  'brew-frost', 'liquid-light-algae', 'liquid-light-moss', 'liquid-light-solar', 'coolant-boiler', 'coolant-draw',
].map(id => [id, Object.freeze({ id, unmetered: ['liquid-light-algae', 'liquid-light-moss', 'liquid-light-solar', 'coolant-boiler'].includes(id) })])));
const defineFantasyInfo = (name, description, energy = 'measured transformations') => Object.freeze({ name, description, energy, fantasy: true });
const FANTASY_LIQUIDS = Object.freeze({
  [AETHER]: defineFantasyInfo('Aether', 'Fantasy: rises and forms crystal against lava; transmutation is recorded.'),
  [FROST]: defineFantasyInfo('Frost', 'Fantasy: an inexhaustible external cooling sink holds it at or below −40°C.'),
  [VOID]: defineFantasyInfo('Void ink', 'Fantasy: sends touched liquid, ingredients and heat to a recorded external sink.'),
  [MIMIC]: defineFantasyInfo('Mimic', 'Fantasy: transforms into its first liquid contact; void annihilates it. New material is supplied by magic.'),
  [BLOOM]: defineFantasyInfo('Bloomwater', 'Fantasy: spends liquid to conjure moss and glowcaps; biological additions are recorded.'),
  [TONIC]: defineFantasyInfo('Tonic', 'Fantasy: accelerates growth and grants a temporary ward; conjured moss is recorded.'),
  [SLIME]: defineFantasyInfo('Slime', 'Fantasy: transforms terrain and conjures methane; these sources are recorded.'),
  [STORM]: defineFantasyInfo('Stormwater', 'Fantasy conductor: carries power from a connected source; phase transformations are recorded.'),
  [LIGHT]: defineFantasyInfo('Liquid light', 'Fantasy: supplies unmetered illumination and nearby solar power; no stored light joules are modeled.', 'unmetered illumination and power'),
  [COOLANT]: defineFantasyInfo('Enhanced coolant', 'Enhanced coolant: rapid heat transport and no freezing; boiler power is unmetered.', 'unmetered boiler power'),
});
const FANTASY_BLOCKS = Object.freeze({ [CRYSTAL]: defineFantasyInfo('Crystal', 'Fantasy: glows without a modeled light-energy reserve; magical crystal formation is recorded.', 'unmetered visual illumination') });
function fantasyInfo({ liquid, block } = {}) { return Object.hasOwn(FANTASY_BLOCKS, block) ? FANTASY_BLOCKS[block] : Object.hasOwn(FANTASY_LIQUIDS, liquid) ? FANTASY_LIQUIDS[liquid] : null; }
function fantasyLedger() { return S.accounting?.fantasy ?? null; }
const emptyFantasyBio = () => ({ c: 0, n: 0, p: 0 });
function emptyFantasyBudget() {
  return { events: 0, carrierSource: {}, carrierSink: {}, blockSource: {}, blockSink: {},
    ingredientSource: Array(NSOL).fill(0), ingredientSink: Array(NSOL).fill(0),
    biologicalSource: emptyFantasyBio(), biologicalSink: emptyFantasyBio(), sensibleHeatSource: 0, sensibleHeatSink: 0,
    latentHeatSource: 0, latentHeatSink: 0, unmeteredUses: 0 };
}
function initializeFantasyAccounting({ legacy = false } = {}) {
  const accounting = S.accounting ?? (S.accounting = {});
  if (!accounting.fantasy) accounting.fantasy = { version: FANTASY_VERSION, baselineTick: S.tick,
    legacyBaseline: legacy, ...emptyFantasyBudget(), effects: {} };
  return accounting.fantasy;
}
function fantasyWriters(id) {
  if (!Object.hasOwn(FANTASY_EFFECTS, id)) throw new Error(`Unknown fantasy effect: ${id}`);
  const ledger = fantasyLedger() || initializeFantasyAccounting({ legacy: true });
  const effect = ledger.effects[id] || (ledger.effects[id] = { ...emptyFantasyBudget(), lastTick: S.tick });
  ledger.events++; effect.events++; effect.lastTick = S.tick; return [ledger, effect];
}
const FANTASY_PARTIAL_BLOCKS = new Set([SALT, SUGAR, SAND, SNOW, SODA, ASH, QUICKLIME, ICE, CRISP, FNITRO, METAL, SLAG, BASALT]);
const FANTASY_PORE_BLOCKS = new Set([DIRT, WETDIRT, SPONGE, WETSPONGE]);
function fantasyHeatCapacity(k) {
  const block = solid[k], amount = liq[k], offset = k * NSOL;
  if (FANTASY_PORE_BLOCKS.has(block)) return poreHeatCapacity(block, held[k], sol, offset);
  if (block) {
    const fraction = (FANTASY_PARTIAL_BLOCKS.has(block) ? held[k] || 255 : 255) / 255;
    return BCAP[block] * fraction + AIR_CAP * (1 - fraction) + (block === ICE ? dissolvedHeatCapacity(held[k] || 255, sol, offset) : 0);
  }
  return amount ? LCAP[typ[k]] * amount / 255 + dissolvedHeatCapacity(amount, sol, offset) + AIR_CAP * (1 - amount / 255) : AIR_CAP;
}
const addFantasyBio = (into, from) => { if (from) for (const key of ['c', 'n', 'p']) into[key] += from[key]; };
function fantasyInventory(cells) {
  const state = S.ecology, result = { carrier: {}, blocks: {}, ingredients: Array(NSOL).fill(0), biological: emptyFantasyBio(), sensible: 0, latent: 0, decorations: 0 };
  for (const k of new Set(cells)) {
    if (!Number.isInteger(k) || k < 0 || k >= W * H) continue;
    const block = solid[k], amount = liq[k], offset = k * NSOL, tissue = state?.tissue[k];
    if (amount) result.carrier[typ[k]] = (result.carrier[typ[k]] ?? 0) + amount;
    if (block) result.blocks[block] = (result.blocks[block] ?? 0) + (FANTASY_PARTIAL_BLOCKS.has(block) ? held[k] || 255 : 255);
    if (tissue) addFantasyBio(result.biological, tissue);
    else if (FANTASY_ORGANIC_COST[block]) {
      const carbon = FANTASY_ORGANIC_COST[block], dry = block === COMB || block === CHARCOAL;
      addFantasyBio(result.biological, { c: carbon, n: dry ? 0 : carbon * ECO_QUOTA.n, p: dry ? 0 : carbon * ECO_QUOTA.p });
    }
    const volume = amount || (block === ICE ? held[k] || 255 : block === WETDIRT || block === WETSPONGE ? held[k] : 0), fraction = volume / 255;
    if (volume) {
      for (let i = 0; i < NSOL; i++) result.ingredients[i] += (i === SOL_O2 ? Math.max(0, OXYGEN_REFERENCE / MG_PER_UNIT - sol[offset + i]) : sol[offset + i]) * fraction;
      const algae = Math.max(0, sol[offset + SOL_ALGAE]), yeast = Math.max(0, sol[offset + SOL_YEAST]);
      result.biological.c += fraction * (sol[offset + SOL_CO2] * FANTASY_DISSOLVED_C + sol[offset + SOL_SUGAR] * ECO_C.sugar
        + (sol[offset + SOL_ETHANOL] + sol[offset + SOL_ACETATE]) * ECO_C.ethanol + algae + yeast);
      result.biological.n += fraction * (sol[offset + SOL_AMMONIA] + sol[offset + SOL_FERT] + (algae + yeast) * ECO_QUOTA.n);
      result.biological.p += fraction * (sol[offset + SOL_PHOSPHATE] + (algae + yeast) * ECO_QUOTA.p);
    }
    let food = 0;
    if (amount && typ[k] === HONEY) food += amount;
    if (state?.comb[k] !== undefined || block === COMB) food += state?.comb[k] ?? (held[k] || 255);
    if (state?.nectar[k] !== undefined || block === FLOWER) food += state?.nectar[k] ?? held[k];
    if (food) addFantasyBio(result.biological, { c: food * ECO_C.honey, n: food * ECO_C.honey * 0.01, p: food * ECO_C.honey * 0.001 });
    if (amount && typ[k] === FERT) result.biological.n += amount / 255 * 200;
    if (amount && (typ[k] === CO2 || typ[k] === METHANE)) result.biological.c += amount * FANTASY_GAS_C;
    if (block === SUGAR || block === CRISP) result.biological.c += (held[k] || 255) * ECO_C.sugar;
    for (const map of [state?.dead, state?.soil]) addFantasyBio(result.biological, map?.[k]);
    result.biological.c += airCarb[k] + (state?.methane[k] ?? 0) + (S.mossSugar?.[k] ?? 0);
    result.sensible += temp[k] * fantasyHeatCapacity(k); result.latent += latent[k]; result.decorations += deco[k];
  }
  return result;
}
function fantasyScalarDelta(into, source, sink, amount) {
  if (!Number.isFinite(amount)) throw new Error('Nonfinite fantasy accounting change');
  if (amount > 0) into[source] += amount; else if (amount < 0) into[sink] -= amount;
}
function fantasyMapDelta(into, source, sink, key, amount) {
  if (!Number.isFinite(amount)) throw new Error('Nonfinite fantasy ingredient change');
  if (Math.abs(amount) < 1e-12) return;
  const target = into[amount > 0 ? source : sink]; target[key] = (target[key] ?? 0) + Math.abs(amount);
}
function withFantasyEffect(id, cells, mutate) {
  if (!Object.hasOwn(FANTASY_EFFECTS, id)) throw new Error(`Unknown fantasy effect: ${id}`);
  const before = fantasyInventory(cells), value = mutate(), after = fantasyInventory(cells);
  // No-op/blocked rules have no event and cannot initialize a ledger merely by being queried.
  if (JSON.stringify(before) === JSON.stringify(after)) return value;
  for (const target of fantasyWriters(id)) {
    for (const [field, source, sink] of [['carrier', 'carrierSource', 'carrierSink'], ['blocks', 'blockSource', 'blockSink']])
      for (const key of new Set([...Object.keys(before[field]), ...Object.keys(after[field])])) fantasyMapDelta(target, source, sink, key, (after[field][key] ?? 0) - (before[field][key] ?? 0));
    for (let i = 0; i < NSOL; i++) fantasyMapDelta(target, 'ingredientSource', 'ingredientSink', i, after.ingredients[i] - before.ingredients[i]);
    for (const key of ['c', 'n', 'p']) fantasyMapDelta(target, 'biologicalSource', 'biologicalSink', key, after.biological[key] - before.biological[key]);
    fantasyScalarDelta(target, 'sensibleHeatSource', 'sensibleHeatSink', after.sensible - before.sensible);
    fantasyScalarDelta(target, 'latentHeatSource', 'latentHeatSink', after.latent - before.latent);
  }
  return value;
}
function recordFantasyEnergy(id, joules) {
  if (!Number.isFinite(joules)) throw new Error('Nonfinite magical heat');
  if (!joules) return;
  for (const target of fantasyWriters(id)) fantasyScalarDelta(target, 'sensibleHeatSource', 'sensibleHeatSink', joules);
}
function recordFantasyUse(id, amount = 1) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid unmetered fantasy use');
  if (!amount) return;
  for (const target of fantasyWriters(id)) target.unmeteredUses += amount;
}
function spendFantasyCarrier(k, remaining) {
  const amount = liq[k], retained = Math.max(0, Math.min(amount, remaining));
  if (amount) latent[k] *= retained / amount;
  liq[k] = retained;
  if (!retained) { typ[k] = 0; latent[k] = 0; sol.fill(0, k * NSOL, (k + 1) * NSOL); }
}
export { FANTASY_VERSION, FANTASY_EFFECTS, FANTASY_LIQUIDS, FANTASY_BLOCKS, fantasyInfo, fantasyLedger, initializeFantasyAccounting,
  fantasyHeatCapacity, fantasyInventory, withFantasyEffect, recordFantasyEnergy, recordFantasyUse, spendFantasyCarrier };

