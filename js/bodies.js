// Floating bodies: buoyancy, collision, stacking and the explorer.
import { windAt } from './air.js';
import { explorerTools } from './explorer.js';
import { ACID, H, LAVA, PH, POISON, PW, SLIME, SMOKE, STEAM, T, TONIC, W, WATER } from './config.js';
import { OXYGEN } from './config.js';
import { driveCreature } from './creatures.js';
import { toggleLeversNear } from './devices.js';
import { DRAG, LIQ, RHO } from './liquids.js';
import { DRAIN_REACH, whirlpools } from './momentum.js';
import { bubbleAt, puff } from './particles.js';
import { charged } from './power.js';
import { hex, pack } from './util.js';
import { S, bodies, drop, held, liq, solid, temp, typ, under, vel } from './world.js';
import { POWDER, THIN } from './powders.js';












const G = 0.13;
const ROPE = 14, LIFT = 0.25, LIFT_MASS = 90;   // a balloon's rope length (px), its own upward pull, and the mass it can carry
const PADDLE_TOP = 1.6;   // fastest a paddled vehicle goes (px per tick)
function sprite(rows, pal) {
  return rows.join('').split('').map(ch => ch === '.' ? 0 : pack(hex(pal[ch])));
}
const CRATE_SPR = (() => {
  const out = [], o = pack(hex('#3d2410')), f = pack(hex('#c08a4a')), m = pack(hex('#9a6634')), d = pack(hex('#7a4f27'));
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (x === 0 || y === 0 || x === 9 || y === 9) out.push(o);
    else if (x === 1 || y === 1 || x === 8 || y === 8 || x === y || (x === y + 1 && x < 8)) out.push(f);
    else out.push(y % 3 === 0 ? d : m);
  }
  return out;
})();
const WEIGHT_SPR = sprite([
  '..oooo..',
  '.oo..oo.',
  '.oooooo.',
  'ohhhmmmo',
  'ohmmmmmo',
  'ommmmmdo',
  'ommmmddo',
  'oooooooo'], { o: '#16181d', h: '#9aa3b2', m: '#5c6370', d: '#3c424c' });
