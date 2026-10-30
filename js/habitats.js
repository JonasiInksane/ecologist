// Finite starting water and producers for generated habitats. This runs only during generation;
// ordinary growth, grazing and death still transfer the existing ecological inventories.
import { CLAY, DIRT, H, NSOL, SOL_ALGAE, SOL_SALT, T, W, WATER, WETDIRT } from './config.js';
import { biomeAt } from './biomes.js';
import { ECO_QUOTA, ECO_RATE } from './ecology-data.js';
import { bioTissue } from './ecology-core.js';
import { ecoIntroduce, ecoState } from './ecology.js';
import { skyAbove } from './oxygen.js';
import { plantSeed, plants } from './plants.js';
import { addSoluteAmount, soluteAmount } from './solutes.js';
import { S, bodies, held, liq, markDirty, sol, solid, temp, typ } from './world.js';

// Same initial algae concentration as the designed jar. It is an initial world endowment,
// not a minimum maintained during play; dark, saline and thermally unsuitable water gets none.
const HABITAT_START_ALGAE = 20;
const WOODLAND_MOISTURE = 255, WOODLAND_ROOT_REACH = 3;
// A one-time initial water endowment lets existing woodland seeds establish before the
// first rain. Only initially dry dirt in their actual drinking reach changes; subsequent
// root use, groundwater movement and evaporation spend this finite water normally.
function seedWoodlandMoisture() {
  const state = ecoState();
  if (state.woodlandMoistureSeeded) return 0;
  const woodland = plants.filter(plant => ['forest', 'jungle'].includes(biomeAt(plant.root % W).name));
  if (!woodland.length) return 0;
  state.woodlandMoistureSeeded = true;
  let added = 0;
  for (const plant of woodland) {
    const x = plant.root % W, y = (plant.root / W) | 0;
    for (let dy = 1; dy <= WOODLAND_ROOT_REACH; dy++) for (let dx = -WOODLAND_ROOT_REACH; dx <= WOODLAND_ROOT_REACH; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny >= H || nx >= W) continue;
      const k = ny * W + nx, offset = k * NSOL;
      if (solid[k] !== DIRT || held[k] || liq[k]) continue;
      // Preserve any legacy dry residue instead of assigning it an invented concentration.
      let residue = false;
      for (let channel = 0; channel < NSOL; channel++) if (sol[offset + channel]) { residue = true; break; }
      if (residue) continue;
      solid[k] = WETDIRT; held[k] = WOODLAND_MOISTURE;
      // Sterile initial porewater shares the existing soil temperature and solute vector.
      // Its extra sensible capacity is present in the ordinary poreHeatCapacity model.
      added += WOODLAND_MOISTURE; markDirty(nx, ny);
    }
  }
  S.accounting.woodlandMoistureIntroduced = (S.accounting.woodlandMoistureIntroduced ?? 0) + added;
  return added;
}
function plantLakeBanks(cx, cy, rx, ry) {
  const state = ecoState();
  if (state.lakeBanksSeeded) return 0;
  state.lakeBanksSeeded = true;
  let planted = 0;
  // Prefer the lowest dry ledges, keeping roots near the retained lake after its surface recedes.
  for (let y = Math.min(H - 2, cy + 1); y >= Math.max(1, cy - ry - 1); y--) {
    for (let x = Math.max(1, cx - rx - 1); x <= Math.min(W - 2, cx + rx + 1); x++) {
      const root = y * W + x, soil = root + W;
      if (solid[root] || liq[root] || liq[root - W] || !skyAbove(root)
        || ![root - W, root - 1, root + 1].some(k => !solid[k] && !liq[k])
        || plants.some(p => Math.abs(p.root % W - x) < 3 && Math.abs(((p.root / W) | 0) - y) < 3)) continue;
      let water = false;
      for (let dy = -3; dy <= 3 && !water; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && liq[ny * W + nx] >= 128 && typ[ny * W + nx] === WATER) { water = true; break; }
      }
      if (!water || liq[soil]) continue;
      const patch = [];
      if (!solid[soil]) {
        // A short soil ledge can reach daylight beside a bank overhang. Its two-row patch
        // attaches to clay, preserves the seal and replaces only initially dry empty space.
        let ledge = [];
        if (soil + W < W * H && solid[soil + W] === CLAY) ledge = [soil];
        for (const direction of [-1, 1]) {
          if (ledge.length) break;
          const proposed = [];
          for (let distance = 0; distance <= 4; distance++) {
            const nx = x + direction * distance, k = soil + direction * distance;
            if (nx < 0 || nx >= W) break;
            if (solid[k] === CLAY) { ledge = proposed; break; }
            if (solid[k] || liq[k]) break;
            proposed.push(k);
          }
        }
        for (const k of ledge) {
          solid[k] = DIRT; patch.push(k);
          if (k + W < W * H && !solid[k + W] && !liq[k + W]) { solid[k + W] = DIRT; patch.push(k + W); }
        }
      }
      if (solid[soil] !== DIRT) continue;
      if (plantSeed(root)) { plants.at(-1).bank = true; markDirty(x, y + 1); if (++planted >= 2) return planted; }
      else for (const k of patch) solid[k] = 0;
    }
  }
  return planted;
}
function seedGeneratedHabitats() {
  const state = ecoState();
  if (state.habitatsSeeded) return 0;
  state.habitatsSeeded = true;
  const visited = new Uint8Array(W * H);
  let carbon = 0;
  for (const body of bodies) {
    if (body.kind !== 'fish' && body.kind !== 'pike') continue;
    const x = Math.max(0, Math.min(W - 1, ((body.x + body.w / 2) / T) | 0));
    const y = Math.max(0, Math.min(H - 1, ((body.y + body.h / 2) / T) | 0)), origin = y * W + x;
    if (visited[origin] || solid[origin] || !liq[origin] || typ[origin] !== WATER) continue;
    const queue = [origin]; visited[origin] = 1;
    for (let index = 0; index < queue.length; index++) {
      const k = queue[index], column = k % W;
      if (temp[k] >= ECO_RATE.algaeMinTemp && temp[k] <= ECO_RATE.algaeMaxTemp
        && sol[k * NSOL + SOL_SALT] <= ECO_RATE.algaeMaxSalt && skyAbove(k)) {
        const amount = Math.max(0, HABITAT_START_ALGAE * liq[k] / 255 - soluteAmount(k, SOL_ALGAE));
        if (amount > 0) { addSoluteAmount(k, SOL_ALGAE, amount); carbon += amount; }
      }
      for (const next of [k - W, k + W, column ? k - 1 : -1, column < W - 1 ? k + 1 : -1]) {
        if (next < 0 || next >= W * H || visited[next] || solid[next] || !liq[next] || typ[next] !== WATER) continue;
        visited[next] = 1; queue.push(next);
      }
    }
  }
  if (carbon > 0) ecoIntroduce(bioTissue(carbon, ECO_QUOTA));
  return carbon;
}
export { HABITAT_START_ALGAE, WOODLAND_MOISTURE, WOODLAND_ROOT_REACH, seedWoodlandMoisture, plantLakeBanks, seedGeneratedHabitats };
