// Clear-ice visibility and actual finite solute-engine photosynthesis, isolated from heat/phase changes.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill } from './test-support.mjs';
import { ECO_RATE } from '../js/ecology-data.js';
import { ECO_DISSOLVED_C, ecoInventory, ecoState } from '../js/ecology.js';
import { OXYGEN_REFERENCE, MG_PER_UNIT, skyAbove, skyAir } from '../js/oxygen.js';
import { plants } from '../js/plants.js';
import { addSoluteAmount, soluteAmount, soluteTick } from '../js/solutes.js';
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function near(a, b, message) { ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`); }
function fixture(roof, { mode = 'day', carbon = 0.005, oxygen = 9.1, phosphate = 1 } = {}) {
  clearWorld(73); Wd.S.timeMode = mode;
  fill(40, 50, 40, 50, C.WATER, 12, 127);
  const k = at(40, 50), ceiling = k - C.W;
  Wd.solid[ceiling] = roof; if (roof === C.ICE) Wd.held[ceiling] = 255;
  addSoluteAmount(k, C.SOL_ALGAE, 10); addSoluteAmount(k, C.SOL_FERT, 10);
  addSoluteAmount(k, C.SOL_PHOSPHATE, phosphate); addSoluteAmount(k, C.SOL_CO2, carbon / ECO_DISSOLVED_C);
  Wd.sol[k * C.NSOL + C.SOL_O2] = (OXYGEN_REFERENCE - oxygen) / MG_PER_UNIT;
  return { k, ceiling };
}
for (const roof of [C.ICE, C.GLASS, C.SNOW, C.STONE]) {
  const { k, ceiling } = fixture(roof), transmitting = roof === C.ICE || roof === C.GLASS;
  ok(skyAbove(k) === transmitting, `roof ${roof} has the declared daylight visibility`);
  ok(!skyAir(k), 'transmitted light does not open the finite gas boundary');
  const before = ecoInventory(plants), introduced = { ...ecoState().introduced };
  const dissolved = soluteAmount(k, C.SOL_CO2) * ECO_DISSOLVED_C, algae = soluteAmount(k, C.SOL_ALGAE);
  soluteTick();
  const fixed = Wd.S.accounting.photosynthesisWaterC ?? 0, after = ecoInventory(plants);
  ok(transmitting ? fixed > 0 : fixed === 0, `roof ${roof} gates actual solute-engine photosynthesis`);
  ok(fixed <= dissolved + algae * ECO_RATE.algaeRespire + 1e-9, 'fixation is bounded by existing carbon plus measured-substrate respiration');
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `roof ${roof} retains total ${key}`);
  assert.deepEqual(ecoState().introduced, introduced); checks++;
  ok(Wd.solid[ceiling] === roof, 'the optical check does not melt or remove its roof');
}
for (const options of [{ mode: 'night' }, { carbon: 0, oxygen: 0 }, { phosphate: 0, oxygen: 0 }]) {
  const { k } = fixture(C.ICE, options), before = ecoInventory(plants);
  soluteTick();
  near(Wd.S.accounting.photosynthesisWaterC ?? 0, 0, 'clear ice cannot grant absent light/carbon/nutrients');
  const after = ecoInventory(plants); for (const key of ['c', 'n', 'p']) near(after[key], before[key], `limited control retains ${key}`);
  ok(skyAbove(k), 'resource-limited control still has a physically transmitting ice roof');
}
{
  const { k, ceiling } = fixture(C.ICE);
  Wd.solid[ceiling - C.W] = C.SNOW;
  ok(!skyAbove(k), 'snow over clear ice still blocks modeled daylight');
  soluteTick(); near(Wd.S.accounting.photosynthesisWaterC ?? 0, 0, 'snow-covered ice supplies no modeled photosynthesis');
}
console.log(`${checks} clear-ice light and finite photosynthesis checks pass`);
process.exit(0);
