// Piezas de interfaz compartidas por Hoy y Viaje.
import { esc, jaWrapHTML } from './utils.js';
import { showFullscreen } from './showcard.js';
import { diffDays, fmtDateShort, fmtTime, deviceTime, fmtDuration, tzName, cityName } from './trip.js';

// ===== Enlaces =====

/** Solo deja pasar enlaces http(s); cualquier otra cosa (javascript:, etc.) se descarta. */
export const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : '');

export const mapsUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

// ===== Pantallas para enseñar =====

export function showTaxi(stay) {
  if (!stay?.addressJa) return;
  showFullscreen({
    note: 'この住所までお願いします。',
    text: stay.addressJa,
    sub: stay.nameJa || stay.name,
    sub2: 'A esta dirección, por favor · Kono jūsho made onegaishimasu.',
  });
}

export function showPlace(item) {
  if (!item?.placeJa) return;
  showFullscreen({
    note: 'ここに行きたいです。',
    text: item.placeJa,
    sub: item.place || item.title,
    sub2: 'Quiero ir aquí · Koko ni ikitai desu.',
  });
}

// ===== Vuelos =====

/** Estado de un vuelo en un momento dado: texto del chip y si está en el aire. */
export function flightStatus(f, at) {
  const dep = new Date(f.dep), arr = new Date(f.arr);
  if (dep <= at && at < arr) return { chip: `Llega en ${fmtDuration(arr - at)}`, air: true, past: false };
  if (at < dep) return { chip: `Sale en ${fmtDuration(dep - at)}`, air: false, past: false };
  return { chip: 'Completado', air: false, past: true };
}

/**
 * Tarjeta de vuelo.
 * @param {object} f      vuelo
 * @param {object} [o]    { title, chip, air, past, actions (HTML) }
 */
export function flightCard(f, { title = '', chip = '', air = false, past = false, actions = '' } = {}) {
  const dep = new Date(f.dep), arr = new Date(f.arr);
  const depDevice = deviceTime(f.dep);
  const localHint = !past && depDevice !== fmtTime(f.dep)
    ? `<p class="muted small">En la hora de tu móvil: sale a las ${esc(depDevice)}, llega a las ${esc(deviceTime(f.arr))}.</p>` : '';
  const extras = [
    f.terminal && `Terminal ${esc(f.terminal)}`,
    f.seat && `Asiento ${esc(f.seat)}`,
    f.bookingRef && `Reserva ${esc(f.bookingRef)}`,
  ].filter(Boolean);

  return `
    <section class="card flight-card${air ? ' is-air' : ''}${past ? ' is-past' : ''}">
      <div class="card-head">
        <h2 class="card-title">${esc(title || fmtDateShort(f.dep))}</h2>
        ${chip ? `<span class="chip">${esc(chip)}</span>` : ''}
      </div>
      <div class="flight-row">
        <div class="flight-end">
          <b class="iata">${esc(f.from.iata)}</b>
          <span class="small">${esc(cityName(f.from))}</span>
          <time class="ftime">${esc(fmtTime(f.dep))}</time>
          <span class="muted small">${esc(fmtDateShort(f.dep))}<br>hora de ${esc(tzName(f.from.tz))}</span>
        </div>
        <div class="flight-mid">
          <span class="flight-code">${esc(f.code)}</span>
          <span class="flight-line" aria-hidden="true"></span>
          <span class="muted small">${esc(fmtDuration(arr - dep))}</span>
        </div>
        <div class="flight-end end-right">
          <b class="iata">${esc(f.to.iata)}</b>
          <span class="small">${esc(cityName(f.to))}</span>
          <time class="ftime">${esc(fmtTime(f.arr))}${f.arrEstimated ? '<sup title="Estimada">*</sup>' : ''}</time>
          <span class="muted small">${esc(fmtDateShort(f.arr))}<br>hora de ${esc(tzName(f.to.tz))}</span>
        </div>
      </div>
      ${localHint}
      ${f.arrEstimated ? '<p class="muted small">* Hora de llegada estimada.</p>' : ''}
      ${extras.length ? `<p class="small">${extras.join(' · ')}</p>` : ''}
      ${f.notes && !f.arrEstimated ? `<p class="muted small">${esc(f.notes)}</p>` : ''}
      ${actions ? `<div class="btn-row">${actions}</div>` : ''}
    </section>`;
}

// ===== Seguro de viaje =====

