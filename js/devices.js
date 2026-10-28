// Switches (levers, pressure plates, liquid, temperature and depth sensors, timers) and generators (turbines, water wheels,
// windmills, solar panels) power targets (floodgates, springs, drains, pumps, valves, boilers, separators, lamps, pixel
// displays, motors, electromagnets),
// through wires or through conductors they touch. Batteries store power and give it back once nothing else feeds them;
// a running motor drives the machines it touches and pushes the liquid beside it.
// Logic gates and counters sit in between: they read their wires and touching networks, and drive their own wires.
import { strikes, windAt } from './air.js';
import { sfx } from './audio.js';
import { AIR, AND, BOILER, COUNTER, DRAIN, FILTER, FOAM, GATE, GEYSER, H, LEVER, NOT, NSOL, OIL, OR, PLATE, POISON, SALT, SENSOR, SEPARATOR, SMOKE, SOL_SALT, SPRING, STEAM, T, TIMER, TURBINE, VALVE, VENT, W, WATER, WHEEL, WINDMILL } from './config.js';
import { LIQ } from './liquids.js';
import { JET, addVel } from './momentum.js';
import { puff } from './particles.js';
import { beginNets, conductive, electrolysis, feed, flood, liveFrom, netAt, nets, netsTouching, seed, shockTick, spread } from './power.js';
import { nbr } from './pumps.js';
import { deposit } from './powders.js';
import { carrySol, clearSol } from './solutes.js';
import { S, bodies, devices, drop, flux, heatWake, liq, markDirty, pumps, sol, solid, temp, typ, under, wake } from './world.js';
import { MEMBRANE } from './config.js';
import { BATTERY, COOLANT, EMAGNET, LAMP, LIGHT, MOTOR, SOLAR } from './config.js';
import { DEPTH, PIXEL, THERMO } from './config.js';
import { shade } from './climate.js';
import { sunHeight } from './daynight.js';










const SOURCES = new Set([LEVER, PLATE, SENSOR, THERMO, DEPTH, TIMER, TURBINE, WHEEL, WINDMILL, SOLAR]);   // these also power the conductors they touch
const LOGIC = new Set([AND, OR, NOT, COUNTER]);
const TRIGGERS = new Set([...SOURCES, ...LOGIC, BATTERY]);
const TARGETS = new Set([GATE, SPRING, DRAIN, VALVE, BOILER, SEPARATOR, LAMP, PIXEL, MOTOR, EMAGNET, BATTERY, ...LOGIC]);
const DEVICE_NAMES = {
  [LEVER]: 'lever', [PLATE]: 'pressure plate', [SENSOR]: 'liquid sensor', [TIMER]: 'timer', [GATE]: 'floodgate', [SPRING]: 'spring', [MEMBRANE]: 'membrane', [DRAIN]: 'drain',
  [TURBINE]: 'steam turbine', [WHEEL]: 'water wheel', [WINDMILL]: 'windmill', [AND]: 'AND gate', [OR]: 'OR gate', [NOT]: 'NOT gate', [COUNTER]: 'counter',
  [VALVE]: 'valve', [FILTER]: 'pipe filter', [BOILER]: 'boiler', [SEPARATOR]: 'separator', [GEYSER]: 'geyser', [VENT]: 'gas vent',
  [BATTERY]: 'battery', [LAMP]: 'lamp', [MOTOR]: 'motor', [EMAGNET]: 'electromagnet', [SOLAR]: 'solar panel',
  [THERMO]: 'temperature sensor', [DEPTH]: 'depth sensor', [PIXEL]: 'pixel',
};
const TIMER_PERIODS = [60, 120, 240, 480], COUNTER_LIMITS = [2, 3, 4, 5, 8];
const THERMO_LEVELS = [0, 50, 100, 200, 500, 1000], DEPTH_LEVELS = [1, 2, 4, 8, 16];   // degrees; tiles of liquid
const PIXEL_COLOURS = ['#ffb43c', '#5ae07a', '#ff5050', '#5aa0ff', '#f4f4f4'];   // amber, green, red, blue, white
const WINDMILL_WIND = 0.2;   // wind speed a windmill needs (wind near the ground is about a third of the open-sky wind)
const BATTERY_CAP = 1200, MOTOR_RATE = 24, SOLAR_SUN = 0.15, SOLAR_CLOUD = 0.6, SOLAR_REACH = 2, COOLANT_DRAW = 2;
const SALT_OUT = 32, SPRING_RATE = 40, DRAIN_RATE = 64, BOILER_TEMP = 200, SEPARATE_RATE = 24, SEPARATE_LIMIT = 400;

