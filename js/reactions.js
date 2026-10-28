// What happens when two liquids touch, and what liquids do to touching blocks.
import { explode } from './blast.js';
import { ACID, AETHER, AIR, AMBIENT, BASALT, BLOOM, BRICK, COMB, CRISP, CRYSTAL, DIRT, FOAM, FROST, H, HONEY, ICE, LAVA, LEAF, METAL, METHANE, MOLTEN, MOSS, MUD, NBLOCK, NITRO, NLIQ, NSOL, OBSIDIAN, OIL, PLANT, CHLORINE, POISON, QUICK, SALT, SLIME, SMOKE, SOL_ESSENCE, SOL_SALT, SOL_SUGAR, STEAM, STONE, STORM, TONIC, W, WATER, WOOD } from './config.js';
import { LIQ } from './liquids.js';
import { puff } from './particles.js';
import { charged } from './power.js';
import { nbr } from './pumps.js';
import { addSol, clearSol } from './solutes.js';
import { S, deco, drop, held, liq, markDirty, meltAmount, sol, solid, temp, typ, wake } from './world.js';
import { CO2, LYE, SOL_ACID, SOL_BASE } from './config.js';
import { SODA } from './config.js';
import { COOLANT, FERRO, FERT, MIMIC, SOL_FERT, VOID } from './config.js';
import { BLEACHED, CORAL, FUSE, POROUS, SPONGE, WETDIRT, WETSPONGE, WOOL } from './config.js';
import { BLEACH, HYDROGEN, MSLAG, OXYGEN, RUST, SLAG, SOL_ALGAE, SUGAR } from './config.js';












const NITRO_DROP = 6;   // rows of free fall that set nitro off when it lands

