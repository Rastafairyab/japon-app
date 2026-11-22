// Pantalla "Mapa": hoteles y planes en un mapa (OpenStreetMap + Leaflet), con
// "Cómo llegar", "Enseñar dirección" y tu ubicación. La lista funciona sin conexión.
import { loadTrip, fmtDateShort } from '../trip.js';
import { put, DATA_EVENT } from '../db.js';
import { esc, toast, jaWrapHTML } from '../utils.js';
import { showTaxi, showPlace } from '../components.js';
import {
  loadLeaflet, TILE_URL, TILE_ATTRIBUTION, geocode, coordsFromUrl, distanceKm, fmtDistance, directionsUrl,
} from '../geo.js';

const JAPAN = { center: [35.2, 136.5], zoom: 6 };

let trip = null;
let root = null;
let L = null;
let map = null;
let markers = null;        // capa con las chinchetas
let me = null;             // { lat, lng } posición del usuario
let meLayer = null;
let placing = null;        // { place, marker } mientras se confirma una posición
let onData = null;
let dataTimer = null;

export default {
  handlesDataChange: true,

  async mount(el) {
    trip = await loadTrip();
    root = document.createElement('div');
    root.className = 'map-screen';
    root.innerHTML = `
      <div class="map-wrap">
        <div id="map" class="map" role="region" aria-label="Mapa de hoteles y planes"></div>
        <p class="map-status muted small" hidden></p>
        <button type="button" class="map-me round-btn" data-act="me" aria-label="Mi ubicación">${ME_ICON}</button>
      </div>
      <section id="map-confirm" class="card map-confirm" hidden></section>
      <div id="map-list"></div>`;
    el.append(root);

    root.addEventListener('click', onClick);
    renderList();
    initMap();

    onData = () => {
      clearTimeout(dataTimer);
      dataTimer = setTimeout(async () => { trip = await loadTrip(); drawMarkers(); renderList(); }, 50);
    };
    window.addEventListener(DATA_EVENT, onData);
  },

  unmount() {
    window.removeEventListener(DATA_EVENT, onData);
    clearTimeout(dataTimer);
    map?.remove();
    map = markers = meLayer = null;
    placing = null;
    root = null;
  },
};

// ===== Lugares =====

function places() {
  const list = [];
  for (const s of trip.stays) {
    list.push({
      key: `stays:${s.id}`, kind: 'hotel', store: 'stays', rec: s,
      name: s.name,
      sub: `${s.city} · ${fmtDateShort(s.checkIn)} → ${fmtDateShort(s.checkOut)}`,
      addressJa: s.addressJa, address: s.address,
      lat: s.lat ?? null, lng: s.lng ?? null,
      query: s.addressJa || s.address || s.name,
    });
  }
  for (const i of trip.items) {
    if (!i.place && !i.placeJa && !i.link) continue;
    const fromLink = i.lat == null ? coordsFromUrl(i.link) : null;
    list.push({
      key: `items:${i.id}`, kind: 'plan', store: 'items', rec: i,
      name: i.title,
      sub: [fmtDateShort(i.date) + (i.time ? ` ${i.time}` : ''), i.place].filter(Boolean).join(' · '),
      addressJa: i.placeJa, address: i.place,
      lat: i.lat ?? fromLink?.lat ?? null, lng: i.lng ?? fromLink?.lng ?? null,
      query: i.placeJa || i.place || i.title,
    });
  }
  return list;
}

const byKey = (key) => places().find(p => p.key === key);
const located = (p) => p.lat != null && p.lng != null;

// ===== Mapa =====

