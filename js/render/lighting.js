// Tile light propagation and smooth per-pixel shading.
import { frame } from '../canvas.js';
import { shade } from '../climate.js';
import { CRYSTAL, GLASS, H, MOSS, PW, T, W } from '../config.js';
import { skyLight } from '../daynight.js';
import { LIQ } from '../liquids.js';
import { charged } from '../power.js';
import { VIEW, bodies, deco, devices, fire, liq, solid, temp, typ, under } from '../world.js';
import { lanternTile } from './render.js';
import { GEM, LAMP, PIXEL } from '../config.js';
import { PIXEL_COLOURS } from '../devices.js';
import { hex } from '../util.js';












const LR = new Float32Array(W * H), LG = new Float32Array(W * H), LB = new Float32Array(W * H);
const DEC = new Float32Array(W * H), EMI = new Uint8Array(W * H);
const CR = new Float32Array((W + 1) * (H + 1)), CG = new Float32Array((W + 1) * (H + 1)), CB = new Float32Array((W + 1) * (H + 1));
// Light is worked out only in the view and a margin around it (light fades out well within MARGIN tiles), over the
// rectangle x0..x1, y0..y1.
const MARGIN = 40;
const LAMP_LIGHT = [1, 0.9, 0.6], PIXEL_LIGHT = PIXEL_COLOURS.map(c => hex(c).map(v => v / 255 * 0.3));
let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
function sweep(L) {
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    for (let x = x0 + 1; x <= x1; x++) { const k = row + x, v = L[k - 1] * DEC[k]; if (v > L[k]) L[k] = v; }
    for (let x = x1 - 1; x >= x0; x--) { const k = row + x, v = L[k + 1] * DEC[k]; if (v > L[k]) L[k] = v; }
  }
  // down, then up, every column; a row at a time, which gives the same result and reads memory in order
  for (let y = y0 + 1; y <= y1; y++) for (let x = x0, k = y * W + x; x <= x1; x++, k++) { const v = L[k - W] * DEC[k]; if (v > L[k]) L[k] = v; }
  for (let y = y1 - 1; y >= y0; y--) for (let x = x0, k = y * W + x; x <= x1; x++, k++) { const v = L[k + W] * DEC[k]; if (v > L[k]) L[k] = v; }
}
function computeLight() {
  const sky = skyLight();
  x0 = Math.max(0, VIEW.tx0 - MARGIN); x1 = Math.min(W - 1, VIEW.tx1 + MARGIN);
  y0 = Math.max(0, VIEW.ty0 - MARGIN); y1 = Math.min(H - 1, VIEW.ty1 + MARGIN);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = y * W + x, b = solid[k], a = liq[k];
    let r = 0, g = 0, bl = 0; EMI[k] = 0;
    if (b && b !== GLASS) {
      DEC[k] = 0.55;
      if (b === CRYSTAL) { r = 0.75; g = 0.5; bl = 1; EMI[k] = 1; }
      if (b === GEM) { r = 0.35; g = 0.7; bl = 0.8; }   // salt crystals glow faintly
      if (temp[k] > 450) { const h = Math.min(1, (temp[k] - 450) / 500); r = Math.max(r, h); g = Math.max(g, h * 0.35); bl = Math.max(bl, h * 0.08); }
    } else {
      DEC[k] = b ? 0.86 : a ? LIQ[typ[k]].ldecay : 0.9;   // glass lets light through, a little dimmer than air
      if (!under[k]) { const c = 1 - 0.35 * shade[k % W]; r = sky[0] * c; g = sky[1] * c; bl = sky[2] * c; }   // clouds shade what's under them
      if (a && LIQ[typ[k]].emit) {
        const e = LIQ[typ[k]].emit, s = Math.min(1, 0.35 + a / 180);
        r = Math.max(r, e[0] * s); g = Math.max(g, e[1] * s); bl = Math.max(bl, e[2] * s); EMI[k] = 1;
      }
      if (a && charged(k)) { r = Math.max(r, 0.5); g = Math.max(g, 0.72); bl = Math.max(bl, 1); EMI[k] = 1; }
    }
    if (fire[k]) { r = Math.max(r, 1); g = Math.max(g, 0.62); bl = Math.max(bl, 0.25); }
    if (deco[k]) { r = Math.max(r, 0.25); g = Math.max(g, 0.65); bl = Math.max(bl, 0.7); }
    if (solid[k] === MOSS) { g = Math.max(g, 0.18); bl = Math.max(bl, 0.12); }
    LR[k] = r; LG[k] = g; LB[k] = bl;
  }
  for (const b of bodies) {   // salamanders glow
    if (b.kind !== 'salamander') continue;
    const k = Math.min(H - 1, ((b.y + 2) / T) | 0) * W + Math.min(W - 1, ((b.x + 4) / T) | 0);
    LR[k] = Math.max(LR[k], 0.9); LG[k] = Math.max(LG[k], 0.5); LB[k] = Math.max(LB[k], 0.2);
  }
  for (const [k, d] of devices) {   // lit lamps, and lit pixels, which show at full brightness but only glow faintly
    if ((d.kind !== LAMP && d.kind !== PIXEL) || !d.active) continue;
    const y = (k / W) | 0, x = k % W;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const c = d.kind === LAMP ? LAMP_LIGHT : PIXEL_LIGHT[d.colour || 0];
    LR[k] = Math.max(LR[k], c[0]); LG[k] = Math.max(LG[k], c[1]); LB[k] = Math.max(LB[k], c[2]); EMI[k] = 1;
  }
  const ex = bodies.find(b => b.kind === 'explorer');
  if (ex) {   // the explorer's lantern
    const k = lanternTile(ex);
    LR[k] = Math.max(LR[k], 0.75); LG[k] = Math.max(LG[k], 0.6); LB[k] = Math.max(LB[k], 0.36);
  }
  for (let i = 0; i < 2; i++) { sweep(LR); sweep(LG); sweep(LB); }
  // corner samples for smooth per-pixel light, for the view
  for (let cy = VIEW.ty0; cy <= Math.min(H, VIEW.ty1 + 1); cy++) for (let cx = VIEW.tx0; cx <= Math.min(W, VIEW.tx1 + 1); cx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < 4; j++) {
      const x = cx - 1 + (j & 1), y = cy - 1 + (j >> 1);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (EMI[k]) { r += 1; g += 1; b += 1; }
      else { r += Math.min(1, LR[k] * 1.35); g += Math.min(1, LG[k] * 1.35); b += Math.min(1, LB[k] * 1.35); }
      n++;
    }
    const c = cy * (W + 1) + cx;
    CR[c] = Math.max(0.05, r / n); CG[c] = Math.max(0.05, g / n); CB[c] = Math.max(0.06, b / n);
  }
}
// The light changes slowly, so it is worked out every other frame, and at once when the view shows other tiles
// (the corner samples cover only the view).
let lightAge = 0, litX0 = -1, litY0 = -1, litX1 = -1, litY1 = -1;
function updateLight() {
  const moved = VIEW.tx0 !== litX0 || VIEW.ty0 !== litY0 || VIEW.tx1 !== litX1 || VIEW.ty1 !== litY1;
  if (!moved && ++lightAge < 2) return;
  computeLight();
  lightAge = 0; litX0 = VIEW.tx0; litY0 = VIEW.ty0; litX1 = VIEW.tx1; litY1 = VIEW.ty1;
}
const MID = Float64Array.from({ length: T }, (_, i) => (i + 0.5) / T);   // pixel centres within a tile
function applyLight() {
  const SW = W + 1;
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const c0 = ty * SW + tx, c1 = c0 + 1, c2 = c0 + SW, c3 = c2 + 1;
    if (CR[c0] > 0.995 && CR[c1] > 0.995 && CR[c2] > 0.995 && CR[c3] > 0.995 &&
        CG[c0] > 0.995 && CG[c1] > 0.995 && CG[c2] > 0.995 && CG[c3] > 0.995 &&
        CB[c0] > 0.995 && CB[c1] > 0.995 && CB[c2] > 0.995 && CB[c3] > 0.995) continue;
    for (let py = 0; py < T; py++) {
      const fy = MID[py];
      const rl = CR[c0] + (CR[c2] - CR[c0]) * fy, rr = CR[c1] + (CR[c3] - CR[c1]) * fy;
      const gl = CG[c0] + (CG[c2] - CG[c0]) * fy, gr = CG[c1] + (CG[c3] - CG[c1]) * fy;
      const bl = CB[c0] + (CB[c2] - CB[c0]) * fy, br = CB[c1] + (CB[c3] - CB[c1]) * fy;
      const row = (ty * T + py) * PW + tx * T;
      for (let px = 0; px < T; px++) {
        const fx = MID[px], p = row + px, c = frame[p];
        const lr = rl + (rr - rl) * fx, lg = gl + (gr - gl) * fx, lb = bl + (br - bl) * fx;
        frame[p] = (0xff000000 | ((((c >>> 16) & 255) * lb) << 16) | ((((c >>> 8) & 255) * lg) << 8) | ((c & 255) * lr)) >>> 0;
      }
    }
  }
}

export { LR, LG, LB, DEC, EMI, CR, CG, CB, MARGIN, sweep, computeLight, updateLight, applyLight };
