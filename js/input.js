// Toolbar, brush painting, pointer and keyboard input, and the status line.
import { enableSound, sfx } from './audio.js';
import { enableMusic } from './music.js';
import { biomeAt, spellAt } from './biomes.js';
import { KINDS, addBody, collides, keys, tieBalloon } from './bodies.js';
import { canvas } from './canvas.js';
import { day, seasonName } from './climate.js';
import { ACID, AETHER, AND, BLOOM, BOILER, CLAY, COUNTER, DIRT, DRAIN, FILTER, FROST, GATE, GEYSER, GLASS, H, HONEY, ICE, LAVA, LEVER, METAL, METHANE, MOLTEN, MUD, NITRO, NOT, NSOL, OIL, OR, PERMAFROST, PIPE, PLATE, POISON, PUMP_IN, PUMP_OUT, QUICK, SALT, SAND, SENSOR, SEPARATOR, SLIME, SNOW, SOL_BLUE, SOL_RED, SOL_YELLOW, SPRING, STEAM, STONE, STORM, T, TIMER, TURBINE, VALVE, VENT, W, WATER, WHEEL, WINDMILL, WOOD } from './config.js';
import { clockText, setTimeMode } from './daynight.js';
import { deviceState, linkClick, removeDevice, useDeviceTool } from './devices.js';
import { generate } from './generate.js';
import { LEVELS, startLevel } from './levels.js';
import { backToEditor, canGoBack, closeEditor, editorLoaded, fillEditor, markEnd, markFrom, markTo, marker, openEditor, restartCustom, setupEditor } from './editor.js';
import { LIQ } from './liquids.js';
import { checkpoint } from './history.js';
import { buildPalette, recall, remember } from './palette.js';
import { buildWorldMenu } from './worldmenu.js';
import { setupHud, updateHud } from './hud.js';
import { plantSeed } from './plants.js';
import { charged, powerLeft } from './power.js';
import { removePump, usePump } from './pumps.js';
import { panBy, screenToWorld, setZoom, snapToExplorer } from './render/camera.js';
import { lastStats } from './render/render.js';
import { step } from './sim.js';
import { SOL_NAMES, clearSol } from './solutes.js';
import { startRain } from './weather.js';
import { S, VIEW, awake, bodies, deco, devices, drop, fall, fire, heatWake, held, liq, markDirty, pumps, sol, solid, temp, typ, vel, wake, wakeAll } from './world.js';
import { CO2, LYE, SODA } from './config.js';
import { HYDROGEN, MSLAG, ORE, OXYGEN, SLAG } from './config.js';
import { DEPTH, FNITRO, PIXEL, RUST, SUGAR, THERMO } from './config.js';
import { phOf } from './solutes.js';
import { BATTERY, EMAGNET, LAMP, MOTOR, SOLAR } from './config.js';
import { COOLANT, COPPER, CORAL, FERRO, FERT, FUSE, LIGHT, MAGNET, MEMBRANE, MIMIC, POROUS, SPONGE, VOID, WOOL } from './config.js';












