// Pantalla "Viaje": itinerario día a día editable, vuelos, alojamientos y copia de seguridad.
import {
  loadTrip, now, todayISO, phaseOf, describeDay, addDays, fmtDateShort, fmtTime, cityName,
} from '../trip.js';
import { put, remove, setSetting, DATA_EVENT } from '../db.js';
import { esc, uid, toast } from '../utils.js';
import { backupCard } from '../backup.js';
import { docsCard } from '../docs.js';
import { coordsFromUrl } from '../geo.js';
import { openForm } from '../form.js';
import {
  flightCard, flightStatus, stayCard, showTaxi, showPlace, safeUrl, mapsUrl, insuranceCard,
} from '../components.js';

const SUBTABS = [
  ['itinerario', 'Itinerario'],
  ['vuelos', 'Vuelos'],
  ['alojamientos', 'Hoteles'],
  ['seguro', 'Seguro'],
  ['docs', 'Docs'],
  ['datos', 'Datos'],
];
const TYPES = [
  { value: 'plan', label: 'Plan' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'nota', label: 'Nota' },
  { value: 'tren', label: 'Tren' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.value, t.label]));

// Zonas horarias usadas en el viaje (horario de invierno).
const ZONES = [
  { value: 'espana', label: 'España (UTC+1)', tz: 'Europe/Madrid', off: '+01:00' },
  { value: 'estambul', label: 'Estambul (UTC+3)', tz: 'Europe/Istanbul', off: '+03:00' },
  { value: 'japon', label: 'Japón (UTC+9)', tz: 'Asia/Tokyo', off: '+09:00' },
];
const zoneByValue = (v) => ZONES.find(z => z.value === v) ?? ZONES[2];
const zoneOfIso = (iso) => (ZONES.find(z => iso?.endsWith(z.off)) ?? ZONES[2]).value;

// Estado que se conserva al cambiar de pestaña.
const savedSub = readPref('viaje.sub', 'itinerario');
const state = {
  sub: SUBTABS.some(([k]) => k === savedSub) ? savedSub : 'itinerario',
  open: null,            // Set de fechas desplegadas en el itinerario
};

let trip = null;
let root = null;
let onData = null;
let dataTimer = null;

export default {
  handlesDataChange: true,   // se repinta ella misma sin perder qué días están abiertos

  async mount(el) {
    trip = await loadTrip();
    if (!state.open) {
      const today = todayISO();
      state.open = new Set([phaseOf(trip, today) === 'durante' ? today : trip.start]);
    }

    root = document.createElement('div');
    el.append(root);
    render();
    if (state.sub === 'itinerario') {
      root.querySelector('.day.is-today')?.scrollIntoView({ block: 'start' });
    }

    root.addEventListener('click', onClick);
    // <details> avisa con "toggle" (no burbujea): se escucha en captura.
    root.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d.matches?.('details.day')) return;
      if (d.open) state.open.add(d.dataset.date); else state.open.delete(d.dataset.date);
    }, true);

    onData = () => {
      clearTimeout(dataTimer);
      dataTimer = setTimeout(async () => { trip = await loadTrip(); render(); }, 30);
    };
    window.addEventListener(DATA_EVENT, onData);
  },

  unmount() {
    window.removeEventListener(DATA_EVENT, onData);
    clearTimeout(dataTimer);
    root = null;
  },
};

// ===== Pintado =====

function render() {
  if (!root) return;
  const tabs = `
    <div class="segmented subtabs" role="tablist" aria-label="Secciones de Viaje">
      ${SUBTABS.map(([key, label]) => `
        <button type="button" role="tab" data-act="sub" data-sub="${key}" aria-selected="${state.sub === key}">${label}</button>`).join('')}
    </div>`;

  root.innerHTML = tabs + '<div class="subview"></div>';
  const view = root.querySelector('.subview');

  switch (state.sub) {
    case 'vuelos': view.innerHTML = flightsHTML(); break;
    case 'alojamientos': view.innerHTML = staysHTML(); break;
    case 'seguro': view.innerHTML = insuranceHTML(); break;
    case 'docs': view.append(docsCard()); break;
    case 'datos': view.append(backupCard()); break;
    default: view.innerHTML = itineraryHTML();
  }
}

// --- Itinerario ---