const SWAP = { swap: true };
const REACT = new Array(NLIQ * NLIQ).fill(null);
function setR(a, b, r) { REACT[a * NLIQ + b] = r; REACT[b * NLIQ + a] = r; }
// gases trade places with everything; which way depends on density, so they layer
for (let t = 1; t < LIQ.length; t++) for (const s of [AETHER, QUICK, STEAM, SMOKE, METHANE, POISON, CHLORINE, CO2, HYDROGEN, OXYGEN]) setR(s, t, SWAP);
setR(AETHER, STEAM, null);   // both rise: let them sit side by side
setR(WATER, LAVA, { block: OBSIDIAN, fx: 'steam' });
// water dissolves honey into sugar; icy water (below 10°) sets it into honeycomb instead
setR(WATER, HONEY, { fn(k, o, t, above) {
  const w = t === WATER ? k : o, h = w === k ? o : k;
  if (temp[w] < 10) { const target = above ? k : o; solidify(target, COMB); return target === k; }
  if (sol[w * NSOL + SOL_SUGAR] > 220) return false;   // saturated: the honey stays put
  addSol(w, SOL_SUGAR, 64); liq[h] = Math.max(0, liq[h] - 64); if (!liq[h]) typ[h] = 0;
  return h === k && !liq[h];
} });
// bloomwater dissolves into water as essence
setR(WATER, BLOOM, { fn(k, o, t) { const b = t === BLOOM ? k : o; typ[b] = WATER; clearSol(b); addSol(b, SOL_ESSENCE, 255); return b === k; } });
setR(LAVA, HONEY, { block: CRISP, fx: 'smoke' });
setR(AETHER, LAVA, { block: CRYSTAL, fx: 'spark' });
setR(FROST, LAVA, { block: OBSIDIAN, fx: 'steam' });
setR(FROST, HONEY, { block: COMB });
setR(FROST, ACID, { block: ICE });
// acid dilutes into water, and diluting it gives off heat
// Acid and lye dissolve into water as concentrations that spread and weaken (js/solutes.js), warming it as they do.
setR(WATER, ACID, { fn(k, o, t) { const a = t === ACID ? k : o; typ[a] = WATER; temp[a] += 25; sol.fill(0, a * NSOL, a * NSOL + NSOL); sol[a * NSOL + SOL_ACID] = 220; return a === k; } });
setR(WATER, LYE, { fn(k, o, t) { const a = t === LYE ? k : o; typ[a] = WATER; temp[a] += 30; sol.fill(0, a * NSOL, a * NSOL + NSOL); sol[a * NSOL + SOL_BASE] = 220; return a === k; } });
// Acid and lye neutralise each other into warm salty water.
setR(ACID, LYE, { fn(k, o) {
  for (const a of [k, o]) { typ[a] = WATER; temp[a] += 60; sol.fill(0, a * NSOL, a * NSOL + NSOL); sol[a * NSOL + SOL_SALT] = 60; }
  puff(o, 'steam'); return true;
} });
setR(LYE, OIL, { fn(k, o, t) { const f = t === OIL ? k : o; typ[f] = FOAM; puff(f, 'fizz'); return f === k; } });   // lye turns oil into soapy foam
setR(LYE, SLIME, { fn(k, o, t) { const s = t === SLIME ? k : o; liq[s] = 0; typ[s] = 0; puff(s, 'fizz'); return s === k; } });
// mimic becomes whatever liquid it touches first
for (let t = 1; t < LIQ.length; t++) if (t !== MIMIC) setR(MIMIC, t, { fn(k, o, t2) { const m = t2 === MIMIC ? k : o, other = m === k ? o : k; typ[m] = typ[other]; wake(m); return false; } });
// void ink deletes any liquid it touches, using itself up; meeting aether, both vanish in a flash
for (let t = 1; t < LIQ.length; t++) if (t !== VOID) setR(VOID, t, { fn(k, o, t2) {
  const v = t2 === VOID ? k : o, other = v === k ? o : k;
  if (typ[other] === AETHER) { liq[v] = 0; typ[v] = 0; S.flash = Math.max(S.flash || 0, 6); puff(v, 'spark'); }
  else liq[v] = Math.max(0, liq[v] - 48);
  liq[other] = 0; typ[other] = 0; sol.fill(0, other * NSOL, other * NSOL + NSOL); puff(other, 'mote');
  if (!liq[v]) typ[v] = 0;
  return true;
} });
setR(COOLANT, LAVA, { block: BASALT, fx: 'steam' });   // coolant quenches lava into basalt
for (const t of [WATER, OIL, ACID, LYE, HONEY]) setR(FERRO, t, SWAP);   // ferrofluid layers with them by density: under water and oil, over honey, lye and acid
setR(WATER, FERT, { fn(k, o, t) { const f = t === FERT ? k : o; typ[f] = WATER; sol.fill(0, f * NSOL, f * NSOL + NSOL); sol[f * NSOL + SOL_FERT] = 200; return f === k; } });   // dissolves into water
setR(LYE, LAVA, { fn(k, o, t) { const a = t === LYE ? k : o; liq[a] = 0; typ[a] = 0; puff(a, 'steam'); return a === k; } });
setR(LAVA, ACID, { fn(k, o, t) { const a = t === ACID ? k : o; liq[a] = 0; typ[a] = 0; puff(a, 'smoke'); return a === k; } });
setR(HONEY, ACID, { fn(k, o, t) {
  const h = t === HONEY ? k : o, a = h === k ? o : k;
  liq[h] = 0; typ[h] = 0; liq[a] = Math.max(0, liq[a] - 40); if (!liq[a]) typ[a] = 0;
  puff(h, 'fizz'); return true;
} });
setR(WATER, FROST, { fn(k, o, t) {
  const w = t === WATER ? k : o;
  if (sol[w * NSOL + SOL_SALT] > 100) return false;   // strong brine doesn't freeze
  solidify(w, ICE); puff(w, 'snow'); return w === k;
} });
// oil floats on anything denser; lava sets it alight
for (const t of [WATER, HONEY, ACID, FROST, SLIME, BLOOM, MUD, TONIC, FOAM, STORM, MOLTEN]) setR(OIL, t, SWAP);
setR(OIL, LAVA, { fn(k, o, t) { temp[t === OIL ? k : o] = 1000; return false; } });
// slime sinks through water; acid and lava kill it; frost freezes it; bloomwater calms it into moss
setR(SLIME, WATER, SWAP);
setR(SLIME, ACID, { fn(k, o, t) { const s = t === SLIME ? k : o, a = s === k ? o : k; liq[s] = 0; typ[s] = 0; liq[a] = Math.max(0, liq[a] - 40); if (!liq[a]) typ[a] = 0; puff(s, 'fizz'); return true; } });
setR(SLIME, LAVA, { fn(k, o, t) { const s = t === SLIME ? k : o; liq[s] = 0; typ[s] = 0; puff(s, 'smoke'); return s === k; } });
setR(SLIME, FROST, { block: ICE, fx: 'snow' });
setR(SLIME, BLOOM, { block: MOSS, fx: 'spark' });
// bloomwater neutralises acid, freezes with frost, and boils away on lava
setR(BLOOM, ACID, { fn(k, o, t) { const a = t === ACID ? k : o; typ[a] = BLOOM; return a === k; } });
setR(BLOOM, FROST, { block: ICE, fx: 'snow' });
setR(BLOOM, LAVA, { fn(k, o, t) { const b = t === BLOOM ? k : o; liq[b] = 0; typ[b] = 0; puff(b, 'steam'); return b === k; } });
setR(TONIC, LAVA, { fn(k, o, t) { const b = t === TONIC ? k : o; liq[b] = 0; typ[b] = 0; puff(b, 'steam'); return b === k; } });
// mud sinks through water and bakes into brick against lava; foam floats on water and under oil
setR(MUD, WATER, SWAP);
setR(MUD, FOAM, SWAP);
setR(MUD, LAVA, { block: BRICK, fx: 'steam' });
setR(FOAM, WATER, SWAP);
// stormwater sets like water against lava and frost
setR(STORM, LAVA, { block: OBSIDIAN, fx: 'steam' });
setR(STORM, FROST, { block: ICE, fx: 'snow' });
// molten metal sinks through lava, sets into metal where water or stormwater quench it, and caramelises honey
setR(MOLTEN, LAVA, SWAP);
for (const w of [WATER, STORM]) setR(w, MOLTEN, { fn(k, o, t) {
  const m = t === MOLTEN ? k : o, q = m === k ? o : k;
  solidify(m, METAL); typ[q] = STEAM; temp[q] = 110; clearSol(q); puff(q, 'steam');
  return true;
} });
setR(MOLTEN, HONEY, { block: CRISP, fx: 'smoke' });
// molten slag (from smelting ore) floats on molten metal and lava, and water quenches it into slag
setR(MSLAG, LAVA, SWAP); setR(MSLAG, MOLTEN, SWAP);
for (const w of [WATER, STORM]) setR(w, MSLAG, { fn(k, o, t) {
  const m = t === MSLAG ? k : o, q = m === k ? o : k;
  solidify(m, SLAG); typ[q] = STEAM; temp[q] = 110; clearSol(q); puff(q, 'steam');
  return true;
} });
// lava lights methane and hydrogen; nitro sinks under water, where it is safe from fire
for (const fuel of [METHANE, HYDROGEN]) setR(fuel, LAVA, { fn(k, o, t) { temp[t === fuel ? k : o] = 1000; return false; } });
setR(NITRO, WATER, SWAP);
// water washes smoke and poison gas out of the air: they dissolve into it
for (const gas of [SMOKE, POISON]) setR(gas, WATER, { fn(k, o, t) {
  const g = t === gas ? k : o;
  liq[g] = Math.max(0, liq[g] - (gas === SMOKE ? 24 : 8)); if (!liq[g]) typ[g] = 0;
  return g === k && !liq[g];
} });
// Chlorine rises through water like the other gases, dissolving into fresh water as it goes (js/solutes.js); with lye
// it makes bleach. Bleach and acid
// give the chlorine back, and bleach kills algae in the water it touches. Bleach is mostly water: it layers under
// fresh water until Phase 21 mixes solutions.
setR(CHLORINE, LYE, { fn(k, o, t) {
  const g = t === CHLORINE ? k : o, l = g === k ? o : k;
  typ[l] = BLEACH; liq[g] = Math.max(0, liq[g] - 96); if (!liq[g]) typ[g] = 0; wake(l);
  return g === k && !liq[g];
} });
setR(BLEACH, ACID, { fn(k, o, t) {
  const b = t === BLEACH ? k : o, a = b === k ? o : k;
  typ[b] = CHLORINE; temp[b] = AMBIENT; clearSol(b); liq[a] = Math.max(0, liq[a] - 48); if (!liq[a]) typ[a] = 0; puff(b, 'fizz'); wake(b);
  return b === k;
} });
setR(BLEACH, WATER, { fn(k, o, t) {
  const w = t === WATER ? k : o;
  if (sol[w * NSOL + SOL_ACID] >= 40) { const b = w === k ? o : k; typ[b] = CHLORINE; temp[b] = AMBIENT; clearSol(b); sol[w * NSOL + SOL_ACID] -= 40; puff(b, 'fizz'); return b === k; }
  sol[w * NSOL + SOL_ALGAE] = 0;
  return false;
} });

