// Pantalla "Moneda": tipo de cambio euro ⇄ yen y conversor en los dos sentidos.
import { getRate, fetchRate, setManualRate, parseAmount, formatJPY, formatEUR, STALE_MS } from '../currency.js';
import { esc, toast } from '../utils.js';

const QUICK_YEN = [100, 500, 1000, 5000, 10000];

let root = null;
let busy = false;

export default {
  mount(el) {
    root = document.createElement('div');
    el.append(root);
    render();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
    const r = getRate();
    if (navigator.onLine && Date.now() - r.ts > STALE_MS && r.source !== 'manual') refresh(true);
  },
  unmount() {
    window.removeEventListener('online', render);
    window.removeEventListener('offline', render);
    root = null;
  },
};

function render() {
  if (!root) return;
  const r = getRate();
  const yen = root.querySelector('#cv-jpy')?.value ?? '1.000';
  root.innerHTML = `
    ${navigator.onLine ? '' : '<p class="sim-banner">Sin conexión: se usa el último tipo de cambio guardado.</p>'}
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Tipo de cambio</h2>
        <button type="button" class="btn-small" data-act="refresh"${busy || !navigator.onLine ? ' disabled' : ''}>
          ${busy ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
      <p class="cv-rate">1 € = <strong>${formatJPY(r.rate)} ¥</strong></p>
      <p class="muted">1.000 ¥ = ${formatEUR(1000 / r.rate)} €</p>
      <p class="muted small">${esc(rateInfo(r))}</p>
    </section>
    <section class="card">
      <h2 class="card-title">Convertidor</h2>
      <div class="field">
        <label for="cv-jpy">Yenes (¥)</label>
        <input id="cv-jpy" class="cv-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(yen)}">
      </div>
      <div class="field">
        <label for="cv-eur">Euros (€)</label>
        <input id="cv-eur" class="cv-input" type="text" inputmode="decimal" autocomplete="off">
      </div>
      <div class="btn-row cv-quick">
        ${QUICK_YEN.map(n => `<button type="button" class="btn-small" data-act="quick" data-yen="${n}">${formatJPY(n)} ¥</button>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2 class="card-title">Tabla rápida</h2>
      <ul class="plain-list cv-table">
        ${[100, 500, 1000, 2000, 5000, 10000, 20000, 50000].map(n =>
          `<li><span>${formatJPY(n)} ¥</span><span>${formatEUR(n / r.rate)} €</span></li>`).join('')}
      </ul>
    </section>
    <details class="card">
      <summary class="card-title">Poner el tipo de cambio a mano</summary>
      <p class="muted small">Útil si en la casa de cambio te dan otro valor.</p>
      <div class="field">
        <label for="cv-manual">¥ por 1 €</label>
        <input id="cv-manual" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(formatJPY(r.rate))}">
      </div>
      <div class="btn-row"><button type="button" class="btn-primary" data-act="manual">Guardar</button></div>
    </details>`;
  convert('jpy');
}

function rateInfo(r) {
  if (!r.ts) return 'Valor aproximado: conéctate a internet y pulsa "Actualizar".';
  const when = new Date(r.ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${r.source === 'manual' ? 'Puesto a mano' : `Fuente: ${r.source}`} · ${when}`;
}

function convert(from) {
  const jpy = root.querySelector('#cv-jpy');
  const eur = root.querySelector('#cv-eur');
  const rate = getRate().rate;
  if (from === 'jpy') {
    const n = parseAmount(jpy.value);
    eur.value = Number.isFinite(n) ? formatEUR(n / rate) : '';
  } else {
    const n = parseAmount(eur.value);
    jpy.value = Number.isFinite(n) ? formatJPY(n * rate) : '';
  }
}

function onInput(e) {
  if (e.target.id === 'cv-jpy') convert('jpy');
  else if (e.target.id === 'cv-eur') convert('eur');
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  switch (btn.dataset.act) {
    case 'refresh': refresh(false); break;
    case 'quick':
      root.querySelector('#cv-jpy').value = formatJPY(Number(btn.dataset.yen));
      convert('jpy');
      break;
    case 'manual': {
      const n = parseAmount(root.querySelector('#cv-manual').value);
      try { setManualRate(n); toast('Tipo de cambio guardado'); render(); }
      catch (err) { toast(err.message, { error: true }); }
      break;
    }
  }
}

async function refresh(silent) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fetchRate();
    if (!silent) toast('Tipo de cambio actualizado');
  } catch (err) {
    if (!silent) toast(err.message, { error: true });
  } finally {
    busy = false;
    render();
  }
}
