// Matter: the real physical properties of every block and liquid, in one table (sources and the comparison with the
// game's old hand-set values are in CHEMISTRY.md). Density sets which liquid sinks under which and how bodies float;
// density × specific heat is how much heat a tile holds; thermal conductivity how readily heat passes between tiles.
// Latent heat is what melting, freezing, boiling and condensing take or give (js/heat.js).
//
// Where real values would break play they're compressed, keeping the order right:
// - conductivities span 10,000× (copper to wool); the game uses their square roots, so copper still carries heat about
//   30× faster than water, not 800×;
// - liquids that flow freely also carry heat by convection (CONVECTS), as real water does;
// - air and gases get a heat capacity of CAP_GAS, about 80× real, so a tile of air can't swing further than a tick
//   can follow; steam counts as the water it holds;
// - latent heats are scaled by LATENT, so boiling a pot takes seconds, not minutes.
import { AETHER, ACID, AND, BASALT, BATTERY, BLEACHED, BLOOM, BOILER, BRICK, CLAY, CO2, COMB, COOLANT, COPPER, CORAL, COUNTER, CRISP, CRYSTAL, DEPTH, DIRT, DRAIN, EMAGNET, FERRO, FERT, FILTER, FNITRO, FOAM, FROST, FUSE, GATE, GEM, GEYSER, GLASS, HONEY, HYDROGEN, ICE, LAMP, LAVA, LEAF, LEVER, LIGHT, LYE, MAGNET, MEMBRANE, METAL, METHANE, MIMIC, MOLTEN, MOSS, MOTOR, MSLAG, MUD, NBLOCK, NITRO, NLIQ, NOT, OBSIDIAN, OIL, OR, ORE, OXYGEN, PERMAFROST, PIPE, PIXEL, PLANT, PLATE, POISON, POROUS, PUMP_IN, PUMP_OUT, QUICK, RUST, SALT, SAND, SENSOR, SEPARATOR, SLAG, SLIME, SMOKE, SNOW, SODA, SOLAR, SPONGE, SPRING, STEAM, STONE, STORM, SUGAR, THERMO, TIMER, TONIC, TURBINE, VALVE, VENT, VOID, WATER, WETDIRT, WETSPONGE, WHEEL, WINDMILL, WOOD, WOOL } from './config.js';

