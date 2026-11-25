// Tipo de cambio euro ⇄ yen: se descarga de internet y se guarda en el móvil
// para poder convertir sin conexión.
const KEY = 'moneda.tasa';
const FALLBACK = { rate: 170, ts: 0, source: 'aproximado' };   // ¥ por 1 €
const SOURCES = [
  { name: 'BCE (frankfurter.app)', url: 'https://api.frankfurter.app/latest?from=EUR&to=JPY' },
  { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/EUR' },
];
export const STALE_MS = 12 * 60 * 60 * 1000;

export function getRate() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r && r.rate > 0) return r;
  } catch { /* sin almacenamiento */ }
  return FALLBACK;
}

function saveRate(r) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
  return r;
}

export async function fetchRate() {
  for (const s of SOURCES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(s.url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) continue;
      const rate = Number((await res.json())?.rates?.JPY);
      if (rate > 0) return saveRate({ rate, ts: Date.now(), source: s.name });
    } catch { /* probamos la siguiente fuente */ } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('No se pudo descargar el tipo de cambio');
}

export function setManualRate(rate) {
  if (!(rate > 0)) throw new Error('Tipo de cambio no válido');
  return saveRate({ rate, ts: Date.now(), source: 'manual' });
}

// Acepta "1.234,5", "1234.5", "1 234" …
export function parseAmount(str) {
  let s = String(str ?? '').replace(/[\s¥€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

const fmtJPY = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true });
const fmtEUR = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
export const formatJPY = n => fmtJPY.format(Math.round(n));
export const formatEUR = n => fmtEUR.format(n);
