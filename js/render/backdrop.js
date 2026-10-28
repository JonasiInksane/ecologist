// Background layers behind the world that scroll slower than it (parallax): two ranges of distant hills in the sky,
// hazier the further off, and the cave walls, which slide a little slower than the rock in front of them. compose()
// copies the view into the frame, then fills in the layers where background shows (js/render/terrain.js marks where).
import { frame, terr } from '../canvas.js';
import { PW, T, W } from '../config.js';
import { hash, hex, pack, vnoise } from '../util.js';
import { S, VIEW, liq } from '../world.js';
import { CB, CR } from './lighting.js';
import { BG_CAVE, BG_SKY, SKY_ROWS, WALL, bgTile } from './terrain.js';

// f: how fast the layer moves with the camera; top, rise: its hilltops' layer row and how far above it they reach;
// scale: how wide its hills are, in pixels.
const HILLS = [
  { f: 0.3, top: 300, rise: 130, scale: 170, salt: 811, body: pack(hex('#6b92bd')), rim: pack(hex('#84a8cf')) },
  { f: 0.55, top: 350, rise: 90, scale: 96, salt: 823, body: pack(hex('#4b6f92')), rim: pack(hex('#6185a8')) },
];
const CAVE_F = 0.65, TEX = 512;
const tops = HILLS.map(() => new Int32Array(4096)), caveTex = new Uint32Array(TEX * TEX);
let texSeed = null, topsKey = '';
// Signed views of the same pixels: values with the top bit set stay plain integers this way, which keeps the per-pixel
// loop fast (as unsigned 32-bit values they'd be floating-point numbers to the engine).
const terrI = new Int32Array(terr.buffer), frameI = new Int32Array(frame.buffer), caveI = new Int32Array(caveTex.buffer);

// The cave-wall texture, tiled: the walls' own colours in 2 × 2 blocks, shaded by broad patches of darker rock.
function buildCaveTexture() {
  texSeed = S.seed;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const r = hash(x >> 1, (y >> 1) + 7000), c = WALL[r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3];
    const dark = vnoise(x / 40, y / 28, 5100) > 0.62 ? 0.82 : 1;
    caveTex[y * TEX + x] = dark === 1 ? c : pack([(c & 255) * dark, ((c >>> 8) & 255) * dark, ((c >>> 16) & 255) * dark].map(v => v | 0));
  }
}
// Each layer's hilltop row for every column of the view, in world pixels (only when the view has moved).
function hilltops(w) {
  for (let L = 0; L < HILLS.length; L++) {
    const h = HILLS[L], ox = VIEW.x * (1 - h.f), oy = Math.round(VIEW.y * (1 - h.f)), t = tops[L];
    for (let i = 0; i < w; i++) {
      const lx = VIEW.x + i - ox, n = vnoise(lx / h.scale, 0, h.salt) * 0.7 + vnoise(lx / (h.scale / 3), 3, h.salt + 1) * 0.3;
      t[i] = Math.round(h.top - h.rise * n) + oy;
    }
  }
}
function compose() {
  if (texSeed !== S.seed) buildCaveTexture();
  const w = VIEW.w, key = `${VIEW.x},${VIEW.y},${w},${S.seed}`;
  if (key !== topsKey) { topsKey = key; hilltops(w); }
  for (let y = VIEW.y; y < VIEW.y + VIEW.h; y++) { const row = y * PW + VIEW.x; frame.set(terr.subarray(row, row + w), row); }
  // then only the tiles where background shows: cave walls wherever they show, hills where the sky reaches down to them
  const far = tops[0], near = tops[1], fBody = HILLS[0].body | 0, fRim = HILLS[0].rim | 0, nBody = HILLS[1].body | 0, nRim = HILLS[1].rim | 0;
  const cx = Math.round(VIEW.x * (1 - CAVE_F)), cy = Math.round(VIEW.y * (1 - CAVE_F));
  const indoors = !!(S.level && !S.level.custom);
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx, f = bgTile[k];
    if (!f) continue;
    const x0 = Math.max(VIEW.x, tx * T), x1 = Math.min(VIEW.x + w, tx * T + T), y0 = Math.max(VIEW.y, ty * T), y1 = Math.min(VIEW.y + VIEW.h, ty * T + T);
    const c0 = ty * (W + 1) + tx;   // a cave wall in the dark can't be seen: leave it (the light is from the last frame)
    const lit = !S.lighting || Math.max(CR[c0], CR[c0 + 1], CR[c0 + W + 1], CR[c0 + W + 2], CB[c0], CB[c0 + W + 2]) > 0.08;
    if ((f & BG_CAVE) && lit) for (let y = y0; y < y1; y++) {
      const trow = ((y - cy) & (TEX - 1)) * TEX;
      for (let x = x0, p = y * PW + x0; x < x1; x++, p++) if ((terrI[p] >>> 24) === 1) frameI[p] = caveI[trow + ((x - cx) & (TEX - 1))];
    }
    if (!(f & BG_SKY) || liq[k] || y1 <= far[x0 - VIEW.x] - T || indoors) continue;   // no hills behind liquid, above the hilltops, or in a puzzle's room
    for (let y = y0; y < y1; y++) {
      const sky = SKY_ROWS[y] | 0;
      for (let x = x0, p = y * PW + x0; x < x1; x++, p++) {
        const i = x - VIEW.x;
        if (y < far[i] || frameI[p] !== sky) continue;
        frameI[p] = y >= near[i] ? (y === near[i] ? nRim : nBody) : y === far[i] ? fRim : fBody;
      }
    }
  }
}

export { HILLS, CAVE_F, TEX, buildCaveTexture, compose };
