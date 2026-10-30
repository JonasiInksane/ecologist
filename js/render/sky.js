// Stars, the sun and moon, clouds and fog, rain and snow, and lightning, drawn after lighting into open sky only
// (never over terrain or liquid).
import { AH, AW, CELL, RAIN_AT, bolts, cellT, cloud, open, u } from '../air.js';
import { blend, frame } from '../canvas.js';
import { PH, PW, T, W } from '../config.js';
import { dayPhase, sunHeight } from '../daynight.js';
import { hash, vnoise } from '../util.js';
import { S, VIEW, liq, solid, under } from '../world.js';





const STARS = [];
function openSky(x, y) {
  if (x < 0 || y < 0 || x >= PW || y >= PH) return false;
  const k = ((y / T) | 0) * W + ((x / T) | 0);
  return !under[k] && !solid[k] && !liq[k];
}
function drawSky(time) {
  // a sparse, steady starfield that twinkles only slightly, so the night sky stays calm
  if (!STARS.length) for (let i = 0; i < 220; i++) STARS.push([hash(i, 31) * PW | 0, hash(i, 47) * PH * 0.4 | 0, hash(i, 59) * 6.28]);
  const h = sunHeight(), night = Math.max(0, Math.min(1, (0.1 - h) / 0.35));
  if (night > 0) {
    for (const [x, y, ph] of STARS) {
      if (x < VIEW.x || y < VIEW.y || x >= VIEW.x + VIEW.w || y >= VIEW.y + VIEW.h || !openSky(x, y)) continue;
      blend(y * PW + x, 235, 240, 255, night * (0.6 + 0.12 * Math.sin(time * 0.8 + ph)));
    }
  }
  drawClouds(time);
  drawPrecipitation(time);
  drawLightning();
  // the sun and moon cross the view from left to right; the moon is the sun's opposite
  const ph = dayPhase(), sunUp = h > -0.2;
  const along = sunUp ? (ph - 0.25) * 2 : ((ph + 0.5) % 1 - 0.25) * 2;
  const lift = sunUp ? Math.max(0, h) : Math.max(0, -h);
  const cx = Math.round(VIEW.x + VIEW.w * (0.08 + 0.84 * along)), cy = Math.round(VIEW.y + VIEW.h * (0.42 - 0.32 * lift));
  const rad = 7;
  for (let dy = -rad - 3; dy <= rad + 3; dy++) for (let dx = -rad - 3; dx <= rad + 3; dx++) {
    const x = cx + dx, y = cy + dy, d = Math.sqrt(dx * dx + dy * dy);
    if (!openSky(x, y)) continue;
    const p = y * PW + x;
    if (sunUp) {
      if (d <= rad) blend(p, 255, 236, 160, 1);
      else if (d <= rad + 3) blend(p, 255, 220, 140, 0.25 * (rad + 3 - d) / 3);
    } else if (d <= rad - 1) {
      const crater = (dx - 2) ** 2 + (dy + 1) ** 2 < 4 || (dx + 3) ** 2 + (dy - 2) ** 2 < 2;
      blend(p, crater ? 190 : 225, crater ? 196 : 230, crater ? 210 : 240, night);
    }
  }
}

// Visual spacing in world pixels; speeds in pixels per animation second. The camera only clips these streams.
const PRECIP_VISUAL = { spacing: 64, densityRange: 200, rainSpeed: 260, rainVariation: 80,
  snowSpeed: 40, snowVariation: 20, snowSway: 2, snowFrequency: 2, windOffset: 6,
  rainLength: 4, rainSlant: 0.4, rainWind: 0.8, margin: CELL * T };
