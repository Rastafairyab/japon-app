// Pantalla "Hoy": cuenta atrás antes del viaje; durante el viaje, el día, la ciudad,
// el alojamiento de esa noche, el próximo vuelo y los planes del día.
import {
  loadTrip, now, isSimulated, todayISO, phaseOf, describeDay, nextFlight, missingInfo,
  addDays, diffDays, fmtDate, fmtDateShort, fmtTime, tzName, cityName,
} from '../trip.js';
import { esc } from '../utils.js';
import { flightCard, flightStatus, stayCard, showTaxi, insuranceCard } from '../components.js';

const TYPE_LABEL = { plan: 'Plan', reserva: 'Reserva', nota: 'Nota' };

let timer = null;
let onVisible = null;

export default {
  async mount(el) {
    const trip = await loadTrip();
    const root = document.createElement('div');
    el.append(root);

    const render = () => { root.innerHTML = screen(trip, now()); };
    render();

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-taxi]');
      if (btn) showTaxi(trip.stays.find(s => s.id === btn.dataset.taxi));
    });

    // Se actualiza solo cada 30 s y al volver a la app.
    timer = setInterval(render, 30_000);
    onVisible = () => { if (document.visibilityState === 'visible') render(); };
    document.addEventListener('visibilitychange', onVisible);
  },

  unmount() {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  },
};

// ===== Pantallas según la fase =====

function screen(trip, at) {
  const date = todayISO();
  const banner = isSimulated()
    ? `<p class="sim-banner">Fecha simulada: ${esc(at.toLocaleString('es-ES'))}</p>` : '';
  switch (phaseOf(trip, date)) {
    case 'antes': return banner + before(trip, at);
    case 'durante': return banner + during(trip, at, date);
    case 'despues': return banner + after(trip);
    default: return `
      <section class="hero">
        <p class="jp hero-title" lang="ja">日本へようこそ</p>
        <p class="hero-sub">Aún no hay datos del viaje.</p>
      </section>
      <section class="card">
        <h2 class="card-title">Para empezar</h2>
        <ul class="todo-list">
          <li>Si tienes el archivo del viaje (.json): <a href="#viaje">Viaje</a> → Datos → <strong>Importar</strong>.</li>
          <li>O añade los vuelos y alojamientos a mano en <a href="#viaje">Viaje</a>.</li>
          <li>Las frases funcionan desde ya, en <a href="#frases">Frases</a>.</li>
        </ul>
      </section>`;
  }
}

function before(trip, at) {
  const first = trip.flights[0];
  const target = first ? new Date(first.dep) : new Date(`${trip.start}T00:00:00`);
  const ms = Math.max(0, target - at);
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  const missing = missingInfo(trip);

  return `
    <section class="hero">
      <p class="eyebrow">Cuenta atrás</p>
      <div class="countdown" role="timer" aria-label="Faltan ${d} días, ${h} horas y ${m} minutos">
        <div><b>${d}</b><span>${d === 1 ? 'día' : 'días'}</span></div>
        <div><b>${h}</b><span>${h === 1 ? 'hora' : 'horas'}</span></div>
        <div><b>${m}</b><span>min</span></div>
      </div>
      <p class="hero-sub">${first
        ? `para el ${esc(first.code)} · ${esc(fmtDate(first.dep))}, ${esc(fmtTime(first.dep))}`
        : `para el ${esc(fmtDate(trip.start))}`}</p>
      <p class="jp hero-ja" lang="ja">日本まであと${d}日</p>
    </section>

    ${first ? flightCard(first, { title: 'Próximo vuelo', ...flightStatus(first, at) }) : ''}

    <section class="card">
      <h2 class="card-title">El viaje</h2>
      <ul class="plain-list stays-summary">
        ${trip.stays.map(s => `
          <li>
            <span><strong>${esc(s.city)}</strong> <span class="jp muted" lang="ja">${esc(s.cityJa || '')}</span></span>
            <span class="muted small">${esc(fmtDateShort(s.checkIn))} → ${esc(fmtDateShort(s.checkOut))} · ${diffDays(s.checkIn, s.checkOut)} noches</span>
          </li>`).join('')}
      </ul>
    </section>

    ${trip.insurance ? insuranceCard(trip.insurance, { compact: true }) : ''}

    <section class="card">
      <h2 class="card-title">Antes de salir</h2>
      <ul class="todo-list">
        <li>Instalar la voz japonesa: Ajustes → Idioma → Salida de texto a voz → Google → Japonés.</li>
        <li>Exportar una copia en <a href="#viaje">Viaje</a> y pasársela a tu compañero de viaje.</li>
        ${missing.map(t => `<li class="todo-missing">Falta: ${esc(t)}</li>`).join('')}
      </ul>
    </section>`;
}

