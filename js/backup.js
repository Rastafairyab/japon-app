// Tarjeta "Copia de seguridad": exportar, enviar, importar y restaurar.
import { exportAll, importAll, validateBackup, resetTripData } from './db.js';
import { downloadText, localISODate, toast } from './utils.js';

const LABELS = { flights: 'vuelos', stays: 'alojamientos', items: 'planes y notas', favorites: 'frases favoritas' };

function summary(counts) {
  return Object.entries(LABELS).map(([k, label]) => `${counts[k] ?? 0} ${label}`).join(', ');
}

async function buildFile() {
  const payload = await exportAll();
  const name = `japon-backup-${localISODate()}.json`;
  const text = JSON.stringify(payload, null, 2);
  return { name, text };
}

export function backupCard() {
  const card = document.createElement('section');
  card.className = 'card';
  const canShareFiles = typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });

  card.innerHTML = `
    <h2 class="card-title">Copia de seguridad</h2>
    <p class="muted small">Los datos se guardan solo en este móvil. Exporta una copia de vez en cuando
      y pásasela a tu compañero de viaje para que los dos tengáis lo mismo. Los documentos (PDF) no van en la copia: súbelos en cada móvil.</p>
    <div class="btn-row">
      <button type="button" class="btn-primary" data-act="export">Exportar</button>
      ${canShareFiles ? '<button type="button" data-act="share">Enviar…</button>' : ''}
      <button type="button" data-act="import">Importar</button>
    </div>
    <input type="file" accept="application/json,.json" hidden>
    <details class="danger-zone">
      <summary>Más opciones</summary>
      <p class="muted small">Borra los vuelos, alojamientos y planes de este móvil (por ejemplo,
        antes de importar otro viaje). Las frases favoritas se conservan.</p>
      <button type="button" class="btn-danger" data-act="reset">Borrar datos del viaje</button>
      <p class="muted small">Si la app se ha quedado en una versión antigua, esto descarga la última.
        No borra vuestros planes ni favoritas.</p>
      <button type="button" data-act="refresh-app">Reiniciar la app</button>
      <p class="muted small app-version">Versión: …</p>
    </details>`;

  const fileInput = card.querySelector('input[type=file]');

  // Versión instalada = nombre de la caché del service worker (japon-v8 → v8).
  window.caches?.keys().then(keys => {
    const v = keys.find(k => k.startsWith('japon-'))?.replace('japon-', '');
    card.querySelector('.app-version').textContent = `Versión: ${v ?? 'sin instalar'}`;
  }).catch(() => {});

  card.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    try {
      if (act === 'export') {
        const { name, text } = await buildFile();
        downloadText(name, text);
        toast(`Copia guardada en Descargas: ${name}`);
      } else if (act === 'share') {
        const { name, text } = await buildFile();
        const file = new File([text], name, { type: 'application/json' });
        await navigator.share({ files: [file], title: 'Copia del viaje a Japón' });
      } else if (act === 'import') {
        fileInput.value = '';
        fileInput.click();
      } else if (act === 'reset') {
        if (!confirm('¿Borrar los datos del viaje?\n\nSe borrarán los vuelos, alojamientos, planes y notas de este móvil. Exporta antes una copia si la quieres conservar. No se puede deshacer.')) return;
        await resetTripData();
        toast('Datos del viaje borrados');
      } else if (act === 'refresh-app') {
        if (!navigator.onLine) throw new Error('Hace falta conexión para descargar la app de nuevo.');
        // Borra solo la caché de archivos de la app; la base de datos (planes, favoritas) no se toca.
        const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
        await Promise.all(regs.map(r => r.unregister()));
        await Promise.all((await caches.keys()).map(k => caches.delete(k)));
        location.reload();
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;   // el usuario cerró el menú de compartir
      console.error(err);
      toast(err.message || 'Algo ha fallado', { error: true });
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      let payload;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error('El archivo no es un JSON válido.');
      }
      const counts = validateBackup(payload);
      const fecha = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('es-ES') : 'fecha desconocida';
      if (!confirm(`¿Importar esta copia (${fecha})?\n\nContiene: ${summary(counts)}.\n\nSustituirá TODOS los datos de este móvil.`)) return;
      await importAll(payload);
      toast('Copia importada');
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo importar', { error: true });
    }
  });

  return card;
}
