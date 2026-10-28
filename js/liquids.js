// The liquid property table: one row per liquid.
// grav: +1 falls down, -1 falls up. visc: update every Nth tick. minSpread: won't spill onto a dry tile below this.
// minDiff: ignore smaller level differences. dens: heavier swaps under lighter where the pair swaps. ldecay: light kept per tile.
// gas: drawn thin and wispy; smoke and methane fade or escape into open sky (see js/gases.js).
import { ACID, AETHER, BLOOM, FOAM, FROST, HONEY, LAVA, METHANE, MOLTEN, MUD, NITRO, OIL, POISON, QUICK, SLIME, SMOKE, STEAM, STORM, TONIC, WATER } from './config.js';
import { hex } from './util.js';
import { CO2, LYE } from './config.js';
import { NLIQ } from './config.js';
import { COOLANT, FERRO, FERT, LIGHT, MIMIC, VOID } from './config.js';
import { HYDROGEN, MSLAG, OXYGEN } from './config.js';
import { LRHO } from './matter.js';












function liquid(o) {
  const s = hex(o.surf), b = hex(o.body), d = hex(o.deep);
  return Object.assign(o, { sr: s[0], sg: s[1], sb: s[2], br: b[0], bg: b[1], bb: b[2], dr: d[0], dg: d[1], db: d[2] });
}
const LIQ = [
  null,
  liquid({ name: 'water',       grav: 1,  visc: 1, minSpread: 6,  minDiff: 2, dens: 2, surf: '#b4e6ff', body: '#3c8ae0', deep: '#163e8c', sa: 0.88, ba: 0.52, da: 0.78, flow: 1,    emit: null,             ldecay: 0.88 }),
  liquid({ name: 'lava',        grav: 1,  visc: 4, minSpread: 24, minDiff: 4, dens: 4, surf: '#ffe27a', body: '#ff6a1a', deep: '#b8300c', sa: 0.97, ba: 0.93, da: 0.97, flow: 0.35, emit: [1, 0.55, 0.22],  ldecay: 0.8 }),
  liquid({ name: 'honey',       grav: 1,  visc: 6, minSpread: 32, minDiff: 6, dens: 3, surf: '#ffe39a', body: '#eca42a', deep: '#a8660f', sa: 0.92, ba: 0.82, da: 0.9,  flow: 0.2,  emit: null,             ldecay: 0.8 }),
  liquid({ name: 'aether',      grav: -1, visc: 2, minSpread: 10, minDiff: 2, dens: 0, surf: '#f3e4ff', body: '#a874f0', deep: '#5a2fa8', sa: 0.9,  ba: 0.5,  da: 0.7,  flow: 0.6,  emit: [0.62, 0.42, 0.95], ldecay: 0.9 }),
  liquid({ name: 'quicksilver', grav: 1,  visc: 1, minSpread: 40, minDiff: 3, dens: 9, surf: '#ffffff', body: '#b9c2cf', deep: '#5d6573', sa: 1,    ba: 1,    da: 1,    flow: 1.4,  emit: null,             ldecay: 0.45 }),
  liquid({ name: 'acid',        grav: 1,  visc: 1, minSpread: 8,  minDiff: 2, dens: 2, surf: '#e2ffb0', body: '#64d63a', deep: '#2a7a1c', sa: 0.9,  ba: 0.66, da: 0.84, flow: 0.9,  emit: [0.3, 0.75, 0.2], ldecay: 0.85 }),
  liquid({ name: 'frost',       grav: 1,  visc: 3, minSpread: 16, minDiff: 3, dens: 2, surf: '#ffffff', body: '#9fdcf7', deep: '#4e93c4', sa: 0.95, ba: 0.68, da: 0.84, flow: 0.4,  emit: [0.3, 0.45, 0.6], ldecay: 0.85 }),
  liquid({ name: 'steam',       grav: -1, visc: 1, minSpread: 3,  minDiff: 1, dens: -1, surf: '#ffffff', body: '#dfe6ee', deep: '#aeb9c6', sa: 0.5,  ba: 0.3,  da: 0.4,  flow: 1.2,  emit: null,             ldecay: 0.93, gas: true }),
  liquid({ name: 'oil',         grav: 1,  visc: 3, minSpread: 4,  minDiff: 2, dens: 1, surf: '#7a6a48', body: '#2a2016', deep: '#100c07', sa: 0.95, ba: 0.86, da: 0.95, flow: 0.5,  emit: null,             ldecay: 0.5 }),
  liquid({ name: 'slime',       grav: 1,  visc: 5, minSpread: 40, minDiff: 6, dens: 3, surf: '#c8ff9a', body: '#4fc46a', deep: '#1f6e3e', sa: 0.95, ba: 0.78, da: 0.9,  flow: 0.3,  emit: [0.15, 0.4, 0.15], ldecay: 0.75 }),
  liquid({ name: 'bloomwater',  grav: 1,  visc: 2, minSpread: 6,  minDiff: 2, dens: 2, surf: '#ffe1f4', body: '#e486c8', deep: '#8a3f86', sa: 0.9,  ba: 0.5,  da: 0.75, flow: 0.7,  emit: [0.45, 0.25, 0.4], ldecay: 0.88 }),
  liquid({ name: 'mud',         grav: 1,  visc: 8, minSpread: 48, minDiff: 8, dens: 3, surf: '#a07a52', body: '#6b4a2c', deep: '#3a2614', sa: 0.97, ba: 0.93, da: 0.97, flow: 0.15, emit: null,             ldecay: 0.5 }),
  liquid({ name: 'tonic',       grav: 1,  visc: 2, minSpread: 6,  minDiff: 2, dens: 2, surf: '#fff6b0', body: '#c8d84a', deep: '#6a8a1c', sa: 0.9,  ba: 0.6,  da: 0.8,  flow: 0.8,  emit: [0.75, 0.8, 0.3], ldecay: 0.88 }),
  liquid({ name: 'foam',        grav: 1,  visc: 4, minSpread: 20, minDiff: 4, dens: 1.5, surf: '#ffffff', body: '#e8e2d0', deep: '#b8ae94', sa: 0.95, ba: 0.85, da: 0.9, flow: 0.3, emit: null,             ldecay: 0.6 }),
  liquid({ name: 'stormwater',  grav: 1,  visc: 1, minSpread: 6,  minDiff: 2, dens: 2, surf: '#d8f4ff', body: '#3a5ccf', deep: '#1a2470', sa: 0.9,  ba: 0.6,  da: 0.82, flow: 1.1,  emit: [0.18, 0.26, 0.6], ldecay: 0.88 }),
  liquid({ name: 'molten metal', grav: 1, visc: 3, minSpread: 20, minDiff: 4, dens: 8, surf: '#fff3c0', body: '#ffb040', deep: '#d0581a', sa: 1,    ba: 0.97, da: 1,    flow: 0.5,  emit: [1, 0.62, 0.28], ldecay: 0.6 }),
  liquid({ name: 'smoke',       grav: -1, visc: 1, minSpread: 3,  minDiff: 1, dens: -1.5, surf: '#c8c4cc', body: '#8d8792', deep: '#5a5560', sa: 0.55, ba: 0.4, da: 0.5, flow: 1, emit: null,            ldecay: 0.78, gas: true }),
  liquid({ name: 'methane',     grav: -1, visc: 1, minSpread: 3,  minDiff: 1, dens: -2, surf: '#f0ffd8', body: '#c9e6a0', deep: '#98b870', sa: 0.35, ba: 0.2,  da: 0.3,  flow: 1.2,  emit: null,             ldecay: 0.93, gas: true }),
  liquid({ name: 'poison gas',  grav: 1,  visc: 1, minSpread: 3,  minDiff: 1, dens: 0.5, surf: '#e9ffb0', body: '#9ccf3a', deep: '#5c8a20', sa: 0.55, ba: 0.38, da: 0.5, flow: 1,    emit: [0.2, 0.32, 0.05], ldecay: 0.85, gas: true }),
  liquid({ name: 'nitro',       grav: 1,  visc: 2, minSpread: 8,  minDiff: 2, dens: 2.5, surf: '#fff6c8', body: '#e8d070', deep: '#a88a30', sa: 0.9,  ba: 0.72, da: 0.86, flow: 0.7, emit: null,             ldecay: 0.8 }),
  liquid({ name: 'lye',         grav: 1,  visc: 1, minSpread: 8,  minDiff: 2, dens: 2.2, surf: '#f2f6ff', body: '#b4c4e6', deep: '#6c80ae', sa: 0.88, ba: 0.55, da: 0.8, flow: 0.9, emit: null,             ldecay: 0.88 }),
  liquid({ name: 'carbon dioxide', grav: 1, visc: 1, minSpread: 2, minDiff: 1, dens: 0.4, surf: '#eef2f4', body: '#c8d2d8', deep: '#9aa8b0', sa: 0.35, ba: 0.22, da: 0.32, flow: 0.8, emit: null,           ldecay: 0.92, gas: true }),
  liquid({ name: 'void ink',    grav: 1,  visc: 2, minSpread: 8,  minDiff: 2, dens: 2, surf: '#6a4a8a', body: '#140c1e', deep: '#05030a', sa: 0.95, ba: 0.92, da: 0.97, flow: 0.6, emit: null,              ldecay: 0.3 }),
  liquid({ name: 'mimic',       grav: 1,  visc: 2, minSpread: 8,  minDiff: 2, dens: 2, surf: '#ffffff', body: '#c8c8d0', deep: '#8a8a98', sa: 0.9,  ba: 0.6,  da: 0.8, flow: 0.8, emit: null,              ldecay: 0.85 }),
  liquid({ name: 'coolant',     grav: 1,  visc: 1, minSpread: 6,  minDiff: 2, dens: 2.1, surf: '#c8fff2', body: '#38c8b0', deep: '#16786a', sa: 0.88, ba: 0.55, da: 0.8, flow: 1, emit: null,               ldecay: 0.88 }),
  liquid({ name: 'ferrofluid',  grav: 1,  visc: 3, minSpread: 30, minDiff: 4, dens: 4.5, surf: '#6a7080', body: '#1a1c22', deep: '#08090c', sa: 1,    ba: 0.98, da: 1, flow: 0.6, emit: null,                ldecay: 0.4 }),
  liquid({ name: 'liquid light', grav: 1, visc: 1, minSpread: 6,  minDiff: 2, dens: 1.9, surf: '#ffffff', body: '#fff4b0', deep: '#ffd860', sa: 0.95, ba: 0.75, da: 0.9, flow: 0.8, emit: [1, 0.95, 0.7],    ldecay: 0.95 }),
  liquid({ name: 'fertiliser',  grav: 1,  visc: 2, minSpread: 8,  minDiff: 2, dens: 2.3, surf: '#d8f0a0', body: '#7a9a30', deep: '#4a6418', sa: 0.9,  ba: 0.8,  da: 0.88, flow: 0.7, emit: null,              ldecay: 0.8 }),
  liquid({ name: 'hydrogen',    grav: -1, visc: 1, minSpread: 3,  minDiff: 1, dens: -3, surf: '#f6f9ff', body: '#e2eaff', deep: '#bccaf2', sa: 0.3,  ba: 0.14, da: 0.22, flow: 1.4, emit: null,              ldecay: 0.95, gas: true }),
  liquid({ name: 'oxygen',      grav: 1,  visc: 3, minSpread: 2,  minDiff: 1, dens: 0.3, surf: '#eef8ff', body: '#c4e2ff', deep: '#90bcec', sa: 0.32, ba: 0.18, da: 0.26, flow: 0.9, emit: null,              ldecay: 0.93, gas: true }),
  liquid({ name: 'molten slag', grav: 1,  visc: 5, minSpread: 24, minDiff: 4, dens: 3.5, surf: '#ffd890', body: '#e07a30', deep: '#8a3a1a', sa: 0.97, ba: 0.93, da: 0.97, flow: 0.3, emit: [0.9, 0.45, 0.15], ldecay: 0.7 }),
];
// Thickness that changes with temperature: below each limit (°) the liquid updates every Nth tick instead of its usual
// visc. Honey runs when warm and stiffens in the cold, oil thickens in the cold, and lava, molten metal and slag slow
// as they cool towards setting. At the temperatures they usually sit at, they keep their usual thickness.
const VISC_TEMP = {
  [HONEY]: [[5, 10], [40, 6], [90, 3], [Infinity, 2]],
  [OIL]: [[0, 6], [80, 3], [Infinity, 2]],
  [LAVA]: [[800, 9], [900, 6], [Infinity, 4]],
  [MOLTEN]: [[1100, 5], [Infinity, 3]],
  [MSLAG]: [[1100, 8], [Infinity, 5]],
};
function viscAt(t, T) {
  const tab = VISC_TEMP[t];
  if (!tab) return LIQ[t].visc;
  for (const [limit, v] of tab) if (T < limit) return v;
  return LIQ[t].visc;
}
// How acidic (low) or alkaline (high) each liquid is, 0-14; 7 is neutral.
const ACIDITY = new Float32Array(NLIQ).fill(7);
ACIDITY[ACID] = 1; ACIDITY[LYE] = 13; ACIDITY[HONEY] = 4; ACIDITY[SLIME] = 9; ACIDITY[BLOOM] = 6; ACIDITY[TONIC] = 6; ACIDITY[CO2] = 5;

