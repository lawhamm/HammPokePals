// POKEPALS — a Game-Boy-style nested-menu front-end for the campaign manager.
// Everything drills down from the main menu; OPTIONS unlocks GM editing.

import { api, esc, toast } from './core.js';
import {
  pushScreen, popScreen, resetTo, setMode, setStatus, box, kv,
} from './ui.js';

const state = { role: 'player', campaign: { name: 'POKEPALS', session_count: 0, current_date: '' } };
const isGM = () => state.role === 'gm';

const VIS = [
  { value: 'public', label: 'PUBLIC — players can see' },
  { value: 'gm', label: 'GM ONLY — hidden from players' },
];

// ---- boot ----------------------------------------------------------------
(async function boot() {
  await refreshIdentity();
  await refreshCampaign();
  resetTo(mainMenu);
})();

async function refreshIdentity() {
  try {
    const me = await api('/api/me');
    state.role = me.role;
  } catch { /* default player */ }
  setMode(isGM());
}

async function refreshCampaign() {
  try {
    state.campaign = await api('/api/campaign');
  } catch { /* keep defaults */ }
  drawStatus();
}

function drawStatus() {
  const c = state.campaign;
  setStatus([
    `<b>${esc(c.name)}</b>`,
    `SESSION ${c.session_count}`,
    `${esc(c.current_date)}`,
    isGM() ? 'GM' : 'PLAYER',
  ]);
}

// ---- main menu -----------------------------------------------------------
function mainMenu() {
  return {
    title: 'MENU',
    heading: 'MAIN MENU',
    menu: [
      { label: 'CAMPAIGN', hint: 'log & story', onSelect: () => pushScreen(campaignMenu) },
      { label: 'PLAYERS', hint: 'characters', onSelect: () => pushScreen(playersMenu) },
      { label: 'WORLD', hint: 'npcs, places', onSelect: () => pushScreen(worldMenu) },
      { label: 'POKEDEX', hint: 'species', onSelect: () => pushScreen(pokedexSearch) },
      { label: 'RULES', hint: 'compendium', onSelect: () => pushScreen(rulesMenu) },
      { label: 'OPTIONS', hint: 'gm mode', onSelect: () => pushScreen(optionsMenu) },
    ],
  };
}

// ========================================================================
// CAMPAIGN
// ========================================================================
function campaignMenu() {
  return {
    title: 'CAMPAIGN',
    menu: [
      { label: 'SESSION LOG', hint: 'newest first', onSelect: () => pushScreen(sessionLog) },
      { label: 'STORY SO FAR', hint: 'canon summary', onSelect: () => pushScreen(storyScreen) },
    ],
  };
}

async function sessionLog() {
  const list = (await api('/api/sessions')).sort(
    (a, b) => String(b.played_on || '').localeCompare(String(a.played_on || '')) || b.id - a.id
  );
  const menu = [];
  if (isGM()) menu.push({ label: '+ NEW ENTRY', onSelect: () => pushScreen(() => sessionForm(null)) });
  for (const s of list) {
    menu.push({
      label: s.title,
      hint: s.played_on || '',
      onSelect: () => pushScreen(() => sessionDetail(s.id)),
    });
  }
  if (!list.length && !isGM()) menu.push({ label: 'NO ENTRIES YET', disabled: true });
  return { title: 'SESSION LOG', menu };
}

async function sessionDetail(id) {
  const s = await api(`/api/sessions/${id}`);
  return {
    title: 'ENTRY',
    page: (el) => {
      el.innerHTML =
        box('', `<div class="heading">${esc(s.title)}</div><div class="subnote">${esc(s.played_on || 'undated')}</div>` +
          `<div class="text-content">${esc(s.summary || '(no recap)')}</div>`) +
        (isGM() && s.gm_notes ? box('GM PREP', `<div class="text-content">${esc(s.gm_notes)}</div>`, 'gm') : '') +
        gmButtons(
          () => pushScreen(() => sessionForm(s)),
          () => confirmDelete(`DELETE "${s.title}"?`, async () => { await api(`/api/sessions/${id}`, { method: 'DELETE' }); await refreshCampaign(); })
        );
      wireGmButtons(el);
    },
  };
}

