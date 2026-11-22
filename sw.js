// Service worker: guarda la app en caché para usarla sin conexión.
// IMPORTANTE: cada vez que cambies cualquier archivo, sube el número de versión
// para que los móviles descarguen la nueva versión.
const VERSION = 'v13';
const CACHE = `japon-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/seed.js',
  './js/utils.js',
  './js/backup.js',
  './js/trip.js',
  './js/showcard.js',
  './js/components.js',
  './js/form.js',
  './js/phrases.js',
  './js/speech.js',
  './js/views/hoy.js',
  './js/views/frases.js',
  './js/views/viaje.js',
  './js/views/proximamente.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    // cache: 'reload' evita guardar copias viejas de la caché HTTP del navegador.
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('japon-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la caché; si no está, la red. Las navegaciones caen en index.html.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