function itineraryHTML() {
  if (!trip.start) {
    return `<section class="card">
      <h2 class="card-title">Aún no hay viaje</h2>
      <p class="muted small">Importa el archivo del viaje en <strong>Datos → Importar</strong>, o añade
        vuelos y alojamientos en sus pestañas. El itinerario día a día aparecerá solo.</p>
      <div class="btn-row"><button type="button" class="btn-primary" data-act="sub" data-sub="datos">Ir a Datos</button></div>
    </section>`;
  }
  const today = todayISO();
  const days = [];
  for (let d = trip.start; d <= trip.end; d = addDays(d, 1)) days.push(d);

  const outside = trip.items.filter(i => i.date < trip.start || i.date > trip.end);

  return `
    <p class="muted small intro">Toca un día para verlo. Con <strong>＋ Añadir</strong> guardas planes, reservas o notas.</p>
    ${days.map(d => dayHTML(d, d === today)).join('')}
    ${outside.length ? `
      <section class="card">
        <h2 class="card-title">Fuera de las fechas del viaje</h2>
        <ul class="agenda">${outside.map(i => itemRow(i, true)).join('')}</ul>
      </section>` : ''}`;
}

function dayHTML(date, isToday) {
  const day = describeDay(trip, date);
  const place = day.route ? `${day.route.from} → ${day.route.to}` : (day.city ?? '');

  const rows = [
    ...trip.stays.filter(s => s.checkOut === date).map(s => ({
      key: s.checkOutTime || '00', html: stayEventRow(s, 'Salida', s.checkOutTime),
    })),
    ...day.flights.map(f => ({ key: fmtTime(f.dep), html: flightRow(f) })),
    ...trip.stays.filter(s => s.checkIn === date).map(s => ({
      key: s.checkInTime || '98', html: stayEventRow(s, 'Entrada', s.checkInTime),
    })),
    ...day.items.map(i => ({ key: i.time || '99', html: itemRow(i) })),
  ].sort((a, b) => a.key.localeCompare(b.key));

  const count = day.items.length;

  return `
    <details class="day${isToday ? ' is-today' : ''}" data-date="${date}"${state.open.has(date) ? ' open' : ''}>
      <summary>
        <span class="day-head">
          <span class="day-date">${esc(capitalize(fmtDateShort(date)))}${isToday ? ' <span class="chip">Hoy</span>' : ''}</span>
          <span class="day-place">${esc(place)}</span>
        </span>
        <span class="day-meta">Día ${day.dayNumber}${count ? ` · ${count}` : ''}</span>
      </summary>
      <div class="day-body">
        ${rows.length ? `<ul class="agenda">${rows.map(r => r.html).join('')}</ul>` : '<p class="muted small">Nada previsto todavía.</p>'}
        <button type="button" class="btn-add" data-act="add-item" data-date="${date}">＋ Añadir</button>
      </div>
    </details>`;
}

function flightRow(f) {
  return `
    <li>
      <span class="agenda-time">${esc(fmtTime(f.dep))}</span>
      <span class="agenda-body">
        <span class="tag tag-flight">Vuelo</span> ${esc(f.code)} ${esc(cityName(f.from))} → ${esc(cityName(f.to))}
        <span class="muted small agenda-notes">Llega ${esc(fmtTime(f.arr))} (${esc(fmtDateShort(f.arr))})</span>
      </span>
    </li>`;
}

function stayEventRow(s, label, time) {
  return `
    <li>
      <span class="agenda-time">${esc(time || '—')}</span>
      <span class="agenda-body">
        <span class="tag tag-stay">${label}</span> ${esc(s.name)}
        ${label === 'Entrada' && s.addressJa ? `<span class="item-actions"><button type="button" class="btn-mini" data-taxi="${esc(s.id)}">Enseñar dirección</button></span>` : ''}
      </span>
    </li>`;
}

function itemRow(i, showDate = false) {
  const link = safeUrl(i.link);
  const actions = [
    i.placeJa && `<button type="button" class="btn-mini" data-act="show-place" data-id="${esc(i.id)}">Enseñar</button>`,
    (i.placeJa || i.place) && `<a class="btn-mini" href="${esc(mapsUrl(i.placeJa || i.place))}" target="_blank" rel="noopener">Maps</a>`,
    link && `<a class="btn-mini" href="${esc(link)}" target="_blank" rel="noopener">Enlace</a>`,
  ].filter(Boolean);

  return `
    <li class="item-row">
      <span class="agenda-time">${showDate ? esc(fmtDateShort(i.date)) : esc(i.time || '—')}</span>
      <span class="agenda-body">
        <span class="tag tag-${esc(i.type)}">${esc(TYPE_LABEL[i.type] ?? 'Plan')}</span> ${esc(i.title)}
        ${i.place ? `<span class="small agenda-notes">${esc(i.place)}</span>` : ''}
        ${i.placeJa ? `<span class="small agenda-notes jp" lang="ja">${esc(i.placeJa)}</span>` : ''}
        ${i.notes ? `<span class="muted small agenda-notes pre">${esc(i.notes)}</span>` : ''}
        ${actions.length ? `<span class="item-actions">${actions.join('')}</span>` : ''}
      </span>
      <button type="button" class="icon-btn" data-act="edit-item" data-id="${esc(i.id)}" aria-label="Editar «${esc(i.title)}»">✎</button>
    </li>`;
}

