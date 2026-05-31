// Inventory view — party items, Poké Balls, TMs, key items. Quantity + owner
// tracking. GM-only items (e.g. a hidden quest item) stay hidden from players.

import { api, esc, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

export async function renderInventory(ctx) {
  const { view, isGM } = ctx;
  const items = await api('/api/items');

  const groups = {};
  for (const i of items) (groups[i.category || 'Misc'] ||= []).push(i);

  view.innerHTML = `
    <div class="page-head">
      <h1>Inventory</h1>
      <span class="subtle">${items.length} item${items.length === 1 ? '' : 's'}</span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="addBtn">+ Add item</button>' : ''}
    </div>
    ${items.length === 0
      ? `<div class="empty">No items yet.${isGM ? ' Track party gear with “+ Add item”.' : ''}</div>`
      : Object.entries(groups).map(([cat, list]) => `
        <h2 class="subtle" style="margin:1rem 0 0.5rem">${esc(cat)}</h2>
        <div class="list">
          ${list.map((i) => `
            <div class="row ${i.visibility === 'gm' ? 'gm-item' : ''}">
              <div class="row-main">
                <h3>${esc(i.name)} ${i.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
                ${i.description ? `<div class="cat">${esc(i.description)}</div>` : ''}
                ${i.owner ? `<div class="cat">Held by: ${esc(i.owner)}</div>` : ''}
                ${isGM && i.gm_notes ? `<div class="cat" style="color:var(--gm)">GM: ${esc(i.gm_notes)}</div>` : ''}
              </div>
              <span class="chip">×${Number(i.quantity) || 1}</span>
              ${i.value ? `<span class="cat">${esc(i.value)}</span>` : ''}
              ${isGM ? `<button class="btn small" data-edit="${i.id}">Edit</button><button class="btn small danger" data-del="${i.id}">Delete</button>` : ''}
            </div>`).join('')}
        </div>`).join('')}`;

  if (isGM) {
    view.querySelector('#addBtn').onclick = () => openEditor(ctx, null);
    view.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openEditor(ctx, items.find((x) => String(x.id) === b.dataset.edit));
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const i = items.find((x) => String(x.id) === b.dataset.del);
        if (!(await confirmDialog(`Delete “${i.name}”?`))) return;
        await api(`/api/items/${i.id}`, { method: 'DELETE' });
        toast('Deleted', 'ok');
        ctx.reroute();
      };
    });
  }
}

function openEditor(ctx, i) {
  const x = i || {};
  openModal({
    title: i ? `Edit “${x.name}”` : 'Add item',
    bodyHTML: `
      <div class="form-row">
        ${field({ label: 'Name', name: 'name', value: x.name || '' })}
        ${field({ label: 'Category', name: 'category', value: x.category || '', placeholder: 'Poké Ball / Medicine / TM / Key Item' })}
      </div>
      ${field({ label: 'Description', name: 'description', value: x.description || '', textarea: true, full: true })}
      <div class="form-row">
        ${field({ label: 'Quantity', name: 'quantity', type: 'number', value: x.quantity ?? 1 })}
        ${field({ label: 'Owner / holder', name: 'owner', value: x.owner || '' })}
      </div>
      <div class="form-row">
        ${field({ label: 'Value', name: 'value', value: x.value || '', placeholder: '₽200' })}
        ${visibilityField(x.visibility || 'public')}
      </div>
      ${field({ label: 'GM notes (secret)', name: 'gm_notes', value: x.gm_notes || '', textarea: true, full: true })}`,
    submitLabel: i ? 'Save' : 'Create',
    onSubmit: async (data) => {
      try {
        if (i) await api(`/api/items/${i.id}`, { method: 'PUT', body: data });
        else await api('/api/items', { method: 'POST', body: data });
        closeModal();
        toast('Saved', 'ok');
        ctx.reroute();
      } catch (err) {
        toast(err.message, 'err');
      }
    },
  });
}
