import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
import { bioPool, bioTransfer } from '../js/ecology-core.js';
import { ECO_ANIMALS, ECO_C, ECO_COST, ECO_QUOTA } from '../js/ecology-data.js';
import * as Eco from '../js/ecology.js';
import { addBody, hurt } from '../js/bodies.js';
import { centre, die, driveBee, storeHoney } from '../js/creatures.js';
import { bloom, plants, plantSeed, plantTick, regrowLeaf, dropSeed } from '../js/plants.js';
import { nitrogen, soluteAmount } from '../js/solutes.js';
import { oxygenIn, OXYGEN_REFERENCE, MG_PER_UNIT } from '../js/oxygen.js';
import { rots } from '../js/erosion.js';
import { REACT } from '../js/reactions.js';
import { breakBlock, scoopBucket } from '../js/explorer.js';
import { pumpTick } from '../js/pumps.js';
import { BURN_TIME, burn } from '../js/fire.js';
import { rivers, riversTick } from '../js/biomes.js';
import { chemTick } from '../js/chem.js';
import { capture, restore, packWorld, unpackWorld } from '../js/snapshot.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message, tolerance = 1e-7) { ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }
function budget(before, label) {
  const after = Eco.ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${label} ${key}`);
}
function wet(amount = 255) { clearWorld(22); fill(40, 50, 40, 50, C.WATER, 20, amount); return at(40, 50); }
function anoxic(k) { Wd.sol[k * C.NSOL + C.SOL_O2] = OXYGEN_REFERENCE / MG_PER_UNIT; }
function set(k, channel, value) { Wd.sol[k * C.NSOL + channel] = value; }

{
  const from = bioPool(10, 2, 0.1), to = bioPool();
  bioTransfer(from, to, bioPool(8, 1, 1));
  near(to.c, 0.8, 'phosphorus limits a coupled transfer'); near(from.p, 0, 'no negative nutrient');
  const tiny = bioPool(10, 2, 0.1), small = bioPool();
  for (let i = 0; i < 100; i++) bioTransfer(tiny, small, bioPool(0.008, 0.001, 0.001));
  for (const key of ['c', 'n', 'p']) near(from[key], tiny[key], `small and large transfer agree ${key}`, 1e-10);
}

{
  const k = wet(51), fish = addBody('fish', 40 * C.T, 50 * C.T);
  set(k, C.SOL_ALGAE, 10);
  const before = Eco.ecoInventory(plants);
  near(Eco.ecoGraze(fish, k, 20), 2, 'a small puddle supplies only its actual algae'); budget(before, 'grazing');
  fish.hunger = 500; Eco.ecoGraze(fish, k, 20); near(fish.hunger, 500, 'empty water cannot feed a fish');
}
{
  const k = wet(), fish = addBody('fish', 40 * C.T, 50 * C.T), before = Eco.ecoInventory(plants);
  let alive = true, ticks = 0;
  while (alive && ticks++ < 12000) alive = Eco.ecoMaintain(fish, k);
  ok(!alive && ticks >= 10800, 'unfed fish exhausts roughly one day of reserves');
  die(fish, k, 'fizz', 'starvation'); budget(before, 'starvation and settlement');
  const dead = { ...Eco.ecoState().dead[k] }; die(fish, k, 'fizz', 'other');
  assert.deepEqual(Eco.ecoState().dead[k], dead); checks++;
}
{
  const k = wet(), parent = addBody('fish', 40 * C.T, 50 * C.T);
  parent.bio = bioPool(100, 10, 1);
  const before = Eco.ecoInventory(plants), original = { ...parent.bio };
  ok(!Eco.ecoBirth(parent, () => undefined), 'failed placement creates no offspring');
  assert.deepEqual(parent.bio, original); checks++;
  ok(Eco.ecoBirth(parent, addBody), 'funded parent can produce offspring'); budget(before, 'birth');
  const poor = addBody('fish', 41 * C.T, 50 * C.T);
  poor.bio.p = 0; ok(!Eco.ecoBirth(poor, addBody), 'no offspring without phosphorus');
}
{
  const k = wet(), fish = addBody('fish', 40 * C.T, 50 * C.T);
  fish.bio.c = ECO_ANIMALS.fish.body; set(k, C.SOL_ALGAE, 0.01);
  const before = Eco.ecoInventory(plants); let alive = true;
  for (let i = 0; i < 500 && alive; i++) {
    if (i % 100 === 0) Eco.ecoGraze(fish, k, 1e-7);
    alive = Eco.ecoMaintain(fish, k);
  }
  ok(!alive, 'negligible meals cannot repeatedly reset starvation while maintenance goes unpaid');
  budget(before, 'partial maintenance');
}
{
  const k = wet(), fish = addBody('fish', 40 * C.T, 50 * C.T);
  fish.bio.c = ECO_ANIMALS.fish.body;
  for (let i = 0; i < 100; i++) Eco.ecoMaintain(fish, k);
  set(k, C.SOL_ALGAE, 0.2); const before = Eco.ecoInventory(plants);
  Eco.ecoGraze(fish, k, 0.2); Eco.ecoMaintain(fish, k);
  near(fish.starving, 0, 'adequate food clears accumulated starvation by paying its energy cost');
  near(fish.bio.c, ECO_ANIMALS.fish.body + 0.099, 'recovery spends the prior 100 ticks plus current maintenance');
  budget(before, 'metabolic recovery');
}
{
  const k = wet(), pike = addBody('pike', 40 * C.T, 50 * C.T), prey = addBody('fish', 40 * C.T, 50 * C.T);
  const before = Eco.ecoInventory(plants);
  ok(Eco.ecoEatPrey(pike, prey, k), 'prey transfers once'); budget(before, 'predation');
  ok(!Eco.ecoEatPrey(pike, prey, k), 'the same prey cannot feed twice');
}
{
  clearWorld(); const root = at(40, 50); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  const p = plants[0]; p.sugar = 100; p.nitrogen = 10; p.phosphorus = 1;
  let before = Eco.ecoInventory(plants);
  ok(Eco.ecoPlantCost(p, ECO_COST.leaf, root - 1, C.LEAF), 'leaf growth has a paid source');
  Wd.solid[root - 1] = C.LEAF; budget(before, 'leaf allocation');
  p.phosphorus = 0; before = Eco.ecoInventory(plants);
  ok(!Eco.ecoPlantCost(p, ECO_COST.leaf, root + 1, C.LEAF), 'phosphate shortage stops growth'); budget(before, 'blocked growth');
  p.phosphorus = 1; Wd.S.timeMode = 'day'; p.max = p.h;
  before = Eco.ecoInventory(plants); bloom(p); budget(before, 'flower and nectar');
  ok(Wd.held[p.flower] > 0, 'a funded flower produces nectar');
  near((100 - ECO_COST.leaf - p.sugar - ECO_COST.flower), Wd.held[p.flower] * ECO_C.honey, 'nectar carbon matches spent sugar');
  p.sugar = 0; p.nitrogen = 0; p.phosphorus = 0;
  before = Eco.ecoInventory(plants); for (let i = 0; i < 40; i++) { regrowLeaf(p); dropSeed(p); }
  near(plants.length, 1, 'empty parent cannot create seeds'); budget(before, 'unfunded leaves and seeds');
}
{
  const k = wet(); set(k, C.SOL_ALGAE, 20); set(k, C.SOL_CO2, 100); set(k, C.SOL_FERT, 20); set(k, C.SOL_PHOSPHATE, 2);
  let before = Eco.ecoInventory(plants), amount = soluteAmount(k, C.SOL_ALGAE);
  Eco.ecoAlgae(k, true); ok(soluteAmount(k, C.SOL_ALGAE) > amount, 'algae grows with light, carbon and nutrients'); budget(before, 'algal growth');
  set(k, C.SOL_PHOSPHATE, 0); before = Eco.ecoInventory(plants); amount = soluteAmount(k, C.SOL_ALGAE);
  Eco.ecoAlgae(k, true); ok(soluteAmount(k, C.SOL_ALGAE) <= amount + 1e-8, 'no net algal growth without external phosphate'); budget(before, 'P-limited algae');
  before = Eco.ecoInventory(plants); Eco.ecoAlgae(k, false); budget(before, 'algal respiration and death');
}
{
  const k = wet(), bed = k + C.W; Wd.solid[bed] = C.DIRT;
  const before = Eco.ecoInventory(plants), oxygen = oxygenIn(k);
  for (let i = 0; i < 100; i++) rots(bed);
  near(oxygenIn(k), oxygen, 'sterile mineral bed cannot consume oxygen'); budget(before, 'sterile bed');
  Eco.ecoDeposit(bed, bioPool(3, 0.3, 0.03)); const enriched = Eco.ecoInventory(plants);
  for (let i = 0; i < 300; i++) rots(bed);
  ok(oxygenIn(k) < oxygen, 'finite organic sediment consumes oxygen'); budget(enriched, 'sediment decay');
  const empty = Eco.ecoState().dead[bed]?.c || 0; near(empty, 0, 'sediment carbon is exhausted');
  const exhausted = oxygenIn(k); for (let i = 0; i < 100; i++) rots(bed); near(oxygenIn(k), exhausted, 'exhausted sediment stops breathing');
}
{
  const k = wet(), bed = k + C.W; Wd.solid[bed] = C.DIRT; anoxic(k);
  Eco.ecoDeposit(bed, bioPool(100, 10, 1)); const before = Eco.ecoInventory(plants);
  for (let i = 0; i < 6000; i++) Eco.ecoMethane(bed, k);
  ok(Wd.typ[k - C.W] === C.METHANE && Wd.liq[k - C.W] > 0, 'anoxic substrate produces bounded methane'); budget(before, 'methanogenesis');
  const gas = Wd.liq[k - C.W]; for (let i = 0; i < 100; i++) Eco.ecoMethane(bed, k); near(Wd.liq[k - C.W], gas, 'methane stops when organic matter is gone');
}
{
  const k = wet(); anoxic(k); set(k, C.SOL_YEAST, 1); set(k, C.SOL_SUGAR, 0.5);
  let before = Eco.ecoInventory(plants);
  Eco.ecoYeast(k); budget(before, 'anaerobic fermentation');
  near(soluteAmount(k, C.SOL_ETHANOL), 1, 'one half glucose equivalent yields one ethanol equivalent without biomass growth');
  near(soluteAmount(k, C.SOL_SUGAR), 0, 'fermentation exhausts its substrate');
  const ethanol = soluteAmount(k, C.SOL_ETHANOL); Eco.ecoYeast(k); near(soluteAmount(k, C.SOL_ETHANOL), ethanol, 'empty sugar cannot keep fermenting');
  set(k, C.SOL_O2, 0); before = Eco.ecoInventory(plants); Eco.ecoAcetify(k); budget(before, 'acetification');
  ok(soluteAmount(k, C.SOL_ACETATE) > 0 && oxygenIn(k) < OXYGEN_REFERENCE, 'acetate retains carbon while using oxygen');
  const hot = soluteAmount(k, C.SOL_YEAST); Eco.ecoDeposit(k, bioPool(hot, hot * ECO_QUOTA.n, hot * ECO_QUOTA.p)); set(k, C.SOL_YEAST, 0);
  budget(before, 'dead yeast is retained');
}
{
  const k = wet(); set(k, C.SOL_YEAST, 1); set(k, C.SOL_SUGAR, 1); set(k, C.SOL_FERT, 10); set(k, C.SOL_PHOSPHATE, 1);
  const before = Eco.ecoInventory(plants); Eco.ecoYeast(k); budget(before, 'aerobic microbial growth');
  ok(soluteAmount(k, C.SOL_YEAST) > 1, 'microbial growth spends mineral nutrients');
}
{
  const k = wet(); set(k, C.SOL_AMMONIA, 10);
  const before = Eco.ecoInventory(plants), carbon = soluteAmount(k, C.SOL_CO2), random = Math.random; Math.random = () => 0;
  try { nitrogen(k, k * C.NSOL); } finally { Math.random = random; }
  budget(before, 'nitrification'); near(soluteAmount(k, C.SOL_CO2), carbon, 'nitrification does not create carbon');
  anoxic(k); set(k, C.SOL_FERT, 20); Eco.ecoDeposit(k, bioPool(1, 0.1, 0.01));
  const denit = Eco.ecoInventory(plants); Eco.ecoDenitrify(k, 10); budget(denit, 'denitrification');
  near(Eco.ecoState().nitrogenGas, 0.8, 'denitrification is limited by its carbon donor');
}
{
  clearWorld(); const home = at(40, 50); Wd.solid[home] = C.COMB; Eco.ecoSetComb(home, 0); Eco.ecoTissue(home);
  const bee = addBody('bee', 40 * C.T, 49.5 * C.T), k = centre(bee); bee.home = home; bee.homeAt = Wd.S.tick; bee.hunger = 800;
  Wd.S.timeMode = 'night'; let before = Eco.ecoInventory(plants);
  driveBee(bee, { lava: 0, acid: 0 }, k, 20, addBody);
  ok(bee.hunger > 800, 'empty comb cannot reset hunger'); budget(before, 'empty hive');
  Eco.ecoSetComb(home, 1); before = Eco.ecoInventory(plants);
  driveBee(bee, { lava: 0, acid: 0 }, k, 20, addBody); ok(Eco.ecoComb(home) < 1, 'hive feeding debits real honey'); budget(before, 'hive feeding');
  bee.load = 2; before = Eco.ecoInventory(plants); bee.load -= storeHoney(home, bee.load); budget(before, 'honey storage');
  near(bee.load, 0, 'cargo is transferred without a fixed conversion loss');
  before = Eco.ecoInventory(plants); Eco.ecoSettleBody(bee, k); budget(before, 'bee death and cargo');
  const honey = Eco.ecoComb(home); before = Eco.ecoInventory(plants);
  const melted = Eco.ecoMeltComb(home); Wd.solid[home] = 0; Wd.held[home] = 0; Wd.liq[home] = melted; Wd.typ[home] = melted ? C.HONEY : 0;
  near(melted, Math.floor(honey), 'comb melting has no full-cell sentinel'); budget(before, 'comb melt');
}
{
  const k = wet(51), h = k + 1; fill(41, 50, 41, 50, C.HONEY, 20, 7);
  const before = Eco.ecoInventory(plants); REACT[C.WATER * C.NLIQ + C.HONEY].fn(k, h, C.WATER, false); budget(before, 'partial honey dissolution');
  near(soluteAmount(k, C.SOL_SUGAR), 7, 'small honey parcel becomes the same sugar amount');
}
{
  const k = wet(51), h = k + 1; fill(41, 50, 41, 50, C.HONEY, 20, 7); set(k, C.SOL_SUGAR, 254);
  const before = Eco.ecoInventory(plants); REACT[C.WATER * C.NLIQ + C.HONEY].fn(k, h, C.WATER, false);
  near(Wd.liq[h], 7, 'sub-unit capacity postpones integer-carrier dissolution'); budget(before, 'near-saturated honey');
}
{
  clearWorld(); const home = at(40, 50), target = home + 2;
  Wd.solid[home] = C.COMB; Eco.ecoSetComb(home, 0); Eco.ecoTissue(home);
  const explorer = addBody('explorer', 10 * C.T, 10 * C.T); explorer.inv = { bucket: null, bag: [], pick: 0 };
  const before = Eco.ecoInventory(plants), introduced = { ...Eco.ecoState().introduced };
  ok(breakBlock(explorer.inv, home), 'empty comb can be harvested'); Eco.ecoTick(); budget(before, 'harvesting');
  const packet = explorer.inv.bag[0].stocks.pop(); explorer.inv.bag.length = 0;
  Wd.solid[target] = C.COMB; Eco.ecoUnpackTile(target, packet); budget(before, 'placing original stock');
  near(Eco.ecoComb(target), 0, 'mining and placing cannot refill empty comb');
  assert.deepEqual(Eco.ecoState().introduced, introduced); checks++;
}
{
  const k = wet(100); set(k, C.SOL_SUGAR, 10); set(k, C.SOL_PHOSPHATE, 2); set(k, C.SOL_ALGAE, 4);
  const explorer = addBody('explorer', 10 * C.T, 10 * C.T); explorer.inv = { bucket: null, bag: [], pick: 0 };
  const before = Eco.ecoInventory(plants); scoopBucket(explorer.inv, k); budget(before, 'bucket inventory');
  const removed = { ...Eco.ecoState().removed }; hurt(explorer, 100);
  const after = Eco.ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key] + Eco.ecoState().removed[key] - removed[key], before[key], `fainting records lost bucket ${key}`);
}
{
  const k = wet(100), inlet = k + C.W, outlet = at(60, 60);
  for (const n of [outlet - C.W, outlet - 1, outlet + 1, outlet + C.W]) Wd.solid[n] = C.STONE;
  set(k, C.SOL_SUGAR, 10); set(k, C.SOL_FERT, 3); set(k, C.SOL_PHOSPHATE, 0.3);
  Wd.pumps.push({ in: inlet, out: outlet, on: true, buf: 0, t: 0 });
  const before = Eco.ecoInventory(plants); pumpTick(); ok(Wd.pumps[0].buf > 0, 'pump stores a parcel'); budget(before, 'pump buffer inventory');
}
{
  const k = wet(200), source = at(60, 50); Wd.solid[source] = C.STONE;
  set(k, C.SOL_SUGAR, 10); set(k, C.SOL_FERT, 5); set(k, C.SOL_PHOSPHATE, 0.5); Wd.latent[k] = 9;
  rivers.push({ src: source, mouth: 40, level: 50, store: 0 });
  const before = Eco.ecoInventory(plants); riversTick(); ok(rivers[0].store > 0, 'river retains its underground parcel'); budget(before, 'river storage');
  Wd.solid[source] = 0; for (let i = 0; i < 100; i++) riversTick(); budget(before, 'river recirculation');
  near(Wd.latent[k] + Wd.latent[source] + rivers[0].latent, 9, 'underground river carries pending heat');
}
{
  clearWorld(); const root = at(40, 50);
  for (let x = 30; x <= 50; x++) Wd.solid[at(x, 51)] = C.DIRT;
  plantSeed(root); Object.assign(plants[0], { sugar: 200, nitrogen: 20, phosphorus: 2 });
  const before = Eco.ecoInventory(plants); for (let i = 0; i < 20; i++) dropSeed(plants[0]);
  ok(plants.length > 1, 'funded natural seeds can establish'); budget(before, 'paid natural seedlings');
}
{
  clearWorld(); const root = at(40, 50); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  const p = plants[0]; p.sugar = 100; p.nitrogen = 10; p.phosphorus = 1;
  Eco.ecoPlantCost(p, ECO_COST.leaf, root - 1, C.LEAF); Wd.solid[root - 1] = C.LEAF;
  const before = Eco.ecoInventory(plants); Eco.ecoReleasePlant(p); Eco.ecoTick();
  near(Wd.solid[root - 1], 0, 'whole-plant mortality also recycles its leaves'); budget(before, 'whole plant death');
}
{
  clearWorld(); const root = at(40, 50); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  const old = plants[0]; Wd.solid[root] = 0; plantSeed(root); const replacement = plants[1];
  const before = Eco.ecoInventory(plants); plantTick(); Eco.ecoTick();
  ok(plants.length === 1 && plants[0].id === replacement.id && replacement.id !== old.id, 'replacement at the same root cannot revive a dead plant');
  budget(before, 'root replacement');
}
{
  clearWorld(); const root = at(40, 50), top = root - 2 * C.W; Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  const old = plants[0]; Object.assign(old, { sugar: 100, nitrogen: 10, phosphorus: 1 });
  for (const k of [root - C.W, top]) { Eco.ecoPlantCost(old, ECO_COST.stem, k, C.PLANT); Wd.solid[k] = C.PLANT; }
  Object.assign(old, { top, h: 3, thirst: 700 }); Wd.solid[top] = 0; Wd.solid[top + C.W] = C.DIRT;
  plantSeed(top); const replacement = plants[1], before = Eco.ecoInventory(plants);
  plantTick(); Eco.ecoTick();
  ok(plants.includes(replacement) && Wd.solid[top] === C.PLANT && !plants.includes(old), 'wilting old stems cannot erase a foreign plant at their old top');
  budget(before, 'foreign top ownership');
}
{
  const k = wet(); Wd.S.timeMode = 'day';
  const before = Eco.ecoInventory(plants);
  for (let i = 0; i < 20; i++) Eco.ecoSpore(k, C.SOL_ALGAE);
  ok(soluteAmount(k, C.SOL_ALGAE) <= 5 + 1e-10, 'algae inoculum is finite');
  ok(Eco.ecoSpore(k, C.SOL_YEAST) > 0, 'independent yeast bank is not spent by algae'); budget(before, 'finite inoculation');
}
{
  clearWorld(); const root = at(40, 50); Wd.solid[root + C.W] = C.DIRT; plantSeed(root);
  Eco.ecoDeposit(root, bioPool(2, 0.2, 0.02)); const before = Eco.ecoInventory(plants);
  Eco.ecoDecay(root, root, 10); ok(Eco.ecoState().soil[root + C.W].n > 0, 'dry litter feeds supporting soil');
  const nitrogenBefore = plants[0].nitrogen; Eco.ecoRootSoil(root + C.W, plants[0]);
  ok(plants[0].nitrogen > nitrogenBefore, 'roots can access recycled litter nutrients'); budget(before, 'dry recycling and uptake');
}
{
  const k = wet(), bed = k + C.W, top = k - C.W; Wd.solid[bed] = C.DIRT; Wd.solid[top] = C.STONE;
  Eco.ecoState().methane[bed] = Eco.ECO_GAS_C * 2; const before = Eco.ecoInventory(plants);
  Eco.ecoMethane(bed, k); near(Wd.liq[top], 0, 'blocked methane remains pending');
  Wd.solid[top] = 0; Eco.ecoTick(); near(Wd.liq[top], 2, 'opening headspace releases gas even after substrate exhaustion'); budget(before, 'pending methane');
}
{
  clearWorld(); const wood = at(40, 50); Wd.solid[wood] = C.WOOD; Eco.ecoTissue(wood);
  for (const n of [wood - C.W, wood + 1, wood + C.W]) Wd.airOx[n] = 0;
  const before = Eco.ecoInventory(plants); near(Eco.ecoBurnOrganic(wood, 1), 1, 'respiration uses oxygen beside a depleted first neighbor'); budget(before, 'neighbor oxygen');
  Wd.airOx[wood - 1] = 0; Wd.liq[wood - 1] = 10; Wd.typ[wood - 1] = C.OXYGEN;
  const gasBefore = Wd.liq[wood - 1] * Eco.ECO_GAS_C, carbonBefore = Eco.ecoInventory(plants);
  near(Eco.ecoBurnOrganic(wood, 1), 1, 'organic burning consumes pure oxygen gas');
  near(Wd.liq[wood - 1] * Eco.ECO_GAS_C + Eco.ecoState().oxygenCredit[wood - 1], gasBefore - 1, 'fractional oxygen remainder is retained'); budget(carbonBefore, 'oxygen gas combustion');
}
{
  clearWorld(); const wood = at(40, 50), gas = wood - 1;
  Wd.solid[wood] = C.WOOD; Eco.ecoTissue(wood); Wd.airOx.fill(0);
  Wd.liq[gas] = 100; Wd.typ[gas] = C.OXYGEN; Wd.fire[wood] = BURN_TIME[C.WOOD];
  const before = Eco.ecoInventory(plants), carbon = Eco.ecoTissue(wood).c;
  const oxygen = Wd.liq[gas] * Eco.ECO_GAS_C;
  ok(burn(wood, 40, 50, true), 'complete organic flame path runs');
  const usedCarbon = carbon - Eco.ecoTissue(wood).c;
  near(Wd.liq[gas] * Eco.ECO_GAS_C + Eco.ecoState().oxygenCredit[gas], oxygen - usedCarbon, 'flame does not also debit legacy oxygen'); budget(before, 'complete flame path');
}
{
  clearWorld(); const wood = at(40, 50); Wd.solid[wood] = C.WOOD; Eco.ecoTissue(wood);
  for (const n of [wood - C.W, wood - 1, wood + 1, wood + C.W]) Wd.solid[n] = C.STONE;
  Wd.temp[wood] = 400; const before = Eco.ecoInventory(plants), random = Math.random; Math.random = () => 0;
  try { chemTick(); } finally { Math.random = random; }
  near(Wd.solid[wood], C.CHARCOAL, 'sealed wood chars'); budget(before, 'charcoal retains original biomass');
  Wd.solid[wood - C.W] = 0; Eco.ecoBurnOrganic(wood, 1); budget(before, 'charcoal burning');
}
{
  const k = wet(); Eco.ecoDeposit(k, bioPool(3, 0.2, 0.01)); const body = addBody('fish', 40 * C.T, 50 * C.T); body.bio.c += 1.234;
  const before = Eco.ecoInventory(plants), snapshot = capture(); const code = await packWorld(snapshot);
  clearWorld(); restore(await unpackWorld(code)); budget(before, 'new world code');
  assert.deepEqual(Wd.bodies[0].bio, body.bio); checks++;
  const legacy = capture(); legacy.version = 2; delete legacy.state.ecology; delete legacy.lists.bodies[0].bio;
  legacy.NSOL = 19; legacy.arrays.sol = new Float64Array(C.W * C.H * 19);
  legacy.arrays.sol[k * 19 + C.SOL_SALT] = 17.25;
  clearWorld(); restore(legacy);
  near(Wd.sol[k * C.NSOL + C.SOL_SALT], 17.25, 'old channel stride migrates');
  ok(Wd.bodies[0].bio && Wd.S.ecology, 'legacy organisms receive explicit migrated stores');
  const modern = capture(); clearWorld(); restore(modern); assert.deepEqual(Wd.S.ecology, modern.state.ecology); checks++;
}
console.log(`PASS ${checks} finite ecology and C/N/P accounting checks`);
