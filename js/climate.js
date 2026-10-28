// Climate: what each column of the world is like (its biome, a temperature offset, how humid and how windy it is,
// and where its ground surface lies), the season, air that gets colder with height, and ground that gets warmer with
// depth. js/heat.js reads the sky and ground temperatures from here; js/air.js and js/generate.js fill it in.
import { AMBIENT, H, W } from './config.js';
import { DAY_TICKS, sunHeight } from './daynight.js';
import { S } from './world.js';

const SEA = (H * 0.36) | 0;   // the row the sky temperature is quoted at; air is colder above it and warmer below
const LAPSE = 0.5;            // degrees colder per tile of height
const DEPTH_WARM = 0.35;      // degrees warmer per tile of depth below the surface
const MAGMA_ROWS = 8, MAGMA_T = 1100;   // the magma sea, its crust and the floor under it (js/biomes.js) rest this hot
const SEASON_DAYS = 8, SEASON_SWING = 12;
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];   // centred on season phases 0, 0.25, 0.5 and 0.75

const colTemp = new Float32Array(W);          // temperature offset of each column's biome
const colHum = new Float32Array(W).fill(1);   // how moist the air is, relative to grassland: humid biomes draw vapour in, dry ones send it away
const colWind = new Float32Array(W).fill(1);  // how exposed to the wind it is
const colSwing = new Float32Array(W).fill(1); // how far day and night temperatures swing (deserts swing more)
const colBiome = new Uint8Array(W);           // index into BIOMES in js/biomes.js
const surface = new Int16Array(W).fill(SEA);  // row of the ground surface
const shade = new Float32Array(W);            // how much cloud is overhead, 0–1 (written by js/air.js)
const drought = new Uint8Array(W);            // 1 where a dry spell holds (puddles there dry twice as fast)
const spellTemp = new Float32Array(W);        // how much warmer (a drought) or cooler (a wet spell) the air is
const ambient = new Float32Array(W * H).fill(AMBIENT);   // resting temperature of each tile underground

// Days since the world began, and the season: phase 0 is midwinter; the world starts in spring, and the temperature
// swings ±12° over SEASON_DAYS days.
function day() { return S.tick / DAY_TICKS; }
function seasonPhase() { return (day() / SEASON_DAYS + 0.25) % 1; }
function seasonOffset() { return S.weather ? -Math.cos(seasonPhase() * Math.PI * 2) * SEASON_SWING : 0; }
function seasonName() { return SEASONS[Math.round(seasonPhase() * 4) % 4]; }
// The year in eight steps, 0 at midwinter, for drawing; early summer (4) when there's no weather or in a puzzle.
function seasonStep() { return !S.weather || (S.level && !S.level.custom) ? 4 : Math.floor(seasonPhase() * 8 + 0.5) % 8; }
// Air temperature in the open at tile (x, y): about 45° at noon and −15° at midnight at sea level in grassland,
// shifted by the biome, the season and cloud cover, and colder with height. Without weather it stays at 20°.
function skyTempAt(x, y) {
  if (!S.weather) return AMBIENT;
  return 15 + 30 * sunHeight() * colSwing[x] + colTemp[x] + spellTemp[x] + seasonOffset() - 8 * shade[x] + (y - SEA) * LAPSE;
}
// Fills skyRow with each column's sky temperature at sea level (add (y - SEA) * LAPSE for row y), for the heat pass.
function skyColumns(skyRow) {
  for (let x = 0; x < W; x++) skyRow[x] = skyTempAt(x, SEA);
}
// The resting temperature underground: near the surface it follows the biome, deeper down the rock gets warmer.
function rebuildAmbient() { ambientFrom(colTemp, surface, ambient); }
// The resting temperature of every tile from each column's temperature offset and ground surface, into out.
function ambientFrom(cols, surf, out) {
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const d = Math.max(0, y - surf[x]);
    out[y * W + x] = AMBIENT + cols[x] * Math.exp(-d / 24) + d * DEPTH_WARM;
    if (y >= H - MAGMA_ROWS - 4) { const f = Math.min(1, (y - (H - MAGMA_ROWS - 4)) / 4); out[y * W + x] += (MAGMA_T - out[y * W + x]) * f; }   // the rock round the magma sea is as hot as it
  }
  return out;
}
// Back to a plain grassland world with no climate (used by resetWorld).
function resetClimate() {
  colTemp.fill(0); colHum.fill(1); colWind.fill(1); colSwing.fill(1); colBiome.fill(0); surface.fill(SEA); shade.fill(0); drought.fill(0); spellTemp.fill(0);
  ambient.fill(AMBIENT);
}

export { seasonStep, ambientFrom, SEA, LAPSE, DEPTH_WARM, SEASON_DAYS, SEASON_SWING, SEASONS, colTemp, colHum, colWind, colSwing, colBiome, surface, shade, drought, spellTemp, ambient, day, seasonPhase, seasonOffset, seasonName, skyTempAt, skyColumns, rebuildAmbient, resetClimate };
