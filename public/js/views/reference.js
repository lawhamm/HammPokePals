// Reference view — searchable catalogue of moves, abilities, and items pulled
// from the rulebook/workbook. Read-only: a segmented control switches between
// the three kinds, a search box filters server-side, and a row opens a detail
// modal showing every field.

import { api, esc } from '../core.js';
import { openModal } from '../ui.js';

const KINDS = [
  ['move', 'Moves'],
  ['ability', 'Abilities'],
  ['item', 'Items'],
];

export async function renderReference(ctx) {
  const { view } = ctx;
  const counts = await api('/api/reference/counts');
  let kind = 'move';

  view.innerHTML = `
    <div class="page-head">
      <h1>Reference</h1>
      <span class="subtle" id="refCount"></span>
    </div>
    <div class="toolbar">
      <div class="seg" id="kinds">
        ${KINDS.map(
          ([k, label]) =>
            `<button class="seg-btn${k === kind ? ' active' : ''}" data-kind="${k}">${label} <span class="seg-n">${counts[k] || 0}</span></button>`
        ).join('')}
      </div>
      <input class="search" id="refSearch" placeholder="Search by name, effect, or category…" />
    </div>
    <div class="list" id="refList"></div>`;

  const listEl = view.querySelector('#refList');
  const searchEl = view.querySelector('#refSearch');
  const countEl = view.querySelector('#refCount');
  let current = [];

  async function load() {
    const params = new URLSearchParams({ kind });
    if (searchEl.value.trim()) params.set('search', searchEl.value.trim());
    const res = await api('/api/reference?' + params.toString());
    current = res.items;
    countEl.textContent =
      res.total > res.items.length
        ? `showing ${res.items.length} of ${res.total} — refine your search`
        : `${res.total} entr${res.total === 1 ? 'y' : 'ies'}`;
    listEl.innerHTML = res.items.length
      ? res.items.map(rowHTML).join('')
      : '<div class="empty">No matches.</div>';
    listEl.querySelectorAll('[data-id]').forEach((el) => {
      el.onclick = () => openDetail(current.find((x) => String(x.id) === el.dataset.id));
    });
  }

  view.querySelectorAll('.seg-btn').forEach((b) => {
    b.onclick = () => {
      kind = b.dataset.kind;
      view.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      load();
    };
  });

  let t;
  searchEl.oninput = () => {
    clearTimeout(t);
    t = setTimeout(load, 180);
  };

  await load();
}

function rowHTML(e) {
  return `
    <div class="row" data-id="${e.id}">
      <div class="row-main">
        <h3>${esc(e.name)} ${e.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
        ${e.summary ? `<div class="cat">${esc(e.summary)}</div>` : ''}
      </div>
      ${e.category ? `<span class="chip">${esc(e.category)}</span>` : ''}
    </div>`;
}

function openDetail(e) {
  if (!e) return;
  const rows = Object.entries(e.data || {})
    .filter(([, v]) => v != null && v !== '')
    .map(
      ([k, v]) =>
        `<div class="kv"><span class="k">${esc(k)}</span><div>${esc(v).replace(/\n/g, '<br>')}</div></div>`
    )
    .join('');
  openModal({
    title: e.name,
    wide: true,
    bodyHTML: `<div class="ref-detail">${
      e.category ? `<span class="chip">${esc(e.category)}</span>` : ''
    }${rows || '<p class="subtle">No further details.</p>'}</div>`,
  });
}