function sessionForm(s) {
  return formScreen({
    title: s ? 'EDIT ENTRY' : 'NEW ENTRY',
    fields: [
      { name: 'title', label: 'Title', value: s?.title || '' },
      { name: 'played_on', label: 'Date', value: s?.played_on || state.campaign.current_date, placeholder: 'YYYY-MM-DD' },
      { name: 'summary', label: 'Recap (player-facing)', value: s?.summary || '', type: 'textarea' },
      { name: 'gm_notes', label: 'GM prep (secret)', value: s?.gm_notes || '', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      if (s) await api(`/api/sessions/${s.id}`, { method: 'PUT', body: v });
      else await api('/api/sessions', { method: 'POST', body: v });
      await refreshCampaign();
    },
  });
}

async function storyScreen() {
  const c = await api('/api/campaign');
  return {
    title: 'STORY SO FAR',
    page: (el) => {
      el.innerHTML =
        box('CANON SUMMARY', `<div class="text-content">${esc(c.story_so_far || '(the GM has not written the story summary yet)')}</div>`, 'blue') +
        (isGM() ? gmButtons(() => pushScreen(storyForm)) : '');
      wireGmButtons(el);
    },
  };
}

function storyForm() {
  return formScreen({
    title: 'EDIT STORY',
    fields: [{ name: 'story_so_far', label: 'Story so far (canon)', value: state.campaign.story_so_far || '', type: 'textarea', big: true }],
    onSubmit: async (v) => { await api('/api/campaign', { method: 'PUT', body: v }); await refreshCampaign(); },
  });
}

// ========================================================================
// PLAYERS
// ========================================================================
async function playersMenu() {
  const list = await api('/api/players');
  const menu = [];
  if (isGM()) menu.push({ label: '+ NEW CHARACTER', onSelect: () => pushScreen(() => playerForm(null)) });
  for (const p of list) {
    menu.push({ label: p.name, hint: p.player_name || '', onSelect: () => pushScreen(() => playerSheet(p.id)) });
  }
  if (!list.length && !isGM()) menu.push({ label: 'NO CHARACTERS', disabled: true });
  return { title: 'PLAYERS', menu };
}

async function playerSheet(id) {
  const p = await api(`/api/players/${id}`);
  const menu = [
    { label: 'STATS', onSelect: () => pushScreen(() => statsPage(p)) },
    { label: 'POKEMON ROSTER', hint: `${p.roster?.length || 0}`, onSelect: () => pushScreen(() => rosterMenu(id)) },
    { label: 'INVENTORY', hint: `${p.inventory?.length || 0}`, onSelect: () => pushScreen(() => inventoryPage(p)) },
  ];
  if (isGM()) {
    menu.push({ label: 'GM NOTES', badge: 'GM', onSelect: () => pushScreen(() => notesPage(p)) });
    menu.push({ label: '+ ADD POKEMON', onSelect: () => pushScreen(() => rosterForm(id, null)) });
    menu.push({ label: 'EDIT CHARACTER', onSelect: () => pushScreen(() => playerForm(p)) });
    menu.push({ label: 'DELETE CHARACTER', onSelect: () => confirmDelete(`DELETE ${p.name}?`, async () => { await api(`/api/players/${id}`, { method: 'DELETE' }); }) });
  }
  return { title: p.name.toUpperCase(), menu };
}

function statsPage(p) {
  return {
    title: 'STATS',
    page: (el) => {
      const stats = p.stats || {};
      const rows = Object.keys(stats).length
        ? Object.entries(stats).map(([k, v]) => kv(k, v)).join('')
        : '<div class="empty">NO STATS RECORDED</div>';
      el.innerHTML = box(`${esc(p.name)}${p.player_name ? ' · ' + esc(p.player_name) : ''}`, rows);
    },
  };
}

async function rosterMenu(playerId) {
  const p = await api(`/api/players/${playerId}`);
  const menu = [];
  if (isGM()) menu.push({ label: '+ ADD POKEMON', onSelect: () => pushScreen(() => rosterForm(playerId, null)) });
  for (const mon of p.roster || []) {
    menu.push({
      label: mon.nickname ? `${mon.nickname} (${mon.species})` : mon.species,
      hint: mon.level ? `LV ${mon.level}` : '',
      onSelect: () => pushScreen(() => rosterDetail(playerId, mon.id)),
    });
  }
  if (!(p.roster || []).length && !isGM()) menu.push({ label: 'EMPTY ROSTER', disabled: true });
  return { title: 'ROSTER', menu };
}

async function rosterDetail(playerId, rid) {
  const p = await api(`/api/players/${playerId}`);
  const mon = (p.roster || []).find((m) => m.id === rid);
  if (!mon) return { title: 'POKEMON', page: (el) => { el.innerHTML = '<div class="empty">GONE</div>'; } };
  return {
    title: (mon.nickname || mon.species).toUpperCase(),
    page: (el) => {
      el.innerHTML =
        box(mon.nickname ? `${esc(mon.nickname)} — ${esc(mon.species)}` : esc(mon.species),
          kv('Level', mon.level) + kv('Status', mon.status) +
          (mon.moves?.length ? `<div class="kv"><span class="k">Moves</span><span class="v">${mon.moves.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</span></div>` : '')) +
        (isGM() && mon.gm_notes ? box('GM NOTES', `<div class="text-content">${esc(mon.gm_notes)}</div>`, 'gm') : '') +
        gmButtons(
          () => pushScreen(() => rosterForm(playerId, mon)),
          () => confirmDelete(`RELEASE ${mon.species}?`, async () => { await api(`/api/players/${playerId}/roster/${rid}`, { method: 'DELETE' }); })
        );
      wireGmButtons(el);
    },
  };
}

function rosterForm(playerId, mon) {
  return formScreen({
    title: mon ? 'EDIT POKEMON' : 'ADD POKEMON',
    fields: [
      { name: 'species', label: 'Species', value: mon?.species || '' },
      { name: 'nickname', label: 'Nickname', value: mon?.nickname || '' },
      { name: 'level', label: 'Level', value: mon?.level ?? '', type: 'number' },
      { name: 'status', label: 'Status', value: mon?.status || '', placeholder: 'Healthy / Fainted / Poisoned' },
      { name: 'moves', label: 'Moves (comma separated)', value: (mon?.moves || []).join(', ') },
      { name: 'gm_notes', label: 'GM notes (secret)', value: mon?.gm_notes || '', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      if (mon) await api(`/api/players/${playerId}/roster/${mon.id}`, { method: 'PUT', body: v });
      else await api(`/api/players/${playerId}/roster`, { method: 'POST', body: v });
    },
  });
}

function inventoryPage(p) {
  return {
    title: 'INVENTORY',
    page: (el) => {
      const inv = p.inventory || [];
      const rows = inv.length
        ? inv.map((i) => `<div class="row"><span class="title">${esc(i.name || i)}</span>${i.qty ? ` <span class="meta">×${esc(i.qty)}</span>` : ''}${i.notes ? `<div class="meta">${esc(i.notes)}</div>` : ''}</div>`).join('')
        : '<div class="empty">NOTHING CARRIED</div>';
      el.innerHTML = box(`${esc(p.name)} — BAG`, rows) +
        (isGM() ? gmButtons(() => pushScreen(() => playerForm(p))) : '');
      wireGmButtons(el);
    },
  };
}

function notesPage(p) {
  return {
    title: 'GM NOTES',
    page: (el) => {
      el.innerHTML = box('SECRET — PLAYER DOES NOT KNOW', `<div class="text-content">${esc(p.gm_notes || '(none)')}</div>`, 'gm') +
        gmButtons(() => pushScreen(() => playerForm(p)));
      wireGmButtons(el);
    },
  };
}

function playerForm(p) {
  return formScreen({
    title: p ? 'EDIT CHARACTER' : 'NEW CHARACTER',
    fields: [
      { name: 'name', label: 'Character name', value: p?.name || '' },
      { name: 'player_name', label: 'Player (person)', value: p?.player_name || '' },
      { name: 'stats', label: 'Stats (one per line, KEY: VALUE)', value: kvLines(p?.stats), type: 'textarea' },
      { name: 'inventory', label: 'Inventory (one per line, NAME x QTY)', value: invLines(p?.inventory), type: 'textarea' },
      { name: 'gm_notes', label: 'GM notes (secret)', value: p?.gm_notes || '', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      const body = {
        name: v.name,
        player_name: v.player_name,
        stats: parseKvLines(v.stats),
        inventory: parseInvLines(v.inventory),
        gm_notes: v.gm_notes,
      };
      if (p) await api(`/api/players/${p.id}`, { method: 'PUT', body });
      else await api('/api/players', { method: 'POST', body });
    },
  });
}

const kvLines = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
const parseKvLines = (s) => {
  const out = {};
  for (const line of String(s || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > -1) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k) out[k] = v; }
  }
  return out;
};
const invLines = (a) => (a || []).map((i) => (i.qty ? `${i.name} x ${i.qty}` : i.name || i)).join('\n');
const parseInvLines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
  return m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: l };
});