const TOOLS = [
  { id: 'water',  name: 'Water',       liquid: WATER,  color: '#3c8ae0', key: '1' },
  { id: 'lava',   name: 'Lava',        liquid: LAVA,   color: '#ff6a1a', key: '2' },
  { id: 'honey',  name: 'Honey',       liquid: HONEY,  color: '#eca42a', key: '3' },
  { id: 'aether', name: 'Aether',      liquid: AETHER, color: '#b98cf5', key: '4' },
  { id: 'quick',  name: 'Quicksilver', liquid: QUICK,  color: '#c4ccd8', key: '5' },
  { id: 'acid',   name: 'Acid',        liquid: ACID,   color: '#7dec4a', key: '6' },
  { id: 'frost',  name: 'Frost',       liquid: FROST,  color: '#a8e4ff', key: '7' },
  { id: 'steam',  name: 'Steam',       liquid: STEAM,  color: '#dfe6ee', key: '8' },
  { id: 'oil',    name: 'Oil',         liquid: OIL,    color: '#3a2e1e', key: '9' },
  { id: 'slime',  name: 'Slime',       liquid: SLIME,  color: '#4fc46a', key: '0' },
  { id: 'bloom',  name: 'Bloomwater',  liquid: BLOOM,  color: '#e486c8' },
  { id: 'mud',    name: 'Mud',         liquid: MUD,    color: '#6b4a2c' },
  { id: 'storm',  name: 'Stormwater',  liquid: STORM,  color: '#3a5ccf' },
  { id: 'molten', name: 'Molten metal', liquid: MOLTEN, color: '#ffb040' },
  { id: 'nitro',  name: 'Nitro',       liquid: NITRO,  color: '#e8d070', key: 'u' },
  { id: 'methane', name: 'Methane',    liquid: METHANE, color: '#c9e6a0' },
  { id: 'poison', name: 'Poison gas',  liquid: POISON, color: '#9ccf3a' },
  { id: 'lye',    name: 'Lye',         liquid: LYE,    color: '#b4c4e6' },
  { id: 'co2',    name: 'Carbon dioxide', liquid: CO2, color: '#c8d2d8' },
  { id: 'void',   name: 'Void ink',    liquid: VOID,   color: '#140c1e' },
  { id: 'mimic',  name: 'Mimic',       liquid: MIMIC,  color: '#c8c8d0' },
  { id: 'coolant', name: 'Coolant',    liquid: COOLANT, color: '#38c8b0' },
  { id: 'ferro',  name: 'Ferrofluid',  liquid: FERRO,  color: '#1a1c22' },
  { id: 'light',  name: 'Liquid light', liquid: LIGHT, color: '#fff4b0' },
  { id: 'fert',   name: 'Fertiliser',  liquid: FERT,   color: '#7a9a30' },
  { id: 'hydrogen', name: 'Hydrogen',  liquid: HYDROGEN, color: '#e2eaff' },
  { id: 'oxygen', name: 'Oxygen',      liquid: OXYGEN, color: '#c4e2ff' },
  { id: 'mslag',  name: 'Molten slag', liquid: MSLAG,  color: '#e07a30' },
  { id: 'red',    name: 'Red ink',     dye: SOL_RED,    color: '#e61e28' },
  { id: 'yellow', name: 'Yellow ink',  dye: SOL_YELLOW, color: '#fad728' },
  { id: 'blue',   name: 'Blue ink',    dye: SOL_BLUE,   color: '#285fc8' },
  { id: 'dirt',   name: 'Dirt',   block: DIRT,  color: '#8a5a3b', key: 'q' },
  { id: 'stone',  name: 'Stone',  block: STONE, color: '#7c7f8c', key: 'w' },
  { id: 'ice',    name: 'Ice',    block: ICE,   color: '#a9dcf2', key: 'e' },
  { id: 'sponge', name: 'Sponge', sponge: true, color: '#e9e2c4', key: 'r' },
  { id: 'dig',    name: 'Dig',    dig: true,    color: '#2a2024', key: 't' },
  { id: 'wood',   name: 'Wood',   block: WOOD,  color: '#8a5a2e', key: 'y' },
  { id: 'sand',   name: 'Sand',   block: SAND,  color: '#e2c98a', key: 'a' },
  { id: 'salt',   name: 'Salt',   block: SALT,  color: '#f2f0ea', key: 's' },
  { id: 'soda',   name: 'Baking soda', block: SODA, color: '#eef2f6' },
  { id: 'sugar',  name: 'Sugar',  block: SUGAR, color: '#fbf6e8' },
  { id: 'sponge', name: 'Sponge block', block: SPONGE, color: '#f0d060' },
  { id: 'porous', name: 'Porous rock', block: POROUS, color: '#a89a84' },
  { id: 'wool',   name: 'Wool',        block: WOOL,   color: '#ece6dc' },
  { id: 'copper', name: 'Copper',      block: COPPER, color: '#c87a46' },
  { id: 'coral',  name: 'Coral',       block: CORAL,  color: '#ff7a8a' },
  { id: 'fuse',   name: 'Fuse cord',   block: FUSE,   color: '#a03028' },
  { id: 'magnet', name: 'Magnet',      block: MAGNET, color: '#c03030' },
  { id: 'membrane', name: 'Membrane',  device: MEMBRANE, color: '#7a8aa0' },
  { id: 'glass',  name: 'Glass',  block: GLASS, color: '#bfe6f0' },
  { id: 'snow',   name: 'Snow',   block: SNOW,  color: '#f4f8ff' },
  { id: 'clay',   name: 'Clay',   block: CLAY,  color: '#a8705a' },
  { id: 'permafrost', name: 'Permafrost', block: PERMAFROST, color: '#6c7f8c' },
  { id: 'seed',   name: 'Seed',   seed: true,   color: '#5fb84a' },
  { id: 'metal',  name: 'Metal',  block: METAL, color: '#8d96a6' },
  { id: 'ore',    name: 'Ore',    block: ORE,   color: '#b0643a' },
  { id: 'slag',   name: 'Slag',   block: SLAG,  color: '#4a4240' },
  { id: 'rust',   name: 'Rust',   block: RUST,  color: '#a0502a' },
  { id: 'fnitro', name: 'Frozen nitro', block: FNITRO, color: '#f0e4b0' },
  { id: 'heat',   name: 'Heat',   heat: true,   color: '#ff5a36', key: 'f' },
  { id: 'chill',  name: 'Chill',  chill: true,  color: '#8fd8ff', key: 'g' },
  { id: 'pump',     name: 'Pump',     pump: true,         color: '#5f6a80', key: 'p' },
  { id: 'wire',     name: 'Wire',     wire: true,         color: '#f2c94c', key: 'k' },
  { id: 'lever',    name: 'Lever',    device: LEVER,      color: '#d64545' },
  { id: 'plate',    name: 'Plate',    device: PLATE,      color: '#9aa5ba' },
  { id: 'sensor',   name: 'Sensor',   device: SENSOR,     color: '#7fe0ff' },
  { id: 'thermo',   name: 'Temperature sensor', device: THERMO, color: '#d64545' },
  { id: 'depth',    name: 'Depth sensor', device: DEPTH,    color: '#2f7d99' },
  { id: 'timer',    name: 'Timer',    device: TIMER,      color: '#e9e2c4' },
  { id: 'gate',     name: 'Gate',     device: GATE,       color: '#232833' },
  { id: 'spring',   name: 'Spring',   device: SPRING,     color: '#3c8ae0' },
  { id: 'drain',    name: 'Drain',    device: DRAIN,      color: '#0f1218' },
  { id: 'pipe',     name: 'Pipe',     block: PIPE, pipe: true, color: '#5f6a80', key: 'n' },
  { id: 'valve',    name: 'Valve',    device: VALVE,      color: '#d64545' },
  { id: 'filter',   name: 'Filter',   device: FILTER,     color: '#7fe0ff' },
  { id: 'turbine',  name: 'Turbine',  device: TURBINE,    color: '#c4ccd8' },
  { id: 'wheel',    name: 'Water wheel', device: WHEEL,   color: '#8a5a2e' },
  { id: 'boiler',   name: 'Boiler',   device: BOILER,     color: '#c85a1e' },
  { id: 'separator', name: 'Separator', device: SEPARATOR, color: '#9fdcf7' },
  { id: 'windmill', name: 'Windmill', device: WINDMILL,   color: '#efe8d8' },
  { id: 'solar',    name: 'Solar panel', device: SOLAR,   color: '#1e3a6e' },
  { id: 'battery',  name: 'Battery',  device: BATTERY,    color: '#3a6a3e' },
  { id: 'lamp',     name: 'Lamp',     device: LAMP,       color: '#fff2b0' },
  { id: 'pixel',    name: 'Pixel',    device: PIXEL,      color: '#ffb43c' },
  { id: 'motor',    name: 'Motor',    device: MOTOR,      color: '#9aa5ba' },
  { id: 'emagnet',  name: 'Electromagnet', device: EMAGNET, color: '#c87a46' },
  { id: 'geyser',   name: 'Geyser',   device: GEYSER,     color: '#5e5456' },
  { id: 'vent',     name: 'Gas vent', device: VENT,       color: '#d8d040' },
  { id: 'and',      name: 'AND',      device: AND,        color: '#f2c94c' },
  { id: 'or',       name: 'OR',       device: OR,         color: '#f2c94c' },
  { id: 'not',      name: 'NOT',      device: NOT,        color: '#f2c94c' },
  { id: 'counter',  name: 'Counter',  device: COUNTER,    color: '#f2c94c' },
  { id: 'crate',    name: 'Crate',    place: 'crate',     color: '#b07a3e', key: 'c' },
  { id: 'plank',    name: 'Plank',    place: 'plank',     color: '#c08a4a' },
  { id: 'raft',     name: 'Raft',     place: 'raft',      color: '#d29a5a' },
  { id: 'boat',     name: 'Boat',     place: 'boat',      color: '#9a6634' },
  { id: 'balloon',  name: 'Balloon',  place: 'balloon',   color: '#b98cf5' },
  { id: 'weight',   name: 'Weight',   place: 'weight',    color: '#4b525e', key: 'v' },
  { id: 'explorer', name: 'Explorer', place: 'explorer',  color: '#2fa59a', key: 'x' },
  { id: 'fish',       name: 'Fish',       place: 'fish',       color: '#f0a040' },
  { id: 'pike',       name: 'Pike',       place: 'pike',       color: '#5a8a4a' },
  { id: 'moth',       name: 'Moth',       place: 'moth',       color: '#e8e0c8' },
  { id: 'bird',       name: 'Bird',       place: 'bird',       color: '#3a3440' },
  { id: 'salamander', name: 'Salamander', place: 'salamander', color: '#ff7a2a' },
  { id: 'slimeling',  name: 'Slimeling',  place: 'slimeling',  color: '#4fc46a' },
];
let tool = TOOLS[0];
const palette = buildPalette(TOOLS, { pick: i => selectTool(i), allowed: tl => allowed(tl) });
const toolBtns = palette.buttons;
palette.markSelected(TOOLS.indexOf(tool));
const worldMenu = buildWorldMenu({ afterLoad: () => { editorLoaded(); enterMode(); } });
setupHud();
function selectTool(i) {
  if (!allowed(TOOLS[i])) return;   // puzzles limit the tools, whether picked by click or key
  tool = TOOLS[i];
  if (tool.liquid) S.lastLiquid = tool.liquid;
  if (!tool.wire) S.pendingLink = -1;
  palette.markSelected(i);
}

