import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, box, fill, step } from './test-support.mjs';
import { diffuse, mixSol, removeCarrier, soluteAmount, soluteTick, precipitateSalt } from '../js/solutes.js';
import { carryHeat } from '../js/sim.js';
import { pumpTick } from '../js/pumps.js';
import { gasIntoAir } from '../js/gases.js';
import { moveIce, swapIce } from '../js/materials.js';
import { sunshine } from '../js/weather.js';
import { rots } from '../js/erosion.js';
import { ECO_DISSOLVED_C, ecoDecay, ecoDeposit } from '../js/ecology.js';
import { bioPool } from '../js/ecology-core.js';
import { fillMatter } from '../js/heat.js';
import { AIR_CAP, LCAP, dissolvedHeatCapacity } from '../js/matter.js';
import { pourBucket, breakBlock } from '../js/explorer.js';
import { oxygenIn, saturation, MG_PER_UNIT } from '../js/oxygen.js';
import { capture, restore, packWorld, unpackWorld, encode, decode } from '../js/snapshot.js';

let checks = 0;
function near(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`); checks++;
}
function total(channel) {
  let amount = 0;
  for (let k = 0; k < Wd.liq.length; k++) if (Wd.liq[k]) amount += soluteAmount(k, channel);
  return amount;
}
// Material sensible heat only: the legacy flow solver does not explicitly advect displaced sub-tile air.
function parcelHeat(amount, kind, temperature, contents, offset = 0) {
  return ((LCAP[kind] || 0) * amount / 255 + dissolvedHeatCapacity(amount, contents, offset)) * temperature;
}
function liquidHeat(k) { return parcelHeat(Wd.liq[k], Wd.typ[k], Wd.temp[k], Wd.sol, k * C.NSOL); }
const a = at(40, 50), b = a + 1;
clearWorld(); fill(40, 50, 40, 50, C.WATER); fill(41, 50, 41, 50, C.WATER, 20, 51);
Wd.sol[a * C.NSOL + C.SOL_SALT] = 100;
for (let i = 0; i < 1000; i++) diffuse(a * C.NSOL, b * C.NSOL);
near(total(C.SOL_SALT), 100, 'unequal-volume diffusion preserves salt');
near(Wd.sol[a * C.NSOL + C.SOL_SALT], Wd.sol[b * C.NSOL + C.SOL_SALT], 'diffusion approaches a shared concentration', 1e-6);

clearWorld(); fill(40, 50, 40, 50, C.WATER); fill(41, 50, 41, 50, C.WATER, 20, 100);
Wd.sol[a * C.NSOL + C.SOL_ETHANOL] = 32.125; Wd.sol[b * C.NSOL + C.SOL_ETHANOL] = 123.456;
const initialAlcohol = total(C.SOL_ETHANOL);
for (let i = 0; i < 1000; i++) {
  mixSol(Wd.sol, b * C.NSOL, Wd.liq[b], Wd.sol, a * C.NSOL, 7); Wd.liq[a] -= 7; Wd.liq[b] += 7;
  mixSol(Wd.sol, a * C.NSOL, Wd.liq[a], Wd.sol, b * C.NSOL, 7); Wd.liq[b] -= 7; Wd.liq[a] += 7;
}
near(total(C.SOL_ETHANOL), initialAlcohol, 'repeated parcel mixing retains fractional alcohol');

clearWorld(); fill(40, 50, 40, 50, C.WATER, 20, 51);
Wd.sol[a * C.NSOL + C.SOL_SUGAR] = 76.5;
const sugarBefore = total(C.SOL_SUGAR), oxygenBefore = total(C.SOL_O2);
near(removeCarrier(a, 25), 25, 'withdraw requested solvent');
near(total(C.SOL_SUGAR), sugarBefore, 'solvent withdrawal retains sugar');
near(total(C.SOL_O2), oxygenBefore, 'solvent withdrawal retains actual oxygen');

clearWorld(); fill(40, 50, 40, 50, C.WATER, 100, 100); Wd.latent[a] = 1234.56789;
carryHeat(a, b, 40, 0); Wd.liq[a] -= 40; Wd.liq[b] = 40; Wd.typ[b] = C.WATER;
near(Wd.latent[a] + Wd.latent[b], 1234.56789, 'flow carries latent energy');
near(Wd.latent[b], 1234.56789 * .4, 'parcel gets its share of latent energy');

clearWorld(); fill(40, 50, 40, 50, C.WATER, 90, 150); fill(41, 50, 41, 50, C.WATER, 10, 100);
Wd.sol[a * C.NSOL + C.SOL_SALT] = 320; Wd.sol[a * C.NSOL + C.SOL_SUGAR] = 140;
const mixingHeat = liquidHeat(a) + liquidHeat(b);
carryHeat(a, b, 50, 100); Wd.liq[a] -= 50; Wd.liq[b] += 50;
near(liquidHeat(a) + liquidHeat(b), mixingHeat, 'ordinary mixing retains carrier and dissolved sensible heat', 1e-4);

clearWorld(); box(38, 49, 42, 51, C.STONE); Wd.S.pressure = false; Wd.S.momentum = false;
for (const k of [a - 1, a, b]) Wd.solid[k] = 0;
fill(39, 50, 39, 50, C.WATER, 20, 192); fill(40, 50, 40, 50, C.WATER);
Wd.sol[(a - 1) * C.NSOL + C.SOL_RED] = 200; Wd.sol[a * C.NSOL + C.SOL_RED] = 100;
Wd.latent[a - 1] = 17; Wd.latent[a] = 29;
const redBefore = total(C.SOL_RED); step();
near(total(C.SOL_RED), redBefore, 'three-way spreading retains ingredients from the higher side');
near(Wd.latent[a - 1] + Wd.latent[a] + Wd.latent[b], 46, 'three-way spreading retains latent energy');

clearWorld(); box(39, 49, 41, 51, C.STONE); Wd.solid[a] = 0;
fill(40, 50, 40, 50, C.WATER, 20, 11); Wd.solid[a - C.W] = C.SALT; Wd.held[a - C.W] = 24;
Wd.sol[a * C.NSOL + C.SOL_SALT] = 220;
const initialSalt = total(C.SOL_SALT) + 24;
for (let i = 0; i < 100; i++) soluteTick();
near(total(C.SOL_SALT) + Wd.held[a - C.W], initialSalt, 'small puddle dissolves only available capacity');
assert.ok(Wd.held[a - C.W] > 22 && Wd.held[a - C.W] < 24); checks++;

clearWorld(); fill(40, 50, 40, 50, C.WATER, 20, 90);
Wd.sol[a * C.NSOL + C.SOL_SALT] = 240; Wd.sol[a * C.NSOL + C.SOL_SUGAR] = 50.25;
const crystalSalt = total(C.SOL_SALT), crystalSugar = total(C.SOL_SUGAR);
const precipitated = precipitateSalt(a, 40, a * C.NSOL);
near(total(C.SOL_SALT) + precipitated, crystalSalt, 'crystal contains exactly the removed salt');
near(total(C.SOL_SUGAR), crystalSugar, 'crystallization retains other ingredients');
near(Wd.liq[a], 90, 'crystallization retains water');

clearWorld(); box(39, 49, 41, 51, C.STONE); Wd.solid[a] = 0;
fill(40, 50, 40, 50, C.WATER); Wd.sol[a * C.NSOL + C.SOL_SALT] = 206;
Wd.solid[a - C.W] = C.GEM; Wd.held[a - C.W] = 24;
for (let i = 0; i < 100; i++) soluteTick();
near(Wd.held[a - C.W], 24, 'salt crystals do not redissolve in saturated brine');
near(total(C.SOL_SALT), 206, 'stable crystals do not change dissolved salt');
Wd.sol[a * C.NSOL + C.SOL_SALT] = 0; // replace the brine with fresh water
for (let i = 0; i < 100; i++) soluteTick();
near(total(C.SOL_SALT), 24, 'fresh water receives the full crystal quantity');
near(Wd.solid[a - C.W], 0, 'fresh water dissolves the crystal');

clearWorld(); const inlet = at(40, 50), outlet = at(60, 50), source = inlet - C.W;
fill(40, 49, 40, 49, C.WATER, 72, 100);
Wd.sol[source * C.NSOL + C.SOL_SALT] = 53.25; Wd.latent[source] = 77.125;
Wd.pumps.push({ in: inlet, out: outlet, on: true, buf: 0, t: 0 });
const pumpSalt = total(C.SOL_SALT); pumpTick();
near(total(C.SOL_SALT) + Wd.pumps[0].sol[C.SOL_SALT] * Wd.pumps[0].buf / 255, pumpSalt, 'pump retains fractional solutes');
near(Wd.latent.reduce((s, n) => s + n, 0) + Wd.pumps[0].latent, 77.125, 'pump retains latent energy');

const snap = capture(); const code = await packWorld(snap); clearWorld(); restore(await unpackWorld(code));
near(total(C.SOL_SALT), pumpSalt, 'world code preserves fractional quantities');
near(Wd.latent.reduce((s, n) => s + n, 0) + Wd.pumps[0].latent, 77.125, 'world code preserves latent energy');
assert.ok(Array.isArray(Wd.pumps[0].sol)); checks++;

clearWorld(); box(59, 49, 61, 51, C.STONE);
fill(40, 49, 40, 49, C.WATER, 90, 100);
Wd.sol[source * C.NSOL + C.SOL_SALT] = 310;
const thermalPump = { in: inlet, out: outlet, on: true, buf: 80, t: C.WATER, temp: 10, latent: 0, sol: Array(C.NSOL).fill(0) };
thermalPump.sol[C.SOL_SUGAR] = 140; Wd.pumps.push(thermalPump);
const bufferHeat = () => parcelHeat(thermalPump.buf, thermalPump.t, thermalPump.temp, thermalPump.sol);
const inletHeat = liquidHeat(source) + bufferHeat(); pumpTick();
near(liquidHeat(source) + bufferHeat(), inletHeat, 'pump intake retains carrier and dissolved sensible heat', 1e-4);
const receiver = outlet - C.W; Wd.solid[receiver] = 0;
fill(60, 49, 60, 49, C.WATER, 25, 200);
const outletHeat = liquidHeat(source) + liquidHeat(receiver) + bufferHeat(); pumpTick();
near(liquidHeat(source) + liquidHeat(receiver) + bufferHeat(), outletHeat, 'partial pump output retains carrier and dissolved sensible heat', 1e-4);
assert.ok(thermalPump.buf > 0 && Wd.liq[receiver] === 255); checks++;

clearWorld(); fill(40, 50, 40, 50, C.WATER, 10, 240);
const hotBucket = { bucket: { t: C.WATER, a: 100, temp: 90, latent: 5, sol: Array(C.NSOL).fill(0) } };
hotBucket.bucket.sol[C.SOL_SALT] = 320; hotBucket.bucket.sol[C.SOL_SUGAR] = 140;
const carriedHeat = () => parcelHeat(hotBucket.bucket.a, hotBucket.bucket.t, hotBucket.bucket.temp, hotBucket.bucket.sol);
const bucketHeat = liquidHeat(a) + carriedHeat(); pourBucket(hotBucket, a);
near(liquidHeat(a) + carriedHeat(), bucketHeat, 'partial bucket pour retains carrier and dissolved sensible heat', 1e-4);
near(Wd.latent[a] + hotBucket.bucket.latent, 5, 'partial bucket pour retains latent energy');

clearWorld(); fill(40, 50, 40, 50, C.WATER, 10, 255);
const legacy = capture(); legacy.version = 1;
const oldTypes = { sol: Uint8Array, airOx: Uint8Array, airCarb: Uint16Array, latent: Float32Array, held: Uint8Array };
for (const [name, Type] of Object.entries(oldTypes)) legacy.arrays[name] = Type.from(legacy.arrays[name]);
legacy.arrays.sol[a * C.NSOL + C.SOL_O2] = 40;
const oldActual = saturation(10, 0) - 40 * MG_PER_UNIT;
// Remove dtype metadata to exercise actual pre-22A binary decoding, not merely a new code carrying old values.
const encoded = encode(legacy), view = new DataView(encoded.buffer), headerLength = view.getUint32(0);
const header = JSON.parse(new TextDecoder().decode(encoded.subarray(4, 4 + headerLength)));
header.arrays = header.arrays.map(([name, length]) => [name, length]);
const oldHeader = new TextEncoder().encode(JSON.stringify(header));
const oldBytes = new Uint8Array(4 + oldHeader.length + encoded.length - 4 - headerLength);
new DataView(oldBytes.buffer).setUint32(0, oldHeader.length); oldBytes.set(oldHeader, 4); oldBytes.set(encoded.subarray(4 + headerLength), 4 + oldHeader.length);
clearWorld(); restore(decode(oldBytes));
near(oxygenIn(a), oldActual, 'legacy byte save migrates actual oxygen');
near(Wd.airOx[a - C.W], 210, 'legacy air array decodes using its old type');

clearWorld(); box(39, 49, 41, 51, C.STONE); Wd.solid[a] = 0;
fill(40, 50, 40, 50, C.OXYGEN, 20, 20); Wd.latent[a] = 12.5;
near(gasIntoAir(a, C.OXYGEN, 3), 0, 'sealed oxygen cannot vanish into its own hidden air');
Wd.solid[b] = 0; Wd.airOx[b] = 999;
near(gasIntoAir(a, C.OXYGEN, 3), 0, 'full headspace postpones gas transfer');
Wd.airOx[b] = 210;
const gasOxygen = Wd.liq[a] * 1000 / 255 + Wd.airOx[b];
const gasAirTemp = Wd.temp[b];
near(gasIntoAir(a, C.OXYGEN, 3), 3, 'oxygen transfers into available headspace');
near(Wd.liq[a] * 1000 / 255 + Wd.airOx[b], gasOxygen, 'visible gas and headspace oxygen conserve their sum');
fillMatter();
near(Wd.latent[a] + (Wd.temp[b] - gasAirTemp) * AIR_CAP, 12.5, 'headspace transfer releases pending energy into air heat', 1e-5);

clearWorld(); Wd.solid[a] = C.ICE; Wd.held[a] = 80; Wd.latent[a] = 15.5;
Wd.sol[a * C.NSOL + C.SOL_SALT] = 35.25; Wd.sol[a * C.NSOL + C.SOL_SUGAR] = 12.75;
moveIce(a, b);
near(Wd.sol[b * C.NSOL + C.SOL_SALT], 35.25, 'drifting ice retains trapped salt');
near(Wd.latent[b], 15.5, 'drifting ice retains latent energy');
fill(40, 50, 40, 50, C.WATER, 20, 140); Wd.sol[a * C.NSOL + C.SOL_SALT] = 7.5; Wd.latent[a] = 3;
swapIce(b, a);
near(Wd.sol[a * C.NSOL + C.SOL_SUGAR], 12.75, 'floating ice retains its sugar through water');
near(Wd.sol[b * C.NSOL + C.SOL_SALT], 7.5, 'water displaced by ice retains its ingredients');
near(Wd.latent[a], 15.5, 'floating ice retains its latent energy');
Wd.under[a] = 0;
const iceRandom = Math.random; Math.random = () => 0;
try { sunshine(); } finally { Math.random = iceRandom; }
near(Wd.liq[a], 80, 'sun thaw returns the frozen carrier');
near(soluteAmount(a, C.SOL_SALT), 35.25 * 80 / 255, 'sun thaw retains trapped salt');
near(soluteAmount(a, C.SOL_SUGAR), 12.75 * 80 / 255, 'sun thaw retains trapped sugar');

clearWorld(); fill(40, 50, 40, 50, C.WATER);
ecoDeposit(a + C.W, bioPool(1, 0.1, 0.01));
const mudOxygen = soluteAmount(a, C.SOL_O2); rots(a + C.W);
near(soluteAmount(a, C.SOL_O2), mudOxygen - 0.02 / ECO_DISSOLVED_C, 'finite sediment respiration consumes actual oxygen');
near(soluteAmount(a, C.SOL_CO2), 0.02 / ECO_DISSOLVED_C, 'sediment respiration credits matching carbon dioxide');
Wd.sol[a * C.NSOL + C.SOL_O2] += mudOxygen;
const mudCarbon = soluteAmount(a, C.SOL_CO2); ecoDecay(a + C.W, a);
near(soluteAmount(a, C.SOL_CO2), mudCarbon, 'anoxic mud cannot respire nonexistent oxygen');

clearWorld();
const bucketSave = capture(); bucketSave.version = 1;
bucketSave.lists.bodies = [{ kind: 'explorer', inv: { bucket: { t: C.WATER, a: 80, temp: 20, sol: Array(16).fill(0) }, bag: [], pick: 0 } }];
bucketSave.lists.bodies[0].inv.bucket.sol[C.SOL_SALT] = 24;
restore(bucketSave); pourBucket(Wd.bodies[0].inv, a);
assert.ok(Wd.sol.subarray(a * C.NSOL, (a + 1) * C.NSOL).every(Number.isFinite)); checks++;
near(soluteAmount(a, C.SOL_SALT), 24 * 80 / 255, 'older bucket channels migrate before pouring');
Wd.liq[a] = 0; Wd.typ[a] = 0; Wd.solid[a] = C.ICE; Wd.held[a] = 80;
breakBlock({ bag: [] }, a);
near(soluteAmount(a, C.SOL_SALT), 24 * 80 / 255, 'pickaxe returns ingredients trapped in ice');
console.log(`PASS ${checks} focused accounting checks`);
