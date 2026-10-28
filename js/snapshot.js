// Snapshots of the whole world: everything a tick reads that isn't rebuilt from scratch each tick. Undo keeps them in
// memory, save slots keep them in the browser, and a world code (text, also used for world files) carries one anywhere.
import { cellT, cloud, drifted, hum, open, u, v, bolts, strikes } from './air.js';
import { regions, rivers, setTideState, tideState } from './biomes.js';
import { ambient, colBiome, colHum, colSwing, colTemp, colWind, drought, shade, surface } from './climate.js';
import { H, NSOL, W } from './config.js';
import { moved } from './momentum.js';
import { parts } from './particles.js';
import { pipeShow, pipeTick } from './pipes.js';
import { plants } from './plants.js';
import { resetPressure } from './pressure.js';
import { S, afloat, bodies, deco, devices, drop, fire, flux, held, liq, pumps, sol, solid, stamp, temp, typ, under, vel, wakeAll } from './world.js';

const ARRAYS = {
  solid, liq, typ, under, fire, deco, temp, drop, vel, held, afloat, flux, sol, pipeShow, pipeTick,
  colTemp, colHum, colWind, colSwing, colBiome, surface, shade, drought, ambient, hum, cloud, u, v, open, cellT,
};
const LISTS = { pumps, bodies, plants, regions, rivers };   // arrays of plain objects, refilled in place
// Settings that belong to the viewer rather than the world, so undo and loading leave them alone.
const VIEW_KEYS = new Set(['follow', 'zoom', 'sound', 'music', 'showHud', 'showChunks', 'lighting', 'heatView', 'dirtyAll', 'pendingIn', 'pendingLink', 'sandboxWeather']);
const FORMAT = 'tidepool-world', VERSION = 1, CODE_PREFIX = 'TIDEPOOL1:';

function capture() {
  const arrays = {}, lists = {}, state = {};
  for (const [name, a] of Object.entries(ARRAYS)) arrays[name] = a.slice();
  for (const [name, l] of Object.entries(LISTS)) lists[name] = structuredClone(l);
  for (const [key, value] of Object.entries(S)) if (!VIEW_KEYS.has(key)) state[key] = structuredClone(value);
  return { format: FORMAT, version: VERSION, W, H, NSOL, arrays, lists, devices: structuredClone([...devices]), tide: structuredClone(tideState()), state };
}
function restore(snap) {
  if (!snap || snap.format !== FORMAT) throw new Error('That isn\'t a Tidepool world.');
  if (snap.W !== W || snap.H !== H) throw new Error(`That world is ${snap.W} × ${snap.H} tiles, made by a different version of Tidepool; this one is ${W} × ${H}.`);
  if (snap.NSOL !== NSOL && snap.arrays.sol) {   // an older save with fewer dissolved channels: copy the ones it has
    const old = snap.arrays.sol, n = Math.min(snap.NSOL, NSOL), fresh = new Uint8Array(W * H * NSOL);
    for (let k = 0; k < W * H; k++) for (let i = 0; i < n; i++) fresh[k * NSOL + i] = old[k * snap.NSOL + i];
    snap = { ...snap, NSOL, arrays: { ...snap.arrays, sol: fresh } };
  }
  for (const [name, a] of Object.entries(ARRAYS)) if (snap.arrays[name]) a.set(snap.arrays[name]);
  if (!snap.arrays.afloat) afloat.fill(0);   // saved before lake ice floated
  for (const [name, l] of Object.entries(LISTS)) l.splice(0, l.length, ...structuredClone(snap.lists[name] || []));
  devices.clear();
  for (const [k, d] of structuredClone(snap.devices)) devices.set(k, d);
  setTideState(structuredClone(snap.tide));
  Object.assign(S, structuredClone(snap.state));
  // per-tick stamps compare against the clock, which may have gone backwards; effects in flight are dropped
  stamp.fill(0); moved.fill(0); drifted.fill(0); parts.length = 0; bolts.length = 0; strikes.length = 0; resetPressure();
  S.dirtyAll = true;
  wakeAll();
}

// The world as the modules first set it up, before any generation: a new world starts from here, so nothing from the
// previous world (stray air, climate or stamps) can change how a seed builds.
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
function serialize(snap) {
  const arrays = {};
  for (const [name, a] of Object.entries(snap.arrays)) arrays[name] = toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  return JSON.stringify({ ...snap, arrays });
}
function deserialize(json) {
  const snap = JSON.parse(json), arrays = {};
  for (const [name, text] of Object.entries(snap.arrays || {})) {
    if (!ARRAYS[name]) continue;   // a field from a newer version: ignore it
    const bytes = fromBase64(text), Ctor = ARRAYS[name].constructor;
    arrays[name] = new Ctor(bytes.buffer, 0, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
  }
  return { ...snap, arrays };
}
async function pipeBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
async function packWorld(snap) {
  const json = new TextEncoder().encode(serialize(snap));
  return CODE_PREFIX + toBase64(await pipeBytes(json, new CompressionStream('gzip')));
}
async function unpackWorld(code) {
  const text = String(code).trim();
  if (!text.startsWith(CODE_PREFIX)) throw new Error('That isn\'t a Tidepool world code; it should start with ' + CODE_PREFIX);
  let bytes;
  try { bytes = await pipeBytes(fromBase64(text.slice(CODE_PREFIX.length).replace(/\s+/g, '')), new DecompressionStream('gzip')); }
  catch { throw new Error('That world code is damaged or cut short; copy the whole code and try again.'); }
  return deserialize(new TextDecoder().decode(bytes));
}

export { ARRAYS, LISTS, VIEW_KEYS, FORMAT, VERSION, CODE_PREFIX, PRISTINE, restorePristine, capture, restore, toBase64, fromBase64, serialize, deserialize, packWorld, unpackWorld };
