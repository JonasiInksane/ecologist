// Stars, the sun and moon, clouds and fog, rain and snow, and lightning, drawn after lighting into open sky only
// (never over terrain or liquid).
import { AH, AW, CELL, bolts, cellT, cloud, open, rainAt, u } from '../air.js';
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

// Rain under raining clouds: thin streaks slanted by the wind; where the air is below 0° it falls as slow snowflakes.
function drawPrecipitation(time) {
  if (S.rain <= 0) return;
  for (let i = 0; i < 260; i++) {
    const x0 = VIEW.x + ((hash(i, 71) * VIEW.w + time * 40) % VIEW.w), tx = Math.min(W - 1, (x0 / T) | 0), r = rainAt(tx);
    if (r <= 0 || hash(i, 83) > r) continue;
    const c = (x0 / (CELL * T)) | 0, snow = cellT[c + AW * Math.min(AH - 1, ((VIEW.y + VIEW.h / 2) / (CELL * T)) | 0)] < 0;
    const fall = snow ? 40 + hash(i, 79) * 20 : 260 + hash(i, 79) * 80, w = u[c] || 0;
    const y0 = VIEW.y + ((hash(i, 73) * VIEW.h + time * fall) % VIEW.h);
    if (snow) {
      const x = (x0 + Math.sin(time * 2 + i) * 2 + w * 6) | 0, y = y0 | 0;
      if (openSky(x, y)) { blend(y * PW + x, 245, 248, 255, 0.8); if (openSky(x + 1, y)) blend(y * PW + x + 1, 245, 248, 255, 0.5); }
    } else for (let j = 0; j < 4; j++) {
      const x = (x0 - j * (0.4 - w * 0.8)) | 0, y = (y0 - j) | 0;
      if (openSky(x, y)) blend(y * PW + x, 190, 210, 235, 0.35);
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
// Clouds as flat shapes in three tones: a pale fringe, a white body and a dark grey storm core, dimmed at night. Low
// cloud lying on the ground is drawn as thin fog.
function drawClouds(time) {
  const h = sunHeight(), day = Math.max(0.3, Math.min(1, (h + 0.25) / 0.5)), cs = CELL * T;
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
    for (let py = cy * cs; py < cy * cs + cs; py++) {
      if (py < VIEW.y || py >= VIEW.y + VIEW.h) continue;
      for (let px = cx * cs; px < cx * cs + cs; px++) {
        if (px < VIEW.x || px >= VIEW.x + VIEW.w || !openSky(px, py)) continue;
        const base = cloudBaseAt(px, py);
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
