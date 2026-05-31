// Modal + form helpers shared by every GM editing view.

import { esc } from './core.js';

const backdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');

export function closeModal() {
  backdrop.hidden = true;
  modal.innerHTML = '';
}

backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

/**
 * Build a labelled input for a form. Returns an HTML string.
 * opts: { label, name, type, value, options, full, placeholder, textarea }
 */
export function field(opts) {
  const {
    label, name, type = 'text', value = '', options, full = false,
    placeholder = '', textarea = false,
  } = opts;
  const cls = full ? 'full' : '';
  let control;
  if (options) {
    control = `<select name="${name}">${options
      .map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const t = typeof o === 'string' ? o : o.label;
        return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`;
      })
      .join('')}</select>`;
  } else if (textarea) {
    control = `<textarea name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else {
    control = `<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" />`;
  }
  return `<label class="${cls}"><span>${esc(label)}</span>${control}</label>`;
}

const VIS_OPTIONS = [
  { value: 'public', label: 'Public — players can see this' },
  { value: 'gm', label: 'GM only — hidden from players' },
];

export function visibilityField(value = 'public') {
  return field({ label: 'Visibility', name: 'visibility', options: VIS_OPTIONS, value, full: true });
}

/**
 * Open a modal form.
 * opts: { title, bodyHTML, onSubmit(dataObj), submitLabel, extraButtons }
 */
export function openModal({ title, bodyHTML, onSubmit, submitLabel = 'Save', wide = false }) {
  modal.style.maxWidth = wide ? '820px' : '640px';
  modal.innerHTML = `
    <h2>${esc(title)}</h2>
    <form id="modalForm"><div class="form-grid">${bodyHTML}</div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="modalCancel">Cancel</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}
      </div>
    </form>`;
  backdrop.hidden = false;
  modal.querySelector('#modalCancel').onclick = closeModal;
  const form = modal.querySelector('#modalForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const data = Object.fromEntries(new FormData(form).entries());
    await onSubmit(data);
  };
  const first = form.querySelector('input, textarea, select');
  if (first) first.focus();
}

// Confirmation dialog returning a promise.
export function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal({
      title: 'Please confirm',
      bodyHTML: `<p>${esc(message)}</p>`,
      submitLabel: 'Confirm',
      onSubmit: () => { closeModal(); resolve(true); },
    });
    modal.querySelector('#modalCancel').onclick = () => { closeModal(); resolve(false); };
  });
}
