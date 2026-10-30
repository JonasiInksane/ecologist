// Phase23 built-ins are solved through the same brush and device handlers as the player.
// Direct field changes below are clearly separated predicate/initial-charge falsification controls.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { C, Wd, at, box, clearWorld, reseed, step } from './test-support.mjs';
import { LEVELS, checkLevel, startLevel } from '../js/levels.js';
import { useDeviceTool } from '../js/devices.js';
import { ecoInventory, ecoState } from '../js/ecology.js';
import { FIRE_OX } from '../js/oxygen.js';
import { capture, restore } from '../js/snapshot.js';

// The shared DOM stub deliberately returns inert controls. Supply only a real brush value
// before importing input.js so selectTool/applyAt use the actual production brush mask.
const puzzleDocument = globalThis.document, puzzleBrush = { value: 0 };
globalThis.document = new Proxy(puzzleDocument, {
  get: (target, key) => key === 'getElementById'
    ? id => id === 'brush' ? puzzleBrush : target.getElementById(id)
    : Reflect.get(target, key),
});
const Input = await import('../js/input.js');
const { S, solid, liq, typ, temp, sol, held, airOx, airCarb, devices, fire } = Wd;
const FIRE_LEVEL = 9, STILL_LEVEL = 10, vent = at(52, 45), fireLever = at(36, 49), firstLog = at(41, 49);
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
function near(a, b, label, tolerance = 1e-7) { ok(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`); }
function start(index, seed = 73) {
  reseed(seed); startLevel(index);
  ok(!S.level.done && !S.level.failed, `${LEVELS[index].name} starts unfinished and playable`);
}
function choose(id) {
  ok(S.level.tools.includes(id), `scripted ${id} action is allowed by this level`);
  Input.selectTool(Input.TOOLS.findIndex(t => t.id === id));
  assert.equal(Input.tool.id, id);
}
function paint(id, x, y, radius = 0) {
  // Repeated controller samples are actual brush actions, never ideal temperature assignment.
  Input.selectTool(Input.TOOLS.findIndex(t => t.id === id));
  assert.ok(S.level.tools.includes(id) && Input.tool.id === id, 'only allowed selected tools may paint');
  puzzleBrush.value = radius; Input.applyAt(x, y, false);
}
function setVent(open) { choose('lever'); if (devices.get(fireLever).on !== open) useDeviceTool(C.LEVER, fireLever); }
function closeVent() { setVent(false); }
function lightLog() { choose('heat'); for (let i = 0; i < 7; i++) paint('heat', 41, 49); }
function advance(ticks, action = () => {}, stop = true) {
  let advanced = 0;
  for (let t = 0; t < ticks && (!stop || (!S.level.done && !S.level.failed)); t++) {
    action(t); step(); advanced++;
    if (!(t % 30)) checkLevel();
  }
  checkLevel(); return advanced;
}
function fuelPieces() { let n = 0; for (let x = 41; x <= 51; x++) if (solid[at(x, 49)] === C.WOOD || solid[at(x, 49)] === C.CHARCOAL) n++; return n; }
function chamberAir(field) { let sum = 0; for (let y = 41; y <= 49; y++) for (let x = 41; x <= 51; x++) sum += field[at(x, y)]; return sum; }
function materialStocks() { return { introduced: structuredClone(ecoState().introduced), removed: structuredClone(ecoState().removed) }; }
function unchangedStocks(before, label) { assert.deepEqual(materialStocks(), before, label); checks++; }
function stillInventory() {
  let carrier = 0, salt = 0;
  for (let k = 0; k < C.W * C.H; k++) {
    let amount = 0;
    if (liq[k] && (typ[k] === C.WATER || typ[k] === C.STEAM)) amount = liq[k];
    if (solid[k] === C.ICE) amount = held[k] || 255;
    carrier += amount; salt += amount / 255 * sol[k * C.NSOL + C.SOL_SALT];
    if (solid[k] === C.SALT || solid[k] === C.GEM) salt += held[k] || 255;
  }
  return { carrier, salt };
}
function receiver() {
  let carrier = 0, salt = 0;
  for (let y = 46; y <= 51; y++) for (let x = 41; x <= 49; x++) {
    const k = at(x, y);
    if (!solid[k] && typ[k] === C.WATER) carrier += liq[k];
    if (liq[k]) salt += sol[k * C.NSOL + C.SOL_SALT] * liq[k] / 255;
    if (solid[k] === C.ICE) salt += sol[k * C.NSOL + C.SOL_SALT] * (held[k] || 255) / 255;
    if (solid[k] === C.SALT || solid[k] === C.GEM) salt += held[k] || 255;
  }
  return { carrier, salt };
}
function stillActions(t) {
  if (t < 30) paint('heat', 55, 46, 5);
  else { paint('chill', 43, 40, 3); paint('chill', 47, 40, 3); }
}
function retainedStill(before, stocks, label) {
  const after = stillInventory();
  near(after.carrier, before.carrier, `${label} retains all water/steam/ice carrier`);
  near(after.salt, before.salt, `${label} retains all dissolved/crystalline salt`);
  unchangedStocks(stocks, `${label} creates or removes no material input`);
}

// Importing input first exercises a different module order from the focused fixture.
// It caught sim -> levels -> generate -> snapshot -> air reading hum before initialization.
const coldImport = spawnSync(process.execPath, ['--input-type=module', '-e', `
  const ctx = { createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }), putImageData(){}, drawImage(){} };
  function stub(){ return new Proxy(function(){}, { get:(f,k)=>k==='getContext'?()=>ctx:k===Symbol.toPrimitive?()=>0:k===Symbol.iterator?undefined:stub(), apply:()=>stub(), construct:()=>stub(), set:()=>true }); }
  globalThis.document=stub(); globalThis.addEventListener=()=>{}; globalThis.Option=function(){}; globalThis.matchMedia=()=>({matches:false});
  await import('./js/input.js'); console.log('fresh input import passed'); process.exit(0);
`], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000 });
ok(coldImport.status === 0 && coldImport.stdout.includes('fresh input import passed'), `fresh UI module entry imports without a cycle: ${coldImport.stderr}`);
ok(LEVELS.length === 11 && LEVELS[FIRE_LEVEL].name === 'The last breath' && LEVELS[STILL_LEVEL].name === 'Freshwater still', 'new built-ins append without changing existing puzzle indices');
for (const [index, x] of [[FIRE_LEVEL, 46], [STILL_LEVEL, 50]]) { assert.deepEqual(LEVELS[index].view, { x, y: 46, zoom: 2 }); checks++; }
for (const seed of [7, 73, 31337]) {
  start(FIRE_LEVEL, seed);
  ok(!devices.get(vent).open && !devices.get(fireLever).on, 'fire chamber starts with the wired vent visibly shut');
  near(fuelPieces(), 11, 'fire chamber starts with eleven pieces of fuel');
  near(airOx[at(46, 43)], FIRE_OX + 0.1, 'chamber starts with its measured oxygen-limited charge');
  ok(!fire[firstLog] && !S.level.seenFire, 'the player can read the goal before choosing to ignite');
  const stocks = materialStocks(), before = ecoInventory([]), oxygen = chamberAir(airOx), carbon = chamberAir(airCarb);
  closeVent(); lightLog(); const ticks = advance(600);
  ok(S.level.done && !S.level.failed && S.level.seenFire, `seed${seed} closes and lights the chamber through allowed actions`);
  ok(!devices.get(vent).open && fuelPieces() >= 8, 'successful fire solution actually shuts the vent and retains fuel');
  ok(![...fire].some((f, k) => f && k % C.W >= 41 && k % C.W <= 51 && ((k / C.W) | 0) >= 41 && ((k / C.W) | 0) <= 49), 'successful chamber has no remaining flame');
  ok(chamberAir(airOx) < oxygen && chamberAir(airCarb) > carbon, 'the extinguished fire consumed oxygen and produced CO2');
  near(chamberAir(airOx) + chamberAir(airCarb) / 10, oxygen + carbon / 10, 'sealed chamber retains its air reaction equivalents');
  const after = ecoInventory([]); near(after.n, before.n, 'fire retains tracked nitrogen'); near(after.p, before.p, 'fire retains tracked phosphorus');
  unchangedStocks(stocks, 'ignition/vent actions create or remove no material stocks');
  console.log(JSON.stringify({ level: FIRE_LEVEL, seed, ticks, fuel: fuelPieces(), text: S.level.text }));
}
for (const mode of ['idle', 'open without ignition', 'oxygen-free', 'leave vent open', 'sealed normal air']) {
  start(FIRE_LEVEL);
  if (mode === 'open without ignition' || mode === 'leave vent open') setVent(true);
  else if (mode !== 'idle') closeVent();
  // Initial-charge falsification controls isolate oxygen supply; they are not solutions.
  if (mode === 'oxygen-free' || mode === 'sealed normal air') for (let y = 41; y <= 49; y++) for (let x = 41; x <= 51; x++) airOx[at(x, y)] = mode === 'oxygen-free' ? 0 : Wd.AIR_OX;
  if (!['idle', 'open without ignition'].includes(mode)) lightLog();
  advance(1200);
  if (mode === 'leave vent open' || mode === 'sealed normal air') ok(S.level.failed === 'Too much of the fuel was lost.' && !S.level.done, `${mode} loses the finite fuel target`);
  else ok(!S.level.done && !S.level.failed && !S.level.seenFire && fuelPieces() === 11, `${mode} cannot fake an extinguished-fire victory`);
}
{
  start(FIRE_LEVEL); closeVent(); lightLog(); advance(31, () => {}, false);
  ok(S.level.seenFire && !S.level.done && !S.level.failed, 'ignition checkpoint has real observed fire before completion');
  const saved = capture(), fuel = fuelPieces(); clearWorld(19); restore(saved);
  ok(S.level.seenFire && !devices.get(vent).open && fuelPieces() === fuel, 'save restore retains observed ignition, shut vent and finite fuel');
  advance(600); ok(S.level.done && !S.level.failed, 'saved fire puzzle finishes through ordinary future simulation');
  startLevel(FIRE_LEVEL);
  ok(!S.level.done && !S.level.failed && !S.level.seenFire && fuelPieces() === 11 && !devices.get(vent).open, 'restart clears fire evidence and restores initial fuel/vent');
  advance(300); ok(!S.level.done && !S.level.seenFire, 'restarted unlit chamber cannot inherit the old victory');
}
{
  start(FIRE_LEVEL); const oxygen = chamberAir(airOx);
  advance(3000, () => {}, false);
  near(chamberAir(airOx), oxygen, 'long reading delay retains the original isolated oxygen charge');
  ok(!S.level.seenFire && !S.level.done && !S.level.failed, 'long reading delay neither wins nor loses the unlit puzzle');
  lightLog(); advance(600); ok(S.level.done && !S.level.failed, 'the unchanged finite charge still solves after a long reading delay');
}
for (const interval of [128, 256]) {
  start(FIRE_LEVEL); lightLog();
  for (let t = 0; t < interval; t++) step(); // goal UI deliberately does not poll during ignition
  ok(S.level.seenFire && !S.level.done && !S.level.failed, 'physics observation retains actual ignition while the goal UI is idle');
  checkLevel(); ok(S.level.done && !S.level.failed, `${interval}-tick goal polling cannot miss an already extinguished successful fire`);
}
{
  start(FIRE_LEVEL); setVent(true); lightLog();
  for (let t = 0; t < 30; t++) step();
  ok(devices.get(vent).open && [...fire].some(Boolean) && !S.level.seenFire, 'an open-vent flame does not supply evidence for a later retrospective closure');
}
{
  start(FIRE_LEVEL);
  for (let x = 41; x < 45; x++) solid[at(x, 49)] = C.CHARCOAL; // predicate control: charring retains useful fuel
  checkLevel(); ok(!S.level.failed && !S.level.done && fuelPieces() === 11, 'charcoal conversion alone is neither fuel destruction nor ignition evidence');
}
for (const seed of [7, 73, 31337]) {
  start(STILL_LEVEL, seed);
  const before = stillInventory(), stocks = materialStocks();
  near(before.carrier, 36 * 255, 'still starts with exactly thirty-six tiles of finite brine carrier');
  near(before.salt, 36 * 80, 'still starts with its measured finite salt charge');
  near(receiver().carrier, 0, 'still receiver starts empty');
  const ticks = advance(1200, stillActions);
  ok(S.level.done && !S.level.failed, `seed${seed} solves by actual heat/chill brushes`);
  ok(receiver().carrier >= 10 * 255 && receiver().salt <= 1, 'successful receiver has ten full tiles of actual fresh liquid');
  retainedStill(before, stocks, 'allowed still solution');
  console.log(JSON.stringify({ level: STILL_LEVEL, seed, ticks, ...receiver(), text: S.level.text }));
}
for (const mode of ['idle', 'chill only', 'whole vessel hot', 'blocked vapor route']) {
  start(STILL_LEVEL); const before = stillInventory(), stocks = materialStocks();
  if (mode === 'blocked vapor route') box(50, 41, 50, 45, C.STONE); // topology falsification, no matter added to the feed
  advance(1200, t => {
    if (mode === 'chill only') { paint('chill', 43, 40, 3); paint('chill', 47, 40, 3); }
    else if (mode === 'whole vessel hot') { paint('heat', 46, 45, 5); paint('heat', 55, 45, 5); }
    else if (mode === 'blocked vapor route') stillActions(t);
  });
  ok(!S.level.done && !S.level.failed, `${mode} cannot collect a qualifying fresh-water target`);
  retainedStill(before, stocks, mode);
}
{
  start(STILL_LEVEL); const before = stillInventory(), stocks = materialStocks();
  advance(30, stillActions, false); const saved = capture();
  ok(!S.level.done && !S.level.failed && [...typ].some((t, k) => t === C.STEAM && liq[k]), 'still save checkpoint contains real vapor before collection is complete');
  clearWorld(19); restore(saved); retainedStill(before, stocks, 'restored partial still');
  advance(1200, t => stillActions(t + 30));
  ok(S.level.done && !S.level.failed, 'saved finite vapor charge finishes with allowed chill actions');
  retainedStill(before, stocks, 'saved still continuation');
  startLevel(STILL_LEVEL);
  ok(!S.level.done && !S.level.failed && receiver().carrier === 0, 'restart restores an empty receiving basin');
  near(stillInventory().carrier, 36 * 255, 'restart restores only the original finite carrier');
  near(stillInventory().salt, 36 * 80, 'restart restores only the original finite salt');
}
// Goal falsification controls intentionally construct candidate states directly. They
// must never count as player solutions or alter the physical solution's acceptance thresholds.
function putReceiverWater(amounts, concentration = 0) {
  amounts.forEach((amount, i) => {
    const k = at(41 + i % 9, 51 - ((i / 9) | 0));
    liq[k] = amount; typ[k] = C.WATER; sol[k * C.NSOL + C.SOL_SALT] = concentration;
  });
}
{
  start(STILL_LEVEL); putReceiverWater(Array(10).fill(255), 80); checkLevel();
  ok(!S.level.done && S.level.failed === 'Brine contaminated the receiver.', 'ten tiles of unchanged brine fail despite meeting the volume target');
}
for (const block of [C.ICE, C.SALT, C.GEM]) {
  start(STILL_LEVEL); putReceiverWater(Array(10).fill(255));
  const k = at(49, 46); solid[k] = block; held[k] = block === C.ICE ? 128 : 2;
  if (block === C.ICE) sol[k * C.NSOL + C.SOL_SALT] = 4;
  checkLevel(); ok(!S.level.done && S.level.failed === 'Brine contaminated the receiver.', 'salt contamination cannot hide in ice or a partial crystal');
}
{
  start(STILL_LEVEL); putReceiverWater([...Array(9).fill(255), 127, 127]); checkLevel();
  ok(!S.level.done && !S.level.failed, 'eleven wet tiles totaling less than ten full tiles do not meet the quantity goal');
}
{
  start(STILL_LEVEL);
  for (let i = 0; i < 10; i++) { const k = at(41 + i % 9, 51 - ((i / 9) | 0)); solid[k] = C.ICE; held[k] = 255; }
  checkLevel(); ok(!S.level.done && !S.level.failed, 'ten frozen fresh-water tiles do not meet the liquid-water target');
}
{
  start(STILL_LEVEL); putReceiverWater([...Array(10).fill(255), 127]);
  const k = at(43, 50); sol[k * C.NSOL + C.SOL_SALT] = 1;
  checkLevel(); ok(S.level.done && !S.level.failed, 'a fractional carrier uses measured salt amount rather than concentration as the contamination threshold');
}
console.log(`Showcase puzzle checks: ${checks} passed`);
process.exit(0);
