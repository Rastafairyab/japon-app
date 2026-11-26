// Tarjeta "Documentos": PDF e imágenes guardados solo en este móvil (IndexedDB).
// No se suben a ningún sitio ni van en la copia de seguridad.
import { listDocs, addDoc, getDoc, deleteDoc, requestPersistence } from './db.js';
import { esc, toast } from './utils.js';

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openViewer(doc) {
  const url = URL.createObjectURL(doc.blob);
  const isPdf = doc.type === 'application/pdf';
  const overlay = document.createElement('div');
  overlay.className = 'doc-viewer';
  overlay.innerHTML = `
    <div class="doc-viewer-bar">
      <span class="doc-viewer-name">${esc(doc.name)}</span>
      <a href="${url}" target="_blank" rel="noopener">Abrir fuera</a>
      <button type="button" class="doc-viewer-close" aria-label="Cerrar">✕</button>
    </div>
    ${isPdf ? `<iframe src="${url}" title="${esc(doc.name)}"></iframe>` : `<img src="${url}" alt="${esc(doc.name)}">`}`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    URL.revokeObjectURL(url);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.querySelector('.doc-viewer-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
}

export function docsCard() {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">Documentos</h2>
    <p class="muted small">Billetes, reservas… (PDF o imagen). Se guardan solo en este móvil,
      no se suben a internet y no van en la copia de seguridad.</p>
    <button type="button" class="btn-primary" data-act="upload">＋ Subir documento</button>
    <input type="file" accept="application/pdf,image/*" multiple hidden>
    <ul class="doc-list"></ul>`;

  const list = card.querySelector('.doc-list');
  const fileInput = card.querySelector('input[type=file]');

  async function render() {
    const docs = await listDocs();
    list.innerHTML = docs.length
      ? docs.map(d => `
        <li class="doc-row" data-id="${esc(d.id)}">
          <div class="doc-info">
            <span class="doc-name">${esc(d.name)}</span>
            <span class="muted small">${fmtSize(d.size)}</span>
          </div>
          <button type="button" data-act="open">Abrir</button>
          <button type="button" class="btn-danger" data-act="del">Borrar</button>
        </li>`).join('')
      : '<li class="muted small">Aún no hay documentos.</li>';
  }

  card.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const id = e.target.closest('.doc-row')?.dataset.id;
    try {
      if (act === 'upload') {
        fileInput.value = '';
        fileInput.click();
      } else if (act === 'open') {
        const doc = await getDoc(id);
        if (doc) openViewer(doc);
      } else if (act === 'del') {
        const doc = await getDoc(id);
        if (!doc || !confirm(`¿Borrar «${doc.name}» de este móvil?`)) return;
        await deleteDoc(id);
        toast('Documento borrado');
        render();
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Algo ha fallado', { error: true });
    }
  });

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])];
    if (!files.length) return;
    try {
      for (const f of files) await addDoc(f);
      requestPersistence();
      toast(files.length === 1 ? 'Documento guardado' : `${files.length} documentos guardados`);
      render();
    } catch (err) {
      console.error(err);
      toast('No se pudo guardar (¿falta espacio?)', { error: true });
    }
  });

  render();
  return card;
}