const brushEl = document.getElementById('brush');
const speedEl = document.getElementById('speed');
const pauseEl = document.getElementById('pause');
const lightEl = document.getElementById('light');
const hoverEl = document.getElementById('hover');
const statsEl = document.getElementById('stats');
let paused = false;
function setPaused(v) { paused = v; pauseEl.setAttribute('aria-pressed', v ? 'true' : 'false'); pauseEl.firstChild.nodeValue = v ? 'Resume ' : 'Pause '; }
function setLighting(v) { S.lighting = v; lightEl.setAttribute('aria-pressed', v ? 'true' : 'false'); }
pauseEl.addEventListener('click', () => setPaused(!paused));
lightEl.addEventListener('click', () => setLighting(!S.lighting));
const heatEl = document.getElementById('heatview');
function setHeatView(v) { S.heatView = v; heatEl.setAttribute('aria-pressed', v ? 'true' : 'false'); }
heatEl.addEventListener('click', () => setHeatView(!S.heatView));
const pressureEl = document.getElementById('pressure');
function setPressure(v) { S.pressure = v; pressureEl.setAttribute('aria-pressed', v ? 'true' : 'false'); }
pressureEl.addEventListener('click', () => setPressure(!S.pressure));
// View and sound toggles. Their state can change elsewhere (panning stops following), so updateStatus re-syncs them.
const TOGGLES = [];
function toggle(id, get, set) {
  const el = document.getElementById(id);
  const flip = () => { set(!get()); el.setAttribute('aria-pressed', get() ? 'true' : 'false'); };
  el.addEventListener('click', flip);
  TOGGLES.push([el, get]);
  return flip;
}
function syncToggles() { for (const [el, get] of TOGGLES) el.setAttribute('aria-pressed', get() ? 'true' : 'false'); }
const toggleFollow = toggle('follow', () => S.follow, v => { S.follow = v; });
const toggleZoom = toggle('zoom', () => S.zoom === 2, v => setZoom(v ? 2 : 1));
const toggleChunks = toggle('chunks', () => S.showChunks, v => { S.showChunks = v; });
S.showHud = recall('tidepool.hud', true);   // the explorer's health and inventory panel, remembered between visits
const toggleHud = toggle('hudToggle', () => S.showHud, v => { S.showHud = v; remember('tidepool.hud', v); });
const toggleSound = toggle('sound', () => S.sound, v => enableSound(v));
const toggleMusic = toggle('music', () => S.music, v => enableMusic(v));
const timeEl = document.getElementById('timeMode');   // day and night, always day, always night, or stopped
timeEl.addEventListener('change', () => setTimeMode(timeEl.value));
const toggleWeather = toggle('weather', () => S.weather, v => { S.weather = v; });
const toggleMomentum = toggle('momentum', () => S.momentum, v => { S.momentum = v; if (!v) vel.fill(0); });
document.getElementById('rainNow').addEventListener('click', () => { if (!S.weather) toggleWeather(); startRain(); });
document.getElementById('stepBtn').addEventListener('click', () => { setPaused(true); step(); });
document.getElementById('drain').addEventListener('click', () => { checkpoint(); liq.fill(0); typ.fill(0); fire.fill(0); sol.fill(0); drop.fill(0); vel.fill(0); wakeAll(); });
document.getElementById('regen').addEventListener('click', () => { checkpoint(); S.seed = (Math.random() * 1e9) | 0; generate(); enterMode(); });

