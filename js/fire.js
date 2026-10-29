// Fire: hot fuel ignites, burns while it touches open air, heats its surroundings (which spreads it),
// and goes out when doused from above or the side, smothered, or out of fuel. Oxygen counts as open air and feeds
// a fire, and lit methane or hydrogen touching oxygen explodes instead of burning.
import { explode } from './blast.js';
import { windAt } from './air.js';
import { AIR, BLOOM, COMB, CRISP, FROST, H, LEAF, METHANE, NBLOCK, OIL, PLANT, SMOKE, W, WATER, WOOD } from './config.js';
import { puff } from './particles.js';
import { nbr } from './pumps.js';
import { clearSol, soluteAmount, setSoluteAmount, takeSoluteAmount } from './solutes.js';
import { S, airCarb, airOx, fire, held, latent, liq, markDirty, solid, temp, typ, wake } from './world.js';
import { COOLANT, FUSE, WOOL } from './config.js';
import { FLOWER, ASH, CHARCOAL, CHLORINE, HYDROGEN, OXYGEN, STEAM } from './config.js';
import { CARB_PER_OX, MAX_AIR_CARB, addAirCarbon, breatheAir, burnable, consumeAirOxygen } from './oxygen.js';
import { NSOL, SOL_ETHANOL, SOL_O2 } from './config.js';
import { sol } from './world.js';
import { ecoBurnOrganic, ecoOrganicFuel } from './ecology.js';






const IGNITE_BLOCK = new Float32Array(NBLOCK), BURN_TIME = new Uint8Array(NBLOCK);
IGNITE_BLOCK[WOOD] = 260; BURN_TIME[WOOD] = 240;
IGNITE_BLOCK[COMB] = 200; BURN_TIME[COMB] = 140;
IGNITE_BLOCK[CRISP] = 200; BURN_TIME[CRISP] = 180;
IGNITE_BLOCK[PLANT] = 250; BURN_TIME[PLANT] = 60;
IGNITE_BLOCK[WOOL] = 570; BURN_TIME[WOOL] = 120;
IGNITE_BLOCK[FUSE] = 120; BURN_TIME[FUSE] = 10;   // a fuse burns fast and lights the next fuse tile in any direction
IGNITE_BLOCK[LEAF] = 230;
IGNITE_BLOCK[FLOWER] = 230; BURN_TIME[FLOWER] = 20;
IGNITE_BLOCK[CHARCOAL] = 350; BURN_TIME[CHARCOAL] = 255;   // charcoal glows a long time, hotter and with little smoke
const BURN_DRAW = 2;   // oxygen (tenths of a percent) a flame takes from each tile of air beside it per tick
const CHARCOAL_FLAME = 1300, ASH_LEFT = 0.4, ASH_PINCH = 48;   // burnt wood leaves a pinch of ash, sometimes BURN_TIME[LEAF] = 30;
const OIL_IGNITE = 250, OIL_SMOKE = 200, METHANE_IGNITE = 537, HYDROGEN_IGNITE = 500, FLAME_TEMP = 1000, RADIANT = 0.04, FLASH = 0.6;   // a flash heats the gas beside it past its ignition point, so the flame runs on
const FED = 4;   // oxygen a fire uses up per tick from each oxygen tile it touches, burning hotter for it
const DOUSERS = new Set([WATER, FROST, BLOOM, COOLANT]);
const SPIRIT = 100, SPIRIT_IGNITE = 365, SPIRIT_HOLD = 78, SPIRIT_BURN = 0.5;
// First-milestone reaction equivalents, in game component/air units (not kilograms or ABV). The solvent carrier is
// retained. Ethanol's 3 O2 : 2 CO2 relationship is honored; its reaction water is recorded as an unrendered product
// until the material-volume model has a calibrated conversion. It is not silently added to the carrier.
const SPIRIT_OXYGEN = 3, SPIRIT_CARBON_PER_OXYGEN = 2 / 3, SPIRIT_WATER_PRODUCT = 3;
const GAS_OXYGEN_PER_UNIT = 1000 / 255, GAS_BURN_RATE = 64, GAS_PRODUCT_TEMP = 400;
// Water with enough alcohol in it to burn (js/solutes.js makes it, js/heat.js distils it).
const spirit = n => liq[n] && typ[n] === WATER && sol[n * NSOL + SOL_ETHANOL] >= SPIRIT;

