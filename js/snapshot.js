// Snapshots of the whole world: everything a tick reads that isn't rebuilt from scratch each tick. Undo keeps them in
// memory, save slots keep them in the browser, and a world code (text, also used for world files) carries one anywhere.
import { cellT, cloud, drifted, hum, open, u, v, bolts, strikes } from './air.js';
import { regions, rivers, setTideState, tideState } from './biomes.js';
import { ambient, ambientFrom, colBiome, colHum, colSwing, colTemp, colWind, drought, shade, surface } from './climate.js';
import { H, NSOL, SOL_O2, SOL_SALT, W, WATER } from './config.js';
import { MG_PER_UNIT, OXYGEN_REFERENCE, saturation, wakeAir } from './oxygen.js';
import { moved } from './momentum.js';
import { parts } from './particles.js';
import { pipeShow, pipeTick } from './pipes.js';
import { plants } from './plants.js';
import { ecoEnsureBody, ecoInitializeWorld, ecoIntroduce, ecoMigrateBag, ecoOwnLegacyPlant, ecoPlantPool } from './ecology.js';
import { initializeFantasyAccounting } from './fantasy.js';
import { resetPressure } from './pressure.js';
import { S, afloat, bodies, deco, devices, drop, fire, flux, held, latent, AIR_OX, AIR_CARB, airOx, airCarb, liq, pumps, sol, solid, stamp, temp, typ, under, vel, wakeAll } from './world.js';

const ARRAYS = {
  solid, liq, typ, under, fire, deco, temp, latent, airOx, airCarb, drop, vel, held, afloat, flux, sol, pipeShow, pipeTick,
  colTemp, colHum, colWind, colSwing, colBiome, surface, shade, drought, ambient, hum, cloud, u, v, open, cellT,
};
const LISTS = { pumps, bodies, plants, regions, rivers };   // arrays of plain objects, refilled in place
// Settings that belong to the viewer rather than the world, so undo and loading leave them alone.
const VIEW_KEYS = new Set(['follow', 'zoom', 'sound', 'music', 'showHud', 'showChunks', 'lighting', 'heatView', 'dirtyAll', 'pendingIn', 'pendingLink', 'sandboxWeather', 'sandboxPressure']);
const FORMAT = 'tidepool-world', VERSION = 3, CODE_PREFIX = 'TIDEPOOL2:', OLD_PREFIX = 'TIDEPOOL1:';
const LEGACY_TYPES = { sol: Uint8Array, held: Uint8Array, latent: Float32Array, airOx: Uint8Array, airCarb: Uint16Array };
const ARRAY_TYPES = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };

