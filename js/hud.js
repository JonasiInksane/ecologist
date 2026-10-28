// The explorer's panel in the playfield's corner: health, air (while it's below full), and, where the tools are
// allowed, the bucket and bag. Clicking a block in the bag chooses it for placing. The Explorer panel button hides it.
import { bagOf, findExplorer, toolAllowed } from './explorer.js';
import { LIQ } from './liquids.js';
import { PAL } from './render/terrain.js';
import { S } from './world.js';

let shownKey = '';
function rgb(packed) { return `rgb(${packed & 255},${(packed >>> 8) & 255},${(packed >>> 16) & 255})`; }

// names: block names by id (BLOCKS in js/input.js).
function updateHud(names) {
  const el = document.getElementById('hud'), ex = findExplorer();
  const on = !!ex && S.showHud, tools = toolAllowed('bucket') || toolAllowed('pickaxe');
  el.hidden = !on;
  if (!on) { shownKey = ''; return; }
  const inv = bagOf(ex), bk = inv.bucket;
  const hp = Math.round(ex.hp ?? 100), air = Math.round(ex.air ?? 100), fainted = ex.fainted != null && S.tick - ex.fainted < 240;
  const key = JSON.stringify([bk && [bk.t, bk.a], inv.bag, inv.pick, hp, air, fainted]);
  if (key === shownKey) return;   // rebuild only when something changed, so the buttons stay put under the pointer
  shownKey = key;
  const L = bk && LIQ[bk.t];
  const bucket = bk
    ? `<span class="sw" style="background:rgb(${L.br},${L.bg},${L.bb})"></span>Bucket: ${L.name} ${bk.a}/255`
    : '<span class="sw empty-sw"></span>Bucket: empty';
  const bag = inv.bag.length
    ? inv.bag.map((s, i) => `<button type="button" class="mini" data-slot="${i}" aria-pressed="${i === inv.pick}"><span class="sw" style="background:${PAL[s.b] ? rgb(PAL[s.b].base[0]) : '#888'}"></span>${names[s.b] || 'block'} ×${s.n}</button>`).join('')
    : '<span class="hint">empty</span>';
  const bar = (label, v, cls) => `<div class="hud-row"><span class="bar-label">${label}</span><span class="meter ${cls}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><span style="width:${v}%"></span></span>${v}</div>`;
  el.innerHTML = (fainted ? '<div class="hud-row warn">You fainted and woke up back at the start.</div>' : '') +
    bar('Health', hp, hp < 30 ? 'low' : 'hp') + (air < 100 ? bar('Air', air, air < 30 ? 'low' : 'air') : '') +
    (tools ? `<div class="hud-row">${bucket}</div><div class="hud-row"><span>Bag:</span>${bag}</div>` +
    '<div class="hud-row hint">Enter bucket · D dig or place · Shift+D next block · hold ↓ to aim down</div>' : '');
}
function setupHud() {
  document.getElementById('hud').addEventListener('click', e => {
    const b = e.target.closest('[data-slot]'), ex = findExplorer();
    if (b && ex) { bagOf(ex).pick = +b.dataset.slot; shownKey = ''; }
  });
}

export { updateHud, setupHud };