// Puzzle levels: the Mode menu switches between the sandbox and each level; a level shows only the tools it allows.
const levelEl = document.getElementById('level'), goalEl = document.getElementById('goal');
LEVELS.forEach((L, i) => levelEl.add(new Option(`${i + 1}. ${L.name}`, i)));
levelEl.addEventListener('change', () => {
  checkpoint();
  const v = levelEl.value;
  if (v === 'edit') openEditor();   // the level editor works on the world as it is
  else if (v === 'custom') return;
  else if (+v < 0) {
    if (S.editing && !S.level) closeEditor();   // leaving the editor keeps its world
    else { if (S.level && !S.level.custom) { S.weather = S.sandboxWeather; S.pressure = S.sandboxPressure ?? true; } closeEditor(); generate(); }   // puzzles set weather and pressure; give the sandbox its settings back
  } else { closeEditor(); startLevel(+v); }
  enterMode();
});
document.getElementById('levelRestart').addEventListener('click', () => {
  if (!S.level) return;
  if (S.level.custom) restartCustom(); else startLevel(S.level.index);
  enterMode();
});
document.getElementById('levelEdit').addEventListener('click', () => { backToEditor(); enterMode(); });
document.getElementById('levelNext').addEventListener('click', () => { if (S.level && S.level.done && S.level.index + 1 < LEVELS.length) { startLevel(S.level.index + 1); enterMode(); } });
function allowed(tl) { return !S.level || S.level.tools.includes(tl.id); }
// Shows the tools and buttons that fit the current mode, and keeps the selected tool one of them.
function enterMode() {
  const custom = !!(S.level && S.level.custom);
  levelEl.querySelector('[value="custom"]').hidden = !custom;
  levelEl.value = S.editing ? 'edit' : custom ? 'custom' : S.level ? S.level.index : -1;
  document.getElementById('editor').hidden = !S.editing;
  document.getElementById('levelEdit').hidden = !canGoBack();
  if (S.editing) fillEditor();
  palette.refresh(!!S.level);
  for (const id of ['drain', 'regen', 'rainNow', 'weather', 'worldLabel']) document.getElementById(id).hidden = !!S.level;
  goalEl.hidden = !S.level;
  if (!allowed(tool)) selectTool(TOOLS.findIndex(allowed));
  snapToExplorer();
}