function pumpAt(k) { return pumps.find(p => p.in === k || p.out === k); }
function isTarget(k) { const d = devices.get(k); return d ? TARGETS.has(d.kind) : !!pumpAt(k); }

// Levers stay passable (drawn as an overlay); every other device is a solid block.
function placeDevice(kind, k) {
  if (solid[k] || devices.has(k)) return false;
  liq[k] = 0; typ[k] = 0;
  if (kind !== LEVER) solid[k] = kind;
  devices.set(k, { kind, on: false, active: false, open: false, manual: kind === VALVE, targets: [], period: 120, liquid: S.lastLiquid,
    filter: 0, count: 0, limit: 3, wasHi: false, spin: 0, store: 0, erupting: 0, rest: 0, charge: 0, charging: false, wired: false, dir: 2,
    level: kind === THERMO ? 100 : 4, colour: 0 });
  markDirty(k % W, (k / W) | 0);
  return true;
}
function removeDevice(k) {
  if (!devices.delete(k)) return;
  for (const d of devices.values()) { const i = d.targets.indexOf(k); if (i >= 0) d.targets.splice(i, 1); }
  if (S.pendingLink === k) S.pendingLink = -1;
  solid[k] = AIR;
  markDirty(k % W, (k / W) | 0);
}
// Clicking with a device tool places it, or adjusts an existing one of the same kind.
function useDeviceTool(kind, k) {
  const d = devices.get(k);
  if (!d) { placeDevice(kind, k); return; }
  if (d.kind !== kind) return;
  if (kind === LEVER) { d.on = !d.on; sfx('click', (k % W) * T + 4, ((k / W) | 0) * T + 4); }
  else if (kind === TIMER) d.period = TIMER_PERIODS[(TIMER_PERIODS.indexOf(d.period) + 1) % TIMER_PERIODS.length];
  else if (kind === SPRING || kind === FILTER || kind === MEMBRANE) d.liquid = S.lastLiquid;
  else if (kind === GATE || kind === VALVE) d.manual = !d.manual;
  else if (kind === SENSOR) d.filter = d.filter === S.lastLiquid ? 0 : S.lastLiquid;
  else if (kind === MOTOR) d.dir = d.dir === 2 ? 1 : 2;
  else if (kind === THERMO) d.level = THERMO_LEVELS[(THERMO_LEVELS.indexOf(d.level) + 1) % THERMO_LEVELS.length];
  else if (kind === DEPTH) d.level = DEPTH_LEVELS[(DEPTH_LEVELS.indexOf(d.level) + 1) % DEPTH_LEVELS.length];
  else if (kind === PIXEL) d.colour = ((d.colour || 0) + 1) % PIXEL_COLOURS.length;
  else if (kind === COUNTER) { d.limit = COUNTER_LIMITS[(COUNTER_LIMITS.indexOf(d.limit) + 1) % COUNTER_LIMITS.length]; d.count = 0; }
  markDirty(k % W, (k / W) | 0);
}
// Wire tool: click a switch, then any number of targets to link or unlink them; click the switch or empty space to finish.
function linkClick(k) {
  const d = devices.get(k);
  if (S.pendingLink < 0) { if (d && TRIGGERS.has(d.kind)) S.pendingLink = k; return; }
  if (k === S.pendingLink || !isTarget(k)) { S.pendingLink = -1; return; }
  const src = devices.get(S.pendingLink);
  const i = src.targets.indexOf(k);
  if (i >= 0) src.targets.splice(i, 1); else src.targets.push(k);
}
function toggleLeversNear(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (const [k, d] of devices) {
    if (d.kind !== LEVER) continue;
    const dx = (k % W) * T + 4 - cx, dy = ((k / W) | 0) * T + 4 - cy;
    if (dx * dx + dy * dy < 14 * 14) { d.on = !d.on; markDirty(k % W, (k / W) | 0); sfx('click', cx, cy); }
  }
}

