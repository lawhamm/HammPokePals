// Maps view — region maps with an uploaded image and pin markers. Players see
// the map and its public markers; GM-only markers (ambushes, hidden caches) are
// filtered out server-side before the player ever receives them.

import { api, esc, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

export async function renderMaps(ctx) {
  const { view, isGM } = ctx;
  const maps = await api('/api/maps');

  view.innerHTML = `
    <div class="page-head">
      <h1>Maps</h1>
      <span class="subtle">${maps.length} map${maps.length === 1 ? '' : 's'}</span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="addBtn">+ Add map</button>' : ''}
    </div>
    ${maps.length === 0
      ? `<div class="empty">No maps yet.${isGM ? ' Add a region map with “+ Add map”, then upload the image.' : ''}</div>`
      : `<div class="list">${maps.map((m) => mapBlock(m, isGM)).join('')}</div>`}`;

  if (isGM) {
    view.querySelector('#addBtn').onclick = () => openEditor(ctx, null);
    view.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openEditor(ctx, maps.find((x) => String(x.id) === b.dataset.edit));
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const m = maps.find((x) => String(x.id) === b.dataset.del);
        if (!(await confirmDialog(`Delete map “${m.title}”?`))) return;
        await api(`/api/maps/${m.id}`, { method: 'DELETE' });
        toast('Deleted', 'ok');
        ctx.reroute();
      };
    });
    view.querySelectorAll('[data-img]').forEach((b) => {
      b.onclick = () => openImageUpload(ctx, b.dataset.img);
    });
  }
}

function mapBlock(m, isGM) {
  const markers = (m.markers || [])
    .map((mk) =>
      `<span class="chip" title="${esc(mk.note || '')}">📍 ${esc(mk.label || 'Marker')}${mk.visibility === 'gm' ? ' <span class="gm-badge">GM</span>' : ''}</span>`
    )
    .join('');
  return `
    <div class="row ${m.visibility === 'gm' ? 'gm-item' : ''}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:0.6rem">
        <h3 style="margin:0;flex:1">${esc(m.title)} ${m.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
        ${m.region ? `<span class="cat">${esc(m.region)}</span>` : ''}
        ${isGM ? `<button class="btn small" data-img="${m.id}">Image</button><button class="btn small" data-edit="${m.id}">Edit</button><button class="btn small danger" data-del="${m.id}">Delete</button>` : ''}
      </div>
      ${m.description ? `<div class="cat">${esc(m.description)}</div>` : ''}
      ${m.image
        ? `<img src="${esc(m.image)}" alt="${esc(m.title)}" style="max-width:100%;border-radius:8px;margin-top:0.6rem;border:1px solid var(--line)" />`
        : `<div class="empty" style="margin-top:0.6rem">No image uploaded yet.</div>`}
      ${markers ? `<div class="chip-list" style="margin-top:0.6rem">${markers}</div>` : ''}
    </div>`;
}

function openEditor(ctx, m) {
  const x = m || {};
  openModal({
    title: m ? `Edit “${x.title}”` : 'Add map',
    bodyHTML: `
      <div class="form-row">
        ${field({ label: 'Title', name: 'title', value: x.title || '' })}
        ${field({ label: 'Region', name: 'region', value: x.region || '' })}
      </div>
      ${field({ label: 'Description', name: 'description', value: x.description || '', textarea: true, full: true })}
      ${visibilityField(x.visibility || 'public')}
      <div class="notice full" style="grid-column:1/-1">Tip: save the map first, then use “Image” to upload the map picture.</div>`,
    submitLabel: m ? 'Save' : 'Create',
    onSubmit: async (data) => {
      try {
        if (m) await api(`/api/maps/${m.id}`, { method: 'PUT', body: data });
        else await api('/api/maps', { method: 'POST', body: data });
        closeModal();
        toast('Saved', 'ok');
        ctx.reroute();
      } catch (err) {
        toast(err.message, 'err');
      }
    },
  });
}

function openImageUpload(ctx, id) {
  openModal({
    title: 'Upload map image',
    bodyHTML: `<label class="full"><span>Image file (PNG/JPG)</span><input type="file" name="image" accept="image/*" required /></label>`,
    submitLabel: 'Upload',
    onSubmit: async () => {
      const fd = new FormData(document.getElementById('modalForm'));
      try {
        await api(`/api/maps/${id}/image`, { method: 'POST', body: fd, isForm: true });
        closeModal();
        toast('Image uploaded', 'ok');
        ctx.reroute();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  });
}
