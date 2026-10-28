// The tool picker: a compact bar with the current tool, a search box and the most recently used tools, and a palette
// of every tool by category that opens on demand. In a puzzle the bar simply shows the tools the puzzle allows.
const CATEGORIES = [['liquids', 'Liquids'], ['terrain', 'Terrain'], ['objects', 'Objects'], ['machines', 'Machines']];
const RECENT_MAX = 6, DEFAULT_RECENT = ['water', 'lava', 'dirt', 'stone', 'dig', 'sponge'];

function categoryOf(tl) {
  return tl.liquid || tl.dye ? 'liquids' : tl.place ? 'objects' : tl.pump || tl.wire || tl.device || tl.pipe ? 'machines' : 'terrain';
}
// Remembered per viewer; the page works the same when storage is blocked.
function remember(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function recall(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }

function toolLabel(tl) { return `<span class="sw" style="background:${tl.color}"></span><span class="nm">${tl.name}</span>`; }

// tools: the TOOLS table. pick(i) selects tool i (it calls markSelected back); allowed(tl) says whether the mode allows it.
function buildPalette(tools, { pick, allowed }) {
  const $ = id => document.getElementById(id);
  const toggle = $('paletteToggle'), panel = $('palette'), grid = $('toolGrid'), tabsEl = $('toolTabs');
  const search = $('toolSearch'), recentEl = $('recentTools'), empty = $('toolEmpty');
  let category = recall('tidepool.category', 'liquids');
  if (!CATEGORIES.some(([id]) => id === category)) category = 'liquids';
  let recent = recall('tidepool.recent', DEFAULT_RECENT).filter(id => tools.some(t => t.id === id));
  let current = 0, inLevel = false;

  const buttons = tools.map((tl, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'tool-' + tl.id;
    b.innerHTML = toolLabel(tl) + (tl.key ? ` <kbd>${tl.key}</kbd>` : '');
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { pick(i); setOpen(false); });
    grid.appendChild(b);
    return b;
  });
  const tabs = CATEGORIES.map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.category = id;
    b.textContent = `${label} ${tools.filter(t => categoryOf(t) === id).length}`;
    b.addEventListener('click', () => { category = id; remember('tidepool.category', id); search.value = ''; render(); });
    tabsEl.appendChild(b);
    return b;
  });

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  // Searching looks across every category; otherwise the chosen category shows.
  function render() {
    const q = String(search.value || '').trim().toLowerCase();
    tabs.forEach(t => t.setAttribute('aria-selected', !q && t.dataset.category === category ? 'true' : 'false'));
    let shown = 0;
    buttons.forEach((b, i) => {
      const tl = tools[i];
      const match = q ? tl.name.toLowerCase().includes(q) || categoryOf(tl).startsWith(q) : categoryOf(tl) === category;
      b.hidden = !(match && allowed(tl));
      if (!b.hidden) shown++;
    });
    empty.hidden = shown > 0;
    empty.textContent = `No tool matches “${q}”.`;
  }
  function renderRecent() {
    const ids = inLevel ? tools.filter(allowed).map(t => t.id) : recent;
    recentEl.replaceChildren(...ids.map(id => tools.findIndex(t => t.id === id)).filter(i => i >= 0 && allowed(tools[i])).map(i => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mini';
      b.innerHTML = toolLabel(tools[i]) + (tools[i].key ? ` <kbd>${tools[i].key}</kbd>` : '');
      b.setAttribute('aria-pressed', i === current ? 'true' : 'false');
      b.addEventListener('click', () => pick(i));
      return b;
    }));
  }
  function markSelected(i) {
    current = i;
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    toggle.querySelector('.current').innerHTML = toolLabel(tools[i]);
    if (!inLevel) {
      recent = [tools[i].id, ...recent.filter(id => id !== tools[i].id)].slice(0, RECENT_MAX);
      remember('tidepool.recent', recent);
    }
    renderRecent();
  }
  // Called when the mode changes: a puzzle hides the picker and lists its tools in the bar instead.
  function refresh(level) {
    inLevel = level;
    toggle.hidden = search.hidden = level;
    if (level) setOpen(false);
    render(); renderRecent();
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  search.addEventListener('input', () => { if (search.value.trim()) setOpen(true); render(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {   // picks the first match
      const i = buttons.findIndex(b => !b.hidden);
      if (i >= 0 && search.value.trim()) { pick(i); search.value = ''; render(); setOpen(false); search.blur(); }
    } else if (e.key === 'Escape') { search.value = ''; render(); setOpen(false); search.blur(); }
  });
  // the display menu and the palette close on Escape or a click elsewhere
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const m of document.querySelectorAll('details.menu[open]')) m.open = false;
    if (document.activeElement !== search) setOpen(false);
  });
  document.addEventListener('pointerdown', e => {
    for (const m of document.querySelectorAll('details.menu[open]')) if (!m.contains(e.target)) m.open = false;
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target) && e.target !== search) setOpen(false);
  });

  render();
  return { buttons, markSelected, refresh, focusSearch() { setOpen(true); search.focus(); search.select(); } };
}

export { CATEGORIES, RECENT_MAX, DEFAULT_RECENT, categoryOf, remember, recall, toolLabel, buildPalette };
