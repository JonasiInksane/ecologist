// Finite biology adapter. C uses airCarb's molecule-equivalent reference; N/P use explicit game nutrient units.
import { CO2, COMB, CRISP, DIRT, FLOWER, H, HONEY, ICE, LEAF, METHANE, MOSS, MUD, NSOL, PLANT, SOL_ACETATE, SOL_ACID, SOL_ALGAE, SOL_AMMONIA, SOL_CO2, SOL_ETHANOL, SOL_FERT, SOL_O2, SOL_PHOSPHATE, SOL_SUGAR, SOL_YEAST, SUGAR, W, WATER, WETDIRT, WETSPONGE, WOOD } from './config.js';
import { ECO_ANIMALS, ECO_C, ECO_COST, ECO_QUOTA, ECO_RATE } from './ecology-data.js';
import { bioAdd, bioCanPay, bioGrowth, bioPool, bioScale, bioTissue, bioTransfer } from './ecology-core.js';
import { AIR_CO2_EQ_MG_PER_UNIT, CARB_PER_OX, MAX_AIR_CARB, MAX_AIR_OX, MG_PER_UNIT, breatheWater, fixCarbon, oxygenIn, respire, skyAbove, wakeAir } from './oxygen.js';
import { addSoluteAmount, soluteAmount, takeSoluteAmount } from './solutes.js';
import { S, airCarb, airOx, bodies, held, latent, liq, markDirty, pumps, sol, solid, temp, typ, wake } from './world.js';
import { CHARCOAL, FERT, OXYGEN, SOL_SALT, T } from './config.js';

const ECO_DISSOLVED_C = MG_PER_UNIT / AIR_CO2_EQ_MG_PER_UNIT;
const ECO_GAS_C = 10000 / 255;
const ECO_ORGANIC = { [PLANT]: ECO_COST.stem, [LEAF]: ECO_COST.leaf, [WOOD]: ECO_COST.wood,
  [MOSS]: ECO_COST.moss, [FLOWER]: ECO_COST.flower, [COMB]: ECO_COST.wax, [CHARCOAL]: ECO_COST.wood };