// --- Vuelos ---

function flightsHTML() {
  const at = now();
  return `
    ${trip.flights.map(f => {
      const st = flightStatus(f, at);
      return flightCard(f, {
        ...st,
        chip: st.past ? 'Completado' : st.chip,
        actions: `<button type="button" data-act="edit-flight" data-id="${esc(f.id)}">Editar</button>`,
      });
    }).join('') || '<p class="muted">No hay vuelos.</p>'}
    <button type="button" class="btn-add" data-act="add-flight">＋ Añadir vuelo</button>`;
}

// --- Alojamientos ---

function staysHTML() {
  return `
    ${trip.stays.map(s => stayCard(s, {
      showDates: true,
      actions: `<button type="button" data-act="edit-stay" data-id="${esc(s.id)}">Editar</button>`,
    })).join('') || '<p class="muted">No hay alojamientos.</p>'}
    <button type="button" class="btn-add" data-act="add-stay">＋ Añadir alojamiento</button>`;
}

// ===== Acciones =====

function onClick(e) {
  const taxi = e.target.closest('[data-taxi]');
  if (taxi) return showTaxi(trip.stays.find(s => s.id === taxi.dataset.taxi));

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id, date, sub } = btn.dataset;

  switch (act) {
    case 'sub':
      state.sub = sub;
      writePref('viaje.sub', sub);
      render();
      window.scrollTo(0, 0);
      break;
    case 'add-item': editItem(null, date); break;
    case 'edit-item': editItem(trip.items.find(i => i.id === id)); break;
    case 'show-place': showPlace(trip.items.find(i => i.id === id)); break;
    case 'add-flight': editFlight(null); break;
    case 'edit-flight': editFlight(trip.flights.find(f => f.id === id)); break;
    case 'add-stay': editStay(null); break;
    case 'edit-stay': editStay(trip.stays.find(s => s.id === id)); break;
    case 'edit-insurance': editInsurance(trip.insurance); break;
  }
}

function tripDayOptions(extraDate) {
  const opts = [];
  if (trip.start) {
    let n = 1;
    for (let d = trip.start; d <= trip.end; d = addDays(d, 1), n++) {
      opts.push({ value: d, label: `${fmtDateShort(d)} · Día ${n}` });
    }
  }
  if (extraDate && !opts.some(o => o.value === extraDate)) {
    opts.unshift({ value: extraDate, label: fmtDateShort(extraDate) });
  }
  return opts;
}

function editItem(item, date) {
  const isNew = !item;
  openForm({
    title: isNew ? 'Añadir al itinerario' : 'Editar',
    values: item ?? { type: 'plan', date: date ?? trip.start },
    fields: [
      { name: 'type', label: 'Tipo', type: 'segmented', options: TYPES },
      { name: 'title', label: 'Título', required: true, placeholder: 'Ej.: Castillo de Osaka' },
      { name: 'date', label: 'Día', type: 'select', options: tripDayOptions(item?.date), half: true },
      { name: 'time', label: 'Hora', type: 'time', half: true },
      { name: 'place', label: 'Lugar', placeholder: 'Ej.: Osaka-jō' },
      { name: 'placeJa', label: 'Nombre o dirección en japonés', lang: 'ja', placeholder: '大阪城',
        hint: 'Para enseñarlo a pantalla completa (taxi, personal…).' },
      { name: 'link', label: 'Enlace', type: 'url', placeholder: 'https://…', hint: 'Reserva, web o Google Maps.' },
      { name: 'notes', label: 'Notas', type: 'textarea', placeholder: 'Precio, código de reserva, qué llevar…' },
    ],
    validate: (v) => (v.link && !safeUrl(v.link) ? 'El enlace debe empezar por https://' : null),
    onSave: async (v) => {
      const rec = { ...(item ?? {}), ...v, id: item?.id ?? uid(), updatedAt: new Date().toISOString() };
      // Posición en el mapa: del enlace de Google Maps si la trae; si cambia el lugar, se olvida la anterior.
      const fromLink = coordsFromUrl(v.link);
      if (fromLink) Object.assign(rec, fromLink);
      else if (item && (item.place !== v.place || item.placeJa !== v.placeJa || item.link !== v.link)) {
        delete rec.lat; delete rec.lng;
      }
      await put('items', rec);
      state.open.add(v.date);
      toast(isNew ? 'Añadido' : 'Guardado');
    },
    onDelete: isNew ? null : async () => {
      await remove('items', item.id);
      toast('Borrado');
    },
    deleteConfirm: `¿Borrar «${item?.title ?? ''}»? No se puede deshacer.`,
  });
}