// ========================================================================
// WORLD
// ========================================================================
function worldMenu() {
  return {
    title: 'WORLD',
    menu: [
      { label: 'NPCS', onSelect: () => pushScreen(() => worldList('npcs', 'NPCS', npcDetail, npcForm)) },
      { label: 'LOCATIONS', onSelect: () => pushScreen(() => worldList('locations', 'LOCATIONS', locationDetail, locationForm)) },
      { label: 'FACTIONS', onSelect: () => pushScreen(() => worldList('factions', 'FACTIONS', factionDetail, factionForm)) },
    ],
  };
}

// Generic searchable WORLD list.
function worldList(kind, title, detailFn, formFn) {
  return searchListPage({
    title,
    fetch: async (q) => {
      const all = await api(`/api/${kind}`);
      if (!q) return all;
      const t = q.toLowerCase();
      return all.filter((x) => `${x.name} ${x.description || ''} ${x.relationship || ''} ${x.last_seen || ''} ${x.region || ''}`.toLowerCase().includes(t));
    },
    row: (x) => ({ title: x.name, meta: x.last_seen || x.region || x.relationship || '' }),
    onOpen: (x) => pushScreen(() => detailFn(kind, x.id, detailFn, formFn)),
    onNew: isGM() ? () => pushScreen(() => formFn(kind, null)) : null,
  });
}

