// Puzzle levels: hand-built scenes with a goal, an optional way to lose, a highlighted goal region, and only the tools
// the puzzle allows. startLevel builds one; checkLevel (every half second from the main loop) updates S.level.
// Custom levels (made in the level editor, js/editor.js) are data instead of code: S.level.custom says what the goal
// is (a kind, what, how much) and how to lose, and the world they're played in is whatever world they started in.
import { addBody } from './bodies.js';
import { BLOOM, BOILER, DIRT, GATE, GLASS, H, HONEY, LAVA, LEVER, METAL, OBSIDIAN, PIPE, SAND, SPRING, STEAM, STONE, T, TONIC, TURBINE, VALVE, W, WATER } from './config.js';
import { DAY_TICKS } from './daynight.js';
import { placeDevice } from './devices.js';
import { resetWorld } from './generate.js';
import { ecoInitializeWorld } from './ecology.js';
import { LIQ } from './liquids.js';
import { S, bodies, devices, liq, sol, solid, temp, typ, under, wakeAll } from './world.js';
import { CHARCOAL, BRICK, DEPTH, FUSE, LAMP, NSOL, ORE, PIXEL, SOL_SALT, WOOD } from './config.js';

const at = (x, y) => y * W + x;
function rect(x0, y0, x1, y1, f) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(at(x, y), x, y); }
function blocks(x0, y0, x1, y1, b) { rect(x0, y0, x1, y1, k => { solid[k] = b; liq[k] = 0; typ[k] = 0; }); }
function pour(x0, y0, x1, y1, t) { rect(x0, y0, x1, y1, k => { solid[k] = 0; liq[k] = 255; typ[k] = t; temp[k] = LIQ[t].paintT; }); }
function device(kind, x, y) { solid[at(x, y)] = 0; placeDevice(kind, at(x, y)); return devices.get(at(x, y)); }
function wire(from, to) { devices.get(from).targets.push(to); }
function countIn(r, pred) { let n = 0; rect(r.x0, r.y0, r.x1, r.y1, k => { if (pred(k)) n++; }); return n; }
function countAll(pred) { let n = 0; for (let k = 0; k < W * H; k++) if (pred(k)) n++; return n; }
// Every level starts as a stone world with an open, sunlit room (x 20–140, y 20–79) and the explorer on its floor.
function arena() {
  resetWorld();
  blocks(0, 0, W - 1, H - 1, STONE);
  blocks(20, 20, 140, 79, 0);
  rect(20, 0, 140, 79, k => { under[k] = 0; });
  rect(0, 0, W - 1, H - 1, (k, x, y) => { if (x < 20 || x > 140 || y > 79) under[k] = 1; });
  S.tick = Math.round(0.15 * DAY_TICKS);   // the clock stands still in puzzles (see dayPhase), so this only sets where it starts
  addBody('explorer', 22 * T, 77 * T);
}