function editFlight(f) {
  const isNew = !f;
  const values = f ? {
    code: f.code,
    fromIata: f.from.iata, fromCity: f.from.city,
    depDate: f.dep.slice(0, 10), depTime: f.dep.slice(11, 16), depZone: zoneOfIso(f.dep),
    toIata: f.to.iata, toCity: f.to.city,
    arrDate: f.arr.slice(0, 10), arrTime: f.arr.slice(11, 16), arrZone: zoneOfIso(f.arr),
    terminal: f.terminal, seat: f.seat, bookingRef: f.bookingRef, notes: f.notes,
  } : { depZone: 'japon', arrZone: 'japon' };

  const toIso = (date, time, zone) => `${date}T${time}:00${zoneByValue(zone).off}`;

  openForm({
    title: isNew ? 'Añadir vuelo' : `Editar ${f.code}`,
    values,
    fields: [
      { name: 'code', label: 'Número de vuelo', required: true, upper: true, placeholder: 'JL0123' },
      { name: 'fromIata', label: 'Sale de (código)', required: true, upper: true, half: true, placeholder: 'IST' },
      { name: 'fromCity', label: 'Ciudad', required: true, half: true, placeholder: 'Estambul' },
      { name: 'depDate', label: 'Fecha de salida', type: 'date', required: true, half: true },
      { name: 'depTime', label: 'Hora (local)', type: 'time', required: true, half: true },
      { name: 'depZone', label: 'Zona horaria de salida', type: 'select', options: ZONES },
      { name: 'toIata', label: 'Llega a (código)', required: true, upper: true, half: true, placeholder: 'KIX' },
      { name: 'toCity', label: 'Ciudad', required: true, half: true, placeholder: 'Osaka (Kansai)' },
      { name: 'arrDate', label: 'Fecha de llegada', type: 'date', required: true, half: true },
      { name: 'arrTime', label: 'Hora (local)', type: 'time', required: true, half: true },
      { name: 'arrZone', label: 'Zona horaria de llegada', type: 'select', options: ZONES },
      { name: 'terminal', label: 'Terminal', half: true },
      { name: 'seat', label: 'Asiento', half: true, upper: true },
      { name: 'bookingRef', label: 'Código de reserva', upper: true },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
    validate: (v) => {
      const dep = new Date(toIso(v.depDate, v.depTime, v.depZone));
      const arr = new Date(toIso(v.arrDate, v.arrTime, v.arrZone));
      if (Number.isNaN(dep.getTime()) || Number.isNaN(arr.getTime())) return 'Revisa las fechas y horas.';
      if (arr <= dep) return 'La llegada debe ser posterior a la salida (revisa las zonas horarias).';
      return null;
    },
    onSave: async (v) => {
      const dz = zoneByValue(v.depZone), az = zoneByValue(v.arrZone);
      const arr = toIso(v.arrDate, v.arrTime, v.arrZone);
      await put('flights', {
        airline: '', ...(f ?? {}),
        id: f?.id ?? uid(),
        code: v.code.replace(/\s+/g, ''),
        from: { iata: v.fromIata, city: v.fromCity, tz: dz.tz },
        to: { iata: v.toIata, city: v.toCity, tz: az.tz },
        dep: toIso(v.depDate, v.depTime, v.depZone),
        arr,
        arrEstimated: Boolean(f?.arrEstimated && f.arr === arr),
        terminal: v.terminal, seat: v.seat, bookingRef: v.bookingRef, notes: v.notes,
        edited: true,
      });
      toast(isNew ? 'Vuelo añadido' : 'Vuelo guardado');
    },
    onDelete: isNew ? null : async () => {
      await remove('flights', f.id);
      toast('Vuelo borrado');
    },
    deleteConfirm: `¿Borrar el vuelo ${f?.code ?? ''}? No se puede deshacer.`,
  });
}

// --- Seguro ---

function insuranceHTML() {
  if (!trip.insurance) {
    return `<section class="card">
      <h2 class="card-title">Seguro de viaje</h2>
      <p class="muted small">Guarda aquí la póliza y el teléfono de asistencia para tenerlos a mano.
        Se incluye en la copia de seguridad.</p>
      <div class="btn-row"><button type="button" class="btn-primary" data-act="edit-insurance">＋ Añadir seguro</button></div>
    </section>`;
  }
  return insuranceCard(trip.insurance, {
    actions: '<button type="button" data-act="edit-insurance">Editar</button>',
  });
}

function editInsurance(ins) {
  const isNew = !ins;
  openForm({
    title: isNew ? 'Añadir seguro' : 'Editar seguro',
    values: ins ?? {},
    fields: [
      { name: 'company', label: 'Compañía', required: true, half: true, placeholder: 'Heymondo' },
      { name: 'product', label: 'Producto', half: true, placeholder: 'Viaje top' },
      { name: 'policy', label: 'Número de póliza', required: true },
      { name: 'phone', label: 'Teléfono de asistencia 24 h', type: 'tel', required: true, placeholder: '+34 …' },
      { name: 'insurer', label: 'Aseguradora', placeholder: 'Quien da la cobertura' },
      { name: 'start', label: 'Desde', type: 'date', half: true },
      { name: 'end', label: 'Hasta', type: 'date', half: true },
      { name: 'travelers', label: 'Viajeros', half: true, placeholder: '2' },
      { name: 'notes', label: 'Notas', type: 'textarea', placeholder: 'Coberturas, app, médico online…' },
    ],
    validate: (v) => (v.start && v.end && v.end < v.start ? 'La fecha final debe ser posterior a la inicial.' : null),
    onSave: async (v) => {
      await setSetting('insurance', v);
      toast(isNew ? 'Seguro añadido' : 'Seguro guardado');
    },
    onDelete: isNew ? null : async () => {
      await remove('settings', 'insurance');
      toast('Seguro borrado');
    },
    deleteConfirm: '¿Borrar los datos del seguro? No se puede deshacer.',
  });
}

function editStay(s) {
  const isNew = !s;
  openForm({
    title: isNew ? 'Añadir alojamiento' : `Editar ${s.city}`,
    values: s ?? {},
    fields: [
      { name: 'city', label: 'Ciudad', required: true, half: true, placeholder: 'Tokio' },
      { name: 'cityJa', label: 'Ciudad en japonés', lang: 'ja', half: true, placeholder: '東京' },
      { name: 'name', label: 'Nombre', required: true },
      { name: 'nameJa', label: 'Nombre en japonés', lang: 'ja' },
      { name: 'checkIn', label: 'Llegada', type: 'date', required: true, half: true },
      { name: 'checkOut', label: 'Salida', type: 'date', required: true, half: true },
      { name: 'checkInTime', label: 'Hora de entrada', type: 'time', half: true },
      { name: 'checkOutTime', label: 'Hora de salida', type: 'time', half: true },
      { name: 'addressJa', label: 'Dirección en japonés', type: 'textarea', rows: 2, lang: 'ja',
        placeholder: '〒000-0000 東京都…', hint: 'Es lo que verá el taxista. Cópiala de la reserva.' },
      { name: 'address', label: 'Dirección en alfabeto latino', type: 'textarea', rows: 2 },
      { name: 'station', label: 'Estación más cercana', placeholder: '東京駅 (Tokyo)' },
      { name: 'phone', label: 'Teléfono', type: 'tel', half: true },
      { name: 'bookingRef', label: 'Código de reserva', half: true },
      { name: 'notes', label: 'Notas', type: 'textarea', placeholder: 'Código de la puerta, instrucciones…' },
    ],
    validate: (v) => (v.checkOut <= v.checkIn ? 'La salida debe ser posterior a la llegada.' : null),
    onSave: async (v) => {
      const rec = { ...(s ?? {}), ...v, id: s?.id ?? uid(), edited: true };
      // Si cambia la dirección, la posición guardada en el mapa ya no vale.
      if (s && (s.addressJa !== v.addressJa || s.address !== v.address)) { delete rec.lat; delete rec.lng; }
      await put('stays', rec);
      toast(isNew ? 'Alojamiento añadido' : 'Alojamiento guardado');
    },
    onDelete: isNew ? null : async () => {
      await remove('stays', s.id);
      toast('Alojamiento borrado');
    },
    deleteConfirm: `¿Borrar «${s?.name ?? ''}»? No se puede deshacer.`,
  });
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ===== Preferencias de esta pantalla (solo comodidad; si fallan, no pasa nada) =====

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento local */ }
}
