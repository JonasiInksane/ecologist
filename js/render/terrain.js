// Pre-drawn block and background pixels, including pump blocks.
import { terr } from '../canvas.js';
import { BASALT, BRICK, CLAY, COMB, CRISP, CRYSTAL, DIRT, GLASS, H, ICE, LEAF, METAL, MOSS, OBSIDIAN, PERMAFROST, PH, PLANT, PUMP_IN, PUMP_OUT, PW, SALT, SAND, SNOW, STONE, T, W, WOOD } from '../config.js';
import { P, hash, hex, pack } from '../util.js';
import { devices, held, solid, under } from '../world.js';
import { POWDER } from '../powders.js';
import { SUGAR } from '../config.js';
import { devicePixel, isDeviceBlock, pipePixel } from './devices.js';
import { GEM, SODA } from '../config.js';
import { BLEACHED, COPPER, CORAL, FUSE, MAGNET, POROUS, SPONGE, WETDIRT, WETSPONGE, WOOL } from '../config.js';
import { ALUMINIUM, ASH, CHARCOAL, FNITRO, GOLD, LIME, LIMESTONE, ORE, PATINA, QUICKLIME, RUST, SLAG, ZINC } from '../config.js';












const PAL = {
  [DIRT]:     { base: P(['#8a5a3b', '#7b4f33', '#946446', '#6c432b']), out: P(['#3a2216'])[0], hl: P(['#a3714f'])[0] },
  [STONE]:    { base: P(['#7c7f8c', '#6f7280', '#868a97', '#5f6270']), out: P(['#2b2d36'])[0], hl: P(['#9a9eab'])[0] },
  [OBSIDIAN]: { base: P(['#2b1d3d', '#22172f', '#35254a', '#1a1124']), out: P(['#0c0812'])[0], hl: P(['#7a5cb0'])[0] },
  [COMB]:     { base: P(['#e0a530', '#d39522', '#eab445', '#c78a1c']), out: P(['#6e4308'])[0], hl: P(['#ffd36e'])[0] },
  [CRISP]:    { base: P(['#9c5a24', '#8c4f1d', '#a8652c', '#7b4418']), out: P(['#3f220a'])[0], hl: P(['#c98642'])[0] },
  [ICE]:      { base: P(['#a9dcf2', '#9bd0ea', '#c4ebfa', '#86bddb']), out: P(['#3d6c8a'])[0], hl: P(['#ecfaff'])[0] },
  [BASALT]:   { base: P(['#3a3436', '#332d30', '#443d3e', '#2a2527']), out: P(['#141012'])[0], hl: P(['#5e5456'])[0] },
  [WOOD]:     { base: P(['#8a5a2e', '#7d5128', '#986636', '#6e4722']), out: P(['#3a2210'])[0], hl: P(['#b07a44'])[0] },
  [MOSS]:     { base: P(['#5f7d5a', '#56724f', '#6c8c63', '#4a6345']), out: P(['#22311f'])[0], hl: P(['#9fe07a'])[0] },
  [CRYSTAL]:  { base: P(['#9a6be0', '#8455cc', '#c49cf7', '#6c40ad']), out: P(['#2e1652'])[0], hl: P(['#efdcff'])[0] },
  [SPONGE]:   { base: P(['#f0d060', '#e2c050', '#f8e080', '#c8a440']), out: P(['#8a6a20'])[0], hl: P(['#fff0a0'])[0] },
  [WETSPONGE]: { base: P(['#b89a3a', '#a88a30', '#c8aa48', '#8a7020']), out: P(['#5a4210'])[0], hl: P(['#d8c070'])[0] },
  [WETDIRT]:  { base: P(['#5e3c26', '#523420', '#6a4630', '#46301c']), out: P(['#24140a'])[0], hl: P(['#7a5236'])[0] },
  [POROUS]:   { base: P(['#a89a84', '#8e8270', '#b8ac96', '#6e6454']), out: P(['#3e382e'])[0], hl: P(['#d0c4ae'])[0] },
  [WOOL]:     { base: P(['#ece6dc', '#ddd6ca', '#f8f4ee', '#c8c0b2']), out: P(['#8a8478'])[0], hl: P(['#ffffff'])[0] },
  [COPPER]:   { base: P(['#c87a46', '#b06838', '#e09060', '#8a4e28']), out: P(['#4a2814'])[0], hl: P(['#f0b080'])[0] },
  [CORAL]:    { base: P(['#ff7a8a', '#f06070', '#ff9aa8', '#d84a60']), out: P(['#7a2030'])[0], hl: P(['#ffc8d0'])[0] },
  [BLEACHED]: { base: P(['#f2eee6', '#e4e0d6', '#fbf8f2', '#d0cabe']), out: P(['#8a847a'])[0], hl: P(['#ffffff'])[0] },
  [FUSE]:     { base: P(['#a03028', '#8a2820', '#c04838', '#6a1c16']), out: P(['#3a0e0a'])[0], hl: P(['#e07060'])[0] },
  [MAGNET]:   { base: P(['#c03030', '#a82828', '#d84848', '#3a3e48']), out: P(['#1a1c22'])[0], hl: P(['#e8e8f0'])[0] },
  [SODA]:     { base: P(['#eef2f6', '#e0e6ee', '#fbfdff', '#c9d2dc']), out: P(['#7c8794'])[0], hl: P(['#ffffff'])[0] },
  [GEM]:      { base: P(['#bff4ff', '#9ee6f5', '#e8fdff', '#7fd0e6']), out: P(['#3a7f95'])[0], hl: P(['#ffffff'])[0] },
  [SALT]:     { base: P(['#f2f0ea', '#e4e1d8', '#ffffff', '#cfcabd']), out: P(['#8a8478'])[0], hl: P(['#ffffff'])[0] },
  [SAND]:     { base: P(['#e2c98a', '#d6bb7a', '#ecd79c', '#c4a766']), out: P(['#7a6338'])[0], hl: P(['#f6e6b8'])[0] },
  [SUGAR]:    { base: P(['#fbf6e8', '#f0e6cc', '#ffffff', '#e0d0a4']), out: P(['#9a8a60'])[0], hl: P(['#ffffff'])[0] },
  [BRICK]:    { base: P(['#b4573a', '#a54d32', '#c0644a', '#8e3f28']), out: P(['#4a1d12'])[0], hl: P(['#d88a6a'])[0] },
  [GLASS]:    { base: P(['#cfeef6']), out: P(['#6fa8b8'])[0], hl: P(['#ffffff'])[0] },
  [SNOW]:     { base: P(['#f4f8ff', '#e8eef8', '#ffffff', '#d6e0ee']), out: P(['#9fb4cc'])[0], hl: P(['#ffffff'])[0] },
  [PERMAFROST]: { base: P(['#6c5a4a', '#5f5042', '#7a6a5c', '#8fb0c8']), out: P(['#2e2620'])[0], hl: P(['#c8e4f4'])[0] },
  [CLAY]:     { base: P(['#a8705a', '#9a6450', '#b47c66', '#8c5a48']), out: P(['#4a2a1e'])[0], hl: P(['#c89a84'])[0] },
  [METAL]:    { base: P(['#8d96a6', '#848d9d', '#99a2b1', '#737b8a']), out: P(['#2b303a'])[0], hl: P(['#d4dae4'])[0] },
  [ORE]:      { base: P(['#7c7f8c', '#6f7280', '#b0643a', '#5f6270']), out: P(['#2b2d36'])[0], hl: P(['#d88a5a'])[0] },   // stone flecked with rust
  [RUST]:     { base: P(['#a0502a', '#8a4222', '#c06a36', '#6e3418']), out: P(['#3a1a0c'])[0], hl: P(['#d88a4a'])[0] },   // flaky orange-brown
  [FNITRO]:   { base: P(['#f0e4b0', '#e4d498', '#fff6d8', '#d0bc7a']), out: P(['#8a7a3a'])[0], hl: P(['#ffffff'])[0] },   // pale waxy crystals
  [LIMESTONE]: { base: P(['#cfc6ae', '#bdb49a', '#e0d9c4', '#a89f86']), out: P(['#6e6650'])[0], hl: P(['#f0ead8'])[0] },   // pale and chalky
  [QUICKLIME]: { base: P(['#f4f2ea', '#e6e3d6', '#ffffff', '#d4d0c0']), out: P(['#8a8676'])[0], hl: P(['#ffffff'])[0] },
  [LIME]:     { base: P(['#e2ded2', '#d2cdbe', '#efece2', '#bcb6a4']), out: P(['#7a7464'])[0], hl: P(['#f6f4ee'])[0] },   // mortar
  [CHARCOAL]: { base: P(['#2a2624', '#1e1b1a', '#3a3532', '#141210']), out: P(['#080707'])[0], hl: P(['#5a524c'])[0] },
  [ASH]:      { base: P(['#b4b0aa', '#a29e98', '#c8c4be', '#8e8a84']), out: P(['#5e5a56'])[0], hl: P(['#dcd8d2'])[0] },
  [ALUMINIUM]: { base: P(['#c8ccd2', '#b8bcc4', '#e2e6ec', '#a4a8b0']), out: P(['#5e6268'])[0], hl: P(['#f4f6fa'])[0] },
  [ZINC]:     { base: P(['#a4aab0', '#949aa2', '#bcc2c8', '#848a92']), out: P(['#4c5056'])[0], hl: P(['#d6dbe0'])[0] },
  [GOLD]:     { base: P(['#e8b830', '#d4a020', '#f8d860', '#b88410']), out: P(['#6a4a08'])[0], hl: P(['#fff0a8'])[0] },
  [PATINA]:   { base: P(['#5aa88a', '#4a9478', '#7cc4a4', '#b0643a']), out: P(['#24483a'])[0], hl: P(['#a8e0c8'])[0] },   // verdigris over copper
  [SLAG]:     { base: P(['#4a4240', '#3e3735', '#5a5048', '#2e2826']), out: P(['#161210'])[0], hl: P(['#7a6a5a'])[0] },
};
const MORTAR = P(['#d8c8b0'])[0];
const STEM = P(['#3f8f2e', '#5fb84a', '#2e6b22']), LEAVES = P(['#4fa83a', '#7fd35a', '#2e6b22']);
// The year in eight steps from midwinter (seasonStep in js/climate.js): leaf colours (body, light, dark) and how much
// of a leaf is left; grass colours (two body shades, highlight). Leaves thin out from late autumn to late winter and
// grass frosts over in midwinter; spring is fresh green, summer deep, autumn orange and red.
const SEASON_LEAVES = [
  [['#7a5a3a', '#94704a', '#5a3e26'], 0.35], [['#7f6a3e', '#9a8450', '#5e4a28'], 0.5], [['#6fc04a', '#a6e86e', '#4a9a32'], 1],
  [['#5fb84a', '#8fdc62', '#3a8228'], 1], [['#4fa83a', '#7fd35a', '#2e6b22'], 1], [['#8fa83a', '#b8c84a', '#5e7a22'], 1],
  [['#d8862a', '#f0b040', '#a8501a'], 0.85], [['#b8481e', '#d86a2a', '#7a3014'], 0.55],
].map(([c, keep]) => ({ c: P(c), keep }));
const SEASON_GRASS = [
  ['#b8c8c0', '#98a8a0', '#e8f0f4'], ['#7f9a5a', '#6a8248', '#a8c07a'], ['#5fb84a', '#4fa83a', '#8fe06a'], ['#4fa83a', '#3f8f2e', '#7fd35a'],
  ['#4fa83a', '#3f8f2e', '#7fd35a'], ['#8a9a3a', '#748230', '#b8c45a'], ['#a8963a', '#8a7a2e', '#d0bc5a'], ['#8a7a4a', '#74663c', '#b0a070'],
].map(P);
const SUMMER = 4;
// Glass shows the background through a faint blue-white tint.
function glassPixel(c) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  return pack([r + (207 - r) * 0.22, g + (238 - g) * 0.22, b + (246 - b) * 0.22].map(v => v | 0));
}
const GRASS = P(['#4fa83a', '#3f8f2e']), GRASS_OUT = P(['#22561a'])[0], GRASS_HL = P(['#7fd35a'])[0];
const WALL = P(['#2a2024', '#251c20', '#30252a', '#211a1d']);
// The sky: one flat colour per pixel row, a smooth gradient from deep blue overhead to pale blue at the horizon.
const SKY_STOPS = ['#1f3360', '#2e5290', '#4a7cb8', '#7aa8d6'].map(hex);
const SKY_ROWS = new Uint32Array(PH);
for (let y = 0; y < PH; y++) {
  const t = Math.min(1, y / (PH * 0.42)) * (SKY_STOPS.length - 1), i = Math.min(SKY_STOPS.length - 2, t | 0), f = t - i;
  const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
  SKY_ROWS[y] = pack([0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * f)));
}

