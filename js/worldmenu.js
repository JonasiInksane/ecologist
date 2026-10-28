// The Save & share menu: undo, save slots in this browser, world codes and files, and the world's seed.
import { generate } from './generate.js';
import { checkpoint, history, undo } from './history.js';
import { capture, packWorld, restore, unpackWorld } from './snapshot.js';
import { S } from './world.js';

const SLOTS = 4, DB_NAME = 'tidepool', STORE = 'slots';
const NO_STORAGE = 'Saving isn’t available in this window because the browser blocks storage here. Use Copy world code or Export file instead.';

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
// Runs fn(store) in one transaction and resolves with its request's result.
async function slotOp(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
function when(ms) {
  const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// afterLoad() runs after the world is replaced (a slot, a code, a file, a seed or an undo), to resync the page.
function buildWorldMenu({ afterLoad }) {
  const $ = id => document.getElementById(id);
  const msg = $('saveMsg'), slotList = $('slotList'), codeInput = $('codeInput'), seedInput = $('seedInput');
  const say = text => { msg.textContent = text; };
  const fail = e => say(e && e.message ? e.message : String(e));

  async function renderSlots() {
    let records;
    try { records = await Promise.all(Array.from({ length: SLOTS }, (_, i) => slotOp('readonly', st => st.get('slot' + (i + 1))))); }
    catch { slotList.replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: NO_STORAGE })); return; }
    slotList.replaceChildren(...records.map((rec, i) => {
      const row = document.createElement('div'), name = 'slot' + (i + 1);
      row.className = 'row';
      const label = document.createElement('span');
      label.className = 'note slot-name';
      label.textContent = rec ? `Slot ${i + 1} · saved ${when(rec.savedAt)} · seed ${rec.seed}` : `Slot ${i + 1} · empty`;
      const save = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Save' });
      save.addEventListener('click', async () => {
        try { await slotOp('readwrite', st => st.put({ savedAt: Date.now(), seed: S.seed, snap: capture() }, name)); say(`Saved to slot ${i + 1}.`); renderSlots(); }
        catch { say(NO_STORAGE); }
      });
      row.append(label, save);
      if (rec) {
        const load = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Load' });
        load.addEventListener('click', async () => {
          try { const r = await slotOp('readonly', st => st.get(name)); checkpoint(); restore(r.snap); afterLoad(); say(`Loaded slot ${i + 1}. Undo takes you back.`); }
          catch (e) { fail(e); }
        });
        const del = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Clear' });
        del.setAttribute('aria-label', `Clear slot ${i + 1}`);
        del.addEventListener('click', async () => { try { await slotOp('readwrite', st => st.delete(name)); say(`Slot ${i + 1} cleared.`); renderSlots(); } catch { say(NO_STORAGE); } });
        row.append(load, del);
      }
      return row;
    }));
  }
  async function loadCode(text, from) {
    const snap = await unpackWorld(text);
    checkpoint(); restore(snap); afterLoad();
    say(`Loaded the world from ${from}. Undo takes you back.`);
  }

  $('copyCode').addEventListener('click', async () => {
    try {
      const code = await packWorld(capture());
      try { await navigator.clipboard.writeText(code); say(`World code copied (${Math.round(code.length / 1024)} KB of text). Paste it into Load code anywhere to rebuild this world.`); }
      catch { codeInput.value = code; codeInput.select(); say('Copying isn’t allowed here, so the code is in the box below, selected: press Ctrl+C to copy it.'); }
    } catch (e) { fail(e); }
  });
  $('loadCode').addEventListener('click', () => { loadCode(codeInput.value, 'the code').then(() => { codeInput.value = ''; }, fail); });
  $('exportFile').addEventListener('click', async () => {
    try {
      const url = URL.createObjectURL(new Blob([await packWorld(capture())], { type: 'text/plain' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `tidepool-seed-${S.seed}.tidepool` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('Exported the world file. If nothing downloaded, this view blocks downloads: use Copy world code instead.');
    } catch (e) { fail(e); }
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) loadCode(await file.text(), file.name).catch(fail);
  });
  $('copySeed').addEventListener('click', async () => {
    const tag = `#seed-${S.seed}`;
    try { await navigator.clipboard.writeText(tag); say(`Copied ${tag}. Add it to the end of the page’s link to open this world as generated (later changes need a world code).`); }
    catch { seedInput.value = String(S.seed); seedInput.select(); say(`Add ${tag} to the end of the page’s link to open this world as generated.`); }
  });
  $('buildSeed').addEventListener('click', () => {
    const n = Number(String(seedInput.value).trim());
    if (!Number.isInteger(n) || n < 0 || n > 2147483647) { say('A seed is a whole number from 0 to 2147483647.'); return; }
    checkpoint(); S.seed = n; generate(); afterLoad();
    say(`Built the world for seed ${n}. Undo takes you back.`);
  });
  function undoNow() {
    const back = undo();
    if (back < 0) { say('Nothing to undo yet.'); return; }
    afterLoad();
    say(back > 0.05 ? `Went back ${back.toFixed(1)} s.` : 'Undid the last change.');
  }
  $('undoBtn').addEventListener('click', undoNow);
  $('saveMenu').addEventListener('toggle', () => { if ($('saveMenu').open) renderSlots(); });

  // Kept current by the status line: what undo can reach, the seed, and whether saving applies (not in puzzles).
  function update() {
    const steps = history.length, reach = steps ? (S.tick - history[0].tick) / 60 : 0;
    $('historyInfo').textContent = steps ? `${steps} step${steps > 1 ? 's' : ''} back${reach >= 1 ? `, up to ${reach.toFixed(0)} s of play` : ''}` : 'nothing to undo yet';
    $('seedText').textContent = `This world’s seed: ${S.seed}`;
    $('saveSections').hidden = !!S.level;
  }
  return { update, undoNow };
}

export { SLOTS, DB_NAME, STORE, NO_STORAGE, openDb, slotOp, when, buildWorldMenu };
