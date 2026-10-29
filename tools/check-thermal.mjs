// Focused, deterministic checks for the Phase 22A thermal/component contract.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
const Heat = await import('../js/heat.js');
const Fire = await import('../js/fire.js');
const Sol = await import('../js/solutes.js');
const Matter = await import('../js/matter.js');
const { liq, typ, temp, sol, solid, held, fire, latent, airOx, airCarb, S } = Wd;
const k = at(30, 30), up = k - C.W;
let assertions = 0;
function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by ${actual - expected}`); assertions++;
}
function ok(value, message) { assert.ok(value, message); assertions++; }
function mixture(amount = 100, temperature = 115) {
  clearWorld(); fill(30, 30, 30, 30, C.WATER, temperature, amount);
  sol[k * C.NSOL + C.SOL_ETHANOL] = 36;
  sol[k * C.NSOL + C.SOL_SALT] = 100;
  sol[k * C.NSOL + C.SOL_SUGAR] = 50;
  sol[k * C.NSOL + C.SOL_CO2] = 12.5;
}
function total(i) { return Sol.soluteAmount(k, i) + Sol.soluteAmount(up, i); }

mixture();
const components = Array.from({ length: C.NSOL }, (_, i) => total(i));
const beforeEnergy = Heat.phaseInventory(k), beforeCarrier = liq[k];
const moved = Heat.distil(k, k * C.NSOL);
ok(moved > 0, 'heated mixture produces a vapor parcel');
ok(moved > 8, 'available heat can evaporate more than the old tiny parcel cap');
near(liq[k] + liq[up], beforeCarrier);
for (let i = 0; i < C.NSOL; i++) near(total(i), components[i]);
near(Heat.phaseInventory(k) + Heat.phaseInventory(up), beforeEnergy, 2e-5);
ok(sol[up * C.NSOL + C.SOL_ETHANOL] > 36 && sol[up * C.NSOL + C.SOL_ETHANOL] < 255, 'vapor is enriched, not pure ethanol');
near(sol[up * C.NSOL + C.SOL_SALT], 0);
near(sol[up * C.NSOL + C.SOL_SUGAR], 0);
ok(temp[k] < 115, 'vaporization debits source heat');

mixture(5, 180);
const tinySalt = total(C.SOL_SALT), tinySugar = total(C.SOL_SUGAR), tinyAlcohol = total(C.SOL_ETHANOL);
Heat.distil(k, k * C.NSOL);
near(total(C.SOL_SALT), tinySalt); near(total(C.SOL_SUGAR), tinySugar); near(total(C.SOL_ETHANOL), tinyAlcohol);
ok(liq[k] >= 1, 'nonvolatile ingredients retain a carrier until residues fit');

mixture(100, 70);
near(Heat.distil(k, k * C.NSOL), 0); near(liq[k], 100); near(liq[up], 0);
mixture(); solid[up] = C.GLASS;
near(Heat.distil(k, k * C.NSOL), 0); near(liq[k], 100);
mixture(255, Heat.mixtureBoiling(36) + 0.001);
sol[k * C.NSOL + C.SOL_SALT] = sol[k * C.NSOL + C.SOL_SUGAR] = 0;
near(Heat.distil(k, k * C.NSOL), 0);

// Nutrient-bearing bottom water can boil through the column without moving its dissolved minerals.
mixture(100, 180);
fill(30, 28, 30, 29, C.WATER, 20);
sol[k * C.NSOL + C.SOL_PHOSPHATE] = 0.2;
const columnCells = [k, up, up - C.W, up - 2 * C.W];
const columnAmount = i => columnCells.reduce((sum, n) => sum + Sol.soluteAmount(n, i), 0);
const columnComponents = Array.from({ length: C.NSOL }, (_, i) => columnAmount(i));
const columnCarrier = columnCells.reduce((sum, n) => sum + liq[n], 0);
const columnEnergy = columnCells.reduce((sum, n) => sum + Heat.phaseInventory(n), 0);
ok(Heat.distil(k, k * C.NSOL) > 0, 'submerged solution emits vapor into its headspace');
near(typ[up - 2 * C.W], C.STEAM); near(liq[up], 255); near(liq[up - C.W], 255);
near(columnCells.reduce((sum, n) => sum + liq[n], 0), columnCarrier);
for (let i = 0; i < C.NSOL; i++) near(columnAmount(i), columnComponents[i]);
near(columnCells.reduce((sum, n) => sum + Heat.phaseInventory(n), 0), columnEnergy, 2e-5);
near(Sol.soluteAmount(up - 2 * C.W, C.SOL_PHOSPHATE), 0);
mixture(100, 180); fill(30, 29, 30, 29, C.WATER, 20); solid[up - C.W] = C.GLASS;
near(Heat.distil(k, k * C.NSOL), 0); // no vapor teleporting through a solid roof
mixture(100, 180); fill(30, 29, 30, 29, C.OIL, 20);
near(Heat.distil(k, k * C.NSOL), 0); // bubble routing is confined to the water phase

// Mixed, fractional residues must both survive; blocked or unknown products keep the liquid unchanged.
clearWorld(); fill(30, 30, 30, 30, C.WATER, 1000, 1);
Sol.setSoluteAmount(k, C.SOL_SALT, 0.5); Sol.setSoluteAmount(k, C.SOL_SUGAR, 0.25);
ok(Heat.leaveResidue(k), 'final carrier can dry when all products fit');
let salt = 0, sugar = 0;
for (const n of [k, k - 1, k + 1, k + C.W]) {
  if (solid[n] === C.SALT) salt += held[n] || 255;
  if (solid[n] === C.SUGAR) sugar += held[n] || 255;
}
near(salt, 0.5); near(sugar, 0.25); near(liq[up], 1);
// Concentrating a supported ingredient retains its sensible energy, so a normal heater can finish the last drop.
for (const [species, amount, block] of [[C.SOL_SALT, 200, C.SALT], [C.SOL_SUGAR, 120, C.SUGAR]]) {
  clearWorld(); fill(30, 30, 30, 30, C.WATER, 120, 1); Sol.setSoluteAmount(k, species, amount);
  Heat.fillMatter();
  near(Heat.cap[k], Matter.LCAP[C.WATER] / 255 + Matter.AIR_CAP * 254 / 255 + Matter.BCAP[block] * amount / 255, 1e-7);
  const energy = Heat.phaseInventory(k);
  ok(Heat.leaveResidue(k), 'concentrated final drop dries with its existing energy at 120 degrees');
  near(solid[k], block); near(held[k], amount); near(liq[up], 1);
  near(Heat.phaseInventory(up) + temp[k] * Matter.BCAP[block] * amount / 255, energy, 2e-5);
  near(temp[k], temp[up], 2e-5);
}
clearWorld(); fill(30, 30, 30, 30, C.WATER, 1000, 1);
Sol.setSoluteAmount(k, C.SOL_FERT, 0.5);
ok(!Heat.leaveResidue(k), 'unknown residue postpones dry-out'); near(Sol.soluteAmount(k, C.SOL_FERT), 0.5);
clearWorld(); fill(30, 30, 30, 30, C.WATER, 1000, 1);
Sol.setSoluteAmount(k, C.SOL_SILT, 0.5);
ok(!Heat.leaveResidue(k), 'silt retains carrier until dry mass is distinct from dirt pore water');
near(Sol.soluteAmount(k, C.SOL_SILT), 0.5); near(liq[k], 1); near(solid[k], C.AIR);
clearWorld(); fill(30, 30, 30, 30, C.WATER, 1000, 1);
Sol.setSoluteAmount(k, C.SOL_SALT, 1); Sol.setSoluteAmount(k, C.SOL_SUGAR, 1);
solid[k - 1] = solid[k + 1] = solid[k + C.W] = C.GLASS;
ok(!Heat.leaveResidue(k), 'mixed products need space for both species'); near(liq[k], 1);

// A partial pile retains its quantity and heat capacity when it becomes caramel.
clearWorld(); solid[k] = C.SUGAR; held[k] = 0.5; temp[k] = 200;
Heat.fillMatter();
near(Heat.cap[k], Matter.BCAP[C.SUGAR] * 0.5 / 255 + Matter.AIR_CAP * (1 - 0.5 / 255), 1e-8);
Heat.phaseChanges(Math.floor(30 / C.CHUNK) * Wd.CW + Math.floor(30 / C.CHUNK), 1);
near(solid[k], C.CRISP); near(held[k], 0.5);

// Phase completion uses the same occupied material plus remaining-air capacity as the next heat tick.
const chunk = Math.floor(30 / C.CHUNK) * Wd.CW + Math.floor(30 / C.CHUNK);
for (const [fluid, block, transition, perGram, density] of [
  [C.WATER, C.ICE, Heat.MELT_ICE, Matter.L_FUSION_WATER, 1],
  [C.LAVA, C.BASALT, Heat.LAVA_SETS, Matter.L_FUSION_ROCK, 2.7],
  [C.MOLTEN, C.METAL, Heat.CAST_IRON_SETS, Matter.L_FUSION_IRON, 7],
  [C.MSLAG, C.SLAG, Heat.SLAG_SETS, Matter.L_FUSION_ROCK, 2.7]
]) {
  clearWorld(); fill(30, 30, 30, 30, fluid, transition, 1); solid[k + C.W] = C.GLASS;
  const extra = 0.03;
  latent[k] = -(perGram * Matter.LATENT * density / 255 + extra);
  Heat.fillMatter(); Heat.phaseChanges(chunk, 1); Heat.fillMatter();
  near(solid[k], block); near(held[k], 1);
  near((transition - temp[k]) * Heat.cap[k], extra, 1e-5); // Float32 temperatures near 1300 degrees.
}
clearWorld(); fill(30, 30, 30, 30, C.WATER, -3.4, 50); solid[k + C.W] = C.GLASS;
sol[k * C.NSOL + C.SOL_SALT] = 40; sol[k * C.NSOL + C.SOL_SUGAR] = 80;
const frozenSalt = Sol.soluteAmount(k, C.SOL_SALT), frozenSugar = Sol.soluteAmount(k, C.SOL_SUGAR);
const freezes = -40 * Heat.SALT_FREEZE;
temp[k] = freezes; latent[k] = -(Matter.L_FUSION_WATER * Matter.LATENT * 50 / 255 + 0.03);
Heat.fillMatter(); Heat.phaseChanges(chunk, 1); Heat.fillMatter();
near(solid[k], C.ICE); near(held[k], 50);
near(sol[k * C.NSOL + C.SOL_SALT] * held[k] / 255, frozenSalt);
near(sol[k * C.NSOL + C.SOL_SUGAR] * held[k] / 255, frozenSugar);
near(Heat.cap[k], Matter.BCAP[C.ICE] * 50 / 255 + Matter.AIR_CAP * 205 / 255 + (Matter.BCAP[C.SALT] * frozenSalt + Matter.BCAP[C.SUGAR] * frozenSugar) / 255, 1e-7);
near((freezes - temp[k]) * Heat.cap[k], 0.03, 1e-6);

// Spirit uses measured fuel and oxygen, keeps the solvent carrier, and records its carbon/water products.
clearWorld(); fill(30, 30, 30, 30, C.WATER, 20, 80); sol[k * C.NSOL + C.SOL_ETHANOL] = 200;
S.accounting = {};
const ethanolBefore = Sol.soluteAmount(k, C.SOL_ETHANOL);
const neighboring = [up, k - 1, k + 1, k + C.W];
const oxygenBefore = neighboring.reduce((n, t) => n + airOx[t], 0), carbonBefore = neighboring.reduce((n, t) => n + airCarb[t], 0);
const burned = Fire.spiritBurn(k);
ok(burned > 0, 'strong spirit burns with available oxygen');
near(Sol.soluteAmount(k, C.SOL_ETHANOL) + burned, ethanolBefore); near(liq[k], 80);
near(oxygenBefore - neighboring.reduce((n, t) => n + airOx[t], 0), burned * Fire.SPIRIT_OXYGEN);
near(neighboring.reduce((n, t) => n + airCarb[t], 0) - carbonBefore, burned * 20);
near(S.accounting.ethanolBurned, burned); near(S.accounting.ethanolReactionWater, burned * 3);
airOx.fill(0); const left = Sol.soluteAmount(k, C.SOL_ETHANOL);
near(Fire.spiritBurn(k), 0); near(Sol.soluteAmount(k, C.SOL_ETHANOL), left);

for (const fuel of [C.HYDROGEN, C.METHANE]) {
  clearWorld(); fill(30, 30, 30, 30, fuel, 800, 24); airOx.fill(0);
  Fire.fireTick(); near(liq[k], 24); near(typ[k], fuel);
  for (const n of neighboring) airOx[n] = Wd.AIR_OX;
  Fire.fireTick();
  const reacted = S.accounting[fuel === C.HYDROGEN ? 'hydrogenBurned' : 'methaneBurned'] || 0;
  ok(reacted > 0, 'hot gas burns only after oxygen is supplied');
  ok(neighboring.reduce((n, t) => n + airOx[t], 0) < neighboring.length * Wd.AIR_OX, 'gas combustion consumes oxygen');
  const cells = [k, ...neighboring], hydrogen = fuel === C.HYDROGEN;
  near(cells.reduce((n, t) => n + (typ[t] === fuel ? liq[t] : 0), 0) + reacted, 24);
  near(S.accounting.combustionOxygen, reacted * (hydrogen ? 0.5 : 2) * 1000 / 255);
  near(S.accounting.combustionCarbon, hydrogen ? 0 : reacted * 10000 / 255);
  near(cells.reduce((n, t) => n + (typ[t] === C.STEAM ? liq[t] : 0), 0), reacted * (hydrogen ? 1 : 2));
}
clearWorld(); fill(30, 30, 30, 30, C.METHANE, 800, 24); airCarb.fill(10000);
Fire.fireTick(); near(liq[k], 24); near(typ[k], C.METHANE);
near(S.accounting.methaneBurned || 0, 0); // A full carbon-product reservoir cannot accept another reaction.
console.log(`Thermal accounting checks passed (${assertions} assertions).`);