async function npcDetail(kind, id) {
  const x = await api(`/api/npcs/${id}`);
  return entityDetail('NPC', x, [
    ['Description', x.description, true],
    ['Relationship', x.relationship],
    ['Last seen', x.last_seen],
  ], () => npcForm(kind, x), kind, id);
}
async function locationDetail(kind, id) {
  const x = await api(`/api/locations/${id}`);
  return entityDetail('LOCATION', x, [
    ['Region', x.region],
    ['Description', x.description, true],
  ], () => locationForm(kind, x), kind, id);
}
async function factionDetail(kind, id) {
  const x = await api(`/api/factions/${id}`);
  return entityDetail('FACTION', x, [
    ['Standing', x.relationship],
    ['Description', x.description, true],
  ], () => factionForm(kind, x), kind, id);
}

function entityDetail(label, x, fields, editFn, kind, id) {
  return {
    title: x.name.toUpperCase(),
    page: (el) => {
      const body = fields.map(([k, v, big]) => v ? (big ? `<div class="kv"><span class="k">${esc(k)}</span></div><div class="text-content">${esc(v)}</div>` : kv(k, v)) : '').join('');
      el.innerHTML =
        box(`${esc(x.name)} ${x.visibility === 'gm' ? '<span class="badge-gm">GM</span>' : ''}`, body || '<div class="subnote">no details</div>') +
        (isGM() && x.gm_notes ? box('GM NOTES', `<div class="text-content">${esc(x.gm_notes)}</div>`, 'gm') : '') +
        gmButtons(
          () => pushScreen(editFn),
          () => confirmDelete(`DELETE ${x.name}?`, async () => { await api(`/api/${kind}/${id}`, { method: 'DELETE' }); })
        );
      wireGmButtons(el);
    },
  };
}

