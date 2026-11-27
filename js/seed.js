// Datos iniciales de la app.
//
// La versión publicada empieza vacía: los vuelos, alojamientos y planes de cada viaje
// se añaden en la pestaña Viaje o se cargan con Viaje → Datos → Importar (archivo JSON).
// Así el código público no contiene datos personales.
//
// Formato (el mismo que el de la copia de seguridad):
//   flights: { id, code, airline, from: { iata, city, tz }, to: { iata, city, tz },
//              dep: '2026-01-01T10:00:00+09:00', arr: '…', arrEstimated, terminal, seat,
//              bookingRef, notes, edited }
//   stays:   { id, city, cityJa, name, nameJa, checkIn: '2026-01-01', checkOut: '2026-01-03',
//              checkInTime, checkOutTime, addressJa, address, station, phone, bookingRef,
//              notes, edited }
//   items:   { id, date, time, type: 'plan'|'reserva'|'nota'|'tren', title, place, placeJa, link, notes }
//
// Si algún día se añaden datos aquí, sube SEED_VERSION: los móviles que ya tengan la app
// recibirán los vuelos y alojamientos nuevos, salvo los que se hayan editado a mano.

export const SEED_VERSION = 1;

// Tren del 25 de diciembre (datos del billete; el PDF va en Documentos, solo en el móvil).
export const TREN_2512 = {
  id: 'tren-2512-kioto-tokio', date: '2026-12-25', time: '11:30', type: 'tren',
  title: 'Shinkansen Nozomi 126 Kioto → Tokio', place: 'Estación de Tokio', placeJa: '東京駅',
  link: '', notes: 'Salida 11:30 de Kioto · Llegada 13:45 a Tokio · Billetes en Documentos',
};

export const SEED = {
  flights: [],
  stays: [],
  items: [TREN_2512],
};
