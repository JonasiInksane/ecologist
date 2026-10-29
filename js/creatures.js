// Creatures: bodies that move on their own. Fish swim in water and die out of it, in acid, poison or hot water;
// salamanders swim in lava and walk out of it, setting what they stand on alight, and die if they cool or touch water;
// slimelings hop about, hurt the explorer, grow by absorbing slime and split in two, and die to acid, lava, salt,
// live power and heat. Fish graze the algae in their water, breed in a big enough pool only while well fed, and
// suffocate in an algae bloom. Dead creatures rot into fertiliser, unless they burnt.
// Pike are bigger fish that hunt the small ones (which flee them): they breed only while well fed and starve without
// prey, then rot and feed the algae the small fish eat, so a lake cycles instead of filling up. Moths fly low over land
// and eat leaves, breed while fed, and die in water, fire, hard frost or hunger; on cold nights they settle and wait.
// Fish leap at moths just over the water.
import { H, SALT, SLIME, T, W, WATER } from './config.js';
import { bubbleAt, puff } from './particles.js';
import { bodies, heatWake, liq, solid, temp, typ, wake } from './world.js';
import { NSOL, SOL_FERT } from './config.js';
import { sol } from './world.js';
import { FERT, SOL_ALGAE } from './config.js';
import { addSol } from './solutes.js';
import { sunHeight } from './daynight.js';
import { LIQ } from './liquids.js';
import { AIR, LEAF } from './config.js';
import { FISH_GASPS, PIKE_GASPS, breatheAir, breatheWater, oxygenIn, stifling } from './oxygen.js';
import { COMB, FLOWER, SOL_AMMONIA } from './config.js';
import { held } from './world.js';
import { ROT_OX } from './solutes.js';
import { S, markDirty } from './world.js';
import { ecoAppetite, ecoBirth, ecoComb, ecoDeposit, ecoEatLeaf, ecoEatPrey, ecoFeed, ecoFood, ecoGraze, ecoMaintain, ecoSetComb, ecoSettleBody, ecoTissue, ecoInstallTissue } from './ecology.js';
import { ECO_C, ECO_COST, ECO_RATE } from './ecology-data.js';
import { bioPool } from './ecology-core.js';
import { ecoTakeNectar } from './ecology.js';

const MAX_OF_KIND = 30, STRANDED = 400, COLD = 900, SPLIT_MASS = 255;
const WELL_FED = 1200, BITE = 2, ROT = 60;
const SHOAL = 24, SHOAL_Y = 16, CROWDED = 4, CROWD_X = 64, CROWD_Y = 32;   // pixels: a fish breeds with another this close by, unless this many fish already swim within CROWD_X by CROWD_Y of it
const FISH_BREATH = 0.001, SUFFOCATE = 300, AIR_GONE = 300, AMMONIA_KILLS = 80;   // mg/L of oxygen a fish uses a tick; ticks it lasts without enough
const PIKE_MAX = 6, PIKE_STARVE = 7200, PIKE_DIGEST = 1200, HUNT_RANGE = 48, FLEE_RANGE = 32;   // ticks; pixels
const BIRD_MAX = 8, BIRD_STARVE = 14400, BIRD_SEEK = 120, BIRD_COLD = -25, BIRD_FROZEN = 1800;   // BIRD_SEEK in pixels
const MOTH_MAX = 20, MOTH_STARVE = 10800, MOTH_REST = 5, MOTH_COLD = -20, MOTH_FROZEN = 1200, MOTH_HOT = 60, MOTH_SEEK = 16, MOTH_EAT = 0.03, MOTH_GIVE_UP = 300;   // MOTH_SEEK in tiles
const DEATH_HISTORY = 128;   // recent events retained with the world; counts do not grow an unbounded event list

