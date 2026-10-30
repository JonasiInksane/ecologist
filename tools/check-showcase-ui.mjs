// Event-level integration with an in-memory DOM. No browser automation or visual claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const elements = new Map(), windowEvents = new Map();
const testContext = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} };
class TestElement {
  constructor(tag = 'div', id = '') {
    Object.assign(this, { tagName: tag.toUpperCase(), id, value: '', textContent: '', innerHTML: '', hidden: false, children: [], dataset: {}, attributes: {}, handlers: new Map(), firstChild: { nodeValue: '' }, width: 1024, height: 576 });
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.queries = new Map();
  }
  addEventListener(type, fn) { const handlers = this.handlers.get(type) || []; handlers.push(fn); this.handlers.set(type, handlers); }
  async emit(type, event = {}) { for (const fn of this.handlers.get(type) || []) await fn({ target: this, preventDefault() {}, ...event }); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  add(child) { this.append(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  querySelector(selector) {
    if (!this.queries.has(selector)) this.queries.set(selector, new TestElement());
    return this.queries.get(selector);
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => child instanceof TestElement ? [child, ...child.querySelectorAll(selector)] : [])
      .filter(child => selector.startsWith('input') && child.tagName === 'INPUT' && (!selector.includes(':checked') || child.checked));
  }
  closest() { return null; }
  contains(target) { return this === target || this.children.some(child => child instanceof TestElement && child.contains(target)); }
  getContext() { return testContext; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1024, height: 576 }; }
  setPointerCapture() {}
  focus() {}
  select() {}
  blur() {}
  click() { return this.emit('click'); }
}
const element = id => {
  if (!elements.has(id)) elements.set(id, new TestElement(id === 'c' ? 'canvas' : 'div', id));
  return elements.get(id);
};
globalThis.document = { getElementById: element, createElement: tag => new TestElement(tag), addEventListener() {}, querySelectorAll: () => [] };
globalThis.addEventListener = (type, fn) => { const handlers = windowEvents.get(type) || []; handlers.push(fn); windowEvents.set(type, handlers); };
globalThis.Option = class extends TestElement { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
globalThis.matchMedia = () => ({ matches: false });
element('brush').value = '0'; element('speed').value = '1';
const input = await import('../js/input.js');
const { S, VIEW, bodies } = await import('../js/world.js');
const { T } = await import('../js/config.js');
const { NSOL, SOL_O2, W } = await import('../js/config.js');
const { OXYGEN_REFERENCE, MG_PER_UNIT } = await import('../js/oxygen.js');
const { sol } = await import('../js/world.js');
const { computeLight, LR, LG } = await import('../js/render/lighting.js');
const { capture, restore } = await import('../js/snapshot.js');
const { history } = await import('../js/history.js');
const digest = () => {
  const snap = capture(), hash = createHash('sha256');
  for (const [key, array] of Object.entries(snap.arrays)) hash.update(key).update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  hash.update(JSON.stringify({ ...snap, arrays: undefined })); return hash.digest('hex');
};
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
const mode = async value => { element('level').value = value; await element('level').emit('change'); };
const point = (x, y, button = 0) => ({ button, pointerId: 1, clientX: (x - VIEW.x) / VIEW.w * 1024, clientY: (y - VIEW.y) / VIEW.h * 576 });
const key = async key => { for (const fn of windowEvents.get('keydown') || []) await fn({ key, code: key, target: new TestElement(), preventDefault() {} }); };
S.seed = 73; S.weather = true; S.pressure = false; S.momentum = false; S.timeMode = 'day'; S.timeShift = 0.32; S.heldPhase = 0.71;
await mode('terrarium');
check(S.terrarium?.kind === 'sealed-jar' && !S.level, 'Mode starts the separate saved jar');
check(!element('terrariumPanel').hidden && element('toolBar').hidden && element('brushGroup').hidden, 'jar presents observation controls');
check(!S.weather && S.pressure && S.momentum, 'jar uses its verified physical setup');
check(input.TOOLS.every(tool => !input.allowed(tool)) && !input.allowed(undefined), 'no material or object tool is allowed');
input.updateStatus();
check(!element('saveSections').hidden && element('seedSharing').hidden, 'actual world sharing remains available; seed sharing is hidden');
check(element('terrariumReading').textContent.includes('2 fish') && element('terrariumReading').textContent.includes('oxygen near fish'), 'live jar statistics replace sandbox statistics');
const initialSchedule = S.timeMode, waterTile = 50 * W + 35;
S.timeMode = 'day'; const beforeDisplay = digest(); computeLight(); const dayLight = LG[waterTile];
check(dayLight > 0.9 && digest() === beforeDisplay, 'glass jar is visibly lit without changing its atmosphere mask or biological state');
S.timeMode = 'night'; computeLight();
check(LG[waterTile] > 0 && LG[waterTile] < dayLight / 5, `night schedule visibly dims the same jar (${LG[waterTile]} vs day ${dayLight})`);
const modeDescriptor = S.terrarium; S.terrarium = null; S.timeMode = 'day'; computeLight();
check(LR[waterTile] === 0, 'jar display daylight does not illuminate an ordinary sealed cave');
S.terrarium = modeDescriptor; S.timeMode = initialSchedule;
const beforeReads = digest(), historySize = history.length;
for (let i = 0; i < 3; i++) input.updateStatus();
check(digest() === beforeReads, 'status reads do not change saved simulation state');
const normalJar = capture(), body = bodies.find(body => body.kind === 'fish');
const bodyTile = Math.floor((body.y + body.h / 2) / T) * W + Math.floor((body.x + body.w / 2) / T);
sol[bodyTile * NSOL + SOL_O2] = (OXYGEN_REFERENCE - 2) / MG_PER_UNIT;
S.diagnostics.deathCounts['fish:hypoxia'] = 1; input.updateStatus();
check(element('terrariumReading').textContent.includes('low oxygen') && element('terrariumReading').textContent.includes('1 hypoxia'), 'low oxygen and recorded causes are visible in the jar panel');
restore(normalJar);
const beforeBlockedControls = digest();
for (const id of ['rainNow', 'drain', 'regen', 'weather', 'pressure', 'momentum', 'buildSeed', 'copySeed']) await element(id).emit('click');
for (const action of ['1', 'q', 'c', 'x', 'p', 'k', 'o', 'i', 'Enter', 'd', 'ArrowLeft']) await key(action);
check(digest() === beforeBlockedControls && history.length === historySize, 'hidden replenishment controls and editing hotkeys do not mutate jar or add checkpoints');
// A stale selection can survive a restored mode. Every mutation entry point must still guard it.
for (const id of ['water', 'algae', 'stone', 'heat', 'chill', 'fish', 'pump', 'wire', 'lever']) {
  const descriptor = S.terrarium; S.terrarium = null;
  input.selectTool(input.TOOLS.findIndex(tool => tool.id === id)); S.terrarium = descriptor;
  const before = digest();
  await element('c').emit('pointerdown', point(35 * T, 50 * T));
  input.applyAt(35, 50, false); input.applyAt(35, 50, true); input.paintStroke();
  await element('c').emit('pointermove', point(36 * T, 50 * T));
  const fish = bodies.find(body => body.kind === 'fish');
  await element('c').emit('pointerdown', point(fish.x + fish.w / 2, fish.y + fish.h / 2, 2));
  check(digest() === before, `stale ${id} cannot edit, create devices/bodies or remove a fish`);
}
const tick = S.tick, biological = JSON.stringify(S.ecology);
await element('terrariumLight').emit('click');
check(S.timeMode === 'night' && S.tick === tick && JSON.stringify(S.ecology) === biological, 'darkness changes only the external light schedule');
await element('terrariumLight').emit('click');
check(S.timeMode === 'cycle', 'light button restores a day/night cycle');
await element('stepBtn').emit('click');
check(input.paused && S.tick === tick + 1, 'single step advances actual jar physics while paused');
const saved = capture();
await element('copyCode').emit('click');
check(element('codeInput').value.startsWith('TIDEPOOL'), 'Copy world code supplies a real jar code when clipboard is unavailable');
await element('terrariumRestart').emit('click');
check(S.tick === tick && bodies.filter(body => body.kind === 'fish').length === 2, 'explicit restart constructs a fresh jar');
await element('loadCode').emit('click');
for (let i = 0; i < 500 && !element('saveMsg').textContent.startsWith('Loaded the world'); i++) await new Promise(resolve => setTimeout(resolve, 10));
check(S.tick === saved.state.tick && S.terrarium?.startedAt === saved.state.terrarium.startedAt, 'Load code restores actual jar age');
const loaded = capture();
for (const field of ['liq', 'typ', 'sol']) { assert.deepEqual(loaded.arrays[field], saved.arrays[field], `code load retains ${field}, without setup refill`); checks++; }
check(JSON.stringify(loaded.state.ecology) === JSON.stringify(saved.state.ecology), 'code load retains finite ecological stocks');
check(element('level').value === 'terrarium' && !element('terrariumPanel').hidden && element('toolBar').hidden, 'load resynchronizes sealed controls');
for (const fn of windowEvents.get('keydown') || []) await fn({ key: 'z', ctrlKey: true, target: new TestElement(), preventDefault() {} });
check(S.tick === tick && !!S.terrarium && element('toolBar').hidden, 'keyboard undo restores the pre-load jar and its controls');
await mode('-1');
check(!S.terrarium && !S.level && S.weather && !S.pressure && !S.momentum && S.timeMode === 'day' && S.timeShift === 0.32 && S.heldPhase === 0.71, 'returning to Sandbox restores its settings and light schedule');
check(!element('toolBar').hidden && element('terrariumPanel').hidden, 'Sandbox editing controls return');
element('toolSearch').value = 'magic'; await element('toolSearch').emit('input');
const voidIndex = input.TOOLS.findIndex(tool => tool.id === 'void'), waterIndex = input.TOOLS.findIndex(tool => tool.id === 'water');
check(!input.toolBtns[voidIndex].hidden && input.toolBtns[waterIndex].hidden && input.toolBtns[voidIndex].getAttribute('aria-label').includes('fantasy'), 'palette search and accessible labels identify magical tools');
element('toolSearch').value = ''; await element('toolSearch').emit('input');
// A held paint stroke must end on entry, even before the pointer is released.
input.selectTool(input.TOOLS.findIndex(tool => tool.id === 'water'));
await element('c').emit('pointerdown', point(20 * T, 35 * T));
check(input.pressing, 'sandbox pointer starts an ordinary paint stroke');
await mode('terrarium');
const entered = digest();
await element('c').emit('pointermove', point(35 * T, 50 * T)); input.paintStroke();
check(!input.pressing && digest() === entered, 'mode entry cancels held painting');
await mode('edit');
check(S.editing && !S.terrarium && !element('editor').hidden, 'leaving for the editor clears sealed mode');
await mode('terrarium');
await mode('0');
check(S.level?.index === 0 && !S.terrarium && element('terrariumPanel').hidden, 'puzzle entry clears the sealed jar mode');
await mode('terrarium'); await mode('-1');
check(S.weather && !S.pressure && S.timeShift === 0.32 && S.heldPhase === 0.71, 'puzzle through jar preserves the effective Sandbox settings and schedule');
for (const index of ['9', '10']) {
  await mode(index);
  check(!S.follow && S.zoom === 2 && VIEW.y / T <= 40 && (VIEW.y + VIEW.h) / T >= 52 && VIEW.x / T <= 36 && (VIEW.x + VIEW.w) / T >= 60, 'showcase framing includes the complete roof, vessel and local controls at 2x');
}
console.log(`PASS ${checks} Showcase UI checks (in-memory DOM events; browser interaction remains unverified)`);
process.exit(0);
