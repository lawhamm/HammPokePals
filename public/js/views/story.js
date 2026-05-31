// Story view — the plot storybook & lore, grouped by chapter. Entries can be
// public lore (players read it) or GM-only plot secrets.

import { api, esc, mdLite, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

export async function renderStory(ctx) {
  const { view, isGM } = ctx;
  const entries = await api('/api/story');

  const groups = {};
  for (const e of entries) (groups[e.chapter || 'Unsorted'] ||= []).push(e);

  view.innerHTML = `
    <div class="page-head">
      <h1>Story</h1>
      <span class="subtle">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="addBtn">+ Add entry</button>' : ''}
    </div>
    ${entries.length === 0
      ? `<div class="empty">No story entries yet.${isGM ? ' Start your storybook with “+ Add entry”.' : ''}</div>`
      : Object.entries(groups).map(([chap, list]) => `
        <h2 class="subtle" style="margin:1.2rem 0 0.6rem">${esc(chap)}</h2>
        <div class="list">
          ${list.map((e) => `
            <div class="row ${e.visibility === 'gm' ? 'gm-item' : ''}" style="flex-direction:column;align-items:stretch">
              <div style="display:flex;align-items:center;gap:0.6rem">
                <h3 style="margin:0;flex:1">${esc(e.title)} ${e.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
                ${isGM ? `<button class="btn small" data-edit="${e.id}">Edit</button><button class="btn small danger" data-del="${e.id}">Delete</button>` : ''}
              </div>
              <div class="story-body">${mdLite(e.body || '')}</div>
            </div>`).join('')}
        </div>`).join('')}`;

  if (isGM) {
    view.querySelector('#addBtn').onclick = () => openEditor(ctx, null);
    view.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openEditor(ctx, entries.find((x) => String(x.id) === b.dataset.edit));
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const e = entries.find((x) => String(x.id) === b.dataset.del);
        if (!(await confirmDialog(`Delete “${e.title}”?`))) return;
        await api(`/api/story/${e.id}`, { method: 'DELETE' });
        toast('Deleted', 'ok');
        ctx.reroute();
      };
    });
  }
}

function openEditor(ctx, e) {
  const x = e || {};
  openModal({
    title: e ? `Edit “${x.title}”` : 'Add story entry',
    wide: true,
    bodyHTML: `
      <div class="form-row">
        ${field({ label: 'Title', name: 'title', value: x.title || '' })}
        ${field({ label: 'Chapter / Act', name: 'chapter', value: x.chapter || '', placeholder: 'Act I' })}
      </div>
      ${field({ label: 'Body (supports **bold**, *italics*, blank lines = paragraphs)', name: 'body', value: x.body || '', textarea: true, full: true })}
      <div class="form-row">
        ${field({ label: 'Order', name: 'order_index', type: 'number', value: x.order_index ?? 0 })}
        ${visibilityField(x.visibility || 'public')}
      </div>`,
    submitLabel: e ? 'Save' : 'Create',
    onSubmit: async (data) => {
      try {
        if (e) await api(`/api/story/${e.id}`, { method: 'PUT', body: data });
        else await api('/api/story', { method: 'POST', body: data });
        closeModal();
        toast('Saved', 'ok');
        ctx.reroute();
      } catch (err) {
        toast(err.message, 'err');
      }
    },
  });
}