const npcForm = (kind, x) => formScreen({
  title: x ? 'EDIT NPC' : 'NEW NPC',
  fields: [
    { name: 'name', label: 'Name', value: x?.name || '' },
    { name: 'description', label: 'Description', value: x?.description || '', type: 'textarea' },
    { name: 'relationship', label: 'Relationship notes', value: x?.relationship || '' },
    { name: 'last_seen', label: 'Last seen location', value: x?.last_seen || '' },
    { name: 'gm_notes', label: 'GM notes (secret)', value: x?.gm_notes || '', type: 'textarea' },
    { name: 'visibility', label: 'Visibility', value: x?.visibility || 'public', type: 'select', options: VIS },
  ],
  onSubmit: saver('npcs', x),
});
const locationForm = (kind, x) => formScreen({
  title: x ? 'EDIT LOCATION' : 'NEW LOCATION',
  fields: [
    { name: 'name', label: 'Name', value: x?.name || '' },
    { name: 'region', label: 'Region', value: x?.region || '' },
    { name: 'description', label: 'Description', value: x?.description || '', type: 'textarea' },
    { name: 'gm_notes', label: 'GM notes (secret)', value: x?.gm_notes || '', type: 'textarea' },
    { name: 'visibility', label: 'Visibility', value: x?.visibility || 'public', type: 'select', options: VIS },
  ],
  onSubmit: saver('locations', x),
});
const factionForm = (kind, x) => formScreen({
  title: x ? 'EDIT FACTION' : 'NEW FACTION',
  fields: [
    { name: 'name', label: 'Name', value: x?.name || '' },
    { name: 'relationship', label: 'Standing with party', value: x?.relationship || '' },
    { name: 'description', label: 'Description', value: x?.description || '', type: 'textarea' },
    { name: 'gm_notes', label: 'GM notes (secret)', value: x?.gm_notes || '', type: 'textarea' },
    { name: 'visibility', label: 'Visibility', value: x?.visibility || 'public', type: 'select', options: VIS },
  ],
  onSubmit: saver('factions', x),
});

const saver = (kind, existing) => async (v) => {
  if (existing) await api(`/api/${kind}/${existing.id}`, { method: 'PUT', body: v });
  else await api(`/api/${kind}`, { method: 'POST', body: v });
};

// ========================================================================
// POKEDEX
// ========================================================================
function pokedexSearch() {
  return searchListPage({
    title: 'POKEDEX',
    fetch: async (q) => {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const list = await api(`/api/pokemon${params}`);
      return list.slice(0, 300);
    },
    row: (p) => ({ title: p.name, meta: (p.types || []).join('/') }),
    onOpen: (p) => pushScreen(() => pokedexDetail(p.id)),
  });
}

async function pokedexDetail(id) {
  const p = await api(`/api/pokemon/${id}`);
  return {
    title: p.name.toUpperCase(),
    page: (el) => {
      const s = p.stats || {};
      const statRow = ['hp', 'atk', 'def', 'spatk', 'spdef', 'speed'].map((k) => kv(k.toUpperCase(), s[k] ?? '—')).join('');
      const caps = p.capabilities || {};
      const capRow = ['movement', 'combat', 'narrative'].filter((g) => caps[g]?.length)
        .map((g) => `<div class="kv"><span class="k">${g}</span><span class="v">${caps[g].map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</span></div>`).join('');
      const skills = p.skills || {};
      const skillRow = Object.keys(skills).length
        ? `<div class="kv"><span class="k">Skills</span><span class="v">${Object.entries(skills).map(([k, v]) => `<span class="tag blue">${esc(k)}:${esc(v)}</span>`).join('')}</span></div>` : '';
      el.innerHTML =
        box(`${esc(p.name)} ${(p.types || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}`,
          kv('Habitat', p.habitat) + kv('Diet', p.diet) + kv('Size', p.size) + kv('Weight', p.weight_class) + kv('Power', p.power) + kv('Evo stage', p.evo_stage)) +
        box('STATS', statRow) +
        (capRow ? box('CAPABILITIES', capRow) : '') +
        (skillRow ? box('SKILLS', skillRow) : '') +
        (p.description ? box('NOTES', `<div class="text-content">${esc(p.description)}</div>`) : '');
    },
  };
}