function inBrush(dx, dy, r) { return dx * dx + dy * dy <= r * r + r * 0.6; }
function applyAt(cx, cy, erase) {
  if (erase && S.level && !S.level.tools.includes('dig')) return;   // right-click digs only where digging is allowed
  const r = +brushEl.value;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!inBrush(dx, dy, r)) continue;
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    wake(k); heatWake(k);
    if ((erase || tool.dig || tool.block) && devices.has(k)) removeDevice(k);
    const isPump = solid[k] === PUMP_IN || solid[k] === PUMP_OUT;
    if (!erase && tool.seed) { if (dx === 0 && dy === 0) plantSeed(k); continue; }
    if (!erase && tool.heat) { temp[k] = Math.min(1800, temp[k] + 60); continue; }   // hot enough to melt iron
    if (!erase && tool.chill) { temp[k] = Math.max(-80, temp[k] - 30); continue; }
    if (erase || tool.dig) { if (solid[k]) { if (isPump) removePump(k); solid[k] = 0; markDirty(x, y); } }
    if (erase || tool.sponge) { liq[k] = 0; typ[k] = 0; continue; }
    if (tool.liquid && !solid[k]) { sfx('pour', x * T + 4, y * T + 4, tool.liquid); liq[k] = 255; typ[k] = tool.liquid; temp[k] = LIQ[tool.liquid].paintT; clearSol(k); drop[k] = 0; vel[k] = 0; }
    if (tool.dye && !solid[k]) {   // ink colours the water already there, or pours new inked water
      if (!liq[k]) { liq[k] = 255; typ[k] = WATER; temp[k] = LIQ[WATER].paintT; clearSol(k); }
      if (typ[k] === WATER) sol[k * NSOL + tool.dye] = 255;
    }
    if (tool.block && solid[k] !== tool.block) { if (isPump) removePump(k); solid[k] = tool.block; held[k] = 0; liq[k] = 0; typ[k] = 0; markDirty(x, y); }
  }
}

