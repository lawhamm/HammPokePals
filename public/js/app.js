// HammPokePals front-end. A small dependency-free SPA. It asks the server who it
// is (player vs GM), renders the matching navigation, and lazily fetches each
// section from the JSON API. GM-only controls (add/edit/delete/upload) appear
// only when the GM view is unlocked.

import { api, toast } from './core.js';
import { openModal, closeModal, field } from './ui.js';
import { renderCompendium, renderPokemonDetail } from './views/compendium.js';
import { renderPdfs } from './views/pdfs.js';
import { renderStory } from './views/story.js';
import { renderSessions } from './views/sessions.js';
import { renderInventory } from './views/inventory.js';
import { renderMaps } from './views/maps.js';
import { renderReference } from './views/reference.js';

const state = { role: 'player', appName: 'HammPokePals' };

// Tab definitions. `gm` = only shown to the GM.
const TABS = [
  { id: 'compendium', label: 'Compendium', render: renderCompendium },
  { id: 'reference', label: 'Reference', render: renderReference },
  { id: 'rules', label: 'Rules & PDFs', render: renderPdfs },
  { id: 'story', label: 'Story', render: renderStory },
  { id: 'maps', label: 'Maps', render: renderMaps },
  { id: 'inventory', label: 'Inventory', render: renderInventory },
  { id: 'sessions', label: 'Sessions', render: renderSessions, gm: true },
];

const view = document.getElementById('view');

function isGM() { return state.role === 'gm'; }

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [tab, ...rest] = hash.split('/');
  return { tab: tab || 'compendium', rest };
}

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  const { tab: active } = currentRoute();
  for (const t of TABS) {
    if (t.gm && !isGM()) continue;
    const b = document.createElement('button');
    b.className = 'tab' + (t.id === active ? ' active' : '') + (t.gm ? ' gm-only' : '');
    b.textContent = t.label;
    b.onclick = () => { location.hash = `#/${t.id}`; };
    tabsEl.appendChild(b);
  }
}

function renderRoleBox() {
  const box = document.getElementById('roleBox');
  box.innerHTML = '';
  const pill = document.createElement('span');
  pill.className = 'role-pill' + (isGM() ? ' gm' : '');
  pill.textContent = isGM() ? 'GM mode' : 'Player view';
  box.appendChild(pill);

  const btn = document.createElement('button');
  btn.className = 'btn small';
  btn.textContent = isGM() ? 'Lock' : 'GM login';
  btn.onclick = isGM() ? doLogout : openLogin;
  box.appendChild(btn);
}

function openLogin() {
  openModal({
    title: 'Unlock GM view',
    bodyHTML: `<p class="subtle">Enter the GM passcode to reveal session notes, plot secrets, and editing tools. Players never need this.</p>
      ${field({ label: 'Passcode', name: 'passcode', type: 'password', full: true })}`,
    onSubmit: async (data) => {
      try {
        await api('/api/auth/login', { method: 'POST', body: { passcode: data.passcode } });
        await refreshMe();
        closeModal();
        toast('GM view unlocked', 'ok');
        route();
      } catch (e) {
        toast(e.message || 'Login failed', 'err');
      }
    },
    submitLabel: 'Unlock',
  });
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  await refreshMe();
  toast('Back to player view', 'ok');
  if (currentRoute().tab === 'sessions') location.hash = '#/compendium';
  else route();
}

async function refreshMe() {
  const me = await api('/api/me');
  state.role = me.role;
  state.appName = me.appName;
  document.querySelector('.brand-name').textContent = me.appName;
  document.title = me.appName;
  renderTabs();
  renderRoleBox();
}

// Central render dispatch.
async function route() {
  renderTabs();
  const { tab, rest } = currentRoute();
  const def = TABS.find((t) => t.id === tab);
  if (!def || (def.gm && !isGM())) { location.hash = '#/compendium'; return; }

  view.innerHTML = '<div class="loading">Loading…</div>';
  const ctx = { isGM: isGM(), view, rest, reroute: route, goto: (h) => (location.hash = h) };
  try {
    // Compendium detail sub-route: #/compendium/<id>
    if (tab === 'compendium' && rest[0]) {
      await renderPokemonDetail(ctx, rest[0]);
    } else {
      await def.render(ctx);
    }
  } catch (e) {
    view.innerHTML = `<div class="empty">Couldn't load this section.<br><span class="subtle">${e.message}</span></div>`;
  }
}

window.addEventListener('hashchange', route);

(async function init() {
  await refreshMe();
  if (!location.hash) location.hash = '#/compendium';
  route();
})();