const ECO_DRY_CARBON = new Set([COMB, CHARCOAL]);
const ECO_FOOD_QUOTA = { n: 0.01, p: 0.001 };
function ecoState() {
  if (!S.ecology) S.ecology = { version: 2, tissue: {}, dead: {}, soil: {}, comb: {}, nectar: {}, methane: {}, oxygenCredit: {},
    introduced: bioTissue(ECO_RATE.sporeBank * 2, ECO_QUOTA),
    inoculum: { algae: bioTissue(ECO_RATE.sporeBank, ECO_QUOTA), yeast: bioTissue(ECO_RATE.sporeBank, ECO_QUOTA) },
    riverInventory: bioPool(), removed: bioPool(), nitrogenGas: 0 };
  const e = S.ecology;
  if (e.version < 2) {
    e.oxygenCredit ||= {}; e.nectar ||= {}; e.riverInventory ||= bioPool();
    if (e.inoculum.c !== undefined) e.inoculum = { algae: bioScale(e.inoculum, 0.5), yeast: bioScale(e.inoculum, 0.5) };
    e.version = 2;
  }
  return e;
}
function ecoIntroduce(pool) { bioAdd(ecoState().introduced, pool); return pool; }
function ecoDeposit(k, pool) {
  if (!(pool.c > 0 || pool.n > 0 || pool.p > 0)) return;
  const dead = ecoState().dead; bioAdd(dead[k] || (dead[k] = bioPool()), pool);
}
function ecoFood(amount) { return bioTissue(amount * ECO_C.honey, ECO_FOOD_QUOTA); }
function ecoTissue(k) {
  const e = ecoState(), block = solid[k], old = e.tissue[k];
  if (old && old.block === block) return old;
  if (old) { ecoDeposit(k, old); delete e.tissue[k]; }
  if (!ECO_ORGANIC[block]) return null;
  const pool = bioTissue(ECO_ORGANIC[block], ECO_DRY_CARBON.has(block) ? { n: 0, p: 0 } : ECO_QUOTA);
  e.tissue[k] = { block, ...pool }; ecoIntroduce(pool);
  return e.tissue[k];
}
function ecoInstallTissue(k, block, pool) {
  const old = ecoState().tissue[k]; if (old) ecoDeposit(k, old);
  ecoState().tissue[k] = { block, ...pool };
  if (block === FLOWER) ecoState().nectar[k] = 0;
}
function ecoHoneyComb(k) {
  const amount = liq[k], wax = Math.min(ECO_COST.wax, amount * ECO_C.honey), honey = amount - wax / ECO_C.honey;
  const unused = ecoFood(wax / ECO_C.honey); unused.c = 0;
  ecoDeposit(k, unused); ecoDeposit(k, ecoContents(sol, k * NSOL, amount));
  sol.fill(0, k * NSOL, (k + 1) * NSOL); liq[k] = 0; typ[k] = 0; solid[k] = COMB;
  ecoInstallTissue(k, COMB, bioPool(wax)); ecoSetComb(k, honey); markDirty(k % W, (k / W) | 0);
}
function ecoHoneyCaramel(k) {
  const food = ecoFood(liq[k]); food.c = 0; ecoDeposit(k, food);
  ecoDeposit(k, ecoContents(sol, k * NSOL, liq[k])); sol.fill(0, k * NSOL, (k + 1) * NSOL);
}
function ecoBurnOrganic(k, wanted) {
  const tissue = ecoTissue(k); if (!tissue) return null;
  const foodAmount = solid[k] === COMB ? ecoComb(k) : solid[k] === FLOWER ? ecoFlowerNectar(k) : 0;
  const foodCarbon = foodAmount * ECO_C.honey;
  const used = ecoRespire(k, Math.min(wanted, tissue.c + foodCarbon));
  const burnedFood = Math.min(used, foodCarbon), food = ecoFood(burnedFood / ECO_C.honey);
  if (solid[k] === COMB) ecoSetComb(k, foodAmount - burnedFood / ECO_C.honey);
  else if (solid[k] === FLOWER) ecoTakeNectar(k, burnedFood / ECO_C.honey);
  ecoMinerals(k, food.n, food.p);
  const remainder = Math.min(tissue.c, used - burnedFood), fraction = tissue.c ? remainder / tissue.c : 0;
  ecoMinerals(k, tissue.n * fraction, tissue.p * fraction); tissue.c -= remainder; tissue.n *= 1 - fraction; tissue.p *= 1 - fraction;
  return used;
}
function ecoOrganicFuel(k) {
  const tissue = ecoTissue(k); if (!tissue) return null;
  return tissue.c + (solid[k] === COMB ? ecoComb(k) : solid[k] === FLOWER ? ecoFlowerNectar(k) : 0) * ECO_C.honey;
}
function ecoFlowerNectar(k) {
  const e = ecoState();
  if (e.nectar[k] === undefined) { e.nectar[k] = Math.max(0, held[k]); ecoIntroduce(ecoFood(e.nectar[k])); }
  return e.nectar[k];
}
function ecoTakeNectar(k, requested) {
  const amount = Math.min(requested, ecoFlowerNectar(k)); ecoState().nectar[k] -= amount; held[k] = ecoState().nectar[k]; return amount;
}
function ecoComb(k) {
  const e = ecoState();
  if (e.comb[k] === undefined) { e.comb[k] = held[k] || 255; ecoIntroduce(ecoFood(e.comb[k])); }
  held[k] = e.comb[k]; return e.comb[k];
}
function ecoSetComb(k, amount) { ecoState().comb[k] = Math.max(0, amount); held[k] = Math.max(0, amount); }
function ecoMeltComb(k) {
  const honey = ecoComb(k), whole = Math.floor(honey), tissue = ecoTissue(k);
  if (tissue) ecoDeposit(k, tissue);
  ecoDeposit(k, ecoFood(honey - whole));
  delete ecoState().tissue[k]; delete ecoState().comb[k];
  return whole;
}
function ecoInitialBody(kind) {
  const a = ECO_ANIMALS[kind]; return a ? bioPool(a.body + a.reserve, a.body * a.n, a.body * a.p) : null;
}
function ecoEnsureBody(b, supplied) {
  if (!ECO_ANIMALS[b.kind] || b.bio) return b.bio;
  b.bio = supplied ? { ...supplied } : ecoIntroduce(ecoInitialBody(b.kind)); return b.bio;
}
function ecoAirBeside(k) {
  const x = k % W;
  for (const o of [k, k - W, x ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k + W])
    if (o >= 0 && o < W * H && !solid[o] && !liq[o]) return o;
  return -1;
}
function ecoRespire(k, carbon) {
  if (!(carbon > 0)) return 0;
  if (liq[k] && typ[k] === WATER) {
    const used = Math.min(carbon, oxygenIn(k) * liq[k] / 255 / AIR_CO2_EQ_MG_PER_UNIT);
    if (used) breatheWater(k, used * AIR_CO2_EQ_MG_PER_UNIT * 255 / liq[k]);
    return used;
  }
  let used = respire(ecoAirBeside(k), carbon);
  if (used + ECO_RATE.epsilon >= carbon) return used;
  // Visible gas uses integer carrier units. Retain the unused fraction of a withdrawn unit explicitly.
  // Products join the same saved reference air reservoir, becoming exposed as the gas cloud moves away.
  const x = k % W, e = ecoState();
  for (const n of [k - W, x ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k + W]) {
    if (n < 0 || n >= W * H || solid[n] || (liq[n] && typ[n] !== OXYGEN)) continue;
    if (!liq[n]) used += respire(n, carbon - used);
    if (used + ECO_RATE.epsilon >= carbon) break;
    const credit = e.oxygenCredit[n] || 0, gas = liq[n] && typ[n] === OXYGEN ? liq[n] : 0;
    const paid = Math.min(carbon - used, credit + gas * ECO_GAS_C, Math.max(0, MAX_AIR_CARB - airCarb[n]));
    if (!(paid > 0)) continue;
    const withdraw = Math.min(gas, Math.ceil(Math.max(0, paid - credit) / ECO_GAS_C));
    liq[n] -= withdraw; if (!liq[n]) typ[n] = 0;
    e.oxygenCredit[n] = credit + withdraw * ECO_GAS_C - paid;
    airCarb[n] += paid; used += paid; wake(n); wakeAir();
    if (used + ECO_RATE.epsilon >= carbon) break;
  }
  return used;
}
function ecoFixWater(k, carbon) {
  const used = Math.min(carbon, soluteAmount(k, SOL_CO2) * ECO_DISSOLVED_C);
  if (used > 0) {
    breatheWater(k, -used * AIR_CO2_EQ_MG_PER_UNIT * 255 / liq[k]);
    S.accounting.photosynthesisWaterC = (S.accounting.photosynthesisWaterC || 0) + used;
  }
  return used;
}
function ecoMinerals(k, n, p) {
  let target = k;
  while (target + W < W * H && !(liq[target] && typ[target] === WATER) &&
    (!solid[target] || ECO_ORGANIC[solid[target]])) target += W;
  if (liq[target] && typ[target] === WATER) { addSoluteAmount(target, SOL_AMMONIA, n); addSoluteAmount(target, SOL_PHOSPHATE, p); }
  else { const soil = ecoState().soil; const pool = soil[target] || (soil[target] = bioPool()); pool.n += n; pool.p += p; }
}
function ecoMaintain(b, k) {
  const a = ECO_ANIMALS[b.kind], pool = ecoEnsureBody(b);
  if (!a) return true;
  if (b.kind === 'bee' && b.load > 0 && pool.c < a.body + a.burn * 2) {
    const sip = Math.min(b.load, a.reserve / ECO_C.honey); b.load -= sip; ecoFeed(b, ecoFood(sip), k);
  }
  const available = Math.max(0, pool.c - a.body);
  // A trace meal cannot pay a whole tick of maintenance. Retain unpaid energy as stress, and
  // require later food to pay it through actual respiration before recovery. Migrate old stress counts.
  const debt = b.metabolicDebt ?? (b.starving || 0) * a.burn;
  const foodBudget = Math.min(a.burn + debt, available);
  const paid = ecoRespire(k, foodBudget);
  pool.c -= paid;
  // Oxygen shortages have their own hypoxia/choking checks. Only food that is missing adds
  // starvation stress; old stress is repaid only by actual metabolism beyond current maintenance.
  b.metabolicDebt = Math.max(0, debt + Math.max(0, a.burn - foodBudget) - Math.max(0, paid - a.burn));
  if (b.metabolicDebt < ECO_RATE.epsilon) b.metabolicDebt = 0;
  b.starving = b.metabolicDebt / a.burn;
  return b.starving <= ECO_RATE.starvingGrace;
}
function ecoFeed(b, meal, k) {
  ecoEnsureBody(b);
  const fraction = meal.c > 0 ? Math.min(1, ecoAppetite(b) / meal.c) : 0;
  bioAdd(b.bio, bioScale(meal, fraction)); ecoDeposit(k, bioScale(meal, 1 - fraction));
  // Excess nutrients leave a finite stored pool, never a permanent "fed" flag.
  const a = ECO_ANIMALS[b.kind];
  const n = Math.max(0, b.bio.n - a.body * a.n * 2) * 0.1, p = Math.max(0, b.bio.p - a.body * a.p * 2) * 0.1;
  b.bio.n -= n; b.bio.p -= p; ecoMinerals(k, n, p);
  if (fraction > 0 && meal.c > 0) b.hunger = 0;
}
function ecoAppetite(b) { const a = ECO_ANIMALS[b.kind]; ecoEnsureBody(b); return Math.max(0, a.body + a.reserve * 4 - b.bio.c); }
function ecoGraze(b, k, requested) {
  const got = takeSoluteAmount(k, SOL_ALGAE, Math.min(requested, ecoAppetite(b)));
  if (got) ecoFeed(b, bioTissue(got, ECO_QUOTA), k);
  return got;
}
function ecoEatPrey(b, prey, k) {
  if (prey.eaten) return false;
  ecoEnsureBody(prey); ecoFeed(b, prey.bio, k); prey.bio = bioPool();
  if (prey.load) { ecoFeed(b, ecoFood(prey.load), k); prey.load = 0; }
  prey.eaten = true; return true;
}
function ecoEatLeaf(b, k) {
  const tissue = ecoTissue(k);
  if (!tissue || tissue.c <= 0) return false;
  const bite = Math.min(tissue.c, ECO_RATE.leafBite, ecoAppetite(b)); if (!(bite > ECO_RATE.epsilon)) return false;
  const meal = bioPool(); bioTransfer(tissue, meal, bioScale(tissue, bite / tissue.c)); ecoFeed(b, meal, k);
  if (tissue.c <= ECO_RATE.epsilon) { delete ecoState().tissue[k]; solid[k] = 0; }
  markDirty(k % W, (k / W) | 0); return true;
}
function ecoBirth(parent, create) {
  const pool = ecoEnsureBody(parent), cost = ecoInitialBody(parent.kind), a = ECO_ANIMALS[parent.kind];
  if (!pool || !bioCanPay(pool, bioPool(cost.c + a.body, cost.n + a.body * a.n, cost.p + a.body * a.p))) return null;
  const child = create(parent.kind, parent.x, parent.y, { bio: cost });
  if (!child) return null;
  bioTransfer(pool, child.bio = bioPool(), cost); return child;
}
function ecoSettleBody(b, k, removed = false) {
  if (b.bioSettled) return;
  const pool = ecoEnsureBody(b);
  if (!pool && !b.inv) return;
  const total = bioAdd(pool ? { ...pool } : bioPool(), ecoFood(b.load || 0));
  ecoMigrateBag(b.inv);
  if (b.inv?.bucket) bioAdd(total, ecoParcelInventory(b.inv.bucket.t, b.inv.bucket.a, b.inv.bucket.sol));
  for (const slot of b.inv?.bag || []) for (const packet of slot.stocks) bioAdd(total, packet.total);
  if (removed) bioAdd(ecoState().removed, total); else ecoDeposit(k, total);
  if (pool) b.bio = bioPool(); b.load = 0; b.bioSettled = true;
  if (b.inv) b.inv = { bucket: null, bag: [], pick: 0 };
}
function ecoSeedPlant(p, funding) {
  const tissue = bioTissue(ECO_COST.stem, ECO_QUOTA), free = bioPool(ECO_COST.seed, tissue.n, tissue.p);
  const total = bioAdd({ ...tissue }, free);
  if (funding && !bioCanPay(funding, total)) return false;
  if (funding) bioTransfer(funding, bioPool(), total); else ecoIntroduce(total);
  p.sugar = free.c; p.nitrogen = free.n; p.phosphorus = free.p;
  ecoInstallTissue(p.root, PLANT, { ...tissue, owner: p.id }); return true;
}
function ecoPlantPool(p) { return bioPool(p.sugar || 0, p.nitrogen || 0, p.phosphorus || 0); }
function ecoStorePlant(p, pool) { p.sugar = pool.c; p.nitrogen = pool.n; p.phosphorus = pool.p; }
function ecoPlantCost(p, carbon, k, block) {
  const pool = ecoPlantPool(p), cost = bioTissue(carbon, ECO_QUOTA);
  if (!bioCanPay(pool, cost)) return false;
  bioTransfer(pool, bioPool(), cost); ecoStorePlant(p, pool);
  ecoInstallTissue(k, block, { ...cost, owner: p.id }); return true;
}
function ecoReleasePlant(p) {
  ecoDeposit(p.root, ecoPlantPool(p)); p.sugar = 0; p.nitrogen = 0; p.phosphorus = 0;
  const e = ecoState();
  for (const key of Object.keys(e.tissue)) {
    const k = +key, tissue = e.tissue[k];
    if (tissue.owner !== p.id || solid[k] !== tissue.block) continue;
    if (solid[k] === FLOWER) ecoReleaseFlower(k);
    ecoDeposit(k, tissue); delete e.tissue[k]; solid[k] = 0; held[k] = 0; markDirty(k % W, (k / W) | 0);
  }
}
function ecoOwnLegacyPlant(p, oldCoordinates = false) {
  const e = ecoState();
  for (let i = 0; i < (p.h || 1); i++) {
    const stem = p.root - i * W;
    for (const k of [stem, stem % W ? stem - 1 : -1, stem % W < W - 1 ? stem + 1 : -1]) {
      if (k < 0 || k >= W * H || (solid[k] !== PLANT && solid[k] !== LEAF)) continue;
      const tissue = e.tissue[k]; if (tissue && (tissue.owner === undefined || (oldCoordinates && tissue.owner === p.root))) tissue.owner = p.id;
    }
  }
  if (p.flower >= 0 && e.tissue[p.flower]) e.tissue[p.flower].owner = p.id;
}
function ecoReleaseFlower(k) {
  ecoDeposit(k, ecoFood(ecoFlowerNectar(k))); delete ecoState().nectar[k]; held[k] = 0;
}
function ecoNectar(p, k, requestedCarbon) {
  const pool = ecoPlantPool(p), carbon = bioGrowth(pool, Math.min(requestedCarbon, (ECO_RATE.nectarMax - held[k]) * ECO_C.honey), ECO_FOOD_QUOTA);
  const cost = bioTissue(carbon, ECO_FOOD_QUOTA);
  const had = ecoFlowerNectar(k);
  bioTransfer(pool, bioPool(), cost); ecoStorePlant(p, pool); ecoState().nectar[k] = had + carbon / ECO_C.honey; held[k] = ecoState().nectar[k];
}
function ecoRootMinerals(k, volume, p) {
  if (!(volume > 0)) return;
  const o = k * NSOL, nutrient = sol[o + SOL_FERT] > 0 ? SOL_FERT : SOL_AMMONIA;
  const n = Math.min(Math.max(0, sol[o + nutrient]) * volume / 255, volume / 255);
  const phos = Math.min(Math.max(0, sol[o + SOL_PHOSPHATE]) * volume / 255, 0.1 * volume / 255);
  sol[o + nutrient] -= n * 255 / volume; sol[o + SOL_PHOSPHATE] -= phos * 255 / volume;
  p.nitrogen = (p.nitrogen || 0) + n; p.phosphorus = (p.phosphorus || 0) + phos;
}
function ecoRootSoil(k, p) {
  const pool = ecoState().soil[k]; if (!pool) return;
  const n = Math.min(pool.n, 0.1), phos = Math.min(pool.p, 0.01);
  pool.n -= n; pool.p -= phos; p.nitrogen += n; p.phosphorus += phos;
}
function ecoDecay(k, target = k, requested) {
  if (temp[target] < 0 || temp[target] > ECO_RATE.microbeMaxTemp) return 0;
  const pool = ecoState().dead[k]; if (!pool) return 0;
  requested = requested ?? ECO_RATE.decay * Math.max(1, pool.c / ECO_RATE.decayScale);
  if (pool.c <= ECO_RATE.epsilon) { ecoMinerals(target, pool.n, pool.p); delete ecoState().dead[k]; return 0; }
  const amount = ecoRespire(target, Math.min(pool.c, requested));
  if (!amount) return 0;
  const f = amount / pool.c, n = pool.n * f, p = pool.p * f;
  pool.c -= amount; pool.n -= n; pool.p -= p; ecoMinerals(target, n, p);
  return amount;
}
function ecoMethane(k, water) {
  const e = ecoState(), pool = e.dead[k];
  ecoFlushMethane(k, water);
  if (!pool || pool.c <= 0 || oxygenIn(water) >= 0.5 || temp[water] < 0 || temp[water] > ECO_RATE.microbeMaxTemp) return 0;
  const amount = Math.min(pool.c, ECO_RATE.decay * Math.max(1, pool.c / ECO_RATE.decayScale)), f = amount / pool.c;
  ecoMinerals(water, pool.n * f, pool.p * f); pool.n *= 1 - f; pool.p *= 1 - f; pool.c -= amount;
  addSoluteAmount(water, SOL_CO2, amount / 2 / ECO_DISSOLVED_C);
  e.methane[k] = (e.methane[k] || 0) + amount / 2;
  ecoFlushMethane(k, water);
  return amount;
}
function ecoFlushMethane(k, water) {
  const e = ecoState(); if (!(e.methane[k] > 0)) return;
  let top = water; while (top >= W && liq[top - W] && typ[top - W] === WATER) top -= W; top -= W;
  if (top >= 0 && !solid[top] && (!liq[top] || typ[top] === METHANE)) {
    const gas = Math.min(255 - liq[top], Math.floor(e.methane[k] / ECO_GAS_C));
    if (gas) { liq[top] += gas; typ[top] = METHANE; e.methane[k] -= gas * ECO_GAS_C; wake(top); }
  }
}
function ecoAlgae(k, light) {
  const amount = soluteAmount(k, SOL_ALGAE); if (!amount) return;
  if (temp[k] > ECO_RATE.algaeMaxTemp || sol[k * NSOL + SOL_SALT] > ECO_RATE.algaeMaxSalt) {
    takeSoluteAmount(k, SOL_ALGAE, amount); ecoDeposit(k, bioTissue(amount, ECO_QUOTA)); return;
  }
  // Maintenance spends biomass carbon; its structural nutrients return to the mineral pool.
  const used = ecoRespire(k, amount * ECO_RATE.algaeRespire);
  if (used) { takeSoluteAmount(k, SOL_ALGAE, used); ecoMinerals(k, used * ECO_QUOTA.n, used * ECO_QUOTA.p); }
  if (!light || temp[k] < ECO_RATE.algaeMinTemp) {
    const dead = takeSoluteAmount(k, SOL_ALGAE, amount * ECO_RATE.algaeDeath);
    ecoDeposit(k, bioTissue(dead, ECO_QUOTA)); return;
  }
  const want = Math.min((255 - sol[k * NSOL + SOL_ALGAE]) * liq[k] / 255, amount * ECO_RATE.algaeGrow * (temp[k] < ECO_RATE.algaeCoolTemp ? 0.5 : 1));
  const n = soluteAmount(k, SOL_FERT) + soluteAmount(k, SOL_AMMONIA), p = soluteAmount(k, SOL_PHOSPHATE);
  const made = ecoFixWater(k, Math.max(0, Math.min(want, n / ECO_QUOTA.n, p / ECO_QUOTA.p)));
  if (!made) return;
  const nitrate = takeSoluteAmount(k, SOL_FERT, made * ECO_QUOTA.n);
  takeSoluteAmount(k, SOL_AMMONIA, made * ECO_QUOTA.n - nitrate); takeSoluteAmount(k, SOL_PHOSPHATE, made * ECO_QUOTA.p);
  addSoluteAmount(k, SOL_ALGAE, made);
}
function ecoYeast(k, growthFraction = ECO_RATE.yeastYield) {
  const have = soluteAmount(k, SOL_SUGAR), c = Math.min(have, liq[k] / 255) * ECO_C.sugar;
  const n = soluteAmount(k, SOL_FERT) + soluteAmount(k, SOL_AMMONIA), p = soluteAmount(k, SOL_PHOSPHATE);
  const aerobic = oxygenIn(k) >= 1;
  const growth = Math.max(0, Math.min(c * (aerobic ? growthFraction : ECO_RATE.anaerobicYeastYield), n / ECO_QUOTA.n, p / ECO_QUOTA.p,
    (ECO_RATE.yeastMax - sol[k * NSOL + SOL_YEAST]) * liq[k] / 255));
  let spent = c;
  if (aerobic) {
    const desired = c - growth, oxygen = oxygenIn(k) * liq[k] / 255 / AIR_CO2_EQ_MG_PER_UNIT;
    if (desired > oxygen) spent *= oxygen / desired;
  } else {
    const roomC = Math.max(0, ECO_RATE.yeastTolerance - sol[k * NSOL + SOL_ETHANOL]) * liq[k] / 255 * ECO_C.ethanol;
    if ((c - growth) * 2 / 3 > roomC) spent *= roomC / ((c - growth) * 2 / 3);
  }
  if (!(spent > 0)) return 0;
  const newYeast = growth * spent / c, metabolism = spent - newYeast;
  takeSoluteAmount(k, SOL_SUGAR, spent / ECO_C.sugar);
  const nitrate = takeSoluteAmount(k, SOL_FERT, newYeast * ECO_QUOTA.n);
  takeSoluteAmount(k, SOL_AMMONIA, newYeast * ECO_QUOTA.n - nitrate); takeSoluteAmount(k, SOL_PHOSPHATE, newYeast * ECO_QUOTA.p);
  addSoluteAmount(k, SOL_YEAST, newYeast);
  if (aerobic) ecoRespire(k, metabolism);
  else {
    const ethanol = metabolism * 2 / 3 / ECO_C.ethanol;
    addSoluteAmount(k, SOL_ETHANOL, ethanol); addSoluteAmount(k, SOL_CO2, metabolism / 3 / ECO_DISSOLVED_C);
    S.accounting.fermentedEthanol = (S.accounting.fermentedEthanol || 0) + ethanol;
    temp[k] += 0.05 * spent / ECO_C.sugar;
  }
  return spent;
}
function ecoAcetify(k) {
  const have = Math.min(soluteAmount(k, SOL_ETHANOL), liq[k] / 255);
  // Ethanol -> acetate retains carbon; oxygen is consumed without respiratory CO2.
  const oxygen = oxygenIn(k) * liq[k] / 255 / AIR_CO2_EQ_MG_PER_UNIT;
  const used = Math.min(have, oxygen / (ECO_C.ethanol / 2));
  if (!(used > 0)) return;
  takeSoluteAmount(k, SOL_ETHANOL, used); addSoluteAmount(k, SOL_ACETATE, used);
  sol[k * NSOL + SOL_O2] += used * (ECO_C.ethanol / 2) / ECO_DISSOLVED_C * 255 / liq[k];
  addSoluteAmount(k, SOL_ACID, used); // acidity indicator, not an additional carbon pool
  S.accounting.acetifiedEthanol = (S.accounting.acetifiedEthanol || 0) + used;
}
function ecoTick() {
  const e = ecoState();
  for (const key of Object.keys(e.oxygenCredit)) {
    const k = +key; if (solid[k] || liq[k]) continue;
    const released = Math.min(e.oxygenCredit[k], Math.max(0, MAX_AIR_OX - airOx[k]) * CARB_PER_OX);
    airOx[k] += released / CARB_PER_OX; e.oxygenCredit[k] -= released;
    if (released) wakeAir(); if (e.oxygenCredit[k] < ECO_RATE.epsilon) delete e.oxygenCredit[k];
  }
  for (const key of Object.keys(e.tissue)) {
    const k = +key, pool = e.tissue[key];
    if (solid[k] !== pool.block) { ecoDeposit(k, pool); delete e.tissue[key]; }
  }
  for (const key of Object.keys(e.comb)) if (solid[key] !== COMB) {
    ecoDeposit(+key, ecoFood(e.comb[key])); delete e.comb[key];
  }
  for (const key of Object.keys(e.nectar)) if (solid[key] !== FLOWER) { ecoDeposit(+key, ecoFood(e.nectar[key])); delete e.nectar[key]; }
  for (const key of Object.keys(e.dead)) {
    const k = +key; if (!e.dead[k] || temp[k] < 0) continue;
    if (!solid[k] && k + W < W * H && !solid[k + W]) {
      ecoDeposit(k + W, e.dead[k]); delete e.dead[k]; continue;
    }
    const water = liq[k] && typ[k] === WATER ? k : k >= W && liq[k - W] && typ[k - W] === WATER ? k - W : k;
    ecoDecay(k, water);
    if (liq[water] && typ[water] === WATER) ecoMethane(k, water);
  }
  for (const key of Object.keys(e.methane)) {
    const k = +key, water = liq[k] && typ[k] === WATER ? k : k - W;
    if (water >= 0 && liq[water] && typ[water] === WATER) ecoFlushMethane(k, water);
  }
}
function ecoDenitrify(k, requested) {
  const e = ecoState(), pool = e.dead[k], carbonPerN = ECO_RATE.nitrateCarbon;
  if (!pool || !pool.c) return 0;
  const n = Math.min(requested, soluteAmount(k, SOL_FERT), pool.c / carbonPerN), carbon = n * carbonPerN;
  const f = carbon / pool.c;
  ecoMinerals(k, pool.n * f, pool.p * f); pool.n *= 1 - f; pool.p *= 1 - f; pool.c -= carbon;
  takeSoluteAmount(k, SOL_FERT, n); addSoluteAmount(k, SOL_CO2, carbon / ECO_DISSOLVED_C); e.nitrogenGas += n;
  return n;
}
function ecoSpore(k, channel) {
  if (channel === SOL_ALGAE && (temp[k] < ECO_RATE.algaeMinTemp || temp[k] > ECO_RATE.algaeMaxTemp || sol[k * NSOL + SOL_SALT] > ECO_RATE.algaeMaxSalt)) return 0;
  // Avoid a sky ray when the existing bank cannot pay. Keep lazy initialization/migration and caller RNG order.
  const existing = S.ecology?.version >= 2 ? S.ecology.inoculum[channel === SOL_ALGAE ? 'algae' : 'yeast'] : null;
  if (existing && !(bioGrowth(existing, 2, ECO_QUOTA) > 0)) return 0;
  if (!skyAbove(k)) return 0;
  const bank = ecoState().inoculum[channel === SOL_ALGAE ? 'algae' : 'yeast'], amount = Math.min(2 * liq[k] / 255, bioGrowth(bank, 2, ECO_QUOTA));
  if (!(amount > 0)) return 0;
  bioTransfer(bank, bioPool(), bioTissue(amount, ECO_QUOTA)); addSoluteAmount(k, channel, amount); return amount;
}
function ecoTreeLeaf(k, wood, target, daylightNow) {
  const source = ecoTissue(wood);
  if (!source) return false;
  if (daylightNow && skyAbove(k)) source.c += fixCarbon(ecoAirBeside(k), 0.05);
  const ground = wood + W;
  if (ground < W * H && (solid[ground] === DIRT || solid[ground] === WETDIRT)) {
    const mineral = ecoState().soil[ground];
    if (mineral) { const n = Math.min(0.01, mineral.n), p = Math.min(0.001, mineral.p); mineral.n -= n; mineral.p -= p; source.n += n; source.p += p; }
  }
  if (target < 0) return false;
  const cost = bioTissue(ECO_COST.leaf, ECO_QUOTA), floor = bioTissue(ECO_COST.wood / 2, ECO_QUOTA);
  if (!bioCanPay(source, bioAdd({ ...cost }, floor))) return false;
  bioTransfer(source, bioPool(), cost); ecoInstallTissue(target, LEAF, cost); return true;
}
function ecoInitializeWorld() {
  const e = ecoState();
  if (e.initialized) return;
  e.initialized = true;
  for (let k = 0; k < W * H; k++) {
    if (ECO_ORGANIC[solid[k]]) ecoTissue(k);
    if (solid[k] === COMB) ecoComb(k);
    if (solid[k] === FLOWER) ecoFlowerNectar(k);
    if (solid[k] === DIRT || solid[k] === WETDIRT || (liq[k] && typ[k] === MUD)) {
      if (!e.soil[k]) { e.soil[k] = ecoIntroduce(bioPool(0, ECO_RATE.soilN, ECO_RATE.soilP));
        const stock = bioTissue(ECO_RATE.soilCarbon, ECO_QUOTA); ecoIntroduce(stock); ecoDeposit(k, stock); }
    }
    if (liq[k] && typ[k] === WATER) {
      addSoluteAmount(k, SOL_FERT, ECO_RATE.waterN * liq[k] / 255);
      addSoluteAmount(k, SOL_PHOSPHATE, ECO_RATE.waterP * liq[k] / 255);
      ecoIntroduce(bioPool(0, ECO_RATE.waterN * liq[k] / 255, ECO_RATE.waterP * liq[k] / 255));
    }
  }
}
function ecoContents(contents, offset, amount) {
  const f = amount / 255, algae = Math.max(0, contents[offset + SOL_ALGAE] || 0), yeast = Math.max(0, contents[offset + SOL_YEAST] || 0);
  return bioPool(f * ((contents[offset + SOL_CO2] || 0) * ECO_DISSOLVED_C + (contents[offset + SOL_SUGAR] || 0) * ECO_C.sugar
    + ((contents[offset + SOL_ETHANOL] || 0) + (contents[offset + SOL_ACETATE] || 0)) * ECO_C.ethanol + algae + yeast),
  f * ((contents[offset + SOL_AMMONIA] || 0) + (contents[offset + SOL_FERT] || 0) + (algae + yeast) * ECO_QUOTA.n),
  f * ((contents[offset + SOL_PHOSPHATE] || 0) + (algae + yeast) * ECO_QUOTA.p));
}
function ecoParcelInventory(kind, amount, contents) {
  const pool = ecoContents(contents, 0, amount);
  if (kind === HONEY) bioAdd(pool, ecoFood(amount));
  if (kind === FERT) pool.n += amount / 255 * 200;
  if (kind === CO2 || kind === METHANE) pool.c += amount * ECO_GAS_C;
  return pool;
}
function ecoPackTile(k) {
  if (ECO_ORGANIC[solid[k]]) ecoTissue(k);
  if (solid[k] === COMB) ecoComb(k);
  const e = ecoState(), packet = { held: held[k], temp: temp[k], latent: latent[k], sol: Array.from(sol.subarray(k * NSOL, (k + 1) * NSOL)),
    total: ecoTileInventory(k) };
  if (e.tissue[k]) packet.tissue = { ...e.tissue[k] };
  if (e.comb[k] !== undefined) packet.honey = e.comb[k];
  if (e.nectar[k] !== undefined) packet.nectar = e.nectar[k];
  if (solid[k] === DIRT || solid[k] === WETDIRT || solid[k] === MOSS) {
    if (e.soil[k]) { packet.soil = { ...e.soil[k] }; bioAdd(packet.total, packet.soil); }
    if (e.dead[k]) { packet.dead = { ...e.dead[k] }; bioAdd(packet.total, packet.dead); }
  }
  return packet;
}
function ecoDetachTile(k, packet) {
  const e = ecoState(); delete e.tissue[k]; delete e.comb[k]; delete e.nectar[k];
  latent[k] = 0;
  if (packet.soil) delete e.soil[k]; if (packet.dead) delete e.dead[k];
}
function ecoLegacyBag(block) {
  const packet = { held: 0, temp: 20, latent: 0, sol: Array(NSOL).fill(0), total: bioPool() };
  if (ECO_ORGANIC[block]) { packet.tissue = { block, ...bioTissue(ECO_ORGANIC[block], ECO_DRY_CARBON.has(block) ? { n: 0, p: 0 } : ECO_QUOTA) }; bioAdd(packet.total, packet.tissue); }
  if (block === COMB) { packet.honey = 255; bioAdd(packet.total, ecoFood(255)); }
  if (block === SUGAR || block === CRISP) packet.total.c += 255 * ECO_C.sugar;
  ecoIntroduce(packet.total); return packet;
}
function ecoMigrateBag(inv) {
  for (const slot of inv?.bag || []) if (!slot.stocks) slot.stocks = Array.from({ length: slot.n }, () => ecoLegacyBag(slot.b));
}
function ecoUnpackTile(k, packet) {
  const e = ecoState(); held[k] = packet.held; temp[k] = packet.temp; latent[k] = packet.latent || 0;
  sol.set(Array.from({ length: NSOL }, (_, i) => packet.sol[i] || 0), k * NSOL);
  if (packet.tissue) ecoInstallTissue(k, packet.tissue.block, packet.tissue);
  if (e.comb[k] !== undefined) { ecoDeposit(k, ecoFood(e.comb[k])); delete e.comb[k]; }
  if (e.nectar[k] !== undefined) { ecoDeposit(k, ecoFood(e.nectar[k])); delete e.nectar[k]; }
  if (packet.honey !== undefined) ecoSetComb(k, packet.honey);
  if (packet.nectar !== undefined) { e.nectar[k] = packet.nectar; held[k] = packet.nectar; }
  if (packet.soil) bioAdd(e.soil[k] || (e.soil[k] = bioPool()), packet.soil);
  if (packet.dead) ecoDeposit(k, packet.dead);
}
function ecoTileInventory(k) {
  const e = ecoState(), block = solid[k], pool = bioPool(), tissue = e.tissue[k];
  if (tissue) bioAdd(pool, tissue);
  else if (ECO_ORGANIC[block]) bioAdd(pool, bioTissue(ECO_ORGANIC[block], ECO_DRY_CARBON.has(block) ? { n: 0, p: 0 } : ECO_QUOTA));
  const volume = liq[k] || (block === ICE ? held[k] || 255 : block === WETDIRT || block === WETSPONGE ? held[k] : 0);
  if (volume) bioAdd(pool, ecoContents(sol, k * NSOL, volume));
  if (liq[k] && typ[k] === HONEY) bioAdd(pool, ecoFood(liq[k]));
  if (liq[k] && typ[k] === FERT) pool.n += liq[k] / 255 * 200;
  if (liq[k] && (typ[k] === CO2 || typ[k] === METHANE)) pool.c += liq[k] * ECO_GAS_C;
  if (block === SUGAR || block === CRISP) pool.c += (held[k] || 255) * ECO_C.sugar;
  if (e.comb[k] !== undefined || block === COMB) bioAdd(pool, ecoFood(e.comb[k] ?? (held[k] || 255)));
  if (e.nectar[k] !== undefined || block === FLOWER) bioAdd(pool, ecoFood(e.nectar[k] ?? held[k]));
  return pool;
}
function ecoEraseTile(k) {
  bioAdd(ecoState().removed, ecoTileInventory(k));
  delete ecoState().tissue[k]; delete ecoState().comb[k]; delete ecoState().nectar[k];
}
function ecoImportTile(k) { ecoIntroduce(ecoTileInventory(k)); if (ECO_ORGANIC[solid[k]]) {
  // Register without a second introduction.
  ecoInstallTissue(k, solid[k], bioTissue(ECO_ORGANIC[solid[k]], ECO_DRY_CARBON.has(solid[k]) ? { n: 0, p: 0 } : ECO_QUOTA));
  if (solid[k] === COMB) ecoSetComb(k, held[k] || 255);
  if (solid[k] === FLOWER) ecoState().nectar[k] = held[k];
} }
function ecoCharcoal(k) {
  const pool = ecoTileInventory(k), e = ecoState();
  delete e.tissue[k]; delete e.comb[k]; delete e.nectar[k];
  ecoInstallTissue(k, CHARCOAL, pool);
}
function ecoRecordEdit(before, after) {
  const e = ecoState();
  for (const key of ['c', 'n', 'p']) {
    const difference = after[key] - before[key];
    if (difference > 0) e.introduced[key] += difference; else e.removed[key] -= difference;
  }
}
function ecoLoseBucket(inv) {
  if (!inv?.bucket) return;
  const b = inv.bucket; bioAdd(ecoState().removed, ecoParcelInventory(b.t, b.a, b.sol)); inv.bucket = null;
}
function ecoInspection(k) {
  const e = ecoState(), dead = e.dead[k]; let text = '';
  if (dead && dead.c > 0.005) text += ` · organic matter ${dead.c.toFixed(2)}`;
  if (solid[k] === COMB) text += ` · honey ${ecoComb(k).toFixed(2)}`;
  const x = (k % W) * T, y = ((k / W) | 0) * T;
  const animal = bodies.find(b => b.bio && b.x < x + T && b.x + b.w > x && b.y < y + T && b.y + b.h > y);
  if (animal) {
    const a = ECO_ANIMALS[animal.kind], food = Math.max(0, animal.bio.c - a.body) / (a.burn * 10800);
    text += ` · ${animal.kind}: food ${food.toFixed(2)} days${animal.starving ? ' · starving' : ''}`;
  }
  return text;
}
function ecoInventory(vegetation = []) {
  const e = ecoState(), total = bioPool();
  for (let k = 0; k < W * H; k++) { bioAdd(total, ecoTileInventory(k)); total.c += airCarb[k]; }
  for (const map of [e.dead, e.soil]) for (const pool of Object.values(map)) bioAdd(total, pool);
  for (const c of Object.values(e.methane)) total.c += c;
  for (const c of Object.values(S.mossSugar)) total.c += c;
  for (const pool of Object.values(e.inoculum)) bioAdd(total, pool); total.n += e.nitrogenGas;
  bioAdd(total, e.riverInventory);
  for (const b of bodies) { if (b.bio) bioAdd(total, b.bio); if (b.load) bioAdd(total, ecoFood(b.load)); }
  for (const b of bodies) {
    ecoMigrateBag(b.inv);
    const bucket = b.inv && b.inv.bucket;
    if (bucket) bioAdd(total, ecoParcelInventory(bucket.t, bucket.a, bucket.sol));
    for (const slot of b.inv?.bag || []) for (const packet of slot.stocks || []) bioAdd(total, packet.total);
  }
  for (const pump of pumps) if (pump.buf) bioAdd(total, ecoParcelInventory(pump.t, pump.buf, pump.sol));
  for (const p of vegetation) bioAdd(total, ecoPlantPool(p));
  return total;
}
export { ECO_DISSOLVED_C, ECO_GAS_C, ECO_ORGANIC, ECO_FOOD_QUOTA, ecoState, ecoIntroduce, ecoDeposit,
  ecoFood, ecoTissue, ecoInstallTissue, ecoComb, ecoSetComb, ecoMeltComb, ecoInitialBody, ecoEnsureBody,
  ecoAirBeside, ecoRespire, ecoFixWater, ecoMinerals, ecoMaintain, ecoFeed, ecoGraze, ecoEatPrey, ecoEatLeaf,
  ecoBirth, ecoSettleBody, ecoSeedPlant, ecoPlantPool, ecoStorePlant, ecoPlantCost, ecoReleasePlant,
  ecoReleaseFlower, ecoNectar, ecoRootMinerals, ecoRootSoil, ecoDecay, ecoMethane, ecoAlgae, ecoYeast,
  ecoAcetify, ecoTick, ecoInitializeWorld, ecoSpore, ecoTreeLeaf, ecoAppetite, ecoDenitrify,
  ecoFlowerNectar, ecoTakeNectar, ecoContents, ecoTileInventory, ecoEraseTile, ecoImportTile, ecoInventory,
  ecoHoneyComb, ecoHoneyCaramel, ecoBurnOrganic, ecoOrganicFuel, ecoRecordEdit, ecoInspection,
  ecoFlushMethane, ecoParcelInventory, ecoPackTile, ecoDetachTile, ecoLegacyBag, ecoMigrateBag, ecoUnpackTile, ecoLoseBucket, ecoOwnLegacyPlant, ecoCharcoal };
