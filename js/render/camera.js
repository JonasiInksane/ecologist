// Camera: which part of the world the canvas shows. Follows the explorer, pans with Shift- or middle-drag,
// and zooms between 1x and 2x with the mouse wheel.
import { canvas, ctx, img } from '../canvas.js';
import { H, PH, PW, T, VIEW_H, VIEW_W, W } from '../config.js';
import { S, VIEW, bodies, reduceMotion } from '../world.js';





let camX = 0, camY = 0;   // unrounded camera position, for smooth following

function clampView() {
  camX = Math.max(0, Math.min(PW - VIEW.w, camX));
  camY = Math.max(0, Math.min(PH - VIEW.h, camY));
  VIEW.x = Math.round(camX); VIEW.y = Math.round(camY);
  VIEW.tx0 = Math.floor(VIEW.x / T); VIEW.tx1 = Math.min(W - 1, Math.ceil((VIEW.x + VIEW.w) / T));
  VIEW.ty0 = Math.floor(VIEW.y / T); VIEW.ty1 = Math.min(H - 1, Math.ceil((VIEW.y + VIEW.h) / T));
}
function centerOn(px, py) { camX = px - VIEW.w / 2; camY = py - VIEW.h / 2; clampView(); }
function explorer() { return bodies.find(b => b.kind === 'explorer'); }
function updateCamera() {
  const ex = S.follow && explorer();
  if (ex) {
    camX += (ex.x + ex.w / 2 - VIEW.w / 2 - camX) * 0.12;
    camY += (ex.y + ex.h / 2 - VIEW.h / 2 - camY) * 0.12;
  }
  clampView();
}
function panBy(dx, dy) { camX += dx; camY += dy; S.follow = false; clampView(); }
// Zoom keeps the world point under (ax, ay) where it is on screen.
function setZoom(z, ax = VIEW.x + VIEW.w / 2, ay = VIEW.y + VIEW.h / 2) {
  const rx = (ax - VIEW.x) / VIEW.w, ry = (ay - VIEW.y) / VIEW.h;
  S.zoom = z;
  VIEW.w = VIEW_W / z; VIEW.h = VIEW_H / z;
  canvas.width = VIEW.w; canvas.height = VIEW.h;
  camX = ax - rx * VIEW.w; camY = ay - ry * VIEW.h;
  clampView();
}
function screenToWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: VIEW.x + (e.clientX - r.left) / r.width * VIEW.w, y: VIEW.y + (e.clientY - r.top) / r.height * VIEW.h };
}
function snapToExplorer() { const ex = explorer(); if (ex) centerOn(ex.x + ex.w / 2, ex.y + ex.h / 2); else clampView(); }
// Blasts shake the view for a few frames (not with reduced motion).
function present() {
  let ox = 0, oy = 0;
  if (S.shake > 0) {
    if (!reduceMotion) { ox = Math.round((Math.random() - 0.5) * S.shake); oy = Math.round((Math.random() - 0.5) * S.shake); }
    S.shake = Math.max(0, S.shake - 1);
  }
  ctx.putImageData(img, ox - VIEW.x, oy - VIEW.y, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
}

export { camX, camY, clampView, centerOn, explorer, updateCamera, panBy, setZoom, screenToWorld, snapToExplorer, present };
