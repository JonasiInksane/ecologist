// The level editor: build a level in the sandbox with every tool, then set its goal, a way to lose and the tools it
// allows here, play-test it, and copy it as a level code. A level code is a world code taken as the level starts
// (S.level holds it), so Save & share's Load code plays it, and Restart goes back to how it started.
// The draft (S.draft) and whether the editor is open (S.editing) are part of the world, so saves and undo keep them.
import { KINDS } from './bodies.js';
import { LAVA, WATER } from './config.js';
import { describe, startCustom } from './levels.js';
import { LIQ } from './liquids.js';
import { capture, packWorld, restore } from './snapshot.js';
import { S } from './world.js';

const $ = id => document.getElementById(id);
const EXPLORER_TOOLS = [['bucket', 'Explorer’s bucket'], ['pickaxe', 'Explorer’s pickaxe']];
let editStart = null, playStart = null;   // the world when Play test was pressed (Back to editor), and as the level starts (Restart)
let blockNames = [];
// Marking the goal area: after the button, the next drag on the playfield sets it (js/input.js passes the tiles).
const marker = { active: false, from: null };

function newDraft() {
  return { name: '', goal: '', region: null, kind: 'liquid', what: WATER, label: 'water', amount: 10, lose: 'none', loseWhat: LAVA, loseLabel: 'lava', loseAmount: 3, tools: ['dig'] };
}
const liquids = () => LIQ.map((L, t) => L && [t, L.name]).filter(Boolean);
const bodyKinds = () => Object.keys(KINDS).filter(k => k !== 'explorer').map(k => [k, k]);
function options(sel, list, value) {
  sel.replaceChildren(...list.map(([v, name]) => new Option(name, v)));
  sel.value = String(value);
  if (sel.selectedIndex < 0) sel.selectedIndex = 0;
}
// The draft into the panel.
function fillEditor() {
  const d = S.draft;
  if (!d) return;
  $('edName').value = d.name; $('edGoal').value = d.goal; $('edGoal').placeholder = describe(d);
  $('edKind').value = d.kind; $('edAmount').value = d.amount; $('edLose').value = d.lose; $('edLoseAmount').value = d.loseAmount;
  const list = d.kind === 'liquid' ? liquids() : d.kind === 'block' ? blockNames : d.kind === 'creature' ? bodyKinds() : [];
  $('edWhat').hidden = !list.length; $('edAmount').hidden = d.kind === 'explorer';
  if (list.length) options($('edWhat'), list, d.what);
  $('edLoseWhat').hidden = d.lose === 'none'; $('edLoseAmount').hidden = d.lose !== 'creatures';
  if (d.lose !== 'none') options($('edLoseWhat'), d.lose === 'liquid' ? liquids() : bodyKinds(), d.loseWhat);
  const r = d.region;
  $('edRegionText').textContent = r ? `${r.x1 - r.x0 + 1} × ${r.y1 - r.y0 + 1} tiles at ${r.x0}, ${r.y0}` : 'no area yet';
  $('edRegion').textContent = marker.active ? 'Drag over the area…' : r ? 'Mark it again' : 'Mark the goal area';
  for (const box of $('edTools').querySelectorAll('input')) box.checked = d.tools.includes(box.value);
  $('edToolCount').textContent = d.tools.length;
}
// The panel into the draft.
function read() {
  const d = S.draft, num = (id, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+$(id).value) || lo));
  const kind = $('edKind').value, lose = $('edLose').value;
  if (kind !== d.kind) {   // a sensible first choice for the new kind of goal
    d.what = kind === 'liquid' ? WATER : kind === 'block' ? +blockNames[0][0] : kind === 'creature' ? 'fish' : null;
  } else if (!$('edWhat').hidden) d.what = kind === 'creature' ? $('edWhat').value : +$('edWhat').value;
  if (lose !== d.lose) d.loseWhat = lose === 'liquid' ? LAVA : lose === 'creatures' ? 'fish' : null;
  else if (lose !== 'none') d.loseWhat = lose === 'liquid' ? +$('edLoseWhat').value : $('edLoseWhat').value;
  Object.assign(d, { name: $('edName').value.trim(), goal: $('edGoal').value.trim(), kind, lose, amount: num('edAmount', 1, 999), loseAmount: num('edLoseAmount', 1, 99) });
  d.label = kind === 'liquid' ? LIQ[d.what].name : kind === 'block' ? (blockNames.find(([v]) => +v === d.what) || [0, 'block'])[1] : kind === 'creature' ? d.what : '';
  d.loseLabel = lose === 'liquid' ? LIQ[d.loseWhat].name : lose === 'creatures' ? d.loseWhat : '';
  d.tools = [...$('edTools').querySelectorAll('input:checked')].map(b => b.value).filter((v, i, a) => a.indexOf(v) === i);
  fillEditor();
}
function say(text) { $('edMsg').textContent = text; }
function ready() {
  const d = S.draft;
  if (!d.region) { say('Mark the goal area first: press Mark the goal area, then drag over it.'); return false; }
  return true;
}
// Starts the draft as a level in the world as it is, remembering how to get back.
function playTest(enterMode) {
  read();
  if (!ready()) return;
  editStart = capture();
  S.editing = false;
  startCustom(S.draft);
  playStart = capture();
  say('');
  enterMode();
}
async function copyCode() {
  read();
  if (!ready()) return;
  const keep = capture();
  S.editing = false;
  startCustom(S.draft);
  const snap = capture();
  restore(keep);
  const code = await packWorld(snap), box = $('edCode');
  try { await navigator.clipboard.writeText(code); box.hidden = true; say(`Level code copied (${(code.length / 1024).toFixed(0)} KB). Anyone can play it: Save & share › Load code.`); }
  catch { box.hidden = false; box.value = code; box.select(); say('Copying isn’t allowed here, so the code is in the box below, selected: press Ctrl+C to copy it.'); }
}
// Restart in a custom level: back to how it started.
function restartCustom() { if (playStart) restore(playStart); }
function canGoBack() { return !!editStart && !!S.level && !!S.level.custom; }
function backToEditor() { if (editStart) restore(editStart); }
// Opening the editor: from a custom level, edit that level from its start; from a puzzle, edit its arena; from the
// sandbox, edit the world as it is.
function openEditor() {
  if (S.level) {
    const L = S.level;
    if (L.custom && playStart) restore(playStart);
    S.draft = L.custom ? { ...newDraft(), ...structuredClone(S.level.custom), name: L.name, goal: L.goal, region: { ...L.region }, tools: L.tools.slice() }
      : { ...newDraft(), name: `My ${L.name}`, region: { ...L.region }, tools: L.tools.slice() };
    S.level = null;
  }
  if (!S.draft) S.draft = newDraft();
  S.editing = true;
  editStart = playStart = null;
}
function closeEditor() { S.editing = false; marker.active = false; marker.from = null; }
// After a world is loaded or undone: a newly loaded custom level restarts from how it is now (an undo inside the same
// level keeps its start and its way back to the editor); the panel shows the draft.
function editorLoaded() {
  const L = S.level;
  if (L && L.custom && (!playStart || !playStart.state.level || playStart.state.level.started !== L.started)) { playStart = capture(); editStart = null; }
  if (S.editing) fillEditor();
}
function markFrom(p) { marker.from = p; markTo(p); }
function markTo(p) {
  const a = marker.from;
  S.draft.region = { x0: Math.min(a.x, p.x), y0: Math.min(a.y, p.y), x1: Math.max(a.x, p.x), y1: Math.max(a.y, p.y) };
}
function markEnd() { marker.active = false; marker.from = null; fillEditor(); }