const cursor = { x: -1, y: -1 };
let pressing = false, eraseBtn = false, last = null, panning = null;
function toTile(e) {
  const w = screenToWorld(e);
  return { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
function toPixel(e) { return screenToWorld(e); }
canvas.addEventListener('pointerdown', e => {
  if (marker.active && S.editing && e.button === 0) { canvas.setPointerCapture(e.pointerId); markFrom(toTile(e)); return; }   // marking a level's goal area
  if (e.button === 1 || e.shiftKey) {   // Shift- or middle-drag pans the camera
    e.preventDefault(); canvas.setPointerCapture(e.pointerId); panning = { x: e.clientX, y: e.clientY }; return;
  }
  const p = toTile(e), px = toPixel(e);
  cursor.x = p.x; cursor.y = p.y;
  checkpoint();   // every click edits the world, so undo can take it back
  if (e.button === 2) {   // right-click removes a body (not in puzzles), otherwise it erases; it never uses the selected tool
    const i = S.level ? -1 : bodies.findIndex(b => px.x >= b.x && px.x < b.x + b.w && px.y >= b.y && px.y < b.y + b.h);
    if (i >= 0) { bodies.splice(i, 1); return; }
  } else if (tool.pump) { usePump(p.x, p.y); return; }
  else if (tool.wire || tool.device) {
    if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H) { if (tool.wire) linkClick(p.y * W + p.x); else useDeviceTool(tool.device, p.y * W + p.x); }
    return;
  }
  else if (tool.place) {
    const K = KINDS[tool.place], b = { x: px.x - K.w / 2, y: px.y - K.h / 2, w: K.w, h: K.h };
    if (!collides(b, b.x, b.y)) { const nb = addBody(tool.place, b.x, b.y); if (nb && KINDS[tool.place].lift) tieBalloon(nb); }
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  pressing = true; eraseBtn = e.button === 2;
  last = null;
  paintStroke();   // a quick click still paints, even if it ends before the next frame
});
canvas.addEventListener('pointermove', e => {
  if (panning) {
    const r = canvas.getBoundingClientRect();
    panBy(-(e.clientX - panning.x) / r.width * VIEW.w, -(e.clientY - panning.y) / r.height * VIEW.h);
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  const p = toTile(e); cursor.x = p.x; cursor.y = p.y;
  if (marker.from) { markTo({ x: Math.max(0, Math.min(W - 1, p.x)), y: Math.max(0, Math.min(H - 1, p.y)) }); return; }
  paintStroke();
});
canvas.addEventListener('wheel', e => { e.preventDefault(); const w = screenToWorld(e); setZoom(e.deltaY < 0 ? 2 : 1, w.x, w.y); }, { passive: false });
const release = () => { pressing = false; last = null; panning = null; if (marker.from) markEnd(); };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!pressing) cursor.x = -1; });

