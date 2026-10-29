// Linked inlet/outlet pumps.
// An inlet pulls liquid from its four neighbours into the pair's buffer; the linked outlet pushes it out (up, sides, then down).
// The buffer keeps what's dissolved in the liquid, and an outlet forcing oil into water (or water into oil) churns foam.
import { AIR, FOAM, H, NSOL, OIL, PUMP_IN, PUMP_OUT, W, WATER } from './config.js';
import { JET, addVel } from './momentum.js';
import { LCAP, dissolvedHeatCapacity } from './matter.js';
import { mixSol } from './solutes.js';
import { S, drop, flux, latent, liq, markDirty, pumps, sol, solid, temp, typ, wake } from './world.js';












const PUMP_RATE = 48;
function churns(a, b) { return (a === OIL || a === WATER) && (b === OIL || b === WATER || b === FOAM) && a !== b; }
function nbr(x, y, d) {
  if (d === 0) return y > 0 ? (y - 1) * W + x : -1;
  if (d === 1) return x > 0 ? y * W + x - 1 : -1;
  if (d === 2) return x < W - 1 ? y * W + x + 1 : -1;
  return y < H - 1 ? (y + 1) * W + x : -1;
}
function pumpTick() {
  for (const pp of pumps) {
    if (pp.active) pp.active--;
    if (!pp.on) continue;
    if (!Array.isArray(pp.sol)) pp.sol = Array.from({ length: NSOL }, (_, i) => pp.sol ? pp.sol[i] || 0 : 0);
    if (!Number.isFinite(pp.temp)) pp.temp = temp[pp.in];
    if (!Number.isFinite(pp.latent)) pp.latent = 0;
    const ix = pp.in % W, iy = (pp.in / W) | 0;
    let room = Math.min(PUMP_RATE, 255 - pp.buf);
    for (let d = 0; d < 4 && room > 0; d++) {
      const n = nbr(ix, iy, d);
      if (n < 0 || !liq[n] || (pp.buf && typ[n] !== pp.t)) continue;
      const take = Math.min(room, liq[n]);
      const bufferCap = (LCAP[pp.t] || 0) * pp.buf / 255 + dissolvedHeatCapacity(pp.buf, pp.sol);
      const takeCap = LCAP[typ[n]] * take / 255 + dissolvedHeatCapacity(take, sol, n * NSOL);
      pp.temp = (pp.temp * bufferCap + temp[n] * takeCap) / (bufferCap + takeCap);
      mixSol(pp.sol, 0, pp.buf, sol, n * NSOL, take);
      const energy = latent[n] * take / liq[n]; latent[n] -= energy; pp.latent += energy;
      pp.t = typ[n]; liq[n] -= take; if (!liq[n]) typ[n] = 0; wake(n);
      pp.buf += take; room -= take;
    }
    const ox = pp.out % W, oy = (pp.out / W) | 0;
    let open = 0;   // only release downward when top and sides are walled in, so a floor outlet doesn't leak out its bottom
    for (let d = 0; d < 3; d++) { const n = nbr(ox, oy, d); if (n >= 0 && !solid[n]) open++; }
    for (let d = 0; d < 4 && pp.buf; d++) {
      const n = nbr(ox, oy, d);
      if (d === 3 && open) break;
      if (n < 0 || solid[n]) continue;
      const churn = liq[n] && churns(pp.t, typ[n]);
      if (liq[n] && typ[n] !== pp.t && !churn) continue;
      const put = Math.min(pp.buf, 255 - liq[n]);
      if (put <= 0) {
        // a full tile of the other liquid still gets churned, taking some of the buffer into the foam
        if (churn && typ[n] !== FOAM) { typ[n] = FOAM; wake(n); pp.active = 20; pp.shown = pp.t; }
        continue;
      }
      if (!liq[n]) drop[n] = 0;
      addVel(n, d === 1 ? -JET : d === 2 ? JET : 0, liq[n], put);   // the outlet jets sideways
      const receiverCap = (LCAP[typ[n]] || 0) * liq[n] / 255 + dissolvedHeatCapacity(liq[n], sol, n * NSOL);
      const putCap = LCAP[pp.t] * put / 255 + dissolvedHeatCapacity(put, pp.sol);
      temp[n] = (temp[n] * receiverCap + pp.temp * putCap) / (receiverCap + putCap);
      mixSol(sol, n * NSOL, liq[n], pp.sol, 0, put);
      const energy = pp.latent * put / pp.buf; pp.latent -= energy; latent[n] += energy;
      liq[n] += put; typ[n] = churn ? FOAM : pp.t; pp.buf -= put; wake(n); flux[n] = S.tick;
      pp.active = 20; pp.shown = pp.t;
    }
    if (!pp.buf) pp.t = 0;
  }
}
function removePump(k) {
  if (S.pendingIn === k) S.pendingIn = -1;
  for (let i = pumps.length - 1; i >= 0; i--) {
    const pp = pumps[i];
    if (pp.in !== k && pp.out !== k) continue;
    const other = pp.in === k ? pp.out : pp.in;
    solid[other] = AIR; markDirty(other % W, (other / W) | 0);
    pumps.splice(i, 1);
  }
}
function usePump(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const k = y * W + x;
  if (solid[k] === PUMP_IN || solid[k] === PUMP_OUT) {
    const pp = pumps.find(q => q.in === k || q.out === k);
    if (pp) pp.on = !pp.on;
    else if (S.pendingIn === k) { S.pendingIn = -1; solid[k] = AIR; markDirty(x, y); }
    return;
  }
  if (solid[k]) return;
  liq[k] = 0; typ[k] = 0;
  if (S.pendingIn < 0) { solid[k] = PUMP_IN; S.pendingIn = k; }
  else { solid[k] = PUMP_OUT; pumps.push({ in: S.pendingIn, out: k, on: true, buf: 0, t: 0, active: 0, shown: 0 }); S.pendingIn = -1; }
  markDirty(x, y);
}

export { PUMP_RATE, nbr, pumpTick, removePump, usePump };
