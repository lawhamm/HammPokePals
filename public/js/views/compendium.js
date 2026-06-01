// Compendium (Pokedex) view — list with search + type filter, detail pages, and
// GM add/edit/delete. This is the flagship section of the MVP.

import { api, esc, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

const STAT_KEYS = [
  ['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'],
  ['spatk', 'Sp. Atk'], ['spdef', 'Sp. Def'], ['speed', 'Speed'],
];

function typeChip(t) {
  return `<span class="type t-${esc(String(t).toLowerCase())}">${esc(t)}</span>`;
}

export async function renderCompendium(ctx) {
  const { view, isGM } = ctx;
  const types = await api('/api/pokemon/types');

  view.innerHTML = `
    <div class="page-head">
      <h1>Compendium</h1>
      <span class="subtle" id="count"></span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="addBtn">+ Add Pokémon</button>' : ''}
    </div>
    <div class="toolbar">
      <input class="search" id="search" placeholder="Search by name or description…" />
      <select id="typeFilter">
        <option value="">All types</option>
        ${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
      </select>
    </div>
    <div class="grid" id="grid"></div>`;

  const grid = view.querySelector('#grid');
  const search = view.querySelector('#search');
  const typeFilter = view.querySelector('#typeFilter');
  const count = view.querySelector('#count');

  async function load() {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('search', search.value.trim());
    if (typeFilter.value) params.set('type', typeFilter.value);
    const list = await api('/api/pokemon?' + params.toString());
    count.textContent = `${list.length} entr${list.length === 1 ? 'y' : 'ies'}`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty">No Pokémon match.${isGM ? ' Use “+ Add Pokémon” to create one.' : ''}</div>`;
      return;
    }
    grid.innerHTML = list.map(cardHTML).join('');
    grid.querySelectorAll('.card').forEach((c) => {
      c.onclick = () => (location.hash = `#/compendium/${c.dataset.id}`);
    });
  }

  let t;
  search.oninput = () => { clearTimeout(t); t = setTimeout(load, 180); };
  typeFilter.onchange = load;

  if (isGM) view.querySelector('#addBtn').onclick = () => openEditor(ctx, null, load);

  await load();
}

function cardHTML(p) {
  const art = p.image
    ? `<img class="art" src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.classList.add('placeholder');this.removeAttribute('src');this.textContent='?';" />`
    : `<div class="art placeholder">?</div>`;
  return `
    <div class="card ${p.visibility === 'gm' ? 'gm-item' : ''}" data-id="${p.id}">
      ${p.dex_no != null ? `<span class="dexno">#${String(p.dex_no).padStart(3, '0')}</span>` : ''}
      ${art}
      <h3>${esc(p.name)} ${p.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
      <div class="types">${(p.types || []).map(typeChip).join('')}</div>
    </div>`;
}

export async function renderPokemonDetail(ctx, id) {
  const { view, isGM } = ctx;
  const p = await api(`/api/pokemon/${id}`);
  // Scale stat bars relative to this Pokémon's own biggest stat so they read well
  // regardless of scale (homebrew PTE stats run ~4–12; standard dex runs ~1–255).
  const statVals = STAT_KEYS.map(([k]) => Number(p.stats?.[k] ?? 0));
  const maxStat = Math.max(...statVals, 1);

  view.innerHTML = `
    <button class="back-link" onclick="history.length>1?history.back():location.hash='#/compendium'">← Back to compendium</button>
    <div class="page-head">
      <h1>${esc(p.name)} ${p.visibility === 'gm' ? '<span class="gm-badge">GM only</span>' : ''}</h1>
      ${p.dex_no != null ? `<span class="subtle">#${String(p.dex_no).padStart(3, '0')}</span>` : ''}
      ${p.category ? `<span class="subtle">· ${esc(p.category)}</span>` : ''}
      <div class="spacer"></div>
      ${isGM ? `<button class="btn" id="editBtn">Edit</button> <button class="btn danger" id="delBtn">Delete</button>` : ''}
    </div>
    <div class="detail-grid">
      <div>
        ${p.image
          ? `<img class="art" style="height:220px" src="${esc(p.image)}" alt="${esc(p.name)}" />`
          : `<div class="art placeholder" style="height:220px">?</div>`}
        <div class="types" style="margin-top:0.6rem">${(p.types || []).map(typeChip).join('')}</div>
        ${kv('Habitat', p.habitat)}
        ${kv('Rarity', p.rarity)}
        ${chips('Abilities', p.abilities)}
      </div>
      <div>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <div class="kv"><span class="k">Base stats</span></div>
        ${STAT_KEYS.map(([k, label]) => {
          const val = Number(p.stats?.[k] ?? 0);
          const pct = Math.min(100, Math.round((val / maxStat) * 100));
          return `<div class="stat-row"><span class="label">${label}</span><span class="stat-bar"><span style="width:${pct}%"></span></span><span class="num">${val || '—'}</span></div>`;
        }).join('')}
        ${chips('Moves', p.moves)}
        ${p.capture_rules ? `<div class="kv"><span class="k">Capture / Encounter</span><p>${esc(p.capture_rules)}</p></div>` : ''}
        ${isGM && p.gm_notes ? `<div class="gm-note"><span class="k">GM notes</span><p>${esc(p.gm_notes)}</p></div>` : ''}
      </div>
    </div>`;

  if (isGM) {
    view.querySelector('#editBtn').onclick = () =>
      openEditor(ctx, p, () => (location.hash = `#/compendium/${p.id}`, ctx.reroute()));
    view.querySelector('#delBtn').onclick = async () => {
      if (!(await confirmDialog(`Delete ${p.name}? This can't be undone.`))) return;
      await api(`/api/pokemon/${p.id}`, { method: 'DELETE' });
      toast('Deleted', 'ok');
      location.hash = '#/compendium';
    };
  }
}