// paintT: temperature when poured. (How fast each liquid takes and gives heat comes from js/matter.js.)
const HEAT = { [WATER]: [0.05, 20], [LAVA]: [0.004, 1150], [HONEY]: [0.03, 20], [AETHER]: [0.05, 20], [QUICK]: [0.15, 20], [ACID]: [0.05, 20], [FROST]: [0.03, -40], [STEAM]: [0.02, 110], [OIL]: [0.05, 20], [SLIME]: [0.04, 20], [BLOOM]: [0.05, 20],
  [MUD]: [0.04, 20], [TONIC]: [0.05, 20], [FOAM]: [0.05, 20],
  [STORM]: [0.05, 20], [MOLTEN]: [0.006, 1600], [SMOKE]: [0.1, 120], [METHANE]: [0.12, 20], [POISON]: [0.08, 20], [NITRO]: [0.05, 20], [LYE]: [0.05, 20], [CO2]: [0.1, 20],
  [VOID]: [0.05, 20], [MIMIC]: [0.05, 20], [COOLANT]: [0.3, 5], [FERRO]: [0.05, 20], [LIGHT]: [0.05, 20], [FERT]: [0.05, 20],
  [HYDROGEN]: [0.15, 20], [OXYGEN]: [0.1, 20], [MSLAG]: [0.006, 1450] };
for (const t in HEAT) LIQ[t].paintT = HEAT[t][1];

// Real densities (g/cm³, js/matter.js): one per liquid, for both which liquid sinks under which (dens) and how bodies
// float in them (RHO). Drag on bodies stays per liquid.
const RHO = Array.from(LRHO);
for (let t = 1; t < LIQ.length; t++) LIQ[t].dens = LRHO[t];
const DRAG = [0, 0.06, 0.2, 0.3, 0.02, 0.12, 0.06, 0.15, 0.01, 0.1, 0.35, 0.06, 0.4, 0.06, 0.2, 0.06, 0.25, 0.01, 0.01, 0.02, 0.1, 0.06, 0.01, 0.1, 0.06, 0.05, 0.3, 0.05, 0.1, 0.01, 0.01, 0.3];

export { VISC_TEMP, viscAt, ACIDITY, liquid, LIQ, HEAT, RHO, DRAG };
