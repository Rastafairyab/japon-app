// Formulario en hoja inferior (<dialog>). Se cierra con Cancelar, la ✕ o el botón "atrás".
import { esc } from './utils.js';

/**
 * Campo: { name, label, type: 'text'|'textarea'|'date'|'time'|'url'|'tel'|'select'|'segmented',
 *          required, half, lang, placeholder, hint, options: [{value,label}], rows, upper }
 *
 * @param {object}   o
 * @param {string}   o.title
 * @param {object[]} o.fields
 * @param {object}   [o.values]    valores iniciales
 * @param {(v:object)=>string|null} [o.validate]  devuelve un mensaje de error o null
 * @param {(v:object)=>Promise|void} o.onSave
 * @param {()=>Promise|void} [o.onDelete]  si existe, aparece el botón Borrar
 * @param {string}   [o.deleteConfirm]     texto de confirmación al borrar
 */
export function openForm({ title, fields, values = {}, validate, onSave, onDelete, deleteConfirm }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <form novalidate>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button>
      </header>
      <div class="sheet-body form-grid">
        ${fields.map(f => fieldHTML(f, values[f.name])).join('')}
      </div>
      <p class="form-error" role="alert" hidden></p>
      <footer class="sheet-foot">
        ${onDelete ? '<button type="button" class="btn-danger" data-delete>Borrar</button>' : ''}
        <span class="spacer"></span>
        <button type="button" data-close>Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </footer>
    </form>`;

  document.body.append(dlg);
  dlg.showModal();

  const form = dlg.querySelector('form');
  const errorEl = dlg.querySelector('.form-error');

  // "Atrás" de Android cierra la hoja, no la app.
  history.pushState({ sheet: true }, '');
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onBack);
    dlg.close();
    dlg.remove();
  };
  const onBack = () => cleanup();
  window.addEventListener('popstate', onBack);
  const close = () => {
    if (closed) return;
    cleanup();
    history.back();
  };

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });   // tecla Escape
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));

  const showError = (msg, field) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (field) form.elements[field]?.focus?.();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const v = {};
    for (const f of fields) {
      let val = String(data.get(f.name) ?? '').trim();
      if (f.upper) val = val.toUpperCase();
      v[f.name] = val;
    }
    const missing = fields.find(f => f.required && !v[f.name]);
    if (missing) return showError(`Rellena «${missing.label}».`, missing.name);
    const msg = validate?.(v);
    if (msg) return showError(msg);

    try {
      await onSave(v);
      close();
    } catch (err) {
      console.error(err);
      showError(err.message || 'No se pudo guardar.');
    }
  });

  dlg.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(deleteConfirm || '¿Borrar? No se puede deshacer.')) return;
    try {
      await onDelete();
      close();
    } catch (err) {
      console.error(err);
      showError(err.message || 'No se pudo borrar.');
    }
  });

  // Foco en el primer campo de texto vacío obligatorio, o en el primero.
  const first = fields.find(f => f.required && !values[f.name] && !['select', 'segmented'].includes(f.type));
  if (first) setTimeout(() => form.elements[first.name]?.focus(), 50);

  return close;
}

function fieldHTML(f, value) {
  const v = value ?? '';
  const id = `f-${f.name}`;
  const cls = `field${f.half ? ' half' : ''}`;
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const label = `<label for="${id}">${esc(f.label)}${req}</label>`;
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  const attrs = [
    `id="${id}"`, `name="${esc(f.name)}"`,
    f.required && 'required',
    f.lang && `lang="${esc(f.lang)}"`,
    f.placeholder && `placeholder="${esc(f.placeholder)}"`,
    f.upper && 'autocapitalize="characters"',
  ].filter(Boolean).join(' ');

  switch (f.type) {
    case 'textarea':
      return `<div class="${cls}">${label}<textarea ${attrs} rows="${f.rows ?? 3}">${esc(v)}</textarea>${hint}</div>`;
    case 'select':
      return `<div class="${cls}">${label}<select ${attrs}>
        ${f.options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>${hint}</div>`;
    case 'segmented':
      return `<fieldset class="${cls} seg-field"><legend>${esc(f.label)}</legend>
        <div class="segmented">
          ${f.options.map(o => `<label><input type="radio" name="${esc(f.name)}" value="${esc(o.value)}"${String(o.value) === String(v) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
        </div></fieldset>`;
    default:
      return `<div class="${cls}">${label}<input type="${esc(f.type ?? 'text')}" ${attrs} value="${esc(v)}">${hint}</div>`;
  }
}