async function initMap() {
  const myRoot = root;   // si la pantalla se vuelve a montar mientras carga, esta carga se descarta
  const status = myRoot.querySelector('.map-status');
  try {
    L = await loadLeaflet();
  } catch (err) {
    status.hidden = false;
    status.textContent = `${err.message} La lista de abajo y las direcciones funcionan igual.`;
    myRoot.querySelector('.map-me').hidden = true;
    return;
  }
  if (root !== myRoot || map) return;
  map = L.map(myRoot.querySelector('#map'), { zoomControl: true, attributionControl: true });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, crossOrigin: true }).addTo(map);
  markers = L.layerGroup().addTo(map);

  // Los botones de las ventanitas: Leaflet no deja que el clic llegue a la página.
  map.on('popupopen', (e) => {
    const el = e.popup.getElement();
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', onClick);
    }
  });
  map.on('click', (e) => {
    if (placing) movePlacing(e.latlng);
  });

  if (!navigator.onLine) {
    status.hidden = false;
    status.textContent = 'Sin conexión: solo se ven las zonas del mapa que ya hayas abierto antes.';
  }
  drawMarkers(true);
  setTimeout(() => map?.invalidateSize(), 100);
}

function pinIcon(kind) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin pin-${kind}">${kind === 'hotel' ? '🏨' : '📍'}</span>`,
    iconSize: [36, 36], iconAnchor: [18, 34], popupAnchor: [0, -30],
  });
}

function drawMarkers(fit = false) {
  if (!map) return;
  markers.clearLayers();
  const pts = [];
  for (const p of places().filter(located)) {
    L.marker([p.lat, p.lng], { icon: pinIcon(p.kind), title: p.name })
      .bindPopup(popupHTML(p), { maxWidth: 280 })
      .addTo(markers);
    pts.push([p.lat, p.lng]);
  }
  if (fit) {
    if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 15);
    else map.setView(JAPAN.center, JAPAN.zoom);
  }
}

function popupHTML(p) {
  return `
    <div class="popup" data-key="${esc(p.key)}">
      <strong>${esc(p.name)}</strong>
      <div class="popup-sub">${esc(p.sub)}</div>
      ${p.addressJa ? `<div class="popup-ja" lang="ja">${jaWrapHTML(p.addressJa)}</div>` : ''}
      <div class="popup-actions">
        ${p.addressJa ? '<button type="button" data-act="show">Enseñar</button>' : ''}
        <a href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Cómo llegar</a>
        <button type="button" data-act="fix">Corregir posición</button>
      </div>
    </div>`;
}

// ===== Lista =====

function renderList() {
  const box = root?.querySelector('#map-list');
  if (!box) return;
  const all = places();
  if (!all.length) {
    box.innerHTML = `<section class="card"><h2 class="card-title">Aún no hay lugares</h2>
      <p class="muted small">Los hoteles de <a href="#viaje">Viaje</a> y los planes con lugar o enlace de Google Maps aparecerán aquí.</p></section>`;
    return;
  }
  const hotels = all.filter(p => p.kind === 'hotel');
  const plans = all.filter(p => p.kind === 'plan');
  box.innerHTML = [
    group('Hoteles', hotels),
    group('Planes', plans),
  ].join('') + `<p class="muted small map-note">«Situar» busca la dirección y te pide confirmarla antes de guardarla.
    Las zonas que abras con conexión se guardan para verlas luego sin internet.</p>`;
}

function group(title, list) {
  if (!list.length) return '';
  return `
    <section class="card">
      <h2 class="card-title">${title}</h2>
      <ul class="place-list">${list.map(placeRow).join('')}</ul>
    </section>`;
}

function placeRow(p) {
  const dist = me && located(p) ? `<span class="chip">${fmtDistance(distanceKm(me, p))}</span>` : '';
  return `
    <li class="place-row" data-key="${esc(p.key)}">
      <div class="place-main">
        <span class="place-name">${p.kind === 'hotel' ? '🏨' : '📍'} ${esc(p.name)} ${dist}</span>
        <span class="muted small">${esc(p.sub)}</span>
      </div>
      <div class="item-actions">
        ${located(p) ? '<button type="button" class="btn-mini" data-act="focus">Ver</button>'
                     : '<button type="button" class="btn-mini btn-mini-accent" data-act="locate">Situar</button>'}
        <a class="btn-mini" href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Cómo llegar</a>
        ${p.addressJa ? '<button type="button" class="btn-mini" data-act="show">Enseñar</button>' : ''}
      </div>
    </li>`;
}