function paintStroke() {
  if (!pressing || cursor.x < 0) return;
  const from = last || cursor;
  const n = Math.max(Math.abs(cursor.x - from.x), Math.abs(cursor.y - from.y), 1);
  for (let i = 1; i <= n; i++) applyAt(Math.round(from.x + (cursor.x - from.x) * i / n), Math.round(from.y + (cursor.y - from.y) * i / n), eraseBtn);
  last = { x: cursor.x, y: cursor.y };
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const ACTIONS = ['Enter', 'd', 'D'];   // the explorer's bucket and pickaxe (js/explorer.js)
addEventListener('keyup', e => {
  if (ARROWS.includes(e.key)) keys[e.key] = false;
  if (ACTIONS.includes(e.key)) { keys[e.key] = false; if (e.key.toLowerCase() === 'd') keys.d = keys.D = false; }
});
addEventListener('blur', () => { for (const a of [...ARROWS, ...ACTIONS]) keys[a] = false; });
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('select,input')) return;
  if (ACTIONS.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target.closest && e.target.closest('button,summary,a')) && bodies.some(b => b.kind === 'explorer')) {
    e.preventDefault(); keys[e.key] = true; return;
  }
  if (ARROWS.includes(e.key)) {
    if (bodies.some(b => b.kind === 'explorer')) e.preventDefault();
    keys[e.key] = true;
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); worldMenu.undoNow(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  const i = TOOLS.findIndex(tl => tl.key === key && allowed(tl));
  if (i >= 0) selectTool(i);
  else if (e.key === '/' && !S.level) { e.preventDefault(); palette.focusSearch(); }
  else if (e.code === 'Space') { if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); setPaused(!paused); }
  else if (key === 'l') setLighting(!S.lighting);
  else if (key === 'h') setHeatView(!S.heatView);
  else if (key === 'o') setPressure(!S.pressure);
  else if (key === 'j') toggleFollow();
  else if (key === 'z') toggleZoom();
  else if (key === 'b') toggleChunks();
  else if (key === 'm') toggleSound();
  else if (key === 'i' && !S.level) toggleWeather();
  else if (e.key === '[') brushEl.value = Math.max(0, +brushEl.value - 1);
  else if (e.key === ']') brushEl.value = Math.min(5, +brushEl.value + 1);
});

const BLOCKS = ['', 'dirt', 'stone', 'obsidian', 'honeycomb', 'crisp honey', 'ice', 'crystal', 'inlet pump', 'outlet pump', 'basalt', 'lever', 'pressure plate', 'liquid sensor', 'timer', 'floodgate', 'spring', 'drain', 'wood', 'mossy stone', 'salt', 'sand', 'glass', 'clay brick',
  'metal', 'pipe', 'valve', 'pipe filter', 'steam turbine', 'water wheel', 'boiler', 'separator', 'AND gate', 'OR gate', 'NOT gate', 'counter', 'plant', 'leaf',
  'snow', 'permafrost', 'clay', 'windmill', 'geyser', 'gas vent', 'baking soda', 'salt crystal',
  'sponge', 'wet sponge', 'wet soil', 'porous rock', 'wool', 'copper', 'membrane', 'coral', 'bleached coral', 'fuse cord', 'magnet',
  'battery', 'lamp', 'motor', 'electromagnet', 'solar panel', 'ore', 'slag', 'temperature sensor', 'depth sensor', 'pixel', 'sugar', 'rust', 'frozen nitro'];
