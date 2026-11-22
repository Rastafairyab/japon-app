// Lógica del viaje: qué día es, dónde dormimos, cuál es el próximo vuelo.
// Las fechas de calendario son cadenas 'AAAA-MM-DD'. Las horas de vuelo llevan su zona
// (p. ej. '2026-01-10T02:25:00+03:00'), así que la hora local del lugar es el propio texto.
import { getAll } from './db.js';
import { localISODate } from './utils.js';

// ===== Momento actual =====
// Para probar otras fechas: añade ?ahora=2026-01-12T09:00 a la dirección.
export function now() {
  const p = new URLSearchParams(location.search).get('ahora');
  if (p) {
    const d = new Date(p);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export const isSimulated = () => new URLSearchParams(location.search).has('ahora');

// ===== Fechas =====
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** 'lunes, 21 de diciembre' */
export const fmtDate = (iso) => dateFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
/** 'lun, 21 dic' */
export const fmtDateShort = (iso) => shortFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
/** Hora local del lugar, '02:25' */
export const fmtTime = (isoWithZone) => isoWithZone.slice(11, 16);

/** Hora de ese instante en el reloj del móvil, '00:25' */
export const deviceTime = (isoWithZone) =>
  new Date(isoWithZone).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** '3 h 20 min', '2 d 4 h', '12 min' */
export function fmtDuration(ms) {
  const min = Math.max(0, Math.round(ms / 6e4));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

const TZ_NAMES = { 'Asia/Tokyo': 'Japón', 'Europe/Istanbul': 'Estambul', 'Europe/Madrid': 'España' };
export const tzName = (tz) => TZ_NAMES[tz] ?? tz;

/** 'Osaka (Kansai)' → 'Osaka' */
export const cityName = (airport) => (airport?.city ?? '').replace(/\s*\(.*\)\s*$/, '');

// ===== Datos =====
export async function loadTrip() {
  const [flights, stays, items] = await Promise.all([getAll('flights'), getAll('stays'), getAll('items')]);
  flights.sort((a, b) => new Date(a.dep) - new Date(b.dep));
  stays.sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const firstDates = [flights[0]?.dep.slice(0, 10), stays[0]?.checkIn].filter(Boolean).sort();
  const lastDates = [flights.at(-1)?.arr.slice(0, 10), stays.at(-1)?.checkOut].filter(Boolean).sort();
  const start = firstDates[0] ?? null;
  const end = lastDates.at(-1) ?? null;
  const totalDays = start && end ? diffDays(start, end) + 1 : 0;
  const home = flights[0]?.from ?? null;

  return { flights, stays, items, start, end, totalDays, home };
}

/** 'antes' | 'durante' | 'despues' | 'vacio' */
export function phaseOf(trip, date) {
  if (!trip.start) return 'vacio';
  if (date < trip.start) return 'antes';
  if (date > trip.end) return 'despues';
  return 'durante';
}

export const todayISO = () => localISODate(now());

/** Todo lo que hace falta para pintar un día del viaje. */
export function describeDay(trip, date) {
  const tonight = trip.stays.find(s => s.checkIn <= date && date < s.checkOut) ?? null;
  const lastNight = trip.stays.find(s => s.checkIn < date && date <= s.checkOut) ?? null;
  const flights = trip.flights.filter(f => f.dep.slice(0, 10) === date);

  let from = null, to = null;
  if (lastNight && tonight && lastNight.id !== tonight.id) {
    from = lastNight.city; to = tonight.city;
  } else if (tonight && !lastNight && flights.length) {
    from = cityName(flights[0].from); to = tonight.city;
  } else if (!tonight && lastNight && flights.length) {
    from = lastNight.city; to = cityName(flights.at(-1).to);
  } else if (!tonight && !lastNight && flights.length) {
    from = cityName(flights[0].from); to = cityName(flights.at(-1).to);
  }
  const route = from && to && from !== to ? { from, to } : null;

  // Dónde se pasa la noche si no hay alojamiento
  let night = null;
  if (!tonight && flights.length) {
    const last = flights.at(-1);
    const next = trip.flights.find(f => new Date(f.dep) >= new Date(last.arr));
    if (trip.home && last.to.iata === trip.home.iata) {
      night = { kind: 'casa', text: 'Noche en casa' };
    } else if (next) {
      night = { kind: 'escala', text: `Noche de escala en ${cityName(last.to)}`, next };
    } else {
      night = { kind: 'vuelo', text: `Noche en ${cityName(last.to)}` };
    }
  }

  const items = trip.items
    .filter(i => i.date === date)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  return {
    date,
    dayNumber: trip.start ? diffDays(trip.start, date) + 1 : 0,
    totalDays: trip.totalDays,
    tonight, lastNight, flights, route, night, items,
    city: tonight?.city ?? route?.to ?? lastNight?.city ?? null,
    cityJa: route ? null : tonight?.cityJa ?? null,
    checkingOut: lastNight && lastNight.id !== tonight?.id ? lastNight : null,
  };
}

/** Vuelo en el aire o siguiente vuelo: { status: 'aire'|'siguiente', flight } o null */
export function nextFlight(trip, at) {
  const t = at.getTime();
  const inAir = trip.flights.find(f => new Date(f.dep).getTime() <= t && t < new Date(f.arr).getTime());
  if (inAir) return { status: 'aire', flight: inAir };
  const next = trip.flights.find(f => new Date(f.dep).getTime() > t);
  return next ? { status: 'siguiente', flight: next } : null;
}

/** Datos que faltan por rellenar, para recordarlos. */
export function missingInfo(trip) {
  const out = [];
  for (const s of trip.stays) {
    if (!s.addressJa) out.push(`Dirección en japonés: ${s.name}`);
  }
  for (const s of trip.stays) {
    if (!s.checkInTime) out.push(`Hora de entrada en ${s.city}`);
  }
  for (const f of trip.flights) {
    if (f.arrEstimated) out.push(`Hora de llegada del ${f.code} (ahora es estimada)`);
  }
  return out;
}
