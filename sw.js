// Service worker: guarda la app en caché para usarla sin conexión.
// IMPORTANTE: cada vez que cambies cualquier archivo, sube el número de versión
// para que los móviles descarguen la nueva versión.
const VERSION = 'v17';
const CACHE = `japon-${VERSION}`;

// Cachés que sobreviven a las versiones de la app:
const TILES = 'tiles-osm';     // trozos de mapa que se han visto (para verlos sin conexión)
const LIBS = 'lib-cdn';        // Leaflet (librería del mapa)
const MAX_TILES = 400;

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
  './js/translate.js',
  './js/geo.js',
  './js/currency.js',
  './js/views/hoy.js',
  './js/views/frases.js',
  './js/views/viaje.js',
  './js/views/mapa.js',
  './js/views/traducir.js',
  './js/views/moneda.js',
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

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Trozos de mapa de OpenStreetMap: red primero (para tenerlos al día) y, sin conexión, los guardados.
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(networkThenCache(req, TILES, true));
    return;
  }
  // Leaflet: no cambia (versión fija), así que caché primero.
  if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/leaflet/')) {
    event.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;   // el resto (traducción, direcciones…) va directo a internet

  // Archivos de la app: primero la caché; si no está, la red. Las navegaciones caen en index.html.
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

async function networkThenCache(req, cacheName, trim) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      if (trim) trimCache(cache);
    }
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

// Mantiene como mucho MAX_TILES trozos, borrando los más antiguos.
async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_TILES).map(k => cache.delete(k)));
}