setupEditor({ tools: TOOLS, blocks: BLOCKS, enterMode });
// Text from a level code (its name, goal and labels) is shown as text, never as markup.
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }
function solText(k) {
  let s = '';
  for (let i = 0; i < NSOL; i++) if (sol[k * NSOL + i] > 4) s += ` · ${SOL_NAMES[i]} ${sol[k * NSOL + i]}`;
  return s;
}
function pumpState(k) {
  const pp = pumps.find(q => q.in === k || q.out === k);
  if (!pp) return ' · not linked yet';
  if (!pp.on) return ' · off (click with Pump to switch on)';
  return pp.active && LIQ[pp.shown] ? ` · moving ${LIQ[pp.shown].name}` : ' · on, nothing to pump';
}
function updateStatus() {
  worldMenu.update();
  updateHud(BLOCKS);
  syncToggles();
  if (timeEl.value !== (S.timeMode || 'cycle')) timeEl.value = S.timeMode || 'cycle';   // undo or a loaded world may change it
  if (S.level) {
    const L = S.level, state = L.done ? ' · <span class="done">complete!</span>' : L.failed ? ` · <span class="failed">${escapeHtml(L.failed)} Restart to try again.</span>` : '';
    document.getElementById('goalText').innerHTML = `<b>${L.custom ? '' : `${L.index + 1}. `}${escapeHtml(L.name)}</b> · ${escapeHtml(L.goal)} · ${escapeHtml(L.text)}${state}`;   // custom levels' text comes from their maker
    document.getElementById('levelNext').hidden = !(L.done && !L.custom && L.index + 1 < LEVELS.length);
  }
  if (tool.pump && S.pendingIn >= 0) hoverEl.innerHTML = 'Inlet placed · click an open tile to place its outlet';
  else if (tool.wire && S.pendingLink >= 0) hoverEl.innerHTML = 'Click gates, springs, drains or pumps to link or unlink them · click the switch again to finish';
  else if (cursor.x >= 0 && cursor.x < W && cursor.y >= 0 && cursor.y < H) {
    const k = cursor.y * W + cursor.x;
    const what = devices.has(k) ? deviceState(k) : solid[k] ? BLOCKS[solid[k]] + (solid[k] === PUMP_IN || solid[k] === PUMP_OUT ? pumpState(k) : '') : liq[k] ? `${LIQ[typ[k]].name} <b>${liq[k]}</b>/255 · pH ${phOf(k).toFixed(1)}${solText(k)}` : 'empty';
    hoverEl.innerHTML = `tile ${cursor.x}, ${cursor.y} · ${what}${fall[k] ? ' · falling' : ''}${fire[k] ? ' · burning' : ''}${charged(k) ? ` · <b>live</b> (${Math.round(powerLeft(k) * 100)}% power)` : ''}${deco[k] ? ' · glowcaps' : ''} · ${Math.round(temp[k])}°`;
  }
  statsEl.innerHTML = `wet tiles <b>${lastStats.cells}</b> · volume <b>${(lastStats.vol / 255).toFixed(1)}</b> full tiles · tick <b>${S.tick}</b> · ${clockText()}${S.level ? '' : ` · ${biomeAt((VIEW.x + VIEW.w / 2) / T).name}${spellAt((VIEW.x + VIEW.w / 2) / T) ? ` (${spellAt((VIEW.x + VIEW.w / 2) / T)} spell)` : ''}`}${S.weather ? ` · ${seasonName()}, day ${Math.floor(day()) + 1} · wind ${S.wind > 0.05 ? '→' : S.wind < -0.05 ? '←' : '·'}${Math.round(Math.abs(S.wind) * 10)}${S.rain > 0.05 ? ' · rain' : ''}` : ''}${S.showChunks ? ` · <b>${awake.reduce((n, v) => n + (v > 0), 0)}</b> of ${awake.length} chunks awake` : ''}`;
}

export { TOOLS, tool, allowed, enterMode, toolBtns, solText, selectTool, brushEl, speedEl, pauseEl, lightEl, hoverEl, statsEl, paused, setPaused, setLighting, heatEl, setHeatView, pressureEl, setPressure, TOGGLES, toggle, syncToggles, toggleFollow, toggleZoom, toggleChunks, toggleHud, toggleSound, toggleMusic, toggleWeather, inBrush, applyAt, cursor, pressing, eraseBtn, last, panning, toTile, toPixel, release, paintStroke, ARROWS, BLOCKS, pumpState, updateStatus };
