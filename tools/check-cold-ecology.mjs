// Matched cold-water physiology controls. Rates are game choices, not species calibration.
// Direct biological passes isolate temperature from movement, weather, diffusion and food additions.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
import { addBody } from '../js/bodies.js';
import { centre, driveCreature, SUFFOCATE } from '../js/creatures.js';
import { ECO_ANIMALS, ECO_DAY, ECO_RATE, aquaticActivity } from '../js/ecology-data.js';
import { ecoAlgae, ecoGraze, ecoInventory, ecoMaintain, ecoState } from '../js/ecology.js';
import { plants } from '../js/plants.js';
import { AIR_CO2_EQ_MG_PER_UNIT, MG_PER_UNIT, OXYGEN_REFERENCE, oxygenIn } from '../js/oxygen.js';
import { soluteAmount } from '../js/solutes.js';
import { capture, restore } from '../js/snapshot.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message, tolerance = 1e-7) { ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }
function budget(before, label) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${label} retains ${key}`);
}
function water(temperature, amount = 255) {
  clearWorld(73); fill(40, 50, 42, 51, C.WATER, temperature, amount);
  return at(41, 50);
}
function animal(kind, temperature, amount = 255) {
  const k = water(temperature, amount), b = addBody(kind, 41 * C.T, 50 * C.T);
  assert.equal(centre(b), k);
  return { k, b };
}
function algaeFixture(temperature, amount = 255) {
  const k = water(temperature, amount), offset = k * C.NSOL;
  Wd.sol[offset + C.SOL_ALGAE] = 20;
  Wd.sol[offset + C.SOL_CO2] = 100;
  Wd.sol[offset + C.SOL_FERT] = 10;
  Wd.sol[offset + C.SOL_PHOSPHATE] = 1;
  return k;
}
const introduced = () => structuredClone(ecoState().introduced);

for (const [temperature, factor] of [[20, 1], [10, 0.5], [0, 0.25], [30, 1]]) {
  near(aquaticActivity(temperature), factor, `named activity at ${temperature}C`);
}
ok(aquaticActivity(-20) > 0 && aquaticActivity(-20) < aquaticActivity(0), 'finite cold temperatures slow activity without a free zero-cost state');

const producer = [];
for (const temperature of [20, 10, 0]) {
  const k = algaeFixture(temperature), before = ecoInventory(plants), intro = introduced();
  const initial = soluteAmount(k, C.SOL_ALGAE), oxygen = oxygenIn(k), fixed = Wd.S.accounting.photosynthesisWaterC ?? 0;
  ecoAlgae(k, true);
  const remaining = soluteAmount(k, C.SOL_ALGAE), made = (Wd.S.accounting.photosynthesisWaterC ?? 0) - fixed;
  const respired = (oxygen - oxygenIn(k)) / AIR_CO2_EQ_MG_PER_UNIT + made;
  if (temperature >= ECO_RATE.algaeMinTemp) {
    ok(remaining > initial && made > 0, `${temperature}C illuminated producers add paid biomass`);
    near(respired, initial * ECO_RATE.algaeRespire * aquaticActivity(temperature), `${temperature}C producer respiration follows cold activity`);
  } else {
    near(made, 0, '0C growth stop remains active even in light');
    ok(remaining < initial && remaining > 0, '0C producers retain finite biomass while losing some');
  }
  budget(before, `${temperature}C producer`); assert.deepEqual(introduced(), intro); checks++;
  producer.push({ temperature, made, respired, change: remaining - initial });
}
near(producer[1].made, producer[0].made / 2, '10C production is half the matched 20C production');
near(producer[1].respired, producer[0].respired / 2, '10C respiratory costs slow with production');
near(producer[1].change, producer[0].change / 2, '10C illuminated net gain is not penalized by warm losses');

const darkLoss = [];
for (const temperature of [20, 10, 0]) {
  const k = algaeFixture(temperature), before = ecoInventory(plants), initial = soluteAmount(k, C.SOL_ALGAE);
  ecoAlgae(k, false);
  const loss = initial - soluteAmount(k, C.SOL_ALGAE);
  near(loss, initial * (ECO_RATE.algaeRespire + ECO_RATE.algaeDeath) * aquaticActivity(temperature), `${temperature}C dark losses remain paid and temperature-scaled`);
  near(Wd.S.accounting.photosynthesisWaterC ?? 0, 0, `${temperature}C darkness supplies no carbon fixation`);
  budget(before, `${temperature}C dark producer`); darkLoss.push(loss);
}
near(darkLoss[1], darkLoss[0] / 2, '10C dark losses slow with the same activity factor');
near(darkLoss[2], darkLoss[0] / 4, '0C dark losses remain positive at a quarter rate');
{
  const k = algaeFixture(10, 51), before = ecoInventory(plants), initial = soluteAmount(k, C.SOL_ALGAE);
  ecoAlgae(k, true);
  near(soluteAmount(k, C.SOL_ALGAE) - initial, 0.04 * 0.2, 'partial cold carrier has proportionate net production');
  budget(before, 'partial cold producer');
}
for (const [temperature, salt] of [[41, 0], [0, 51]]) {
  const k = algaeFixture(temperature), before = ecoInventory(plants);
  Wd.sol[k * C.NSOL + C.SOL_SALT] = salt;
  ecoAlgae(k, true);
  near(soluteAmount(k, C.SOL_ALGAE), 0, 'cold scaling never grants immunity to lethal heat or salt');
  near(Wd.S.accounting.photosynthesisWaterC ?? 0, 0, 'lethal exposure adds no producer carbon'); budget(before, 'lethal producer exposure');
}
{
  const k = algaeFixture(10), offset = k * C.NSOL;
  Wd.sol[offset + C.SOL_O2] = OXYGEN_REFERENCE / MG_PER_UNIT; Wd.sol[offset + C.SOL_CO2] = 0;
  const initial = soluteAmount(k, C.SOL_ALGAE), before = ecoInventory(plants);
  ecoAlgae(k, true);
  near(soluteAmount(k, C.SOL_ALGAE), initial, 'no oxygen and no carbon grants neither respiration nor new producer biomass');
  near(Wd.S.accounting.photosynthesisWaterC ?? 0, 0, 'carbon-starved cold producer cannot register imaginary fixation');
  budget(before, 'unfunded cold producer');
  ecoAlgae(k, false);
  near(soluteAmount(k, C.SOL_ALGAE), initial * (1 - ECO_RATE.algaeDeath * 0.5), 'anoxia prevents respiratory payment while dark mortality still retains matter');
  budget(before, 'anoxic dark producer');
}

for (const kind of ['fish', 'pike']) for (const [temperature, factor] of [[20, 1], [10, 0.5], [0, 0.25]]) {
  const { k, b } = animal(kind, temperature), before = ecoInventory(plants), initial = b.bio.c, oxygen = oxygenIn(k);
  const alive = ecoMaintain(b, k), paid = ECO_ANIMALS[kind].burn * factor;
  ok(alive, `${kind} at ${temperature}C can pay normal maintenance`);
  near(initial - b.bio.c, paid, `${kind} at ${temperature}C debits measured food`);
  near((oxygen - oxygenIn(k)) / AIR_CO2_EQ_MG_PER_UNIT, paid, `${kind} at ${temperature}C spends matching oxygen`);
  near(b.metabolicDebt, 0, `${kind} at ${temperature}C gains no debt from paid food`); budget(before, `${kind} ${temperature}C maintenance`);
}
for (const kind of ['fish', 'pike', 'bee']) {
  const { k, b } = animal(kind, 0), initial = b.bio.c;
  Wd.liq[k] = 0; Wd.typ[k] = 0;
  ecoMaintain(b, k);
  near(initial - b.bio.c, ECO_ANIMALS[kind].burn, `${kind} standing in cold air retains its ordinary maintenance cost`);
}
for (const kind of ['fish', 'pike']) {
  const { k, b } = animal(kind, 0), initial = b.bio.c;
  Wd.typ[k] = C.STORM;
  ecoMaintain(b, k);
  near(initial - b.bio.c, ECO_ANIMALS[kind].burn, `${kind} in another cold liquid does not receive the WATER-only reduction`);
}
{
  const { k, b } = animal('bee', 0), initial = b.bio.c;
  ecoMaintain(b, k);
  near(initial - b.bio.c, ECO_ANIMALS.bee.burn, 'aquatic rate changes do not alter bee maintenance');
}
{
  const { k, b } = animal('fish', 20); b.bio.c = ECO_ANIMALS.fish.body;
  Wd.sol[k * C.NSOL + C.SOL_ALGAE] = 1; // Existing food is not eaten until the explicit recovery meal below.
  const before = ecoInventory(plants);
  for (let i = 0; i < 100; i++) ecoMaintain(b, k);
  near(b.metabolicDebt, 0.1, 'unpaid warm demand accumulates carbon debt');
  Wd.temp[k] = 10; ecoMaintain(b, k);
  near(b.metabolicDebt, 0.1005, 'cooling retains old debt and adds only the new cool demand');
  near(b.starving, 100.5, 'starvation stress stays in warm-maintenance equivalents');
  Wd.temp[k] = 0; ecoMaintain(b, k);
  near(b.metabolicDebt, 0.10075, 'further cooling cannot reset or rescale carbon debt');
  const beforeMeal = ecoInventory(plants);
  ecoGraze(b, k, 1); budget(beforeMeal, 'recovery meal');
  const carbon = b.bio.c, debt = b.metabolicDebt;
  ecoMaintain(b, k);
  near(carbon - b.bio.c, debt + ECO_ANIMALS.fish.burn / 4, 'cold recovery repays old debt through actual extra respiration');
  near(b.metabolicDebt, 0, 'adequately funded cold recovery clears debt'); budget(beforeMeal, 'paid cold recovery');
  budget(before, 'debt sequence and recovery from existing food');
}
{
  const { k, b } = animal('fish', 0); b.bio.c = ECO_ANIMALS.fish.body; b.starving = 100;
  ecoMaintain(b, k);
  near(b.metabolicDebt, 0.10025, 'legacy starvation counts migrate with the warm archetype rate');
  const snap = capture(); ecoMaintain(b, k); const expected = { ...b };
  restore(snap); const saved = Wd.bodies[0]; ecoMaintain(saved, k);
  near(saved.metabolicDebt, expected.metabolicDebt, 'saved cold debt has the same next-step evolution');
  near(saved.starving, expected.starving, 'saved warm-equivalent starvation stress continues exactly');
}
{
  const { k, b } = animal('fish', 10), offset = k * C.NSOL;
  b.metabolicDebt = 0.1; b.starving = 100; Wd.sol[offset + C.SOL_O2] = OXYGEN_REFERENCE / MG_PER_UNIT;
  const initial = b.bio.c, before = ecoInventory(plants);
  for (let i = 0; i < 20; i++) ecoMaintain(b, k);
  near(b.bio.c, initial, 'anoxia cannot spend food without oxygen');
  near(b.metabolicDebt, 0.1, 'anoxia cannot clear prior food debt or invent new food debt when food is present');
  budget(before, 'oxygen-blocked recovery');
  b.metabolicDebt = 0; b.starving = 0;
  const random = Math.random; Math.random = () => 0.5;
  try {
    const area = b.w * b.h; let alive = true;
    for (let i = 0; i < SUFFOCATE + 2 && alive; i++) alive = driveCreature(b, { water: area, acid: 0, poison: 0, shock: 0, lava: 0 }, 1, false, area, addBody);
    ok(!alive && b.deathCause === 'hypoxia', 'cold scaling never prevents ordinary oxygen-negative mortality');
  } finally { Math.random = random; }
  budget(before, 'cold hypoxic mortality');
}
const starvation = [];
for (const [temperature, factor] of [[20, 1], [10, 0.5], [0, 0.25]]) {
  const { k, b } = animal('fish', temperature), before = ecoInventory(plants), intro = introduced();
  let ticks = 0, alive = true;
  while (alive && ticks < 5 * ECO_DAY) { alive = ecoMaintain(b, k); ticks++; }
  const expected = (ECO_ANIMALS.fish.reserve + ECO_RATE.starvingGrace * ECO_ANIMALS.fish.burn) / (ECO_ANIMALS.fish.burn * factor);
  ok(!alive && Math.abs(ticks - expected) <= 2, `${temperature}C unfed fish eventually starves after its measured energy budget (${ticks} passes)`);
  near(b.bio.c, ECO_ANIMALS.fish.body, `${temperature}C no-food control preserves structural biomass`);
  budget(before, `${temperature}C eventual starvation`); assert.deepEqual(introduced(), intro); checks++;
  starvation.push({ temperature, ticks, foodAdded: 0 });
}
console.log(JSON.stringify({ producer, darkLoss, starvation }));
console.log(`Cold ecology checks: ${checks} passed`);
process.exit(0);