function isSolid(x, y) { if (y < 0) return false; if (x < 0 || x >= W || y >= H) return true; return solid[y * W + x] !== 0; }
// js/render/backdrop.js puts scrolling background layers behind the world. It finds where they show through by tile
// (bgTile: BG_SKY and BG_CAVE bits for the background a tile shows), then by pixel: sky pixels are the sky row's
// colour, and cave-wall pixels carry BG_CAVE in their alpha byte instead of 255 (their colour is still the plain wall,
// for anything that tints it).
const BG_SKY = 1, BG_CAVE = 2;
const bgTile = new Uint8Array(W * H);
let shows = 0;   // the background bits of the tile being drawn
function bgPixel(wx, wy, u) {
  if (u) { shows |= BG_CAVE; const r = hash(wx >> 1, (wy >> 1) + 7000); return ((WALL[r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3] & 0xffffff) | 1 << 24) >>> 0; }
  shows |= BG_SKY;
  return SKY_ROWS[wy];
}
// The season step leaves and grass are drawn for (render.js changes it, and redraws them, as the year turns).
let shownSeason = SUMMER;
function setShownSeason(step) { shownSeason = step; }
function drawTile(tx, ty) {
  const k = ty * W + tx, b = solid[k];
  shows = 0;
  const up = !isSolid(tx, ty - 1), dn = !isSolid(tx, ty + 1), lf = !isSolid(tx - 1, ty), rt = !isSolid(tx + 1, ty);
  const pal = PAL[b];
  const grassy = b === DIRT && up && !under[k];
  for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
    const wx = tx * T + px, wy = ty * T + py, p = wy * PW + wx;
    if (!b) { terr[p] = bgPixel(wx, wy, under[k]); continue; }
    if (b === PUMP_IN || b === PUMP_OUT) { terr[p] = pumpPixel(b, px, py); continue; }
    if (isDeviceBlock(b)) { terr[p] = devicePixel(b, px, py, devices.get(k), tx, ty) || bgPixel(wx, wy, under[k]); continue; }
    // plants are drawn over the background with no outline
    if (b === PLANT) { terr[p] = px === 3 ? STEM[1] : px === 4 ? STEM[0] : px === 2 || px === 5 ? (hash(wx, wy) > 0.7 ? STEM[2] : bgPixel(wx, wy, under[k])) : bgPixel(wx, wy, under[k]); continue; }
    if (b === LEAF) {
      const L = SEASON_LEAVES[shownSeason], d = Math.abs(px - 3.5) + Math.abs(py - 3.5);
      terr[p] = d >= 4 || (L.keep < 1 && hash(wx, wy + 8191) > L.keep) ? bgPixel(wx, wy, under[k]) : L.c[d < 3 ? (py < 3 ? 1 : 0) : 2];
      continue;
    }
    if (POWDER[b]) {   // loose single-pixel grains, as deep as the tile's amount, with a ragged top where it's open
      const h = Math.max(1, Math.round((held[k] || 255) * T / 255)), top = T - h, open = h < T || up;
      if (py < top || (open && py === top && hash(wx, 4111) < 0.4)) { terr[p] = bgPixel(wx, wy, under[k]); continue; }
      const r = hash(wx + b * 977, wy);
      terr[p] = open && py <= top + 1 && r > 0.6 ? pal.hl : pal.base[r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3];
      continue;
    }
    const corner = (px === 0 && py === 0 && up && lf) || (px === 7 && py === 0 && up && rt) || (px === 0 && py === 7 && dn && lf) || (px === 7 && py === 7 && dn && rt);
    if (corner) { terr[p] = bgPixel(wx, wy, under[k]); continue; }
    const edge = (up && py === 0) || (dn && py === 7) || (lf && px === 0) || (rt && px === 7);
    if (grassy) {
      const gd = 2 + (hash(wx, 77) > 0.55 ? 1 : 0);
      const G = SEASON_GRASS[shownSeason];
      if (py === 0) { terr[p] = GRASS_OUT; continue; }
      if (py < gd) { terr[p] = edge ? GRASS_OUT : (py === 1 && hash(wx, 78) > 0.6 ? G[2] : G[hash(wx >> 1, wy) > 0.5 ? 0 : 1]); continue; }
    }
    if (edge) { terr[p] = pal.out; continue; }
    if (b === GLASS) { terr[p] = (px === py + 2 || px === py + 3) && hash(tx, ty) > 0.4 ? pal.hl : glassPixel(bgPixel(wx, wy, under[k])); continue; }
    if (up && py === 1 && !grassy) { terr[p] = pal.hl; continue; }
    if (dn && py === 6) { terr[p] = pal.base[3]; continue; }
    if ((b === ICE || b === CRYSTAL) && (px + py === 5 || px + py === 6) && hash(tx, ty) > 0.3) { terr[p] = pal.hl; continue; }
    if (b === WOOD && py % 3 === 2) { terr[p] = pal.base[3]; continue; }   // plank seams
    if (b === METAL && (px === 2 || px === 5) && (py === 2 || py === 5)) { terr[p] = pal.out; continue; }   // rivets
    if (b === BRICK && (py === 3 || py === 7 || px === (py < 4 ? 3 : 7))) { terr[p] = MORTAR; continue; }
    const r = hash((wx >> 1) + b * 977, wy >> 1);
    terr[p] = pal.base[r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3];
  }
  bgTile[k] = shows;
}

const MET = { out: pack(hex('#1d2230')), hl: pack(hex('#9aa5ba')), body: pack(hex('#5f6a80')), dark: pack(hex('#3b4352')), slot: pack(hex('#0f1218')) };
// Inlet: a grate. Outlet: a round nozzle.
function pumpPixel(b, px, py) {
  if (px === 0 || py === 0 || px === 7 || py === 7) return MET.out;
  if (px === 1 || py === 1) return MET.hl;
  if (px === 6 || py === 6) return MET.dark;
  if (b === PUMP_IN) return (py === 2 || py === 4) ? MET.slot : MET.body;
  const dx = px - 3.5, dy = py - 3.5, d = dx * dx + dy * dy;
  return d < 1 ? MET.slot : d < 3 ? MET.dark : MET.body;
}

export { SEASON_LEAVES, SEASON_GRASS, SUMMER, setShownSeason, BG_SKY, BG_CAVE, bgTile, PAL, MORTAR, STEM, LEAVES, glassPixel, GRASS, GRASS_OUT, GRASS_HL, WALL, SKY_STOPS, SKY_ROWS, isSolid, bgPixel, drawTile, MET, pumpPixel };
