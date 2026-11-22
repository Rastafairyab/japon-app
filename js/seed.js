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
//   items:   { id, date, time, type: 'plan'|'reserva'|'nota', title, place, placeJa, link, notes }
//
// Si algún día se añaden datos aquí, sube SEED_VERSION: los móviles que ya tengan la app
// recibirán los vuelos y alojamientos nuevos, salvo los que se hayan editado a mano.

export const SEED_VERSION = 1;

export const SEED = {
  flights: [],
  stays: [],
  items: [],
};
