// Arranque de la app: datos, navegación por pestañas y registro del service worker.
import { ensureSeeded, requestPersistence, DATA_EVENT, getAll, getSetting } from './db.js';

// ===== Diagnóstico (solo al probar en localhost con serve.py) =====
// Envía al ordenador un resumen del estado de la app en el móvil. En la versión
// publicada (otro dominio) no hace nada.
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const diagErrors = [];
if (IS_LOCAL) {
  window.addEventListener('error', e => diagErrors.push(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', e => diagErrors.push(`Promesa: ${e.reason?.message ?? e.reason}`));
}

async function sendDiagnostics(stage) {
  if (!IS_LOCAL) return;
  const report = { stage, errors: diagErrors.slice(0, 20) };
  try {
    report.version = (await window.caches?.keys())?.find(k => k.startsWith('japon-')) ?? null;
    report.swController = Boolean(navigator.serviceWorker?.controller);
    report.seedVersion = await getSetting('seedVersion', 0);
    const [f, s, i] = await Promise.all([getAll('flights'), getAll('stays'), getAll('items')]);
    Object.assign(report, { flights: f.length, stays: s.length, items: i.length });
  } catch (err) {
    report.errors.push(`Diagnóstico: ${err?.message ?? err}`);
  }
  report.view = document.getElementById('view')?.innerText.slice(0, 120) ?? '';
  fetch('/__diag', {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).catch(() => {});
}

const TABS = {
  hoy:      { title: 'Hoy',      load: () => import('./views/hoy.js') },
  frases:   { title: 'Frases',   load: () => import('./views/frases.js') },
  viaje:    { title: 'Viaje',    load: () => import('./views/viaje.js') },
  mapa:     { title: 'Mapa',     load: () => import('./views/proximamente.js').then(m => m.mapa) },
  traducir: { title: 'Traducir', load: () => import('./views/proximamente.js').then(m => m.traducir) },
};
const DEFAULT_TAB = 'hoy';

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');

let current = null;      // { name, view }
let navToken = 0;        // evita carreras si se cambia de pestaña muy rápido

async function show(name) {
  if (!TABS[name]) name = DEFAULT_TAB;
  const token = ++navToken;

  document.querySelectorAll('.tabbar a').forEach(a => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  titleEl.textContent = TABS[name].title;

  try {
    const mod = await TABS[name].load();
    if (token !== navToken) return;
    current?.view.unmount?.();
    viewEl.replaceChildren();
    window.scrollTo(0, 0);
    const view = mod.default ?? mod;
    await view.mount(viewEl);
    current = { name, view };
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = '<div class="card">No se pudo cargar esta pantalla.</div>';
  }
}

function route() {
  show(location.hash.slice(1) || DEFAULT_TAB);
}

// Cuando cambian los datos (importar, restaurar…), se vuelve a pintar la pantalla actual,
// salvo que la propia pantalla diga que se encarga ella (handlesDataChange).
let repaintTimer;
window.addEventListener(DATA_EVENT, () => {
  if (!current || current.view.handlesDataChange) return;
  clearTimeout(repaintTimer);
  repaintTimer = setTimeout(() => show(current.name), 50);
});

async function start() {
  try {
    await ensureSeeded();
  } catch (err) {
    console.error('No se pudieron cargar los datos iniciales', err);
    diagErrors.push(`ensureSeeded: ${err?.name} ${err?.message}`);
  }
  window.addEventListener('hashchange', route);
  route();
  requestPersistence();
  setTimeout(() => sendDiagnostics('arranque'), 1500);
}
start();

// Altura real de la cabecera, para que las barras fijas de cada pantalla queden justo debajo.
const topbar = document.querySelector('.topbar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
}).observe(topbar);

// Aviso "Sin conexión"
const badge = document.getElementById('offline-badge');
const updateOnline = () => { badge.hidden = navigator.onLine; };
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// Service worker
// Cuando se publica una versión nueva, el service worker nuevo toma el control y
// aparece un aviso "Actualizar" (así no hace falta cerrar y abrir la app dos veces).
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      // Comprueba siempre al arrancar: register() puede devolver un service worker
      // antiguo sin mirar si hay versión nueva.
      if (navigator.onLine) reg.update().catch(() => {});
      // Al volver a la app, mira si hay versión nueva.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      });
    } catch (err) {
      console.warn('SW no registrado:', err);
    }
  });
}

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const btn = document.createElement('button');
  btn.id = 'update-banner';
  btn.type = 'button';
  btn.className = 'update-banner';
  btn.textContent = 'Hay una versión nueva · Toca para actualizar';
  btn.addEventListener('click', () => location.reload());
  document.body.append(btn);
}