// ========================================================================
// RULES
// ========================================================================
async function rulesMenu() {
  const cats = await api('/api/rules/categories').catch(() => []);
  const menu = [
    { label: 'SEARCH RULES', hint: 'ask a question', onSelect: () => pushScreen(rulesSearch) },
    { label: 'MOVES', hint: 'reference', onSelect: () => pushScreen(() => referenceList('move', 'MOVES')) },
    { label: 'ABILITIES', hint: 'reference', onSelect: () => pushScreen(() => referenceList('ability', 'ABILITIES')) },
    { label: 'ITEMS', hint: 'reference', onSelect: () => pushScreen(() => referenceList('item', 'ITEMS')) },
  ];
  if (isGM()) menu.push({ label: '+ NEW RULE', onSelect: () => pushScreen(() => ruleForm(null)) });
  for (const c of cats) menu.push({ label: c.category, hint: `${c.n}`, onSelect: () => pushScreen(() => rulesCategory(c.category)) });
  return { title: 'RULES', heading: 'RULES COMPENDIUM', menu };
}

function rulesSearch() {
  return {
    title: 'SEARCH',
    page: (el, ctx) => {
      el.innerHTML =
        `<div class="searchbar"><input id="q" placeholder="ASK: how does catching work?" /></div>` +
        `<div id="out"><div class="subnote">Type a question and press ENTER. ` +
        `Natural-language answers use the rulebook when an API key is set; otherwise keyword search.</div></div>`;
      const q = el.querySelector('#q');
      const out = el.querySelector('#out');
      q.focus();
      const run = async () => {
        const query = q.value.trim();
        if (!query) return;
        out.innerHTML = '<div class="loading">SEARCHING . . .</div>';
        try {
          const r = await api('/api/rules/search', { method: 'POST', body: { query } });
          let html = '';
          if (r.answer) html += `<div class="ai-answer"><div class="box-title">ANSWER</div><div class="text-content">${esc(r.answer)}</div></div>`;
          if (r.results?.length) {
            html += '<ul class="list">' + r.results.map((e) =>
              `<li class="row" data-id="${e.id}"><span class="title">${esc(e.title)}</span> <span class="tag">${esc(e.category || '')}</span><div class="meta">p.${esc(e.page || '?')}</div></li>`).join('') + '</ul>';
          } else if (!r.answer) {
            html += '<div class="empty">NO MATCHES</div>';
          }
          out.innerHTML = html;
          out.querySelectorAll('.row').forEach((row) => {
            row.onclick = () => pushScreen(() => ruleDetail(Number(row.dataset.id)));
          });
        } catch (e) {
          out.innerHTML = `<div class="empty">ERROR<br><span class="subnote">${esc(e.message)}</span></div>`;
        }
      };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      ctx.onKey = () => false;
    },
  };
}

async function rulesCategory(cat) {
  const list = await api(`/api/rules?category=${encodeURIComponent(cat)}`);
  return {
    title: cat.toUpperCase(),
    menu: list.map((e) => ({ label: e.title, hint: `p.${e.page || '?'}`, onSelect: () => pushScreen(() => ruleDetail(e.id)) })),
  };
}

async function ruleDetail(id) {
  const e = await api(`/api/rules/${id}`);
  return {
    title: 'RULE',
    page: (el) => {
      el.innerHTML =
        box(`${esc(e.title)} <span class="tag">${esc(e.category || '')}</span>`,
          `<div class="subnote">${e.source === 'rulebook' ? `RULE BOOK p.${esc(e.page || '?')}` : 'GM ENTRY'}</div>` +
          `<div class="text-content">${esc(e.body || '')}</div>`) +
        gmButtons(
          () => pushScreen(() => ruleForm(e)),
          () => confirmDelete(`DELETE "${e.title}"?`, async () => { await api(`/api/rules/${id}`, { method: 'DELETE' }); })
        );
      wireGmButtons(el);
    },
  };
}

function ruleForm(e) {
  return formScreen({
    title: e ? 'EDIT RULE' : 'NEW RULE',
    fields: [
      { name: 'title', label: 'Title', value: e?.title || '' },
      { name: 'category', label: 'Category tag', value: e?.category || '', placeholder: 'Combat / Catching / Status' },
      { name: 'body', label: 'Rule text', value: e?.body || '', type: 'textarea', big: true },
      { name: 'visibility', label: 'Visibility', value: e?.visibility || 'public', type: 'select', options: VIS },
    ],
    onSubmit: async (v) => {
      if (e) await api(`/api/rules/${e.id}`, { method: 'PUT', body: v });
      else await api('/api/rules', { method: 'POST', body: { ...v, source: 'gm' } });
    },
  });
}

