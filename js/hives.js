// Winter clusters spend finite honey and local oxygen to heat the air beside their comb.
// The carbon-to-heat conversion and metabolic power limit are game-scale assumptions, not SI bee energetics.
import { COMB, H, T, W } from './config.js';
import { ECO_C, ECO_RATE } from './ecology-data.js';
import { ecoAppetite, ecoComb, ecoFeed, ecoFood, ecoMinerals, ecoRespire, ecoSetComb } from './ecology.js';
import { AIR_CAP } from './matter.js';
import { S, heatWake, liq, solid, temp } from './world.js';

function hiveNeighbors(k) {
  const x = k % W, y = (k / W) | 0, neighbors = [];
  if (x) neighbors.push(k - 1); if (x < W - 1) neighbors.push(k + 1);
  if (y) neighbors.push(k - W); if (y < H - 1) neighbors.push(k + W);
  return neighbors;
}
function hiveCells(home) {
  if (!(home >= 0 && home < W * H) || solid[home] !== COMB) return [];
  const cells = [home], seen = new Set(cells);
  for (let i = 0; i < cells.length; i++) for (const n of hiveNeighbors(cells[i])) {
    if (cells.length >= ECO_RATE.hiveCells) break;
    if (solid[n] !== COMB || seen.has(n)) continue;
    seen.add(n); cells.push(n);
  }
  return cells;
}
function beeApproach(cells, k) {
  const adjacent = new Set();
  for (const c of cells) for (const n of hiveNeighbors(c)) if (!solid[n] && !liq[n]) adjacent.add(n);
  let rest = -1, distance = Infinity;
  const x = k % W, y = (k / W) | 0;
  for (const n of adjacent) {
    const d = (n % W - x) ** 2 + (((n / W) | 0) - y) ** 2;
    if (d < distance) { rest = n; distance = d; }
  }
  return { adjacent, rest };
}
function hiveContext(home, k) {
  const cells = hiveCells(home); if (!cells.length) return null;
  const { adjacent, rest } = beeApproach(cells, k);
  // Air outside the immediately heated comb faces determines whether foraging weather has returned.
  const hx = home % W, hy = (home / W) | 0, r = ECO_RATE.hiveWeatherRadius;
  let outside = 0, count = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = hx + dx, ny = hy + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    const n = ny * W + nx;
    if (solid[n] || liq[n] || adjacent.has(n)) continue;
    outside += temp[n]; count++;
  }
  return { cells, adjacent, rest, outside: count ? outside / count : -Infinity };
}
function hiveWithdraw(cells, requested) {
  let taken = 0;
  for (const c of cells) {
    const amount = Math.min(Math.max(0, requested - taken), ecoComb(c));
    if (amount) { ecoSetComb(c, ecoComb(c) - amount); taken += amount; }
    if (taken >= requested) break;
  }
  return taken;
}
const beeAirCell = k => Number.isInteger(k) && k >= 0 && k < W * H && !solid[k] && !liq[k];
// Consistent Manhattan distance to any actual destination face. Goal-directed expansion
// can reach the advertised local range without filling its node budget with unrelated sky.
function beeRouteSearch(origin, adjacent) {
  const ox = origin % W, oy = (origin / W) | 0;
  const targets = [...adjacent].filter(k => beeAirCell(k) && Math.abs(k % W - ox) <= ECO_RATE.hiveRouteReach
    && Math.abs(((k / W) | 0) - oy) <= ECO_RATE.hiveRouteReach), path = [];
  if (!targets.length) return { path, visited: 0, reached: false };
  const heuristic = k => {
    const x = k % W, y = (k / W) | 0;
    let best = Infinity;
    for (const target of targets) best = Math.min(best, Math.abs(target % W - x) + Math.abs(((target / W) | 0) - y));
    return best;
  };
  const heap = [], parents = new Map([[origin, -1]]), distances = new Map([[origin, 0]]), closed = new Set();
  let serial = 0;
  const earlier = (a, b) => a.g + a.h < b.g + b.h || (a.g + a.h === b.g + b.h && (a.h < b.h || (a.h === b.h && a.order < b.order)));
  const push = entry => {
    let index = heap.length; heap.push(entry);
    while (index) {
      const parent = (index - 1) >> 1;
      if (!earlier(entry, heap[parent])) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = entry;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && earlier(heap[child + 1], heap[child])) child++;
        if (!earlier(heap[child], last)) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  push({ cell: origin, g: 0, h: heuristic(origin), order: serial++ });
  while (heap.length) {
    const entry = pop(), cell = entry.cell;
    if (closed.has(cell) || entry.g !== distances.get(cell)) continue;
    if (adjacent.has(cell)) {
      for (let n = cell; n !== origin; n = parents.get(n)) path.push(n);
      path.reverse(); return { path, visited: parents.size, reached: true };
    }
    closed.add(cell);
    for (const next of hiveNeighbors(cell)) {
      if (!beeAirCell(next) || closed.has(next) || Math.abs(next % W - ox) > ECO_RATE.hiveRouteReach || Math.abs(((next / W) | 0) - oy) > ECO_RATE.hiveRouteReach) continue;
      const distance = entry.g + 1;
      if (distance >= (distances.get(next) ?? Infinity)) continue;
      if (!parents.has(next) && parents.size >= ECO_RATE.hiveRouteNodes) continue;
      parents.set(next, cell); distances.set(next, distance);
      push({ cell: next, g: distance, h: heuristic(next), order: serial++ });
    }
  }
  return { path, visited: parents.size, reached: false };
}
// Homing follows actual open cells around trunks and walls. Paths are bounded and cached
// on the bee (therefore saved with it); movement still goes through ordinary collisions.
function beeFlightCell(b, k, context, goal) {
  if (!context || context.rest < 0) return -1;
  if (context.adjacent.has(k)) { delete b.hivePath; delete b.hiveRouteAt; return k; }
  let path = b.hivePath;
  const changedHome = b.hiveRouteHome !== goal;
  const centered = Math.abs((k % W) * T + T / 2 - b.x - b.w / 2) < 1
    && Math.abs(((k / W) | 0) * T + T / 2 - b.y - b.h / 2) < 1;
  if (!changedHome && Array.isArray(path) && centered) while (path[0] === k) path.shift();
  const first = path?.[0], adjacent = first === k || hiveNeighbors(k).includes(first);
  // Validate after consuming a centered waypoint: newly exposed next steps and changed
  // destination faces must be valid too, before steering toward either one.
  const invalid = changedHome || !Array.isArray(path) || (path.length && (!beeAirCell(first) || !adjacent || !context.adjacent.has(path.at(-1))));
  const retry = !path?.length && !changedHome && S.tick - b.hiveRouteAt < ECO_RATE.hiveRouteRetry;
  if ((invalid || !path?.length) && !retry) {
    path = beeRouteSearch(k, context.adjacent).path;
    b.hivePath = path; b.hiveRouteHome = goal; b.hiveRouteAt = S.tick;
  }
  return path?.[0] ?? -1;
}
function hiveReturnCell(b, k, context) { return beeFlightCell(b, k, context, b.home); }
function feedHiveBee(b, k, context) {
  if (!context?.adjacent.has(k)) return 0;
  const taken = hiveWithdraw(context.cells, ecoAppetite(b) / ECO_C.honey);
  if (taken) {
    ecoFeed(b, ecoFood(taken), k);
    S.accounting.honeyEaten = (S.accounting.honeyEaten || 0) + taken;
  }
  return taken;
}
function warmHiveBee(b, k, context) {
  if (b.kind !== 'bee' || !context?.adjacent.has(k) || solid[k] || liq[k] || temp[k] >= ECO_RATE.hiveTarget) return 0;
  const honey = context.cells.reduce((sum, c) => sum + ecoComb(c), 0);
  const wanted = Math.min(ECO_RATE.hiveBurn, honey * ECO_C.honey,
    (ECO_RATE.hiveTarget - temp[k]) * AIR_CAP / ECO_RATE.hiveJoulesPerCarbon);
  const carbon = ecoRespire(k, wanted);
  if (!(carbon > 0)) return 0;
  const amount = carbon / ECO_C.honey;
  hiveWithdraw(context.cells, amount);
  const food = ecoFood(amount); ecoMinerals(k, food.n, food.p);
  // Every added joule has a matching spent substrate and oxygen, with CO2 retained by ecoRespire.
  const heat = carbon * ECO_RATE.hiveJoulesPerCarbon;
  temp[k] += heat / AIR_CAP; heatWake(k);
  S.accounting.hiveHoneyBurned = (S.accounting.hiveHoneyBurned || 0) + amount;
  S.accounting.hiveMetabolicCarbon = (S.accounting.hiveMetabolicCarbon || 0) + carbon;
  S.accounting.hiveHeatJ = (S.accounting.hiveHeatJ || 0) + heat;
  return heat;
}

export { hiveNeighbors, hiveCells, beeApproach, hiveContext, hiveWithdraw, beeRouteSearch, beeFlightCell, hiveReturnCell, feedHiveBee, warmHiveBee };