function precipitationSky(x, y, sourceY, endY) {
  return y >= sourceY && y < endY && x >= VIEW.x && x < VIEW.x + VIEW.w &&
    y >= VIEW.y && y < VIEW.y + VIEW.h && openSky(x, y);
}
// Each raining cell supplies a world-anchored stream from the same underside as physical precipitation.
// A lower raining cell supplies its own stream, with its own temperature and wind.
function drawPrecipitation(time) {
  if (!S.weather) return;
  const cs = CELL * T, idsPerCell = Math.ceil(PH / PRECIP_VISUAL.spacing);
  const cx0 = Math.max(0, Math.floor((VIEW.x - PRECIP_VISUAL.margin) / cs));
  const cx1 = Math.min(AW - 1, Math.floor((VIEW.x + VIEW.w + PRECIP_VISUAL.margin) / cs));
  for (let cx = cx0; cx <= cx1; cx++) {
    let endY = PH;
    for (let cy = AH - 1; cy >= 0; cy--) {
      const c = cy * AW + cx;
      if (cloud[c] <= RAIN_AT) continue;
      const sourceY = (cy * CELL + CELL - 1) * T, bottom = endY;
      endY = sourceY;
      if (sourceY >= VIEW.y + VIEW.h || bottom <= VIEW.y) continue;
      const span = bottom - sourceY, count = Math.ceil(span / PRECIP_VISUAL.spacing);
      const r = Math.min(1, (cloud[c] - RAIN_AT) / PRECIP_VISUAL.densityRange), snow = cellT[c] < 0, w = u[c];
      for (let i = 0; i < count; i++) {
        const id = c * idsPerCell + i;
        if (hash(id, 83) > r) continue;
        const x0 = cx * cs + hash(id, 71) * cs;
        if (!openSky(x0 | 0, sourceY)) continue;
        const fall = snow ? PRECIP_VISUAL.snowSpeed + hash(id, 79) * PRECIP_VISUAL.snowVariation :
          PRECIP_VISUAL.rainSpeed + hash(id, 79) * PRECIP_VISUAL.rainVariation;
        const y0 = sourceY + ((hash(id, 73) * span + time * fall) % span);
        if (snow) {
          const x = Math.floor(x0 + Math.sin(time * PRECIP_VISUAL.snowFrequency + id) * PRECIP_VISUAL.snowSway + w * PRECIP_VISUAL.windOffset), y = Math.floor(y0);
          if (precipitationSky(x, y, sourceY, bottom)) blend(y * PW + x, 245, 248, 255, 0.8);
          if (precipitationSky(x + 1, y, sourceY, bottom)) blend(y * PW + x + 1, 245, 248, 255, 0.5);
        } else for (let j = 0; j < PRECIP_VISUAL.rainLength; j++) {
          const x = Math.floor(x0 - j * (PRECIP_VISUAL.rainSlant - w * PRECIP_VISUAL.rainWind)), y = Math.floor(y0) - j;
          if (precipitationSky(x, y, sourceY, bottom)) blend(y * PW + x, 190, 210, 235, 0.35);
        }
      }
    }
  }
}
// Cloud density at pixel (px, py), smoothly interpolated between air cells, with a slow wobble at the edges.
function cloudCellAt(cx, cy) { return cy < 0 || cy >= AH ? 0 : cloud[cy * AW + ((cx % AW) + AW) % AW]; }
function cloudBaseAt(px, py) {
  const gx = px / (CELL * T) - 0.5, gy = py / (CELL * T) - 0.5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const d = cloudCellAt(ix, iy) * (1 - fx) * (1 - fy) + cloudCellAt(ix + 1, iy) * fx * (1 - fy) + cloudCellAt(ix, iy + 1) * (1 - fx) * fy + cloudCellAt(ix + 1, iy + 1) * fx * fy;
  return d / 255;
}
const CLOUD_WOBBLE = 0.3, CLOUD_EDGE = CLOUD_WOBBLE / 2 + 1e-12;
function cloudAt(px, py, time) {
  return cloudBaseAt(px, py) + (vnoise(px / 22 + time * 0.03, py / 14, 7) - 0.5) * CLOUD_WOBBLE;
}
// Fixed pixel-to-air-cell geometry. Keep fractions in Float64 and the original arithmetic
// order below; cloud values themselves are read live for every frame.
const CLOUD_LEFT = new Uint16Array(PW), CLOUD_RIGHT = new Uint16Array(PW);
const CLOUD_FX = new Float64Array(PW), CLOUD_ONE_MINUS_FX = new Float64Array(PW);
const CLOUD_EMPTY_ROW = new Float32Array(AW);
for (let px = 0; px < PW; px++) {
  const gx = px / (CELL * T) - 0.5, ix = Math.floor(gx), fx = gx - ix;
  CLOUD_LEFT[px] = ((ix % AW) + AW) % AW; CLOUD_RIGHT[px] = (((ix + 1) % AW) + AW) % AW;
  CLOUD_FX[px] = fx; CLOUD_ONE_MINUS_FX[px] = 1 - fx;
}
// Clouds as flat shapes in three tones: a pale fringe, a white body and a dark grey storm core, dimmed at night. Low
// cloud lying on the ground is drawn as thin fog.
function drawClouds(time) {
  const h = sunHeight(), day = Math.max(0.3, Math.min(1, (h + 0.25) / 0.5)), cs = CELL * T;
  const viewX0 = Math.ceil(VIEW.x), viewY0 = Math.ceil(VIEW.y);
  const cx0 = Math.max(0, (VIEW.x / cs | 0) - 1), cx1 = Math.min(AW - 1, ((VIEW.x + VIEW.w) / cs | 0) + 1);
  const cy0 = Math.max(0, (VIEW.y / cs | 0) - 1), cy1 = Math.min(AH - 1, ((VIEW.y + VIEW.h) / cs | 0) + 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const y = cy + dy, x = cx + dx;
      if (y >= 0 && y < AH && x >= 0 && x < AW) near = Math.max(near, cloud[y * AW + x]);
    }
    if (near < 40) continue;
    const fog = cy + 1 < AH && open[(cy + 1) * AW + cx] < 0.5;
    // Terrain and liquid occupancy are constant across each tile. Clip and test them once,
    // rather than repeating the same sky lookup and view bounds for every covered pixel.
    for (let ty = cy * CELL; ty < (cy + 1) * CELL; ty++) for (let tx = cx * CELL; tx < (cx + 1) * CELL; tx++) {
      const k = ty * W + tx;
      if (under[k] || solid[k] || liq[k]) continue;
      const x0 = Math.max(tx * T, viewX0), x1 = Math.min((tx + 1) * T, VIEW.x + VIEW.w);
      const y0 = Math.max(ty * T, viewY0), y1 = Math.min((ty + 1) * T, VIEW.y + VIEW.h);
      for (let py = y0; py < y1; py++) {
        const gy = py / cs - 0.5, iy = Math.floor(gy), fy = gy - iy, oneMinusFy = 1 - fy;
        const top = iy < 0 ? CLOUD_EMPTY_ROW : cloud, topRow = iy < 0 ? 0 : iy * AW;
        const bottom = iy + 1 >= AH ? CLOUD_EMPTY_ROW : cloud, bottomRow = iy + 1 >= AH ? 0 : (iy + 1) * AW;
        for (let px = x0; px < x1; px++) {
          const left = CLOUD_LEFT[px], right = CLOUD_RIGHT[px], fx = CLOUD_FX[px], oneMinusFx = CLOUD_ONE_MINUS_FX[px];
          const base = (top[topRow + left] * oneMinusFx * oneMinusFy + top[topRow + right] * fx * oneMinusFy
            + bottom[bottomRow + left] * oneMinusFx * fy + bottom[bottomRow + right] * fx * fy) / 255;
          // Noise only matters near a palette boundary. Else its bounded wobble cannot change the pixel's tone.
          const edge = Math.abs(base - 0.25) <= CLOUD_EDGE || Math.abs(base - 0.6) <= CLOUD_EDGE || (!fog && Math.abs(base - 1.6) <= CLOUD_EDGE);
          const d = edge ? base + (vnoise(px / 22 + time * 0.03, py / 14, 7) - 0.5) * CLOUD_WOBBLE : base;
          if (d < 0.25) continue;
          if (fog) { blend(py * PW + px, 222 * day, 228 * day, 236 * day, d > 0.6 ? 0.5 : 0.3); continue; }
          if (d > 1.6) blend(py * PW + px, 118 * day, 124 * day, 138 * day, 0.93);
          else if (d > 0.6) blend(py * PW + px, 238 * day, 242 * day, 248 * day, 0.9);
          else blend(py * PW + px, 208 * day, 215 * day, 226 * day, 0.62);
        }
      }
    }
  }
}
// Lightning: a jagged white bolt for a few frames, and a flash over the view when it strikes.
const LIGHTNING_BLEND = new Uint32Array(256);
function drawLightning() {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    let x = b.x;
    for (let y = b.y0; y < b.y1; y++) {
      if (y % 6 === 0) x = b.x + (hash(y, b.seed | 0) - 0.5) * 10;
      if (y >= VIEW.y && y < VIEW.y + VIEW.h && x >= VIEW.x && x < VIEW.x + VIEW.w - 1) {
        blend(y * PW + (x | 0), 255, 255, 255, 1);
        blend(y * PW + (x | 0) + 1, 200, 220, 255, 0.6);
      }
    }
    if (--b.life <= 0) bolts.splice(i, 1);
  }
  if (S.flash > 0) {
    const a = 0.05 * S.flash--;
    for (let c = 0; c < 256; c++) LIGHTNING_BLEND[c] = c + (255 - c) * a;
    for (let y = VIEW.y; y < VIEW.y + VIEW.h; y++) for (let x = VIEW.x; x < VIEW.x + VIEW.w; x++) {
      const p = y * PW + x, c = frame[p];
      frame[p] = (0xff000000 | (LIGHTNING_BLEND[(c >>> 16) & 255] << 16) | (LIGHTNING_BLEND[(c >>> 8) & 255] << 8) | LIGHTNING_BLEND[c & 255]) >>> 0;
    }
  }
}

export { STARS, openSky, drawSky, drawPrecipitation, cloudAt, drawClouds, drawLightning };
