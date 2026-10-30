// Reachable routes must fit the advertised local range without traversing sealed/occupied cells.
// Physical budgets and saved paths remain separate from the bounded search's temporary heap.
import assert from 'node:assert/strict';
import { C, Wd, at, box, clearWorld } from './test-support.mjs';
import { addBody, collides, updateBodies } from '../js/bodies.js';
import { centre, driveBee } from '../js/creatures.js';
import { ECO_RATE } from '../js/ecology-data.js';
import { ecoComb, ecoInitializeWorld, ecoInventory, ecoSetComb, ecoState, ecoTissue } from '../js/ecology.js';
import { beeApproach, beeFlightCell, beeRouteSearch, hiveContext, hiveNeighbors, hiveReturnCell } from '../js/hives.js';
import { plants } from '../js/plants.js';
import { capture, restore } from '../js/snapshot.js';

let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
function near(a, b, label) { ok(Math.abs(a - b) < 1e-7, `${label}: ${a} != ${b}`); }
function budget(before, label) {
  const after = ecoInventory(plants);
  for (const key of ['c', 'n', 'p']) near(after[key], before[key], `${label} retains ${key}`);
}
function fixture(hx = 60, hy = 50, bx = 25, by = 50) {
  clearWorld(73); Wd.temp.fill(20); Wd.S.timeMode = 'night';
  const home = at(hx, hy); Wd.solid[home] = C.COMB; ecoSetComb(home, 1); ecoTissue(home);
  const b = addBody('bee', bx * C.T + C.T / 2 - 1.5, by * C.T + C.T / 2 - 1);
  b.home = home; b.homeAt = Wd.S.tick;
  return { home, b, origin: centre(b), context: hiveContext(home, centre(b)) };
}
// Independent breadth-first oracle is used only in small static test worlds, without the
// production node cap, to verify shortest-path length rather than any chosen waypoint order.
function distance(origin, targets) {
  const queue = [origin], depth = new Map([[origin, 0]]), x = origin % C.W, y = (origin / C.W) | 0;
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]; if (targets.has(k)) return depth.get(k);
    for (const n of hiveNeighbors(k)) {
      if (Wd.solid[n] || Wd.liq[n] || depth.has(n) || Math.abs(n % C.W - x) > ECO_RATE.hiveRouteReach || Math.abs(((n / C.W) | 0) - y) > ECO_RATE.hiveRouteReach) continue;
      depth.set(n, depth.get(k) + 1); queue.push(n);
    }
  }
  return Infinity;
}
function validRoute(result, origin, context, label) {
  ok(result.reached && result.path.length > 0, `${label} reaches a real destination face`);
  ok(result.visited <= ECO_RATE.hiveRouteNodes, `${label} respects the existing search-node budget`);
  let previous = origin;
  ok(result.path.every(k => {
    const legal = !Wd.solid[k] && !Wd.liq[k] && hiveNeighbors(previous).includes(k)
      && Math.abs(k % C.W - origin % C.W) <= ECO_RATE.hiveRouteReach
      && Math.abs(((k / C.W) | 0) - ((origin / C.W) | 0)) <= ECO_RATE.hiveRouteReach;
    previous = k; return legal;
  }), `${label} consists only of adjacent physical air cells within the existing reach`);
  ok(context.adjacent.has(result.path.at(-1)), `${label} ends beside the actual goal`);
  near(result.path.length, distance(origin, context.adjacent), `${label} length matches an independent shortest-route oracle`);
}
for (const [hx, hy, bx, by] of [[60, 50, 25, 50], [60, 70, 60, 30], [65, 70, 25, 30], [0, 50, 35, 50], [C.W - 1, 50, C.W - 36, 50]]) {
  const { b, origin, context } = fixture(hx, hy, bx, by), before = ecoInventory(plants), intro = structuredClone(ecoState().introduced);
  const result = beeRouteSearch(origin, context.adjacent);
  validRoute(result, origin, context, `open ${hx - bx},${hy - by} route`);
  ok(hiveReturnCell(b, origin, context) === b.hivePath[0] && b.hivePath.length === result.path.length, 'ordinary cached routing uses the reachable bounded result');
  budget(before, 'open route planning'); assert.deepEqual(ecoState().introduced, intro); checks++;
}
{
  const { b, home, origin } = fixture(45, 50, 35, 50);
  box(40, 44, 40, 56, C.STONE);
  const context = hiveContext(home, origin), before = ecoInventory(plants), result = beeRouteSearch(origin, context.adjacent);
  validRoute(result, origin, context, 'trunk detour');
  ok(result.path.length > Math.abs(45 - 35) - 1, 'trunk requires an actual detour');
  hiveReturnCell(b, origin, context);
  ok(b.hivePath.every(k => !collides(b, (k % C.W) * C.T + C.T / 2 - b.w / 2, ((k / C.W) | 0) * C.T + C.T / 2 - b.h / 2)), 'every waypoint center can physically hold the bee');
  budget(before, 'detour planning');
  for (let i = 0; i < 2500 && !hiveContext(home, centre(b)).adjacent.has(centre(b)); i++) { Wd.S.tick++; updateBodies(); }
  ok(hiveContext(home, centre(b)).adjacent.has(centre(b)), 'ordinary body movement follows the detour to its comb');
  budget(before, 'physical detour');
}
{
  const { b, home, origin } = fixture(40, 50, 45, 50), blocked = origin - 1;
  const context = hiveContext(home, origin), planned = beeRouteSearch(origin, context.adjacent);
  b.hivePath = [origin, ...planned.path]; b.hiveRouteHome = home; b.hiveRouteAt = Wd.S.tick;
  Wd.solid[blocked] = C.STONE;
  const before = ecoInventory(plants), next = hiveReturnCell(b, origin, hiveContext(home, origin));
  ok(next >= 0 && next !== blocked && !Wd.solid[next] && !Wd.liq[next], 'popping a centered cached step revalidates the newly exposed blocked step immediately');
  ok(hiveNeighbors(origin).includes(next), 'replacement next step remains physically adjacent'); budget(before, 'blocked cached step');
}
{
  const { b, home, origin, context } = fixture(40, 50, 45, 50);
  hiveReturnCell(b, origin, context); const oldEnd = b.hivePath.at(-1);
  Wd.solid[oldEnd] = C.STONE; Wd.S.tick++;
  const nextContext = hiveContext(home, origin), before = ecoInventory(plants);
  const next = hiveReturnCell(b, origin, nextContext);
  ok(next >= 0 && b.hivePath.at(-1) !== oldEnd && nextContext.adjacent.has(b.hivePath.at(-1)), 'a destination face blocked after planning invalidates the cached route');
  near(b.hiveRouteAt, Wd.S.tick, 'changed destination faces receive a fresh route'); budget(before, 'blocked route endpoint');
}
{
  const { b, home, origin } = fixture(40, 50, 45, 50);
  Wd.liq[origin] = 1; Wd.typ[origin] = C.WATER;
  const before = ecoInventory(plants), context = hiveContext(home, origin), result = beeRouteSearch(origin, context.adjacent);
  validRoute(result, origin, context, 'new thin film at the current origin');
  ok(hiveReturnCell(b, origin, context) !== origin, 'a bee can plan an escape from a newly occupied origin into actual empty air');
  budget(before, 'dynamic origin');
}
{
  const { b, home, origin } = fixture();
  const pocket = home - 1;
  for (const n of hiveNeighbors(home)) if (n !== pocket) Wd.solid[n] = C.STONE;
  for (const n of hiveNeighbors(pocket)) if (n !== home) Wd.solid[n] = C.STONE;
  const context = hiveContext(home, origin), before = ecoInventory(plants), result = beeRouteSearch(origin, context.adjacent);
  ok(context.rest >= 0 && !result.reached && !result.path.length, 'a real but rock-sealed comb-face pocket remains inaccessible');
  ok(result.visited <= ECO_RATE.hiveRouteNodes, 'failed search remains within the node budget');
  near(hiveReturnCell(b, origin, context), -1, 'unreachable home has no imaginary waypoint');
  const path = b.hivePath, when = b.hiveRouteAt; Wd.S.tick++;
  near(hiveReturnCell(b, origin, context), -1, 'failed route is still a failure on its next cached tick');
  ok(path === b.hivePath && when === b.hiveRouteAt, 'failed result retains the existing retry interval');
  Wd.solid[pocket - C.W] = 0; Wd.S.tick = when + ECO_RATE.hiveRouteRetry;
  ok(hiveReturnCell(b, origin, hiveContext(home, origin)) >= 0, 'an actual opened doorway becomes reachable on the next retry');
  budget(before, 'failed route and real opening');
}
{
  const { b, home, origin } = fixture(40, 50, 45, 50);
  for (const n of hiveNeighbors(home)) Wd.solid[n] = C.STONE;
  const before = ecoInventory(plants);
  near(hiveReturnCell(b, origin, hiveContext(home, origin)), -1, 'fully occupied comb faces remain unreachable');
  budget(before, 'fully sealed hive');
}
{
  const { b, origin, context } = fixture(80, 50, 25, 50), before = ecoInventory(plants);
  const result = beeRouteSearch(origin, context.adjacent);
  ok(!result.reached && !result.path.length && result.visited <= ECO_RATE.hiveRouteNodes, 'an out-of-reach home is not reached by broadening the advertised bounds');
  near(hiveReturnCell(b, origin, context), -1, 'out-of-reach routing returns failure'); budget(before, 'out-of-reach routing');
}
{
  const { b, origin, context } = fixture(); hiveReturnCell(b, origin, context);
  const before = ecoInventory(plants), saved = capture(), path = [...b.hivePath], when = b.hiveRouteAt;
  const expected = hiveReturnCell(b, origin, context); restore(saved);
  const restored = Wd.bodies[0], restoredContext = hiveContext(restored.home, centre(restored));
  assert.deepEqual(restored.hivePath, path); checks++;
  near(restored.hiveRouteAt, when, 'saved route keeps its retry epoch');
  near(hiveReturnCell(restored, centre(restored), restoredContext), expected, 'saved route continues with the identical next physical waypoint');
  budget(before, 'saved route continuation');
}
for (const cached of [false, true]) {
  const { b, home, origin } = fixture(40, 50, 41, 50), blocked = at(43, 50), available = at(46, 50);
  Wd.S.timeMode = 'day';
  for (const flower of [blocked, available]) { Wd.solid[flower] = C.FLOWER; Wd.held[flower] = 1; }
  for (const n of hiveNeighbors(blocked)) Wd.solid[n] = C.STONE;
  if (cached) { b.target = blocked; b.since = Wd.S.tick; }
  ecoInitializeWorld(); const before = ecoInventory(plants), honey = ecoComb(home), load = b.load ?? 0;
  driveBee(b, { lava: 0, acid: 0 }, origin, 20, addBody);
  near(b.target, available, `${cached ? 'cached' : 'new'} fully sealed flower is skipped for a farther exposed flower`);
  ok(beeApproach([available], origin).adjacent.has(b.hivePath.at(-1)), 'selected exposed flower has an actual route endpoint');
  near(b.load ?? 0, load, 'choosing another flower supplies no remote nectar');
  near(ecoComb(home), honey, 'choosing a flower does not remotely spend hive honey');
  budget(before, 'sealed flower selection');
}
console.log(`Bee routing checks: ${checks} passed`);
process.exit(0);