const EXPLORER_PAL = { o: '#1a1420', h: '#2fa59a', s: '#f1c39b', e: '#1a1420', c: '#d9773a', b: '#5a3a22' };
const EXPLORER_TOP = ['..ooo..', '.ohhho.', 'ohhhhho', 'ohsseso', '.ossso.', '.occco.', 'occccco', 'occccco', '.obbbo.'];
const EXPLORER_A = sprite(EXPLORER_TOP.concat(['.oo.oo.', '.oo.oo.']), EXPLORER_PAL);
const EXPLORER_B = sprite(EXPLORER_TOP.concat(['..o.oo.', '.oo..oo']), EXPLORER_PAL);
const FISH_SPR = sprite(['.bbbb.f', 'bebbbff', 'bbbbbff', '.bbbb.f'], { b: '#f0a040', e: '#1a1420', f: '#ffcf70' });
const SALAMANDER_SPR = sprite(['.rr.....', 'rerrrrrt', 'rrrrrrtt', '.r..r...'], { r: '#ff7a2a', e: '#1a1420', t: '#ffb347' });
const PIKE_SPR = sprite(['..ggggg...f', '.gsgsgsg.ff', 'gegggggggff', '.ddddddd.ff', '..ddddd...f'], { g: '#5a8a4a', s: '#a8c870', e: '#f0e070', d: '#c8d8a0', f: '#3e6a34' });
const PLANK_SPR = sprite(['oooooooo', 'ollmmlmo', 'oooooooo'], { o: '#3d2410', l: '#c08a4a', m: '#9a6634' });
const BIRD_SPR = sprite(['d...d', '.ddd.', '..b..'], { d: '#3a3440', b: '#e0a040' }), BIRD_FLAP = sprite(['.....', 'ddddd', '..b..'], { d: '#3a3440', b: '#e0a040' });
const MOTH_SPR = sprite(['w.w', 'wbw'], { w: '#e8e0c8', b: '#6a5a48' });
const SLIMELING_SPR = sprite(['..hhgg..', '.hggggg.', 'ggeggegg', 'gggggggg', 'gggggggg', '.gggggg.'], { g: '#4fc46a', h: '#c8ff9a', e: '#1a1420' });
// A raft: lashed planks with dark seams.
const RAFT_SPR = (() => {
  const out = [], o = pack(hex('#3d2410')), p = pack(hex('#b07a3e')), d = pack(hex('#7a4f27')), l = pack(hex('#d29a5a'));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 24; x++) out.push(y === 0 || y === 4 || x === 0 || x === 23 ? o : x % 6 === 5 ? d : y === 1 ? l : p);
  return out;
})();
// A boat: a hull that narrows towards the keel, with a light gunwale.
const BOAT_SPR = (() => {
  const out = [], o = pack(hex('#2a1a10')), g = pack(hex('#e0b070')), p = pack(hex('#9a6634')), d = pack(hex('#6e4722'));
  for (let y = 0; y < 7; y++) for (let x = 0; x < 26; x++) {
    const inset = y >= 4 ? (y - 3) * 2 : 0;
    if (x < inset || x >= 26 - inset) { out.push(0); continue; }
    const edge = x === inset || x === 25 - inset || y === 6;
    out.push(edge ? o : y === 0 ? g : y === 3 ? d : p);
  }
  return out;
})();
// An aether balloon: a violet bubble with a highlight and a knot.
const BALLOON_SPR = (() => {
  const out = [], o = pack(hex('#4a2a7a')), m = pack(hex('#b98cf5')), h = pack(hex('#efdcff')), k = pack(hex('#7a5cb0'));
  for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
    const dx = x - 3.5, dy = y - 3.8, r = dx * dx + dy * dy;
    if (y >= 8) out.push(x === 3 || x === 4 ? k : 0);
    else if (r > 16) out.push(0);
    else if (r > 11) out.push(o);
    else out.push((x === 2 && y === 2) || (x === 2 && y === 3) || (x === 3 && y === 2) ? h : m);
  }
  return out;
})();
// creature: moved by js/creatures.js; walker: steps up ledges like the explorer; wooden: burns and rots;
// vehicle: how hard the explorer can paddle it; lift: rises in air, and on a rope lifts LIFT_MASS worth of body;
// small: other bodies don't push it or get pushed by it (moths and birds flit past things); flap: a second sprite it
// alternates with while flying
const KINDS = {
  crate:      { w: 10, h: 10, rho: 0.6,  sprite: CRATE_SPR, wooden: true },
  plank:      { w: 8,  h: 3,  rho: 0.5,  sprite: PLANK_SPR, wooden: true },   // broken wood, from blasts
  raft:       { w: 24, h: 5,  rho: 0.4,  sprite: RAFT_SPR, wooden: true, vehicle: 0.04 },
  boat:       { w: 26, h: 7,  rho: 0.3,  sprite: BOAT_SPR, wooden: true, vehicle: 0.08 },
  balloon:    { w: 8,  h: 10, rho: 0.05, sprite: BALLOON_SPR, lift: true },
  weight:     { w: 8,  h: 8,  rho: 7,    sprite: WEIGHT_SPR },
  explorer:   { w: 7,  h: 11, rho: 0.85, sprite: EXPLORER_A },
  fish:       { w: 7,  h: 4,  rho: 1.0,  sprite: FISH_SPR, creature: true },
  pike:       { w: 11, h: 5,  rho: 1.0,  sprite: PIKE_SPR, creature: true },
  moth:       { w: 3,  h: 2,  rho: 0.3,  sprite: MOTH_SPR, creature: true, small: true },
  bird:       { w: 5,  h: 3,  rho: 0.3,  sprite: BIRD_SPR, flap: BIRD_FLAP, creature: true, small: true },
  salamander: { w: 8,  h: 4,  rho: 3.1,  sprite: SALAMANDER_SPR, creature: true, walker: true },
  slimeling:  { w: 8,  h: 6,  rho: 1.6,  sprite: SLIMELING_SPR, creature: true },
};
function addBody(kind, x, y) {
  const K = KINDS[kind];
  const old = kind === 'explorer' ? bodies.findIndex(b => b.kind === 'explorer') : -1;
  if (bodies.length - (old >= 0 ? 1 : 0) >= 80) return;   // full: keep everything, including the current explorer
  if (old >= 0) bodies.splice(old, 1);
  S.nextId = (S.nextId || 0) + 1;
  const b = { id: S.nextId, kind, x, y, w: K.w, h: K.h, vx: 0, vy: 0, face: 1, heat: 0, ouch: 0, walk: 0, ward: 0 };
  if (kind === 'explorer') { b.hp = 100; b.air = 100; S.spawn = { x, y }; }   // fainting wakes the explorer here
  bodies.push(b);
  return b;
}
// Ties a new balloon to the nearest body below it, within ROPE * 2 pixels.
function tieBalloon(bal) {
  let best = null, bestD = ROPE * 2;
  for (const o of bodies) {
    if (o === bal || KINDS[o.kind].lift || o.y < bal.y) continue;
    const d = Math.hypot(o.x + o.w / 2 - (bal.x + bal.w / 2), o.y - (bal.y + bal.h));
    if (d < bestD) { best = o; bestD = d; }
  }
  bal.tie = best ? best.id : null;
  return best;
}
function collides(b, x, y) {
  if (x < 0 || x + b.w > PW || y + b.h > PH) return true;
  const x0 = Math.floor(x / T), x1 = Math.floor((x + b.w - 0.001) / T);
  const y0 = Math.max(0, Math.floor(y / T)), y1 = Math.floor((y + b.h - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * W + tx;
    if (solid[k] && !(POWDER[solid[k]] && held[k] && held[k] < THIN)) return true;   // a thin layer of powder doesn't stop a body
  }
  return false;
}
// Moves in 1 px steps against the tile grid. canStep lets a walker climb ledges up to one tile high.
function moveBy(b, dx, dy, canStep) {
  b.hitX = false; b.hitY = false;
  const nx = Math.ceil(Math.abs(dx));
  for (let i = 0; i < nx; i++) {
    const s = dx / nx;
    if (!collides(b, b.x + s, b.y)) { b.x += s; continue; }
    if (canStep) {
      let up = 1;
      while (up <= T && collides(b, b.x + s, b.y - up)) up++;
      if (up <= T) { b.y -= up; b.x += s; continue; }
    }
    b.hitX = true; break;
  }
  const ny = Math.ceil(Math.abs(dy));
  for (let i = 0; i < ny; i++) {
    const s = dy / ny;
    if (!collides(b, b.x, b.y + s)) { b.y += s; continue; }
    b.hitY = true; break;
  }
}
// How much of the body sits in liquid, weighted by each liquid's density and drag. Gases don't hold a body up, drag
// it, carry it or shove it; they count only where they hurt (poison gas, scalding steam).
function sampleLiquid(b) {
  let area = 0, buoy = 0, drag = 0, flow = 0, lava = 0, acid = 0, tonic = 0, shock = 0, poison = 0, push = 0, pour = 0, scald = 0, water = 0, slime = 0;
  const x0 = Math.max(0, Math.floor(b.x / T)), x1 = Math.min(W - 1, Math.floor((b.x + b.w - 0.01) / T));
  const y0 = Math.max(0, Math.floor(b.y / T)), y1 = Math.min(H - 1, Math.floor((b.y + b.h - 0.01) / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * W + tx, a = liq[k];
    if (!a) continue;
    const t = typ[k], g = LIQ[t].grav;
    const pk = k - W * g, pIn = g > 0 ? ty > 0 : ty < H - 1;
    const hpx = pIn && liq[pk] && typ[pk] === t ? T : a * T / 255;
    const ly0 = g > 0 ? ty * T + T - hpx : ty * T, ly1 = g > 0 ? ty * T + T : ty * T + hpx;
    const ox = Math.min(b.x + b.w, tx * T + T) - Math.max(b.x, tx * T);
    const oy = Math.min(b.y + b.h, ly1) - Math.max(b.y, ly0);
    if (ox <= 0 || oy <= 0) continue;
    const ar = ox * oy;
    if (LIQ[t].gas) { if (t === POISON) poison += ar; else if (t === STEAM && temp[k] > 90) scald += ar; continue; }
    area += ar; buoy += ar * RHO[t]; drag += ar * DRAG[t];
    if (t === LAVA) lava += ar; else if (t === ACID) acid += ar; else if (t === TONIC) tonic += ar;
    else if (t === POISON) poison += ar;
    else if (t === WATER) water += ar;
    else if (t === SLIME) slime += ar;
    else if (t === STEAM && temp[k] > 90) scald += ar;
    if (charged(k)) shock += ar;
    const l = tx > 0 && typ[k - 1] === t ? liq[k - 1] : a, r = tx < W - 1 && typ[k + 1] === t ? liq[k + 1] : a;
    flow += (l - r) * ar;
    push += vel[k] * ar;
    if (drop[k] >= 2 && g > 0) pour += ar * Math.min(drop[k], 8);
  }
  return { area, buoy, drag, flow, lava, acid, tonic, shock, poison, push, pour, scald, water, slime };
}
const keys = {};
// The body the explorer stands on, if any (a raft, a boat, a crate...).
function standingOn(b) {
  return bodies.find(c => c !== b && !KINDS[c.kind].lift && Math.abs(c.y - (b.y + b.h)) < 1.5 && c.x < b.x + b.w && c.x + c.w > b.x) || null;
}
function driveExplorer(b, grounded, sub) {
  const dir = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  const ride = standingOn(b);
  if (ride) grounded = true;   // standing on a body counts as ground, for jumping
  const V = ride && KINDS[ride.kind].vehicle;
  if (V && ride.wet) {   // aboard a floating raft or boat, the arrows paddle it instead of walking off
    if (dir) { b.face = dir; ride.vx = Math.max(-PADDLE_TOP, Math.min(PADDLE_TOP, ride.vx + dir * V)); }
    b.vx = ride.vx;
    if (keys.ArrowUp) b.vy = -3.3;
    b.walk = 0;
    if (keys.ArrowDown && !b.downHeld) toggleLeversNear(b);
    b.downHeld = !!keys.ArrowDown;
    explorerTools(b);
    return;
  }
  const swim = sub > 0.35;
  if (dir) { b.face = dir; b.vx += (dir * (swim ? 0.9 : 1.4) - b.vx) * (grounded ? 0.35 : 0.15); }
  else if (grounded) b.vx *= 0.6;
  if (keys.ArrowUp) {
    if (grounded && !swim) b.vy = -3.3;
    else if (swim) b.vy -= 0.3;
  }
  b.walk = grounded && Math.abs(b.vx) > 0.2 ? b.walk + Math.abs(b.vx) : 0;
  if (keys.ArrowDown && !b.downHeld) toggleLeversNear(b);
  b.downHeld = !!keys.ArrowDown;
  explorerTools(b);
}
// A body near a whirlpool is pulled round and in.
function whirl(b, sub) {
  if (sub < 0.3) return;
  for (const w of whirlpools) {
    const dx = b.x + b.w / 2 - w.x, dy = b.y + b.h / 2 - w.y, d = Math.hypot(dx, dy);
    if (d < 1 || d > DRAIN_REACH * T * 1.5) continue;
    b.vx += (-dy / d) * 0.12 - dx / d * 0.05;
    b.vy += (dx / d) * 0.12 - dy / d * 0.05;
  }
}
// A body landing fast in liquid throws it outward in a wave.
function splashBody(b) {
  const cx = b.x + b.w / 2, y = Math.min(H - 1, ((b.y + b.h) / T) | 0);
  for (let ty = Math.max(0, y - 1); ty <= Math.min(H - 1, y + 1); ty++) for (let tx = Math.max(0, ((b.x / T) | 0) - 2); tx <= Math.min(W - 1, (((b.x + b.w) / T) | 0) + 2); tx++) {
    const k = ty * W + tx;
    if (liq[k]) vel[k] = Math.sign(tx * T + 4 - cx) * Math.min(1, b.vy * 0.25);
  }
}
function unstick(b) {
  for (let r = 1; r <= 24; r++) {
    for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r]]) {
      if (!collides(b, b.x + dx, b.y + dy)) { b.x += dx; b.y += dy; b.vx = 0; b.vy = 0; return; }
    }
  }
  b.y -= T;   // deeply buried: keep rising until it's out
}
function centerTile(b) { return Math.min(H - 1, Math.max(0, ((b.y + b.h / 2) / T) | 0)) * W + Math.min(W - 1, Math.max(0, ((b.x + b.w / 2) / T) | 0)); }
// A taut rope hands the balloon's lift to the body it's tied to and keeps the balloon within reach.
function ropes() {
  for (const b of bodies) {
    if (!KINDS[b.kind].lift || b.tie == null) continue;
    const t = bodies.find(o => o.id === b.tie);
    if (!t) { b.tie = null; continue; }
    const dx = t.x + t.w / 2 - (b.x + b.w / 2), dy = t.y - (b.y + b.h), d = Math.hypot(dx, dy);
    if (d <= ROPE) continue;
    const mt = KINDS[t.kind].rho * t.w * t.h;
    t.vy -= G * LIFT_MASS / mt;
    moveBy(b, dx * (d - ROPE) / d, dy * (d - ROPE) / d);
    b.vx = t.vx; b.vy = Math.min(b.vy, t.vy);
  }
}
// Health: the explorer faints at 0 and wakes at the spawn point, losing what's in the bucket. In a puzzle, fainting fails it.
function hurt(b, n) {
  if (b.ward) return;
  b.hp = (b.hp ?? 100) - n; b.lastHurt = S.tick;
  if (b.hp > 0) return;
  puff(centerTile(b), 'smoke');
  const sp = S.spawn || { x: b.x, y: b.y };
  b.x = sp.x; b.y = sp.y; b.vx = 0; b.vy = 0; b.hp = 100; b.air = 100; b.ouch = 60; b.fainted = S.tick;
  if (b.inv) b.inv.bucket = null;
  if (S.level) S.level.fainted = true;
}
// Air: liquid over the explorer's face uses it up (about 6 s from full), open air refills it fast; smoke and
// poison at the face use it up too, while oxygen can be breathed. Out of air, health drains. Health slowly comes back
// after 3 s without harm.
function breathe(b) {
  const k = Math.min(H - 1, Math.max(0, ((b.y + 2) / T) | 0)) * W + Math.min(W - 1, Math.max(0, ((b.x + b.w / 2) / T) | 0));
  const t = liq[k] ? typ[k] : 0, choking = liq[k] > 96 && t !== OXYGEN && (LIQ[t].grav > 0 || t === SMOKE || t === POISON);
  b.air = Math.max(0, Math.min(100, (b.air ?? 100) + (choking ? -0.28 : 1.5)));
  if (choking && liq[k] && !LIQ[t].gas && Math.random() < 0.03) bubbleAt(b.x + (b.face > 0 ? b.w : 0), b.y + 2);   // breathing out
  if (!b.air) hurt(b, 0.4);
  if (temp[k] < -15) hurt(b, 0.05);   // bitter cold
  if (b.hp < 100 && b.air > 0 && S.tick - (b.lastHurt || 0) > 180) b.hp = Math.min(100, b.hp + 0.05);
}
function updateBodies() {
  ropes();
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i], K = KINDS[b.kind], A = b.w * b.h;
    if (collides(b, b.x, b.y)) { unstick(b); continue; }   // buried by painting: hop to the nearest free spot
    const s = sampleLiquid(b), sub = s.area / A;
    if (S.momentum && sub > 0.05 && !b.wet && b.vy > 2) splashBody(b);
    b.wet = sub > 0.05;
    b.vy += G * (1 - s.buoy / (K.rho * A));
    if (K.lift) { b.vy = Math.max(-1.2, b.vy - LIFT); if (s.lava || s.acid || temp[centerTile(b)] > 120) { puff(centerTile(b), 'spark'); bodies.splice(i, 1); continue; } }   // heat or acid pops it
    if (sub > 0) {
      const k = Math.min(0.5, s.drag / A);
      b.vx *= 1 - k; b.vy *= 1 - k;
      b.vx += s.flow / A * 0.0006;
      if (S.momentum) {
        b.vx += s.push / A * 0.35;   // currents carry bodies along
        b.vy += s.pour / A * 0.04;   // falling water shoves them down
        whirl(b, sub);
      }
      if (sub < 0.97) b.vy += Math.sin(S.tick * 0.07 + b.x * 0.15) * 0.015;   // surface bob
    }
    const grounded = collides(b, b.x, b.y + 1);
    const ck = centerTile(b);
    if (S.weather && !under[ck] && !grounded && sub < 0.5) b.vx += windAt(ck % W, (ck / W) | 0) * 0.02 / K.rho;   // the wind pushes things in the open
    if (b.kind === 'explorer') driveExplorer(b, grounded, sub);
    else if (K.creature) { if (!driveCreature(b, s, sub, grounded, A, addBody)) { bodies.splice(i, 1); continue; } }
    else if (grounded && sub < 0.3) b.vx *= 0.8;
    b.vx = Math.max(-4, Math.min(4, b.vx)); b.vy = Math.max(-6, Math.min(5, b.vy));
    moveBy(b, b.vx, b.vy, (b.kind === 'explorer' || K.walker) && grounded);
    if (b.hitX) b.vx = 0;
    if (b.hitY) b.vy = 0;
    if (K.wooden) {
      b.heat += (s.lava + s.acid * 0.35) / A + Math.max(0, temp[centerTile(b)] - 250) / 200;
      if (s.lava && Math.random() < 0.08) puff(centerTile(b), 'smoke');
      if (b.heat > 40) { const c = centerTile(b); puff(c, 'smoke'); puff(c, 'ember'); puff(c, 'ember'); bodies.splice(i, 1); continue; }
    } else if (b.kind === 'explorer') {
      // a dip in tonic wards the explorer against lava, acid and heat for a while
      if (s.tonic / A > 0.1) { if (!b.ward) puff(centerTile(b), 'spark'); b.ward = 600; }
      else if (b.ward > 0) b.ward--;
      if (b.ouch > 0) b.ouch--;
      else if (!b.ward && (s.lava / A > 0.05 || s.acid / A > 0.15 || s.shock / A > 0.1 || s.poison / A > 0.3 || s.scald / A > 0.3 || temp[centerTile(b)] > 120)) {
        b.vy = -3.6; b.ouch = 40; puff(centerTile(b), s.shock ? 'zap' : s.lava ? 'smoke' : s.scald ? 'steam' : 'fizz');
        hurt(b, s.lava / A > 0.05 ? 35 : s.shock / A > 0.1 ? 20 : s.acid / A > 0.15 ? 15 : 10);
      }
      breathe(b);
    }
  }
  // bodies stack and push each other; heavier ones move less
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], c = bodies[j];
    if (KINDS[a.kind].small || KINDS[c.kind].small) continue;
    const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
    const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
    if (ox <= 0 || oy <= 0) continue;
    if (oy <= ox) {
      const top = a.y < c.y ? a : c, bot = top === a ? c : a;
      const y0 = top.y;
      moveBy(top, 0, -oy);
      const rest = oy - (y0 - top.y);
      if (rest > 0.01) moveBy(bot, 0, rest);
      if (top.vy > bot.vy) top.vy = bot.vy;
      top.vx += (bot.vx - top.vx) * 0.2;
    } else {
      const left = a.x < c.x ? a : c, right = left === a ? c : a;
      const ml = KINDS[left.kind].rho * left.w * left.h, mr = KINDS[right.kind].rho * right.w * right.h;
      const x0 = left.x;
      moveBy(left, -ox * mr / (ml + mr), 0);
      const rest = ox - (x0 - left.x);
      if (rest > 0.01) moveBy(right, rest, 0);
      if (left.vx > right.vx) { const v = (left.vx * ml + right.vx * mr) / (ml + mr); left.vx = v; right.vx = v; }
    }
  }
}

export { G, ROPE, LIFT, LIFT_MASS, PADDLE_TOP, RAFT_SPR, BOAT_SPR, BALLOON_SPR, tieBalloon, standingOn, ropes, hurt, breathe, sprite, CRATE_SPR, WEIGHT_SPR, FISH_SPR, SALAMANDER_SPR, SLIMELING_SPR, PLANK_SPR, PIKE_SPR, MOTH_SPR, BIRD_SPR, BIRD_FLAP, EXPLORER_PAL, EXPLORER_TOP, EXPLORER_A, EXPLORER_B, KINDS, addBody, collides, moveBy, sampleLiquid, keys, driveExplorer, unstick, centerTile, updateBodies };
