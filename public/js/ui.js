// POKEPALS navigation engine: a stack of screens you only ever drill into or
// back out of. A screen function returns a spec — either a cursor-driven `menu`
// or a free-form `page`. The engine renders it, draws breadcrumbs, and wires
// keyboard (arrows / enter / esc) and mouse to the same actions.

import { esc } from './core.js';

const windowEl = document.getElementById('window');
const crumbsEl = document.getElementById('crumbs');
const modeEl = document.getElementById('modeText');
const statusEl = document.getElementById('statusbar');

// Stack of frames: { fn, title, cursor }. fn() returns a spec (may be async).
const stack = [];
let pageKeyHandler = null; // a page screen may register key handling

export function setMode(isGM) {
  modeEl.textContent = isGM ? 'GM MODE' : 'PLAYER';
  modeEl.classList.toggle('gm', isGM);
}

export function setStatus(parts) {
  statusEl.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
}

export async function pushScreen(fn) {
  stack.push({ fn, title: '', cursor: 0 });
  await renderTop();
}

export async function popScreen() {
  if (stack.length > 1) {
    stack.pop();
    await renderTop();
  }
}

export async function resetTo(fn) {
  stack.length = 0;
  stack.push({ fn, title: '', cursor: 0 });
  await renderTop();
}

// Re-run the current screen function (after data changed) without losing depth.
export async function refresh() {
  if (stack.length) await renderTop();
}

export function depth() {
  return stack.length;
}

async function renderTop() {
  const frame = stack[stack.length - 1];
  pageKeyHandler = null;
  let spec;
  try {
    spec = await frame.fn();
  } catch (e) {
    windowEl.innerHTML = `<div class="empty">COULDN'T LOAD<br><span class="subnote">${esc(e.message)}</span></div>`;
    return;
  }
  frame.title = spec.title || frame.title;
  drawCrumbs();

  if (spec.menu) renderMenu(frame, spec);
  else if (spec.page) renderPage(frame, spec);
  else windowEl.innerHTML = '<div class="empty">—</div>';
}

function drawCrumbs() {
  const path = stack.map((f) => f.title).filter(Boolean);
  crumbsEl.textContent = path.join('  ›  ');
}

// ---- Menu screens --------------------------------------------------------
function renderMenu(frame, spec) {
  const items = spec.menu.filter(Boolean);
  frame.items = items;
  if (frame.cursor >= items.length) frame.cursor = 0;
  // Move cursor off a disabled first item.
  if (items[frame.cursor]?.disabled) {
    const next = items.findIndex((i) => !i.disabled);
    frame.cursor = next === -1 ? 0 : next;
  }

  const intro = spec.intro ? `<div class="subnote">${spec.intro}</div>` : '';
  const heading = spec.heading ? `<div class="heading">${esc(spec.heading)}</div>` : '';
  const list = items
    .map((it, i) => {
      const sel = i === frame.cursor && !it.disabled ? ' sel' : '';
      const dis = it.disabled ? ' disabled' : '';
      const badge = it.badge ? `<span class="badge-gm">${esc(it.badge)}</span>` : '';
      const hint = it.hint ? `<span class="hint">${esc(it.hint)}</span>` : '';
      return `<li class="menu-item${sel}${dis}" data-i="${i}">${esc(it.label)} ${badge}${hint}</li>`;
    })
    .join('');
  windowEl.innerHTML = `${heading}${intro}<ul class="menu">${list}</ul>`;

  windowEl.querySelectorAll('.menu-item').forEach((el) => {
    el.onclick = () => {
      const i = Number(el.dataset.i);
      if (items[i]?.disabled) return;
      frame.cursor = i;
      activate(frame);
    };
  });
}

function moveCursor(frame, dir) {
  const items = frame.items || [];
  if (!items.length) return;
  let i = frame.cursor;
  for (let n = 0; n < items.length; n++) {
    i = (i + dir + items.length) % items.length;
    if (!items[i].disabled) break;
  }
  frame.cursor = i;
  windowEl.querySelectorAll('.menu-item').forEach((el, idx) => {
    el.classList.toggle('sel', idx === i && !items[idx].disabled);
  });
}

function activate(frame) {
  const it = (frame.items || [])[frame.cursor];
  if (it && !it.disabled && it.onSelect) it.onSelect();
}

// ---- Page screens (detail / forms / search) ------------------------------
function renderPage(frame, spec) {
  windowEl.innerHTML = '';
  const ctx = {
    el: windowEl,
    onKey: (fn) => { pageKeyHandler = fn; },
    back: popScreen,
  };
  spec.page(windowEl, ctx);
  if (spec.focus) {
    const f = windowEl.querySelector('input, textarea');
    if (f) f.focus();
  }
}

// ---- Global key handling -------------------------------------------------
document.addEventListener('keydown', (e) => {
  const frame = stack[stack.length - 1];
  if (!frame) return;
  const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

  // Page screens get first crack at keys (search lists, forms).
  if (pageKeyHandler && pageKeyHandler(e) === true) {
    e.preventDefault();
    return;
  }

  if (e.key === 'Escape') {
    if (inField) { document.activeElement.blur(); return; }
    e.preventDefault();
    popScreen();
    return;
  }

  // Within a text field, leave the rest of the keys for editing.
  if (inField) return;

  if (frame.items) {
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); moveCursor(frame, -1); }
    else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); moveCursor(frame, 1); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); activate(frame); }
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); popScreen(); }
  } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
    e.preventDefault();
    popScreen();
  }
});

// ---- Small builders shared by screens ------------------------------------
export function box(title, innerHTML, cls = '') {
  return `<div class="box ${cls}">${title ? `<div class="box-title">${esc(title)}</div>` : ''}${innerHTML}</div>`;
}

export function kv(k, v) {
  if (v == null || v === '') return '';
  return `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
}

export function backButton() {
  return `<div class="btn-row"><button class="btn" data-back>← BACK</button></div>`;
}
