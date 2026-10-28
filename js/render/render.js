// Composes each frame: terrain, bodies, liquids, particles, light and overlays.
import { EXPLORER_B, KINDS } from '../bodies.js';
import { blend, frame, terr } from '../canvas.js';
import { AMBIENT, CHUNK, H, PH, PW, T, W, WATER } from '../config.js';
import { brushEl, cursor, inBrush, tool } from '../input.js';
import { LIQ } from '../liquids.js';
import { parts, puff } from '../particles.js';
import { hash } from '../util.js';
import { CHH, CW, S, VIEW, awake, bodies, deco, dirty, dirtyList, fall, fire, liq, pumps, salign, solid, temp, typ, under } from '../world.js';
import { ambience, familyOf } from '../audio.js';
import { compose } from './backdrop.js';
import { seasonStep } from '../climate.js';
import { setShownSeason } from './terrain.js';
import { DIRT, LEAF, PLANT } from '../config.js';
import { present } from './camera.js';
import { drawDeviceLinks, drawDeviceOverlays, drawPipeFlow } from './devices.js';
import { applyLight, updateLight } from './lighting.js';
import { drawBody, drawStream, paletteAt } from './liquids.js';
import { drawSky } from './sky.js';
import { drawTile } from './terrain.js';












const dcol = new Int16Array(W);
let lastStats = { cells: 0, vol: 0 }, statFrame = 0;
function classifyFalling(k, x, y, t) {
  const g = LIQ[t].grav;
  if (!(g > 0 ? y < H - 1 : y > 0)) return;
  const nb = k + W * g;
  if (solid[nb] || !(liq[nb] === 0 || typ[nb] === t) || liq[nb] >= 250) return;
  fall[k] = 1;
  const pv = k - W * g, pvIn = g > 0 ? y > 0 : y < H - 1;
  if (pvIn && fall[pv] && typ[pv] === t) salign[k] = salign[pv];
  else if (x > 0 && liq[k - 1] && typ[k - 1] === t && !fall[k - 1]) salign[k] = 0;
  else if (x < W - 1 && liq[k + 1] && typ[k + 1] === t) salign[k] = 2;
  else salign[k] = 1;
}
// As the year turns, the leaves, plants and grass are redrawn in the season's colours (only those tiles).
let drawnSeason = -1;
function turnSeason() {
  const step = seasonStep();
  if (step === drawnSeason) return;
  const first = drawnSeason < 0;
  drawnSeason = step; setShownSeason(step);
  if (first || S.dirtyAll) return;   // the whole terrain is drawn anyway
  for (let k = W; k < W * H; k++) {
    const b = solid[k];
    if (b === LEAF || b === PLANT || (b === DIRT && !solid[k - W] && !under[k])) markTile(k);
  }
}
function markTile(k) { if (!dirty[k]) { dirty[k] = 1; dirtyList.push(k); } }
function render(time) {
  turnSeason();
  if (S.dirtyAll) {
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) drawTile(tx, ty);
    S.dirtyAll = false; dirty.fill(0); dirtyList.length = 0;
  } else if (dirtyList.length) {
    for (const k of dirtyList) { dirty[k] = 0; drawTile(k % W, (k / W) | 0); }
    dirtyList.length = 0;
  }
  compose();   // the terrain, with the scrolling background layers behind it

  // classify falling tiles; down-fallers top-down and up-fallers bottom-up so streams inherit their side
  let cells = 0, vol = 0;
  // streams take their side from the tile above (below for rising liquids), so start a little outside the view
  // and only the view's columns, plus the one left of it, whose falling decides which side a stream hugs
  const fy0 = Math.max(0, VIEW.ty0 - 16), fy1 = Math.min(H - 1, VIEW.ty1 + 16);
  const fx0 = Math.max(0, VIEW.tx0 - 1), fx1 = Math.min(W - 1, VIEW.tx1);
  fall.fill(0, fy0 * W, (fy1 + 1) * W);
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
    const k = y * W + x;
    if (liq[k] && LIQ[typ[k]].grav > 0) classifyFalling(k, x, y, typ[k]);
  }
  for (let y = fy1; y >= fy0; y--) for (let x = fx0; x <= fx1; x++) {
    const k = y * W + x;
    if (liq[k] && LIQ[typ[k]].grav < 0) classifyFalling(k, x, y, typ[k]);
  }
  if (!(statFrame++ & 7)) {   // the status line updates every 8 frames, so count the totals as often
    for (let k = 0; k < W * H; k++) if (liq[k]) { cells++; vol += liq[k]; }
    lastStats = { cells, vol };
  }

  drawBodies();   // before liquids, so the submerged part is tinted by them
  dcol.fill(0);
  for (let ty = Math.max(0, VIEW.ty0 - 8); ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {   // start a little above the view so depth shading is right
    const k = ty * W + tx, a = liq[k];
    if (!a) { dcol[tx] = 0; continue; }
    const t = typ[k], g = LIQ[t].grav;
    const pk = k - W * g, pIn = g > 0 ? ty > 0 : ty < H - 1;
    const prevSame = pIn && liq[pk] > 0 && typ[pk] === t;
    const pal = paletteAt(k, t);
    if (fall[k]) { drawStream(tx, ty, a, t, 0, T, salign[k], time, pal); dcol[tx] = 0; continue; }
    const prevFall = prevSame && fall[pk];
    if (prevSame && !prevFall) {
      if (g > 0) dcol[tx]++; else dcol[tx] = 0;
      drawBody(tx, ty, T, false, t, g > 0 ? dcol[tx] : 1, time, pal);
      continue;
    }
    const h = Math.max(1, Math.min(T, Math.round(a * T / 255)));
    if (prevFall) {
      const ppal = paletteAt(pk, t);
      if (g > 0) drawStream(tx, ty, liq[pk], t, 0, T - h, salign[pk], time, ppal);
      else drawStream(tx, ty, liq[pk], t, h, T, salign[pk], time, ppal);
    }
    dcol[tx] = 0;
    drawBody(tx, ty, h, true, t, 0, time, pal);
  }
  boil();

  if (S.sound) listen();
  drawPipeFlow();
  drawDeviceOverlays();
  drawHeat(false);
  for (const p of parts) if (!p.glow) drawParticle(p);
  if (S.lighting) { updateLight(); applyLight(); drawSky(time); }
  for (const p of parts) if (p.glow) drawParticle(p);
  drawMachines(time);
  drawDigging();
  drawDeviceLinks(time);
  drawFire(time);
  drawDeco();
  if (S.heatView) drawHeat(true);

  // brush outline
  if (cursor.x >= 0) {
    const r = +brushEl.value;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inBrush(dx, dy, r)) continue;
      const tx = cursor.x + dx, ty = cursor.y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const eU = !inBrush(dx, dy - 1, r), eD = !inBrush(dx, dy + 1, r), eL = !inBrush(dx - 1, dy, r), eR = !inBrush(dx + 1, dy, r);
      for (let i = 0; i < T; i++) {
        if (eU) blend((ty * T) * PW + tx * T + i, 255, 255, 255, 0.55);
        if (eD) blend((ty * T + 7) * PW + tx * T + i, 255, 255, 255, 0.55);
        if (eL) blend((ty * T + i) * PW + tx * T, 255, 255, 255, 0.55);
        if (eR) blend((ty * T + i) * PW + tx * T + 7, 255, 255, 255, 0.55);
      }
    }
  }
  if (S.level || (S.editing && S.draft && S.draft.region)) drawGoalRegion(time);
  if (S.showChunks) drawChunks();
  present();
}
// What the liquids in view sound like: how many tiles of each sound family, and one of their positions.
const heard = { lava: { n: 0, x: 0, y: 0 }, thick: { n: 0, x: 0, y: 0 }, acid: { n: 0, x: 0, y: 0 } };
function listen() {
  for (const v of Object.values(heard)) v.n = 0;
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx;
    if (!liq[k]) continue;
    const v = heard[familyOf(typ[k])];
    if (v && Math.random() < 1 / ++v.n) { v.x = tx * T + 4; v.y = ty * T + 4; }   // a random one of them
  }
  ambience(heard);
}
// Water at a boil in the view bubbles (a visual effect only: boiling itself is in js/heat.js).
function boil() {
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx;
    if (liq[k] > 64 && typ[k] === WATER && temp[k] > 90 && Math.random() < (temp[k] - 90) * 0.004) puff(k, 'bubble');
  }
}
// Hot rock glows red; the heat view colours every tile by temperature.
function drawHeat(view) {
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx, Tk = temp[k];
    let r, g, b, al;
    if (view) {
      if (Tk < AMBIENT - 2) { r = 70; g = 150; b = 255; al = 0.2 + Math.min(1, (AMBIENT - Tk) / 60) * 0.5; }
      else if (Tk > AMBIENT + 5) { const f = Math.min(1, (Tk - AMBIENT) / 900); r = 255; g = 235 - f * 200; b = 70 - f * 70; al = 0.2 + f * 0.55; }
      else continue;
    } else if (solid[k] && Tk > 350) { r = 255; g = 90; b = 30; al = Math.min(0.65, (Tk - 350) / 700); }
    else continue;
    for (let py = 0; py < T; py++) {
      const row = (ty * T + py) * PW + tx * T;
      for (let px = 0; px < T; px++) blend(row + px, r, g, b, al);
    }
  }
}
// Flames lick up from burning tiles; drawn after lighting because they are the light.
function drawFire(time) {
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx;
    if (!fire[k]) continue;
    const x0 = (k % W) * T, y0 = ((k / W) | 0) * T;
    const top = solid[k] ? 0 : T - Math.max(1, Math.round(liq[k] * T / 255));
    for (let px = 0; px < T; px++) {
      const tall = 2 + (((Math.sin(px * 1.7 + time * 9 + k) + 1) * 2.2) | 0);
      for (let i = 1; i <= tall; i++) { const f = i / tall; plot(x0 + px, y0 + top - i, 255, 210 - f * 130, 70 - f * 60, 0.85 - f * 0.5); }
      for (let py = top; py < T; py++) plot(x0 + px, y0 + py, 255, 120, 30, 0.25 + 0.15 * Math.sin(time * 12 + px + py));
    }
  }
}
// Glowcaps: tiny luminous mushrooms grown by bloomwater.
function drawDeco() {
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx;
    if (!deco[k]) continue;
    const x0 = (k % W) * T + (hash(k, 5) * 3 | 0), y0 = ((k / W) | 0) * T;
    plot(x0 + 3, y0 + 7, 230, 240, 235, 1); plot(x0 + 3, y0 + 6, 230, 240, 235, 1);
    for (let i = 1; i <= 5; i++) plot(x0 + i, y0 + 5, 94, 242, 224, 1);
    for (let i = 2; i <= 4; i++) plot(x0 + i, y0 + 4, 170, 255, 240, 1);
  }
}
// A puzzle's goal region: a dashed outline, green once the goal is met (blue in the level editor).
function drawGoalRegion(time) {
  const r = S.level ? S.level.region : S.draft.region, x0 = r.x0 * T, y0 = r.y0 * T, x1 = r.x1 * T + T - 1, y1 = r.y1 * T + T - 1, run = (time * 8) | 0;
  const [cr, cg, cb] = !S.level ? [127, 224, 255] : S.level.done ? [125, 236, 74] : [242, 201, 76];   // blue while it's being edited
  for (let x = x0; x <= x1; x++) if (((x + run) >> 2) & 1) { plot(x, y0, cr, cg, cb, 0.8); plot(x, y1, cr, cg, cb, 0.8); }
  for (let y = y0; y <= y1; y++) if (((y + run) >> 2) & 1) { plot(x0, y, cr, cg, cb, 0.8); plot(x1, y, cr, cg, cb, 0.8); }
}
// Debug view: outlines the chunks the liquid update is still running in.
function drawChunks() {
  for (let cy = 0; cy < CHH; cy++) for (let cx = 0; cx < CW; cx++) {
    if (!awake[cy * CW + cx]) continue;
    const x0 = cx * CHUNK * T, y0 = cy * CHUNK * T, s = CHUNK * T - 1;
    for (let i = 0; i <= s; i += 2) { plot(x0 + i, y0, 120, 255, 140, 0.8); plot(x0 + i, y0 + s, 120, 255, 140, 0.8); plot(x0, y0 + i, 120, 255, 140, 0.8); plot(x0 + s, y0 + i, 120, 255, 140, 0.8); }
  }
}
function drawBodies() {
  for (const b of bodies) {   // balloon ropes first, so the bodies sit on top of them
    if (!KINDS[b.kind].lift || b.tie == null) continue;
    const t = bodies.find(o => o.id === b.tie);
    if (!t) continue;
    const ax = b.x + b.w / 2, ay = b.y + b.h, bx = t.x + t.w / 2, by = t.y, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= n; i++) plot(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), 60, 48, 40, 0.9);
  }
  for (const b of bodies) {
    let spr = KINDS[b.kind].sprite;
    if (KINDS[b.kind].flap && !b.resting && ((S.tick >> 2) + b.id) & 1) spr = KINDS[b.kind].flap;
    if (b.kind === 'explorer' && b.walk > 0 && ((b.walk / 6) | 0) & 1) spr = EXPLORER_B;
    const bx = Math.round(b.x), by = Math.round(b.y), flip = b.face < 0;
    const hurt = b.ouch > 0 && (b.ouch >> 2) & 1, heat = Math.min(0.75, b.heat / 50);
    for (let sy = 0; sy < b.h; sy++) for (let sx = 0; sx < b.w; sx++) {
      const c = spr[sy * b.w + (flip ? b.w - 1 - sx : sx)];
      const x = bx + sx, y = by + sy;
      if (!c || x < 0 || y < 0 || x >= PW || y >= PH) continue;
      const p = y * PW + x;
      frame[p] = c;
      if (hurt) blend(p, 255, 70, 50, 0.55);
      else if (b.ward > 0 && ((S.tick + sx + sy) & 15) < 3) blend(p, 255, 240, 140, 0.6);
      else if (heat > 0) blend(p, 30, 14, 8, heat);
    }
  }
}
function lanternPos(b) { return { x: b.face > 0 ? Math.round(b.x) + 7 : Math.round(b.x) - 1, y: Math.round(b.y) + 6 }; }
function lanternTile(b) {
  const l = lanternPos(b);
  return Math.min(H - 1, Math.max(0, (l.y / T) | 0)) * W + Math.min(W - 1, Math.max(0, (l.x / T) | 0));
}
function plot(x, y, r, g, b, a) { if (x >= 0 && y >= 0 && x < PW && y < PH) blend(y * PW + x, r, g, b, a); }
// Drawn after lighting: wires, pump status lights, the pending inlet and the lantern.
// Cracks spread over the block the explorer is digging, as the digging nears done.
function drawDigging() {
  for (const b of bodies) {
    if (b.kind !== 'explorer' || !b.mining) continue;
    const k = b.mining.k, f = b.mining.done / b.mining.need, x0 = (k % W) * T, y0 = ((k / W) | 0) * T;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) if (hash(x0 + px, y0 + py) < f * 0.6) plot(x0 + px, y0 + py, 20, 16, 14, 0.75);
  }
}
function drawMachines(time) {
  const wireA = tool.pump ? 0.85 : 0.3;
  for (const pp of pumps) {
    const ax = (pp.in % W) * T + 4, ay = ((pp.in / W) | 0) * T + 4, bx = (pp.out % W) * T + 4, by = ((pp.out / W) | 0) * T + 4;
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), run = pp.on && pp.active ? (time * 24) | 0 : 0;
    for (let i = 0; i <= n; i++) {
      if (((i - run) % 6 + 6) % 6 >= 3) continue;
      plot(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), pp.on ? 235 : 130, pp.on ? 72 : 60, pp.on ? 72 : 60, wireA);
    }
    let c = [150, 40, 40];
    if (pp.on) { const L = LIQ[pp.shown]; c = pp.active && L ? [L.sr, L.sg, L.sb] : [90, 210, 120]; }
    for (const k of [pp.in, pp.out]) {
      const x = (k % W) * T, y = ((k / W) | 0) * T;
      plot(x + 5, y + 1, c[0], c[1], c[2], 1); plot(x + 6, y + 1, c[0], c[1], c[2], 1);
    }
  }
  if (S.pendingIn >= 0 && ((time * 3) | 0) & 1) {
    const x = (S.pendingIn % W) * T, y = ((S.pendingIn / W) | 0) * T;
    for (let i = 0; i < T; i++) { plot(x + i, y, 255, 220, 90, 1); plot(x + i, y + 7, 255, 220, 90, 1); plot(x, y + i, 255, 220, 90, 1); plot(x + 7, y + i, 255, 220, 90, 1); }
  }
  const ex = bodies.find(b => b.kind === 'explorer');
  if (ex) {
    const l = lanternPos(ex);
    plot(l.x, l.y - 1, 40, 34, 30, 1);
    plot(l.x, l.y, 255, 214, 120, 1);
    plot(l.x - 1, l.y, 255, 200, 110, 0.25); plot(l.x + 1, l.y, 255, 200, 110, 0.25); plot(l.x, l.y + 1, 255, 200, 110, 0.25);
  }
}
function drawParticle(p) {
  const x = p.x | 0, y = p.y | 0;
  if (x < 0 || y < 0 || x >= PW || y >= PH) return;
  blend(y * PW + x, p.c & 255, (p.c >>> 8) & 255, (p.c >>> 16) & 255, p.a * Math.min(1, p.life / 12));
}

export { dcol, lastStats, classifyFalling, render, drawHeat, drawFire, drawDeco, drawGoalRegion, drawChunks, drawBodies, lanternPos, lanternTile, plot, drawMachines, drawParticle };