// Air with enough oxygen to burn in next to the tile (15% or more), or oxygen gas.
function exposed(x, y) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && (burnable(n) || (liq[n] && typ[n] === OXYGEN))) return true; }
  return false;
}
// Burning takes oxygen from the air round the flame and gives back carbon dioxide (and the water in the smoke).
function draw(x, y, n) { for (let d = 0; d < 4; d++) { const o = nbr(x, y, d); if (o >= 0) breatheAir(o, n); } }
// The first neighbouring tile holding oxygen (or, for hydrogen, chlorine, which it explodes with just the same), or -1.
function oxygenBeside(x, y, h) {
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] >= 16 && (typ[n] === OXYGEN || (h && typ[n] === CHLORINE))) return n; }
  return -1;
}
// Water above or beside the tile. Water below doesn't count, so oil keeps burning on top of a lake; burning spirit doesn't douse.
function doused(x, y) {
  for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] >= 32 && DOUSERS.has(typ[n]) && !spirit(n)) return true; }
  return false;
}
function burn(k, x, y, clean, measured = false) {
  let oxidationMeasured = measured;
  if (!measured) {
    const remaining = ecoOrganicFuel(k);
    const carbon = remaining === null ? null : ecoBurnOrganic(k, remaining / Math.max(1, fire[k]));
    if (carbon === null) draw(x, y, BURN_DRAW);
    else { oxidationMeasured = true; if (!(carbon > 0)) return false; }
  }
  temp[k] = Math.max(temp[k], solid[k] === CHARCOAL ? CHARCOAL_FLAME : FLAME_TEMP);
  wake(k);
  for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT; }   // flames heat up and sideways
  if (solid[k] === FUSE) for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] = Math.max(temp[n], 300); }   // a burning fuse lights what it touches, even below it
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && liq[n] && (typ[n] === METHANE || typ[n] === HYDROGEN)) temp[n] = Math.max(temp[n], FLAME_TEMP); else if (n >= 0 && spirit(n)) fire[n] = 1; }   // a flame lights a burnable gas, or spirit, it touches
  const w = windAt(x, y);   // and the wind fans them downwind
  if (Math.abs(w) > 0.1) { const n = nbr(x, y, w > 0 ? 2 : 1); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT * 3 * Math.abs(w); }
  const o = oxygenBeside(x, y);   // oxygen feeds the fire: it burns hotter and uses the oxygen up
  if (o >= 0 && !oxidationMeasured) {
    for (let d = 0; d < 3; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * RADIANT * 2; }
    liq[o] = Math.max(0, liq[o] - FED); if (!liq[o]) typ[o] = 0; wake(o);
  }
  if (Math.random() < 0.2) puff(k, 'flame');
  if (!clean && Math.random() < 0.06) smokeAbove(k);
  return true;
}
function combustionRecord(key, amount) {
  const a = S.accounting || (S.accounting = {});
  a[key] = (a[key] || 0) + amount;
}
// Reserve both oxygen and CO2 room before deciding reaction extent. The ratio is CO2 molecules per O2 molecule.
function oxidizerAvailable(x, y, carbonRatio) {
  let total = 0;
  for (let d = 0; d < 4; d++) {
    const n = nbr(x, y, d);
    if (n < 0 || solid[n] || liq[n]) continue;
    const room = carbonRatio ? Math.max(0, MAX_AIR_CARB - airCarb[n]) / (carbonRatio * CARB_PER_OX) : Infinity;
    total += Math.min(airOx[n], room);
  }
  return total;
}
function consumeOxidizer(x, y, requested, carbonRatio) {
  let left = requested, carbon = 0;
  for (let d = 0; d < 4 && left > 0; d++) {
    const n = nbr(x, y, d);
    if (n < 0 || solid[n] || liq[n]) continue;
    const room = carbonRatio ? Math.max(0, MAX_AIR_CARB - airCarb[n]) / (carbonRatio * CARB_PER_OX) : Infinity;
    const got = consumeAirOxygen(n, Math.min(left, room));
    carbon += addAirCarbon(n, got * carbonRatio * CARB_PER_OX); left -= got;
  }
  combustionRecord('combustionOxygen', requested - left);
  combustionRecord('combustionCarbon', carbon);
  return requested - left;
}
// Returns consumed ethanol quantity. A weak, smothered or oxygen-free solution consumes nothing.
function spiritBurn(k, x = k % W, y = (k / W) | 0) {
  if (!spirit(k) || !exposed(x, y) || doused(x, y)) return 0;
  const wanted = Math.min(soluteAmount(k, SOL_ETHANOL), SPIRIT_BURN * liq[k] / 255,
    oxidizerAvailable(x, y, SPIRIT_CARBON_PER_OXYGEN) / SPIRIT_OXYGEN);
  if (!(wanted > 0)) return 0;
  const oxygen = consumeOxidizer(x, y, wanted * SPIRIT_OXYGEN, SPIRIT_CARBON_PER_OXYGEN);
  const used = takeSoluteAmount(k, SOL_ETHANOL, oxygen / SPIRIT_OXYGEN);
  combustionRecord('ethanolBurned', used);
  combustionRecord('ethanolCarbonProduced', oxygen * SPIRIT_CARBON_PER_OXYGEN * CARB_PER_OX);
  combustionRecord('ethanolReactionWater', used * SPIRIT_WATER_PRODUCT);
  fire[k] = 1; burn(k, x, y, true, true); temp[k] = Math.min(temp[k], SPIRIT_HOLD);
  return used;
}
// Ordinary gas combustion requires an exposed oxidizer and a place for its steam. Gas-tile reaction quantities use
// the existing gas-volume equivalents: 2 H2 + O2 -> 2 H2O; CH4 + 2 O2 -> CO2 + 2 H2O. Explosive mixtures retain the
// separate blast model; this helper fixes the formerly oxygen-free ordinary flame path.
function burnFuelGas(k, x, y, hydrogen) {
  if (!exposed(x, y) || doused(x, y)) return 0;
  const oxygenRatio = GAS_OXYGEN_PER_UNIT * (hydrogen ? 0.5 : 2), carbonRatio = hydrogen ? 0 : 0.5;
  let amount = Math.floor(Math.min(liq[k], GAS_BURN_RATE, oxidizerAvailable(x, y, carbonRatio) / oxygenRatio));
  if (!amount) return 0;
  const waterRatio = hydrogen ? 1 : 2;
  let target = amount === liq[k] && amount * waterRatio <= 255 ? k : -1;
  if (target < 0) for (let d = 0; d < 4; d++) {
    const n = nbr(x, y, d);
    if (n < 0 || solid[n] || (liq[n] && typ[n] !== STEAM)) continue;
    const fits = Math.floor((255 - liq[n]) / waterRatio);
    if (fits > 0) { amount = Math.min(amount, fits); target = n; break; }
  }
  if (target < 0 || !amount) return 0;
  const consumed = consumeOxidizer(x, y, amount * oxygenRatio, carbonRatio);
  if (consumed + 1e-9 < amount * oxygenRatio) throw new Error('Combustion oxygen reservation changed.');
  const produced = amount * waterRatio, was = target === k ? 0 : liq[target];
  const oldTemp = was ? temp[target] : GAS_PRODUCT_TEMP, contents = new Float64Array(NSOL);
  if (was) for (let i = 0; i < NSOL; i++) contents[i] = soluteAmount(target, i);
  liq[k] -= amount;
  if (!liq[k]) { typ[k] = 0; clearSol(k); latent[k] = 0; }
  if (target !== k) { temp[k] = FLAME_TEMP; fire[k] = liq[k] ? 1 : 0; }
  liq[target] = was + produced; typ[target] = STEAM;
  for (let i = 0; i < NSOL; i++) setSoluteAmount(target, i, contents[i]);
  temp[target] = (oldTemp * was + GAS_PRODUCT_TEMP * produced) / (was + produced);
  wake(k); wake(target);
  combustionRecord(hydrogen ? 'hydrogenBurned' : 'methaneBurned', amount);
  combustionRecord('gasReactionWater', produced);
  for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0) temp[n] += (FLAME_TEMP - temp[n]) * FLASH; }
  if (Math.random() < 0.5) puff(k, 'flame');
  return amount;
}
// Puts a little smoke into the open tile above k.
function smokeAbove(k) {
  const u = k - W;
  if (u < 0 || solid[u] || (liq[u] && typ[u] !== SMOKE)) return;
  if (!liq[u]) { clearSol(u); temp[u] = 200; }
  liq[u] = Math.min(255, liq[u] + 40); typ[u] = SMOKE; wake(u);
}
// Below this nothing can catch, smoke or flash, so a tile that isn't burning and is no hotter can be skipped.
const COLDEST_IGNITE = Math.min(OIL_SMOKE, METHANE_IGNITE, HYDROGEN_IGNITE, ...IGNITE_BLOCK.filter(t => t > 0));
function fireTick() {
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
    if (!fire[k] && temp[k] <= COLDEST_IGNITE) continue;
    const b = solid[k];
    if (!b && liq[k] && (typ[k] === METHANE || typ[k] === HYDROGEN)) {
      const h = typ[k] === HYDROGEN;
      if (temp[k] > (h ? HYDROGEN_IGNITE : METHANE_IGNITE) && !doused(x, y) && oxygenBeside(x, y, h) >= 0) {
        // mixed with oxygen it explodes; the oxygen it touches goes with it
        for (let d = 0; d < 4; d++) { const n = nbr(x, y, d); if (n >= 0 && (typ[n] === OXYGEN || (h && typ[n] === CHLORINE))) { liq[n] = 0; typ[n] = 0; } }
        fire[k] = 0; explode(k);
        continue;
      }
      if (h) {
        if (temp[k] <= HYDROGEN_IGNITE || !burnFuelGas(k, x, y, true)) fire[k] = 0;
        continue;
      }
      // burning methane flashes through the cloud: each burning tile heats its neighbours hard and is gone in a few ticks
      if (temp[k] <= METHANE_IGNITE || !burnFuelGas(k, x, y, false)) fire[k] = 0;
      continue;
    }
    if (!b && liq[k] && typ[k] === OIL) {
      // burning oil is hot oil touching air; its heat flows with it, so the fire moves with the oil
      if (temp[k] > OIL_IGNITE && exposed(x, y) && !doused(x, y)) {
        fire[k] = 1; burn(k, x, y);
        if (!--liq[k]) typ[k] = 0;
      } else {
        if (fire[k] && doused(x, y)) { temp[k] = Math.min(temp[k], 90); puff(k, 'steam'); }
        fire[k] = 0;
        if (temp[k] > OIL_SMOKE && Math.random() < 0.02) smokeAbove(k);   // hot oil smokes before it catches
      }
      continue;
    }
    if (!b && spirit(k)) {
      // strong alcohol burns on the water it's in with a clean flame: the spirit burns off while the water under the
      // flame stays below boiling, and once it's too weak to burn the flame dies
      if ((fire[k] || temp[k] > SPIRIT_IGNITE) && exposed(x, y) && !doused(x, y)) {
        if (!spiritBurn(k, x, y)) fire[k] = 0;
      } else { if (fire[k] && doused(x, y)) puff(k, 'steam'); fire[k] = 0; }
      continue;
    }
    if (!IGNITE_BLOCK[b]) { fire[k] = 0; continue; }
    if (!fire[k]) { if (temp[k] > IGNITE_BLOCK[b] && exposed(x, y)) fire[k] = BURN_TIME[b]; continue; }
    if (doused(x, y)) { fire[k] = 0; temp[k] = Math.min(temp[k], 90); puff(k, 'steam'); continue; }
    if (!exposed(x, y)) { fire[k] = 0; continue; }   // smothered
    if (!burn(k, x, y)) { fire[k] = 0; if (ecoOrganicFuel(k) === 0) { solid[k] = AIR; markDirty(x, y); } continue; }
    if (--fire[k] === 0) {
      const ash = (b === WOOD || b === CHARCOAL || b === LEAF) && Math.random() < ASH_LEFT;
      solid[k] = ash ? ASH : AIR; held[k] = ash ? ASH_PINCH : 0; markDirty(x, y); puff(k, 'smoke');
    }
  }
}

export { SPIRIT, SPIRIT_IGNITE, SPIRIT_OXYGEN, SPIRIT_CARBON_PER_OXYGEN, SPIRIT_WATER_PRODUCT, spirit, spiritBurn, burnFuelGas, HYDROGEN_IGNITE, FED, oxygenBeside, IGNITE_BLOCK, BURN_TIME, OIL_IGNITE, OIL_SMOKE, METHANE_IGNITE, FLAME_TEMP, RADIANT, FLASH, smokeAbove, DOUSERS, exposed, doused, burn, fireTick };
