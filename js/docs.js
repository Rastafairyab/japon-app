// Tarjeta "Documentos": PDF e imágenes guardados solo en este móvil (IndexedDB).
// No se suben a ningún sitio ni van en la copia de seguridad.
import { listDocs, addDoc, getDoc, deleteDoc, requestPersistence } from './db.js';
import { esc, toast } from './utils.js';

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// PDF.js (visor de PDF dentro de la app). Se carga solo la primera vez y el
// service worker lo guarda para usarlo sin conexión.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsPromise = null; s.remove(); reject(new Error('No se pudo cargar el visor de PDF')); };
      document.head.append(s);
    });
  }
  return pdfjsPromise;
}

// Pinta todas las páginas del PDF como imágenes (canvas) dentro de `box`.
async function renderPdf(doc, box, isClosed) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await doc.blob.arrayBuffer()) }).promise;
  const width = Math.min(box.clientWidth || window.innerWidth, 1200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  box.innerHTML = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    if (isClosed()) break;
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    // Resolución extra (×2) para que se lea bien al ampliar (QR, letra pequeña).
    const viewport = page.getViewport({ scale: (width / base.width) * dpr * 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.setAttribute('aria-label', `Página ${n} de ${pdf.numPages}`);
    box.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  pdf.destroy();
}

function openViewer(doc) {
  const url = URL.createObjectURL(doc.blob);
  const isPdf = doc.type === 'application/pdf';
  const overlay = document.createElement('div');
  overlay.className = 'doc-viewer';
  overlay.innerHTML = `
    <div class="doc-viewer-bar">
      <span class="doc-viewer-name">${esc(doc.name)}</span>
      <button type="button" data-zoom="-1" aria-label="Alejar">−</button>
      <button type="button" data-zoom="1" aria-label="Ampliar">＋</button>
      <button type="button" class="doc-viewer-close" aria-label="Cerrar">✕</button>
    </div>
    <div class="doc-pages">${isPdf
      ? '<p class="doc-pages-msg">Cargando…</p>'
      : `<img src="${url}" alt="${esc(doc.name)}">`}</div>`;

  const pages = overlay.querySelector('.doc-pages');
  let zoom = 1;
  let closed = false;
  const applyZoom = () => pages.style.setProperty('--zoom', `${zoom * 100}%`);

  const close = () => {
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    URL.revokeObjectURL(url);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.querySelector('.doc-viewer-close').addEventListener('click', close);
  overlay.querySelector('.doc-viewer-bar').addEventListener('click', (e) => {
    const step = Number(e.target.closest('[data-zoom]')?.dataset.zoom);
    if (!step) return;
    zoom = Math.min(4, Math.max(1, zoom + step * 0.5));
    applyZoom();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  applyZoom();

  if (isPdf) {
    renderPdf(doc, pages, () => closed).catch(err => {
      console.error(err);
      if (closed) return;
      pages.innerHTML = `<p class="doc-pages-msg">No se pudo mostrar el PDF${navigator.onLine ? '' : ' (la primera vez hace falta conexión para cargar el visor)'}.
        <br><a href="${url}" target="_blank" rel="noopener">Abrir con otra app</a></p>`;
    });
  }
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
