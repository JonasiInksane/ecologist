// Closed transfer and explicitly open device-boundary checks.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
const D = await import('../js/devices.js');
const { soluteAmount } = await import('../js/solutes.js');
const { LCAP, BCAP } = await import('../js/matter.js');
const { beginNets, charged, powerLeft } = await import('../js/power.js');
const { liq, typ, sol, solid, temp, latent, held, S } = Wd;
const k = at(40, 40), up = k - C.W, down = k + C.W, left = k - 1, right = k + 1;
let assertions = 0;
function near(a, b, epsilon = 1e-8) { assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`); assertions++; }
function ok(a, message) { assert.ok(a, message); assertions++; }
function components(cells) { return Array.from({ length: C.NSOL }, (_, i) => cells.reduce((n, o) => n + soluteAmount(o, i), 0)); }
function compareComponents(cells, before) { for (let i = 0; i < C.NSOL; i++) near(components(cells)[i], before[i]); }
function sensible(cells) {
  return cells.reduce((n, o) => n + temp[o] * (LCAP[typ[o]] * liq[o] / 255 + BCAP[C.SALT] * soluteAmount(o, C.SOL_SALT) / 255 + BCAP[C.SUGAR] * soluteAmount(o, C.SOL_SUGAR) / 255), 0);
}

ok(!charged(k), 'a cold first frame has no phantom power from zero-valued generation stamps');
near(powerLeft(k), 0);
beginNets(); ok(!charged(k), 'a rebuilt empty network also has no supplied power');

clearWorld();
solid[k] = C.SPRING; fill(40, 41, 40, 41, C.WATER, 80, 100); sol[down * C.NSOL + C.SOL_SUGAR] = 120;
const oldSugar = soluteAmount(down, C.SOL_SUGAR), springEnergy = sensible([down]);
D.emit(k, { liquid: C.WATER });
near(liq[down], 140); near(soluteAmount(down, C.SOL_SUGAR), oldSugar);
ok(sol[down * C.NSOL + C.SOL_SUGAR] < 120, 'spring water dilutes existing solution');
near(S.accounting.springInputs.carrier[C.WATER], 40);
near(sensible([down]), springEnergy + S.accounting.springInputs.sensibleHeat, 2e-5);

clearWorld(); solid[k] = C.SEPARATOR; solid[left] = solid[right] = solid[down] = C.GLASS;
fill(40, 39, 40, 39, C.WATER, 20); sol[up * C.NSOL + C.SOL_SALT] = 200;
sol[up * C.NSOL + C.SOL_SUGAR] = 50; sol[up * C.NSOL + C.SOL_ETHANOL] = 25;
sol[up * C.NSOL + C.SOL_FERT] = 12; sol[up * C.NSOL + C.SOL_AMMONIA] = 3;
const separator = { store: 250 }, others = components([up]);
for (let i = 0; i < 4; i++) D.separate(k, separator);
near(separator.store + soluteAmount(up, C.SOL_SALT), 450);
near(separator.store, 255); near(soluteAmount(up, C.SOL_SALT), 195);
for (let i = 0; i < C.NSOL; i++) if (i !== C.SOL_SALT) near(soluteAmount(up, i), others[i]);
solid[left] = 0; D.separate(k, separator);
ok(solid[left] === C.SALT, 'supported salt leaves when an output becomes free');
near((held[left] || 255) + separator.store + soluteAmount(up, C.SOL_SALT), 450);

clearWorld(); solid[k] = C.MEMBRANE;
fill(40, 39, 40, 39, C.WATER, 90, 200); fill(40, 41, 40, 41, C.WATER, 20, 20);
sol[up * C.NSOL + C.SOL_SALT] = 80; sol[down * C.NSOL + C.SOL_SALT] = 4;
latent[up] = 17; latent[down] = -2;
const membraneBefore = components([up, down]), membraneEnergy = sensible([up, down]);
D.membrane(k, { liquid: C.WATER });
near(liq[up] + liq[down], 220); compareComponents([up, down], membraneBefore);
near(latent[up] + latent[down], 15); near(sensible([up, down]), membraneEnergy, 2e-5);

clearWorld(); solid[k] = C.MOTOR;
fill(39, 40, 39, 40, C.WATER, 80, 100); fill(41, 40, 41, 40, C.WATER, 20, 40);
sol[left * C.NSOL + C.SOL_ETHANOL] = 90; sol[right * C.NSOL + C.SOL_SUGAR] = 30;
latent[left] = 18; latent[right] = 7;
const motorBefore = components([left, right]), motorEnergy = sensible([left, right]);
D.propel(k, { dir: 2 });
near(liq[left] + liq[right], 140); compareComponents([left, right], motorBefore); near(latent[left] + latent[right], 25);
ok(temp[right] > 20 && temp[right] < 80, 'motor moves temperature with material');
near(sensible([left, right]), motorEnergy, 2e-5);

clearWorld(); solid[k] = C.GEYSER;
fill(40, 41, 40, 41, C.WATER, 88, 100); sol[down * C.NSOL + C.SOL_SALT] = 72; latent[down] = 30;
const waterCells = () => Array.from({ length: liq.length }, (_, o) => o).filter(o => liq[o] && typ[o] === C.WATER);
const geyserBefore = components(waterCells());
D.geyser(k, { erupting: 1, rest: 0 });
const afterGeyser = waterCells();
near(afterGeyser.reduce((n, o) => n + liq[o], 0), 100); compareComponents(afterGeyser, geyserBefore);
near(afterGeyser.reduce((n, o) => n + latent[o], 0), 30);
ok(afterGeyser.some(o => o < k), 'geyser transfers pocket water to its spout');
ok(afterGeyser.every(o => temp[o] <= 88), 'geyser does not reset water to an invented 95 degrees');

clearWorld(); solid[k] = C.DRAIN;
fill(40, 39, 40, 39, C.WATER, 35, 200); sol[up * C.NSOL + C.SOL_SALT] = 80; sol[up * C.NSOL + C.SOL_CO2] = 17;
latent[up] = 40;
const drainedBefore = components([up]), drainedEnergy = sensible([up]);
D.drain(k);
near(liq[up] + S.accounting.drainOutputs.carrier[C.WATER], 200);
for (let i = 0; i < C.NSOL; i++) near(soluteAmount(up, i) + S.accounting.drainOutputs.solutes[i], drainedBefore[i]);
near(latent[up] + S.accounting.drainOutputs.latentHeat, 40);
near(sensible([up]) + S.accounting.drainOutputs.sensibleHeat, drainedEnergy, 2e-5);

clearWorld(); fill(40, 40, 40, 40, C.WATER, 50, 180); fill(40, 39, 40, 39, C.WATER, 20, 200);
sol[k * C.NSOL + C.SOL_SALT] = 50; latent[k] = 22;
const gate = { open: true };
ok(D.setGate(k, gate, false) === false && gate.open, 'gate stays open when its liquid cannot be displaced');
near(liq[k], 180); near(liq[up], 200); near(latent[k], 22);
liq[up] = 70;
const gateBefore = components([k, up]), gatePhase = latent[k] + latent[up];
ok(D.setGate(k, gate, false) && !gate.open, 'gate can close after capacity becomes available');
near(liq[k], 0); near(liq[up], 250); compareComponents([k, up], gateBefore); near(latent[up], gatePhase);

console.log(`Device accounting checks passed (${assertions} assertions).`);