function during(trip, at, date) {
  const day = describeDay(trip, date);
  const nf = nextFlight(trip, at);
  const tomorrow = date < trip.end ? describeDay(trip, addDays(date, 1)) : null;
  // El vuelo va arriba si se está volando o sale en menos de 24 h; si no, al final.
  const flightSoon = nf && (nf.status === 'aire' || new Date(nf.flight.dep) - at < 864e5);
  const nfCard = nf
    ? flightCard(nf.flight, { title: nf.status === 'aire' ? 'En vuelo' : 'Próximo vuelo', ...flightStatus(nf.flight, at) })
    : '';

  const title = day.route
    ? `${esc(day.route.from)} <span class="arrow">→</span> ${esc(day.route.to)}`
    : esc(day.city ?? '');

  return `
    <section class="hero">
      <p class="eyebrow">Día ${day.dayNumber} de ${day.totalDays} · ${esc(fmtDate(date))}</p>
      <h2 class="hero-title">${title}</h2>
      ${day.cityJa ? `<p class="jp hero-ja" lang="ja">${esc(day.cityJa)}</p>` : ''}
    </section>

    ${flightSoon ? nfCard : ''}
    ${day.checkingOut ? checkoutCard(day.checkingOut) : ''}
    ${day.tonight ? stayCard(day.tonight, { title: 'Esta noche' }) : nightCard(day.night)}
    ${agendaCard(day)}
    ${tomorrow ? tomorrowLine(tomorrow) : ''}
    ${nf && !flightSoon ? nfCard : ''}
    ${trip.insurance ? insuranceCard(trip.insurance, { compact: true }) : ''}`;
}

function after(trip) {
  return `
    <section class="hero">
      <p class="jp hero-title" lang="ja">おかえりなさい</p>
      <p class="hero-sub">Okaerinasai: «bienvenidos a casa»</p>
      <p class="muted">${trip.totalDays} días · ${trip.stays.length} ciudades · ${trip.items.length} planes y notas</p>
    </section>
    <section class="card">
      <p>El viaje ha terminado. Exporta una copia en <a href="#viaje">Viaje</a> si quieres conservar los planes.</p>
    </section>`;
}

// ===== Tarjetas propias de Hoy =====

function checkoutCard(s) {
  return `
    <section class="card card-soft">
      <p class="small"><strong>Hoy dejáis ${esc(s.name)}</strong>${s.checkOutTime ? ` · salida antes de las ${esc(s.checkOutTime)}` : ''}</p>
    </section>`;
}

function nightCard(night) {
  if (!night) return '';
  const extra = night.kind === 'escala' && night.next
    ? `<p class="muted small">El ${esc(night.next.code)} sale a las ${esc(fmtTime(night.next.dep))} (${esc(fmtDateShort(night.next.dep))}, hora de ${esc(tzName(night.next.from.tz))}).</p>` : '';
  return `
    <section class="card">
      <h2 class="card-title">Esta noche</h2>
      <p>${esc(night.text)}</p>
      ${extra}
    </section>`;
}

function agendaCard(day) {
  const rows = [
    ...day.flights.map(f => ({
      time: fmtTime(f.dep), label: 'Vuelo',
      title: `${f.code} ${cityName(f.from)} → ${cityName(f.to)}`, notes: '',
    })),
    ...day.items.map(i => ({
      time: i.time || '', label: TYPE_LABEL[i.type] ?? 'Plan', title: i.title,
      notes: [i.place, i.notes].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  return `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Planes de hoy</h2>
        <a class="link-small" href="#viaje">Editar</a>
      </div>
      ${rows.length ? `<ul class="agenda">
        ${rows.map(r => `
          <li>
            <span class="agenda-time">${esc(r.time || '—')}</span>
            <span class="agenda-body">
              <span class="tag">${esc(r.label)}</span> ${esc(r.title)}
              ${r.notes ? `<span class="muted small agenda-notes">${esc(r.notes)}</span>` : ''}
            </span>
          </li>`).join('')}
      </ul>` : '<p class="muted small">No hay planes para hoy. Añádelos en <a href="#viaje">Viaje</a>.</p>'}
    </section>`;
}

function tomorrowLine(t) {
  const where = t.route ? `${t.route.from} → ${t.route.to}` : (t.city ?? '');
  const n = t.flights.length + t.items.length;
  return `<p class="muted small tomorrow">Mañana: <strong>${esc(where)}</strong>${n ? ` · ${n} ${n === 1 ? 'cosa' : 'cosas'} en la agenda` : ''}</p>`;
}
