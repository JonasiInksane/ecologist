// Drawing resting liquid bodies and falling streams.
// r0..r1 are tile-local rows; streams flow in the liquid's gravity direction
import { blend, frame } from '../canvas.js';
import { sunHeight } from '../daynight.js';
import { ACID, AETHER, BLOOM, FOAM, FROST, H, LAVA, OIL, PW, QUICK, SLIME, T, TONIC, W } from '../config.js';
import { LIQ } from '../liquids.js';
import { DRAIN_REACH, whirlpools } from '../momentum.js';
import { charged } from '../power.js';
import { solTint } from '../solutes.js';
import { hash } from '../util.js';
import { S, liq, solid, under, vel } from '../world.js';
import { COOLANT, FERT, LIGHT, LYE, MIMIC, NITRO, STORM, WATER } from '../config.js';












// A liquid's palette shifted towards the colour of what's dissolved in tile k. Cached by liquid and quantized tint.
const tintCache = new Map();
function paletteAt(k, t) {
  const c = solTint(k);
  if (!c) return LIQ[t];
  const q = [c[0] >> 4, c[1] >> 4, c[2] >> 4, Math.round(c[3] * 15)];
  const key = ((t * 16 + q[0]) * 16 + q[1]) * 16 * 16 + q[2] * 16 + q[3];
  let C = tintCache.get(key);
  if (!C) {
    const L = LIQ[t], s = q[3] / 15, r = q[0] * 16 + 8, g = q[1] * 16 + 8, b = q[2] * 16 + 8;
    const mix = (from, to) => from + (to - from) * s;
    C = Object.assign({}, L, {
      sr: mix(L.sr, Math.min(255, r * 0.6 + 110)), sg: mix(L.sg, Math.min(255, g * 0.6 + 110)), sb: mix(L.sb, Math.min(255, b * 0.6 + 110)),
      br: mix(L.br, r * 0.85), bg: mix(L.bg, g * 0.85), bb: mix(L.bb, b * 0.85),
      dr: mix(L.dr, r * 0.45), dg: mix(L.dg, g * 0.45), db: mix(L.db, b * 0.45),
      ba: mix(L.ba, 0.85), da: mix(L.da, 0.92),
    });
    tintCache.set(key, C);
  }
  return C;
}
// The whirlpool whose reach covers tile (tx, ty), if any.
function nearWhirlpool(tx, ty) {
  const px = tx * T + 4, py = ty * T + 4, reach = DRAIN_REACH * T + T;
  for (const w of whirlpools) if (Math.abs(px - w.x) < reach && Math.abs(py - w.y) < reach) return w;
  return null;
}
function drawStream(tx, ty, a, t, r0, r1, align, time, pal) {
  const C = pal || LIQ[t];
  const w = Math.max(2, Math.min(8, Math.round(a * 8 / 255) + 1));
  const x0 = tx * T + (align === 0 ? 0 : align === 2 ? T - w : (T - w) >> 1);
  const off = (time * 48 * C.flow * C.grav) | 0;
  for (let py = r0; py < r1; py++) {
    const wy = ty * T + py, row = wy * PW;
    for (let i = 0; i < w; i++) {
      const streak = (((wy - off + i * 3) % 7) + 7) % 7 === 0;
      if (streak || (i === 0 && w > 2)) blend(row + x0 + i, C.sr, C.sg, C.sb, C.sa);
      else if (i === w - 1 && w > 2) blend(row + x0 + i, C.dr, C.dg, C.db, C.da);
      else blend(row + x0 + i, C.br, C.bg, C.bb, Math.min(1, C.ba + 0.12));
    }
  }
}
// Clear liquids show a reflection at their surface and, in sunlit shallows, moving light (caustics) on the bottom.
const CLEAR = new Set([WATER, STORM, TONIC, BLOOM, ACID, FROST, AETHER, COOLANT, LIGHT, LYE, FERT, MIMIC, NITRO]);
const REFLECT_ROWS = 6, REFLECT = 0.3, CAUSTIC_DEPTH = 8;
// Mirrors what's just above the water into its surface tile: pixel (wx, wy) is d rows under the surface line sy.
function reflect(p, wx, wy, sy, time) {
  const d = wy - sy;
  if (d < 2 || d >= REFLECT_ROWS + 2) return;
  const rx = wx + Math.round(Math.sin(wy * 0.9 + time * 3) * 1.2), ry = sy - 1 - (d - 2);
  if (ry < 0 || rx < 0 || rx >= PW) return;
  const c = frame[ry * PW + rx];
  blend(p, c & 255, (c >>> 8) & 255, (c >>> 16) & 255, REFLECT * (1 - (d - 2) / REFLECT_ROWS));
}
// Bright, shifting bands on the bottom of sunlit water, fading with depth.
function caustic(p, wx, time, strength) {
  const v = Math.sin(wx * 0.35 + time * 1.7 + Math.sin(wx * 0.11 - time * 0.9) * 2) + Math.sin(wx * 0.23 - time * 1.3);
  if (v > 0.9) blend(p, 255, 255, 235, strength * Math.min(1, (v - 0.9) / 0.6));
}
// Draws h rows measured from the tile's floor (its ceiling for up-falling liquids).
function drawBody(tx, ty, h, surface, t, depth, time, pal) {
  const C = pal || LIQ[t], k = ty * W + tx, g = C.grav, live = charged(k), zt = (time * 14) | 0;
  // the palette, read once per tile: the palettes have different shapes, so reading them per pixel is slow
  const { sr, sg, sb, sa, br, bg, bb, ba, dr, dg, db, da, flow, gas } = C;
  const cap = S.momentum && Math.abs(vel[k]) > 0.5, swirl = S.momentum ? nearWhirlpool(tx, ty) : null;
  const beyond = k - W * g, beyondIn = g > 0 ? ty > 0 : ty < H - 1;
  const canRise = beyondIn && !solid[beyond] && !liq[beyond];
  const clear = g > 0 && CLEAR.has(t) && !under[k], mirror = clear && surface && h >= 4;
  const sun = Math.max(0, Math.min(1, sunHeight() * 2)), bottom = ty < H - 1 && solid[k + W] && depth < CAUSTIC_DEPTH;
  const glow = clear && bottom && sun > 0 ? 0.55 * sun * (1 - depth / CAUSTIC_DEPTH) : 0;
  for (let px = 0; px < T; px++) {
    const wx = tx * T + px;
    let top = T - h;
    if (surface && h >= 2) {
      const wv = Math.sin(wx * 0.45 + time * 2.4 * flow) + 0.6 * Math.sin(wx * 0.13 - time * 1.3 * flow + ty);
      if (wv > 1.05 && (h < 8 || canRise)) top -= 1; else if (wv < -1.1) top += 1;
    }
    for (let ly = top; ly < T; ly++) {
      const wy = g > 0 ? ty * T + ly : ty * T + (T - 1 - ly);
      const p = wy * PW + wx, d = ly - top;
      if (surface && d === 0 && t === OIL) {   // oil's rainbow sheen
        const hh = wx * 0.15 + time * 0.6;
        blend(p, 128 + 110 * Math.sin(hh), 128 + 110 * Math.sin(hh + 2.1), 128 + 110 * Math.sin(hh + 4.2), 0.7); continue;
      }
      if (surface && d === 0) { blend(p, sr, sg, sb, sa); if (cap && hash(wx >> 1, (time * 2) | 0) > 0.55) blend(p, 255, 255, 255, 0.45); continue; }   // soft whitecaps
      if (surface && d === 1) { blend(p, (sr + br) >> 1, (sg + bg) >> 1, (sb + bb) >> 1, (sa + ba) / 2); continue; }
      const f = Math.min(1, (depth * T + ly) / 56);
      let r = br + (dr - br) * f, gg = bg + (dg - bg) * f, b = bb + (db - bb) * f;
      let al = ba + (da - ba) * f;
      // gases: soft, slow, large patches of thicker and thinner, with no ripple lines
      if (gas) al *= 0.8 + 0.2 * Math.sin(wx * 0.06 + time * 0.5 * flow + Math.sin(wy * 0.08 + time * 0.3) * 1.5);
      let s = 0;
      if (gas) s = 0;
      else if (t === LAVA) {
        s = (Math.sin(wx * 0.23 + time * 0.9 + Math.sin(wy * 0.31 - time * 0.6) * 2.5) * Math.sin(wy * 0.27 + time * 0.5 + Math.sin(wx * 0.17 + time * 0.8) * 2) - 0.4) * 2.2;
      } else if (t === QUICK) {
        // mirror bands that slide slowly, like a reflection
        const m = Math.sin(wx * 0.11 + wy * 0.05 + time * 0.5) + 0.5 * Math.sin(wx * 0.37 - time * 0.9);
        s = m > 0.9 ? 0.75 : m < -0.9 ? -0.35 : 0;
      } else if (t === ACID || t === SLIME) {
        const hb = hash(wx, 999);
        if (hb > 0.8) {
          const per = 10 + ((hb * 40) | 0), pos = ((wy + time * 18 * (0.5 + hb)) % per + per) % per;
          if (pos < 1) s = 0.95;
        }
      } else if (t === FOAM) {
        // bubbles that slowly pop and re-form
        const hb = hash(wx, wy + ((time * 1.5 + hash(wx, wy) * 4) | 0) * 57);
        s = hb > 0.82 ? 0.9 : hb < 0.08 ? -0.5 : 0;
        if (s < 0) { r += (dr - r) * 0.5; gg += (dg - gg) * 0.5; b += (db - b) * 0.5; s = 0; }
      } else if (t === AETHER || t === BLOOM || t === TONIC) {
        const hs = hash(wx, wy + 31);
        if (hs > 0.975) s = Math.sin(time * 3 + hs * 400) * 0.9;
        else if (((wy + (wx >> 3)) & 3) === 0) s = (Math.sin(wx * 0.17 + time * 0.9) - 0.85) * 2.5;
      } else if (t === FROST) {
        if (hash(wx, wy + ((time * 5) | 0) * 131) > 0.988) s = 1;
        else if (((wy + (wx >> 3)) & 3) === 0) s = (Math.sin(wx * 0.17 + Math.sin(wy * 0.5) * 2 + time * 0.6) - 0.8) * 2.5;
      } else if (((wy + (wx >> 3)) & 3) === 0) {
        s = (Math.sin(wx * 0.17 + Math.sin(wy * 0.5 + time * 0.8 * flow) * 2 + time * 1.4 * flow) - 0.8) * 2.5;
      }
      if (live && hash(wx + zt * 7, (wy >> 1) + zt * 13) > 0.94) s = 1;   // live liquid crackles
      if (swirl) { const dx = wx - swirl.x, dy = wy - swirl.y, r = Math.hypot(dx, dy); if (r < DRAIN_REACH * T && Math.sin(Math.atan2(dy, dx) * 2 + r * 0.35 - time * 5) > 0.88) s = Math.max(s, 0.6 * (1 - r / (DRAIN_REACH * T))); }
      if (s > 0) { s = Math.min(0.95, s); r += (sr - r) * s; gg += (sg - gg) * s; b += (sb - b) * s; }
      else if (s < 0 && t === QUICK) { r += (dr - r) * -s; gg += (dg - gg) * -s; b += (db - b) * -s; }
      blend(p, r, gg, b, al);
      if (mirror) reflect(p, wx, wy, ty * T + top, time);
      if (glow && ly >= T - 3) caustic(p, wx, time, glow * (ly - T + 4) / 3);   // strongest on the floor
    }
  }
}

export { CLEAR, REFLECT_ROWS, REFLECT, CAUSTIC_DEPTH, reflect, caustic, tintCache, paletteAt, nearWhirlpool, drawStream, drawBody };