// Reference catalogue (moves / abilities / items) under RULES.
function referenceList(kind, title) {
  return searchListPage({
    title,
    fetch: async (q) => {
      const params = new URLSearchParams({ kind });
      if (q) params.set('search', q);
      const r = await api(`/api/reference?${params.toString()}`);
      return r.items;
    },
    row: (x) => ({ title: x.name, meta: `${x.category || ''}${x.summary ? ' · ' + x.summary : ''}`.slice(0, 70) }),
    onOpen: (x) => pushScreen(() => referenceDetail(x.id)),
  });
}

async function referenceDetail(id) {
  const x = await api(`/api/reference/${id}`);
  return {
    title: x.name.toUpperCase(),
    page: (el) => {
      const rows = Object.entries(x.data || {}).filter(([, v]) => v).map(([k, v]) => kv(k, v)).join('');
      el.innerHTML = box(`${esc(x.name)} ${x.category ? `<span class="tag">${esc(x.category)}</span>` : ''}`, rows || '<div class="subnote">no details</div>');
    },
  };
}

// ========================================================================
// OPTIONS
// ========================================================================
function optionsMenu() {
  const c = state.campaign;
  const menu = [
    {
      label: isGM() ? 'GM MODE: ON' : 'GM MODE: OFF',
      hint: isGM() ? 'tap to lock' : 'tap to unlock',
      onSelect: () => (isGM() ? doLogout() : pushScreen(gmLoginForm)),
    },
  ];
  if (isGM()) menu.push({ label: 'CAMPAIGN NAME', hint: c.name, onSelect: () => pushScreen(campaignNameForm) });
  menu.push({ label: `SESSIONS PLAYED: ${c.session_count}`, disabled: true });
  menu.push({ label: `DATE: ${c.current_date}`, disabled: true });
  menu.push({ label: 'CAMPAIGN: ' + c.name, disabled: true });
  return { title: 'OPTIONS', heading: 'OPTIONS', menu };
}

function gmLoginForm() {
  return formScreen({
    title: 'GM LOGIN',
    intro: 'Enter the GM passcode to unlock editing. Players never need this.',
    fields: [{ name: 'passcode', label: 'Passcode', value: '', type: 'password' }],
    submitLabel: 'UNLOCK',
    onSubmit: async (v) => {
      await api('/api/auth/login', { method: 'POST', body: { passcode: v.passcode } });
      state.role = 'gm';
      setMode(true);
      await refreshCampaign();
      toast('GM MODE ON', 'ok');
    },
    after: () => resetTo(mainMenu),
  });
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.role = 'player';
  setMode(false);
  await refreshCampaign();
  toast('LOCKED', 'ok');
  resetTo(mainMenu);
}

function campaignNameForm() {
  return formScreen({
    title: 'CAMPAIGN NAME',
    fields: [{ name: 'name', label: 'Campaign name', value: state.campaign.name || '' }],
    onSubmit: async (v) => { await api('/api/campaign', { method: 'PUT', body: v }); await refreshCampaign(); },
  });
}

// ========================================================================
// Reusable building blocks
// ========================================================================

