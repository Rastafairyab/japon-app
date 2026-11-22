// Voz en japonés con la síntesis de voz del móvil (speechSynthesis).
// En Android usa la voz de Google; para que funcione sin conexión hay que descargar
// el paquete de japonés: Ajustes → Idioma → Salida de texto a voz → Google → Japonés.

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const RATES = { normal: 0.9, lento: 0.6 };

let jaVoice = null;
let voicesLoaded = false;

function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;
  voicesLoaded = true;
  jaVoice =
    voices.find(v => v.lang === 'ja-JP' && /google/i.test(v.name)) ??
    voices.find(v => v.lang === 'ja-JP') ??
    voices.find(v => v.lang?.toLowerCase().startsWith('ja')) ??
    null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

export const speechSupported = () => Boolean(synth);

/**
 * true: hay voz japonesa · false: hay voces pero ninguna japonesa · null: aún no se sabe
 * (en Android la lista de voces a veces llega vacía; aun así suele hablar en japonés).
 */
export function hasJapaneseVoice() {
  if (!synth) return false;
  if (!voicesLoaded) pickVoice();
  if (!voicesLoaded) return null;
  return Boolean(jaVoice);
}

export function getRate() {
  try { return localStorage.getItem('speech.rate') === 'lento' ? 'lento' : 'normal'; } catch { return 'normal'; }
}
export function setRate(value) {
  try { localStorage.setItem('speech.rate', value); } catch { /* sin almacenamiento local */ }
}

/** Lee un texto en japonés. Devuelve una promesa que se resuelve al terminar. */
export function speak(text, { rate = getRate() } = {}) {
  if (!synth) return Promise.reject(new Error('Este navegador no puede leer en voz alta.'));
  const clean = String(text).replace(/○+/g, '、');   // salta los huecos de nombre
  synth.cancel();
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = RATES[rate] ?? RATES.normal;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled'
      ? resolve()
      : reject(new Error('No se pudo reproducir la voz.')));
    synth.speak(u);
  });
}

export function stopSpeaking() {
  synth?.cancel();
}