function kv(k, v) {
  if (!v) return '';
  return `<div class="kv"><span class="k">${esc(k)}</span><div>${esc(v)}</div></div>`;
}
function chips(k, arr) {
  if (!arr || !arr.length) return '';
  return `<div class="kv"><span class="k">${esc(k)}</span><div class="chip-list">${arr
    .map((a) => `<span class="chip">${esc(a)}</span>`)
    .join('')}</div></div>`;
}

// --- GM editor modal ------------------------------------------------------
function openEditor(ctx, existing, onDone) {
  const p = existing || {};
  const stats = p.stats || {};
  const body = `
    <div class="form-row">
      ${field({ label: 'Name', name: 'name', value: p.name || '', placeholder: 'e.g. Bulbasaur' })}
      ${field({ label: 'Dex #', name: 'dex_no', type: 'number', value: p.dex_no ?? '' })}
    </div>
    <div class="form-row">
      ${field({ label: 'Category', name: 'category', value: p.category || '', placeholder: 'Seed Pokémon' })}
      ${field({ label: 'Types (comma separated)', name: 'types', value: (p.types || []).join(', '), placeholder: 'Grass, Poison' })}
    </div>
    <div class="form-row">
      ${field({ label: 'Habitat', name: 'habitat', value: p.habitat || '' })}
      ${field({ label: 'Rarity', name: 'rarity', value: p.rarity || '', placeholder: 'Common / Rare / Legendary' })}
    </div>
    ${field({ label: 'Description', name: 'description', value: p.description || '', textarea: true, full: true })}
    <div class="form-row">
      ${field({ label: 'Abilities (comma sep.)', name: 'abilities', value: (p.abilities || []).join(', ') })}
      ${field({ label: 'Moves (comma sep.)', name: 'moves', value: (p.moves || []).join(', ') })}
    </div>
    <div class="kv full" style="grid-column:1/-1"><span class="k">Base stats</span></div>
    <div class="form-row">
      ${field({ label: 'HP', name: 's_hp', type: 'number', value: stats.hp ?? '' })}
      ${field({ label: 'Attack', name: 's_atk', type: 'number', value: stats.atk ?? '' })}
    </div>
    <div class="form-row">
      ${field({ label: 'Defense', name: 's_def', type: 'number', value: stats.def ?? '' })}
      ${field({ label: 'Speed', name: 's_speed', type: 'number', value: stats.speed ?? '' })}
    </div>
    <div class="form-row">
      ${field({ label: 'Sp. Attack', name: 's_spatk', type: 'number', value: stats.spatk ?? '' })}
      ${field({ label: 'Sp. Defense', name: 's_spdef', type: 'number', value: stats.spdef ?? '' })}
    </div>
    ${field({ label: 'Capture / encounter rules (player-facing)', name: 'capture_rules', value: p.capture_rules || '', textarea: true, full: true })}
    ${field({ label: 'GM notes (secret)', name: 'gm_notes', value: p.gm_notes || '', textarea: true, full: true })}
    ${field({ label: 'Artwork URL (or upload after saving)', name: 'image', value: p.image || '', full: true })}
    ${visibilityField(p.visibility || 'public')}`;

  openModal({
    title: existing ? `Edit ${p.name}` : 'Add Pokémon',
    bodyHTML: body,
    wide: true,
    submitLabel: existing ? 'Save changes' : 'Create',
    onSubmit: async (data) => {
      const payload = {
        name: data.name,
        dex_no: data.dex_no,
        category: data.category,
        types: data.types,
        description: data.description,
        habitat: data.habitat,
        rarity: data.rarity,
        abilities: data.abilities,
        moves: data.moves,
        capture_rules: data.capture_rules,
        gm_notes: data.gm_notes,
        image: data.image,
        visibility: data.visibility,
        stats: {
          hp: num(data.s_hp), atk: num(data.s_atk), def: num(data.s_def),
          spatk: num(data.s_spatk), spdef: num(data.s_spdef), speed: num(data.s_speed),
        },
      };
      try {
        if (existing) await api(`/api/pokemon/${existing.id}`, { method: 'PUT', body: payload });
        else await api('/api/pokemon', { method: 'POST', body: payload });
        closeModal();
        toast('Saved', 'ok');
        onDone && onDone();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : 0;
}