// blocks: block names by id (BLOCKS in js/input.js); tools: the tool list (TOOLS).
function setupEditor({ tools, blocks, enterMode }) {
  blockNames = blocks.map((name, id) => [id, name]).filter(([id, name]) => id && name);
  const seen = new Set(), boxes = [];
  for (const [id, name] of [...EXPLORER_TOOLS, ...tools.map(t => [t.id, t.name])]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const label = document.createElement('label'), box = document.createElement('input');
    box.type = 'checkbox'; box.value = id;
    label.append(box, name);
    boxes.push(label);
  }
  $('edTools').replaceChildren(...boxes);
  for (const id of ['edName', 'edGoal', 'edKind', 'edAmount', 'edWhat', 'edLose', 'edLoseAmount', 'edLoseWhat']) $(id).addEventListener('change', () => { if (S.draft) read(); });
  $('edTools').addEventListener('change', () => read());
  $('edRegion').addEventListener('click', () => { marker.active = true; fillEditor(); say('Drag over the goal area on the playfield.'); });
  $('edPlay').addEventListener('click', () => playTest(enterMode));
  $('edCopy').addEventListener('click', () => { copyCode().catch(e => say(`Couldn’t make the code: ${e.message}`)); });
}

export { EXPLORER_TOOLS, marker, newDraft, fillEditor, read, playTest, copyCode, restartCustom, canGoBack, backToEditor, openEditor, closeEditor, editorLoaded, markFrom, markTo, markEnd, setupEditor };
