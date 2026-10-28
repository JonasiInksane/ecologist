// Headless checks for the simulation: builds small scenes on an empty grid, runs ticks, and checks the outcome.
// Run with:
//   npm test                  the quick tier: one or two fast scenes per system, for after every change
//   npm test -- pipes heat    only the scenes whose name contains any of the words (any tier)
//   npm run test:full         every scene, for before publishing
//   npm test -- --list        list the scenes, marking the quick ones
// The scenes are independent, so the run splits them across child processes, one per CPU core, and prints the results
// in scene order with each scene's time. Randomness is seeded per scene, so a run gives the same result every time.
// A stand-in for the page, so the drawing and toolbar modules load: any property or call gives another stand-in.
const fakeCtx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
function stub() {
  return new Proxy(function () {}, {
    get: (f, k) => k === 'getContext' ? () => fakeCtx : k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? undefined : stub(),
    apply: () => stub(), construct: () => stub(), set: () => true,
  });
}
globalThis.document = stub();
globalThis.addEventListener = () => {};
globalThis.Option = function () {};
globalThis.matchMedia = () => ({ matches: false });
let rngState = 1;
Math.random = () => {   // mulberry32
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), rngState | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function reseed(i) { rngState = (0x9e3779b9 ^ Math.imul(i + 1, 7919)) | 0; }

const C = await import('../js/config.js');
const Wd = await import('../js/world.js');
const { step } = await import('../js/sim.js');
const { W, H } = C;
const { solid, liq, typ, temp, sol, bodies, pumps } = Wd;

const { resetWorld } = await import('../js/generate.js');
// Every scene starts from a truly empty world (devices, plants, air, climate, levels, frozen amounts...), so no scene
// depends on which scenes ran before it in the same worker; then the test conventions: no sky, a stone floor.
function clear() {
  resetWorld();
  solid.fill(0); liq.fill(0); typ.fill(0); temp.fill(C.AMBIENT); sol.fill(0); Wd.drop.fill(0); Wd.vel.fill(0); Wd.S.weather = false; Wd.S.momentum = true; Wd.S.pressure = true;
  Wd.under.fill(1); bodies.length = 0; pumps.length = 0;
  for (let x = 0; x < W; x++) solid[(H - 1) * W + x] = C.STONE;
  Wd.wakeAll();
}
const at = (x, y) => y * W + x;
function box(x0, y0, x1, y1, block) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) solid[at(x, y)] = block; Wd.wakeAll(); }
function fill(x0, y0, x1, y1, t, T) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { liq[at(x, y)] = 255; typ[at(x, y)] = t; temp[at(x, y)] = T; } Wd.wakeAll(); }
function run(n) { for (let i = 0; i < n; i++) step(); }
function count(pred) { let n = 0; for (let k = 0; k < W * H; k++) if (pred(k)) n++; return n; }
const scenes = [];
// The quick tier: the fastest scene or two per system (each about 15 s or less), chosen from a timed full run.
const QUICK = new Set([
  'every kind of block draws without errors',
  'a sensor set to one liquid ignores the others',
  'stormwater, brine and metal carry a lever to a floodgate',
  'methane burns in a flash',
  'temperature and depth sensors, pixels, and power fading along long lines',
  'hydrogen burns into steam; mixed with oxygen, hydrogen and methane explode',
  'heat: quicksilver boils, foam breaks, wax and metal melt',
  'a timer switches a spring on and off',
  'climate: height, depth and seasons',
  'logic gates and counters',
  'inks swirl together',
  'a separator splits foam and takes the salt out of brine',
  'nitro explodes from heat, hard landings and power, and sets off more nitro',
  'a sensor opens a floodgate when the water reaches it',
  'momentum: pump jets, waterfalls and whirlpools push things',
  'brine freezes colder, and boiling it away leaves salt',
  'generated worlds have their biomes and layers',
  'a crate on a pressure plate holds a gate open; a drain empties a pool',
  'settled chunks sleep and wake when disturbed',
  'freezing, melting and dissolving keep mass',
  'void ink, mimic, coolant, ferrofluid, fertiliser',
  'snapshots: exact restore, world codes, seeds and undo',
  'the explorer scoops, pours, digs and places',
  'rafts, boats and balloons; air and health',
]);
function scene(name, fn) { scenes.push([name, fn, QUICK.has(name)]); }