// [density g/cm³, specific heat J/g·K, thermal conductivity W/m·K, what it stands for]
const MACHINE = [3, 0.6, 15, 'steel and parts'];
const BLOCK_MATTER = {
  [DIRT]: [1.4, 1.0, 0.6, 'soil'], [STONE]: [2.7, 0.79, 2.8, 'granite'], [OBSIDIAN]: [2.4, 0.8, 1.2, 'volcanic glass'],
  [COMB]: [1.0, 2.5, 0.3, 'wax and honey'], [CRISP]: [1.5, 1.25, 0.2, 'caramel'], [ICE]: [0.917, 2.09, 2.18, 'ice'],
  [CRYSTAL]: [2.65, 0.71, 6, 'quartz'], [BASALT]: [2.95, 0.84, 1.7, 'basalt'], [WOOD]: [0.6, 1.8, 0.15, 'oak'],
  [MOSS]: [0.5, 3.0, 0.4, 'wet moss'], [SALT]: [1.2, 0.86, 0.6, 'salt, loose'], [SAND]: [1.6, 0.8, 0.25, 'dry quartz sand'],
  [GLASS]: [2.5, 0.85, 1.0, 'soda-lime glass'], [BRICK]: [1.9, 0.9, 0.8, 'fired clay'], [METAL]: [7.85, 0.49, 50, 'steel'],
  [PLANT]: [0.7, 3.0, 0.4, 'green stem'], [LEAF]: [0.5, 3.0, 0.3, 'leaves'], [SNOW]: [0.3, 2.09, 0.15, 'settled snow'],
  [PERMAFROST]: [1.8, 1.2, 2.0, 'frozen soil'], [CLAY]: [1.9, 0.92, 1.2, 'wet clay'], [SODA]: [1.0, 1.04, 0.3, 'baking soda, loose'],
  [GEM]: [2.17, 0.86, 6.5, 'rock salt crystal'], [SPONGE]: [0.05, 1.3, 0.05, 'dry sponge'], [WETSPONGE]: [1.0, 3.9, 0.5, 'soaked sponge'],
  [WETDIRT]: [1.9, 1.6, 1.4, 'wet soil'], [POROUS]: [1.5, 0.85, 0.5, 'pumice'], [WOOL]: [0.2, 1.26, 0.04, 'felted wool'],
  [COPPER]: [8.96, 0.39, 401, 'copper'], [MEMBRANE]: [1.2, 1.5, 0.2, 'polymer sheet'], [CORAL]: [2.0, 0.85, 1.5, 'coral (aragonite)'],
  [BLEACHED]: [2.0, 0.85, 1.5, 'bleached coral'], [FUSE]: [1.0, 1.5, 0.2, 'fuse cord'], [MAGNET]: [5.0, 0.7, 10, 'ferrite'],
  [ORE]: [5.25, 0.67, 11, 'hematite'], [SLAG]: [2.9, 0.8, 1.0, 'slag'], [SUGAR]: [0.85, 1.25, 0.15, 'sugar, loose'],
  [RUST]: [2.5, 0.7, 0.6, 'flaky rust'], [FNITRO]: [1.73, 1.3, 0.3, 'frozen nitroglycerin'],
  [PIPE]: [7.85, 0.49, 50, 'steel'], [VALVE]: [7.85, 0.49, 50, 'steel'], [FILTER]: [7.85, 0.49, 50, 'steel'], [BOILER]: [7.85, 0.49, 50, 'steel'],
  [THERMO]: [8.96, 0.39, 401, 'copper probe'], [GEYSER]: [2.7, 0.79, 2.8, 'rock'], [VENT]: [2.7, 0.79, 2.8, 'rock'],
};
for (const b of [PUMP_IN, PUMP_OUT, LEVER, PLATE, SENSOR, TIMER, GATE, SPRING, DRAIN, TURBINE, WHEEL, SEPARATOR, AND, OR, NOT, COUNTER, WINDMILL, BATTERY, LAMP, MOTOR, EMAGNET, SOLAR, DEPTH, PIXEL]) BLOCK_MATTER[b] = MACHINE;

// [density, specific heat, conductivity, convects, what it stands for]; gases use the gas rules below.
const LIQUID_MATTER = {
  [WATER]: [1.0, 4.18, 0.6, true, 'water'], [LAVA]: [2.7, 1.3, 1.5, false, 'basalt melt'], [HONEY]: [1.42, 2.3, 0.5, false, 'honey'],
  [AETHER]: [0.05, 80, 0.5, true, 'fantasy: lighter than air, holds heat like water'], [QUICK]: [13.55, 0.14, 8.3, true, 'mercury'],
  [ACID]: [1.84, 1.4, 0.3, true, 'sulfuric acid'], [FROST]: [1.1, 2.5, 0.5, true, 'fantasy: keeps itself at −40°'],
  [OIL]: [0.87, 2.0, 0.15, true, 'crude oil'], [SLIME]: [1.3, 3.5, 0.5, false, 'fantasy'], [BLOOM]: [1.0, 4.18, 0.6, true, 'fantasy: essence in water'],
  [MUD]: [1.6, 3.0, 1.2, false, 'clay slurry'], [TONIC]: [1.05, 4.0, 0.6, true, 'fantasy'], [FOAM]: [0.3, 3.0, 0.1, false, 'soapy froth'],
  [STORM]: [1.0, 4.18, 0.6, true, 'fantasy: charged water'], [MOLTEN]: [6.98, 0.82, 35, true, 'molten iron'], [NITRO]: [1.59, 1.6, 0.2, true, 'nitroglycerin'],
  [LYE]: [1.52, 3.2, 0.6, true, 'sodium hydroxide, 50%'], [VOID]: [1.0, 4.0, 0.6, true, 'fantasy'], [MIMIC]: [1.0, 4.0, 0.6, true, 'fantasy'],
  [COOLANT]: [1.07, 3.3, 6, true, 'glycol coolant (carries heat far better than real glycol)'], [FERRO]: [1.3, 1.7, 0.2, true, 'magnetite in oil'],
  [LIGHT]: [0.9, 3.0, 0.5, true, 'fantasy'], [FERT]: [1.32, 2.9, 0.5, true, 'UAN fertiliser solution'], [MSLAG]: [2.7, 1.2, 1.0, false, 'molten slag'],
};
// Gases at their usual temperature: [density g/cm³, conductivity, what it stands for]
const GAS_MATTER = {
  [STEAM]: [0.0006, 0.025, 'steam'], [SMOKE]: [0.0008, 0.03, 'hot wood smoke'], [METHANE]: [0.00067, 0.034, 'methane'],
  [POISON]: [0.003, 0.009, 'chlorine'], [CO2]: [0.0018, 0.016, 'carbon dioxide'], [HYDROGEN]: [0.00008, 0.18, 'hydrogen'], [OXYGEN]: [0.0013, 0.026, 'oxygen'],
};
const AIR_K = 0.026;

