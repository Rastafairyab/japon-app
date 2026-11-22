// Traducción (MyMemory), dictado por voz y búsqueda en las frases guardadas.
import { PHRASES } from './phrases.js';

// ===== Traducción en línea =====
// MyMemory: gratuito, sin cuenta y con un límite diario (de sobra para un viaje).
// El texto se envía a su servidor, así que no conviene escribir datos personales.
const API = 'https://api.mymemory.translated.net/get';
export const MAX_CHARS = 500;

export async function translate(text, from, to) {
  const q = String(text ?? '').trim();
  if (!q) return '';
  if (q.length > MAX_CHARS) throw new Error(`Como máximo ${MAX_CHARS} caracteres por traducción.`);
  if (!navigator.onLine) throw new Error('Sin conexión: la traducción necesita internet. Mira abajo las frases guardadas.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${API}?q=${encodeURIComponent(q)}&langpair=${from}|${to}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`El servicio de traducción ha fallado (${res.status}).`);
    const data = await res.json();
    if (data.quotaFinished) throw new Error('Se ha agotado la traducción gratuita de hoy. Usa Google Traductor.');
    const out = data.responseData?.translatedText;
    if (!out || Number(data.responseStatus) !== 200) throw new Error(data.responseDetails || 'No se pudo traducir.');
    return decodeEntities(out);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('La traducción tarda demasiado. Revisa la conexión.');
    if (err instanceof TypeError) throw new Error('No se pudo conectar con el traductor. Revisa la conexión.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// MyMemory a veces devuelve entidades HTML (&#39;, &quot;…).
function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

export const googleTranslateUrl = (text, from, to) =>
  `https://translate.google.com/?sl=${from}&tl=${to}&text=${encodeURIComponent(text ?? '')}&op=translate`;

// ===== Frases guardadas parecidas (funciona sin conexión) =====
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[¿?¡!.,;:、。？！「」]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'por', 'para', 'con', 'en', 'es',
  'me', 'mi', 'se', 'lo', 'al', 'y', 'o', 'a', 'favor', 'esto', 'este', 'esta']);
const INDEX = PHRASES.map(p => ({ p, es: norm(`${p.es} ${p.romaji}`), ja: p.ja.replace(/[、。？！\s]/g, '') }));

/** Hasta n frases guardadas que se parecen al texto. dir: 'es' o 'ja' (idioma del texto). */
export function similarPhrases(text, dir, n = 3) {
  const q = String(text ?? '').trim();
  if (q.length < 2) return [];
  let scored;
  if (dir === 'ja') {
    const s = q.replace(/[、。？！\s]/g, '');
    const grams = new Set([...Array(Math.max(0, s.length - 1)).keys()].map(i => s.slice(i, i + 2)));
    if (!grams.size) return [];
    scored = INDEX.map(({ p, ja }) => {
      let hit = 0;
      grams.forEach(g => { if (ja.includes(g)) hit++; });
      return { p, score: hit / grams.size };
    });
  } else {
    const words = norm(q).split(' ').filter(w => w.length > 1 && !STOP.has(w));
    if (!words.length) return [];
    scored = INDEX.map(({ p, es }) => {
      const hit = words.filter(w => es.includes(w)).length;
      return { p, score: hit / words.length };
    });
  }
  return scored.filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.p);
}

// ===== Dictado por voz =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => Boolean(SR);

const SR_ERRORS = {
  'not-allowed': 'Permite el micrófono para esta app (candado de la barra de direcciones → Permisos).',
  'service-not-allowed': 'El dictado no está disponible en este navegador.',
  'no-speech': 'No te he oído. Prueba otra vez, más cerca del micrófono.',
  'audio-capture': 'No se encuentra el micrófono.',
  network: 'El dictado necesita internet.',
};

/**
 * Escucha una frase. lang: 'es-ES' o 'ja-JP'.
 * @returns {{ result: Promise<string>, stop: () => void }}
 */
export function listen(lang) {
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const result = new Promise((resolve, reject) => {
    let text = '';
    rec.onresult = (e) => { text = e.results[0]?.[0]?.transcript ?? ''; };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      reject(new Error(SR_ERRORS[e.error] ?? 'No se pudo usar el dictado.'));
    };
    rec.onend = () => resolve(text);
  });
  rec.start();
  return { result, stop: () => rec.stop() };
}
