// The verified designed jar, shared by the showcase preset and its long-duration gate.
// Only construction adds its initial contents. Readings never initialize or refill resources.
import { addBody } from './bodies.js';
import { DIRT, GLASS, H, NSOL, SOL_ALGAE, SOL_FERT, STONE, T, W, WATER } from './config.js';
import { DAY_TICKS, sunHeight } from './daynight.js';
import { ECO_ANIMALS, ECO_RATE } from './ecology-data.js';
import { ecoDeposit, ecoInitializeWorld, ecoState } from './ecology.js';
import { resetWorld } from './generate.js';
import { oxygenIn } from './oxygen.js';
import { plantSeed, plants } from './plants.js';
import { soluteAmount } from './solutes.js';
import { seededRandom } from './util.js';
import { TERRARIUM_BOUNDS } from './terrarium-data.js';
import { S, bodies, liq, sol, solid, temp, typ, under, wakeAll } from './world.js';

const TERRARIUM_START_ALGAE = 20 * 10 * 8;
function jarTile(x, y) { return y * W + x; }
function jarBlocks(x0, y0, x1, y1, block) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) solid[jarTile(x, y)] = block;
}
function jarWater(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = jarTile(x, y); liq[k] = 255; typ[k] = WATER; temp[k] = 20;
  }
}
// Intentionally does not seed or restore Math.random: the regression worker must retain
// exactly the same random stream through construction and subsequent simulation steps.
function buildEcosystemJar(scenario = 'balanced') {
  if (!['balanced', 'dark', 'unfed', 'overfed'].includes(scenario)) throw new RangeError('Unknown jar scenario');
  resetWorld();
  S.weather = false; S.momentum = true; S.pressure = true;
  under.fill(1);
  for (let x = 0; x < W; x++) solid[jarTile(x, H - 1)] = STONE;
  S.timeMode = scenario === 'dark' ? 'night' : 'cycle'; S.timeShift = 0;
  jarBlocks(30, 30, 60, 30, GLASS); jarBlocks(30, 56, 60, 56, GLASS);
  jarBlocks(30, 30, 30, 56, GLASS); jarBlocks(60, 30, 60, 56, GLASS);
  jarBlocks(31, 54, 59, 55, STONE); jarBlocks(41, 50, 59, 53, STONE);
  jarWater(31, 46, 40, 53);
  jarBlocks(41, 49, 59, 49, DIRT); jarBlocks(41, 46, 41, 48, STONE);
  for (let y = 46; y <= 53; y++) for (let x = 31; x <= 40; x++) {
    const k = jarTile(x, y);
    sol[k * NSOL + SOL_ALGAE] = scenario === 'unfed' ? 0 : 20;
    sol[k * NSOL + SOL_FERT] = scenario === 'overfed' ? 200 : 10;
  }
  plantSeed(jarTile(42, 48)); plantSeed(jarTile(44, 48)); ecoInitializeWorld();
  if (scenario === 'overfed') for (let y = 46; y <= 53; y++) for (let x = 31; x <= 40; x++) ecoDeposit(jarTile(x, y), { c: 1000, n: 100, p: 10 });
  // Plants remain, but fish have no edible algae or airborne algal starter in this control.
  if (scenario === 'unfed') {
    const ecology = ecoState();
    for (const pool of Object.values(ecology.inoculum)) {
      ecology.removed.c += pool.c; ecology.removed.n += pool.n; ecology.removed.p += pool.p;
      pool.c = pool.n = pool.p = 0;
    }
  }
  const fish = [addBody('fish', 33 * T, 50 * T), addBody('fish', 37 * T, 51 * T)];
  S.tick = Math.round(0.95 * DAY_TICKS);
  wakeAll();
  return fish.map(body => body.id);
}
function isTerrarium() {
  const state = S.terrarium;
  return !!state && state.kind === 'sealed-jar' && state.version === 1
    && Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 2147483647
    && Number.isFinite(state.startedAt) && state.startedAt >= 0 && state.startedAt <= S.tick;
}
function startTerrarium(seed = 7) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new RangeError('Jar seed must be a whole number from 0 to 2147483647');
  const puzzle = S.level && !S.level.custom;
  const previousSettings = isTerrarium() ? structuredClone(S.terrarium.previousSettings) : {
    seed: S.seed, weather: puzzle ? S.sandboxWeather ?? S.weather : S.weather,
    pressure: puzzle ? S.sandboxPressure ?? S.pressure : S.pressure,
    momentum: S.momentum, timeMode: S.timeMode || 'cycle', heldPhase: S.heldPhase ?? 0, timeShift: S.timeShift || 0,
  };
  const realRandom = Math.random;
  Math.random = seededRandom(seed);
  try { buildEcosystemJar(); } finally { Math.random = realRandom; }
  S.seed = seed;
  S.terrarium = { kind: 'sealed-jar', version: 1, seed, startedAt: S.tick, previousSettings };
  return S.terrarium;
}
function restartTerrarium() { return startTerrarium(isTerrarium() ? S.terrarium.seed : 7); }
// The caller chooses whether to generate a sandbox, start a puzzle or edit the existing jar.
function leaveTerrarium() {
  if (!isTerrarium()) { S.terrarium = null; return false; }
  const previous = S.terrarium.previousSettings;
  S.terrarium = null;
  if (previous && typeof previous === 'object') {
    for (const key of ['seed', 'weather', 'pressure', 'momentum', 'timeMode', 'heldPhase', 'timeShift']) {
      if (Object.hasOwn(previous, key)) S[key] = previous[key];
    }
    S.sandboxWeather = S.weather; S.sandboxPressure = S.pressure;
  }
  return true;
}
function inTerrarium(x, y) {
  return x > TERRARIUM_BOUNDS.x0 && x < TERRARIUM_BOUNDS.x1 && y > TERRARIUM_BOUNDS.y0 && y < TERRARIUM_BOUNDS.y1;
}
function terrariumReading() {
  if (!isTerrarium()) return null;
  let algae = 0, oxygenMin = Infinity, oxygenSum = 0, waterVolume = 0;
  for (let y = TERRARIUM_BOUNDS.y0 + 1; y < TERRARIUM_BOUNDS.y1; y++) for (let x = TERRARIUM_BOUNDS.x0 + 1; x < TERRARIUM_BOUNDS.x1; x++) {
    const k = jarTile(x, y);
    if (!liq[k] || typ[k] !== WATER) continue;
    const oxygen = oxygenIn(k), volume = liq[k] / 255;
    algae += soluteAmount(k, SOL_ALGAE);
    oxygenMin = Math.min(oxygenMin, oxygen); oxygenSum += oxygen * volume; waterVolume += volume;
  }
  const fish = bodies.filter(body => body.kind === 'fish');
  let foodReserveMin = Infinity, fishOxygenMin = Infinity, fishOutsideWater = 0, fishOutsideJar = 0, unknownFood = false;
  for (const body of fish) {
    const x = (body.x + body.w / 2) / T, y = (body.y + body.h / 2) / T;
    if (!inTerrarium(x, y)) fishOutsideJar++;
    const k = Math.floor(y) * W + Math.floor(x);
    if (x < 0 || x >= W || y < 0 || y >= H || !liq[k] || typ[k] !== WATER) fishOutsideWater++;
    else fishOxygenMin = Math.min(fishOxygenMin, oxygenIn(k));
    if (!Number.isFinite(body.bio?.c)) unknownFood = true;
    else foodReserveMin = Math.min(foodReserveMin, Math.max(0, body.bio.c - ECO_ANIMALS.fish.body) / ECO_ANIMALS.fish.reserve);
  }
  const deathCauses = Object.entries(S.diagnostics?.deathCounts || {}).filter(([key, count]) => key.startsWith('fish:') && count > 0)
    .map(([key, count]) => ({ cause: key.slice(5), count }));
  const reserve = fish.length && !unknownFood ? foodReserveMin : null;
  return { elapsedDays: (S.tick - S.terrarium.startedAt) / DAY_TICKS, fish: fish.length,
    plants: plants.filter(plant => inTerrarium(plant.root % W, (plant.root / W) | 0)).length,
    births: S.diagnostics?.births?.fish || 0, deaths: deathCauses.reduce((sum, item) => sum + item.count, 0), deathCauses,
    oxygenMin: Number.isFinite(oxygenMin) ? oxygenMin : null, oxygenMean: waterVolume ? oxygenSum / waterVolume : null,
    fishOxygenMin: Number.isFinite(fishOxygenMin) ? fishOxygenMin : null,
    algae, algaeRatio: algae / TERRARIUM_START_ALGAE, foodReserveMin: reserve,
    foodState: !fish.length ? 'none' : unknownFood ? 'unknown' : reserve <= ECO_RATE.epsilon ? 'exhausted' : reserve < 0.5 ? 'low' : 'well-fed',
    fishOutsideWater, fishOutsideJar, light: sunHeight() > 0 ? 'day' : 'night' };
}

export { TERRARIUM_BOUNDS, TERRARIUM_START_ALGAE, buildEcosystemJar, isTerrarium, startTerrarium, restartTerrarium, leaveTerrarium, terrariumReading };
