// The tile grid and the shared mutable state every system reads and writes.
import { AMBIENT, CHUNK, H, NSOL, VIEW_H, VIEW_W, W } from './config.js';












const solid = new Uint8Array(W * H);
const liq = new Uint8Array(W * H);
const typ = new Uint8Array(W * H);
const stamp = new Uint32Array(W * H);
const under = new Uint8Array(W * H);   // background: 0 sky, 1 cave wall
const fall = new Uint8Array(W * H);
const salign = new Uint8Array(W * H);
const dirty = new Uint8Array(W * H);
const dirtyList = [];
const S = { tick: 0, seed: 1, dirtyAll: true, pendingIn: -1, lighting: true, heatView: false, pendingLink: -1, lastLiquid: 1, shake: 0, weather: true, sandboxWeather: true, momentum: true, level: null, rain: 0, wind: 0, windTarget: 0, windTimer: 0, flash: 0, pressure: true, slimeCount: 0, follow: true, zoom: 1, sound: false, showChunks: false, showHud: true, music: false, timeMode: 'cycle', heldPhase: 0, timeShift: 0 };   // shared mutable state
const devices = new Map();   // tile index -> switch or target state
const fire = new Uint8Array(W * H);   // burn time left on a burning tile
const deco = new Uint8Array(W * H);   // 1 = glowcap mushroom growing in this tile
const VIEW = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, tx0: 0, ty0: 0, tx1: W - 1, ty1: H - 1 };   // the part of the world on screen
const CW = W / CHUNK, CHH = H / CHUNK, AWAKE_TICKS = 60;
const awake = new Uint8Array(CW * CHH);   // ticks left before each chunk may fall asleep
const HEAT_AWAKE = 4;
const heatAwake = new Uint8Array(CW * CHH);   // heat ticks left before each chunk's heat may fall asleep (js/heat.js)
const temp = new Float32Array(W * H).fill(AMBIENT), temp2 = new Float32Array(W * H);   // tile temperatures
// Heat a tile has taken in (+) or given out (−) part-way through melting, boiling, freezing or condensing (js/heat.js)
const latent = new Float32Array(W * H);
// The air in each empty tile: oxygen in tenths of a percent (210 is normal air) and carbon dioxide in hundredths of a
// percent (4 is normal, the 0.04% plants live on); js/oxygen.js keeps them
const AIR_OX = 210, AIR_CARB = 4;
const airOx = new Uint8Array(W * H).fill(AIR_OX), airCarb = new Uint16Array(W * H).fill(AIR_CARB);
const drop = new Uint8Array(W * H);   // rows the liquid in each tile has fallen without stopping (nitro goes off on a hard landing)
const vel = new Float32Array(W * H);   // sideways speed of each tile's liquid (js/momentum.js)
const afloat = new Uint8Array(W * H);   // 1 on ice that froze on water: lake ice, which floats (js/materials.js)
const held = new Uint8Array(W * H);   // liquid a frozen block was made from (0 = a full tile), given back when it melts
const flux = new Uint32Array(W * H);   // tick a good amount of liquid last flowed into each tile (turns water wheels)
const sol = new Uint8Array(W * H * NSOL);   // dissolved contents: tile k's channels start at k * NSOL
const pumps = [], bodies = [];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Wakes the chunk holding tile k and the chunks around it. The liquid update skips chunks that have gone quiet.
function wake(k) {
  const cx = ((k % W) / CHUNK) | 0, cy = ((k / W) / CHUNK) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < CW && y < CHH) awake[y * CW + x] = AWAKE_TICKS;
  }
}
// Wakes the heat in the chunk holding tile k and the chunks around it, after a sudden change of temperature or block.
function heatWake(k) {
  const cx = ((k % W) / CHUNK) | 0, cy = ((k / W) / CHUNK) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < CW && y < CHH) heatAwake[y * CW + x] = HEAT_AWAKE;
  }
}
function wakeAll() { awake.fill(AWAKE_TICKS); heatAwake.fill(HEAT_AWAKE); }
// Marks a tile and its neighbours for redrawing (block edges depend on neighbours), and wakes the liquid and heat around
// it. A change that moves no liquid and no heat (soil getting wet or drying) only needs redraw.
function markDirty(x, y) {
  wake(y * W + x); heatWake(y * W + x);
  redraw(x, y);
}
function redraw(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (!dirty[k]) { dirty[k] = 1; dirtyList.push(k); }
  }
}

// How much liquid a melting block turns into: what it froze from, or a full tile for placed and generated blocks.
function meltAmount(k) { const a = held[k] || 255; held[k] = 0; return a; }

export { solid, liq, typ, stamp, under, fall, salign, dirty, dirtyList, S, devices, fire, deco, VIEW, CW, CHH, AWAKE_TICKS, awake, HEAT_AWAKE, heatAwake, heatWake, temp, temp2, latent, AIR_OX, AIR_CARB, airOx, airCarb, drop, vel, flux, afloat, held, meltAmount, sol, pumps, bodies, reduceMotion, wake, wakeAll, markDirty, redraw };