function recordDeath(b, k, cause) {
  if (b.deathCause) return;
  b.deathCause = cause;
  const diagnostic = S.diagnostics || (S.diagnostics = { deaths: [], deathCounts: {}, births: {} });
  const key = b.kind + ':' + cause;
  diagnostic.deathCounts[key] = (diagnostic.deathCounts[key] || 0) + 1;
  diagnostic.deaths.push({ id: b.id, kind: b.kind, cause, tick: S.tick, tile: k, night: sunHeight() <= 0,
    oxygen: liq[k] && typ[k] === WATER ? oxygenIn(k) : null,
    ammonia: liq[k] ? sol[k * NSOL + SOL_AMMONIA] : 0, temperature: temp[k] });
  if (diagnostic.deaths.length > DEATH_HISTORY) diagnostic.deaths.shift();
}
// Flying-creature decay is a later life-cycle change; retain its current behavior while recording every death.
function vanishCreature(b, k, fx, cause) { return die(b, k, fx, cause); }
export { DEATH_HISTORY, recordDeath };

// Moths and birds breathe the air they're in: false once they've choked on stale air too long.
function airless(b, k) {
  b.choke = stifling(k) ? (b.choke || 0) + 1 : 0;
  return b.choke <= AIR_GONE;
}
function centre(b) { return Math.min(H - 1, Math.max(0, ((b.y + b.h / 2) / T) | 0)) * W + Math.min(W - 1, Math.max(0, ((b.x + b.w / 2) / T) | 0)); }
function howMany(kind) { let n = 0; for (const b of bodies) if (b.kind === kind) n++; return n; }
// Swims about in its liquid: keeps a heading, turns at walls and now and then, and stays under the surface.
function swim(b, sub) {
  if (!b.dir || b.hitX || Math.random() < 0.008) b.dir = b.dir ? -b.dir : Math.random() < 0.5 ? -1 : 1;
  b.vx += (b.dir * 0.6 - b.vx) * 0.1;
  b.vy += (Math.random() - 0.5) * 0.12 + (sub < 0.95 ? 0.1 : 0);
  b.face = b.dir;
}
// Walks along the ground, turning at walls.
function walk(b, grounded) {
  if (!b.dir || b.hitX || Math.random() < 0.004) b.dir = b.dir ? -b.dir : Math.random() < 0.5 ? -1 : 1;
  if (grounded) b.vx = b.dir * 0.5;
  b.face = b.dir;
}
// Moves one creature for a tick. s is its sample of the liquid around it, A its area. Returns false if it died.
function driveCreature(b, s, sub, grounded, A, addBody) {
  if (b.eaten) { recordDeath(b, centre(b), 'predation'); return false; }
  const k = centre(b), Tk = temp[k];
  if (!ecoMaintain(b, k)) return die(b, k, 'fizz', 'starvation');
  if (b.kind === 'moth') return driveMoth(b, s, k, Tk, A, addBody);
  if (b.kind === 'bird') return driveBird(b, s, k, Tk, grounded, addBody);
  if (b.kind === 'bee') return driveBee(b, s, k, Tk, addBody);
  if (solid[k] || s.acid / A > 0.1 || s.poison / A > 0.2 || s.shock / A > 0.1) return die(b, k, 'fizz', solid[k] ? 'crushed' : s.acid / A > 0.1 ? 'acid' : s.poison / A > 0.2 ? 'toxic-gas' : 'electricity');
  if (b.kind === 'fish' || b.kind === 'pike') {
    if (s.lava || (liq[k] && Tk > 45)) return die(b, k, 'steam', 'heat');   // hot water (not hot air: a fish mid-leap is fine)
    const algae = liq[k] && typ[k] === WATER ? sol[k * NSOL + SOL_ALGAE] : 0;
    b.hunger = (b.hunger || 0) + 1;
    const pike = b.kind === 'pike';
    if (liq[k] && typ[k] === WATER) {   // breathing: it uses the water's oxygen, and suffocates where there's too little
      b.gasp = oxygenIn(k) < (pike ? PIKE_GASPS : FISH_GASPS) ? (b.gasp || 0) + 1 : 0;
      if (sol[k * NSOL + SOL_AMMONIA] > AMMONIA_KILLS) return die(b, k, 'fizz', 'ammonia');
      if (b.gasp > SUFFOCATE) return die(b, k, 'fizz', 'hypoxia');
    }
    if (!pike && algae > 0 && Math.random() < 0.02 && ecoGraze(b, k, BITE * liq[k] / 255)) b.grazed = true;
    const chasing = !pike && snapMoth(b, k, s.water / A > 0.6);   // small fish eat moths; pike eat fish
    if (s.water / A > 0.6) {
      b.air = 0;
      if (Math.random() < 0.003) bubbleAt(b.x + (b.face > 0 ? b.w : 0), b.y + 1);   // a fish breathes out now and then
      if (pike) { hunt(b, sub, addBody); return true; }
      if (!chasing) swim(b, sub);
      flee(b);
      if (b.grazed && b.hunger < WELL_FED && Math.random() < 0.0004 && howMany('fish') < MAX_OF_KIND && shoal(b)) ecoBirth(b, addBody);
    } else {
      b.air = (b.air || 0) + 1;
      if (b.air > STRANDED) return die(b, k, 'fizz', 'stranded');
      if (grounded && Math.random() < 0.05) { b.vy = -1.6; b.vx = 0.8 * towardWater(k); }   // flops, towards water if it can see some
    }
  } else if (b.kind === 'salamander') {
    if (s.water / A > 0.3) return die(b, k, 'steam', 'quenched');
    if (s.lava / A > 0.5) { b.cold = 0; swim(b, sub); }
    else {
      walk(b, grounded);
      b.cold = Tk < 200 ? (b.cold || 0) + 1 : 0;
      if (b.cold > COLD) return die(b, k, 'smoke', 'cold');
      const feet = k + W;   // it's hot enough to set what it stands on alight
      if (feet < W * H && solid[feet] && temp[feet] < 220) { temp[feet] = 220; heatWake(feet); }
    }
  } else if (b.kind === 'slimeling') {
    if (s.lava || Tk > 150 || touchesSalt(b)) return die(b, k, 'fizz', s.lava || Tk > 150 ? 'heat' : 'salt');
    absorb(b);
    if (b.mass >= SPLIT_MASS && howMany('slimeling') < MAX_OF_KIND) { b.mass = 0; addBody('slimeling', b.x + (b.face > 0 ? -9 : 9), b.y); puff(k, 'fizz'); }
    const ex = bodies.find(o => o.kind === 'explorer');
    if (grounded && Math.random() < 0.03) {   // hops, towards the explorer when close
      const toward = ex && Math.abs(ex.x - b.x) < 80 ? Math.sign(ex.x - b.x) : (Math.random() < 0.5 ? -1 : 1);
      b.vy = -2.4; b.vx = toward * 1.1; b.face = toward || b.face;
    }
    if (ex && !ex.ward && !ex.ouch && ex.x < b.x + b.w && ex.x + ex.w > b.x && ex.y < b.y + b.h && ex.y + ex.h > b.y) { ex.ouch = 40; ex.vy = -3; puff(k, 'fizz'); }
  }
  return true;
}
// Whether fish b has a mate close by and room to breed: another fish within SHOAL, and fewer than CROWDED fish within
// CROWD_X by CROWD_Y, so a small pool's fish stop at a few instead of filling it to the world's limit.
function shoal(b) {
  let mate = false, near = 1;   // this fish occupies one of the local population slots
  for (const o of bodies) {
    if (o === b || o.kind !== 'fish' || o.eaten) continue;
    const dx = Math.abs(o.x - b.x), dy = Math.abs(o.y - b.y);
    if (dx < CROWD_X && dy < CROWD_Y && ++near >= CROWDED) return false;
    if (dx < SHOAL && dy < SHOAL_Y) mate = true;
  }
  return mate;
}
// The nearest live body of a kind within range pixels of b (centre to centre), or null.
function nearest(b, kind, range) {
  let best = null, bd = range * range;
  for (const o of bodies) {
    if (o === b || o.kind !== kind || o.eaten) continue;
    const dx = o.x + o.w / 2 - b.x - b.w / 2, dy = o.y + o.h / 2 - b.y - b.h / 2, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
// A pike chases the nearest small fish and eats it on reaching it, then rests while it digests (so a pond's fish can
// keep up with it); after two fish, with another pike near, it breeds.
function hunt(b, sub, addBody) {
  if (b.full > 0) { b.full--; swim(b, sub); return; }
  const prey = nearest(b, 'fish', HUNT_RANGE);
  if (!prey) { swim(b, sub); return; }
  const dx = prey.x + prey.w / 2 - b.x - b.w / 2, dy = prey.y + prey.h / 2 - b.y - b.h / 2;
  b.dir = b.face = dx < 0 ? -1 : 1;
  b.vx += (b.dir * 1.0 - b.vx) * 0.15;
  b.vy += Math.sign(dy) * 0.08 + (sub < 0.95 ? 0.1 : 0);
  // touching (bodies push each other apart, so they never overlap): it eats the fish
  if (Math.abs(dx) < (b.w + prey.w) / 2 + 1 && Math.abs(dy) < (b.h + prey.h) / 2 + 1 && ecoEatPrey(b, prey, centre(b))) { b.full = PIKE_DIGEST; b.fed = (b.fed || 0) + 1; puff(centre(prey), 'fizz'); }
  if (b.fed >= 2 && Math.random() < 0.002 && howMany('pike') < PIKE_MAX && nearest(b, 'pike', 40) && ecoBirth(b, addBody)) b.fed = 0;
}
// A small fish swims away from a pike that comes close.
function flee(b) {
  const p = nearest(b, 'pike', FLEE_RANGE);
  if (!p) return;
  b.dir = b.face = p.x + p.w / 2 < b.x + b.w / 2 ? 1 : -1;
  b.vx += (b.dir * 0.8 - b.vx) * 0.15;
}
// A fish swims in under a moth fluttering just over the water, leaps at it from the surface, and eats it if it gets
// there, in the water or mid-leap. Returns whether it's going after one.
function snapMoth(b, k, inWater) {
  const m = nearest(b, 'moth', 28);
  if (!m) return false;
  const dx = m.x + 1.5 - b.x - b.w / 2, dy = m.y + 1 - b.y - b.h / 2;
  if (Math.abs(dx) < 5 && Math.abs(dy) < b.h / 2 + 5) { if (ecoEatPrey(b, m, k)) b.grazed = true; puff(k, 'fizz'); return false; }
  const surface = k >= W && !(liq[k - W] && typ[k - W] === WATER);
  if (!inWater || dy >= 0) return false;
  if (Math.abs(dx) >= 4) { b.dir = b.face = Math.sign(dx); b.vx += (b.dir * 0.8 - b.vx) * 0.2; return true; }   // swims in under it
  if (surface && dy > -18 && Math.random() < 0.05) { b.vy = -2.4; b.vx = Math.max(-0.6, Math.min(0.6, dx * 0.08)); }   // and leaps at it, nearly straight up, so it falls back in
  return true;
}
// Moths flutter a few tiles over the ground, towards the nearest leaf when there is one, and nibble it away.
function driveMoth(b, s, k, Tk, A, addBody) {
  const drowned = liq[k] >= 128 && LIQ_SINKS(typ[k]);   // under water; rain and splashes don't count
  if (drowned || s.lava || s.acid || Tk > MOTH_HOT || solid[k]) return vanishCreature(b, k, 'fizz', drowned ? 'drowned' : solid[k] ? 'crushed' : s.acid ? 'acid' : 'heat');
  if (!airless(b, k)) return vanishCreature(b, k, 'fizz', 'stale-air');
  b.chill = Tk < MOTH_COLD ? (b.chill || 0) + 1 : 0;
  b.hunger = (b.hunger || 0) + 1;
  if (b.chill > MOTH_FROZEN) return vanishCreature(b, k, 'fizz', 'cold');
  if (Tk < MOTH_REST) { b.vx *= 0.8; b.vy = 0; return true; }   // too cold to fly: it clings where it is and waits
  if (b.target == null || solid[b.target] !== LEAF || S.tick - (b.since || 0) > MOTH_GIVE_UP) { b.target = findLeaf(k, b.target); b.since = S.tick; }
  let wx, wy;
  if (b.target >= 0) {
    const tx = (b.target % W) * T + 4, ty = ((b.target / W) | 0) * T + 4;
    wx = Math.sign(tx - b.x - 1.5) * 0.6; wy = Math.sign(ty - b.y - 1) * 0.4;
    if (Math.abs(tx - b.x - 1.5) < 12 && Math.abs(ty - b.y - 1) < 12 && Math.random() < MOTH_EAT) {   // within a tile and a half
      if (ecoEatLeaf(b, b.target)) b.fed = (b.fed || 0) + 1;
      b.target = -1;
    }
  } else {
    if (!b.dir || b.hitX || Math.random() < 0.01) b.dir = b.dir ? -b.dir : Math.random() < 0.5 ? -1 : 1;
    let clear = 0;
    for (let o = k + W; clear < 6 && o < W * H && !solid[o] && !liq[o]; o += W) clear++;
    wx = b.dir * 0.5; wy = clear < 2 ? -0.5 : clear > 4 ? 0.3 : 0;
  }
  b.vx += (wx - b.vx) * 0.2;
  b.vy += (wy - b.vy) * 0.35 + (Math.random() - 0.5) * 0.3;   // holds itself up against gravity, fluttering
  b.face = b.vx < 0 ? -1 : 1;
  if (b.fed >= 2 && Math.random() < 0.01 && howMany('moth') < MOTH_MAX && nearest(b, 'moth', 40) && ecoBirth(b, addBody)) b.fed = 0;
  return true;
}
const LIQ_SINKS = t => t !== 0 && !LIQ[t].gas;   // a liquid a moth can drown in
// Birds fly six to twelve tiles over the land by day and chase down the nearest moth they can see, eating it when they
// reach it; after three, with another bird near, they breed. At night they settle and rest. They die in water, lava,
// acid or fire, in a long hard frost, or after four minutes without a moth.
function driveBird(b, s, k, Tk, grounded, addBody) {
  const drowned = liq[k] >= 128 && !LIQ[typ[k]].gas;
  b.chill = Tk < BIRD_COLD ? (b.chill || 0) + 1 : 0;
  b.hunger = (b.hunger || 0) + 1;
  if (drowned || s.lava || s.acid || Tk > 70 || solid[k] || b.chill > BIRD_FROZEN || !airless(b, k)) return vanishCreature(b, k, 'smoke', drowned ? 'drowned' : solid[k] ? 'crushed' : s.acid ? 'acid' : s.lava || Tk > 70 ? 'heat' : b.chill > BIRD_FROZEN ? 'cold' : 'stale-air');
  b.resting = sunHeight() < -0.1;
  if (b.resting) { b.vx *= 0.8; if (!grounded) b.vy = Math.min(b.vy, 0.6); return true; }   // drifts down and roosts
  let wx, wy;
  const m = nearest(b, 'moth', BIRD_SEEK);
  if (m) {
    const dx = m.x + 1.5 - b.x - 2.5, dy = m.y + 1 - b.y - 1.5, d = Math.hypot(dx, dy) || 1;
    wx = dx / d * 1.3; wy = dy / d * 1.3;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4 && ecoEatPrey(b, m, k)) b.fed = (b.fed || 0) + 1;
  } else {
    if (!b.dir || b.hitX || Math.random() < 0.004) b.dir = b.dir ? -b.dir : Math.random() < 0.5 ? -1 : 1;
    let clear = 0;
    for (let o = k + W; clear < 14 && o < W * H && !solid[o] && !liq[o]; o += W) clear++;
    wx = b.dir * 0.8; wy = clear < 6 ? -0.6 : clear > 12 ? 0.4 : 0;
  }
  b.vx += (wx - b.vx) * 0.15;
  b.vy += (wy - b.vy) * 0.35 + (Math.random() - 0.5) * 0.1;   // holds itself up against gravity
  b.face = b.vx < 0 ? -1 : 1;
  if (b.fed >= 3 && Math.random() < 0.01 && howMany('bird') < BIRD_MAX && nearest(b, 'bird', 60) && ecoBirth(b, addBody)) b.fed = 0;
  return true;
}
// The nearest leaf within MOTH_SEEK tiles of tile k, or -1; not the one it just gave up on, if there's another.
// Bees: by day, while it's warm, a bee flies to the nearest flower with nectar, drinks its fill and carries it home to
// its hive (honeycomb), where it turns it into honey: each load fills the comb a little, and a full comb gets a new
// cell built beside it. A well-stocked hive raises new bees. At night, or in the cold, bees go home and wait. They
// drown, burn, choke and starve like moths; the hive's honey feeds them.
const BEE_MAX = 12, BEE_LOAD = ECO_RATE.beeLoad, BEE_SEEK = 30, BEE_HOME = 40, BEE_STARVE = 10800, BEE_COLD = 10, BEE_FROZEN = 1800, HONEY_PER_LOAD = 8;
function driveBee(b, s, k, Tk, addBody) {
  const drowned = liq[k] >= 128 && LIQ_SINKS(typ[k]);
  if (drowned || s.lava || s.acid || Tk > 50 || solid[k] || !airless(b, k)) return vanishCreature(b, k, 'fizz', drowned ? 'drowned' : solid[k] ? 'crushed' : s.acid ? 'acid' : s.lava || Tk > 50 ? 'heat' : 'stale-air');
  b.load = b.load || 0; b.hunger = (b.hunger || 0) + 1;
  b.chill = Tk < 0 ? (b.chill || 0) + 1 : 0;
  if (b.chill > BEE_FROZEN) return vanishCreature(b, k, 'fizz', 'cold');
  if (b.home == null || solid[b.home] !== COMB || S.tick - (b.homeAt || 0) > 600) { b.home = findBlock(k, COMB, BEE_HOME); b.homeAt = S.tick; }
  const out = sunHeight() > 0 && Tk >= BEE_COLD && b.load < BEE_LOAD;
  if (out && (b.target == null || solid[b.target] !== FLOWER || held[b.target] < ECO_RATE.beeMinNectar || S.tick - (b.since || 0) > 600)) { b.target = findBlock(k, FLOWER, BEE_SEEK, f => held[f] >= ECO_RATE.beeMinNectar); b.since = S.tick; }
  const goal = out && b.target >= 0 ? b.target : b.home;
  if (goal >= 0) {
    const tx = (goal % W) * T + 4, ty = ((goal / W) | 0) * T + 4, near = Math.abs(tx - b.x - 1.5) < 10 && Math.abs(ty - b.y - 1) < 10;
    b.vx += (Math.sign(tx - b.x - 1.5) * 0.7 - b.vx) * 0.25; b.vy += (Math.sign(ty - b.y - 1) * 0.5 - b.vy) * 0.35 + (Math.random() - 0.5) * 0.3;
    if (near && goal === b.target) { const taken = ecoTakeNectar(goal, BEE_LOAD - b.load); b.load += taken; S.accounting.nectarCollected = (S.accounting.nectarCollected || 0) + taken; b.target = -1; }
    else if (near && goal === b.home) {
      const food = Math.min(ecoComb(b.home), ecoAppetite(b) / ECO_C.honey);
      if (food > 0) { ecoSetComb(b.home, ecoComb(b.home) - food); ecoFeed(b, ecoFood(food), k); S.accounting.honeyEaten = (S.accounting.honeyEaten || 0) + food; }
      if (b.load > 0) { b.load -= storeHoney(b.home, b.load); if (Math.random() < 0.1 && howMany('bee') < BEE_MAX) ecoBirth(b, addBody); }
      b.vx *= 0.5; b.vy *= 0.5;
    }
  } else {   // no hive and nothing to do: wanders like a moth
    if (!b.dir || b.hitX || Math.random() < 0.01) b.dir = b.dir ? -b.dir : Math.random() < 0.5 ? -1 : 1;
    b.vx += (b.dir * 0.5 - b.vx) * 0.2; b.vy += (-b.vy) * 0.35 + (Math.random() - 0.5) * 0.3;
  }
  b.face = b.vx < 0 ? -1 : 1;
  return true;
}
// Honey goes into the hive's comb: into a cell that isn't full yet, or a new cell built onto the comb.
function storeHoney(home, offered = HONEY_PER_LOAD) {
  const cells = [home], seen = new Set(cells);
  for (let i = 0; i < cells.length && cells.length < 64; i++) for (const o of [cells[i] - W, cells[i] - 1, cells[i] + 1, cells[i] + W]) if (o >= 0 && o < W * H && solid[o] === COMB && !seen.has(o)) { seen.add(o); cells.push(o); }
  const part = cells.find(c => ecoComb(c) < 255);
  if (part !== undefined) { const put = Math.min(offered, 255 - ecoComb(part)); ecoSetComb(part, ecoComb(part) + put); S.accounting.honeyStored = (S.accounting.honeyStored || 0) + put; return put; }
  // New wax is paid for from the offered food, including its own nutrient quota.
  const waxFood = ECO_COST.wax / ECO_C.honey;
  if (offered <= waxFood) return 0;
  for (const c of cells) for (const o of [c - 1, c + 1, c + W, c - W]) if (o >= 0 && o < W * H && !solid[o] && !liq[o]) {
    const put = Math.min(255, offered - waxFood), remainder = ecoFood(waxFood), tissue = bioPool(ECO_COST.wax);
    remainder.c -= tissue.c; remainder.n -= tissue.n; remainder.p -= tissue.p;
    ecoDeposit(o, remainder); solid[o] = COMB; ecoInstallTissue(o, COMB, tissue); ecoSetComb(o, put);
    S.accounting.honeyStored = (S.accounting.honeyStored || 0) + put;
    markDirty(o % W, (o / W) | 0); return put + waxFood;
  }
  return 0;
}
// The nearest block b within `reach` tiles of k (that passes `ok`), or -1.
function findBlock(k, b, reach, ok) {
  const x = k % W, y = (k / W) | 0;
  let best = -1, bd = Infinity;
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const nx = x + dx, ny = y + dy, o = ny * W + nx;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || solid[o] !== b || (ok && !ok(o))) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function findLeaf(k, skip) {
  const x = k % W, y = (k / W) | 0;
  let best = -1, bd = Infinity;
  for (let dy = -MOTH_SEEK; dy <= MOTH_SEEK; dy++) for (let dx = -MOTH_SEEK; dx <= MOTH_SEEK; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || solid[ny * W + nx] !== LEAF || ny * W + nx === skip) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = ny * W + nx; }
  }
  return best;
}
// A creature that dies (unless it burnt) rots: into the water it lay in, or as a little fertiliser where it fell.
function die(b, k, fx, cause = 'other') {
  recordDeath(b, k, cause);
  puff(k, fx);
  ecoSettleBody(b, k);
  return false;
}
// Which way (-1 or 1) the nearest water lies within 16 tiles on this row or the one below; random if none.
function towardWater(k) {
  const x = k % W;
  for (let d = 1; d <= 16; d++) for (const s of [-1, 1]) {
    const nx = x + s * d;
    if (nx < 0 || nx >= W) continue;
    for (const o of [k + s * d, k + s * d + W]) if (o < W * H && liq[o] && typ[o] === WATER) return s;
  }
  return Math.random() < 0.5 ? -1 : 1;
}
function touchesSalt(b) {
  const x0 = Math.max(0, ((b.x / T) | 0) - 1), x1 = Math.min(W - 1, (((b.x + b.w) / T) | 0) + 1);
  const y0 = Math.max(0, ((b.y / T) | 0) - 1), y1 = Math.min(H - 1, (((b.y + b.h) / T) | 0) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid[y * W + x] === SALT) return true;
  return false;
}
// A slimeling soaks up the slime it sits in.
function absorb(b) {
  const x0 = Math.max(0, (b.x / T) | 0), x1 = Math.min(W - 1, ((b.x + b.w) / T) | 0), y = Math.min(H - 1, ((b.y + b.h) / T) | 0);
  for (let x = x0; x <= x1; x++) for (const k of [y * W + x, (y - 1) * W + x]) {
    if (k < 0 || !liq[k] || typ[k] !== SLIME) continue;
    const take = Math.min(liq[k], 24);
    liq[k] -= take; if (!liq[k]) typ[k] = 0; wake(k);
    b.mass = (b.mass || 0) + take;
  }
}

export { CROWDED, CROWD_X, CROWD_Y, shoal, BEE_MAX, BEE_LOAD, BEE_SEEK, BEE_HOME, HONEY_PER_LOAD, driveBee, storeHoney, findBlock, BIRD_MAX, BIRD_STARVE, BIRD_SEEK, driveBird, PIKE_DIGEST, MOTH_GIVE_UP, PIKE_MAX, PIKE_STARVE, HUNT_RANGE, FLEE_RANGE, MOTH_MAX, MOTH_STARVE, MOTH_REST, MOTH_FROZEN, MOTH_COLD, MOTH_HOT, MOTH_SEEK, MOTH_EAT, nearest, hunt, flee, snapMoth, driveMoth, findLeaf, WELL_FED, BITE, FISH_BREATH, SUFFOCATE, AIR_GONE, ROT, MAX_OF_KIND, STRANDED, COLD, SPLIT_MASS, centre, howMany, swim, walk, driveCreature, die, towardWater, touchesSalt, absorb };