const CONVECTS = 3, GAS_CONVECT = 1.37, CAP_GAS = 0.1, STEAM_CAP = 2.0;
// How far heat moves per heat tick for a given conductance and capacity; set so water closes 5% of the gap to its
// neighbours each heat tick, as before.
const HEAT_SPEED = 0.0225;
// Latent heats, J/g, and the share of them the game uses.
const LATENT = 0.25;
const L_FUSION_WATER = 334, L_BOIL_WATER = 2257, L_FUSION_ROCK = 400, L_FUSION_IRON = 247;

// Per block and per liquid: density, heat capacity of a full tile (J/cm³·K) and conductance (compressed conductivity).
const BCAP = new Float32Array(NBLOCK), BCOND = new Float32Array(NBLOCK);
const LRHO = new Float32Array(NLIQ), LCAP = new Float32Array(NLIQ), LCOND = new Float32Array(NLIQ);
const AIR_CAP = CAP_GAS, AIR_COND = Math.sqrt(AIR_K) * GAS_CONVECT;
for (let b = 1; b < NBLOCK; b++) {
  const [rho, cp, k] = BLOCK_MATTER[b] || [2.7, 0.79, 2.8];
  BCAP[b] = rho * cp; BCOND[b] = Math.sqrt(k);
}
for (const t in LIQUID_MATTER) {
  const [rho, cp, k, conv] = LIQUID_MATTER[t];
  LRHO[t] = rho; LCAP[t] = Math.max(CAP_GAS, rho * cp); LCOND[t] = Math.sqrt(k) * (conv ? CONVECTS : 1);
}
for (const t in GAS_MATTER) {
  const [rho, k] = GAS_MATTER[t];
  LRHO[t] = rho; LCAP[t] = +t === STEAM ? STEAM_CAP : CAP_GAS; LCOND[t] = Math.sqrt(k) * GAS_CONVECT;
}
// The fraction of the gap to its neighbours a full tile of this material closes each heat tick, surrounded by itself.
const rateOf = (cap, cond) => HEAT_SPEED * 4 * cond / cap;

export { BLOCK_MATTER, LIQUID_MATTER, GAS_MATTER, MACHINE, AIR_K, CONVECTS, GAS_CONVECT, CAP_GAS, STEAM_CAP, HEAT_SPEED, LATENT, L_FUSION_WATER, L_BOIL_WATER, L_FUSION_ROCK, L_FUSION_IRON, BCAP, BCOND, LRHO, LCAP, LCOND, AIR_CAP, AIR_COND, rateOf };