/**
 * Tarjeta del seguro: compañía, póliza y botón para llamar a asistencia.
 * @param {object} ins  { company, product, policy, insurer, phone, start, end, travelers, notes }
 * @param {object} [o]  { compact (solo lo esencial), actions (HTML) }
 */
export function insuranceCard(ins, { compact = false, actions = '' } = {}) {
  const tel = String(ins.phone ?? '').replace(/[^\d+]/g, '');
  const dates = ins.start && ins.end ? `${fmtDateShort(ins.start)} → ${fmtDateShort(ins.end)}` : '';
  const meta = [dates, ins.travelers && `${ins.travelers} viajeros`].filter(Boolean);
  return `
    <section class="card insurance-card">
      <div class="card-head">
        <h2 class="card-title">Seguro de viaje</h2>
        ${ins.product ? `<span class="chip">${esc(ins.product)}</span>` : ''}
      </div>
      <p class="stay-name">${esc(ins.company || 'Seguro')}</p>
      ${ins.policy ? `<p class="small">Póliza <strong class="policy-number">${esc(ins.policy)}</strong></p>` : ''}
      ${!compact && ins.insurer ? `<p class="small muted">Aseguradora: ${esc(ins.insurer)}</p>` : ''}
      ${!compact && meta.length ? `<p class="small muted">${meta.map(esc).join(' · ')}</p>` : ''}
      ${!compact && ins.notes ? `<p class="small muted pre">${esc(ins.notes)}</p>` : ''}
      <div class="btn-row">
        ${tel ? `<a class="btn btn-primary" href="tel:${esc(tel)}">📞 Llamar a asistencia 24 h</a>` : ''}
        ${actions}
      </div>
      ${tel ? `<p class="muted small">${esc(ins.phone)} · desde Japón, marca el número completo con el prefijo.</p>` : ''}
    </section>`;
}

// ===== Alojamientos =====

/**
 * Tarjeta de alojamiento.
 * @param {object} s    alojamiento
 * @param {object} [o]  { title, showDates, actions (HTML) }
 */
export function stayCard(s, { title = '', showDates = false, actions = '' } = {}) {
  const nights = diffDays(s.checkIn, s.checkOut);
  const times = [
    s.checkInTime && `Entrada ${esc(s.checkInTime)}`,
    s.checkOutTime && `Salida ${esc(s.checkOutTime)}`,
  ].filter(Boolean).join(' · ');

  return `
    <section class="card stay-card">
      <div class="card-head">
        <h2 class="card-title">${esc(title || s.city)}${!title && s.cityJa ? ` <span class="jp muted" lang="ja">${esc(s.cityJa)}</span>` : ''}</h2>
        ${title && s.checkInTime ? `<span class="chip">Entrada ${esc(s.checkInTime)}</span>` : ''}
      </div>
      ${showDates ? `<p class="small muted">${esc(fmtDateShort(s.checkIn))} → ${esc(fmtDateShort(s.checkOut))} · ${nights} ${nights === 1 ? 'noche' : 'noches'}${times ? ` · ${times}` : ''}</p>` : ''}
      <p class="stay-name">${esc(s.name)}</p>
      ${s.nameJa ? `<p class="jp muted" lang="ja">${esc(s.nameJa)}</p>` : ''}
      ${s.addressJa
        ? `<p class="jp address-ja" lang="ja">${jaWrapHTML(s.addressJa)}</p>`
        : `<p class="todo-missing small">Falta la dirección en japonés.${actions ? ' Pulsa «Editar» para añadirla.' : ' Añádela en <a href="#viaje">Viaje</a>.'}</p>`}
      ${s.address ? `<p class="muted small">${esc(s.address)}</p>` : ''}
      ${s.station ? `<p class="small">Estación: <span class="jp" lang="ja">${esc(s.station)}</span></p>` : ''}
      ${s.phone ? `<p class="small">Teléfono: <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></p>` : ''}
      ${s.bookingRef ? `<p class="small">Reserva: ${esc(s.bookingRef)}</p>` : ''}
      ${s.notes ? `<p class="muted small">${esc(s.notes)}</p>` : ''}
      <div class="btn-row">
        ${s.addressJa ? `<button type="button" class="btn-primary" data-taxi="${esc(s.id)}">Enseñar al taxista</button>` : ''}
        ${s.addressJa || s.address ? `<a class="btn" href="${esc(mapsUrl(s.addressJa || s.address))}" target="_blank" rel="noopener">Abrir en Maps</a>` : ''}
        ${actions}
      </div>
    </section>`;
}