let failed = 0;
let current = 0;   // index of the scene running, so a sharded run's lines can be put back in order
function check(name, ok, detail) { console.log(`${current}\t${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) failed++; }

scene('water on hot rock boils into steam', () => {
  clear();
  box(40, 50, 60, 50, C.STONE);
  for (let x = 40; x <= 60; x++) temp[at(x, 50)] = 900;
  fill(45, 46, 55, 49, C.WATER, 20);
  let steam = 0;
  for (let i = 0; i < 20; i++) { run(30); steam = Math.max(steam, count(k => typ[k] === C.STEAM)); }
  check('water on hot rock boils into steam', steam > 0, `${steam} steam tiles at peak`);
});
scene('steam rises and condenses back into water', () => {
  clear();
  box(30, 10, 70, 10, C.STONE);
  fill(45, 40, 55, 42, C.STEAM, 110);
  run(40);
  const rows = []; for (let k = 0; k < W * H; k++) if (typ[k] === C.STEAM) rows.push((k / W) | 0);
  const avgY = rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length);
  check('steam rises', rows.length > 0 && avgY < 40, `average row ${avgY.toFixed(1)}`);
  run(1500);
  check('steam condenses into water', count(k => typ[k] === C.WATER) > 0, `${count(k => typ[k] === C.WATER)} water tiles, ${count(k => typ[k] === C.STEAM)} steam left`);
});
scene('deep lava stays liquid, a thin film hardens into basalt', () => {
  clear();
  box(10, 40, 30, 50, C.STONE); box(12, 40, 28, 49, C.AIR);
  fill(12, 44, 28, 49, C.LAVA, 1000);
  for (let x = 60; x < 80; x++) { liq[at(x, H - 2)] = 30; typ[at(x, H - 2)] = C.LAVA; temp[at(x, H - 2)] = 1000; }
  run(1200);
  const pool = count(k => typ[k] === C.LAVA && ((k % W) < 40));
  const basalt = count(k => solid[k] === C.BASALT && (k % W) >= 40);
  check('deep lava pool stays liquid', pool > 60, `${pool} lava tiles in pool`);
  check('thin lava film hardens', basalt > 0, `${basalt} basalt tiles`);
});
scene('ice melts beside heat and frost freezes water', () => {
  clear();
  box(20, 60, 20, 60, C.ICE);
  for (let x = 18; x <= 22; x++) temp[at(x, 61)] = 0;
  solid[at(21, 60)] = C.STONE; temp[at(21, 60)] = 900;
  run(400);
  check('ice next to hot rock melts', solid[at(20, 60)] !== C.ICE);
  clear();
  box(50, 50, 70, 50, C.STONE); box(50, 40, 50, 49, C.STONE); box(70, 40, 70, 49, C.STONE);
  fill(51, 45, 69, 49, C.WATER, 20);
  fill(51, 44, 54, 44, C.FROST, -40);
  run(600);
  check('frost freezes nearby water', count(k => solid[k] === C.ICE) > 0, `${count(k => solid[k] === C.ICE)} ice tiles`);
});

const Dv = await import('../js/devices.js');
const { addBody } = await import('../js/bodies.js');
const { devices, S } = Wd;
const vol = (x0, x1, y0, y1) => { let v = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v += liq[at(x, y)]; return v; };
function link(a, b) { devices.get(a).targets.push(b); }

scene('a timer switches a spring on and off', () => {
  clear(); devices.clear();
  Dv.placeDevice(C.TIMER, at(10, 60)); Dv.placeDevice(C.SPRING, at(60, 40));
  link(at(10, 60), at(60, 40));
  while (S.tick % 120 !== 0) step();
  run(50);
  const on = vol(0, W - 1, 0, H - 1);
  while (S.tick % 120 !== 65) step();
  const before = vol(0, W - 1, 0, H - 1);
  run(50);
  check('spring pours while the timer is on', on > 0, `${(on / 255).toFixed(1)} tiles`);
  check('spring stops while the timer is off', vol(0, W - 1, 0, H - 1) === before);
});
scene('a sensor opens a floodgate when the water reaches it', () => {
  clear(); devices.clear();
  box(40, 50, 60, 50, C.STONE); box(40, 40, 40, 49, C.STONE); box(60, 40, 60, 49, C.STONE);
  solid[at(60, 44)] = C.AIR; Dv.placeDevice(C.SENSOR, at(60, 44));
  solid[at(50, 50)] = C.AIR; Dv.placeDevice(C.GATE, at(50, 50));
  link(at(60, 44), at(50, 50));
  fill(41, 47, 59, 49, C.WATER, 20);
  run(60);
  check('gate stays shut below the sensor', !devices.get(at(50, 50)).open && vol(0, W - 1, 51, H - 1) === 0);
  fill(41, 43, 59, 46, C.WATER, 20);
  run(300);
  check('gate opens once the water touches the sensor', vol(0, W - 1, 51, H - 1) > 0, `${(vol(0, W - 1, 51, H - 1) / 255).toFixed(1)} tiles drained below`);
});
scene('a crate on a pressure plate holds a gate open; a drain empties a pool', () => {
  clear(); devices.clear();
  Dv.placeDevice(C.PLATE, at(20, H - 2)); Dv.placeDevice(C.GATE, at(30, 30));
  link(at(20, H - 2), at(30, 30));
  run(5);
  check('gate shut with nothing on the plate', !devices.get(at(30, 30)).open);
  addBody('crate', 20 * C.T - 1, (H - 2) * C.T - 14);
  run(60);
  check('crate presses the plate and opens the gate', devices.get(at(30, 30)).open);
  clear(); devices.clear();
  box(70, 50, 90, 50, C.STONE); box(70, 44, 70, 49, C.STONE); box(90, 44, 90, 49, C.STONE);
  fill(71, 46, 89, 49, C.WATER, 20);
  solid[at(80, 50)] = C.AIR; Dv.placeDevice(C.DRAIN, at(80, 50));
  run(600);
  check('drain empties the pool', vol(71, 89, 44, 49) < 255 * 2, `${(vol(71, 89, 44, 49) / 255).toFixed(1)} tiles left`);
});

const { fire, deco } = Wd;
scene('fire: oil ignites, spreads to wood, burns on water, water puts it out', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 50, 40, 50, C.STONE);
  fill(21, 49, 30, 49, C.OIL, 20);
  box(31, 45, 33, 49, C.WOOD);
  temp[at(21, 49)] = 400;
  run(30);
  check('hot oil ignites', count(k => fire[k] > 0) > 0, `${count(k => fire[k] > 0)} tiles burning`);
  run(900);
  check('fire spreads to the wood and burns it away', count(k => solid[k] === C.WOOD) < 15, `${count(k => solid[k] === C.WOOD)} of 15 wood left`);
  check('the oil burns up', count(k => typ[k] === C.OIL && (k % W) < 31 && ((k / W) | 0) <= 49) === 0);   // on the ledge: a hot, runny drop can fall off it
  clear(); fire.fill(0);
  box(50, 50, 70, 50, C.STONE); box(50, 44, 50, 49, C.STONE); box(70, 44, 70, 49, C.STONE);
  fill(51, 47, 69, 49, C.WATER, 20); fill(51, 46, 69, 46, C.OIL, 20);
  temp[at(60, 46)] = 400;
  run(40);
  check('oil burns on top of water', count(k => fire[k] > 0) > 0);
  clear(); fire.fill(0);
  box(50, 50, 70, 50, C.STONE); box(50, 46, 50, 49, C.STONE); box(70, 46, 70, 49, C.STONE);
  fill(51, 49, 69, 49, C.OIL, 400);
  run(20);
  box(51, 48, 69, 48, C.DIRT);
  run(30);
  check('covering burning oil with dirt smothers it', count(k => fire[k] > 0) === 0, `${count(k => fire[k] > 0)} still burning`);
  clear(); fire.fill(0);
  box(20, 55, 22, 62, C.WOOD);
  temp[at(21, 55)] = 400;
  run(60);
  check('wood catches fire', count(k => fire[k] > 0) > 0);
  fill(15, 45, 27, 52, C.WATER, 20);
  const hose = place(C.SPRING, 21, 44); hose.liquid = C.WATER;   // keep pouring, as a hose would
  run(200);
  check('water poured over burning wood puts it out', count(k => fire[k] > 0) === 0 && count(k => solid[k] === C.WOOD) > 0, `${count(k => solid[k] === C.WOOD)} wood left`);
  devices.clear();
});
scene('slime eats dirt; bloomwater grows moss and glowcaps', () => {
  clear(); fire.fill(0); deco.fill(0);
  box(10, 40, 40, 60, C.DIRT); box(20, 45, 24, 47, C.AIR);
  fill(20, 46, 24, 47, C.SLIME, 20);
  const dirt0 = count(k => solid[k] === C.DIRT);
  run(1500);
  check('slime eats dirt', count(k => solid[k] === C.DIRT) < dirt0, `${dirt0 - count(k => solid[k] === C.DIRT)} dirt eaten`);
  clear(); deco.fill(0);
  box(60, 52, 80, 60, C.STONE); box(60, 50, 80, 51, C.DIRT); box(64, 48, 76, 51, C.AIR); box(64, 52, 76, 52, C.STONE);
  fill(64, 50, 76, 51, C.BLOOM, 20);
  run(1500);
  check('bloomwater turns stone to moss', count(k => solid[k] === C.MOSS) > 0, `${count(k => solid[k] === C.MOSS)} moss`);
  check('bloomwater sprouts glowcaps', count(k => deco[k]) > 0, `${count(k => deco[k])} glowcaps`);
});
scene('pressure levels a U-bend', () => {
  clear(); fire.fill(0);
  box(38, 30, 54, 60, C.STONE);
  box(40, 30, 42, 57, C.AIR); box(50, 30, 52, 57, C.AIR); box(40, 55, 52, 57, C.AIR);
  fill(40, 34, 42, 57, C.WATER, 20); fill(43, 55, 52, 57, C.WATER, 20);
  const topRow = (x0, x1) => { for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (liq[at(x, y)] > 128) return y; return H; };
  S.pressure = false; run(400);
  const offGap = topRow(50, 52) - topRow(40, 42);
  S.pressure = true; run(3000); S.pressure = false;
  const onGap = topRow(50, 52) - topRow(40, 42);
  check('without pressure the arms stay uneven', offGap > 10, `gap ${offGap} rows`);
  check('with pressure the arms level out', onGap <= 2, `gap ${onGap} rows`);
});

scene('settled chunks sleep and wake when disturbed', () => {
  clear(); fire.fill(0); devices.clear();
  box(20, 100, 60, 100, C.STONE); box(20, 90, 20, 99, C.STONE); box(60, 90, 60, 99, C.STONE);
  fill(21, 95, 59, 99, C.WATER, 20);
  run(400);
  const asleep = Wd.awake.reduce((n, v) => n + (v === 0), 0);
  const before = vol(21, 59, 90, 99);
  check('a settled world falls asleep', asleep > Wd.awake.length * 0.9, `${asleep} of ${Wd.awake.length} chunks asleep`);
  solid[at(40, 100)] = C.AIR; Wd.markDirty(40, 100);
  run(300);
  check('digging under the pool wakes it and it drains', vol(21, 59, 90, 99) < before * 0.5, `${(vol(21, 59, 90, 99) / 255).toFixed(1)} of ${(before / 255).toFixed(1)} tiles left`);
});

// ---- mixing: dissolved contents, brine, inks, brewing, foam ----
const N = C.NSOL;
const solAt = (k, i) => sol[k * N + i];
function setSol(x0, y0, x1, y1, i, v) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sol[at(x, y) * N + i] = v; }
function avgSol(x0, y0, x1, y1, i) { let s = 0, n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (liq[at(x, y)]) { s += solAt(at(x, y), i); n++; } return n ? s / n : 0; }
function tank(x0, y0, x1, y1) { box(x0, y1 + 1, x1, y1 + 1, C.STONE); box(x0, y0, x0, y1, C.STONE); box(x1, y0, x1, y1, C.STONE); }

scene('salt dissolves into brine, which sinks under fresh water', () => {
  clear(); fire.fill(0); devices.clear();
  tank(40, 30, 60, 50);
  box(41, 50, 59, 50, C.SALT);
  fill(41, 38, 59, 49, C.WATER, 20);
  const salt0 = count(k => solid[k] === C.SALT);
  run(600);
  check('water dissolves salt blocks', count(k => solid[k] === C.SALT) < salt0, `${salt0 - count(k => solid[k] === C.SALT)} of ${salt0} dissolved`);
  check('the water turns salty', avgSol(41, 38, 59, 50, C.SOL_SALT) > 5, `average salt ${avgSol(41, 38, 59, 50, C.SOL_SALT).toFixed(1)}`);
  clear();
  tank(70, 30, 90, 50);
  fill(71, 41, 89, 50, C.WATER, 20);
  fill(71, 31, 89, 40, C.WATER, 20); setSol(71, 31, 89, 40, C.SOL_SALT, 200);
  run(400);
  const top = avgSol(71, 31, 89, 40, C.SOL_SALT), bottom = avgSol(71, 41, 89, 50, C.SOL_SALT);
  check('brine sinks under fresh water', bottom > top + 40, `bottom ${bottom.toFixed(0)}, top ${top.toFixed(0)}`);
});
scene('brine freezes colder, and boiling it away leaves salt', () => {
  clear();
  tank(20, 40, 30, 50); tank(40, 40, 50, 50);
  fill(21, 46, 29, 50, C.WATER, -12); fill(41, 46, 49, 50, C.WATER, -12);
  setSol(41, 46, 49, 50, C.SOL_SALT, 220);
  for (let i = 0; i < 40; i++) { for (let y = 38; y <= 51; y++) for (let x = 18; x <= 52; x++) temp[at(x, y)] = -12; step(); }
  check('fresh water freezes at -12°', count(k => solid[k] === C.ICE && (k % W) < 35) > 20);
  check('brine stays liquid at -12°', count(k => solid[k] === C.ICE && (k % W) > 35) === 0 && count(k => typ[k] === C.WATER && (k % W) > 35) > 20);
  clear();
  box(60, 50, 80, 50, C.STONE);
  fill(65, 49, 75, 49, C.WATER, 20); setSol(65, 49, 75, 49, C.SOL_SALT, 255);
  for (let i = 0; i < 300; i++) { for (let x = 60; x <= 80; x++) temp[at(x, 50)] = 600; step(); }
  check('boiling brine leaves salt behind', count(k => solid[k] === C.SALT) > 0, `${count(k => solid[k] === C.SALT)} salt blocks`);
});
scene('inks swirl together', () => {
  clear();
  tank(40, 40, 60, 50);
  fill(41, 44, 50, 50, C.WATER, 20); setSol(41, 44, 50, 50, C.SOL_RED, 255);
  fill(51, 44, 59, 50, C.WATER, 20); setSol(51, 44, 59, 50, C.SOL_BLUE, 255);
  run(400);
  const both = count(k => typ[k] === C.WATER && solAt(k, C.SOL_RED) > 20 && solAt(k, C.SOL_BLUE) > 20);
  check('red and blue ink mix where they meet', both > 5, `${both} purple tiles`);
  check('they have not evened out completely', avgSol(41, 44, 45, 50, C.SOL_RED) > avgSol(55, 44, 59, 50, C.SOL_RED) + 20);
});
scene('warm water dissolves honey; brewing tonic and frost', () => {
  clear();
  tank(20, 40, 30, 50); tank(40, 40, 50, 50);
  fill(21, 48, 29, 50, C.HONEY, 20); fill(21, 44, 29, 47, C.WATER, 70);
  fill(41, 48, 49, 50, C.HONEY, 20); fill(41, 44, 49, 47, C.WATER, 2);
  run(200);
  check('water dissolves honey into sugar', avgSol(21, 40, 29, 50, C.SOL_SUGAR) > 10 && count(k => solid[k] === C.COMB && (k % W) < 35) === 0, `average sugar ${avgSol(21, 40, 29, 50, C.SOL_SUGAR).toFixed(0)}`);
  check('icy water sets honey into honeycomb', count(k => solid[k] === C.COMB && (k % W) > 35) > 0);
  clear();
  tank(60, 40, 70, 50);
  fill(61, 46, 69, 50, C.WATER, 90); setSol(61, 46, 69, 50, C.SOL_SUGAR, 120); setSol(61, 46, 69, 50, C.SOL_ESSENCE, 120);
  for (let i = 0; i < 400; i++) { for (let x = 60; x <= 70; x++) temp[at(x, 51)] = 90; for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) temp[k] = 90; step(); }
  check('sugar and essence brewed past 80° become tonic', count(k => typ[k] === C.TONIC) > 10, `${count(k => typ[k] === C.TONIC)} tonic tiles`);
  clear();
  tank(80, 40, 90, 50);
  fill(81, 46, 89, 50, C.WATER, -3); setSol(81, 46, 89, 50, C.SOL_SALT, 120); setSol(81, 46, 89, 50, C.SOL_ESSENCE, 120);
  for (let i = 0; i < 400; i++) { for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) temp[k] = -3; step(); }
  check('salt and essence chilled below 0° become frost', count(k => typ[k] === C.FROST) > 40, `${count(k => typ[k] === C.FROST)} of 45 tiles became frost`);
  clear();
  tank(100, 40, 110, 50);
  fill(101, 46, 105, 50, C.WATER, 20); fill(106, 46, 109, 50, C.BLOOM, 20);
  run(100);
  check('bloomwater dissolves into water as essence', count(k => typ[k] === C.BLOOM) === 0 && avgSol(101, 40, 109, 50, C.SOL_ESSENCE) > 60);
});
scene('churned oil and water make foam, which separates again', () => {
  clear(); devices.clear();
  tank(40, 30, 60, 50);
  fill(41, 36, 59, 50, C.WATER, 20);
  box(10, 40, 20, 50, C.STONE); box(11, 40, 19, 49, C.AIR); fill(11, 41, 19, 49, C.OIL, 20);
  solid[at(15, 50)] = C.PUMP_IN; solid[at(50, 50)] = C.PUMP_OUT;
  pumps.push({ in: at(15, 50), out: at(50, 50), on: true, buf: 0, t: 0, active: 0, shown: 0 });
  run(200);
  const foam = count(k => typ[k] === C.FOAM);
  check('a pump forcing oil into water churns foam', foam > 5, `${foam} foam tiles`);
  pumps[0].on = false;
  run(6000);
  const left = count(k => typ[k] === C.FOAM);
  let oilY = 0, oilN = 0, watY = 0, watN = 0;
  for (let k = 0; k < W * H; k++) { const x = k % W; if (x < 41 || x > 59) continue; if (typ[k] === C.OIL) { oilY += (k / W) | 0; oilN++; } else if (typ[k] === C.WATER) { watY += (k / W) | 0; watN++; } }
  check('foam separates back out', left < foam / 4, `${left} foam left`);
  check('the oil ends up on top of the water', oilN > 0 && oilY / oilN < watY / watN, `oil row ${(oilY / Math.max(1, oilN)).toFixed(1)}, water row ${(watY / watN).toFixed(1)}`);
});

// ---- powders: sand, salt, mud, glass ----
scene('sand piles up, sinks, turns to mud, glass and brick', () => {
  clear(); devices.clear();
  box(40, 30, 40, 49, C.SAND);
  run(200);
  let x0 = W, x1 = 0, top = H;
  for (let k = 0; k < W * H; k++) if (solid[k] === C.SAND) { x0 = Math.min(x0, k % W); x1 = Math.max(x1, k % W); top = Math.min(top, (k / W) | 0); }
  check('a column of sand slumps into a sloped pile', x1 - x0 >= 6 && H - 2 - top < 15, `${x1 - x0 + 1} wide, ${H - 1 - top} tall`);
  clear();
  tank(60, 40, 70, 60);
  fill(61, 45, 69, 60, C.WATER, 20);
  box(64, 35, 66, 37, C.SAND);
  run(30);
  const sunk = count(k => solid[k] === C.SAND && ((k / W) | 0) > 45);
  check('sand sinks through water', sunk > 0, `${sunk} grains below the surface`);
  run(1500);
  check('sand in water turns to mud', count(k => typ[k] === C.MUD) > 0, `${count(k => typ[k] === C.MUD)} mud tiles`);
  clear();
  tank(20, 50, 30, 60);
  fill(21, 58, 29, 60, C.MUD, 20);
  for (let i = 0; i < 300; i++) { for (let x = 20; x <= 30; x++) temp[at(x, 61)] = 400; step(); }
  check('heat dries mud into dirt (firing it into brick takes lava)', count(k => solid[k] === C.DIRT) > 0, `${count(k => solid[k] === C.DIRT)} dirt`);
  clear();
  tank(80, 50, 90, 60);
  fill(81, 57, 89, 60, C.LAVA, 1000);
  box(84, 45, 86, 47, C.SAND);
  run(300);
  check('sand touching lava melts into glass', count(k => solid[k] === C.GLASS) > 0, `${count(k => solid[k] === C.GLASS)} glass`);
});

// ---- power: conductors, logic, generators ----
const { charged } = await import('../js/power.js');
function place(kind, x, y) { solid[at(x, y)] = 0; Dv.placeDevice(kind, at(x, y)); return devices.get(at(x, y)); }

scene('stormwater, brine and metal carry a lever to a floodgate', () => {
  for (const [name, t, salt] of [['stormwater', C.STORM, 0], ['brine', C.WATER, 200], ['fresh water', C.WATER, 0]]) {
    clear(); devices.clear();
    tank(40, 40, 60, 50);
    fill(41, 42, 59, 50, t, 20); setSol(41, 42, 59, 50, C.SOL_SALT, salt);
    const lever = place(C.LEVER, 45, 41);
    const gate = place(C.GATE, 60, 46);
    run(5);
    const shutWhenOff = !gate.open;
    lever.on = true; run(5);
    if (t === C.WATER && !salt) check('fresh water does not conduct', !gate.open);
    else check(`${name} conducts: the gate opens only with the lever on`, shutWhenOff && gate.open && charged(at(50, 48)));
  }
  clear(); devices.clear();
  box(20, 60, 60, 60, C.METAL);
  const lever = place(C.LEVER, 20, 59), drain = place(C.DRAIN, 60, 59);
  run(3);
  const offOk = !drain.active;
  lever.on = true; run(3);
  check('a metal line carries power along its length', offOk && drain.active);
});
scene('live stormwater shocks slime', () => {
  clear(); devices.clear();
  tank(40, 40, 60, 50);
  fill(41, 46, 59, 50, C.STORM, 20); fill(41, 44, 59, 45, C.SLIME, 20);
  const lever = place(C.LEVER, 61, 46);
  solid[at(60, 46)] = C.METAL;   // the lever reaches the pool through the metal in the wall
  run(100);
  const slimeOff = count(k => typ[k] === C.SLIME);
  lever.on = true; run(400);
  check('slime survives dead stormwater', slimeOff > 20, `${slimeOff} slime tiles`);
  check('live stormwater kills the slime touching it', count(k => typ[k] === C.SLIME) < slimeOff / 2, `${count(k => typ[k] === C.SLIME)} left`);
});
scene('logic gates and counters', () => {
  clear(); devices.clear();
  const a = place(C.LEVER, 10, 60), b = place(C.LEVER, 12, 60);
  place(C.AND, 20, 60); place(C.OR, 22, 60); place(C.NOT, 24, 60);
  const gAnd = place(C.GATE, 30, 60), gOr = place(C.GATE, 32, 60), gNot = place(C.GATE, 34, 60);
  link(at(10, 60), at(20, 60)); link(at(12, 60), at(20, 60));
  link(at(10, 60), at(22, 60)); link(at(12, 60), at(22, 60));
  link(at(10, 60), at(24, 60));
  link(at(20, 60), at(30, 60)); link(at(22, 60), at(32, 60)); link(at(24, 60), at(34, 60));
  const states = [];
  for (const [va, vb] of [[false, false], [true, false], [true, true]]) { a.on = va; b.on = vb; run(4); states.push([gAnd.open, gOr.open, gNot.open]); }
  check('AND opens only with both levers on', !states[0][0] && !states[1][0] && states[2][0]);
  check('OR opens with either lever on', !states[0][1] && states[1][1] && states[2][1]);
  check('NOT opens while its lever is off', states[0][2] && !states[1][2]);
  clear(); devices.clear();
  const timer = place(C.TIMER, 10, 60); timer.period = 60;
  const ctr = place(C.COUNTER, 20, 60); ctr.limit = 3;
  link(at(10, 60), at(20, 60));
  while (S.tick % 60 !== 59) step();
  ctr.count = 0;
  const seen = [];
  for (let i = 0; i < 4; i++) { run(60); seen.push(ctr.on); }
  check('a counter turns on at every third pulse', !seen[0] && !seen[1] && seen[2] && !seen[3], seen.join(','));
});
scene('a sensor set to one liquid ignores the others', () => {
  clear(); devices.clear();
  tank(40, 40, 50, 50);
  fill(41, 46, 49, 50, C.WATER, 20);
  const sensor = place(C.SENSOR, 50, 48); sensor.filter = C.OIL;
  run(5);
  const offInWater = !sensor.on;
  fill(41, 46, 49, 50, C.OIL, 20);
  run(5);
  check('an oil-only sensor ignores water and senses oil', offInWater && sensor.on);
});
scene('turbines and water wheels make power', () => {
  clear(); devices.clear();
  box(30, 30, 50, 30, C.STONE);
  const turbine = place(C.TURBINE, 40, 31), gate = place(C.GATE, 60, 60);
  link(at(40, 31), at(60, 60));
  run(5);
  const idle = !turbine.on;
  fill(36, 32, 44, 36, C.STEAM, 110);
  run(30);
  check('steam spins a turbine, which opens its gate', idle && turbine.on && gate.open);
  run(1500);
  check('the turbine condenses the steam back into water', count(k => typ[k] === C.WATER) > 0, `${count(k => typ[k] === C.WATER)} water tiles`);
  clear(); devices.clear();
  const wheel = place(C.WHEEL, 40, H - 2);
  run(5);
  const still = !wheel.on;
  let turning = 0;
  for (let i = 0; i < 60; i++) { liq[at(40, 100)] = 255; typ[at(40, 100)] = C.WATER; Wd.wake(at(40, 100)); step(); if (wheel.on) turning++; }
  check('falling water turns a water wheel', still && turning > 20, `on for ${turning} of 60 ticks`);
  run(600);
  check('the wheel stops once the water settles', !wheel.on);
});
scene('a boiler boils water only while powered', () => {
  clear(); devices.clear();
  tank(40, 50, 50, 60);
  fill(41, 57, 49, 60, C.WATER, 20);
  solid[at(45, 61)] = 0; const boiler = place(C.BOILER, 45, 61);
  const lever = place(C.LEVER, 30, 60); link(at(30, 60), at(45, 61));
  run(600);
  const steamOff = count(k => typ[k] === C.STEAM);
  lever.on = true;
  let steamOn = 0;
  for (let i = 0; i < 40; i++) { run(30); steamOn = Math.max(steamOn, count(k => typ[k] === C.STEAM)); }
  check('a powered boiler boils the water on it', steamOff === 0 && steamOn > 0, `${steamOn} steam tiles at peak`);
});

// ---- pipes and the separator ----
function pipeScene(withValve, filter) {
  clear(); devices.clear();
  tank(20, 30, 31, 40);
  fill(21, 32, 30, 40, C.WATER, 20);
  for (let x = 31; x <= 40; x++) solid[at(x, 40)] = C.PIPE;
  for (let y = 41; y <= 50; y++) solid[at(40, y)] = C.PIPE;
  if (withValve) { const v = place(C.VALVE, 35, 40); v.manual = false; }
  if (filter) { const f = place(C.FILTER, 36, 40); f.liquid = filter; }
  Wd.wakeAll();
  const before = vol(21, 30, 30, 40);
  run(600);
  return vol(21, 30, 30, 40) / before;
}
scene('pipes carry liquid downhill; valves and filters stop it', () => {
  const open = pipeScene(false, 0);
  check('a pipe drains a tank to a lower outlet', open < 0.3, `${(open * 100).toFixed(0)}% left`);
  check('a shut valve stops the flow', pipeScene(true, 0) > 0.99);
  check('a filter for oil holds back water', pipeScene(false, C.OIL) > 0.99);
  check('a filter for water lets it through', pipeScene(false, C.WATER) < 0.3);
  clear(); devices.clear();
  tank(20, 30, 31, 40); tank(50, 30, 61, 40);
  fill(21, 32, 30, 40, C.WATER, 20);
  // a pipe under both floors, opening up into each tank
  box(20, 42, 61, 42, C.STONE);
  for (let x = 25; x <= 55; x++) solid[at(x, 41)] = C.PIPE;
  Wd.wakeAll();
  run(2000);
  const left = vol(21, 30, 30, 40), right = vol(51, 60, 30, 40);
  check('a pipe between two tanks levels them like communicating vessels', Math.abs(left - right) < 255 * 6, `${(left / 255).toFixed(1)} and ${(right / 255).toFixed(1)} tiles`);
});
scene('a separator splits foam and takes the salt out of brine', () => {
  clear(); devices.clear();
  tank(40, 40, 50, 50);
  fill(41, 46, 49, 50, C.FOAM, 20);
  solid[at(45, 51)] = 0; place(C.SEPARATOR, 45, 51);
  run(80);
  check('a separator splits foam into oil and water', count(k => typ[k] === C.FOAM) === 0);
  clear(); devices.clear();
  tank(40, 40, 50, 50);
  fill(41, 42, 49, 50, C.WATER, 20); setSol(41, 42, 49, 50, C.SOL_SALT, 200);
  place(C.SEPARATOR, 50, 45);
  run(400);
  check('a separator desalinates brine and drops the salt', avgSol(41, 42, 49, 50, C.SOL_SALT) < 20 && count(k => solid[k] === C.SALT) > 0, `salt ${avgSol(41, 42, 49, 50, C.SOL_SALT).toFixed(0)}, ${count(k => solid[k] === C.SALT)} salt blocks`);
});
scene('molten metal sets into metal', () => {
  clear(); devices.clear();
  tank(40, 50, 60, 60);
  fill(45, 58, 55, 60, C.MOLTEN, 1400);
  run(1500);
  check('molten metal cools into metal blocks', count(k => solid[k] === C.METAL) > 20 && count(k => typ[k] === C.MOLTEN) === 0, `${count(k => solid[k] === C.METAL)} metal`);
  clear();
  tank(40, 50, 60, 60);
  fill(41, 57, 59, 60, C.WATER, 20);
  fill(48, 52, 52, 53, C.MOLTEN, 1400);
  run(60);
  check('water quenches molten metal at once', count(k => solid[k] === C.METAL) > 0 && count(k => typ[k] === C.STEAM) + count(k => typ[k] === C.WATER) > 0);
});

// ---- gases ----
const avgRow = t => { let s = 0, n = 0; for (let k = 0; k < W * H; k++) if (typ[k] === t) { s += (k / W) | 0; n++; } return n ? s / n : -1; };
scene('gases rise, layer, pool and fade', () => {
  clear(); devices.clear(); fire.fill(0);
  box(30, 20, 50, 20, C.STONE); box(30, 20, 30, 45, C.STONE); box(50, 20, 50, 45, C.STONE);
  fill(31, 40, 49, 42, C.SMOKE, 20); fill(31, 43, 49, 45, C.METHANE, 20);
  run(200);
  check('methane rises above smoke', avgRow(C.METHANE) >= 0 && avgRow(C.METHANE) < avgRow(C.SMOKE), `methane row ${avgRow(C.METHANE).toFixed(1)}, smoke row ${avgRow(C.SMOKE).toFixed(1)}`);
  const smoke = count(k => typ[k] === C.SMOKE);
  run(600);
  check('smoke thins out and disappears', count(k => typ[k] === C.SMOKE) < smoke / 4, `${smoke} → ${count(k => typ[k] === C.SMOKE)} tiles`);
  clear(); Wd.under.fill(0);
  fill(60, 10, 64, 12, C.METHANE, 20);
  run(400);
  check('methane escapes into open sky', count(k => typ[k] === C.METHANE) === 0);
  clear();
  tank(70, 40, 90, 60);
  fill(71, 55, 89, 60, C.WATER, 20);
  fill(76, 30, 84, 32, C.POISON, 20);
  run(40);
  const row = avgRow(C.POISON);
  check('poison gas sinks onto the water', row > 50 && row < 56, `poison row ${row.toFixed(1)}`);
  run(1500);
  check('and the water soaks it up', count(k => typ[k] === C.POISON) === 0, `${count(k => typ[k] === C.POISON)} poison tiles left`);
});
scene('gas sources: fire smokes, slime makes methane, acid on metal makes hydrogen', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 50, 40, 50, C.STONE);
  fill(21, 49, 30, 49, C.OIL, 400);
  let smoke = 0;
  for (let i = 0; i < 20; i++) { run(10); smoke = Math.max(smoke, count(k => typ[k] === C.SMOKE)); }
  check('burning oil gives off smoke', smoke > 0, `${smoke} smoke tiles at peak`);
  clear();
  box(50, 30, 70, 50, C.STONE); box(51, 31, 69, 49, C.AIR);
  fill(51, 46, 69, 49, C.SLIME, 20);
  run(1500);
  check('slime bubbles methane', count(k => typ[k] === C.METHANE) > 0, `${count(k => typ[k] === C.METHANE)} methane tiles`);
  clear();
  tank(80, 40, 90, 50); box(81, 50, 89, 50, C.METAL);
  fill(81, 46, 89, 49, C.ACID, 20);
  let hydrogen = 0;
  for (let i = 0; i < 30; i++) { run(30); hydrogen = Math.max(hydrogen, count(k => typ[k] === C.HYDROGEN)); }
  check('acid eating iron gives off hydrogen', hydrogen > 0, `${hydrogen} hydrogen tiles at peak`);
});
scene('methane burns in a flash', () => {
  clear(); devices.clear(); fire.fill(0);
  box(30, 20, 60, 20, C.STONE); box(30, 20, 30, 30, C.STONE); box(60, 20, 60, 30, C.STONE);
  fill(31, 21, 59, 24, C.METHANE, 20);
  const gas = count(k => typ[k] === C.METHANE);
  temp[at(31, 24)] = 1000;   // a spark
  let burning = 0;
  for (let i = 0; i < 60; i++) { step(); burning = Math.max(burning, count(k => fire[k] > 0)); }
  check('a spark sets the whole methane cloud alight', burning > 20 && count(k => typ[k] === C.METHANE) < gas / 10, `${burning} burning at once, ${count(k => typ[k] === C.METHANE)} of ${gas} left`);
});

// ---- nitro ----
scene('nitro explodes from heat, hard landings and power, and sets off more nitro', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 50, 60, 70, C.STONE); box(38, 55, 42, 57, C.AIR);
  fill(38, 57, 42, 57, C.NITRO, 20);
  run(100);
  const holeBefore = count(k => !solid[k] && (k % W) >= 20 && (k % W) <= 60 && ((k / W) | 0) >= 50 && ((k / W) | 0) <= 70);
  const calm = count(k => typ[k] === C.NITRO);
  temp[at(40, 57)] = 400;
  run(10);
  const holeAfter = count(k => !solid[k] && (k % W) >= 20 && (k % W) <= 60 && ((k / W) | 0) >= 50 && ((k / W) | 0) <= 70);
  check('resting nitro stays put', calm > 3);
  check('heat sets nitro off and the blast breaks stone', count(k => typ[k] === C.NITRO) === 0 && holeAfter > holeBefore + 10, `${holeAfter - holeBefore} blocks broken`);
  clear();
  box(20, 60, 60, 60, C.STONE);
  fill(39, 40, 41, 40, C.NITRO, 20);
  let blew = false;
  for (let i = 0; i < 40 && !blew; i++) { step(); blew = count(k => typ[k] === C.NITRO) === 0; }
  check('nitro dropped from a height explodes on landing', blew);
  clear();
  box(20, 60, 60, 60, C.STONE);
  fill(39, 57, 41, 58, C.NITRO, 20);
  run(200);
  check('nitro poured from low down lands safely', count(k => typ[k] === C.NITRO) > 3);
  clear();
  box(10, 60, 80, 60, C.STONE);
  fill(20, 59, 21, 59, C.NITRO, 20); fill(28, 59, 29, 59, C.NITRO, 20); fill(36, 59, 37, 59, C.NITRO, 20);
  temp[at(20, 59)] = 400;
  run(60);
  check('one blast sets off the nitro next to it in a chain', count(k => typ[k] === C.NITRO) === 0);
  clear(); devices.clear();
  box(20, 60, 60, 60, C.STONE); box(40, 59, 50, 59, C.METAL);
  fill(39, 59, 39, 59, C.NITRO, 20);
  const lever = place(C.LEVER, 50, 58);
  run(30);
  const safe = count(k => typ[k] === C.NITRO) > 0;
  lever.on = true; run(10);
  check('live power touching nitro sets it off', safe && count(k => typ[k] === C.NITRO) === 0);
});
scene('blasts throw crates, spare obsidian and metal, and nitro rests safely under water', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 60, 60, 60, C.OBSIDIAN); box(30, 55, 30, 59, C.METAL);
  fill(40, 59, 40, 59, C.NITRO, 20);
  addBody('crate', 44 * C.T, 58 * C.T - 2);
  run(5);
  const cx = bodies[0].x;
  temp[at(40, 59)] = 400;
  run(20);
  check('a blast throws a nearby crate', bodies.length === 0 || Math.abs(bodies[0].x - cx) > 8, bodies.length ? `moved ${(bodies[0].x - cx).toFixed(0)} px` : 'crate destroyed');
  check('obsidian and metal survive the blast', count(k => solid[k] === C.OBSIDIAN) === 41 && count(k => solid[k] === C.METAL) === 5);
  clear();
  tank(60, 40, 70, 60);
  fill(61, 50, 69, 60, C.WATER, 20);
  fill(63, 30, 67, 31, C.NITRO, 20);
  run(400);
  check('nitro dropped into water sinks to the bottom unharmed', count(k => typ[k] === C.NITRO) > 3 && avgRow(C.NITRO) > avgRow(C.WATER), `nitro row ${avgRow(C.NITRO).toFixed(1)}, water row ${avgRow(C.WATER).toFixed(1)}`);
});

// ---- erosion and weather ----
const { DAY_TICKS } = await import('../js/daynight.js');
const DayNight = await import('../js/daynight.js');
const { startRain } = await import('../js/weather.js');
const Air = await import('../js/air.js');
function setClock(phase) { S.tick = Math.round(((phase - 0.35 + 1) % 1) * DAY_TICKS) + DAY_TICKS * 4; }   // phase 0.5 is noon, 0 midnight

scene('running water carves dirt and drops it as mud where it stills', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 50, 90, 60, C.DIRT);
  const spring = place(C.SPRING, 22, 40); spring.liquid = C.WATER;
  const dirt0 = count(k => solid[k] === C.DIRT);
  let silt = 0;
  for (let i = 0; i < 20; i++) { run(100); silt = Math.max(silt, count(k => typ[k] === C.WATER && solAt(k, C.SOL_SILT) > 10)); }
  check('a waterfall wears away the dirt it lands on', count(k => solid[k] === C.DIRT) < dirt0 - 3, `${dirt0 - count(k => solid[k] === C.DIRT)} dirt washed away`);
  check('the water carries the dirt as silt', silt > 0, `${silt} silty tiles at peak`);
  clear(); devices.clear();
  tank(40, 40, 50, 50);
  fill(41, 42, 49, 50, C.WATER, 20); setSol(41, 47, 49, 50, C.SOL_SILT, 220);
  run(600);
  check('silt settles out of still water as mud on the bottom', count(k => typ[k] === C.MUD) > 3, `${count(k => typ[k] === C.MUD)} mud tiles`);
  run(6000);
  const packed = count(k => (solid[k] === C.DIRT || solid[k] === C.WETDIRT) && ((k / W) | 0) <= 50);   // dirt under water soaks some up
  check('mud under still water packs down into dirt', packed > 0, `${packed} new dirt`);
});
scene('weather: rain, drying puddles and freezing nights', () => {
  clear(); devices.clear(); fire.fill(0); Wd.under.fill(0); S.weather = true;
  Air.resetAir();
  setClock(0.5);
  Air.hum.fill(60);   // humid air for the rain to gather from
  startRain();
  const total = () => vol(0, W - 1, 0, H - 1) + Air.airWater();
  const before = total();
  let rained = 0;
  for (let i = 0; i < 20; i++) { run(50); rained = Math.max(rained, vol(0, W - 1, 0, H - 1) / 255); }
  check('rain falls from the clouds and collects on the ground', rained > 30, `${rained.toFixed(1)} tiles of water at most`);
  check('the water cycle neither makes nor loses water', Math.abs(total() - before) < before * 0.02, `${(before / 255).toFixed(1)} → ${(total() / 255).toFixed(1)} tiles`);
  clear(); Wd.under.fill(0); S.weather = true; Air.resetAir();
  setClock(0.45);
  for (let x = 30; x <= 60; x++) { liq[at(x, H - 2)] = 40; typ[at(x, H - 2)] = C.WATER; }
  Wd.wakeAll();
  run(1200);
  check('the daytime sun dries shallow puddles', count(k => typ[k] === C.WATER) === 0, `${count(k => typ[k] === C.WATER)} wet tiles left`);
  clear(); Wd.under.fill(0); S.weather = true; Air.resetAir();
  setClock(0.9);
  tank(40, 40, 60, 50); fill(41, 42, 59, 50, C.WATER, 20);
  run(2500);
  const ice = count(k => solid[k] === C.ICE), wet = count(k => typ[k] === C.WATER);
  check('a cold night freezes the surface of an open lake', ice >= 10 && wet > 100, `${ice} ice, ${wet} water under it`);
  setClock(0.32);
  run(3800);
  check('the day sun melts it again', count(k => solid[k] === C.ICE) === 0, `${count(k => solid[k] === C.ICE)} ice left`);
  clear(); Wd.under.fill(0); S.weather = false;
  setClock(0.9);
  tank(40, 40, 60, 50); fill(41, 42, 59, 50, C.WATER, 20);
  run(2500);
  check('with weather off, nights stay mild', count(k => solid[k] === C.ICE) === 0);
  S.weather = false;
});

// ---- momentum ----
const { vel } = Wd;
const colHeight = x => { let n = 0; for (let y = 0; y < H; y++) if (liq[at(x, y)] > 128) n++; return n; };
function damBreak(on) {
  clear(); devices.clear(); fire.fill(0); S.momentum = on;
  tank(40, 30, 80, 50);
  fill(41, 31, 55, 50, C.WATER, 20);
  let peak = 0;
  for (let i = 0; i < 300; i++) { step(); peak = Math.max(peak, colHeight(79)); }
  return peak;
}
scene('momentum: waves slosh, then settle and sleep', () => {
  const off = damBreak(false), on = damBreak(true);
  check('a released dam sloshes higher up the far wall with momentum', on > off, `${on} rows with momentum, ${off} without`);
  run(2500);
  let fastest = 0; for (let k = 0; k < W * H; k++) fastest = Math.max(fastest, Math.abs(vel[k]));
  const asleep = Wd.awake.reduce((n, v) => n + (v === 0), 0);
  check('the waves die down and the tank falls asleep', fastest === 0 && asleep > Wd.awake.length * 0.9, `fastest ${fastest.toFixed(3)}, ${asleep} of ${Wd.awake.length} asleep`);
  S.momentum = true;
});
function jet(on) {
  clear(); devices.clear(); S.momentum = on;
  tank(10, 40, 20, 60); fill(11, 45, 19, 60, C.WATER, 20);
  box(29, 100, 29, H - 2, C.STONE);
  solid[at(15, 61)] = C.PUMP_IN; solid[at(30, H - 2)] = C.PUMP_OUT;
  pumps.push({ in: at(15, 61), out: at(30, H - 2), on: true, buf: 0, t: 0, active: 0, shown: 0 });
  run(60);
  let far = 0; for (let x = 31; x < W; x++) if (liq[at(x, H - 2)] || liq[at(x, H - 3)]) far = x;
  return far - 30;
}
scene('momentum: pump jets, waterfalls and whirlpools push things', () => {
  const off = jet(false), on = jet(true);
  check('a pump outlet shoots its water further with momentum', on > off + 3, `${on} tiles with momentum, ${off} without`);
  const shove = on => {
    clear(); devices.clear(); S.momentum = on;
    tank(40, 30, 60, 60); fill(41, 50, 59, 60, C.WATER, 20);
    const spring = place(C.SPRING, 50, 20); spring.liquid = C.WATER;
    addBody('crate', 50 * C.T - 1, 48 * C.T);
    run(80);
    return bodies.length ? bodies[0].y : 0;
  };
  const yOff = shove(false), yOn = shove(true);
  check('a waterfall shoves a floating crate down', yOn > yOff + 3, `crate at ${yOn.toFixed(0)} px with momentum, ${yOff.toFixed(0)} without`);
  const spin = on => {
    clear(); devices.clear(); S.momentum = on;
    tank(40, 40, 80, 50); fill(41, 46, 79, 50, C.WATER, 20);
    solid[at(60, 51)] = 0; place(C.DRAIN, 60, 51);
    addBody('crate', 56 * C.T, 44 * C.T);
    const x0 = bodies[0].x;
    run(40);
    return Math.abs(bodies[0].x - x0);
  };
  const sOff = spin(false), sOn = spin(true);
  check('a drain\'s whirlpool drags a crate round', sOn > sOff + 4, `moved ${sOn.toFixed(0)} px with momentum, ${sOff.toFixed(0)} without`);
  clear(); devices.clear(); S.momentum = true;
  tank(40, 30, 70, 60); fill(41, 50, 69, 60, C.WATER, 20);
  run(50);
  addBody('weight', 55 * C.T, 32 * C.T);
  let wave = 0;
  for (let i = 0; i < 60; i++) { step(); for (let k = 0; k < W * H; k++) wave = Math.max(wave, Math.abs(vel[k])); }
  check('a weight dropped into water throws up a wave', wave > 0.3, `fastest water ${wave.toFixed(2)}`);
});

// ---- real-world reactions ----
scene('heat: quicksilver boils, foam breaks, wax and metal melt', () => {
  clear(); devices.clear(); fire.fill(0);
  tank(20, 50, 30, 60); fill(21, 59, 29, 60, C.QUICK, 400);
  let vapour = 0;
  for (let i = 0; i < 40; i++) { for (let x = 20; x <= 30; x++) temp[at(x, 61)] = 600; step(); vapour = Math.max(vapour, count(k => typ[k] === C.POISON)); }
  check('quicksilver boils into toxic vapour above 357°', vapour > 0, `${vapour} vapour tiles`);
  clear();
  tank(40, 50, 50, 60); fill(41, 58, 49, 60, C.FOAM, 120);
  for (let i = 0; i < 20; i++) { for (let x = 40; x <= 50; x++) temp[at(x, 61)] = 120; step(); }
  check('heated foam breaks: its water boils off and the oil is left', count(k => typ[k] === C.FOAM) <= 2 && count(k => typ[k] === C.OIL) > 5, `${count(k => typ[k] === C.FOAM)} foam, ${count(k => typ[k] === C.OIL)} oil, ${count(k => fire[k] > 0)} burning, ${count(k => typ[k] === C.SMOKE)} smoke`);
  clear();
  box(60, 50, 64, 54, C.COMB); for (let y = 50; y <= 54; y++) for (let x = 60; x <= 64; x++) temp[at(x, y)] = 90;
  run(10);
  check('honeycomb wax melts above 70° and the honey runs', count(k => solid[k] === C.COMB) === 0 && count(k => typ[k] === C.HONEY) > 0);
  clear();
  box(70, 60, 72, 60, C.METAL);
  let melted = 0;
  for (let i = 0; i < 60; i++) { for (let x = 69; x <= 73; x++) { temp[at(x, 59)] = 1700; temp[at(x, 60)] = 1700; } step(); melted = Math.max(melted, count(k => typ[k] === C.MOLTEN)); }
  check('iron melts above 1538°, once it has taken in its latent heat', melted > 0);
});
scene('water: washes smoke away, warms with acid, dissolves caramel; salt melts ice', () => {
  clear(); devices.clear();
  tank(20, 30, 30, 50); fill(21, 40, 29, 48, C.WATER, 20); fill(21, 49, 29, 50, C.SMOKE, 20);
  const gas = () => { let v = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.SMOKE) v += liq[k]; return v; };
  const smoke = gas();
  run(40);
  check('smoke bubbling up through water is washed out', gas() < smoke / 4, `${(smoke / 255).toFixed(1)} → ${(gas() / 255).toFixed(1)} tiles`);
  clear();
  tank(40, 40, 50, 50); fill(41, 46, 49, 50, C.WATER, 20); fill(41, 45, 49, 45, C.ACID, 20);
  run(40);
  let warm = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) warm = Math.max(warm, temp[k]);
  check('diluting acid warms the water', warm > 30, `${warm.toFixed(0)}° at warmest`);
  clear();
  tank(60, 40, 70, 50); box(61, 50, 69, 50, C.CRISP); fill(61, 46, 69, 49, C.WATER, 20);
  run(800);
  check('water dissolves crisp honey into sugar', count(k => solid[k] === C.CRISP) < 9 && avgSol(61, 40, 69, 50, C.SOL_SUGAR) > 3, `${9 - count(k => solid[k] === C.CRISP)} dissolved`);
  clear();
  box(80, 60, 90, 60, C.ICE); box(80, 59, 90, 59, C.SALT);
  run(300);
  check('salt melts ice into brine', count(k => solid[k] === C.ICE) < 11 && count(k => typ[k] === C.WATER && solAt(k, C.SOL_SALT) > 0) > 0, `${11 - count(k => solid[k] === C.ICE)} ice melted`);
  clear();
  tank(100, 50, 104, 59); box(101, 59, 103, 59, C.SAND); fill(101, 55, 103, 58, C.ACID, 20);
  run(400);
  check('acid leaves sand alone', count(k => solid[k] === C.SAND) === 3);
});
scene('mud: washed away, dries in the sun, gives off swamp gas; hot oil smokes; steam scalds', () => {
  clear(); devices.clear(); fire.fill(0);
  box(20, 61, 60, 61, C.STONE); fill(30, 60, 50, 60, C.MUD, 20);
  const spring = place(C.SPRING, 40, 45); spring.liquid = C.WATER;   // a waterfall landing on the mud
  let silty = 0;   // there's no dirt here, so any silt is washed-off mud
  for (let i = 0; i < 20; i++) { run(100); silty = Math.max(silty, count(k => typ[k] === C.WATER && solAt(k, C.SOL_SILT) > 10)); }
  check('running water washes mud away as silt', silty > 5, `${silty} silty tiles at peak`);
  clear(); devices.clear(); Wd.under.fill(0); S.weather = true; Air.resetAir();
  setClock(0.35);
  box(30, 61, 50, 61, C.STONE); fill(30, 60, 50, 60, C.MUD, 20);
  run(2500);
  check('the sun dries mud into dirt', count(k => solid[k] === C.DIRT) > 5, `${count(k => solid[k] === C.DIRT)} dirt`);
  S.weather = false;
  clear(); devices.clear();
  tank(60, 30, 70, 50); fill(61, 50, 69, 50, C.MUD, 20); fill(61, 42, 69, 49, C.WATER, 20);
  run(3000);
  check('mud under still water bubbles up swamp gas', count(k => typ[k] === C.METHANE) > 0, `${count(k => typ[k] === C.METHANE)} methane tiles`);
  clear(); fire.fill(0);
  box(80, 61, 90, 61, C.STONE); fill(81, 60, 89, 60, C.OIL, 220);
  let smoke = 0;
  for (let i = 0; i < 100; i++) { for (let x = 81; x <= 89; x++) temp[at(x, 60)] = 220; step(); smoke = Math.max(smoke, count(k => typ[k] === C.SMOKE)); }
  check('oil hot enough to smoke but not burn gives off smoke', smoke > 0 && count(k => fire[k]) === 0, `${smoke} smoke tiles`);
  clear();
  box(100, 61, 120, 61, C.STONE);
  addBody('explorer', 110 * C.T, 60 * C.T - 12);
  run(5);
  fill(105, 55, 115, 60, C.STEAM, 110);
  run(3);
  check('steam scalds the explorer', bodies[0].ouch > 0);
});

const Lvl = await import('../js/levels.js');
// ---- Phase 6: creatures, plants and puzzle levels ----
const { plantSeed, plants } = await import('../js/plants.js');
const kinds = k => bodies.filter(b => b.kind === k);
scene('fish swim, breed, and die out of water or in acid', () => {
  clear(); devices.clear(); fire.fill(0);
  tank(40, 40, 70, 60); fill(41, 45, 69, 60, C.WATER, 20);
  addBody('fish', 50 * C.T, 55 * C.T); addBody('fish', 52 * C.T, 55 * C.T);
  const first = bodies[0], x0 = first.x;
  let roamed = 0;
  for (let i = 0; i < 60; i++) { run(10); roamed = Math.max(roamed, Math.abs(first.x - x0)); }
  check('fish live and swim about in water', kinds('fish').length >= 2 && roamed > 8, `swam up to ${roamed.toFixed(0)} px away`);
  clear(); bodies.length = 0;
  tank(40, 40, 70, 60); fill(41, 45, 69, 60, C.ACID, 20);
  addBody('fish', 50 * C.T, 55 * C.T);
  run(30);
  check('fish die in acid', kinds('fish').length === 0);
  clear(); bodies.length = 0;
  box(40, 60, 70, 60, C.STONE);
  addBody('fish', 50 * C.T, 58 * C.T);
  run(200);
  const flopping = kinds('fish').length === 1;
  run(400);
  check('stranded fish flop for a while, then die', flopping && kinds('fish').length === 0);
});
scene('salamanders live in lava and die in water; slimelings split and fear salt', () => {
  clear(); devices.clear(); fire.fill(0); bodies.length = 0;
  tank(40, 50, 60, 60); fill(41, 55, 59, 60, C.LAVA, 1000);
  addBody('salamander', 50 * C.T, 57 * C.T);
  run(600);
  check('a salamander lives in lava', kinds('salamander').length === 1);
  clear(); bodies.length = 0;
  box(30, 60, 70, 60, C.STONE);
  addBody('salamander', 50 * C.T, 59 * C.T - 4);
  run(20);
  fill(45, 52, 55, 56, C.WATER, 20);
  let gone = false;
  for (let i = 0; i < 120 && !gone; i++) { step(); gone = kinds('salamander').length === 0; }
  check('water poured on a salamander kills it', gone);
  clear(); bodies.length = 0;
  box(30, 60, 90, 60, C.STONE); fill(40, 59, 60, 59, C.SLIME, 20);
  addBody('slimeling', 50 * C.T, 58 * C.T - 6);
  run(900);
  check('a slimeling soaks up slime and splits in two', kinds('slimeling').length >= 2, `${kinds('slimeling').length} slimelings`);
  clear(); bodies.length = 0;
  box(30, 60, 50, 60, C.STONE); box(42, 59, 50, 59, C.SALT);
  addBody('slimeling', 40 * C.T, 58 * C.T - 6);
  let salted = false;
  for (let i = 0; i < 1500 && !salted; i++) { step(); salted = kinds('slimeling').length === 0; }
  check('salt kills a slimeling that touches it', salted);
  bodies.length = 0;
});
scene('plants drink, grow, wilt and burn', () => {
  clear(); devices.clear(); fire.fill(0); plants.length = 0;
  box(30, 61, 60, 70, C.DIRT); box(40, 61, 44, 63, C.AIR); fill(40, 61, 44, 63, C.WATER, 20);
  plantSeed(at(46, 60));
  run(3000);
  const first = plants.find(p => p.root === at(46, 60));   // grown plants drop seeds, so it may have company
  check('a plant beside water grows tall', first && first.h >= 4, `height ${first ? first.h : 0}`);
  const tall = first.h;
  box(40, 61, 44, 63, C.DIRT);
  for (let i = 0; i < 6 && plants.length; i++) run(1500);
  check('without water it wilts away', plants.length === 0 || plants[0].h < tall, `height ${plants[0] ? plants[0].h : 0}`);
  clear(); plants.length = 0; fire.fill(0);
  box(30, 61, 60, 70, C.DIRT); fill(40, 60, 44, 60, C.WATER, 20);
  plantSeed(at(46, 60)); plants[0].max = 6;
  for (let y = 54; y < 60; y++) solid[at(46, y)] = C.PLANT;
  plants[0].top = at(46, 54); plants[0].h = 7;
  temp[at(46, 56)] = 400;
  run(600);
  check('plants burn', count(k => solid[k] === C.PLANT) < 7);
});
scene('puzzle levels can be solved, and fail when they should', () => {
  const { LEVELS, startLevel, checkLevel } = Lvl;
  const lever = (x, y) => devices.get(at(x, y));
  const play = (i, solve, ticks) => { startLevel(i); checkLevel(); const fresh = !S.level.done && !S.level.failed; solve(); for (let t = 0; t < ticks && !S.level.done && !S.level.failed; t += 30) { run(30); checkLevel(); } return fresh; };
  check('there are nine levels', LEVELS.length === 9);
  check('1. Glassworks: opening the hopper over the lava makes enough glass', play(0, () => { lever(30, 79).on = true; }, 3000) && S.level.done, S.level.text);
  check('2. The cauldron: water, heat, honey and bloomwater brew tonic', play(1, () => {}, 0) && brew(lever), S.level.text);
  check('3. The lower chamber: the valve route fills it safely', play(2, () => { devices.get(at(32, 60)).manual = true; }, 3000) && S.level.done && !S.level.failed, S.level.text);
  check('3. The lower chamber: the floodgate route fails', play(2, () => { lever(26, 79).on = true; }, 3000) && !!S.level.failed, S.level.failed || S.level.text);
  check('4. Save the fish: a shaft dug down from the pond drops them into the lake', play(3, () => { box(37, 53, 41, 84, C.AIR); }, 4000) && S.level.done, S.level.text);
  check('5. Steam power: opening the valve opens the vault', play(4, () => { devices.get(at(50, 55)).manual = true; }, 4000) && S.level.done, S.level.text);
  check('6. Two shafts: digging out the plug fills the high basin', play(5, () => { box(60, 75, 61, 76, C.AIR); }, 6000) && S.level.done, S.level.text);
  check('7. Thunder dome: splitting the brine, then lighting the fuse, blows the vault open', play(6, () => {
    lever(26, 79).on = true; run(2000); temp[at(40, 52)] = 400; Wd.heatWake(at(40, 52));   // fill the dome first
  }, 1500) && S.level.done, S.level.text);
  check('7. Thunder dome: the fuse alone, with no gas made, leaves the wall standing', play(6, () => { temp[at(40, 52)] = 400; Wd.heatWake(at(40, 52)); }, 1500) && !S.level.done, S.level.text);
  check('8. Depth gauge: filling to the mark and shutting the spring', play(7, () => {
    lever(26, 79).on = true;
    for (let i = 0; i < 600 && !devices.get(at(104, 70)).active; i++) run(5);
    lever(26, 79).on = false;
  }, 600) && S.level.done && !S.level.failed, S.level.failed || S.level.text);
  check('8. Depth gauge: leaving the spring running overflows the tank', play(7, () => { lever(26, 79).on = true; }, 5000) && !!S.level.failed, S.level.failed || S.level.text);
  check('9. Furnace: lighting the wood casts metal in the mould', play(8, () => {
    for (const [x, y] of [[58, 64], [59, 64], [62, 64], [63, 64]]) { temp[at(x, y)] = 400; Wd.heatWake(at(x, y)); }   // the wood, from underneath
  }, 6000) && S.level.done, S.level.text);
  S.level = null; S.weather = false;
});
// A scripted brew for the cauldron level: fill, warm, add honey and bloomwater, then hold it between 80° and 100°.
function brew(lever) {
  const { checkLevel } = Lvl;
  const [water, boiler, honey, bloom] = [26, 30, 34, 38].map(x => lever(x, 79));
  const potTemp = () => { let s = 0, n = 0; for (let y = 60; y <= 72; y++) for (let x = 61; x <= 71; x++) if (liq[at(x, y)] && typ[at(x, y)] === C.WATER) { s += temp[at(x, y)]; n++; } return n ? s / n : 0; };
  water.on = true; run(400); water.on = false;
  boiler.on = true;
  for (let i = 0; i < 100 && potTemp() < 60; i++) run(20);
  honey.on = true; run(200); honey.on = false;
  bloom.on = true; run(80); bloom.on = false;
  for (let t = 0; t < 6000 && !S.level.done; t += 20) { boiler.on = potTemp() < 92; run(20); checkLevel(); }
  return S.level.done;
}

// ---- Phase 7: the air, clouds and wind ----
const Clim = await import('../js/climate.js');
const Bio = await import('../js/biomes.js');
const Gen = await import('../js/generate.js');
// An open sky over the whole world with a floor at row 100, weather on, still air, and a fixed wind.
function sky(wind = 0) {
  clear(); devices.clear(); fire.fill(0); bodies.length = 0;
  Clim.resetClimate(); Air.resetAir();
  box(0, 100, W - 1, 100, C.STONE);
  for (let k = 0; k < 100 * W; k++) Wd.under[k] = 0;
  S.weather = true; S.wind = S.windTarget = wind; S.windTimer = 1e9;
}
const cloudCentre = () => { let s = 0, n = 0; for (let c = 0; c < Air.NC; c++) { s += (c % Air.AW) * Air.cloud[c]; n += Air.cloud[c]; } return n ? s / n : -1; };
scene('the air: clouds drift on the wind, smoke too, and mountains cast rain shadows', () => {
  sky(0.8); setClock(0.02);
  for (let cx = 20; cx < 24; cx++) Air.cloud[5 * Air.AW + cx] = 140;
  const c0 = cloudCentre();
  run(240);
  check('clouds drift downwind', cloudCentre() > c0 + 2, `cloud centre from cell ${c0.toFixed(1)} to ${cloudCentre().toFixed(1)}`);
  sky(1); setClock(0.5);
  box(60, 56, 200, 56, C.STONE);   // a ledge for the smoke to gather under (it would otherwise rise out of the sky)
  fill(100, 57, 103, 60, C.SMOKE, 60); for (let y = 57; y <= 60; y++) for (let x = 100; x <= 103; x++) liq[at(x, y)] = 255;
  const sx = () => { let s = 0, n = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.SMOKE) { s += (k % W) * liq[k]; n += liq[k]; } return n ? s / n : 0; };
  const s0 = sx();
  run(80);
  check('smoke in the open drifts downwind', sx() > s0 + 2, `smoke centre from x ${s0.toFixed(1)} to ${sx().toFixed(1)}`);
  sky(0.9); setClock(0.5);
  box(240, 30, 262, 100, C.STONE);   // a mountain
  const ground = 24;   // the row of cells just above the floor
  for (let t = 0; t < 4000; t += 8) { for (let cx = 20; cx < 50; cx++) Air.hum[ground * Air.AW + cx] += 40; run(8); }   // a humid plain upwind
  const windward = vol(170, 239, 0, 99), lee = vol(263, 332, 0, 99);
  check('a mountain gets its rain on the windward side and leaves a dry shadow behind', windward > lee * 2 && windward > 255 * 3, `${(windward / 255).toFixed(1)} tiles windward, ${(lee / 255).toFixed(1)} behind`);
});
scene('fog, snow, lightning and windmills', () => {
  sky(0); setClock(0.02);
  for (let cx = 30; cx < 40; cx++) Air.hum[24 * Air.AW + cx] = 400;
  run(40);
  let fog = 0; for (let cx = 30; cx < 40; cx++) fog += Air.cloud[24 * Air.AW + cx];
  check('a calm, cold night condenses humid air at the ground into fog', fog > 100, `${fog.toFixed(0)} cloud in the ground cells`);
  sky(0); setClock(0.02); Clim.colTemp.fill(-20);   // a night cold all the way down to the ground
  Air.hum.fill(60); Air.seedRain();
  run(300);
  check('below 0° the clouds snow instead of raining', count(k => solid[k] === C.SNOW) > 10 && vol(0, W - 1, 0, 99) < 255 * 5, `${count(k => solid[k] === C.SNOW)} snow`);
  clear(); box(40, 60, 50, 60, C.STONE); box(42, 59, 48, 59, C.SNOW);
  run(400);
  check('snow melts into water above 2°', count(k => solid[k] === C.SNOW) === 0 && count(k => typ[k] === C.WATER) > 0);
  sky(0); setClock(0.5);
  box(100, 80, 103, 99, C.WOOD);
  Air.strike(25, 5);
  run(60);
  check('lightning sets a wooden post alight', count(k => fire[k] > 0) > 0 || count(k => solid[k] === C.WOOD) < 80);
  sky(0); setClock(0.5);
  box(120, 99, 123, 99, C.METAL);
  const gate = place(C.GATE, 124, 99);
  Air.strike(30, 5);
  step();
  check('lightning powers the metal it strikes', gate.open);
  sky(1); setClock(0.5);
  const mill = place(C.WINDMILL, 200, 99);
  run(80);
  const turning = mill.on;
  S.wind = S.windTarget = 0;
  run(200);
  check('a windmill turns in the wind and stops when it drops', turning && !mill.on);
  S.weather = false;
});

// ---- Phase 8: climate and biomes ----
scene('climate: height, depth and seasons', () => {
  clear(); Clim.resetClimate(); S.weather = true;
  setClock(0.5);
  check('the air is colder higher up', Clim.skyTempAt(50, 10) < Clim.skyTempAt(50, 60) - 20);
  S.seed = 7; Gen.generate(); S.weather = true;
  const x = 40, s = Clim.surface[x];
  check('the ground gets warmer with depth', Clim.ambient[(s + 60) * W + x] > Clim.ambient[(s + 5) * W + x] + 15);
  S.tick = Math.round((0.5 - 0.25) * Clim.SEASON_DAYS * 10800); const summer = Clim.skyTempAt(x, 40);
  S.tick = Math.round((1 - 0.25) * Clim.SEASON_DAYS * 10800); const winter = Clim.skyTempAt(x, 40);
  check('summer is warmer than winter', summer > winter + 18, `${summer.toFixed(0)}° against ${winter.toFixed(0)}°`);
  S.weather = false;
});
const FEATURE = {
  grassland: r => countIn(r, k => solid[k] === C.DIRT) > 50,
  forest: r => countIn(r, k => solid[k] === C.WOOD) > 10 && countIn(r, k => solid[k] === C.LEAF) > 10,
  jungle: r => countIn(r, k => solid[k] === C.WOOD) > 20 && countIn(r, k => liq[k] && typ[k] === C.BLOOM) > 0,
  swamp: r => countIn(r, k => liq[k] && typ[k] === C.MUD) > 3,
  desert: r => countIn(r, k => solid[k] === C.SAND) > 100,
  'salt flats': r => countIn(r, k => solid[k] === C.SALT) > 20 && countIn(r, k => typ[k] === C.WATER && solAt(k, C.SOL_SALT) >= 200) > 5,
  badlands: r => countIn(r, k => solid[k] === C.CLAY) > 50 && countIn(r, k => solid[k] === C.BRICK) > 20,
  tundra: r => countIn(r, k => solid[k] === C.PERMAFROST) > 50,
  glacier: r => countIn(r, k => solid[k] === C.ICE) > 50,
  coast: r => count(k => (k % W) >= W - 4 && typ[k] === C.WATER && solAt(k, C.SOL_SALT) >= 200) > 3,
  volcanic: r => [...devices.values()].some(d => d.kind === C.GEYSER) && [...devices.values()].some(d => d.kind === C.VENT) && countIn({ ...r, y1: H - 12 }, k => liq[k] && typ[k] === C.LAVA) > 10,
};
function countIn(r, pred) { let n = 0; for (let y = r.y0 ?? 0; y <= (r.y1 ?? H - 1); y++) for (let x = r.x0; x <= r.x1; x++) if (pred(at(x, y))) n++; return n; }
scene('generated worlds have their biomes and layers', () => {
  const seen = new Set(), missing = [];
  let layers = true, starts = true, rivered = 0, stocked = true;
  for (let seed = 1; seed <= 12; seed++) {
    S.seed = seed * 7919; Gen.generate();
    for (const r of Bio.regions) {
      const name = Bio.BIOMES[r.b].name;
      seen.add(name);
      if (!FEATURE[name]({ x0: r.x0, x1: r.x1 })) missing.push(`${name} (seed ${S.seed})`);
    }
    if (count(k => ((k / W) | 0) >= H - 6 && typ[k] === C.LAVA) < W * 3) layers = false;
    if (count(k => ((k / W) | 0) > 70 && ((k / W) | 0) < 92 && typ[k] === C.WATER) < 20) layers = false;
    if (count(k => solid[k] === C.ORE) < 200) layers = false;
    if (Bio.regions[0].b !== 0 || !bodies.some(b => b.kind === 'explorer')) starts = false;
    if (Bio.rivers.length) { rivered++; if (!bodies.some(b => b.kind === 'pike')) stocked = false; }
    if (Bio.regions.some(r => ['forest', 'jungle'].includes(Bio.BIOMES[r.b].name)) && !(bodies.some(b => b.kind === 'moth') && bodies.some(b => b.kind === 'bird'))) stocked = false;
  }
  check('every biome turns up across twelve worlds', seen.size === Bio.BIOMES.length, [...seen].join(', '));
  check('each biome has its ground and features', !missing.length, missing.join('; '));
  check('every world has aquifers, ore and a magma sea underground', layers);
  check('every world starts in grassland with the explorer', starts);
  check('rivers run through some worlds, with a pike in their ponds, and moths and birds live in the forests', rivered >= 3 && stocked, `${rivered} of 12 worlds have a river`);
});
scene('biome weather: frozen tundra, drying desert, droughts, tides', () => {
  sky(0); setClock(0.5); Clim.colTemp.fill(-70);   // below freezing even at noon
  tank(60, 90, 80, 99); fill(61, 92, 79, 99, C.WATER, -10); box(61, 91, 79, 91, C.ICE);
  run(2000);
  check('a tundra lake stays frozen through a sunny day', count(k => solid[k] === C.ICE) >= 15);
  sky(0); setClock(0.45); Clim.colTemp.fill(14); Clim.colHum.fill(0.15); Clim.colSwing.fill(1.6);
  for (let x = 30; x <= 60; x++) { liq[at(x, 99)] = 40; typ[at(x, 99)] = C.WATER; }
  run(600);
  check('a desert puddle dries out within the day', count(k => typ[k] === C.WATER) === 0, `${count(k => typ[k] === C.WATER)} wet tiles left`);
  // a drought warms the air, so the same storm passing over dissolves and rains far less
  const storm = spell => {
    sky(0); setClock(0.5);
    Bio.regions.length = 0; Bio.regions.push({ b: 4, x0: 0, x1: W - 1, spell: null, left: 0, hum: 1 });
    Bio.setSpell(Bio.regions[0], spell);
    for (let cx = 0; cx < Air.AW; cx++) Air.cloud[5 * Air.AW + cx] = 500;
    let most = 0;   // the most water on the ground at once (the noon sun dries it again)
    for (let i = 0; i < 20; i++) { run(10); most = Math.max(most, vol(0, W - 1, 0, 99)); }
    return most;
  };
  const normal = storm(null), dry = storm('drought');
  check('in a drought the warm air dissolves passing clouds, so less rain falls', dry < normal * 0.8,
    `${(dry / 255).toFixed(0)} tiles of rain in a drought, ${(normal / 255).toFixed(0)} without`);
  Bio.setSpell(Bio.regions[0], null); Bio.regions.length = 0;
  let coastSeed = 0;
  for (let seed = 1; seed <= 30 && !coastSeed; seed++) { S.seed = seed * 7919; Gen.generate(); if (Bio.regions.some(r => Bio.BIOMES[r.b].name === 'coast')) coastSeed = S.seed; }
  S.weather = true;
  const seaTop = () => { let y = 0; while (y < H && !liq[at(W - 2, y)] && !solid[at(W - 2, y)]) y++; return y; };
  const endAt = phase => { S.tick = Math.round(((phase - 2400 / 10800 - 0.35) % 1 + 1) % 1 * 10800) + 10800 * 4; for (let i = 0; i < 2400; i++) step(); return seaTop(); };
  const high = endAt(0.125), low = endAt(0.375);   // the tide is highest at day phase 0.125 and lowest at 0.375
  check('the sea at the coast rises and falls with the tide', coastSeed && low - high >= 3, `high tide at row ${high}, low at row ${low}`);
  S.weather = false;
});
scene('nature keeps its water: humid biomes, wet spells, drying ground, plants', () => {
  // a humid half and a dry half, a wet spell, a lake, drying mud and wet soil, and a plant: water only moves around
  sky(0); setClock(0.5);
  for (let x = 0; x < W; x++) Clim.colHum[x] = x < W / 2 ? 2.2 : 0.15;
  Air.hum.fill(40);
  Bio.regions.length = 0; Bio.regions.push({ b: 2, x0: 0, x1: W / 2 - 1, spell: null, left: 0, hum: 2.2 });
  Bio.setSpell(Bio.regions[0], 'wet');
  tank(40, 90, 80, 99); fill(41, 94, 79, 99, C.WATER, 20);
  for (let x = 100; x < 120; x++) { liq[at(x, 99)] = 120; typ[at(x, 99)] = C.MUD; }
  box(130, 99, 140, 99, C.WETDIRT); for (let x = 130; x <= 140; x++) Wd.held[at(x, 99)] = 32;
  box(150, 99, 160, 99, C.DIRT); tank(152, 96, 158, 98); fill(153, 96, 157, 98, C.WATER, 20); Pl.plantSeed(at(150, 98));
  const mud = () => { let m = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.MUD) m += liq[k]; return m; };
  const water = () => { let v = 0; for (let k = 0; k < W * H; k++) if (liq[k] && (typ[k] === C.WATER || typ[k] === C.STEAM)) v += liq[k]; return v; };
  const held = () => { let h = 0; for (let k = 0; k < W * H; k++) h += Wd.held[k]; return h; };
  const total = () => water() + mud() + held() + Air.airWater();
  const before = total();
  run(3000);
  const after = total();
  let wet = 0, dry = 0;
  for (let c = 0; c < Air.NC; c++) { if (c % Air.AW < Air.AW / 2) wet += Air.hum[c] + Air.cloud[c]; else dry += Air.hum[c] + Air.cloud[c]; }
  check('humid biomes gather the air’s moisture and dry ones lose it, and no water is made or lost', wet > dry * 2 && Math.abs(after - before) < before * 0.01,
    `${(before / 255).toFixed(1)} → ${(after / 255).toFixed(1)} tiles; humid half ${(wet / 255).toFixed(1)}, dry half ${(dry / 255).toFixed(1)}`);
  // how fast it dries depends on the clouds' shade
  check('mud baked dry in the sun sends its water into the air', mud() < 20 * 120 * 0.15, `${mud()} of ${20 * 120} mud left`);
  Bio.regions.length = 0;
  S.weather = false;
});
scene('geysers, gas vents, clay and permafrost', () => {
  clear(); devices.clear();
  box(40, 60, 60, 80, C.STONE);
  box(47, 61, 53, 64, C.AIR); fill(47, 61, 53, 64, C.WATER, 95);
  const g = place(C.GEYSER, 50, 60);
  let spout = 0;
  for (let i = 0; i < 200; i++) { for (let x = 47; x <= 53; x++) for (let y = 61; y <= 64; y++) temp[at(x, y)] = 95; step(); spout = Math.max(spout, count(k => ((k / W) | 0) < 60 && typ[k] === C.WATER)); }
  check('a geyser over hot water erupts', spout > 0, `${spout} tiles of water thrown up`);
  clear(); devices.clear();
  box(70, 60, 80, 60, C.STONE); place(C.VENT, 75, 60);
  run(200);
  check('a gas vent puffs poison gas', count(k => typ[k] === C.POISON) > 0);
  clear();
  box(90, 60, 92, 60, C.CLAY);
  for (let i = 0; i < 10; i++) { for (let x = 89; x <= 93; x++) { temp[at(x, 60)] = 950; temp[at(x, 59)] = 950; } step(); }
  check('clay bakes into brick', count(k => solid[k] === C.BRICK) > 0);
  clear();
  box(100, 60, 104, 60, C.PERMAFROST);
  run(600);
  check('permafrost thaws into mud above 2°', count(k => solid[k] === C.PERMAFROST) < 5 && count(k => typ[k] === C.MUD) > 0);
});

// ---- mass: freezing, melting and dissolving neither make nor lose material ----
scene('freezing, melting and dissolving keep mass', () => {
  const water = () => { let v = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) v += liq[k]; return v; };
  clear(); devices.clear();
  box(20, 60, 60, 60, C.STONE);
  for (let x = 21; x <= 45; x++) { liq[at(x, 59)] = 40; typ[at(x, 59)] = C.WATER; }   // a thin film: 25 tiles of 40
  const before = water();
  for (let i = 0; i < 60; i++) { for (let x = 15; x <= 65; x++) temp[at(x, 59)] = -15; step(); }
  const frozen = count(k => solid[k] === C.ICE);
  for (let i = 0; i < 120; i++) { for (let x = 15; x <= 65; x++) temp[at(x, 59)] = 50; step(); }
  check('a thin film freezes and thaws back to the same water', frozen > 10 && count(k => solid[k] === C.ICE) === 0 && Math.abs(water() - before) <= 2, `${frozen} ice tiles; water ${before} before, ${water()} after`);

  clear(); devices.clear();
  tank(70, 50, 90, 60);
  fill(71, 56, 89, 60, C.MOLTEN, 1400); fill(71, 55, 89, 55, C.WATER, 20);
  run(4);
  const metal = count(k => solid[k] === C.METAL);
  run(60);
  check('quenched molten metal stays metal', metal > 0 && count(k => solid[k] === C.METAL) >= metal, `${metal} metal after the quench, ${count(k => solid[k] === C.METAL)} a second later`);

  clear(); devices.clear();
  tank(100, 50, 120, 60);
  fill(101, 52, 119, 60, C.HONEY, 30); fill(110, 51, 110, 51, C.WATER, 30);
  const honey0 = count(k => typ[k] === C.HONEY) * 255;
  run(200);
  let honey = 0, sugar = 0;
  for (let k = 0; k < W * H; k++) { if (typ[k] === C.HONEY) honey += liq[k]; sugar += solAt(k, C.SOL_SUGAR); }
  check('water stops dissolving honey once it holds all the sugar it can', honey0 - honey <= sugar + 64, `honey lost ${honey0 - honey}, sugar gained ${sugar}`);

  clear(); devices.clear();
  box(130, 61, 150, 61, C.ICE); solid[at(140, 60)] = C.SALT;
  for (let k = 0; k < W * H; k++) temp[k] = -10;
  run(1000);   // ice touching salt melts at 1% per heat pass (every other tick)
  let salt = 0;   // dissolved contents are a concentration, so the amount of salt is concentration times liquid
  for (let k = 0; k < W * H; k++) if (liq[k]) salt += solAt(k, C.SOL_SALT) * liq[k] / 255;
  check('a salt block melts ice and is used up, making no extra salt', !count(k => solid[k] === C.SALT) && salt > 0 && salt <= 121, `${count(k => solid[k] === C.SALT)} salt blocks left, ${Math.round(salt)} salt dissolved (one block makes 120)`);

  clear(); devices.clear();
  box(40, 60, 60, 80, C.STONE);
  box(47, 61, 53, 64, C.AIR); fill(47, 61, 53, 64, C.WATER, 95);
  place(C.GEYSER, 50, 60);
  box(50, 40, 50, 59, C.STONE);   // capped
  const pocket = water();
  for (let i = 0; i < 150; i++) { for (let x = 47; x <= 53; x++) for (let y = 61; y <= 64; y++) temp[at(x, y)] = 95; step(); }
  check('a capped geyser keeps its water', water() === pocket, `${pocket} before, ${water()} after`);
});

// ---- snapshots: undo, save slots, world codes, seeds ----
const Sn = await import('../js/snapshot.js');
const Hi = await import('../js/history.js');
// name of the first array that differs between two snapshots, or ''
// The first array that differs between two snapshots, or ''. near: how far each array may be off (world codes round
// temperatures and liquid speed); flux is compared as ticks ago, up to 255, which is all a code keeps.
function differs(a, b, near = {}) {
  const tick = a.state.tick || 0;
  for (const n of Object.keys(Sn.ARRAYS)) {
    const x = a.arrays[n], y = b.arrays[n];
    if (!y || x.length !== y.length) return n;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === y[i] || (x[i] !== x[i] && y[i] !== y[i])) continue;
      if (near[n] && Math.abs(x[i] - y[i]) <= near[n]) continue;
      if (n === 'flux' && near.flux && Math.min(255, Math.max(0, tick - x[i])) === Math.min(255, Math.max(0, tick - y[i]))) continue;
      return n;
    }
  }
  return '';
}
scene('snapshots: exact restore, world codes, seeds and undo', async () => {
  S.seed = 4242; Gen.generate(); S.weather = true; run(240);   // a generated world with weather, bodies and plants
  const a = Sn.capture();
  run(240);
  Sn.restore(a);
  const b = Sn.capture(), d1 = differs(a, b);
  check('restoring a snapshot puts every tile, column and air cell back', !d1 && JSON.stringify(a.lists) === JSON.stringify(b.lists) && JSON.stringify(a.state) === JSON.stringify(b.state) && a.devices.length === b.devices.length, d1 && `${d1} differs`);
  const near = { temp: 0.126, ambient: 0.126, vel: 0.004, flux: true };
  const code = await Sn.packWorld(a), c = await Sn.unpackWorld(code), d2 = differs(a, c, near);
  check('a world code unpacks to the same world (temperatures to within 1/8°)', !d2 && JSON.stringify(a.lists) === JSON.stringify(c.lists) && JSON.stringify(a.state) === JSON.stringify(c.state) && code.length < 120 * 1024, d2 ? `${d2} differs` : `code is ${(code.length / 1024).toFixed(0)} KB`);
  // a version 1 code (JSON with the arrays in base64, gzipped) still loads, exactly
  const v1json = JSON.stringify({ ...a, arrays: Object.fromEntries(Object.entries(a.arrays).map(([n, x]) => [n, Sn.toBase64(new Uint8Array(x.buffer, x.byteOffset, x.byteLength))])) });
  const v1 = Sn.OLD_PREFIX + Sn.toBase64(new Uint8Array(await new Response(new Blob([new TextEncoder().encode(v1json)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()));
  const old = await Sn.unpackWorld(v1);
  check('an older (version 1) world code still loads', !differs(a, old) && JSON.stringify(a.state) === JSON.stringify(old.state));
  let refused = '';
  try { await Sn.unpackWorld('hello'); } catch (e) { refused = e.message; }
  check('text that is not a world code is refused with a reason', refused.includes('world code'), refused);
  S.seed = 777; Gen.generate(); const g = solid.slice(), l = liq.slice();
  S.seed = 777; Gen.generate();
  check('the same seed builds the same world', g.every((v, i) => v === solid[i]) && l.every((v, i) => v === liq[i]));
  clear(); devices.clear(); Hi.clearHistory();
  tank(40, 40, 60, 60);
  Hi.checkpoint();
  fill(41, 50, 59, 60, C.WATER, 20);   // the edit
  run(30);
  const back = Hi.undo();
  check('undo takes back the last edit', back >= 0 && count(k => liq[k] > 0) === 0 && count(k => solid[k] === C.STONE) > 0, `stepped back ${back.toFixed(1)} s`);
  check('undo with no history does nothing', Hi.undo() === -1);
});

// ---- the explorer's bucket and pickaxe ----
const Bd = await import('../js/bodies.js');
scene('the explorer scoops, pours, digs and places', () => {
  const water = () => { let v = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) v += liq[k]; return v; };
  const press = (key, ticks = 1) => { Bd.keys[key] = true; run(ticks); Bd.keys[key] = false; run(1); };
  clear(); devices.clear();
  box(10, 101, 80, 101, C.STONE);
  box(39, 96, 39, 100, C.STONE); box(51, 96, 51, 100, C.STONE);   // a pool, 40..50 wide, 96..100 deep
  fill(40, 96, 50, 100, C.WATER, 20);
  Bd.addBody('explorer', 39 * C.T, 96 * C.T - 11);   // standing on the pool's left rim, facing right
  const ex = bodies.find(b => b.kind === 'explorer');
  run(20);
  const before = water();
  press('Enter');
  check('Enter scoops a tile of water into the bucket', ex.inv && ex.inv.bucket && ex.inv.bucket.a === 255 && water() === before - 255, `bucket ${ex.inv && ex.inv.bucket ? ex.inv.bucket.a : 0}`);
  press('Enter');
  run(60);
  check('Enter again pours it back without losing any', !ex.inv.bucket && water() === before, `water ${before} before, ${water()} after`);

  solid[at(40, 95)] = C.DIRT; Wd.markDirty(40, 95);
  press('d', 12);
  check('holding D digs a dirt block into the bag', solid[at(40, 95)] === 0 && ex.inv.bag.length === 1 && ex.inv.bag[0].b === C.DIRT && ex.inv.bag[0].n === 1);
  press('d');
  check('pressing D with nothing to dig places the chosen block', solid[at(40, 95)] === C.DIRT && ex.inv.bag.length === 0);
  solid[at(40, 95)] = 0; Wd.markDirty(40, 95);
  place(C.GATE, 40, 95);
  press('d', 100);
  check('the pickaxe can’t break machines', solid[at(40, 95)] === C.GATE && devices.has(at(40, 95)));
  devices.delete(at(40, 95)); solid[at(40, 95)] = 0;
  S.level = { tools: [] };
  press('Enter');
  check('in a puzzle that doesn’t allow them, the tools do nothing', !ex.inv.bucket);
  S.level = null;
});

scene('rafts, boats and balloons; air and health', () => {
  const press = (key, ticks) => { Bd.keys[key] = true; run(ticks); Bd.keys[key] = false; };
  // a pond wide enough to paddle across
  clear(); devices.clear();
  box(10, 101, 120, 101, C.STONE); box(10, 90, 10, 100, C.STONE); box(120, 90, 120, 100, C.STONE);
  fill(11, 94, 119, 100, C.WATER, 20);
  const boat = Bd.addBody('boat', 30 * C.T, 92 * C.T);
  run(120);
  const floatY = boat.y;
  check('a boat floats', boat.y < 94 * C.T && boat.y > 88 * C.T, `top at row ${(boat.y / C.T).toFixed(1)}`);
  const ex = Bd.addBody('explorer', boat.x + 8, boat.y - 12);
  run(60);
  check('the explorer can stand in the boat', Bd.standingOn(ex) === boat, `explorer bottom ${(ex.y + ex.h).toFixed(1)}, boat top ${boat.y.toFixed(1)}`);
  const x0 = boat.x;
  press('ArrowRight', 120);
  check('the arrows paddle the boat, carrying the explorer', boat.x - x0 > 40 && Bd.standingOn(ex) === boat, `boat moved ${(boat.x - x0).toFixed(0)} px`);
  const raft = Bd.addBody('raft', 80 * C.T, 92 * C.T);
  run(120);
  check('a raft floats', raft.y < 94 * C.T && raft.y > 88 * C.T);

  // a balloon tied to a crate lifts it; tied to a weight it can't
  clear(); devices.clear();
  box(10, 101, 120, 101, C.STONE);
  const crate = Bd.addBody('crate', 30 * C.T, 100 * C.T), weight = Bd.addBody('weight', 60 * C.T, 100 * C.T);
  run(30);
  const cy = crate.y, wy = weight.y;
  const b1 = Bd.addBody('balloon', crate.x, crate.y - 14), b2 = Bd.addBody('balloon', weight.x, weight.y - 14);
  check('a balloon ties itself to the body below it', Bd.tieBalloon(b1) === crate && Bd.tieBalloon(b2) === weight);
  run(150);
  check('a balloon lifts a crate', cy - crate.y > 16, `crate rose ${(cy - crate.y).toFixed(0)} px`);
  check('a balloon can’t lift a weight, which holds it down', Math.abs(weight.y - wy) < 1 && b2.y > wy - 40, `weight moved ${(wy - weight.y).toFixed(1)} px`);
  temp[centerTileOf(b1)] = 300; run(3);
  check('heat pops a balloon', !bodies.includes(b1) && bodies.includes(b2));

  // breathing and fainting
  clear(); devices.clear();
  box(10, 101, 60, 101, C.STONE); box(10, 80, 10, 100, C.STONE); box(60, 80, 60, 100, C.STONE);
  fill(11, 85, 59, 100, C.WATER, 20);
  const diver = Bd.addBody('explorer', 30 * C.T, 98 * C.T - 11);
  S.spawn = { x: 70 * C.T, y: 100 * C.T - 11 };
  diver.air = 100; diver.hp = 100;
  for (let i = 0; i < 200; i++) { diver.vy = 1; step(); }   // held under
  check('under water the explorer runs out of air', diver.air < 50, `air ${diver.air.toFixed(0)}`);
  for (let i = 0; i < 600 && !diver.fainted; i++) { diver.vy = 1; step(); }
  check('out of air, health drains until the explorer faints and wakes at the spawn point', diver.fainted != null && diver.hp === 100 && Math.abs(diver.x - 70 * C.T) < 4, `hp ${diver.hp}, x ${(diver.x / C.T).toFixed(1)}`);
  run(60);
  check('in open air the explorer breathes again', diver.air === 100);
});
function centerTileOf(b) { return Math.min(H - 1, ((b.y + b.h / 2) / C.T) | 0) * W + Math.min(W - 1, ((b.x + b.w / 2) / C.T) | 0); }

// ---- chemistry: acidity, fizz, carbon dioxide, crystals ----
scene('acid and alkali, fizz and carbon dioxide, growing crystals', async () => {
  const So = await import('../js/solutes.js');
  const avg = (x0, y0, x1, y1, i) => avgSol(x0, y0, x1, y1, i);
  clear(); devices.clear();
  box(20, 61, 40, 61, C.GLASS); box(20, 40, 20, 60, C.GLASS); box(40, 40, 40, 60, C.GLASS);   // glass: acid can't eat the tank
  fill(21, 56, 30, 60, C.ACID, 20); fill(31, 56, 39, 60, C.LYE, 20);
  run(1500);   // they dilute into the water they make, then cancel where the two meet
  const acidLeft = count(k => typ[k] === C.ACID) + count(k => typ[k] === C.LYE), a = avg(21, 50, 39, 60, C.SOL_ACID), b = avg(21, 50, 39, 60, C.SOL_BASE), salt = avg(21, 50, 39, 60, C.SOL_SALT);
  check('acid and lye neutralise into warm, salty water', acidLeft === 0 && a + b < 120 && salt > 10,
    `acid ${a.toFixed(0)}, alkali ${b.toFixed(0)} left of 220 each; salt ${salt.toFixed(0)}`);

  clear(); devices.clear();
  tank(50, 40, 80, 60);
  fill(51, 52, 79, 60, C.WATER, 20); fill(51, 51, 53, 51, C.ACID, 20);
  run(400);
  check('acid poured into water dilutes into it', count(k => typ[k] === C.ACID) === 0 && avg(51, 50, 79, 60, C.SOL_ACID) > 2 && So.phOf(at(60, 58)) < 7,
    `pH ${So.phOf(at(60, 58)).toFixed(1)} across the tank`);

  // strong dilute acid eats dirt; very weak acid doesn't
  clear(); devices.clear();
  box(10, 61, 30, 61, C.DIRT); box(10, 50, 10, 60, C.STONE); box(30, 50, 30, 60, C.STONE);
  box(40, 61, 60, 61, C.DIRT); box(40, 50, 40, 60, C.STONE); box(60, 50, 60, 60, C.STONE);
  box(10, 62, 60, 62, C.STONE);   // so the soil doesn't let the tanks drain away underneath
  fill(11, 55, 29, 60, C.WATER, 20); setSol(11, 55, 29, 60, C.SOL_ACID, 200);
  fill(41, 55, 59, 60, C.WATER, 20); setSol(41, 55, 59, 60, C.SOL_ACID, 20);
  run(600);
  const soilAt = k => solid[k] === C.DIRT || solid[k] === C.WETDIRT;   // dirt under water soaks some up as wet soil
  const strong = 19 - count(k => soilAt(k) && (k % W) > 10 && (k % W) < 30 && ((k / W) | 0) === 61);
  const weak = 19 - count(k => soilAt(k) && (k % W) > 40 && (k % W) < 60 && ((k / W) | 0) === 61);
  check('strong acid in water eats the dirt under it; weak acid leaves it', strong > 2 && weak === 0, `strong ate ${strong}, weak ate ${weak}`);

  // fizz: acid on baking soda makes carbon dioxide, which sinks, pools, puts out fire and chokes the explorer
  clear(); devices.clear();
  box(10, 101, 60, 101, C.STONE); box(10, 80, 10, 100, C.STONE); box(60, 80, 60, 100, C.STONE);
  box(30, 85, 34, 86, C.SODA); fill(30, 83, 34, 84, C.ACID, 20);
  run(300);
  const gas = count(k => typ[k] === C.CO2), low = count(k => typ[k] === C.CO2 && ((k / W) | 0) >= 98);
  check('acid on baking soda fizzes into carbon dioxide that sinks and pools', count(k => solid[k] === C.SODA) < 10 && gas > 0 && low > gas * 0.3, `${gas} CO2 tiles, ${low} on the floor`);
  clear(); devices.clear();
  box(10, 101, 60, 101, C.STONE); box(10, 80, 10, 100, C.STONE); box(60, 80, 60, 100, C.STONE);
  box(40, 100, 41, 100, C.WOOD); box(50, 100, 51, 100, C.WOOD);
  temp[at(40, 100)] = temp[at(50, 100)] = 400;
  run(10);
  const burning = count(k => fire[k] > 0);
  fill(11, 97, 39, 100, C.CO2, 20); fill(42, 97, 59, 99, C.CO2, 20); fill(42, 100, 49, 100, C.CO2, 20); fill(52, 100, 59, 100, C.CO2, 20);
  run(30);
  check('carbon dioxide smothers fire', burning > 0 && !count(k => fire[k] > 0), `${burning} tiles were burning, ${count(k => fire[k] > 0)} still are`);
  const diver = Bd.addBody('explorer', 20 * C.T, 101 * C.T - 11);
  diver.air = 100;
  run(200);
  check('the explorer can’t breathe in carbon dioxide', diver.air < 60, `air ${diver.air.toFixed(0)}`);

  // crystals grow in still, saturated brine, and dissolve again in fresh water
  clear(); devices.clear();
  tank(70, 50, 90, 60);
  fill(71, 55, 89, 60, C.WATER, 20); setSol(71, 55, 89, 60, C.SOL_SALT, 230);
  run(1200);
  const gems = count(k => solid[k] === C.GEM);
  check('salt crystals grow from still, saturated brine', gems > 0, `${gems} crystals`);
  for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) sol[k * C.NSOL + C.SOL_SALT] = 0;
  run(1200);
  check('fresh water dissolves them again', count(k => solid[k] === C.GEM) < gems, `${count(k => solid[k] === C.GEM)} of ${gems} left`);

  // an older world code (7 dissolved channels) still loads
  const old = Sn.capture();
  const sol7 = new Uint8Array(W * H * 7);
  for (let k = 0; k < W * H; k++) for (let i = 0; i < 7; i++) sol7[k * 7 + i] = sol[k * C.NSOL + i];
  let loaded = true;
  try { Sn.restore({ ...old, NSOL: 7, arrays: { ...old.arrays, sol: sol7 } }); } catch { loaded = false; }
  check('worlds saved before the acid and alkali channels still load', loaded);
});

// ---- Phase 13: new blocks and liquids ----
const Pl = await import('../js/plants.js');
scene('sponges, soil, porous rock, wool and copper, membranes, coral, fuses', () => {
  const water = (x0, y0, x1, y1) => { let v = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (typ[at(x, y)] === C.WATER) v += liq[at(x, y)]; return v; };
  // a sponge soaks up water, and a weight wrings it out again
  clear(); devices.clear();
  tank(20, 50, 30, 60); box(25, 60, 25, 60, C.SPONGE);
  fill(21, 58, 29, 59, C.WATER, 20); fill(21, 60, 24, 60, C.WATER, 20); fill(26, 60, 29, 60, C.WATER, 20);
  const before = water(20, 40, 30, 60);
  run(200);
  check('a sponge soaks up water', solid[at(25, 60)] === C.WETSPONGE && Wd.held[at(25, 60)] > 100, `holds ${Wd.held[at(25, 60)]}`);
  check('the water it holds isn’t lost', Math.abs(water(20, 40, 30, 60) + Wd.held[at(25, 60)] - before) <= 2);
  clear(); devices.clear();
  box(40, 61, 50, 61, C.STONE); box(45, 60, 45, 60, C.WETSPONGE); Wd.held[at(45, 60)] = 200;
  temp[at(45, 60)] = 150;
  run(40);
  check('heat wrings a sponge out as steam', Wd.held[at(45, 60)] < 100 && count(k => typ[k] === C.STEAM) > 0);

  // dirt soaks up water and drips it into a cave below
  clear(); devices.clear();
  box(60, 50, 80, 50, C.DIRT); box(60, 40, 60, 49, C.STONE); box(80, 40, 80, 49, C.STONE); box(60, 56, 80, 56, C.STONE);
  fill(61, 45, 79, 49, C.WATER, 20);
  run(2000);
  check('dirt soaks up water as wet soil', count(k => solid[k] === C.WETDIRT) > 0, `${count(k => solid[k] === C.WETDIRT)} wet soil tiles`);
  check('wet soil drips into the cave below', water(61, 51, 79, 55) > 0, `${water(61, 51, 79, 55)} dripped`);

  // porous rock lets water seep through slowly; stone doesn't
  clear(); devices.clear();
  box(90, 50, 100, 50, C.POROUS); box(90, 40, 90, 49, C.STONE); box(100, 40, 100, 49, C.STONE);
  box(90, 61, 100, 61, C.STONE); box(90, 51, 90, 60, C.STONE); box(100, 51, 100, 60, C.STONE);   // a cave below to catch it
  fill(91, 45, 99, 49, C.WATER, 20);
  run(300);
  check('water seeps down through porous rock', water(91, 51, 99, 60) > 255, `${water(91, 51, 99, 60)} seeped through`);

  // wool barely lets heat through; copper carries it fast: water behind a hot wall of each, boxed in wool
  clear(); devices.clear();
  const wall = (y, b) => {
    for (let yy = y; yy <= y + 2; yy++) {
      solid[at(10, yy)] = C.STONE;   // the heat source is stone: wool is flammable
      for (let x = 11; x <= 13; x++) solid[at(x, yy)] = b;
      for (let x = 14; x <= 16; x++) { liq[at(x, yy)] = 255; typ[at(x, yy)] = C.WATER; }
      solid[at(17, yy)] = C.WOOL;
    }
    for (let x = 10; x <= 17; x++) { solid[at(x, y - 1)] = C.WOOL; solid[at(x, y + 3)] = C.WOOL; }
  };
  wall(30, C.WOOL); wall(40, C.COPPER); Wd.wakeAll();
  const behind = y => { let s = 0; for (let yy = y; yy <= y + 2; yy++) for (let x = 14; x <= 16; x++) s += temp[at(x, yy)]; return s / 9; };
  for (let i = 0; i < 400; i++) { for (const y of [30, 31, 32, 40, 41, 42]) temp[at(10, y)] = 800; step(); }
  check('copper carries heat fast; wool barely lets it through', behind(40) > 80 && behind(30) < 35, `water behind copper ${behind(40).toFixed(0)}°, behind wool ${behind(30).toFixed(0)}°`);

  // a membrane set to water lets water through and stops oil
  clear(); devices.clear();
  tank(30, 40, 40, 50); place(C.MEMBRANE, 35, 50);
  devices.get(at(35, 50)).liquid = C.WATER;
  box(30, 51, 40, 51, C.STONE); box(30, 52, 30, 60, C.STONE); box(40, 52, 40, 60, C.STONE); box(30, 61, 40, 61, C.STONE);
  solid[at(35, 51)] = C.AIR;
  fill(31, 47, 39, 49, C.WATER, 20); fill(31, 45, 39, 46, C.OIL, 20);
  run(400);
  const below = count(k => liq[k] && ((k / W) | 0) > 51);
  check('a membrane lets its liquid through and stops the rest', water(31, 52, 39, 60) > 500 && !count(k => typ[k] === C.OIL && ((k / W) | 0) > 50), `${water(31, 52, 39, 60)} water through, ${below} tiles below`);

  // coral grows in warm salt water, and bleaches when it's too hot
  clear(); devices.clear();
  tank(50, 30, 70, 50); box(60, 50, 60, 50, C.CORAL); solid[at(60, 51)] = C.STONE;
  fill(51, 35, 69, 49, C.WATER, 24); setSol(51, 35, 69, 49, C.SOL_SALT, 120);
  for (let i = 0; i < 2000; i++) { if (!(i & 15)) for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER) temp[k] = 24; step(); }
  const grown = count(k => solid[k] === C.CORAL);
  check('coral grows in warm salt water', grown > 1, `${grown} coral`);
  for (let i = 0; i < 60; i++) { for (let k = 0; k < W * H; k++) if (solid[k] === C.CORAL || typ[k] === C.WATER) temp[k] = 40; step(); }
  check('too hot, it bleaches', count(k => solid[k] === C.CORAL) === 0 && count(k => solid[k] === C.BLEACHED) >= grown);

  // a fuse burns along its length and sets off nitro at the end
  clear(); devices.clear();
  box(10, 70, 40, 70, C.STONE); box(11, 69, 30, 69, C.FUSE); box(30, 60, 30, 68, C.FUSE);
  box(29, 59, 31, 59, C.STONE); fill(29, 58, 31, 58, C.NITRO, 20);
  temp[at(11, 69)] = 400;
  let lit = 0;
  for (let i = 0; i < 400; i++) { step(); if (count(k => solid[k] === C.FUSE) < 29 - 4) lit = lit || i; }
  check('a fuse burns along its length, turning corners and climbing', count(k => solid[k] === C.FUSE) === 0, `${count(k => solid[k] === C.FUSE)} fuse tiles left`);
  check('and sets off nitro at its end', count(k => typ[k] === C.NITRO) === 0);
});
scene('void ink, mimic, coolant, ferrofluid, fertiliser', () => {
  clear(); devices.clear();
  tank(10, 50, 30, 60);
  fill(11, 56, 29, 60, C.WATER, 20); fill(11, 55, 15, 55, C.VOID, 20);
  run(200);
  check('void ink deletes the water it touches, using itself up', count(k => typ[k] === C.WATER) < 95 - 10 && count(k => typ[k] === C.VOID) === 0, `${95 - count(k => typ[k] === C.WATER)} of 95 water tiles deleted`);
  clear(); devices.clear();
  tank(40, 50, 60, 60);
  fill(41, 58, 59, 60, C.OIL, 20); fill(41, 57, 45, 57, C.MIMIC, 20);
  run(60);
  check('mimic turns into the first liquid it touches', count(k => typ[k] === C.MIMIC) === 0 && count(k => typ[k] === C.OIL) > 60);
  clear(); devices.clear();
  tank(70, 50, 80, 60);
  fill(71, 58, 79, 60, C.COOLANT, -60);
  run(100);
  check('coolant doesn’t freeze', count(k => typ[k] === C.COOLANT) === 27 && !count(k => solid[k] === C.ICE));
  fill(71, 57, 79, 57, C.LAVA, 1000);
  run(20);
  check('coolant quenches lava into a basalt crust', count(k => solid[k] === C.BASALT) > 0, `${count(k => solid[k] === C.BASALT)} basalt, ${count(k => typ[k] === C.LAVA)} lava, ${count(k => typ[k] === C.COOLANT)} coolant`);
  // a magnet above a pool of ferrofluid pulls it up into a spike
  clear(); devices.clear();
  tank(90, 40, 110, 60); box(100, 50, 100, 50, C.MAGNET);
  fill(91, 57, 109, 60, C.FERRO, 20);
  run(200);
  const raised = count(k => typ[k] === C.FERRO && ((k / W) | 0) < 57);
  check('a magnet pulls ferrofluid up towards it', raised > 2, `${raised} tiles above the pool`);
  // fertiliser: a plant watered with it grows faster than one on plain water
  clear(); devices.clear();
  box(10, 101, 60, 101, C.DIRT);
  for (const [w0, root] of [[12, 15], [32, 35]]) {   // a two-tile pool walled in stone, and a seed beside it
    box(w0 - 1, 100, w0 - 1, 100, C.STONE); box(w0 + 2, 100, w0 + 2, 100, C.STONE);
    fill(w0, 100, w0 + 1, 100, C.WATER, 20);
    Pl.plantSeed(at(root, 100));
  }
  setSol(32, 100, 33, 100, C.SOL_FERT, 200);
  const plain = Pl.plants.find(p => p.root === at(15, 100)), fed = Pl.plants.find(p => p.root === at(35, 100));
  plain.max = fed.max = 10;
  run(700);
  check('a plant on fertilised water grows faster', fed.h > plain.h, `fed ${fed.h} tiles tall, plain ${plain.h}`);
  // a heavy dose turns a pond green, kills its fish and mosses over its stone
  clear(); devices.clear();
  tank(70, 80, 90, 100);
  fill(71, 86, 89, 100, C.WATER, 20); setSol(71, 86, 89, 100, C.SOL_FERT, 180);
  for (let y = 80; y <= 100; y++) for (let x = 70; x <= 90; x++) Wd.under[at(x, y)] = 0;   // under open sky, at noon: algae needs light
  setClock(0.5);
  const fish = Bd.addBody('fish', 80 * C.T, 95 * C.T);
  for (let i = 0; i < 30 && bodies.includes(fish); i++) run(50);
  check('an algae bloom from too much fertiliser kills fish', !bodies.includes(fish));
  check('fertilised water greens the stone around it with moss', count(k => solid[k] === C.MOSS) > 0, `${count(k => solid[k] === C.MOSS)} moss`);
});

// ---- electricity, expanded ----
scene('solar panels, batteries, lamps, motors, electromagnets, coolant-fed boilers', () => {
  // a solar panel under open sky makes power by day, not at night; underground, only beside liquid light
  clear(); devices.clear();
  const panel = place(C.SOLAR, 20, 60), lamp = place(C.LAMP, 21, 60);
  link(at(20, 60), at(21, 60)); Wd.under[at(20, 60)] = 0;
  setClock(0.5); run(3);
  const noon = panel.on && lamp.active;
  setClock(0); run(3);
  check('a solar panel lights its lamp at noon, not at midnight', noon && !panel.on && !lamp.active);
  Wd.under[at(20, 60)] = 1; setClock(0.5); run(3);
  const shaded = !panel.on;
  tank(16, 50, 19, 60); fill(17, 58, 18, 60, C.LIGHT, 20); run(3);
  check('underground, a solar panel runs on liquid light beside it', shaded && panel.on);
  // a battery on a metal line charges while a lever powers the line, then keeps the lamp lit after the lever goes off
  clear(); devices.clear();
  box(30, 60, 50, 60, C.METAL);
  const lever = place(C.LEVER, 30, 59), battery = place(C.BATTERY, 40, 59), bulb = place(C.LAMP, 50, 59);
  run(5);
  const dark = !bulb.active;
  lever.on = true; run(300);
  const stored = battery.charge, litOn = bulb.active;
  lever.on = false; run(5);
  const litFromBattery = bulb.active && battery.on;
  run(400);
  check('a battery stores power from a line and keeps its lamp lit after the lever goes off',
    dark && litOn && stored >= 290 && litFromBattery && !bulb.active && battery.charge === 0,
    `charged to ${stored}, lamp ${litFromBattery ? 'lit' : 'dark'} on the battery, then ${bulb.active ? 'still lit' : 'dark'}`);
  // a powered motor drives the gate it touches and pushes water through to the dry side
  clear(); devices.clear();
  tank(60, 50, 80, 60); box(70, 50, 70, 59, C.STONE);
  fill(61, 52, 69, 60, C.WATER, 20);
  solid[at(70, 60)] = 0; const motor = place(C.MOTOR, 70, 60);
  box(69, 62, 71, 62, C.STONE); solid[at(70, 61)] = 0;   // the gate under the motor opens into a one-tile pocket
  const gate = place(C.GATE, 70, 61), switchy = place(C.LEVER, 90, 60); link(at(90, 60), at(70, 60));
  run(200);
  const sealed = !count(k => typ[k] === C.WATER && k % W > 70) && !gate.open;
  switchy.on = true; run(300);
  const moved = count(k => typ[k] === C.WATER && k % W > 70);
  check('a running motor opens the gate it touches and pushes water past itself', sealed && motor.active && gate.open && moved > 10, `${moved} water tiles moved`);
  // an electromagnet pulls ferrofluid only while powered
  clear(); devices.clear();
  tank(90, 40, 110, 60);
  solid[at(100, 50)] = 0; place(C.EMAGNET, 100, 50);
  const coil = place(C.LEVER, 120, 60); link(at(120, 60), at(100, 50));
  fill(91, 57, 109, 60, C.FERRO, 20);
  run(200);
  const idle = count(k => typ[k] === C.FERRO && ((k / W) | 0) < 57);
  coil.on = true; run(200);
  const raised = count(k => typ[k] === C.FERRO && ((k / W) | 0) < 57);
  check('an electromagnet pulls ferrofluid only while powered', idle === 0 && raised > 2, `${idle} tiles raised off, ${raised} on`);
  // a boiler touching coolant runs on the coolant's heat: off while it's cold, boiling while it's hot
  clear(); devices.clear();
  tank(40, 90, 50, 100);
  fill(41, 97, 49, 100, C.WATER, 20);
  solid[at(45, 101)] = 0; const boiler = place(C.BOILER, 45, 101);
  box(44, 102, 46, 103, C.STONE); solid[at(45, 102)] = 0; fill(45, 102, 45, 102, C.COOLANT, 20);
  run(600);
  const coldSteam = count(k => typ[k] === C.STEAM), coldOff = !boiler.active;
  let steam = 0;
  let on = 0, hottest = 0;
  for (let i = 0; i < 1200; i++) {
    if (!(i % 30)) temp[at(45, 102)] = 900;
    step(); if (boiler.active) on++;
    hottest = Math.max(hottest, temp[at(45, 100)]); steam = Math.max(steam, count(k => typ[k] === C.STEAM));
  }
  check('a boiler runs on hot coolant and stays off on cold', coldOff && coldSteam === 0 && on > 0 && hottest >= 100,
    `${steam} steam tiles at peak, boiler on for ${on} of 1200 ticks, water over it up to ${hottest.toFixed(0)}°`);
});

// ---- ecology ----
const Cr = await import('../js/creatures.js'), { ALGAE_WILD } = await import('../js/solutes.js');
function lake(x0, y0, x1, y1, sky) {   // a tank of water, under open sky or in a cave
  tank(x0, y0, x1, y1); fill(x0 + 1, y0 + 2, x1 - 1, y1, C.WATER, 20);
  if (sky) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) Wd.under[at(x, y)] = 0;
}
scene('ecology: algae, grazing fish, rot', () => {
  // algae grows only in the light; fertiliser feeds it far past the thin wild growth of plain water
  clear(); devices.clear(); setClock(0.5);
  lake(10, 80, 20, 90, true); setSol(11, 82, 19, 90, C.SOL_FERT, 60);
  lake(30, 80, 40, 90, false); setSol(31, 82, 39, 90, C.SOL_FERT, 60);
  lake(50, 80, 60, 90, true);
  run(1500);
  const fed = avgSol(11, 82, 19, 90, C.SOL_ALGAE), dark = avgSol(31, 82, 39, 90, C.SOL_ALGAE), wild = avgSol(51, 82, 59, 90, C.SOL_ALGAE);
  check('algae needs light, and grows thick on fertiliser but stays thin without', fed > 60 && dark === 0 && wild > 0 && wild <= ALGAE_WILD,
    `fertilised ${fed.toFixed(0)}, dark ${dark}, plain ${wild.toFixed(1)}`);
  // in the dark algae dies back and rots into fertiliser
  clear(); devices.clear();
  lake(10, 80, 20, 90, false); setSol(11, 82, 19, 90, C.SOL_ALGAE, 100);
  run(800);
  const left = avgSol(11, 82, 19, 90, C.SOL_ALGAE), rotted = avgSol(11, 82, 19, 90, C.SOL_FERT);
  check('algae dies in the dark and rots into fertiliser', left < 97 && rotted > 0, `algae ${left.toFixed(0)} of 100, fertiliser ${rotted.toFixed(1)}`);
  // fish graze algae and stay fed; in a dark pool with none they go hungry and don't breed
  clear(); devices.clear(); setClock(0.5);
  lake(10, 80, 30, 90, true); setSol(11, 82, 29, 90, C.SOL_ALGAE, 20);
  lake(40, 80, 60, 90, false);
  const grazer = Bd.addBody('fish', 20 * C.T, 87 * C.T), hungry = Bd.addBody('fish', 50 * C.T, 87 * C.T);
  addBody('fish', 52 * C.T, 87 * C.T);
  run(1400);
  check('fish graze algae and stay fed', bodies.includes(grazer) && grazer.hunger < 600, `hunger ${grazer.hunger}`);
  const unfed = bodies.filter(b => b.kind === 'fish' && b.x > 40 * C.T).length;
  check('fish with nothing to eat go hungry and don’t breed', hungry.hunger > Cr.WELL_FED && unfed === 2, `hunger ${hungry.hunger}, ${unfed} fish`);
  // a dead fish rots: stranded on dry stone, it leaves a little fertiliser where it dies
  clear(); devices.clear();
  box(10, 90, 30, 90, C.STONE);
  const stranded = Bd.addBody('fish', 20 * C.T, 88 * C.T);
  run(800);
  check('a dead fish rots into fertiliser', !bodies.includes(stranded) && count(k => typ[k] === C.FERT) > 0);
  // a plant with nothing to drink wilts and rots into fertiliser
  clear(); devices.clear();
  box(10, 101, 20, 101, C.DIRT);
  Pl.plantSeed(at(15, 100)); Pl.plants[0].thirst = Pl.WILT_AT - 2;   // about to wilt
  run(200);
  check('a wilted plant rots into fertiliser', !Pl.plants.length && count(k => typ[k] === C.FERT) > 0, `${count(k => typ[k] === C.FERT)} fertiliser tiles`);
});

scene('ecology: seasonal algae, spreading plants, pike and moths', () => {
  // algae blooms in warm water and dies back in cold, as open lakes do through the year
  clear(); devices.clear(); setClock(0.5);
  lake(10, 80, 20, 90, true); setSol(11, 82, 19, 90, C.SOL_FERT, 60); setSol(11, 82, 19, 90, C.SOL_ALGAE, 40);
  lake(30, 80, 40, 90, true); setSol(31, 82, 39, 90, C.SOL_FERT, 60); setSol(31, 82, 39, 90, C.SOL_ALGAE, 40);
  const hold = () => { for (let y = 82; y <= 90; y++) { for (let x = 11; x <= 19; x++) temp[at(x, y)] = 25; for (let x = 31; x <= 39; x++) temp[at(x, y)] = 4; } };
  for (let i = 0; i < 300; i++) { hold(); run(5); }
  const warm = avgSol(11, 82, 19, 90, C.SOL_ALGAE), cold = avgSol(31, 82, 39, 90, C.SOL_ALGAE);
  check('algae blooms in warm water and dies back in cold', warm > 80 && cold < 40, `warm ${warm.toFixed(0)}, cold ${cold.toFixed(0)} (both started at 40)`);
  // a grown plant drops seeds on open soil nearby, never right beside another plant, and regrows lost leaves
  clear(); devices.clear(); Pl.plants.length = 0;
  box(10, 61, 70, 70, C.DIRT);
  Pl.plantSeed(at(40, 60));
  for (let i = 0; i < 60; i++) Pl.dropSeed(Pl.plants[0]);
  const xs = Pl.plants.map(p => p.root % W).sort((a, b) => a - b);
  const spaced = xs.every((x, i) => !i || x - xs[i - 1] > Pl.SPACING), onSoil = Pl.plants.every(p => solid[p.root + W] === C.DIRT);
  check('grown plants drop seeds that take root nearby, spaced apart', Pl.plants.length >= 3 && spaced && onSoil && xs.every(x => Math.abs(x - 40) <= Pl.SEED_REACH + 1), `${Pl.plants.length} plants at ${xs.join(', ')}`);
  for (let y = 55; y < 60; y++) solid[at(40, y)] = C.PLANT;
  Object.assign(Pl.plants[0], { h: 6, top: at(40, 55), max: 6 });
  for (let i = 0; i < 40; i++) Pl.regrowLeaf(Pl.plants[0]);
  check('a grown plant regrows leaves', count(k => solid[k] === C.LEAF) > 0);
  // pike hunt the small fish in a lake, and starve without them
  clear(); devices.clear();
  lake(10, 80, 50, 90, false);   // dark, so the small fish can't graze and breed meanwhile
  for (let i = 0; i < 6; i++) Bd.addBody('fish', (14 + i * 5) * C.T, 87 * C.T);
  const pike = Bd.addBody('pike', 30 * C.T, 86 * C.T);
  run(3000);
  const fishLeft = bodies.filter(b => b.kind === 'fish').length;
  check('a pike hunts down the small fish', fishLeft < 6 && pike.hunger < Cr.PIKE_STARVE, `${fishLeft} of 6 fish left, ${pike.fed || 0} eaten since it last bred`);
  clear(); devices.clear();
  lake(10, 80, 30, 90, false);
  const starving = Bd.addBody('pike', 20 * C.T, 86 * C.T); starving.hunger = Cr.PIKE_STARVE - 50;
  run(200);
  check('a pike with nothing to eat starves and rots', !bodies.includes(starving) && avgSol(11, 82, 29, 90, C.SOL_FERT) > 0);
  // moths eat leaves; fish leap at moths over the water; moths die in frost
  clear(); devices.clear();
  box(10, 61, 40, 61, C.DIRT);
  for (let y = 52; y <= 60; y++) { solid[at(25, y)] = C.PLANT; solid[at(24, y)] = C.LEAF; solid[at(26, y)] = C.LEAF; }
  const leaves = count(k => solid[k] === C.LEAF);
  const moth = Bd.addBody('moth', 18 * C.T, 56 * C.T); Bd.addBody('moth', 32 * C.T, 56 * C.T);
  run(2000);
  check('moths eat leaves', count(k => solid[k] === C.LEAF) < leaves - 2 && bodies.includes(moth) && moth.hunger < Cr.MOTH_STARVE, `${leaves - count(k => solid[k] === C.LEAF)} of ${leaves} leaves eaten`);
  clear(); devices.clear();
  lake(10, 80, 30, 90, false);
  const leaper = Bd.addBody('fish', 20 * C.T, 82 * C.T), prey = Bd.addBody('moth', 20 * C.T + 2, 81 * C.T);
  run(400);
  check('a fish snaps up a moth just over the water', !bodies.includes(prey) && leaper.grazed);
  clear(); devices.clear();
  box(10, 61, 40, 61, C.DIRT);
  const frozen = Bd.addBody('moth', 20 * C.T, 58 * C.T);
  for (let i = 0; i < Cr.MOTH_FROZEN + 100; i++) { temp.fill(-30); step(); }   // a hard frost, held long enough
  check('moths die in a hard frost', !bodies.includes(frozen));
});

scene('water landscapes: groundwater, valleys and deltas, floating ice', () => {
  const held = Wd.held, afloat = Wd.afloat;
  const water = () => { let v = Air.airWater(); for (let k = 0; k < W * H; k++) { if (typ[k] === C.WATER) v += liq[k]; if (solid[k] === C.WETDIRT || solid[k] === C.ICE) v += held[k]; } return v; };   // plants sprouting on the wet soil breathe water out into the air
  // water poured on soil soaks in, sinks and gathers over the rock as a water table; none is made or lost
  clear(); devices.clear();
  box(20, 50, 20, 70, C.STONE); box(60, 50, 60, 70, C.STONE); box(20, 71, 60, 71, C.STONE);
  box(21, 56, 59, 70, C.DIRT);
  fill(21, 53, 59, 55, C.WATER, 20);
  const before = water(), pooled = vol(21, 59, 50, 55);
  run(3000);
  const deep = count(k => solid[k] === C.WETDIRT && ((k / W) | 0) >= 68), now = water();
  check('water on soil soaks down into a water table over the rock', vol(21, 59, 50, 55) < pooled / 2 && deep > 20, `${((pooled - vol(21, 59, 50, 55)) / 255).toFixed(1)} tiles soaked in, ${deep} wet tiles in the bottom rows`);
  check('groundwater neither makes nor loses water', Math.abs(now - before) < 255, `${(before / 255).toFixed(1)} → ${(now / 255).toFixed(1)} tiles`);
  // a well dug into soaked soil fills from the ground around it
  clear(); devices.clear();
  box(20, 50, 20, 70, C.STONE); box(60, 50, 60, 70, C.STONE); box(20, 71, 60, 71, C.STONE);
  box(21, 56, 59, 70, C.WETDIRT); for (let y = 56; y <= 70; y++) for (let x = 21; x <= 59; x++) held[at(x, y)] = Mt.SOIL_CAP;
  box(40, 56, 40, 66, C.AIR);
  run(600);
  check('a well dug into soaked soil fills with groundwater', vol(40, 40, 56, 66) > 255, `${(vol(40, 40, 56, 66) / 255).toFixed(1)} tiles in the well`);
  // a river through a tunnel wears its roof and banks away, and its silt builds a bed where it stills
  clear(); devices.clear(); fire.fill(0);
  box(20, 40, 80, 60, C.DIRT); box(20, 50, 79, 50, C.AIR); box(19, 40, 19, 60, C.STONE);   // stone on the left, so the spring feeds the tunnel
  const spring = place(C.SPRING, 20, 50); spring.liquid = C.WATER;
  place(C.DRAIN, 80, 50);
  const roof = () => count(k => solid[k] === C.DIRT && ((k / W) | 0) < 50 && (k % W) > 20 && (k % W) < 80);
  const roof0 = roof();
  run(4000);
  check('a river wears away the soil over it too, opening its channel into a valley', roof() < roof0 - 5, `${roof0 - roof()} tiles of the roof gone`);
  clear(); devices.clear();
  tank(40, 40, 50, 50);
  fill(41, 50, 49, 50, C.MUD, 20); fill(41, 42, 49, 49, C.WATER, 20); setSol(41, 42, 49, 49, C.SOL_SILT, 40);
  const bedNow = () => { let v = 0; for (let k = 0; k < W * H; k++) { if (typ[k] === C.MUD) v += liq[k]; if (solid[k] === C.DIRT) v += 255; } return v; };   // mud packs into dirt as it goes
  const bed = bedNow();
  run(800);
  check('still water lays even light silt on a mud bed: a delta grows', bedNow() > bed + 255, `mud and dirt bed ${(bed / 255).toFixed(1)} → ${(bedNow() / 255).toFixed(1)} tiles`);
  // lake ice floats: it drops with the water, comes up through water poured over it, and breaks off and drifts
  clear(); devices.clear();
  tank(40, 40, 60, 50);
  fill(41, 44, 59, 50, C.WATER, 20);
  for (let x = 41; x <= 59; x++) temp[at(x, 44)] = -30;
  run(2);   // one heat tick: the top row freezes
  const sheet = count(k => solid[k] === C.ICE && afloat[k]);
  check('a lake freezes over as floating ice', sheet >= 15, `${sheet} tiles of lake ice`);
  for (let y = 48; y <= 50; y++) for (let x = 41; x <= 59; x++) { liq[at(x, y)] = 0; typ[at(x, y)] = 0; }
  Wd.wakeAll(); temp.fill(-2);
  run(200);
  const lowered = count(k => solid[k] === C.ICE && ((k / W) | 0) >= 46);   // waves leave the new surface a little uneven
  check('the ice drops as the water under it drains', lowered >= sheet - 2, `${lowered} of ${sheet} at the new level`);
  for (let x = 41; x <= 59; x++) { liq[at(x, 46)] = 255; typ[at(x, 46)] = C.WATER; temp[at(x, 46)] = -2; }
  Wd.wakeAll();
  run(200);
  check('water poured over lake ice goes under it', count(k => solid[k] === C.ICE && ((k / W) | 0) === 46) >= sheet - 2);
  clear(); devices.clear();
  tank(30, 40, 70, 50);
  fill(31, 44, 69, 50, C.WATER, 0);
  for (let x = 33; x <= 40; x++) { liq[at(x, 44)] = 0; typ[at(x, 44)] = 0; solid[at(x, 44)] = C.ICE; afloat[at(x, 44)] = 1; }
  temp.fill(0); Wd.wakeAll();
  const meanX = () => { let s = 0, n = 0; for (let k = 0; k < W * H; k++) if (solid[k] === C.ICE) { s += k % W; n++; } return s / n; };
  const x0 = meanX();
  for (let i = 0; i < 400; i++) { for (let x = 31; x <= 69; x++) Wd.vel[at(x, 45)] = 0.8; temp.fill(0); step(); }
  const xs = []; for (let k = 0; k < W * H; k++) if (solid[k] === C.ICE) xs.push(k % W); xs.sort((a, b) => a - b);
  check('a current breaks pieces off the sheet and carries them away', meanX() > x0 + 3 && xs[xs.length - 1] - xs[0] > xs.length, `ice moved ${(meanX() - x0).toFixed(1)} tiles on average, spread over ${xs[xs.length - 1] - xs[0] + 1} columns`);
});

scene('a generated river keeps flowing and keeps its pond full', () => {
  let seed = 0;
  for (let i = 1; i <= 30 && !seed; i++) { S.seed = i * 7919; Gen.generate(); if (Bio.rivers.length) seed = S.seed; }
  const r = Bio.rivers[0], sx = r.src % W, dir = Math.sign(r.mouth - sx);
  const pond = () => { let v = 0; for (let x = r.mouth - 7; x <= r.mouth + 7; x++) for (let y = r.level; y < r.level + 5; y++) if (typ[at(x, y)] === C.WATER) v += liq[at(x, y)]; return v; };
  const flowing = () => { let n = 0; for (let x = sx + dir; x !== r.mouth - dir * 8; x += dir) for (let y = 0; y < H; y++) if (typ[at(x, y)] === C.WATER && liq[at(x, y)] && !Wd.under[at(x, y)]) { n++; break; } return n; };
  const full = pond(), store = r.store;
  run(3000);
  check('water runs down the whole channel', flowing() >= Math.abs(r.mouth - dir * 8 - sx) - 3, `${flowing()} of ${Math.abs(r.mouth - dir * 8 - sx) - 1} columns wet (seed ${seed})`);
  check('the pond stays mostly full and the spring keeps its water (the sun evaporates some, which comes back as rain)', pond() > full * 0.7 && r.store > store * 0.85, `pond ${(full / 255).toFixed(1)} → ${(pond() / 255).toFixed(1)} tiles, spring ${(store / 255).toFixed(0)} → ${(r.store / 255).toFixed(0)}`);
});

scene('the time of day can be held at day or night, or stopped, and carries on from there', () => {
  clear(); setClock(0.25);
  const { dayPhase, setTimeMode } = DayNight;
  setTimeMode('day'); run(600);
  const day = dayPhase();
  setTimeMode('night'); run(600);
  const night = dayPhase();
  setTimeMode('cycle'); setTimeMode('stop'); const held = dayPhase(); run(1200);
  const stopped = dayPhase();
  setTimeMode('cycle'); const resumed = dayPhase(); run(DAY_TICKS / 4);
  check('always day holds noon and always night holds midnight', day === 0.5 && night === 0, `${day}, ${night}`);
  check('stopped, the clock stands still', stopped === held);
  check('back on day and night, it carries on from where it was held', Math.abs(resumed - held) < 1e-9 && Math.abs(((dayPhase() - held) % 1 + 1) % 1 - 0.25) < 0.001, `held ${held.toFixed(3)}, a quarter day later ${dayPhase().toFixed(3)}`);
  setTimeMode('cycle'); S.timeShift = 0;
});

scene('custom levels: goals, ways to lose, and a level code that starts in the level', () => {
  const draft = over => ({ name: 'Test', goal: '', region: { x0: 40, y0: 50, x1: 50, y1: 60 }, kind: 'liquid', what: C.WATER, label: 'water', amount: 5,
    lose: 'none', loseWhat: null, loseLabel: '', loseAmount: 1, tools: ['water'], ...over });
  // fill the area with liquid
  clear(); devices.clear(); box(39, 61, 51, 61, C.STONE); box(39, 50, 39, 61, C.STONE); box(51, 50, 51, 61, C.STONE);
  Lvl.startCustom(draft({}));
  Lvl.checkLevel();
  const before = S.level.done;
  fill(40, 56, 50, 60, C.WATER, 20); run(30); Lvl.checkLevel();
  check('a liquid goal is met when the area holds enough', !before && S.level.done && S.level.goal === 'Fill the goal area with 5 tiles of water.', `${S.level.text}; goal text: ${S.level.goal}`);
  // lose: lava in the area
  clear(); devices.clear(); box(39, 61, 51, 61, C.STONE);
  Lvl.startCustom(draft({ lose: 'liquid', loseWhat: C.LAVA, loseLabel: 'lava' }));
  fill(44, 60, 44, 60, C.LAVA, 1000); Lvl.checkLevel();
  check('letting the forbidden liquid in loses', S.level.failed === 'Some lava got into the goal area.' && !S.level.done, S.level.failed);
  // creatures into the area, and keeping enough alive
  clear(); devices.clear(); box(30, 61, 60, 61, C.STONE);
  Lvl.startCustom(draft({ kind: 'creature', what: 'crate', label: 'crate', amount: 2, lose: 'creatures', loseWhat: 'fish', loseLabel: 'fish', loseAmount: 1 }));
  Bd.addBody('fish', 35 * C.T, 59 * C.T); Bd.addBody('crate', 42 * C.T, 55 * C.T); Bd.addBody('crate', 46 * C.T, 55 * C.T);
  run(5); Lvl.checkLevel();
  const fishLost = (() => { bodies.splice(bodies.findIndex(b => b.kind === 'fish'), 1); S.level.done = false; Lvl.checkLevel(); return S.level.failed; })();
  check('getting creatures into the area meets the goal, and losing the ones to keep fails it', fishLost === 'Fewer than 1 fish are left.', fishLost);
  // the explorer, and lit lamps
  clear(); devices.clear(); box(30, 61, 60, 61, C.STONE);
  Lvl.startCustom(draft({ kind: 'explorer', amount: 1 }));
  Bd.addBody('explorer', 45 * C.T, 56 * C.T); run(3); Lvl.checkLevel();
  const there = S.level.done;
  clear(); devices.clear(); box(30, 61, 60, 61, C.STONE);
  Lvl.startCustom(draft({ kind: 'lit', amount: 1 }));
  const lever = place(C.LEVER, 44, 60), lamp = place(C.LAMP, 46, 60); lever.targets.push(at(46, 60));
  run(3); Lvl.checkLevel(); const dark = S.level.done;
  lever.on = true; run(3); Lvl.checkLevel();
  check('the explorer and lamp goals', there && !dark && S.level.done && lamp.active);
  // a level code is a world code taken as the level starts: restoring it plays the level from the start
  clear(); devices.clear(); box(39, 61, 51, 61, C.STONE);
  Lvl.startCustom(draft({ amount: 3 }));
  const code = Sn.capture();
  fill(40, 56, 50, 60, C.WATER, 20); run(10); Lvl.checkLevel();
  Sn.restore(code); Lvl.checkLevel();
  check('a level code starts the level afresh', S.level && S.level.custom && !S.level.done && S.level.text === 'water 0/3', S.level && S.level.text);
  S.level = null;
});

scene('fine powders, gases that don’t shove, warm honey, planks, and pressure on by default', () => {
  const grainsAt = k => Wd.held[k] || 255;
  const powder = b => { let n = 0; for (let k = 0; k < W * H; k++) if (solid[k] === b) n += grainsAt(k); return n; };
  // boiling brine leaves just the salt that was in it, as grains: a pinch from weak brine, most of a tile from strong
  for (const [salt, lo, hi] of [[20, 10, 30], [200, 180, 220]]) {
    clear(); devices.clear(); box(39, 61, 41, 61, C.STONE); box(39, 59, 39, 60, C.STONE); box(41, 59, 41, 60, C.STONE);
    fill(40, 60, 40, 60, C.WATER, 100); setSol(40, 60, 40, 60, C.SOL_SALT, salt);
    for (let i = 0; i < 300 && typ[at(40, 60)] === C.WATER; i++) { temp[at(40, 61)] = 400; step(); }   // a hot plate under it
    run(10);
    check(`boiling brine with ${salt} salt leaves that much salt as grains`, powder(C.SALT) >= lo && powder(C.SALT) <= hi && typ[at(40, 60)] !== C.WATER, `${powder(C.SALT)} grains`);
  }
  // syrup leaves sugar, which caramelises when hot
  clear(); devices.clear(); box(39, 61, 41, 61, C.STONE); box(39, 59, 39, 60, C.STONE); box(41, 59, 41, 60, C.STONE);
  fill(40, 60, 40, 60, C.WATER, 100); setSol(40, 60, 40, 60, C.SOL_SUGAR, 120);
  for (let i = 0; i < 300 && typ[at(40, 60)] === C.WATER; i++) { temp[at(40, 61)] = 400; step(); }   // a hot plate under it
  run(10);
  const sugar = powder(C.SUGAR);
  temp[at(40, 60)] = 300; run(20);
  check('boiling syrup leaves sugar grains, which caramelise when hot', sugar > 80 && solid[at(40, 60)] === C.CRISP, `${sugar} sugar grains`);
  // thin layers settle onto each other into a pile; a thin layer doesn't stop a body; water dissolves it bit by bit
  clear(); devices.clear(); box(30, 61, 50, 61, C.STONE);
  for (let y = 50; y <= 57; y++) { solid[at(40, y)] = C.SALT; Wd.held[at(40, y)] = 40; }
  Wd.wakeAll(); run(60);
  const tiles = count(k => solid[k] === C.SALT), total = powder(C.SALT);
  check('thin layers fall and settle into a pile', total === 320 && tiles === 2 && grainsAt(at(40, 60)) === 255, `${tiles} tiles holding ${total} grains`);
  clear(); devices.clear(); box(30, 61, 50, 61, C.STONE);
  solid[at(40, 60)] = C.SAND; Wd.held[at(40, 60)] = 30;
  const crate = Bd.addBody('crate', 37 * C.T, 50 * C.T); run(60);
  check('a body comes to rest on the floor, not on top of a thin layer', crate.y + crate.h > 60 * C.T + 4, `crate bottom at ${(crate.y + crate.h).toFixed(1)}, floor at ${61 * C.T}`);
  clear(); devices.clear(); tank(38, 50, 44, 60);
  solid[at(41, 60)] = C.SALT; fill(39, 55, 43, 59, C.WATER, 20); for (const x of [39, 40, 42, 43]) { liq[at(x, 60)] = 255; typ[at(x, 60)] = C.WATER; }
  let partial = false;
  for (let i = 0; i < 60 && solid[at(41, 60)] === C.SALT; i++) { run(10); if (solid[at(41, 60)] === C.SALT && Wd.held[at(41, 60)]) partial = true; }
  check('water dissolves salt a little at a time', partial && solid[at(41, 60)] !== C.SALT && avgSol(39, 55, 43, 60, C.SOL_SALT) > 5);
  // gases don't hold up, carry or shove a body: the explorer stands in a room of oxygen as in air
  clear(); devices.clear(); box(30, 61, 50, 61, C.STONE); box(29, 40, 29, 61, C.STONE); box(51, 40, 51, 61, C.STONE);
  const ex = Bd.addBody('explorer', 40 * C.T, 61 * C.T - 11);
  fill(30, 41, 50, 60, C.OXYGEN, 20); for (let k = 0; k < W * H; k++) if (typ[k] === C.OXYGEN && Math.abs((k % W) - 40) < 2 && ((k / W) | 0) > 58) { liq[k] = 0; typ[k] = 0; }
  const x0 = ex.x; run(120);
  check('a gas doesn’t carry or lift the explorer', Math.abs(ex.x - x0) < 1 && ex.y + ex.h >= 61 * C.T - 0.5 && !ex.wet, `moved ${(ex.x - x0).toFixed(2)} px`);
  // warm honey runs, cold honey crawls
  const spread = T0 => {   // kept at its temperature while it spreads
    clear(); devices.clear(); box(20, 61, 80, 61, C.STONE); fill(48, 55, 52, 60, C.HONEY, T0);
    for (let i = 0; i < 240; i++) { for (let k = 0; k < W * H; k++) if (typ[k] === C.HONEY) temp[k] = T0; step(); }
    return count(k => typ[k] === C.HONEY);
  };
  const cold = spread(0), warm = spread(70);
  check('warm honey spreads faster than cold honey', warm > cold * 1.3, `${warm} tiles warm, ${cold} cold`);
  // a blast through wood throws out planks, which float
  clear(); devices.clear(); box(20, 61, 80, 61, C.STONE); box(45, 50, 55, 60, C.WOOD); solid[at(50, 55)] = 0; liq[at(50, 55)] = 255; typ[at(50, 55)] = C.NITRO; Wd.wakeAll();
  temp[at(50, 55)] = 400; Wd.heatWake(at(50, 55)); run(10);
  check('blasted wood flies out as planks', bodies.some(b => b.kind === 'plank'), `${bodies.filter(b => b.kind === 'plank').length} planks`);
  // pressure is on by default: two shafts joined by a long, low tunnel level out
  clear(); devices.clear();
  box(15, 10, 125, 72, C.STONE);
  for (let y = 15; y <= 70; y++) { solid[at(20, y)] = 0; solid[at(21, y)] = 0; solid[at(120, y)] = 0; solid[at(121, y)] = 0; }
  for (let x = 20; x <= 121; x++) solid[at(x, 70)] = 0;
  fill(20, 15, 21, 69, C.WATER, 20); Wd.wakeAll();
  run(6000);
  const top = x => { let y = 0; while (y < H && !liq[at(x, y)]) y++; return y; };
  check('pressure is on by default: shafts joined by a long tunnel level out', S.pressure && Math.abs(top(20) - top(120)) <= 2, `left arm at row ${top(20)}, right at ${top(120)}`);
});

scene('a living world: seasons in the leaves, birds that hunt moths, hail and flash floods', async () => {
  const Tr2 = await import('../js/render/terrain.js'), { terr } = await import('../js/canvas.js');
  // the leaves are drawn in the season's colours: green in summer, orange-red in autumn, sparse in winter
  clear(); devices.clear(); S.weather = true;
  solid[at(40, 50)] = C.LEAF;
  const leafPixels = step => { Tr2.setShownSeason(step); Tr2.drawTile(40, 50); const px = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = terr[(50 * 8 + y) * C.PW + 40 * 8 + x]; if ((c >>> 24) === 255) px.push(c); } return px; };
  const avg = (px, sh) => px.reduce((n, c) => n + ((c >>> sh) & 255), 0) / px.length;
  const summer = leafPixels(4), autumn = leafPixels(6), winter = leafPixels(0);
  const steps = [0, 2, 4, 6].map(d => { S.tick = Math.round(d * DAY_TICKS); return Clim.seasonStep(); });
  check('the leaves turn with the seasons: green in summer, orange-red in autumn, sparse in winter',
    avg(summer, 8) > avg(summer, 0) && avg(autumn, 0) > avg(autumn, 8) && winter.length < summer.length * 0.6 && steps.join() === '2,4,6,0', `steps ${steps.join()}, ${summer.length} summer pixels, ${winter.length} winter`);
  Tr2.setShownSeason(4); S.weather = false;
  // a bird chases down a moth and eats it; at night it roosts
  clear(); devices.clear(); setClock(0.5); box(20, 70, 120, 70, C.STONE);
  const bird = Bd.addBody('bird', 30 * C.T, 60 * C.T), moth = Bd.addBody('moth', 70 * C.T, 64 * C.T);
  run(600);
  check('a bird chases down a moth and eats it', !bodies.includes(moth) && bodies.includes(bird) && bird.hunger < 600, `bird hunger ${bird.hunger}`);
  setClock(0.02); run(400);
  check('at night birds come down and roost', bird.resting && bird.y + bird.h >= 70 * C.T - 1, `bird at row ${((bird.y + bird.h) / C.T).toFixed(1)}`);
  // a storm cloud that's above freezing but cold aloft drops hail: it knocks leaves off and melts into water
  sky(0); setClock(0.5);
  for (let x = 40; x <= 47; x++) solid[at(x, 90)] = C.LEAF;
  const c = 5 * Air.AW + 11;   // a cell over x 44-47
  const leaves = count(k => solid[k] === C.LEAF);
  let hail = 0;
  for (let i = 0; i < 80; i++) { Air.cloud[c] = 900; Air.cellT[c] = 4; Air.precipitate(); hail = Math.max(hail, count(k => solid[k] === C.SNOW && Wd.held[k] === Air.HAIL)); run(2); }   // the drops fall clear between
  run(600);
  check('a cold-topped storm drops hail that knocks leaves off, and the hail melts into water', hail > 0 && count(k => solid[k] === C.LEAF) < leaves && count(k => solid[k] === C.SNOW) === 0 && count(k => typ[k] === C.WATER) > 0,
    `${hail} hailstones at once, ${leaves - count(k => solid[k] === C.LEAF)} leaves knocked off`);
  // a flash flood: a cloudburst over a dry region takes its water from the sky, making none
  sky(0); setClock(0.5); Air.hum.fill(80);
  Bio.regions.length = 0; Bio.regions.push({ b: 4, x0: 100, x1: 200, spell: null, left: 0, hum: 0.15 });
  const before = Air.airWater(), got = Bio.cloudburst(Bio.regions[0]), after = Air.airWater();
  let rained = 0;
  for (let i = 0; i < 20; i++) { run(20); rained = Math.max(rained, vol(100, 200, 0, 99)); }
  check('a flash flood gathers the sky’s moisture over a dry region and pours it down', got > 255 * 20 && Math.abs(after - before) < 1 && rained > 255 * 10, `${(got / 255).toFixed(0)} tiles of water gathered, ${(rained / 255).toFixed(0)} on the ground at most`);
  Bio.regions.length = 0;
});

scene('matter: heat is conserved, melting and boiling take latent heat, liquids layer by real density', async () => {
  const Ht = await import('../js/heat.js'), M = await import('../js/matter.js');
  const woolBox = (x0, y0, x1, y1) => { for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) if (x <= x0 || x >= x1 || y <= y0 || y >= y1) { solid[at(x, y)] = C.WOOL; temp[at(x, y)] = 20; } };   // walls three tiles thick
  const heatIn = (x0, y0, x1, y1) => { Ht.fillMatter(); let e = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) e += Ht.cap[at(x, y)] * temp[at(x, y)] + Wd.latent[at(x, y)]; return e; };
  // a 300° iron block dropped into 20 tiles of 20° water: water stores about 20× the heat per tile, so it ends near 32°
  clear(); devices.clear(); woolBox(40, 40, 46, 45);
  fill(41, 41, 45, 44, C.WATER, 20); liq[at(43, 42)] = 0; typ[at(43, 42)] = 0; solid[at(43, 42)] = C.METAL; temp[at(43, 42)] = 300;
  const e0 = heatIn(38, 38, 48, 47), want = (M.BCAP[C.METAL] * 300 + 19 * M.LCAP[C.WATER] * 20) / (M.BCAP[C.METAL] + 19 * M.LCAP[C.WATER]);
  run(800);
  let wsum = 0; for (let y = 41; y <= 44; y++) for (let x = 41; x <= 45; x++) if (typ[at(x, y)] === C.WATER) wsum += temp[at(x, y)];
  const e1 = heatIn(38, 38, 48, 47), water = wsum / 19;
  check('hot iron in water warms it by the heat it brings: the water ends near the mixed temperature', Math.abs(water - want) < 2.5 && Math.abs(temp[at(43, 42)] - want) < 4 && Math.abs(e1 - e0) < e0 * 0.05, `water ${water.toFixed(1)}°, iron ${temp[at(43, 42)].toFixed(1)}°, expected ${want.toFixed(1)}°; heat in the box and its walls ${(100 * (e1 - e0) / e0).toFixed(1)}% changed`);
  // ice in a drink holds it at 0° while it melts; there's more ice than the water's heat can melt
  clear(); devices.clear(); woolBox(40, 40, 47, 43);
  fill(41, 41, 46, 41, C.WATER, 20); box(41, 42, 46, 42, C.ICE); box(41, 41, 42, 41, C.ICE); liq[at(41, 41)] = liq[at(42, 41)] = 0; typ[at(41, 41)] = typ[at(42, 41)] = 0;
  for (let x = 41; x <= 46; x++) temp[at(x, 42)] = -5; temp[at(41, 41)] = temp[at(42, 41)] = -5;
  for (let y = 38; y <= 45; y++) for (let x = 38; x <= 49; x++) if (solid[at(x, y)] === C.WOOL) temp[at(x, y)] = 0;
  run(800);
  let ws = 0, wn = 0; for (let x = 41; x <= 46; x++) for (let y = 41; y <= 42; y++) if (typ[at(x, y)] === C.WATER) { ws += temp[at(x, y)]; wn++; }
  const ice = count(k => solid[k] === C.ICE), wt = wn ? ws / wn : 99;
  check('ice holds the water round it near 0° while it melts', wt > -0.5 && wt < 1.5 && ice > 0 && ice < 8, `the water at ${wt.toFixed(2)}° on average, ${ice} of 8 ice tiles left`);
  // a pot on a hot plate boils at 100° and stays there while it boils away
  clear(); devices.clear(); tank(40, 50, 46, 60); box(41, 61, 45, 61, C.STONE);
  fill(41, 57, 45, 60, C.WATER, 90);
  let hottest = 0, steam = 0;
  for (let i = 0; i < 1500; i++) {
    for (let x = 41; x <= 45; x++) temp[at(x, 61)] = 600;
    step(); if (S.tick & 1) continue;   // look just after each heat tick
    let s = 0, n = 0; for (let k = 0; k < W * H; k++) if (typ[k] === C.WATER && liq[k] > 64) { s += temp[k]; n++; }
    if (n) hottest = Math.max(hottest, s / n);
    steam = Math.max(steam, count(k => typ[k] === C.STEAM));
  }
  check('boiling water stays at 100° while it turns to steam', hottest <= 100.5 && hottest > 99 && steam > 3, `the pot at ${hottest.toFixed(1)}° at most, ${steam} steam tiles at most`);
  // real densities: ferrofluid (magnetite in oil, 1.3) sinks through water and oil but floats on honey, lye and acid
  for (const [t, sinks] of [[C.WATER, true], [C.OIL, true], [C.HONEY, false], [C.LYE, false], [C.ACID, false]]) {
    clear(); devices.clear(); box(40, 51, 44, 51, C.GLASS); box(40, 40, 40, 50, C.GLASS); box(44, 40, 44, 50, C.GLASS);   // glass: acid doesn't eat it
    fill(41, 47, 43, 50, t, 20); fill(41, 45, 43, 46, C.FERRO, 20);
    run(600);
    const low = count(k => typ[k] === C.FERRO && ((k / W) | 0) >= 48 && ((k / W) | 0) <= 50);
    check(`ferrofluid ${sinks ? 'sinks through' : 'floats on'} ${['', 'water', '', 'honey', '', '', 'acid', '', '', 'oil'][t] || 'lye'}`, sinks ? low > 0 : low === 0, `${low} ferrofluid tiles at the bottom`);
  }
});

scene('chemistry: acids, bases, lime, charcoal, glass, thermite, chlorine and bleach', () => {
  const glassTank = (x0, y0, x1, y1) => { box(x0, y1 + 1, x1, y1 + 1, C.GLASS); box(x0, y0, x0, y1, C.GLASS); box(x1, y0, x1, y1, C.GLASS); };   // acid can't eat glass
  const blocks = b => count(k => solid[k] === b);
  // acid: fizzes CO2 off limestone, leaving salt; granite (stone) resists it
  clear(); devices.clear(); glassTank(40, 40, 50, 50);
  box(41, 50, 45, 50, C.LIMESTONE); box(46, 50, 49, 50, C.STONE); fill(41, 46, 49, 49, C.ACID, 20);
  run(600);
  check('acid fizzes carbon dioxide off limestone and leaves salt; stone resists it', blocks(C.LIMESTONE) < 3 && blocks(C.STONE) >= 4 + 22 && gasVol(C.CO2) + count(k => typ[k] === C.CO2) > 0, `${blocks(C.LIMESTONE)} of 5 limestone left, CO2 ${gasVol(C.CO2)}`);
  // acid on metals: zinc and iron give hydrogen; copper and gold don't react
  clear(); devices.clear(); glassTank(40, 40, 52, 50);
  solid[at(41, 50)] = solid[at(42, 50)] = C.ZINC; solid[at(44, 50)] = solid[at(45, 50)] = C.METAL; solid[at(47, 50)] = solid[at(48, 50)] = C.COPPER; solid[at(50, 50)] = solid[at(51, 50)] = C.GOLD;
  fill(41, 44, 51, 49, C.WATER, 20); setSol(41, 44, 51, 50, C.SOL_ACID, 220);
  for (let x = 41; x <= 51; x++) if (!solid[at(x, 50)]) { liq[at(x, 50)] = 255; typ[at(x, 50)] = C.WATER; sol[at(x, 50) * N + C.SOL_ACID] = 220; }
  let h2 = 0; for (let i = 0; i < 40; i++) { run(30); h2 = Math.max(h2, gasVol(C.HYDROGEN)); }
  check('acid dissolves zinc and iron, giving hydrogen and metal salts; copper and gold resist', blocks(C.ZINC) < 2 && h2 > 0 && blocks(C.COPPER) === 2 && blocks(C.GOLD) === 2 && avgSol(41, 44, 51, 50, C.SOL_METAL) > 0,
    `${blocks(C.ZINC)} zinc, ${blocks(C.METAL) - 0} iron left; ${h2} hydrogen at most`);
  // lye on aluminium gives hydrogen too
  clear(); devices.clear(); glassTank(40, 40, 46, 50); box(41, 50, 45, 50, C.ALUMINIUM); fill(41, 46, 45, 49, C.LYE, 20);
  h2 = 0; for (let i = 0; i < 40; i++) { run(30); h2 = Math.max(h2, gasVol(C.HYDROGEN)); }
  check('lye eats aluminium, giving hydrogen', blocks(C.ALUMINIUM) < 5 && h2 > 0, `${blocks(C.ALUMINIUM)} of 5 aluminium left`);
  // the lime cycle: limestone burns to quicklime above 825°, which slakes hot in water and hardens again in CO2
  clear(); devices.clear(); box(40, 50, 44, 50, C.LIMESTONE);
  for (let i = 0; i < 200; i++) { for (let x = 40; x <= 44; x++) temp[at(x, 50)] = 900; step(); }
  check('limestone burns into quicklime above 825°, giving off CO2', blocks(C.QUICKLIME) >= 4 && gasVol(C.CO2) > 0, `${blocks(C.QUICKLIME)} quicklime`);
  clear(); devices.clear(); tank(40, 40, 46, 50); box(41, 50, 45, 50, C.QUICKLIME); fill(41, 47, 45, 49, C.WATER, 20);
  let hottest = 0; for (let i = 0; i < 300; i++) { step(); for (let x = 41; x <= 45; x++) hottest = Math.max(hottest, temp[at(x, 50)]); }
  check('water slakes quicklime into lime, hot enough to boil', blocks(C.LIME) >= 3 && hottest > 100, `${blocks(C.LIME)} lime, hottest ${hottest.toFixed(0)}°`);
  clear(); devices.clear(); tank(40, 40, 46, 50); box(41, 50, 45, 50, C.LIME); fill(41, 48, 45, 49, C.CO2, 20);
  run(600);
  check('lime mortar takes up CO2 and hardens back into limestone', blocks(C.LIMESTONE) >= 3, `${blocks(C.LIMESTONE)} limestone`);
  // baking soda breaks down when heated; wood shut off from air chars into charcoal; burnt wood leaves ash
  clear(); devices.clear(); box(40, 50, 44, 50, C.SODA); box(39, 51, 45, 51, C.STONE);
  for (let i = 0; i < 200; i++) { for (let x = 40; x <= 44; x++) temp[at(x, 50)] = 200; step(); }
  check('heated baking soda breaks down into carbon dioxide', blocks(C.SODA) === 0 && gasVol(C.CO2) > 0);
  clear(); devices.clear(); fire.fill(0); box(39, 49, 45, 53, C.STONE); box(40, 50, 44, 52, C.WOOD);   // sealed in stone
  for (let i = 0; i < 300; i++) { for (let x = 39; x <= 45; x++) { temp[at(x, 53)] = 500; } for (let y = 50; y <= 52; y++) for (let x = 40; x <= 44; x++) temp[at(x, y)] = Math.max(temp[at(x, y)], 400); step(); }
  check('wood heated without air chars into charcoal', blocks(C.CHARCOAL) >= 8 && count(k => fire[k]) === 0, `${blocks(C.CHARCOAL)} of 15 charcoal`);
  clear(); devices.clear(); fire.fill(0); box(40, 50, 60, 50, C.STONE); box(40, 49, 60, 49, C.WOOD); temp[at(40, 49)] = 400;
  run(3000);
  check('wood burnt in the open leaves ash', blocks(C.WOOD) === 0 && blocks(C.ASH) > 0, `${blocks(C.ASH)} ash, ${blocks(C.WOOD)} wood left`);
  // glass: sand with soda melts above 1000°; sand on its own needs 1700°
  clear(); devices.clear();
  solid[at(40, 50)] = C.SAND; solid[at(41, 50)] = C.SODA; solid[at(45, 50)] = C.SAND; box(39, 51, 46, 51, C.STONE);
  for (let i = 0; i < 200; i++) { temp[at(40, 50)] = temp[at(41, 50)] = temp[at(45, 50)] = 1200; step(); }
  check('sand with soda melts into glass at 1200°; sand alone doesn’t', solid[at(40, 50)] === C.GLASS && solid[at(45, 50)] === C.SAND, `blocks ${solid[at(40, 50)]}, ${solid[at(45, 50)]}`);
  // thermite: aluminium and rust, lit above 1500°, burn into white-hot iron
  clear(); devices.clear(); box(39, 51, 46, 51, C.STONE); box(40, 50, 42, 50, C.RUST); box(43, 50, 45, 50, C.ALUMINIUM);
  // a sparkler held to it for a moment
  let molten = 0, hot = 0; for (let i = 0; i < 60; i++) { if (i < 12) temp[at(43, 50)] = 1600; step(); molten = Math.max(molten, count(k => typ[k] === C.MOLTEN)); for (let k = 0; k < W * H; k++) if (typ[k] === C.MOLTEN) hot = Math.max(hot, temp[k]); }
  check('thermite: lit aluminium and rust burn into white-hot iron', molten > 0 && hot > 2000, `${molten} molten iron tiles, ${hot.toFixed(0)}°`);
  // strong acid chars sugar into carbon
  clear(); devices.clear(); glassTank(40, 40, 44, 50); box(41, 50, 43, 50, C.SUGAR); fill(41, 48, 43, 49, C.ACID, 20);
  run(400);
  check('strong acid chars sugar into black carbon', blocks(C.CHARCOAL) > 0, `${blocks(C.CHARCOAL)} carbon`);
  // electrolysis: strong brine gives chlorine (and turns to lye); weak brine gives oxygen
  for (const [salt, want] of [[60, C.OXYGEN], [255, C.CHLORINE]]) {
    clear(); devices.clear(); tank(40, 40, 60, 50);
    fill(41, 44, 59, 50, C.WATER, 20); setSol(41, 44, 59, 50, C.SOL_SALT, salt);
    box(50, 34, 50, 47, C.METAL); for (let y = 44; y <= 47; y++) { liq[at(50, y)] = 0; typ[at(50, y)] = 0; }
    place(C.LEVER, 49, 34).on = true;
    run(900);
    const other = want === C.OXYGEN ? C.CHLORINE : C.OXYGEN;
    check(`electrolysis of ${salt === 255 ? 'strong brine gives chlorine and leaves lye' : 'weak brine gives oxygen'}`, gasVol(want) > gasVol(other) && gasVol(C.HYDROGEN) > 0 && (want === C.OXYGEN || avgSol(41, 44, 59, 50, C.SOL_BASE) > 0),
      `${gasVol(C.CHLORINE)} chlorine, ${gasVol(C.OXYGEN)} oxygen, ${gasVol(C.HYDROGEN)} hydrogen`);
  }
  // chlorine and lye make bleach; bleach and acid give chlorine back; chlorine dissolves into water as acid
  clear(); devices.clear(); glassTank(40, 40, 44, 50); fill(41, 48, 43, 50, C.LYE, 20); fill(41, 44, 43, 46, C.CHLORINE, 20);
  run(300);
  check('chlorine bubbled through lye makes bleach', count(k => typ[k] === C.BLEACH) > 0);
  clear(); devices.clear(); glassTank(40, 40, 44, 50); fill(41, 49, 43, 50, C.ACID, 20); fill(41, 46, 43, 48, C.BLEACH, 20);
  run(200);
  check('bleach and acid give off chlorine', gasVol(C.CHLORINE) > 0);
  clear(); devices.clear(); tank(40, 40, 44, 50); fill(41, 48, 43, 50, C.WATER, 20); fill(41, 45, 43, 46, C.CHLORINE, 20);
  run(400);
  check('chlorine dissolves into water as acid', avgSol(41, 48, 43, 50, C.SOL_ACID) > 0);
  // hydrogen and chlorine explode when lit, as hydrogen and oxygen do
  clear(); devices.clear(); fire.fill(0); box(30, 20, 60, 20, C.STONE); box(30, 20, 30, 30, C.STONE); box(60, 20, 60, 30, C.STONE); box(30, 30, 60, 30, C.STONE);
  for (let y = 21; y <= 29; y++) for (let x = 31; x <= 59; x++) { liq[at(x, y)] = 255; typ[at(x, y)] = (x + y) % 3 ? C.HYDROGEN : C.CHLORINE; } Wd.wakeAll();
  const stone = blocks(C.STONE); temp[at(45, 25)] = 1000;
  run(60);
  check('hydrogen and chlorine explode when lit', blocks(C.STONE) < stone, `${stone - blocks(C.STONE)} blocks broken`);
  // copper goes green in wet air
  clear(); devices.clear(); box(40, 50, 50, 50, C.COPPER); box(40, 51, 50, 51, C.STONE);
  for (let x = 40; x <= 50; x += 2) { liq[at(x, 49)] = 40; typ[at(x, 49)] = C.WATER; }
  for (let i = 0; i < 30; i++) { for (let x = 40; x <= 50; x += 2) { liq[at(x, 49)] = 40; typ[at(x, 49)] = C.WATER; } run(200); }
  check('copper goes green in wet air', blocks(C.PATINA) > 0, `${blocks(C.PATINA)} green copper`);
});

scene('the deep caverns, rust, and frozen nitro', () => {
  // iron rusts where water and air both reach it, several times faster in brine; deep under water, much more slowly.
  // Metal studs in a shallow pool reach the air above it; the same studs under a deep pool don't.
  const rusted = (salt, deep) => {
    clear(); devices.clear(); tank(40, 40, 60, 50);
    for (let x = 41; x <= 59; x += 2) solid[at(x, 50)] = C.METAL;   // on the tank's floor
    for (let y = deep ? 44 : 50; y <= 50; y++) for (let x = 41; x <= 59; x++) if (!solid[at(x, y)]) { liq[at(x, y)] = 255; typ[at(x, y)] = C.WATER; }
    setSol(41, 44, 59, 50, C.SOL_SALT, salt); Wd.wakeAll();
    run(1200);
    return count(k => solid[k] === C.RUST);
  };
  const fresh = rusted(0, false), brine = rusted(150, false), sunk = rusted(150, true);   // under saturation, so no salt crystals grow over the metal
  check('iron rusts where water and air meet, several times faster in brine', brine > fresh + 2 && brine >= 4, `${fresh} of 10 studs rusted in fresh water, ${brine} in brine`);
  check('iron deep under water, out of the air, rusts much more slowly', sunk < brine, `${sunk} of 10 rusted deep under brine`);
  clear(); devices.clear();
  box(40, 50, 60, 50, C.RUST); for (let i = 0; i < 200; i++) { for (let x = 40; x <= 60; x++) temp[at(x, 50)] = 300; step(); }
  check('heated rust dries into red iron oxide (ore)', count(k => solid[k] === C.ORE) > 15 && count(k => solid[k] === C.RUST) < 6, `${count(k => solid[k] === C.ORE)} ore`);
  clear(); devices.clear(); box(40, 50, 60, 50, C.RUST); box(39, 45, 39, 50, C.STONE); box(61, 45, 61, 50, C.STONE);
  fill(40, 47, 60, 49, C.ACID, 20); run(300);
  check('acid eats rust', count(k => solid[k] === C.RUST) < 21, `${count(k => solid[k] === C.RUST)} of 21 rust tiles left`);
  // nitro freezes below 10° into a block, safe where it is, and thaws back into the same amount of nitro; heat still sets it off
  clear(); devices.clear(); tank(40, 40, 50, 50);
  fill(41, 49, 49, 50, C.NITRO, 0); liq[at(41, 49)] = 100;
  for (let y = 38; y <= 52; y++) for (let x = 38; x <= 52; x++) temp[at(x, y)] = 0;
  const nitro0 = gasVol(C.NITRO);
  run(60);
  const frozen = count(k => solid[k] === C.FNITRO);
  check('nitro freezes into a block below 10°', frozen === 18 && gasVol(C.NITRO) === 0, `${frozen} frozen tiles`);
  for (let y = 38; y <= 52; y++) for (let x = 38; x <= 52; x++) temp[at(x, y)] = 25;
  run(60);
  check('frozen nitro thaws back into as much nitro as froze', count(k => solid[k] === C.FNITRO) === 0 && gasVol(C.NITRO) === nitro0, `${gasVol(C.NITRO)} of ${nitro0}`);
  clear(); devices.clear(); box(40, 50, 60, 50, C.STONE); solid[at(50, 49)] = C.FNITRO; temp[at(50, 49)] = 0;
  const stone = count(k => solid[k] === C.STONE);
  temp[at(50, 49)] = 300; run(10);
  check('heat sets frozen nitro off', count(k => solid[k] === C.STONE) < stone && solid[at(50, 49)] !== C.FNITRO, `${stone - count(k => solid[k] === C.STONE)} stone blocks broken`);
  // a generated world has deep caverns in each fifth: crystal-lit halls with quicksilver, oil or aether in them
  S.seed = 31337; Gen.generate();
  const deep = (pred, x0, x1) => { let n = 0; for (let y = (H * 0.72) | 0; y < H - 8; y++) for (let x = x0; x < x1; x++) if (pred(at(x, y))) n++; return n; };
  const fifths = [0, 1, 2, 3, 4].map(i => [Math.round(i * W / 5), Math.round((i + 1) * W / 5)]);
  const open = fifths.map(([a, b]) => deep(k => !solid[k], a, b)), crystals = fifths.map(([a, b]) => deep(k => solid[k] === C.CRYSTAL, a, b));
  const aether0 = deep(k => typ[k] === C.AETHER, 0, W);
  check('every fifth of the world has a deep cavern lit by crystals', open.every(n => n > 150) && crystals.every(n => n >= 4), `open tiles ${open.join(', ')}; crystals ${crystals.join(', ')}`);
  check('the caverns hold quicksilver, oil and aether', deep(k => typ[k] === C.QUICK, 0, W) > 30 && deep(k => typ[k] === C.OIL, 0, W) > 30 && aether0 > 20, `${aether0} tiles of aether`);
  run(600);
  check('the aether stays under the caverns’ roofs', deep(k => typ[k] === C.AETHER, 0, W) >= aether0 * 0.8, `${deep(k => typ[k] === C.AETHER, 0, W)} of ${aether0}`);
});

// ---- drawing: every block can be drawn ----
// ---- chemistry: electrolysis, gas mixtures, smelting ----
const gasVol = t => { let v = 0; for (let k = 0; k < W * H; k++) if (typ[k] === t) v += liq[k]; return v; };
scene('electrolysis splits water into hydrogen and oxygen', () => {
  // brine carries the power itself
  clear(); devices.clear();
  tank(40, 40, 60, 50);
  fill(41, 44, 59, 50, C.WATER, 20); setSol(41, 44, 59, 50, C.SOL_SALT, 80);   // salty enough to conduct, far from saturated
  const lever = place(C.LEVER, 45, 43);
  run(200);
  const idle = gasVol(C.HYDROGEN) + gasVol(C.OXYGEN), water0 = gasVol(C.WATER);
  lever.on = true; run(600);
  const h = gasVol(C.HYDROGEN), o = gasVol(C.OXYGEN), lost = water0 - gasVol(C.WATER);
  check('live brine splits into hydrogen and oxygen, two parts to one', idle === 0 && o > 0 && h / o > 1.4 && h / o < 3, `${(h / 255).toFixed(1)} tiles of hydrogen, ${(o / 255).toFixed(1)} of oxygen`);
  check('the gas is the water it was split from', lost > 255 && Math.abs(h + o - lost) < lost * 0.1, `${(lost / 255).toFixed(1)} tiles of water gone, ${((h + o) / 255).toFixed(1)} of gas made`);
  check('hydrogen rises and oxygen pools just over the water', count(k => typ[k] === C.HYDROGEN && ((k / W) | 0) < 20) > 0 && count(k => typ[k] === C.OXYGEN && ((k / W) | 0) === 43) > 0);
  // fresh water doesn't conduct, but a live metal electrode dipped in it splits it where it touches
  for (const on of [false, true]) {
    clear(); devices.clear();
    tank(40, 40, 60, 50);
    fill(41, 44, 59, 50, C.WATER, 20);
    box(50, 34, 50, 47, C.METAL); liq[at(50, 44)] = liq[at(50, 45)] = liq[at(50, 46)] = liq[at(50, 47)] = 0;
    for (let y = 44; y <= 47; y++) typ[at(50, y)] = 0;
    place(C.LEVER, 49, 34).on = on;
    run(600);
    const gas = gasVol(C.HYDROGEN) + gasVol(C.OXYGEN);
    check(on ? 'a live metal electrode splits fresh water' : 'without power the electrode does nothing', on ? gas > 255 : gas === 0, `${(gas / 255).toFixed(1)} tiles of gas`);
  }
});
scene('hydrogen burns into steam; mixed with oxygen, hydrogen and methane explode', () => {
  const chamber = () => { clear(); devices.clear(); fire.fill(0); box(30, 20, 60, 20, C.STONE); box(30, 20, 30, 30, C.STONE); box(60, 20, 60, 30, C.STONE); box(30, 30, 60, 30, C.STONE); };
  const stone = () => count(k => solid[k] === C.STONE);
  chamber();
  fill(31, 21, 59, 29, C.HYDROGEN, 20);
  const walls = stone(), gas = gasVol(C.HYDROGEN);
  temp[at(31, 29)] = 1000;   // a spark
  run(60);
  check('a spark burns pure hydrogen into steam without a blast', gasVol(C.HYDROGEN) < gas / 10 && gasVol(C.STEAM) > gas * 0.8 && stone() === walls, `${(gasVol(C.HYDROGEN) / 255).toFixed(1)} tiles of hydrogen left, ${(gasVol(C.STEAM) / 255).toFixed(1)} of steam, ${walls - stone()} blocks broken`);
  for (const [name, fuel] of [['hydrogen', C.HYDROGEN], ['methane', C.METHANE]]) {
    chamber();
    fill(31, 21, 59, 29, fuel, 20);
    for (let y = 21; y <= 29; y++) for (let x = 31; x <= 59; x += 3) typ[at(x, y)] = C.OXYGEN;   // a mixture
    const walls = stone();
    run(5);
    for (let y = 24; y <= 26; y++) for (let x = 44; x <= 46; x++) temp[at(x, y)] = 1000;   // a patch, so it's sure to heat some of the fuel
    run(40);
    check(`${name} mixed with oxygen explodes when lit`, walls - stone() > 10, `${walls - stone()} blocks broken`);
  }
  // oxygen doesn't smother a fire the way other gases do: it feeds it, and is used up
  chamber();
  box(44, 26, 46, 29, C.WOOD);
  for (let y = 21; y <= 29; y++) for (let x = 31; x <= 59; x++) if (!solid[at(x, y)]) { liq[at(x, y)] = 255; typ[at(x, y)] = C.OXYGEN; }
  Wd.wakeAll();
  const o = gasVol(C.OXYGEN);
  temp[at(45, 26)] = 1000;
  let burning = 0;
  for (let i = 0; i < 120; i++) { step(); burning = Math.max(burning, count(k => fire[k] > 0)); }
  check('wood burns in oxygen and uses it up', burning > 2 && gasVol(C.OXYGEN) < o - 255, `${burning} tiles burning, ${((o - gasVol(C.OXYGEN)) / 255).toFixed(1)} tiles of oxygen used`);
});
scene('smelting: ore and charcoal give molten iron and slag', () => {
  const metal = () => count(k => solid[k] === C.METAL || typ[k] === C.MOLTEN), slag = () => count(k => solid[k] === C.SLAG || typ[k] === C.MSLAG);
  const lavaPool = withCharcoal => {
    clear(); devices.clear();
    tank(20, 60, 40, 70);
    fill(21, 62, 39, 70, C.LAVA, 1150);
    for (let y = 66; y <= 68; y++) for (let x = 28; x <= 33; x++) { liq[at(x, y)] = 0; typ[at(x, y)] = 0; solid[at(x, y)] = withCharcoal && x % 2 ? C.CHARCOAL : C.ORE; }
    Wd.wakeAll();
    run(600);
  };
  // lava (1150°) can't melt ore on its own (1565°): it takes carbon to get the iron out
  lavaPool(false);
  check('ore in lava alone stays ore', count(k => solid[k] === C.ORE) === 18 && metal() === 0, `${count(k => solid[k] === C.ORE)} ore left`);
  lavaPool(true);
  check('ore with charcoal in lava smelts into iron and slag, using the charcoal', count(k => solid[k] === C.ORE) <= 4 && metal() >= 4 && count(k => solid[k] === C.CHARCOAL) <= 3, `${count(k => solid[k] === C.ORE)} of 9 ore left, ${metal()} metal, ${slag()} slag`);
  // a charcoal fire: a furnace
  clear(); devices.clear(); fire.fill(0);
  box(40, 60, 46, 62, C.CHARCOAL); solid[at(43, 61)] = C.ORE;
  for (let x = 40; x <= 46; x++) temp[at(x, 60)] = 400;   // lit along the top
  for (let i = 0; i < 2400 && solid[at(43, 61)] === C.ORE; i++) step();
  check('ore packed in burning charcoal smelts', solid[at(43, 61)] !== C.ORE && metal() > 0, `ore at ${Math.round(temp[at(43, 61)])}°, ${metal()} metal`);
  // a boiler is far too cool
  clear(); devices.clear();
  place(C.BOILER, 60, 60); solid[at(61, 60)] = C.ORE; Wd.wakeAll();
  run(600);
  check('a boiler is too cool to smelt ore', solid[at(61, 60)] === C.ORE, `ore at ${Math.round(temp[at(61, 60)])}°`);
  // molten slag floats on molten metal, and water quenches it into slag
  clear(); devices.clear();
  tank(20, 60, 30, 70);
  fill(21, 66, 29, 70, C.MOLTEN, 1600); fill(21, 61, 29, 65, C.MSLAG, 1600);
  for (let y = 61; y <= 65; y++) for (let x = 21; x <= 29; x++) typ[at(x, y)] = y % 2 ? C.MOLTEN : C.MSLAG;   // stirred together
  run(60);
  let floats = true;
  for (let x = 21; x <= 29; x++) { let seenMetal = false; for (let y = 60; y <= 70; y++) { if (typ[at(x, y)] === C.MOLTEN || solid[at(x, y)] === C.METAL) seenMetal = true; else if (seenMetal && (typ[at(x, y)] === C.MSLAG || solid[at(x, y)] === C.SLAG)) floats = false; } }
  check('molten slag floats on molten metal', floats);
});
// ---- electricity: sensors, pixels, power fading along a line ----
scene('temperature and depth sensors, pixels, and power fading along long lines', () => {
  // a temperature sensor beside a boiler switches its lamp on once it's hotter than its setting
  for (const level of [50, 500]) {   // beside a 200° boiler in open air the sensor settles near 100°
    clear(); devices.clear();
    place(C.BOILER, 39, 60);
    const sensor = place(C.THERMO, 40, 60), lamp = place(C.LAMP, 50, 60);
    sensor.level = level; sensor.targets.push(at(50, 60));
    run(400);
    check(level === 50 ? 'a temperature sensor turns on above its setting' : 'and stays off below it', level === 50 ? lamp.active : !lamp.active, `sensor at ${Math.round(temp[at(40, 60)])}°`);
  }
  // a depth sensor on a tank's floor turns on under its setting's depth of liquid; gas doesn't count
  for (const [rows, t, want] of [[2, C.WATER, false], [6, C.WATER, true], [6, C.CO2, false]]) {
    clear(); devices.clear();
    tank(40, 50, 50, 70);
    const sensor = place(C.DEPTH, 45, 70), lamp = place(C.LAMP, 60, 70);
    sensor.targets.push(at(60, 70));
    fill(41, 70 - rows, 49, 69, t, 20);
    run(60);
    check(`a depth sensor under ${rows} rows of ${t === C.WATER ? 'water' : 'carbon dioxide'} is ${want ? 'on' : 'off'}`, lamp.active === want);
  }
  // pixels light while powered and don't pass power on to each other
  clear(); devices.clear();
  const lever = place(C.LEVER, 30, 60), a = place(C.PIXEL, 40, 60), b = place(C.PIXEL, 41, 60);
  lever.targets.push(at(40, 60)); lever.on = true;
  run(3);
  Dv.useDeviceTool(C.PIXEL, at(41, 60));
  check('a powered pixel lights; the one beside it stays dark', a.active && !b.active && b.colour === 1);
  // power fades along a line: metal carries it about 60 tiles, copper twice as far
  for (const [block, len, want] of [[C.METAL, 40, true], [C.METAL, 80, false], [C.COPPER, 80, true]]) {
    clear(); devices.clear();
    box(10, 60, 10 + len, 60, block);
    const lever = place(C.LEVER, 10, 59), lamp = place(C.LAMP, 10 + len, 59);
    lever.on = true; run(3);
    check(`${len} tiles of ${block === C.METAL ? 'metal' : 'copper'} ${want ? 'carry' : "don't carry"} power to the far end`, lamp.active === want && charged(at(10, 60)) && charged(at(10 + len, 60)) === want);
  }
});
const Mt = await import('../js/materials.js');
const Tr = await import('../js/render/terrain.js');
scene('every kind of block draws without errors', () => {
  clear(); devices.clear();
  const bad = [];
  for (let b = 1; b <= C.SOLAR; b++) {   // SOLAR is the highest block id
    solid[at(50, 50)] = b;
    try { Tr.drawTile(50, 50); } catch (e) { bad.push(`${b}: ${e.message}`); }
  }
  solid[at(50, 50)] = 0;
  check('every kind of block draws without errors', !bad.length, bad.join('; '));
});

if (process.env.SCENES) {   // a worker: run the scenes it was given
  for (const j of process.env.SCENES.split(',').map(Number)) {
    current = j; reseed(j);
    const t0 = performance.now();
    await scenes[j][1]();
    console.log(`${j}	TIME	${Math.round(performance.now() - t0)}`);
  }
  process.exitCode = failed ? 1 : 0;
} else {
  const args = process.argv.slice(2), words = args.filter(a => !a.startsWith('--')).map(a => a.toLowerCase());
  const full = args.includes('--full');
  if (args.includes('--list')) {
    scenes.forEach(([name, , quick]) => console.log(`${quick ? 'quick' : '     '}  ${name}`));
    process.exit(0);
  }
  const picked = scenes.map((sc, j) => j).filter(j => words.length ? words.some(w => scenes[j][0].toLowerCase().includes(w)) : full || scenes[j][2]);
  if (!picked.length) { console.log(`no scene matches ${words.join(', ')} (npm test -- --list shows them all)`); process.exit(1); }
  const { spawn } = await import('node:child_process');
  const os = await import('node:os');
  const n = Math.min(picked.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
  const t0 = performance.now();
  const runs = Array.from({ length: n }, (_, i) => new Promise(done => {
    const mine = picked.filter((_, j) => j % n === i);
    const child = spawn(process.execPath, [process.argv[1]], { env: { ...process.env, SCENES: mine.join(',') } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => process.stderr.write(d));
    child.on('close', (code, signal) => done({ out, code, signal, mine }));
  }));
  const results = await Promise.all(runs);
  const lines = results.flatMap(r => r.out.split('\n').filter(Boolean).map(l => l.split('\t')));
  const times = new Map(lines.filter(l => l[1] === 'TIME').map(l => [+l[0], +l[2]]));
  const checks = lines.filter(l => l[1] !== 'TIME').sort((a, b) => a[0] - b[0]);   // stable, so each scene's checks keep their order
  let last = -1;
  for (const l of checks) {
    if (+l[0] !== last) { last = +l[0]; console.log(`
${scenes[last][0]}  (${times.has(last) ? (times.get(last) / 1000).toFixed(1) + ' s' : 'did not finish'})`); }
    console.log('  ' + l.slice(1).join('	'));
  }
  const fails = checks.filter(l => l[1].startsWith('FAIL')).length;
  // a worker that dies (out of memory, an uncaught error) would otherwise just leave its scenes out of the report
  const crashed = results.filter(r => r.signal || r.mine.some(j => !times.has(j)));
  for (const r of crashed) {
    const lost = r.mine.filter(j => !times.has(j)).map(j => scenes[j][0]);
    console.log(`
worker crashed (exit ${r.code}${r.signal ? ', ' + r.signal : ''}); unfinished: ${lost.join('; ')}`);
  }
  const tier = words.length ? `matching ${words.join(', ')}` : full ? 'full' : 'quick';
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(fails || crashed.length ? `
${fails} check(s) failed${crashed.length ? `, ${crashed.length} worker(s) crashed` : ''} · ${tier} run, ${picked.length} scenes, ${secs} s`
    : `
all checks passed · ${tier} run, ${picked.length} scenes, ${secs} s`);
  process.exitCode = fails || crashed.length ? 1 : 0;
}