// A search box over a list, with arrow-key row selection (works while typing).
function searchListPage({ title, fetch, row, onOpen, onNew }) {
  return {
    title,
    page: (el, ctx) => {
      el.innerHTML =
        `<div class="searchbar"><input id="q" placeholder="SEARCH..." /></div>` +
        (onNew ? `<div class="btn-row" style="margin-top:0;margin-bottom:8px"><button class="btn" id="new">+ NEW</button></div>` : '') +
        `<div id="out"><div class="loading">. . .</div></div>`;
      const q = el.querySelector('#q');
      const out = el.querySelector('#out');
      let items = [];
      let cursor = 0;
      let timer;
      if (onNew) el.querySelector('#new').onclick = onNew;

      const draw = () => {
        if (!items.length) { out.innerHTML = '<div class="empty">NO RESULTS</div>'; return; }
        out.innerHTML = '<ul class="list">' + items.map((it, i) => {
          const r = row(it);
          return `<li class="row${i === cursor ? ' sel' : ''}" data-i="${i}"><span class="title">${esc(r.title)}</span>${r.meta ? `<div class="meta">${esc(r.meta)}</div>` : ''}</li>`;
        }).join('') + '</ul>';
        out.querySelectorAll('.row').forEach((rEl) => { rEl.onclick = () => onOpen(items[Number(rEl.dataset.i)]); });
      };
      const load = async () => {
        out.innerHTML = '<div class="loading">. . .</div>';
        try { items = await fetch(q.value.trim()); cursor = 0; draw(); }
        catch (e) { out.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      };
      q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
      q.focus();
      load();

      // Arrow keys move the row cursor even while the search box has focus.
      ctx.onKey = (e) => {
        if (e.key === 'ArrowDown') { if (items.length) { cursor = (cursor + 1) % items.length; draw(); } return true; }
        if (e.key === 'ArrowUp') { if (items.length) { cursor = (cursor - 1 + items.length) % items.length; draw(); } return true; }
        if (e.key === 'Enter') { if (items[cursor]) onOpen(items[cursor]); return true; }
        return false;
      };
    },
  };
}

// A drill-in form screen. fields: {name,label,value,type,options,placeholder,big}.
function formScreen({ title, intro, fields, onSubmit, submitLabel = 'SAVE', after }) {
  return {
    title,
    page: (el) => {
      const html = fields.map((f) => {
        const id = `f_${f.name}`;
        let control;
        if (f.type === 'textarea') control = `<textarea id="${id}"${f.big ? ' style="min-height:200px"' : ''}>${esc(f.value)}</textarea>`;
        else if (f.type === 'select') control = `<select id="${id}">${f.options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
        else control = `<input id="${id}" type="${f.type || 'text'}" value="${esc(f.value)}" placeholder="${esc(f.placeholder || '')}" />`;
        return `<label class="field"><span>${esc(f.label)}</span>${control}</label>`;
      }).join('');
      el.innerHTML = (intro ? `<div class="subnote">${esc(intro)}</div>` : '') + html +
        `<div class="btn-row"><button class="btn" id="save">${esc(submitLabel)}</button><button class="btn" id="cancel">CANCEL</button></div>`;
      el.querySelector('#cancel').onclick = () => popScreen();
      el.querySelector('#save').onclick = async () => {
        const v = {};
        for (const f of fields) v[f.name] = el.querySelector(`#f_${f.name}`).value;
        try {
          await onSubmit(v);
          toast('SAVED', 'ok');
          if (after) after(); else popScreen();
        } catch (e) { toast(e.message, 'warn'); }
      };
      const first = el.querySelector('input, textarea');
      if (first) first.focus();
    },
  };
}

// GM-only edit/delete buttons for a detail page. gmButtons() builds the HTML and
// stashes the handlers; wireGmButtons() attaches them once the HTML is in the DOM.
// Safe because a screen renders synchronously, one at a time.
let _gmEdit = null;
let _gmDelete = null;
function gmButtons(onEdit, onDelete) {
  _gmEdit = onEdit || null;
  _gmDelete = onDelete || null;
  if (!isGM()) return '';
  return `<div class="btn-row">${onEdit ? '<button class="btn" data-edit>EDIT</button>' : ''}${onDelete ? '<button class="btn warn" data-delete>DELETE</button>' : ''}</div>`;
}
function wireGmButtons(el) {
  const e = el.querySelector('[data-edit]');
  const d = el.querySelector('[data-delete]');
  if (e && _gmEdit) e.onclick = _gmEdit;
  if (d && _gmDelete) d.onclick = _gmDelete;
}

// Confirm as a tiny menu screen. On YES it runs the delete, then pops both the
// confirm screen AND the detail screen it was launched from, landing back on the
// list (which re-fetches), so we never try to re-render a deleted record.
function confirmDelete(message, onYes) {
  pushScreen(() => ({
    title: 'CONFIRM',
    intro: esc(message),
    menu: [
      { label: 'NO — CANCEL', onSelect: () => popScreen() },
      {
        label: 'YES — DELETE',
        onSelect: async () => {
          try {
            await onYes();
            toast('DELETED', 'ok');
            await popScreen();
            await popScreen();
          } catch (e) { toast(e.message, 'warn'); }
        },
      },
    ],
  }));
}
