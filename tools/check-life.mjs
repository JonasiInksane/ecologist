import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, box, fill, run } from './test-support.mjs';

const Crt = await import('../js/creatures.js');
const Bd = await import('../js/bodies.js');
const Oxy = await import('../js/oxygen.js');
const Sol = await import('../js/solutes.js');
const { DAY_TICKS } = await import('../js/daynight.js');
const { S, bodies, liq, sol, under } = Wd;

function traceOriginalCrowding() {
  clearWorld(0x9e3779b9 ^ Math.imul(66, 7919));
  S.diagnostics = { deaths: [], deathCounts: {}, births: {} };
  box(40, 47, 52, 47, C.STONE); box(40, 40, 40, 46, C.STONE); box(52, 40, 52, 46, C.STONE);
  fill(41, 42, 51, 46, C.WATER, 20);
  for (let y = 40; y <= 46; y++) for (let x = 40; x <= 52; x++) {
    under[at(x, y)] = 0;
    if (liq[at(x, y)]) sol[at(x, y) * C.NSOL + C.SOL_ALGAE] = 150;
  }
  S.tick = Math.round(0.15 * DAY_TICKS) + DAY_TICKS * 4;
  for (let i = 0; i < 4; i++) Bd.addBody('fish', (42 + i * 2) * C.T, 44 * C.T);
  run(6000);
  console.log(JSON.stringify({ fish: bodies.filter(b => b.kind === 'fish').length, diagnostics: S.diagnostics }, null, 2));
}

if (process.argv.includes('--trace-crowding')) {
  traceOriginalCrowding();
} else {
  clearWorld(22);
  S.diagnostics = { deaths: [], deathCounts: {}, births: {} };
  fill(40, 40, 50, 45, C.WATER, 20);
  const fish = Bd.addBody('fish', 42 * C.T, 42 * C.T);
  assert.equal(Crt.shoal(fish), false, 'a lone fish has no mate');
  Bd.addBody('fish', 43 * C.T, 42 * C.T);
  assert.equal(Crt.shoal(fish), true, 'a nearby mate permits reproduction below capacity');
  Bd.addBody('fish', 44 * C.T, 42 * C.T);
  Bd.addBody('fish', 45 * C.T, 42 * C.T);
  assert.equal(Crt.shoal(fish), false, 'the parent counts toward the local population capacity');

  const k = Crt.centre(fish);
  const sample = { water: fish.w * fish.h, acid: 0, poison: 0, shock: 0, lava: 0 };
  S.timeMode = 'night';
  // Nighttime algal respiration must deplete initially healthy water before a hypoxic death. No oxygen is
  // removed by the fixture after setup; motion and other systems are held out to isolate the cause.
  sol[k * C.NSOL + C.SOL_O2] = (Oxy.OXYGEN_REFERENCE - 6) / Oxy.MG_PER_UNIT;
  sol[k * C.NSOL + C.SOL_ALGAE] = 180;
  Sol.soluteTick();   // refresh the cached daylight flag after selecting night
  let living = true;
  let firstLow = null;
  for (let i = 0; i < 3600 && living; i++) {
    S.tick++;
    if (!(S.tick & 3)) Sol.algae(k, k % C.W, k * C.NSOL);
    if (Oxy.oxygenIn(k) < Oxy.FISH_GASPS && firstLow === null) firstLow = S.tick;
    living = Crt.driveCreature(fish, sample, 1, false, fish.w * fish.h, Bd.addBody);
  }
  assert.equal(living, false);
  const death = S.diagnostics.deaths.at(-1);
  assert.equal(death.cause, 'hypoxia');
  assert.equal(death.night, true);
  assert.ok(death.oxygen < Oxy.FISH_GASPS);
  assert.ok(death.ammonia < 80, 'ammonia remains below its independent lethal threshold');
  assert.ok(firstLow !== null && death.tick - firstLow >= Crt.SUFFOCATE - 1, 'sustained hypoxia precedes death');
  assert.equal(death.temperature, 20);
  const previous = S.diagnostics.deaths.length;
  Crt.recordDeath(fish, k, 'other');
  assert.equal(S.diagnostics.deaths.length, previous, 'one death is recorded once');

  // Identical exposure with an aerated reservoir retains the fish.
  const control = Bd.addBody('fish', 48 * C.T, 42 * C.T), ck = Crt.centre(control);
  sol[ck * C.NSOL + C.SOL_ALGAE] = 180;
  for (let i = 0; i < 3600; i++) {
    if (!(i & 3)) Sol.algae(ck, ck % C.W, ck * C.NSOL);
    sol[ck * C.NSOL + C.SOL_O2] = 0;
    assert.equal(Crt.driveCreature(control, sample, 1, false, control.w * control.h, Bd.addBody), true);
  }
  assert.equal(control.deathCause, undefined);
  // A separate toxicity fixture proves that the two causes are distinguishable.
  sol[ck * C.NSOL + C.SOL_AMMONIA] = 120;
  assert.equal(Crt.driveCreature(control, sample, 1, false, control.w * control.h, Bd.addBody), false);
  assert.equal(S.diagnostics.deaths.at(-1).cause, 'ammonia');

  for (let i = 0; i < Crt.DEATH_HISTORY + 10; i++) Crt.recordDeath({ id: 1000 + i, kind: 'fish' }, k, 'test');
  assert.equal(S.diagnostics.deaths.length, Crt.DEATH_HISTORY, 'death history is bounded');
  assert.equal(S.diagnostics.deathCounts['fish:test'], Crt.DEATH_HISTORY + 10);
  clearWorld();
  assert.deepEqual(S.diagnostics, { deaths: [], deathCounts: {}, births: {} }, 'a new world starts with fresh diagnostics');
  console.log('PASS life diagnostics, local crowding, hypoxia, aerated control and bounded history');
}