function plateLoaded(k, x, y) {
  if (y > 0 && liq[k - W] >= 128) return true;
  return bodies.some(b => b.x < x * T + T && b.x + b.w > x * T && Math.abs(b.y + b.h - y * T) < 2);
}
// filter 0 senses any liquid; otherwise only that one
function sensed(x, y, filter) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && !solid[n] && liq[n] >= 128 && (!filter || typ[n] === filter)) return true; }
  return false;
}
// Tiles' worth of liquid standing on tile k: the unbroken column of liquid over it (gases don't press down).
function depthOver(k) {
  let a = 0;
  for (let u = k - W; u >= 0 && !solid[u] && liq[u] && LIQ[typ[u]].grav > 0 && !LIQ[typ[u]].gas; u -= W) a += liq[u];
  return a / 255;
}
// A turbine spins while steam presses on it, and takes the steam's heat so it condenses.
function turbineSpins(x, y) {
  let on = false;
  for (let d = 0; d < 4; d++) {
    const n = nbr(x, y, d);
    if (n >= 0 && liq[n] >= 32 && typ[n] === STEAM) { on = true; temp[n] = Math.min(temp[n], 65); }
  }
  return on;
}
// A water wheel turns while liquid is flowing past it.
function wheelTurns(x, y) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] && S.tick - flux[n] < 6) return true; }
  return false;
}
function setGate(k, d, open) {
  if (open === d.open) return;
  d.open = open;
  sfx('click', (k % W) * T + 4, ((k / W) | 0) * T + 4);
  const x = k % W, y = (k / W) | 0;
  if (open) solid[k] = AIR;
  else {
    if (liq[k]) {   // a closing gate lifts what it can into the tile above and crushes the rest
      const up = k - W;
      if (y > 0 && !solid[up] && (!liq[up] || typ[up] === typ[k])) { const mv = Math.min(liq[k], 255 - liq[up]); carrySol(k, up, mv, liq[up]); liq[up] += mv; typ[up] = typ[k]; }
      liq[k] = 0; typ[k] = 0;
    }
    solid[k] = GATE;
  }
  markDirty(x, y);
}
function emit(k, d) {
  const x = k % W, y = (k / W) | 0, t = d.liquid;
  let budget = SPRING_RATE;
  for (const dir of [3, 1, 2, 0]) {   // below, sides, then above
    const n = nbr(x, y, dir);
    if (n < 0 || solid[n] || (liq[n] && typ[n] !== t)) continue;
    const put = Math.min(budget, 255 - liq[n]);
    if (put <= 0) continue;
    if (!liq[n]) { clearSol(n); drop[n] = 0; }
    addVel(n, dir === 1 ? -JET : dir === 2 ? JET : 0, liq[n], put);
    temp[n] = (temp[n] * liq[n] + LIQ[t].paintT * put) / (liq[n] + put);
    liq[n] += put; typ[n] = t; budget -= put; wake(n);
    if (!budget) break;
  }
}
// A separator works on the liquid body it touches: it splits foam back into oil and water, and pulls dissolved
// contents out. The salt it collects comes out beside it as salt blocks.
const sepSeen = new Uint32Array(W * H), sepQueue = new Int32Array(SEPARATE_LIMIT + 4);
let sepPass = 0;
function separate(k, d) {
  const x = k % W, y = (k / W) | 0;
  sepPass++;
  let head = 0, tail = 0;
  for (let i = 0; i < 4; i++) { const n = nbr(x, y, i); if (n >= 0 && liq[n] && !solid[n]) { sepSeen[n] = sepPass; sepQueue[tail++] = n; } }
  while (head < tail) {
    const n = sepQueue[head++], nx = n % W, ny = (n / W) | 0;
    if (typ[n] === FOAM) { typ[n] = Math.random() < 0.5 ? OIL : WATER; wake(n); }
    for (let i = 0; i < NSOL; i++) {
      const p = n * NSOL + i, take = Math.min(sol[p], SEPARATE_RATE);
      if (!take) continue;
      sol[p] -= take;
      if (i === SOL_SALT) d.store += take * liq[n] / 255;
    }
    for (let i = 0; i < 4 && tail < SEPARATE_LIMIT; i++) {
      const o = nbr(nx, ny, i);
      if (o >= 0 && liq[o] && !solid[o] && sepSeen[o] !== sepPass) { sepSeen[o] = sepPass; sepQueue[tail++] = o; }
    }
  }
  if (d.store < SALT_OUT) return;   // the salt comes out a little at a time, as grains beside it
  for (let i = 0; i < 4; i++) {
    const n = nbr(x, y, i), out = Math.floor(d.store);
    if (n < 0 || liq[n] || (solid[n] && solid[n] !== SALT)) continue;
    const left = deposit(n, SALT, out);
    if (left < out) { d.store -= out - left; return; }
  }
  d.store = Math.min(d.store, 255);
}
// A geyser vent sits over a pocket of water heated from below. Once the pocket is hot enough it erupts, throwing water
// and steam up out of the vent for a few seconds, then rests while the pocket refills and heats again.
const GEYSER_HEAT = 85, GEYSER_BURST = 90, GEYSER_REST = [400, 900], GEYSER_SPOUT = 14;
function geyser(k, d) {
  const x = k % W, y = (k / W) | 0;
  if (d.erupting > 0) {
    d.erupting--;
    const h = 1 + ((Math.random() * GEYSER_SPOUT) | 0), n = k - h * W;
    if (y - h < 0 || solid[n] || (liq[n] && typ[n] !== WATER)) return;   // capped: the water stays in the pocket
    const want = Math.min(48, 255 - liq[n]);
    let took = 0;
    for (let dy = 1; dy <= 6 && took < want; dy++) for (let dx = -3; dx <= 3 && took < want; dx++) {
      const n = k + dy * W + dx;
      if (y + dy >= H || x + dx < 0 || x + dx >= W || !liq[n] || typ[n] !== WATER) continue;
      const m = Math.min(liq[n], want - took);
      liq[n] -= m; took += m; if (!liq[n]) typ[n] = 0; wake(n);
    }
    if (!took) { if (want) d.erupting = 0; return; }   // an empty pocket ends the eruption; a full spout tile just waits
    if (!liq[n]) { clearSol(n); drop[n] = 0; }
    liq[n] += took; typ[n] = WATER; temp[n] = 95; wake(n);
    if (Math.random() < 0.3) puff(n, 'steam');
    return;
  }
  if (d.rest > 0) { d.rest--; return; }
  let n = 0, heat = 0;
  for (let dy = 1; dy <= 6; dy++) for (let dx = -3; dx <= 3; dx++) {
    const o = k + dy * W + dx;
    if (y + dy < H && x + dx >= 0 && x + dx < W && liq[o] && typ[o] === WATER) { n++; heat += temp[o]; }
  }
  if (n >= 4 && heat / n > GEYSER_HEAT) { d.erupting = GEYSER_BURST; d.rest = GEYSER_REST[0] + Math.random() * (GEYSER_REST[1] - GEYSER_REST[0]); sfx('sizzle', x * T + 4, y * T); }
}
// A gas vent puffs poison gas and smoke out of the ground above it.
const VENT_EVERY = 40;
function vent(k) {
  const up = k - W;
  if (up < 0 || solid[up]) return;
  if (!liq[up]) { liq[up] = 48; typ[up] = Math.random() < 0.6 ? POISON : SMOKE; temp[up] = 120; clearSol(up); wake(up); }
  else if ((typ[up] === POISON || typ[up] === SMOKE) && liq[up] < 200) { liq[up] += 32; wake(up); }
}
function drain(k) {
  const x = k % W, y = (k / W) | 0;
  for (let dir = 0; dir < 4; dir++) {
    const n = nbr(x, y, dir);
    if (n < 0 || !liq[n]) continue;
    liq[n] -= Math.min(liq[n], DRAIN_RATE); wake(n);
    if (!liq[n]) typ[n] = 0;
  }
}

