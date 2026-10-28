// Device sprites, pipes, open floodgates, levers, spinning generators, switch wires and status lights.
import { frame } from '../canvas.js';
import { AND, BOILER, COUNTER, DRAIN, FILTER, GATE, GEYSER, H, LEVER, NOT, OR, PIPE, PLATE, PW, SENSOR, SEPARATOR, SPRING, T, TIMER, TURBINE, VALVE, VENT, W, WHEEL, WINDMILL } from '../config.js';
import { tool } from '../input.js';
import { LIQ } from '../liquids.js';
import { isPipe, pipeLinks, pipeShow, pipeTick } from '../pipes.js';
import { hex, pack } from '../util.js';
import { S, VIEW, devices, solid } from '../world.js';
import { plot } from './render.js';
import { MET } from './terrain.js';
import { MEMBRANE } from '../config.js';
import { BATTERY, EMAGNET, LAMP, MOTOR, SOLAR } from '../config.js';
import { DEPTH, PIXEL, THERMO } from '../config.js';
import { BATTERY_CAP, PIXEL_COLOURS } from '../devices.js';










const DEV = {
  red: pack(hex('#d64545')), green: pack(hex('#5ad27a')), glass: pack(hex('#7fe0ff')), glassD: pack(hex('#2f7d99')),
  face: pack(hex('#e9e2c4')), bar: pack(hex('#232833')), grille: pack(hex('#c85a1e')), lit: pack(hex('#f2c94c')),
  cell: pack(hex('#3a6a3e')), cellLit: pack(hex('#7ae08a')), lamp: pack(hex('#fff2b0')), lampOff: pack(hex('#8a8470')),
  coil: pack(hex('#c87a46')), panel: pack(hex('#1e3a6e')), panelHl: pack(hex('#4a78c0')),
  seam: pack(hex('#141820')), pixelOff: pack(hex('#262c38')),
  wood: pack(hex('#8a5a2e')), woodD: pack(hex('#5a3a1c')), sail: pack(hex('#efe8d8')), rock: pack(hex('#5e5456')), sulfur: pack(hex('#d8d040')),
};
// Each pixel colour as a lit face and a brighter top-left edge.
const PIXEL_PACKED = PIXEL_COLOURS.map(c => { const v = hex(c); return { body: pack(v), hl: pack(v.map(x => Math.min(255, x + 40))) }; });
const DEVICE_BLOCKS = new Set([THERMO, DEPTH, PIXEL, BATTERY, LAMP, MOTOR, EMAGNET, SOLAR, MEMBRANE, LEVER, PLATE, SENSOR, TIMER, GATE, SPRING, DRAIN, PIPE, VALVE, FILTER, TURBINE, WHEEL, BOILER, SEPARATOR, AND, OR, NOT, COUNTER, WINDMILL, GEYSER, VENT]);
function isDeviceBlock(b) { return DEVICE_BLOCKS.has(b); }
// 4 × 4 glyphs for the logic blocks, one string per row.
const GLYPH = {
  [AND]: ['.##.', '#..#', '####', '#..#'],
  [OR]: ['.##.', '#..#', '#..#', '.##.'],
  [NOT]: ['#..#', '##.#', '#.##', '#..#'],
  [COUNTER]: ['.###', '#...', '#...', '.###'],
};
function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}
// Pixel (px, py) of a pipe tile: a tube from the middle towards each joining pipe, and an open end towards open tiles
// when this is the end of a run. Valves show a handle (green open, red shut); filters show their liquid.
function pipePixel(b, px, py, d, tx, ty) {
  const k = ty * W + tx, end = pipeLinks(tx, ty) <= 1;
  const joins = dir => {
    const x = tx + (dir === 1 ? -1 : dir === 2 ? 1 : 0), y = ty + (dir === 0 ? -1 : dir === 3 ? 1 : 0);
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const o = y * W + x;
    return isPipe(solid[o]) ? 1 : end && !solid[o] ? 2 : 0;
  };
  const inX = px >= 2 && px <= 5, inY = py >= 2 && py <= 5;
  let arm = 0, across = 0;
  if (inX && py < 2) { arm = joins(0); across = px; }
  else if (inX && py > 5) { arm = joins(3); across = px; }
  else if (inY && px < 2) { arm = joins(1); across = py; }
  else if (inY && px > 5) { arm = joins(2); across = py; }
  else if (inX && inY) {
    if (b === VALVE && (px === 3 || px === 4 || py === 3 || py === 4) && (px > 2 && px < 5 || py > 2 && py < 5)) return d && d.open ? DEV.green : DEV.red;
    if (b === FILTER && px >= 3 && px <= 4 && py >= 3 && py <= 4) { const L = LIQ[d ? d.liquid : 1]; return pack([L.br, L.bg, L.bb]); }
    if (b === FILTER && (px + py) % 2) return MET.slot;
    return px === 2 || px === 5 || py === 2 || py === 5 ? MET.out : px === 3 || py === 3 ? MET.hl : MET.body;
  } else return 0;
  if (!arm) return 0;
  const rim = arm === 2 && (py === 0 || py === 7 || px === 0 || px === 7);
  if (across === 2 || across === 5) return MET.out;
  if (rim) return MET.slot;
  return across === 3 ? MET.hl : MET.body;
}
// Pixel (px, py) of a device tile; 0 means see-through.
function devicePixel(b, px, py, d, tx, ty) {
  if (b === PIPE || b === VALVE || b === FILTER) return pipePixel(b, px, py, d, tx, ty);
  const cx = px + 0.5, cy = py + 0.5;
  if (b === LEVER) {
    if (py >= 6) return py === 7 || px === 1 || px === 6 ? MET.out : px > 1 && px < 6 ? MET.body : 0;
    const tx = d && d.on ? 6.5 : 1.5;
    if ((cx - tx) ** 2 + (cy - 1.5) ** 2 < 1.4) return DEV.red;
    return distToSeg(cx, cy, 4, 6, tx, 1.5) < 0.6 ? MET.hl : 0;
  }
  if (b === SOLAR) {   // a thin dark-blue panel on a short stand
    if (py >= 4) return px >= 3 && px <= 4 ? MET.body : py === 7 && px >= 2 && px <= 5 ? MET.out : 0;
    if (py === 0) return 0;
    return px === 0 || px === 7 || py === 3 ? MET.out : (px + py) % 3 === 0 ? DEV.panelHl : DEV.panel;
  }
  if (b === LAMP) {   // a glass bulb on a metal cap
    if (py >= 5) return px >= 2 && px <= 5 ? (py === 7 ? MET.out : MET.body) : 0;
    const r2 = (px + 0.5 - 4) ** 2 + (py + 0.5 - 2.8) ** 2;
    return r2 < 6.5 ? (d && d.active ? DEV.lamp : DEV.lampOff) : 0;
  }
  if (b === PIXEL) {   // a square of light, with a dark seam so a row of pixels reads as a display
    if (px === 7 || py === 7) return DEV.seam;
    if (!d || !d.active) return (px + py) % 4 ? DEV.pixelOff : DEV.seam;
    const c = PIXEL_PACKED[d.colour || 0];
    return px === 0 || py === 0 ? c.hl : c.body;
  }
  if (b === PLATE) {
    const top = d && d.on ? 6 : 5;
    if (py < top) return 0;
    if (py === top) return px === 0 || px === 7 ? MET.out : MET.hl;
    return py === 7 || px === 0 || px === 7 ? MET.out : MET.body;
  }
  if (px === 0 || py === 0 || px === 7 || py === 7) return MET.out;
  if (px === 1 || py === 1) return MET.hl;
  if (px === 6 || py === 6) return MET.dark;
  const r2 = (cx - 4) ** 2 + (cy - 4) ** 2;
  if (b === SENSOR) return r2 < 1.2 ? DEV.glass : r2 < 3 ? DEV.glassD : MET.body;
  if (b === THERMO) return px >= 3 && px <= 4 ? (py >= 5 || (d && d.on && py >= 2) ? DEV.red : DEV.face) : MET.body;   // a thermometer that fills when on
  if (b === DEPTH) return py === 2 || py === 5 ? MET.slot : px >= 2 && px <= 5 && py > 2 && py < 5 ? (d && d.on ? DEV.glass : DEV.glassD) : MET.body;   // a diaphragm
  if (b === TIMER) return (px === 3 && py <= 3) || (py === 3 && px === 4) ? MET.slot : r2 < 4.5 ? DEV.face : MET.body;
  if (b === GATE) return px % 2 ? MET.body : DEV.bar;
  if (b === SPRING) {
    if (px >= 3 && px <= 4 && py >= 3 && py <= 4) { const L = LIQ[d ? d.liquid : 1]; return pack([L.br, L.bg, L.bb]); }
    return MET.slot;
  }
  if (b === BATTERY) {   // cells that fill from the bottom as it charges
    const full = d ? Math.round(d.charge / BATTERY_CAP * 4) : 0;
    return px === 3 || px === 4 ? MET.dark : 6 - py <= full ? DEV.cellLit : DEV.cell;
  }
  if (b === EMAGNET) return py % 2 ? DEV.coil : d && d.active ? DEV.lit : MET.body;   // a coil wound round a core
  if (b === MOTOR) return MET.slot;   // the rotor is drawn turning on top
  if (b === DRAIN) return (px + py) % 2 ? MET.dark : MET.slot;
  if (b === MEMBRANE) { const L = LIQ[d ? d.liquid : 1]; return (px + py) % 2 ? pack([L.br, L.bg, L.bb]) : MET.dark; }   // a mesh tinted with the liquid it passes
  if (b === TURBINE) return MET.slot;   // blades are drawn spinning on top
  if (b === WHEEL) return DEV.woodD;
  if (b === WINDMILL) return px >= 3 && px <= 4 && py >= 3 ? (px === 3 ? DEV.wood : DEV.woodD) : 0;   // a post; the sails turn on top
  if (b === GEYSER) return (px - 3.5) ** 2 + (py - 3.5) ** 2 < 4 ? MET.slot : py < 3 ? 0 : DEV.rock;
  if (b === VENT) return (px - 3.5) ** 2 + (py - 1) ** 2 < 3 ? DEV.sulfur : py < 2 ? 0 : DEV.rock;
  if (b === BOILER) return py === 3 || py === 5 ? DEV.grille : MET.body;
  if (b === SEPARATOR) return (py === 2 && px >= 2) || (py === 3 && px >= 3 && px <= 4) || (py >= 4 && px >= 3 && px <= 4) ? DEV.glass : MET.body;
  if (GLYPH[b]) return GLYPH[b][py - 2] && GLYPH[b][py - 2][px - 2] === '#' ? (d && d.on ? DEV.lit : MET.slot) : MET.body;
  return MET.body;
}
// A turbine's three blades or a wheel's spokes, turned by how long the generator has been running.
function drawSpinner(k, d) {
  const x0 = (k % W) * T, y0 = ((k / W) | 0) * T, a0 = d.spin * 0.25;
  if (d.kind === WINDMILL) {   // four sails turning on top of the post
    for (let i = 0; i < 4; i++) {
      const a = a0 + i * Math.PI / 2;
      for (let r = 0.5; r <= 4.5; r += 0.5) {
        const px = Math.round(3.5 + Math.cos(a) * r), py = Math.round(2 + Math.sin(a) * r);
        if (y0 + py >= 0 && x0 + px >= 0 && x0 + px < PW) frame[(y0 + py) * PW + x0 + px] = DEV.sail;
      }
    }
    return;
  }
  if (d.kind === MOTOR) {   // a rotor with an arrow-like key on the side it pushes towards
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * Math.PI;
      for (let r = 0.5; r <= 2.2; r += 0.5) frame[(y0 + Math.round(3.5 + Math.sin(a) * r)) * PW + x0 + Math.round(3.5 + Math.cos(a) * r)] = MET.hl;
    }
    frame[(y0 + 3) * PW + x0 + (d.dir === 2 ? 6 : 1)] = DEV.lit; frame[(y0 + 4) * PW + x0 + (d.dir === 2 ? 6 : 1)] = DEV.lit;
    return;
  }
  const wheel = d.kind === WHEEL, arms = wheel ? 4 : 3;
  for (let i = 0; i < arms; i++) {
    const a = a0 + i * Math.PI * 2 / arms;
    for (let r = 0.5; r <= (wheel ? 3.4 : 2.6); r += 0.5) {
      const px = Math.round(3.5 + Math.cos(a) * r), py = Math.round(3.5 + Math.sin(a) * r);
      frame[(y0 + py) * PW + x0 + px] = wheel ? DEV.wood : MET.hl;
    }
  }
  if (wheel) for (let i = 0; i < 12; i++) {   // the rim
    const a = i * Math.PI / 6, px = Math.round(3.5 + Math.cos(a) * 3.4), py = Math.round(3.5 + Math.sin(a) * 3.4);
    frame[(y0 + py) * PW + x0 + px] = DEV.wood;
  }
}
// The liquid last moved through each pipe tile shows in its core for a moment.
function drawPipeFlow() {
  for (let ty = VIEW.ty0; ty <= VIEW.ty1; ty++) for (let tx = VIEW.tx0; tx <= VIEW.tx1; tx++) {
    const k = ty * W + tx;
    if (!isPipe(solid[k]) || S.tick - pipeTick[k] > 8 || !pipeShow[k]) continue;
    const L = LIQ[pipeShow[k]], x0 = tx * T, y0 = ty * T;
    for (let i = 3; i <= 4; i++) for (let j = 3; j <= 4; j++) plot(x0 + i, y0 + j, L.br, L.bg, L.bb, 0.9);
  }
}
// Levers and open floodgates aren't solid, so they are drawn over the scene each frame.
function drawDeviceOverlays() {
  for (const [k, d] of devices) {
    if (d.kind === TURBINE || d.kind === WHEEL || d.kind === WINDMILL || d.kind === MOTOR) { drawSpinner(k, d); continue; }
    if (d.kind !== LEVER && !(d.kind === GATE && d.open)) continue;
    const x0 = (k % W) * T, y0 = ((k / W) | 0) * T;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      let c;
      if (d.kind === LEVER) c = devicePixel(LEVER, px, py, d);
      else c = px === 0 || px === 7 ? MET.out : px === 1 || px === 6 ? (py === 0 || py === 7 ? MET.out : MET.body) : 0;
      if (c) frame[(y0 + py) * PW + x0 + px] = c;
    }
  }
}
// Drawn after lighting: wires from switches to targets, status lights, and the switch being wired.
function drawDeviceLinks(time) {
  const focus = tool.wire || tool.device;
  for (const [k, d] of devices) {
    const ax = (k % W) * T + 4, ay = ((k / W) | 0) * T + 4;
    for (const t of d.targets) {
      const bx = (t % W) * T + 4, by = ((t / W) | 0) * T + 4;
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1), run = d.on ? (time * 20) | 0 : 0;
      for (let i = 0; i <= n; i++) {
        if (((i - run) % 5 + 5) % 5 >= 2) continue;
        plot(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), d.on ? 250 : 130, d.on ? 210 : 110, d.on ? 80 : 50, focus ? 0.9 : 0.35);
      }
    }
    if (d.kind === LEVER || d.kind === PLATE || d.kind === FILTER || d.kind === VALVE || d.kind === PIXEL) continue;
    const lit = d.kind === GATE ? d.open : d.kind === SPRING || d.kind === DRAIN || d.kind === BOILER || d.kind === SEPARATOR || d.kind === LAMP || d.kind === MOTOR || d.kind === EMAGNET ? d.active : d.on;
    let c = lit ? [90, 210, 120] : [150, 40, 40];
    if (d.kind === SPRING && lit) { const L = LIQ[d.liquid]; c = [L.sr, L.sg, L.sb]; }
    plot(ax + 1, ay - 3, c[0], c[1], c[2], 1); plot(ax + 2, ay - 3, c[0], c[1], c[2], 1);
  }
  if (S.pendingLink >= 0 && ((time * 3) | 0) & 1) {
    const x = (S.pendingLink % W) * T, y = ((S.pendingLink / W) | 0) * T;
    for (let i = 0; i < T; i++) { plot(x + i, y, 250, 210, 80, 1); plot(x + i, y + 7, 250, 210, 80, 1); plot(x, y + i, 250, 210, 80, 1); plot(x + 7, y + i, 250, 210, 80, 1); }
  }
}

export { DEV, DEVICE_BLOCKS, isDeviceBlock, GLYPH, distToSeg, pipePixel, devicePixel, drawSpinner, drawPipeFlow, drawDeviceOverlays, drawDeviceLinks };