const LEVELS = [
  {
    name: 'Glassworks', goal: 'Melt 15 tiles of glass: drop the sand into the lava.',
    tools: ['lever', 'wire', 'dig'],
    build() {
      blocks(48, 40, 48, 57, STONE); blocks(58, 40, 58, 57, STONE); blocks(48, 57, 58, 57, STONE);
      blocks(49, 42, 57, 56, SAND);
      device(GATE, 53, 57);
      blocks(44, 66, 44, 79, STONE); blocks(62, 66, 62, 79, STONE);
      pour(45, 75, 61, 79, LAVA);
      device(LEVER, 30, 79); wire(at(30, 79), at(53, 57));
      return { x0: 45, y0: 66, x1: 61, y1: 79 };
    },
    progress(r) { const n = countAll(k => solid[k] === GLASS); return { text: `glass ${Math.min(n, 15)}/15`, done: n >= 15 }; },
  },
  {
    name: 'The cauldron', goal: 'Brew 10 tiles of tonic in the cauldron: water, then honey and bloomwater, heated and kept between 80° and 100°.',
    tools: ['lever', 'heat', 'chill'],
    build() {
      blocks(60, 60, 60, 73, METAL); blocks(72, 60, 72, 73, METAL); blocks(60, 73, 72, 73, METAL);
      blocks(60, 74, 72, 79, STONE);
      for (let x = 61; x <= 71; x++) device(BOILER, x, 73);   // the cauldron's floor is a row of boilers on one lever
      const water = device(SPRING, 63, 52); water.liquid = WATER;
      blocks(65, 43, 71, 43, STONE); blocks(65, 44, 65, 50, STONE); blocks(71, 44, 71, 50, STONE); blocks(65, 50, 71, 50, STONE);   // a covered honey jar
      pour(66, 46, 70, 49, HONEY);
      device(GATE, 68, 50);
      const bloom = device(SPRING, 70, 53); bloom.liquid = BLOOM;
      const levers = [26, 30, 34, 38].map(x => { device(LEVER, x, 79); return at(x, 79); });
      wire(levers[0], at(63, 52)); wire(levers[2], at(68, 50)); wire(levers[3], at(70, 53));
      for (let x = 61; x <= 71; x++) wire(levers[1], at(x, 73));
      return { x0: 61, y0: 60, x1: 71, y1: 72 };
    },
    progress(r) { const n = countIn(r, k => liq[k] && typ[k] === TONIC); return { text: `tonic in the cauldron ${Math.min(n, 10)}/10 · levers: water, boiler, honey, bloomwater`, done: n >= 10 }; },
  },
  {
    name: 'The lower chamber', goal: 'Fill the lower chamber with 60 tiles of water without letting any touch the lava.',
    tools: ['lever', 'valve'],
    build() {
      // the reservoir's floodgate opens straight over the lava; the safe way is the pipe, which runs under the lava
      blocks(30, 30, 30, 47, STONE); blocks(50, 30, 50, 47, STONE); blocks(30, 47, 50, 47, STONE);
      pour(31, 34, 49, 46, WATER);
      device(GATE, 44, 47);
      device(LEVER, 26, 79); wire(at(26, 79), at(44, 47));
      blocks(38, 64, 38, 79, STONE); blocks(62, 64, 62, 79, STONE);
      pour(39, 76, 61, 79, LAVA);
      blocks(32, 47, 32, 82, PIPE); blocks(32, 82, 100, 82, PIPE); blocks(100, 80, 100, 82, PIPE);
      const valve = device(VALVE, 32, 60); valve.manual = false;
      blocks(88, 66, 88, 79, STONE); blocks(112, 66, 112, 79, STONE);
      return { x0: 89, y0: 66, x1: 111, y1: 79 };
    },
    progress(r) { const n = countIn(r, k => liq[k] > 128 && typ[k] === WATER); return { text: `water in the chamber ${Math.min(n, 60)}/60`, done: n >= 60 }; },
    failed() { return countAll(k => solid[k] === OBSIDIAN || (liq[k] && typ[k] === STEAM)) ? 'The water touched the lava.' : null; },
  },
  {
    name: 'Save the fish', goal: 'Their pond sits high in the dirt. Dig a way down so at least 4 fish reach the lake below.',
    tools: ['dig'],
    build() {
      blocks(30, 46, 70, 84, DIRT);
      pour(34, 47, 44, 52, WATER);
      blocks(30, 85, 120, 95, 0); pour(30, 88, 120, 95, WATER);   // the lake lies under the dirt and beyond it
      rect(30, 80, 120, 95, k => { under[k] = 0; });
      for (let i = 0; i < 8; i++) addBody('fish', (35 + i * 1.2) * T, 50 * T);
      return { x0: 30, y0: 85, x1: 120, y1: 95 };
    },
    progress(r) {
      const n = bodies.filter(b => b.kind === 'fish' && (b.y + b.h / 2) / T >= r.y0).length;
      return { text: `fish in the lake ${Math.min(n, 4)}/4`, done: n >= 4 };
    },
    failed() { return bodies.filter(b => b.kind === 'fish').length < 4 ? 'Too few fish are left.' : null; },
  },
  {
    name: 'Steam power', goal: 'Open the vault door: get steam spinning the turbine above the hot boiler room.',
    tools: ['valve'],
    build() {
      blocks(60, 50, 80, 74, STONE); blocks(61, 51, 79, 69, 0);
      pour(61, 71, 79, 73, LAVA);
      blocks(69, 40, 71, 50, STONE); blocks(70, 45, 70, 50, 0);
      const turbine = device(TURBINE, 70, 44);
      blocks(30, 40, 30, 51, STONE); blocks(46, 40, 46, 51, STONE); blocks(30, 51, 46, 51, STONE);
      pour(31, 42, 45, 50, WATER);
      blocks(38, 51, 38, 55, PIPE); blocks(38, 55, 64, 55, PIPE);
      const valve = device(VALVE, 50, 55); valve.manual = false;
      blocks(105, 66, 105, 79, STONE); blocks(105, 66, 120, 66, STONE);
      device(GATE, 105, 78);
      wire(at(70, 44), at(105, 78));
      return { x0: 106, y0: 67, x1: 120, y1: 79 };
    },
    progress() { const g = devices.get(at(105, 78)); return { text: g && g.open ? 'the vault is open' : 'the vault is shut', done: !!(g && g.open) }; },
  },
  {
    name: 'Two shafts', goal: 'Fill the high basin with 20 tiles of water. The reservoir runs into a buried tunnel, but a plug of dirt blocks it.',
    tools: ['dig'],
    build() {
      blocks(26, 60, 124, 79, STONE);   // the ground, with a reservoir, a tunnel and a far shaft carved into it
      blocks(30, 34, 30, 59, STONE); blocks(52, 34, 52, 59, STONE);
      blocks(31, 34, 51, 74, 0); pour(31, 36, 51, 74, WATER);
      blocks(40, 75, 105, 76, 0); blocks(60, 75, 61, 76, DIRT);   // the tunnel and its plug
      blocks(104, 44, 106, 76, 0); blocks(103, 44, 103, 59, STONE);   // the far shaft, rising to the basin
      blocks(107, 52, 119, 59, STONE); blocks(119, 44, 119, 51, STONE);
      return { x0: 107, y0: 44, x1: 118, y1: 51 };
    },
    progress(r) {
      let v = 0;
      rect(r.x0, r.y0, r.x1, r.y1, k => { if (liq[k] && typ[k] === WATER) v += liq[k]; });
      return { text: `water in the basin ${Math.min(20, Math.floor(v / 255))}/20`, done: v >= 20 * 255 };
    },
  },
  {
    name: 'Thunder dome', goal: 'Blow a hole into the vault: split the brine until the dome is full of hydrogen and oxygen, then light the fuse.',
    tools: ['lever', 'heat'],
    build() {
      blocks(30, 66, 72, 79, STONE);
      blocks(36, 67, 56, 76, 0); pour(36, 68, 56, 76, WATER);   // the pool, with one row of air over it under the dome
      rect(36, 68, 56, 76, k => { sol[k * NSOL + SOL_SALT] = 80; });   // brine: it carries the power
      blocks(57, 67, 57, 74, BRICK);   // the pool's far wall is brick, with the vault behind it
      blocks(58, 60, 70, 74, 0); blocks(57, 59, 71, 59, STONE); blocks(57, 60, 57, 66, STONE); blocks(71, 60, 71, 74, STONE);
      blocks(27, 79, 35, 79, METAL); blocks(36, 70, 36, 79, METAL);   // a metal rod from the lever into the brine
      blocks(40, 52, 40, 66, FUSE);   // a fuse from the room down into the dome's roof
      device(LEVER, 26, 79);
      return { x0: 58, y0: 60, x1: 70, y1: 74 };
    },
    progress() { const left = countIn({ x0: 57, y0: 67, x1: 57, y1: 74 }, k => solid[k] === BRICK); return { text: left < 6 ? 'the vault is open' : 'the vault wall stands', done: left < 6 }; },
  },
  {
    name: 'Depth gauge', goal: 'Fill the tank until the gauge’s lamp lights, then shut the spring before the tank overflows.',
    tools: ['lever'],
    build() {
      blocks(60, 59, 60, 77, STONE); blocks(70, 59, 70, 77, STONE); blocks(60, 77, 70, 77, STONE);   // the tank: 9 wide, 18 deep
      const spring = device(SPRING, 61, 40); spring.liquid = WATER;   // over the tank's edge, clear of the sensors
      device(LEVER, 26, 79); wire(at(26, 79), at(61, 40));
      blocks(60, 78, 70, 79, STONE);
      [[64, 4, 96], [65, 8, 98], [66, 12, 100], [67, 16, 104]].forEach(([x, depth, gx]) => {   // a sensor in the floor for each mark
        const s = device(DEPTH, x, 77); s.level = depth;
        if (gx < 104) { const p = device(PIXEL, gx, 70); p.colour = 1; } else device(LAMP, gx, 70);
        wire(at(x, 77), at(gx, 70));
      });
      blocks(94, 71, 106, 71, STONE);
      return { x0: 94, y0: 66, x1: 106, y1: 70 };
    },
    progress() {
      const lamp = devices.get(at(104, 70)), spring = devices.get(at(61, 40));
      const lit = !!(lamp && lamp.active), shut = !!(spring && !spring.active);
      return { text: lit ? (shut ? 'the gauge reads full and the spring is shut' : 'the gauge reads full: shut the spring') : 'the gauge isn’t full yet', done: lit && shut };
    },
    failed() { return countAll(k => liq[k] && typ[k] === WATER && (k / W | 0) >= 59 && ((k % W) < 60 || (k % W) > 70)) ? 'The tank overflowed.' : null; },
  },
  {
    name: 'Furnace', goal: 'Cast 3 metal blocks in the mould: light the charcoal packed round the ore. It burns hot enough to smelt the ore, and the iron runs down through the opening into the mould.',
    tools: ['heat'],
    build() {
      blocks(55, 65, 67, 65, STONE); blocks(60, 65, 61, 65, 0);   // the mould's lid, open in the middle
      blocks(58, 60, 63, 64, CHARCOAL); blocks(60, 61, 61, 63, ORE); blocks(60, 64, 61, 64, 0);   // ore packed in charcoal, right over the opening
      blocks(55, 66, 55, 73, STONE); blocks(67, 66, 67, 73, STONE); blocks(55, 73, 67, 73, STONE);   // the mould
      return { x0: 56, y0: 66, x1: 66, y1: 72 };
    },
    progress(r) { const n = countIn(r, k => solid[k] === METAL); return { text: `metal in the mould ${Math.min(n, 3)}/3`, done: n >= 3 }; },
  },
];