// Turns a liquid tile into a block. The block remembers how much liquid it was (meltAmount gives it back), and ice and metal
// start below their melting points, so a warm tile that freezes doesn't melt straight back.
function solidify(k, block) {
  held[k] = liq[k] < 255 ? liq[k] : 0;
  if (block === ICE) temp[k] = Math.min(temp[k], -5);
  else if (block === METAL) temp[k] = Math.min(temp[k], 900);
  solid[k] = block; liq[k] = 0; typ[k] = 0; markDirty(k % W, (k / W) | 0);
}
// o is a touching tile holding a different liquid; above = o sits on the far side of k's gravity. Returns true if k was used up.
function react(k, o, t, above) {
  const r = REACT[t * NLIQ + typ[o]];
  if (!r || r.swap) return false;
  wake(k); wake(o);
  if (r.fn) return r.fn(k, o, t, above);
  const target = above ? k : o;
  solidify(target, r.block);
  if (r.fx) puff(target, r.fx);
  return target === k;
}
function reactAll(x, y, k, t) {
  const g = LIQ[t].grav;
  let o;
  if (y < H - 1) { o = k + W; if (liq[o] && typ[o] !== t && react(k, o, t, g < 0)) return true; }
  if (x > 0) { o = k - 1; if (liq[o] && typ[o] !== t && react(k, o, t, false)) return true; }
  if (x < W - 1) { o = k + 1; if (liq[o] && typ[o] !== t && react(k, o, t, false)) return true; }
  if (y > 0) { o = k - W; if (liq[o] && typ[o] !== t && react(k, o, t, g > 0)) return true; }
  return false;
}
// Baking soda meeting acid fizzes away into carbon dioxide.
function fizz(o) {
  solid[o] = AIR; held[o] = 0; liq[o] = 200; typ[o] = CO2; temp[o] = AMBIENT; sol.fill(0, o * NSOL, o * NSOL + NSOL);
  markDirty(o % W, (o / W) | 0); puff(o, 'fizz');
  if (o >= W && liq[o - W] && !LIQ[typ[o - W]].gas) puff(o - W, 'bubble');   // fizzing under liquid
}
// Effects on touching blocks. Returns the tile's new amount.
function blockEffects(x, y, k, t, a) {
  // (acid acting on blocks: rules in js/chem.js)
  if (t === LAVA) {
    for (let i = 0; i < 4; i++) {
      const nx = x + (i === 0 ? -1 : i === 1 ? 1 : 0), ny = y + (i === 2 ? -1 : i === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const o = ny * W + nx;
      if (solid[o] === ICE && Math.random() < 0.08) { solid[o] = AIR; liq[o] = meltAmount(o); typ[o] = WATER; clearSol(o); markDirty(nx, ny); puff(o, 'steam'); }
    }
    if (y > 0 && !liq[k - W] && !solid[k - W] && Math.random() < 0.004) puff(k, 'ember');
  } else if (t === FROST) {
    if (a < 64 && (y === H - 1 || solid[k + W]) && Math.random() < 0.004) { solidify(k, ICE); return -1; }
  } else if (t === AETHER) {
    if (Math.random() < 0.003) puff(k, 'mote');
  } else if (t === SLIME) {
    // slime eats dirt and moss next to it and turns them into more slime, up to a world-wide cap
    for (let i = 0; i < 4; i++) {
      const o = nbr(x, y, i);
      if (o < 0 || (solid[o] !== DIRT && solid[o] !== MOSS) || S.slimeCount > 400 || Math.random() > 0.003) continue;
      solid[o] = AIR; liq[o] = 120; typ[o] = SLIME; temp[o] = AMBIENT; clearSol(o); markDirty(o % W, (o / W) | 0); puff(o, 'fizz');
    }
    // rotting slime bubbles methane into the open tile above it
    const up = y > 0 ? k - W : -1;
    if (up >= 0 && !solid[up] && (!liq[up] || (typ[up] === METHANE && liq[up] < 200)) && Math.random() < 0.0015) {
      if (!liq[up]) { clearSol(up); temp[up] = temp[k]; }
      liq[up] += 48; typ[up] = METHANE; wake(up);
    }
  } else if (t === BLOOM) {
    // bloomwater turns stone to moss and sprouts glowcaps on dirt, using itself up
    if (Math.random() < 0.004) puff(k, 'mote');
    for (let i = 0; i < 4; i++) {
      const o = nbr(x, y, i);
      if (o < 0) continue;
      if (solid[o] === STONE && Math.random() < 0.01) { solid[o] = MOSS; markDirty(o % W, (o / W) | 0); a -= 24; }
      else if (solid[o] === DIRT && o >= W && !solid[o - W] && !deco[o - W] && (!liq[o - W] || typ[o - W] === BLOOM) && Math.random() < 0.004) { deco[o - W] = 1; a -= 32; }
      if (a <= 0) return 0;
    }
  } else if (t === TONIC) {
    // tonic makes things grow fast: moss on stone and glowcaps on dirt, using up much less of itself than bloomwater
    if (Math.random() < 0.01) puff(k, 'mote');
    for (let i = 0; i < 4; i++) {
      const o = nbr(x, y, i);
      if (o < 0) continue;
      if (solid[o] === STONE && Math.random() < 0.05) { solid[o] = MOSS; markDirty(o % W, (o / W) | 0); a -= 6; }
      else if (solid[o] === DIRT && o >= W && !solid[o - W] && !deco[o - W] && (!liq[o - W] || typ[o - W] === TONIC) && Math.random() < 0.03) { deco[o - W] = 1; a -= 8; }
      if (a <= 0) return 0;
    }
  } else if (t === POISON) {
    // poison gas withers moss back to bare stone
    for (let i = 0; i < 4; i++) { const o = nbr(x, y, i); if (o >= 0 && solid[o] === MOSS && Math.random() < 0.01) { solid[o] = STONE; markDirty(o % W, (o / W) | 0); } }
  } else if (t === NITRO) {
    // nitro goes off after a hard landing, or when live power touches it (heat sets it off in js/heat.js)
    const below = k + W, landed = y === H - 1 || solid[below] || (liq[below] && (typ[below] === NITRO ? liq[below] === 255 : LIQ[typ[below]].dens >= LIQ[NITRO].dens));
    let zap = false;
    for (let i = 0; i < 4 && !zap; i++) { const o = nbr(x, y, i); zap = o >= 0 && charged(o); }
    if ((landed && drop[k] >= NITRO_DROP) || zap) { explode(k); return -1; }
  } else if (t === FOAM) {
    // foam slowly separates back into oil and water, which then settle into layers
    if (Math.random() < 0.002) { typ[k] = Math.random() < 0.5 ? OIL : WATER; clearSol(k); wake(k); return -1; }
  }
  return a;
}

export { fizz, NITRO_DROP, SWAP, REACT, setR, solidify, react, reactAll, blockEffects };
