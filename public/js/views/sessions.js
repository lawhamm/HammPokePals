// Sessions view — session-by-session tracking. Player-facing recap in `summary`,
// GM prep/secrets in `gm_notes`. This whole tab is GM-gated in the nav, but the
// summaries are written so they could be shared later by flipping visibility.

import { api, esc, mdLite, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

export async function renderSessions(ctx) {
  const { view, isGM } = ctx;
  const sessions = await api('/api/sessions');

  view.innerHTML = `
    <div class="page-head">
      <h1>Sessions</h1>
      <span class="subtle">${sessions.length} logged</span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="addBtn">+ New session</button>' : ''}
    </div>
    <div class="notice">Session notes are GM-only by default. Set an entry to “Public” to share its recap with players.</div>
    ${sessions.length === 0
      ? `<div class="empty">No sessions logged yet.</div>`
      : `<div class="list">${sessions.map((s) => `
          <div class="row ${s.visibility === 'gm' ? 'gm-item' : ''}" style="flex-direction:column;align-items:stretch">
            <div style="display:flex;align-items:center;gap:0.6rem">
              <h3 style="margin:0;flex:1">${esc(s.title)} ${s.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
              ${s.played_on ? `<span class="cat">${esc(s.played_on)}</span>` : ''}
              ${isGM ? `<button class="btn small" data-edit="${s.id}">Edit</button><button class="btn small danger" data-del="${s.id}">Delete</button>` : ''}
            </div>
            ${s.summary ? `<div class="story-body"><span class="k subtle">Recap</span>${mdLite(s.summary)}</div>` : ''}
            ${isGM && s.gm_notes ? `<div class="gm-note"><span class="k">GM notes</span>${mdLite(s.gm_notes)}</div>` : ''}
          </div>`).join('')}</div>`}`;

  if (isGM) {
    view.querySelector('#addBtn').onclick = () => openEditor(ctx, null);
    view.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openEditor(ctx, sessions.find((x) => String(x.id) === b.dataset.edit));
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const s = sessions.find((x) => String(x.id) === b.dataset.del);
        if (!(await confirmDialog(`Delete session “${s.title}”?`))) return;
        await api(`/api/sessions/${s.id}`, { method: 'DELETE' });
        toast('Deleted', 'ok');
        ctx.reroute();
      };
    });
  }
}

function openEditor(ctx, s) {
  const x = s || { visibility: 'gm' };
  openModal({
    title: s ? `Edit “${x.title}”` : 'New session',
    wide: true,
    bodyHTML: `
      <div class="form-row">
        ${field({ label: 'Title', name: 'title', value: x.title || '', placeholder: 'Session 4 — The Cinnabar Lab' })}
        ${field({ label: 'Played on', name: 'played_on', type: 'date', value: x.played_on || '' })}
      </div>
      ${field({ label: 'Player-facing recap', name: 'summary', value: x.summary || '', textarea: true, full: true })}
      ${field({ label: 'GM notes (secret prep, twists, rolls)', name: 'gm_notes', value: x.gm_notes || '', textarea: true, full: true })}
      <div class="form-row">
        ${field({ label: 'Order', name: 'order_index', type: 'number', value: x.order_index ?? 0 })}
        ${visibilityField(x.visibility || 'gm')}
      </div>`,
    submitLabel: s ? 'Save' : 'Create',
    onSubmit: async (data) => {
      try {
        if (s) await api(`/api/sessions/${s.id}`, { method: 'PUT', body: data });
        else await api('/api/sessions', { method: 'POST', body: data });
        closeModal();
        toast('Saved', 'ok');
        ctx.reroute();
      } catch (err) {
        toast(err.message, 'err');
      }
    },
  });
}
