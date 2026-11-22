// Utilidades comunes.

// Escapa texto para meterlo en HTML sin riesgos.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ===== Cortes de línea en japonés =====
// El japonés no lleva espacios y el navegador puede partir una palabra por la mitad
// (お願いし / ます). Agrupamos las palabras en bloques que se leen juntos
// (お会計を | お願いします) y cada bloque va en un <span> que no se parte.
const JA_PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や', 'から', 'まで', 'より', 'など']);
const JA_PRENOUN = new Set(['この', 'その', 'あの', 'どの']);
const JA_PREFIX = new Set(['お', 'ご']);
const HIRA_ONLY = /^[぀-ゟ]+$/;
const JA_PUNCT = /^[、。，．！？!?・「」『』（）()〜～…：:]+$/;
const DIGITISH = /^[0-9０-９\-－ー○]+$/;
const KANJI = /[㐀-䶿一-鿿]/;
const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

export function jaWrapHTML(text) {
  if (!segmenter) return esc(text);
  const groups = [];
  let current = null;
  let prev = null;
  for (const { segment: s } of segmenter.segment(String(text ?? ''))) {
    if (/^\s+$/.test(s)) { groups.push(' '); current = null; prev = null; continue; }
    let join = false;
    if (current && prev) {
      if (JA_PUNCT.test(s)) join = true;                                   // ？、。 van con lo anterior
      else if (JA_PREFIX.has(prev) || JA_PRENOUN.has(prev)) join = true;   // お会計, この電車
      else if (DIGITISH.test(s) && /[0-9０-９〒\-－ー○]$/.test(prev)) join = true;   // 〒600-8322, ○○
      else if (JA_PARTICLES.has(prev) || JA_PUNCT.test(prev)) join = false;      // tras partícula, bloque nuevo
      else if (HIRA_ONLY.test(s)) join = !JA_PREFIX.has(s);                // ます, か, を… se pegan
      else if (s.length === 1 && KANJI.test(s) && KANJI.test(prev.at(-1))) join = true; // 京都+府
    }
    if (join) current.push(s);
    else { current = [s]; groups.push(current); }
    prev = s;
  }
  return groups.map(g => (g === ' ' ? ' ' : `<span class="nb">${esc(g.join(''))}</span>`)).join('');
}

export function uid() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Fecha local del móvil en formato AAAA-MM-DD.
export function localISODate(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// Aviso breve en la parte inferior.
let toastTimer;
export function toast(message, { error = false, ms = 2800 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle('toast-error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Descarga un archivo de texto en el móvil (va a la carpeta Descargas).
export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
