// Utilidades de mapa: carga de Leaflet, búsqueda de coordenadas y distancias.

// Leaflet 1.9.4 desde cdnjs, con comprobación de integridad (SRI).
const LEAFLET = {
  js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  jsSri: 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==',
  css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  cssSri: 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==',
};

let leafletPromise = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      Object.assign(css, { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: 'anonymous' });
      document.head.append(css);
      const js = document.createElement('script');
      Object.assign(js, { src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: 'anonymous' });
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletPromise = null; js.remove(); reject(new Error('No se pudo cargar el mapa. ¿Hay conexión?')); };
      document.head.append(js);
    });
  }
  return leafletPromise;
}

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// ===== Coordenadas =====

/** Saca coordenadas de un enlace de Google Maps (si las lleva). */
export function coordsFromUrl(url) {
  const s = decodeURIComponent(String(url ?? ''));
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&](?:q|query|destination|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/** Quita el código postal y las indicaciones de calle de Kioto (西洞院通五条下る…). */
export function cleanJaAddress(address) {
  return String(address ?? '')
    .replace(/〒\s*\d{3}-?\d{4}\s*/g, '')
    .replace(/(区|市)[^区市\s]*?通[^区市\s]*?(上る|下る|上ル|下ル|東入る?|西入る?|東入ル|西入ル)/g, '$1')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Busca las coordenadas de una dirección o lugar de Japón.
 * 1) Buscador de direcciones del Instituto Geográfico de Japón (GSI): muy preciso con direcciones.
 * 2) OpenStreetMap (Nominatim) para nombres de sitios (大阪城, Fushimi Inari…).
 * El resultado siempre se enseña en el mapa para que el usuario lo confirme.
 * @returns {Promise<{lat:number,lng:number,label:string,source:string}|null>}
 */
export async function geocode(query) {
  if (!navigator.onLine) throw new Error('Sin conexión: hace falta internet para buscar el lugar.');
  let q = cleanJaAddress(query);
  for (let i = 0; i < 3 && q; i++) {
    const r = await fetchJson(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
    if (Array.isArray(r) && r.length) {
      const [lng, lat] = r[0].geometry.coordinates;
      return { lat, lng, label: r[0].properties.title, source: 'GSI' };
    }
    const shorter = q.replace(/[-－ー]?\d+(号|番地?)?$/, '');   // quita el último número y prueba otra vez
    if (shorter === q) break;
    q = shorter;
  }
  const n = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&accept-language=ja,es&q=${encodeURIComponent(query)}`);
  if (Array.isArray(n) && n.length) {
    return { lat: Number(n[0].lat), lng: Number(n[0].lon), label: n[0].display_name, source: 'OpenStreetMap' };
  }
  return null;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ===== Distancias y rutas =====

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

/** Enlace de "Cómo llegar" en Google Maps (abre la app si está instalada). */
export function directionsUrl(place) {
  const dest = place.lat != null ? `${place.lat},${place.lng}` : (place.addressJa || place.address || place.name);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=transit`;
}
