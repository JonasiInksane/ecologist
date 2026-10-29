// Pure, allocation-limited pool arithmetic. No grid, clock, rendering or random calls.
function bioPool(c = 0, n = 0, p = 0) { return { c, n, p }; }
function bioAdd(to, from) { for (const key of ['c', 'n', 'p']) to[key] += from[key] || 0; return to; }
function bioScale(pool, fraction) { return bioPool(pool.c * fraction, pool.n * fraction, pool.p * fraction); }
function bioCanPay(pool, cost) { return ['c', 'n', 'p'].every(key => (pool[key] || 0) + 1e-10 >= (cost[key] || 0)); }
function bioTransfer(from, to, requested) {
  let extent = 1;
  for (const key of ['c', 'n', 'p']) if (requested[key] > 0) extent = Math.min(extent, Math.max(0, from[key] || 0) / requested[key]);
  const moved = bioScale(requested, Math.max(0, extent));
  for (const key of ['c', 'n', 'p']) { from[key] = Math.max(0, (from[key] || 0) - moved[key]); to[key] = (to[key] || 0) + moved[key]; }
  return moved;
}
function bioGrowth(pool, carbon, quota) { return Math.max(0, Math.min(carbon, pool.c, quota.n ? pool.n / quota.n : Infinity, quota.p ? pool.p / quota.p : Infinity)); }
function bioTissue(carbon, quota) { return bioPool(carbon, carbon * quota.n, carbon * quota.p); }
export { bioPool, bioAdd, bioScale, bioCanPay, bioTransfer, bioGrowth, bioTissue };
