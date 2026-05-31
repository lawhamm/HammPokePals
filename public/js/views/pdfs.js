// Rules & PDFs view — the library for PTE core rules, the GM guide, bestiaries,
// etc. Players see a PDF inline only if it's marked public; the GM can upload new
// docs and mark them GM-only (e.g. the GM guide).

import { api, esc, toast } from '../core.js';
import { openModal, closeModal, field, visibilityField, confirmDialog } from '../ui.js';

export async function renderPdfs(ctx) {
  const { view, isGM } = ctx;
  const docs = await api('/api/pdfs');

  // group by category
  const groups = {};
  for (const d of docs) (groups[d.category || 'Uncategorized'] ||= []).push(d);

  view.innerHTML = `
    <div class="page-head">
      <h1>Rules &amp; PDFs</h1>
      <span class="subtle">${docs.length} document${docs.length === 1 ? '' : 's'}</span>
      <div class="spacer"></div>
      ${isGM ? '<button class="btn primary" id="upBtn">+ Upload PDF</button>' : ''}
    </div>
    ${docs.length === 0
      ? `<div class="empty">No documents yet.${isGM ? ' Upload your PTE rules and GM guide with “+ Upload PDF”.' : ' The GM hasn’t shared any rules documents yet.'}</div>`
      : Object.entries(groups).map(([cat, list]) => `
        <h2 class="subtle" style="margin:1rem 0 0.5rem">${esc(cat)}</h2>
        <div class="list">
          ${list.map((d) => `
            <div class="row ${d.visibility === 'gm' ? 'gm-item' : ''}">
              <div class="row-main">
                <h3>${esc(d.title)} ${d.visibility === 'gm' ? '<span class="gm-badge">GM</span>' : ''}</h3>
                ${d.description ? `<div class="cat">${esc(d.description)}</div>` : ''}
              </div>
              <button class="btn small" data-open="${d.id}">Open</button>
              ${isGM ? `<button class="btn small" data-edit="${d.id}">Edit</button><button class="btn small danger" data-del="${d.id}">Delete</button>` : ''}
            </div>`).join('')}
        </div>`).join('')}
    <div id="viewer"></div>`;

  view.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.open;
      const v = view.querySelector('#viewer');
      const d = docs.find((x) => String(x.id) === id);
      v.innerHTML = `<h2 style="margin-top:1.5rem">${esc(d.title)}</h2>
        <iframe class="pdf-frame" src="/api/pdfs/${id}/file"></iframe>`;
      v.scrollIntoView({ behavior: 'smooth' });
    };
  });

  if (isGM) {
    view.querySelector('#upBtn').onclick = () => openUpload(ctx);
    view.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openEdit(ctx, docs.find((x) => String(x.id) === b.dataset.edit));
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const d = docs.find((x) => String(x.id) === b.dataset.del);
        if (!(await confirmDialog(`Delete “${d.title}”? The PDF file will be removed.`))) return;
        await api(`/api/pdfs/${d.id}`, { method: 'DELETE' });
        toast('Deleted', 'ok');
        ctx.reroute();
      };
    });
  }
}

function openUpload(ctx) {
  openModal({
    title: 'Upload a PDF',
    bodyHTML: `
      ${field({ label: 'Title', name: 'title', placeholder: 'PTE Core Rules', full: true })}
      <div class="form-row">
        ${field({ label: 'Category', name: 'category', placeholder: 'Core Rules / GM Guide / Bestiary', value: 'Core Rules' })}
        ${visibilityField('public')}
      </div>
      ${field({ label: 'Description', name: 'description', textarea: true, full: true })}
      <label class="full"><span>PDF file</span><input type="file" name="file" accept="application/pdf" required /></label>`,
    submitLabel: 'Upload',
    onSubmit: async (_data) => {
      const form = document.getElementById('modalForm');
      const fd = new FormData(form);
      try {
        await api('/api/pdfs', { method: 'POST', body: fd, isForm: true });
        closeModal();
        toast('Uploaded', 'ok');
        ctx.reroute();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  });
}

function openEdit(ctx, d) {
  openModal({
    title: `Edit “${d.title}”`,
    bodyHTML: `
      ${field({ label: 'Title', name: 'title', value: d.title, full: true })}
      <div class="form-row">
        ${field({ label: 'Category', name: 'category', value: d.category || '' })}
        ${visibilityField(d.visibility)}
      </div>
      ${field({ label: 'Description', name: 'description', value: d.description || '', textarea: true, full: true })}`,
    submitLabel: 'Save',
    onSubmit: async (data) => {
      try {
        await api(`/api/pdfs/${d.id}`, { method: 'PUT', body: data });
        closeModal();
        toast('Saved', 'ok');
        ctx.reroute();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  });
}