// ===== Acciones =====

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const key = btn.closest('[data-key]')?.dataset.key;
  const p = key ? byKey(key) : null;

  switch (btn.dataset.act) {
    case 'me': locateMe(); break;
    case 'show':
      if (p?.kind === 'hotel') showTaxi(p.rec);
      else if (p) showPlace({ placeJa: p.addressJa, place: p.address, title: p.name });
      break;
    case 'focus':
      if (p && map) focusPlace(p);
      break;
    case 'locate':
      if (p) startPlacing(p, true);
      break;
    case 'fix':
      if (p) { map?.closePopup(); startPlacing(p, false); }
      break;
    case 'confirm-save': savePlacing(); break;
    case 'confirm-cancel': stopPlacing(); break;
  }
}

function focusPlace(p) {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16));
  markers.eachLayer(m => {
    const ll = m.getLatLng();
    if (ll.lat === p.lat && ll.lng === p.lng) m.openPopup();
  });
}

function locateMe() {
  if (!navigator.geolocation) return toast('Este móvil no da la ubicación al navegador.', { error: true });
  toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition((pos) => {
    me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (map) {
      meLayer?.remove();
      meLayer = L.layerGroup([
        L.circle([me.lat, me.lng], { radius: pos.coords.accuracy, color: '#4ea8ff', weight: 1, fillOpacity: 0.12 }),
        L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#4ea8ff', fillOpacity: 1 }),
      ]).addTo(map);
      map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15));
    }
    renderList();
  }, (err) => {
    toast(err.code === 1 ? 'Permite la ubicación para esta app (candado de la barra de direcciones).' : 'No se pudo obtener tu ubicación.', { error: true });
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

// --- Situar o corregir un lugar (siempre con confirmación) ---

async function startPlacing(p, search) {
  if (!map) return toast('El mapa no está disponible ahora mismo.', { error: true });
  stopPlacing();
  let start = located(p) ? { lat: p.lat, lng: p.lng } : null;
  let msg = 'Arrastra la chincheta o toca el mapa donde esté.';
  if (search) {
    toast('Buscando el lugar…');
    try {
      const r = await geocode(p.query);
      if (r) { start = r; msg = `He encontrado: ${r.label}. ¿Es aquí? Si no, toca el mapa donde esté.`; }
      else msg = 'No lo he encontrado. Toca el mapa donde esté.';
    } catch (err) {
      return toast(err.message, { error: true });
    }
  }
  const at = start ? [start.lat, start.lng] : map.getCenter();
  const marker = L.marker(at, { icon: pinIcon('new'), draggable: true, autoPan: true }).addTo(map);
  placing = { place: p, marker };
  map.setView(at, start ? 16 : map.getZoom());
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const box = root.querySelector('#map-confirm');
  box.hidden = false;
  box.innerHTML = `
    <p><strong>${esc(p.name)}</strong></p>
    <p class="muted small">${esc(msg)}</p>
    <div class="btn-row">
      <button type="button" class="btn-primary" data-act="confirm-save">Sí, guardar aquí</button>
      <button type="button" data-act="confirm-cancel">Cancelar</button>
    </div>`;
}

function movePlacing(latlng) {
  placing?.marker.setLatLng(latlng);
}

async function savePlacing() {
  if (!placing) return;
  const { place, marker } = placing;
  const { lat, lng } = marker.getLatLng();
  const rec = { ...place.rec, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  if (place.store === 'stays') rec.edited = true;
  stopPlacing();
  try {
    await put(place.store, rec);
    toast('Posición guardada');
  } catch (err) {
    toast(err.message || 'No se pudo guardar', { error: true });
  }
}

function stopPlacing() {
  placing?.marker.remove();
  placing = null;
  const box = root?.querySelector('#map-confirm');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

const ME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>';