function capture() {
  const arrays = {}, lists = {}, state = {};
  for (const [name, a] of Object.entries(ARRAYS)) arrays[name] = a.slice();
  for (const [name, l] of Object.entries(LISTS)) lists[name] = structuredClone(l);
  for (const [key, value] of Object.entries(S)) if (!VIEW_KEYS.has(key)) state[key] = structuredClone(value);
  return { format: FORMAT, version: VERSION, W, H, NSOL, arrays, lists, devices: structuredClone([...devices]), tide: structuredClone(tideState()), state };
}
function restore(snap) {
  if (!snap || snap.format !== FORMAT) throw new Error('That isn\'t an Ecologist world.');
  if (snap.W !== W || snap.H !== H) throw new Error(`That world is ${snap.W} × ${snap.H} tiles, made by a different version of Ecologist; this one is ${W} × ${H}.`);
  if (snap.NSOL !== NSOL && snap.arrays.sol) {   // an older save with fewer dissolved channels: copy the ones it has
    const old = snap.arrays.sol, n = Math.min(snap.NSOL, NSOL), fresh = new Float64Array(W * H * NSOL);
    for (let k = 0; k < W * H; k++) for (let i = 0; i < n; i++) fresh[k * NSOL + i] = old[k * snap.NSOL + i];
    snap = { ...snap, NSOL, arrays: { ...snap.arrays, sol: fresh } };
  }
  for (const [name, a] of Object.entries(ARRAYS)) if (snap.arrays[name] && snap.arrays[name].length === a.length) a.set(snap.arrays[name]);   // (a field whose size has changed is left as it is)
  if (!snap.arrays.afloat) afloat.fill(0);   // saved before lake ice floated
  if (!snap.arrays.latent) latent.fill(0);   // saved before latent heat
  if (!snap.arrays.airOx) airOx.fill(AIR_OX);   // saved before the air had oxygen in it
  if (!snap.arrays.airCarb || snap.arrays.airCarb.length !== W * H) airCarb.fill(AIR_CARB);   // or before CO2 was counted finely
  if ((snap.version || 1) < 2) {
    // Old SOL_O2 meant a deficit from temperature-dependent saturation. Retain its actual dissolved oxygen.
    for (let k = 0; k < W * H; k++) if (liq[k] && typ[k] === WATER) {
      const p = k * NSOL, actual = Math.max(0, saturation(temp[k], sol[p + SOL_SALT]) - sol[p + SOL_O2] * MG_PER_UNIT);
      sol[p + SOL_O2] = (OXYGEN_REFERENCE - actual) / MG_PER_UNIT;
    }
  }
  for (const [name, l] of Object.entries(LISTS)) l.splice(0, l.length, ...structuredClone(snap.lists[name] || []));
  for (const pp of pumps) {
    pp.sol = Array.from({ length: NSOL }, (_, i) => pp.sol ? pp.sol[i] || 0 : 0);
    if ((snap.version || 1) < 2 && pp.t === WATER) migrateStoredOxygen(pp.sol, pp.temp ?? 20);
  }
  for (const b of bodies) {
    const bucket = b.inv && b.inv.bucket;
    if (!bucket) continue;
    bucket.sol = Array.from({ length: NSOL }, (_, i) => bucket.sol ? bucket.sol[i] || 0 : 0);
    if ((snap.version || 1) < 2 && bucket.t === WATER) migrateStoredOxygen(bucket.sol, bucket.temp ?? 20);
  }
  devices.clear();
  for (const [k, d] of structuredClone(snap.devices)) devices.set(k, d);
  setTideState(structuredClone(snap.tide));
  S.ecology = null;
  S.terrarium = null;
  S.editing = false;
  S.draft = null;
  S.nextPlantId = 0;
  S.mossSugar = {}; S.accounting = {}; S.diagnostics = { deaths: [], deathCounts: {}, births: {} };
  Object.assign(S, structuredClone(snap.state));
  initializeFantasyAccounting({ legacy: !snap.state?.accounting?.fantasy });
  S.nextPlantId = Math.max(S.nextPlantId || 0, ...plants.map(p => p.id || 0));
  const oldPlantIds = plants.filter(p => !p.id);
  for (const p of oldPlantIds) p.id = ++S.nextPlantId;
  if ((snap.version || 1) < 3) {
    S.ecology = null;
    for (const b of bodies) { ecoEnsureBody(b); ecoMigrateBag(b.inv); }
    for (const p of plants) { p.sugar = p.sugar ?? 48; p.nitrogen = p.nitrogen || 0; p.phosphorus = p.phosphorus || 0.06; ecoIntroduce(ecoPlantPool(p)); }
    ecoInitializeWorld();
    for (const p of plants) ecoOwnLegacyPlant(p);
  }
  if (S.ecology) for (const p of oldPlantIds) ecoOwnLegacyPlant(p, true);
  // per-tick stamps compare against the clock, which may have gone backwards; effects in flight are dropped
  stamp.fill(0); moved.fill(0); drifted.fill(0); parts.length = 0; bolts.length = 0; strikes.length = 0; resetPressure();
  S.dirtyAll = true;
  wakeAll(); wakeAir();
}
function migrateStoredOxygen(contents, temperature) {
  const actual = Math.max(0, saturation(temperature, contents[SOL_SALT] || 0) - (contents[SOL_O2] || 0) * MG_PER_UNIT);
  contents[SOL_O2] = (OXYGEN_REFERENCE - actual) / MG_PER_UNIT;
}

// The world as the modules first set it up, before any generation: a new world starts from here, so nothing from the
// previous world (stray air, climate or stamps) can change how a seed builds.
initializeFantasyAccounting();
const PRISTINE = capture();
function restorePristine() { restore(PRISTINE); }