function startLevel(i) {
  const L = LEVELS[i];
  if (!S.level) { S.sandboxWeather = S.weather; S.sandboxPressure = S.pressure; }   // restored when the player goes back to the sandbox
  arena();
  const region = L.build();
  ecoInitializeWorld();
  S.weather = false; S.pressure = true;   // puzzles are built for still weather and for pressure
  S.level = { index: i, name: L.name, goal: L.goal, tools: L.tools, region, text: '', done: false, failed: null };
  wakeAll();
  S.dirtyAll = true;
  checkLevel();
}
// ---- custom levels ----
// spec: { kind, what, label, amount, lose, loseWhat, loseLabel, loseAmount }. kind is 'liquid' (tiles of liquid what in
// the region), 'block' (blocks what in it), 'creature' (bodies of kind what in it), 'explorer' (the explorer in it) or
// 'lit' (lamps and pixels lit in it). lose is 'none', 'liquid' (any of liquid loseWhat in the region) or 'creatures'
// (fewer than loseAmount bodies of kind loseWhat left anywhere). Fainting always loses.
const inRegion = (r, b) => { const x = (b.x + b.w / 2) / T, y = (b.y + b.h / 2) / T; return x >= r.x0 && x < r.x1 + 1 && y >= r.y0 && y < r.y1 + 1; };
function customCount(spec, r) {
  if (spec.kind === 'liquid') { let v = 0; rect(r.x0, r.y0, r.x1, r.y1, k => { if (liq[k] && typ[k] === spec.what) v += liq[k]; }); return v / 255; }
  if (spec.kind === 'block') return countIn(r, k => solid[k] === spec.what);
  if (spec.kind === 'creature') return bodies.filter(b => b.kind === spec.what && inRegion(r, b)).length;
  if (spec.kind === 'explorer') return bodies.some(b => b.kind === 'explorer' && inRegion(r, b)) ? 1 : 0;
  let n = 0;   // lit
  for (const [k, d] of devices) if ((d.kind === LAMP || d.kind === PIXEL) && d.active && inRegion(r, { x: (k % W) * T, y: ((k / W) | 0) * T, w: T, h: T })) n++;
  return n;
}
// The goal as a sentence, for a level whose maker didn't write one.
function describe(spec) {
  const n = spec.amount, s = n === 1 ? '' : 's';
  const goal = spec.kind === 'liquid' ? `Fill the goal area with ${n} tile${s} of ${spec.label}.` : spec.kind === 'block' ? `Make ${n} ${spec.label} block${s} in the goal area.`
    : spec.kind === 'creature' ? `Get ${n} ${spec.label}${s} into the goal area.` : spec.kind === 'explorer' ? 'Bring the explorer to the goal area.' : `Light ${n} lamp${s} or pixel${s} in the goal area.`;
  const lose = spec.lose === 'liquid' ? ` Don't let any ${spec.loseLabel} into it.` : spec.lose === 'creatures' ? ` Keep at least ${spec.loseAmount} ${spec.loseLabel}${spec.loseAmount === 1 ? '' : 's'} alive.` : '';
  return goal + lose;
}
function customProgress(st) {
  const spec = st.custom, n = customCount(spec, st.region);
  const text = spec.kind === 'explorer' ? (n ? 'the explorer is there' : 'the explorer isn’t there yet') : `${spec.kind === 'lit' ? 'lit' : spec.label} ${Math.min(spec.amount, Math.floor(n))}/${spec.amount}`;
  return { text, done: n >= spec.amount };
}
function customFailed(st) {
  const spec = st.custom, r = st.region;
  if (spec.lose === 'liquid' && countIn(r, k => liq[k] >= 16 && typ[k] === spec.loseWhat)) return `Some ${spec.loseLabel} got into the goal area.`;
  if (spec.lose === 'creatures' && bodies.filter(b => b.kind === spec.loseWhat).length < spec.loseAmount) return `Fewer than ${spec.loseAmount} ${spec.loseLabel}${spec.loseAmount === 1 ? '' : 's'} are left.`;
  return null;
}
// Starts a custom level in the world as it is now. draft: { name, goal, region, tools, ...spec }.
function startCustom(d) {
  const spec = { kind: d.kind, what: d.what, label: d.label, amount: d.amount, lose: d.lose, loseWhat: d.loseWhat, loseLabel: d.loseLabel, loseAmount: d.loseAmount };
  S.level = { index: -1, custom: spec, name: d.name || 'A custom level', goal: d.goal || describe(spec), tools: d.tools.slice(), region: { ...d.region }, text: '', done: false, failed: null,
    started: Math.floor(Math.random() * 1e9) };   // tells this start apart from another level's (js/editor.js)
  wakeAll();
  checkLevel();
}
function checkLevel() {
  const st = S.level;
  if (!st || st.done || st.failed) return;
  if (st.custom) {
    const p = customProgress(st);
    st.text = p.text;
    st.failed = st.fainted ? 'The explorer fainted.' : customFailed(st);
    st.done = p.done && !st.failed;
    return;
  }
  const L = LEVELS[st.index], p = L.progress(st.region);
  st.text = p.text;
  st.failed = st.fainted ? 'The explorer fainted.' : L.failed ? L.failed(st.region) : null;   // a broken rule counts even if the goal was reached at the same time
  st.done = p.done && !st.failed;
}

export { inRegion, customCount, describe, customProgress, customFailed, startCustom, LEVELS, rect, blocks, pour, device, wire, countIn, countAll, arena, startLevel, checkLevel };