// A membrane passes its liquid across it: from above to below (or below to above for rising gases), and from side
// to side, so levels on either side even out; every other liquid is stopped.
const MEMBRANE_RATE = 32;
function membrane(k, d) {
  const x = k % W, y = (k / W) | 0, t = d.liquid, g = LIQ[t].grav;
  const across = [[0, 3], [3, 0], [1, 2], [2, 1]];   // [from, to] as nbr directions: up, left, right, down
  for (const [a, b] of across) {
    if ((a === 0 && g < 0) || (a === 3 && g > 0)) continue;   // liquid only falls through; gases only rise through
    const from = nbr(x, y, a), to = nbr(x, y, b);
    if (from < 0 || to < 0 || solid[to] || !liq[from] || typ[from] !== t || (liq[to] && typ[to] !== t)) continue;
    if ((a === 1 || a === 2) && liq[to] >= liq[from]) continue;   // sideways only towards the lower side
    const mv = Math.min(MEMBRANE_RATE, liq[from], 255 - liq[to], (a === 1 || a === 2) ? (liq[from] - liq[to]) >> 1 : 255);
    if (mv <= 0) continue;
    if (!liq[to]) { temp[to] = temp[from]; sol.fill(0, to * NSOL, to * NSOL + NSOL); }
    liq[to] += mv; typ[to] = t; liq[from] -= mv; if (!liq[from]) typ[from] = 0; wake(from); wake(to);
  }
}
// A solar panel makes power in daylight under open sky (not under thick cloud), or beside glowing liquid light.
function sunlit(k, x, y) {
  if (!under[k] && sunHeight() > SOLAR_SUN && shade[x] < SOLAR_CLOUD) return true;
  for (let dy = -SOLAR_REACH; dy <= SOLAR_REACH; dy++) for (let dx = -SOLAR_REACH; dx <= SOLAR_REACH; dx++) {
    const nx = x + dx, ny = y + dy, n = ny * W + nx;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && !solid[n] && liq[n] >= 64 && typ[n] === LIGHT) return true;
  }
  return false;
}
// A running motor pushes liquid from the tile behind it to the tile in front, and sets the liquid in front moving.
function propel(k, d) {
  const x = k % W, y = (k / W) | 0, back = nbr(x, y, d.dir === 2 ? 1 : 2), front = nbr(x, y, d.dir);
  if (back < 0 || front < 0 || solid[front] || solid[back] || !liq[back] || (liq[front] && typ[front] !== typ[back])) return;
  const mv = Math.min(MOTOR_RATE, liq[back], 255 - liq[front]);
  if (mv <= 0) return;
  if (!liq[front]) { temp[front] = temp[back]; clearSol(front); drop[front] = 0; }
  carrySol(back, front, mv, liq[front]);
  addVel(front, d.dir === 2 ? JET : -JET, liq[front], mv);
  liq[front] += mv; typ[front] = typ[back]; liq[back] -= mv; if (!liq[back]) typ[back] = 0;
  wake(back); wake(front);
}
// A boiler touching coolant runs on the coolant's heat instead of its own: on while the coolant is hotter than it
// needs, drawing that heat off, so lava can heat coolant that is piped to a boiler somewhere else.
function coolantFed(k) {
  const x = k % W, y = (k / W) | 0;
  let touch = false, hot = false;
  for (let i = 0; i < 4; i++) {
    const n = nbr(x, y, i);
    if (n < 0 || !liq[n] || typ[n] !== COOLANT) continue;
    touch = true;
    if (temp[n] > BOILER_TEMP) { hot = true; temp[n] -= COOLANT_DRAW; }
  }
  return touch ? hot : null;
}
function devicesTick() {
  // switches and generators read the world
  for (const [k, d] of devices) {
    const x = k % W, y = (k / W) | 0;
    let on = d.on;
    if (d.kind === PLATE) on = plateLoaded(k, x, y);
    else if (d.kind === SENSOR) on = sensed(x, y, d.filter);
    else if (d.kind === THERMO) on = temp[k] > (d.level ?? 100);   // the sensor's own tile, which takes up heat fast
    else if (d.kind === DEPTH) on = depthOver(k) >= (d.level ?? 4);
    else if (d.kind === TIMER) on = S.tick % d.period < d.period / 2;
    else if (d.kind === TURBINE) on = turbineSpins(x, y);
    else if (d.kind === WHEEL) on = wheelTurns(x, y);
    else if (d.kind === SOLAR) on = sunlit(k, x, y);
    else if (d.kind === BATTERY) on = !d.charging && d.charge > 0;   // last tick's inputs decide whether it charges or gives
    else if (d.kind === WINDMILL) { const w = Math.abs(windAt(x, y)); on = !under[k] && w > WINDMILL_WIND; if (on) d.spin += w; }
    if (on !== d.on && d.kind === PLATE) markDirty(x, y);
    d.on = on;
    if (on && (d.kind === TURBINE || d.kind === WHEEL)) d.spin++;
  }
  // conductors touching a switch or generator form networks, live while any of those is on
  beginNets();
  for (const [k, d] of devices) if (SOURCES.has(d.kind)) feed(k, d.on);
  spread();
  // a battery charges from the power other sources bring it, so it never charges from itself; then it feeds them
  const batteryNets = new Map();
  for (const [k, d] of devices) if (d.kind === BATTERY) { feed(k, false); batteryNets.set(k, netsTouching(k).some(id => liveFrom(k, id))); }
  for (const [k, d] of devices) if (d.kind === BATTERY && d.on) feed(k, true);
  for (const s of strikes) if (conductive(s.k)) { const id = netAt(s.k) >= 0 ? netAt(s.k) : flood(s.k); nets[id].live = true; seed(s.k); }   // lightning
  spread();
  // each target's inputs: its wires (a logic gate's from last tick) and the networks it touches
  const inputs = new Map();
  const add = (t, v) => { const a = inputs.get(t); if (a) a.push(v); else inputs.set(t, [v]); };
  for (const d of devices.values()) {
    if (!TRIGGERS.has(d.kind)) continue;
    d.targets = d.targets.filter(t => devices.has(t) || pumpAt(t));
    for (const t of d.targets) add(t, d.on);
  }
  for (const [k, d] of devices) if (d.kind === BATTERY) d.wired = (inputs.get(k) || []).some(Boolean);
  for (const [k, d] of devices) if (TARGETS.has(d.kind)) for (const id of netsTouching(k)) add(k, liveFrom(k, id));
  for (const pp of pumps) for (const end of [pp.in, pp.out]) for (const id of netsTouching(end)) add(end, liveFrom(end, id));
  for (const [k, d] of devices) {
    if (!LOGIC.has(d.kind)) continue;
    const a = inputs.get(k) || [], hi = a.some(Boolean);
    let on;
    if (d.kind === AND) on = a.length > 0 && a.every(Boolean);
    else if (d.kind === OR) on = hi;
    else if (d.kind === NOT) on = !hi;
    else {   // counter: each rising input counts one; it's on at its limit, and the next count starts over
      if (hi && !d.wasHi) { d.count = d.count >= d.limit ? 1 : d.count + 1; markDirty(k % W, (k / W) | 0); }
      d.wasHi = hi;
      on = d.count === d.limit;
    }
    if (on !== d.on) markDirty(k % W, (k / W) | 0);
    d.on = on;
  }
  // a target with inputs is powered while any of them is on; one with none keeps its own setting
  const power = k => { const a = inputs.get(k); return a ? a.some(Boolean) : null; };
  // motors run first: a running motor drives every machine it touches, as if wired to it
  for (const [k, d] of devices) {
    if (d.kind !== MOTOR) continue;
    const on = !!power(k);
    if (on !== d.active) { d.active = on; markDirty(k % W, (k / W) | 0); }
    if (!on) continue;
    d.spin++;
    const x = k % W, y = (k / W) | 0;
    for (let i = 0; i < 4; i++) {
      const n = nbr(x, y, i), o = n < 0 ? null : devices.get(n);
      if (n >= 0 && isTarget(n) && (!o || o.kind !== MOTOR)) add(n, true);
    }
    propel(k, d);
  }
  for (const [k, d] of devices) {
    const p = power(k);
    if (d.kind === GATE) setGate(k, d, p === null ? d.manual : p);
    else if (d.kind === VALVE) {
      const open = p === null ? d.manual : p;
      if (open !== d.open) { d.open = open; markDirty(k % W, (k / W) | 0); sfx('click', (k % W) * T + 4, ((k / W) | 0) * T + 4); }
    } else if (d.kind === BATTERY) {
      const was = d.charging;
      d.charging = batteryNets.get(k) || d.wired;
      if (d.charging) d.charge = Math.min(BATTERY_CAP, d.charge + 1);
      else if (d.on) d.charge--;
      if (was !== d.charging || !(S.tick % 30)) markDirty(k % W, (k / W) | 0);
    } else if (d.kind === LAMP || d.kind === PIXEL || d.kind === EMAGNET) {
      const on = !!p;
      if (on !== d.active) { d.active = on; markDirty(k % W, (k / W) | 0); }
    } else if (d.kind === SPRING || d.kind === DRAIN || d.kind === BOILER || d.kind === SEPARATOR) {
      const fed = d.kind === BOILER ? coolantFed(k) : null;
      d.active = fed !== null ? fed : p === null ? true : p;
      if (!d.active) continue;
      if (d.kind === SPRING) emit(k, d);
      else if (d.kind === DRAIN) drain(k);
      else if (d.kind === BOILER) { temp[k] = Math.max(temp[k], BOILER_TEMP); heatLiquid(k); heatWake(k); }
      else if (!(S.tick & 7)) separate(k, d);
    } else if (d.kind === GEYSER) geyser(k, d);
    else if (d.kind === MEMBRANE) membrane(k, d);
    else if (d.kind === VENT && !(S.tick % VENT_EVERY)) vent(k);
  }
  for (const pp of pumps) {
    const a = power(pp.in), b = power(pp.out);
    if (a !== null || b !== null) pp.on = !!(a || b);
  }
  shockTick();
  electrolysis();
}
// A working boiler heats the liquid touching it directly, so a pot over boilers comes to the boil.
const BOILER_HEAT = 0.04;
function heatLiquid(k) {
  const x = k % W, y = (k / W) | 0;
  for (let i = 0; i < 4; i++) {
    const n = nbr(x, y, i);
    if (n >= 0 && liq[n] && temp[n] < BOILER_TEMP) temp[n] += (BOILER_TEMP - temp[n]) * BOILER_HEAT;
  }
}
function coolantTouching(k) {
  const x = k % W, y = (k / W) | 0;
  for (let i = 0; i < 4; i++) { const n = nbr(x, y, i); if (n >= 0 && liq[n] && typ[n] === COOLANT) return true; }
  return false;
}
function deviceState(k) {
  const d = devices.get(k);
  const links = d.targets.length ? ` · ${d.targets.length} link${d.targets.length > 1 ? 's' : ''}` : '';
  if (d.kind === TIMER) return `timer · ${d.on ? 'on' : 'off'} · ${(d.period / 60).toFixed(0)} s cycle (click to change)${links}`;
  if (d.kind === GATE) return `floodgate · ${d.open ? 'open' : 'closed'}`;
  if (d.kind === MEMBRANE) return `membrane · lets ${LIQ[d.liquid].name} through (click it to switch to the liquid you last picked)`;
  if (d.kind === SPRING) return `spring · ${LIQ[d.liquid].name} · ${d.active ? 'flowing' : 'off'}`;
  if (d.kind === DRAIN) return `drain · ${d.active ? 'draining' : 'off'}`;
  if (d.kind === SENSOR) return `liquid sensor · ${d.filter ? LIQ[d.filter].name + ' only' : 'any liquid'} (click to change) · ${d.on ? 'on' : 'off'}${links}`;
  if (d.kind === COUNTER) return `counter · ${d.count}/${d.limit} (click to change) · ${d.on ? 'on' : 'off'}${links}`;
  if (d.kind === VALVE) return `valve · ${d.open ? 'open' : 'shut'}`;
  if (d.kind === FILTER) return `pipe filter · passes ${LIQ[d.liquid].name} (click to change)`;
  if (d.kind === BOILER) return `boiler · ${d.active ? 'heating' : 'off'} · ${Math.round(temp[k])}°${coolantTouching(k) ? ' · run by coolant' : ''}`;
  if (d.kind === SEPARATOR) return `separator · ${d.active ? 'running' : 'off'}`;
  if (d.kind === GEYSER) return `geyser · ${d.erupting ? 'erupting' : d.rest > 0 ? 'resting' : 'building up'}`;
  if (d.kind === BATTERY) return `battery · ${Math.round(d.charge / BATTERY_CAP * 100)}% · ${d.charging ? 'charging' : d.on ? 'giving power' : 'idle'}${links}`;
  if (d.kind === LAMP) return `lamp · ${d.active ? 'lit' : 'off'}`;
  if (d.kind === PIXEL) return `pixel · ${d.active ? 'lit' : 'off'} (click to change colour)`;
  if (d.kind === THERMO) return `temperature sensor · on above ${d.level ?? 100}° (click to change) · ${Math.round(temp[k])}° · ${d.on ? 'on' : 'off'}${links}`;
  if (d.kind === DEPTH) return `depth sensor · on under ${d.level ?? 4} tile${(d.level ?? 4) > 1 ? 's' : ''} of liquid (click to change) · ${depthOver(k).toFixed(1)} now · ${d.on ? 'on' : 'off'}${links}`;
  if (d.kind === MOTOR) return `motor · ${d.active ? 'running' : 'off'} · pushes ${d.dir === 2 ? 'right' : 'left'} (click to turn it round)`;
  if (d.kind === EMAGNET) return `electromagnet · ${d.active ? 'pulling' : 'off'}`;
  if (d.kind === SOLAR) return `solar panel · ${d.on ? 'making power' : 'dark'}${links}`;
  if (d.kind === WINDMILL) return `windmill · ${d.on ? 'turning' : 'still'}${links}`;
  return `${DEVICE_NAMES[d.kind]} · ${d.on ? 'on' : 'off'}${links}`;
}

export { BOILER_HEAT, heatLiquid, THERMO_LEVELS, DEPTH_LEVELS, PIXEL_COLOURS, depthOver, BATTERY_CAP, MOTOR_RATE, SOLAR_SUN, SOLAR_CLOUD, SOLAR_REACH, COOLANT_DRAW, sunlit, propel, coolantFed, coolantTouching, MEMBRANE_RATE, membrane, GEYSER_HEAT, GEYSER_BURST, VENT_EVERY, geyser, vent, SOURCES, LOGIC, TRIGGERS, TARGETS, DEVICE_NAMES, TIMER_PERIODS, COUNTER_LIMITS, SPRING_RATE, DRAIN_RATE, BOILER_TEMP, SEPARATE_RATE, SEPARATE_LIMIT, turbineSpins, wheelTurns, separate, pumpAt, isTarget, placeDevice, removeDevice, useDeviceTool, linkClick, toggleLeversNear, plateLoaded, sensed, setGate, emit, drain, devicesTick, deviceState };