// ---- world codes: the snapshot as JSON, typed arrays as base64, gzipped, then base64 again ----
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text) {
  const s = atob(text), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
// A world code (version 2) is binary, gzipped, then base64: a 4-byte length, a JSON header (the snapshot without its
// arrays, plus each array's name and size), then the arrays' bytes one after another. Compressing raw bytes rather than
// text roughly halves it. The arrays that would make it big are stored smaller (`packed` lists which): temperatures
// are rounded to 1/4° and stored as the change from the tile before, which is mostly nothing, so they pack tight
// (they were most of a code), and the resting temperatures are left out when the saved climate gives them exactly (as
// in a generated world); the tick each tile last had a good flow becomes how many ticks ago, up to 255 (the rules
// only ask whether it was lately); liquid speed is rounded to 1/127. The rest is exact. Undo and save slots keep the
// snapshot itself, unrounded. Version 1 codes (JSON with base64 arrays inside) still load.
function deltas(a, scale) { const o = new Int16Array(a.length); let prev = 0; for (let i = 0; i < a.length; i++) { const v = Math.round(a[i] * scale); o[i] = v - prev; prev = v; } return o; }
function undeltas(d, scale) { const o = new Float32Array(d.length); let v = 0; for (let i = 0; i < d.length; i++) { v += d[i]; o[i] = v / scale; } return o; }
const PACKED = {
  temp: { type: Int16Array, pack: a => deltas(a, 4), unpack: d => undeltas(d, 4) },
  ambient: { type: Int16Array, pack: a => deltas(a, 4), unpack: d => undeltas(d, 4) },
  flux: { type: Uint8Array, pack: (a, tick) => Uint8Array.from(a, f => Math.min(255, Math.max(0, tick - f))), unpack: (d, tick) => Uint32Array.from(d, ago => Math.max(0, tick - ago)) },
  vel: { type: Int8Array, pack: a => Int8Array.from(a, v => Math.round(v * 127)), unpack: d => Float32Array.from(d, v => v / 127) },
};
function encode(snap) {
  const tick = snap.state.tick || 0, index = [], parts = [];
  const fromClimate = sameArray(snap.arrays.ambient, ambientFrom(snap.arrays.colTemp, snap.arrays.surface, new Float32Array(W * H)));
  for (const [name, a] of Object.entries(snap.arrays)) {
    if (name === 'ambient' && fromClimate) continue;
    const b = PACKED[name] ? PACKED[name].pack(a, tick) : a;
    parts.push(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)); index.push([name, b.byteLength, b.constructor.name]);
  }
  const head = new TextEncoder().encode(JSON.stringify({ ...snap, arrays: index, packed: Object.keys(PACKED), fromClimate }));
  const out = new Uint8Array(4 + head.length + parts.reduce((n, p) => n + p.length, 0));
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  let at = 4 + head.length;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function decode(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0), snap = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
  const packed = new Set(snap.packed || []), tick = (snap.state && snap.state.tick) || 0, arrays = {};
  let at = 4 + n;
  for (const [name, len, dtype] of snap.arrays) {
    const chunk = bytes.slice(at, at + len); at += len;   // a copy, so typed arrays of any width line up
    if (!ARRAYS[name]) continue;   // a field from a newer version: ignore it
    const P = packed.has(name) && PACKED[name];
    const Ctor = dtype ? ARRAY_TYPES[dtype] : P ? P.type : (snap.version || 1) < 2 && LEGACY_TYPES[name] || ARRAYS[name].constructor;
    if (!Ctor || len % Ctor.BYTES_PER_ELEMENT) throw new Error('That world has an invalid array format.');
    const a = new Ctor(chunk.buffer, 0, len / Ctor.BYTES_PER_ELEMENT);
    arrays[name] = P ? P.unpack(a, tick) : a;
  }
  if (snap.fromClimate && arrays.colTemp && arrays.surface) arrays.ambient = ambientFrom(arrays.colTemp, arrays.surface, new Float32Array(W * H));
  delete snap.packed; delete snap.fromClimate;
  return { ...snap, arrays };
}
function sameArray(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
// Version 1: the snapshot as JSON, typed arrays as base64 inside it.
function deserialize(json) {
  const snap = JSON.parse(json), arrays = {};
  for (const [name, text] of Object.entries(snap.arrays || {})) {
    if (!ARRAYS[name]) continue;   // a field from a newer version: ignore it
    const bytes = fromBase64(text), Ctor = (snap.version || 1) < 2 && LEGACY_TYPES[name] || ARRAYS[name].constructor;
    arrays[name] = new Ctor(bytes.buffer, 0, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
  }
  return { ...snap, arrays };
}
async function pipeBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
async function packWorld(snap) {
  return CODE_PREFIX + toBase64(await pipeBytes(encode(snap), new CompressionStream('gzip')));
}
async function unpackWorld(code) {
  const text = String(code).trim(), prefix = [CODE_PREFIX, OLD_PREFIX].find(p => text.startsWith(p));   // version 1 codes still load
  if (!prefix) throw new Error('That isn\'t an Ecologist world code; it should start with ' + CODE_PREFIX);
  let bytes;
  try { bytes = await pipeBytes(fromBase64(text.slice(prefix.length).replace(/\s+/g, '')), new DecompressionStream('gzip')); }
  catch { throw new Error('That world code is damaged or cut short; copy the whole code and try again.'); }
  return prefix === OLD_PREFIX ? deserialize(new TextDecoder().decode(bytes)) : decode(bytes);
}

export { PACKED, deltas, undeltas, OLD_PREFIX, ARRAYS, LISTS, VIEW_KEYS, FORMAT, VERSION, CODE_PREFIX, PRISTINE, restorePristine, capture, restore, toBase64, fromBase64, encode, decode, deserialize, packWorld, unpackWorld };
