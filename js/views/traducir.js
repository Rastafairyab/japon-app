// Pantalla "Traducir": español ⇄ japonés con texto o voz, frases guardadas parecidas
// (sin conexión), "enseñar" a pantalla completa y atajo a Google Traductor.
import { translate, similarPhrases, listen, canListen, googleTranslateUrl, MAX_CHARS } from '../translate.js';
import { speak, stopSpeaking } from '../speech.js';
import { showFullscreen } from '../showcard.js';
import { esc, toast, jaWrapHTML } from '../utils.js';

const DIRS = {
  'es-ja': { from: 'es', to: 'ja', fromLabel: 'Español', toLabel: '日本語', listenLang: 'es-ES', placeholder: 'Escribe o dicta en español…' },
  'ja-es': { from: 'ja', to: 'es', fromLabel: '日本語', toLabel: 'Español', listenLang: 'ja-JP', placeholder: '日本語で話してください / Que hable en japonés…' },
};
const HISTORY_KEY = 'traducir.historial';
const HISTORY_MAX = 15;

const state = {
  dir: readPref('traducir.dir', 'es-ja'),
  text: '',
  result: null,      // { src, out, dir }
  busy: false,
};
if (!DIRS[state.dir]) state.dir = 'es-ja';

let root = null;
let rec = null;      // dictado en curso

export default {
  mount(el) {
    root = document.createElement('div');
    el.append(root);
    render();
    root.addEventListener('click', onClick);
    root.addEventListener('input', (e) => {
      if (e.target.id === 'tr-input') {
        state.text = e.target.value;
        renderSuggestions();
        root.querySelector('.char-count').textContent = `${state.text.length}/${MAX_CHARS}`;
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.id === 'tr-input' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doTranslate();
    });
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
  },
  unmount() {
    rec?.stop();
    stopSpeaking();
    window.removeEventListener('online', render);
    window.removeEventListener('offline', render);
    root = null;
  },
};

// ===== Pintado =====

function render() {
  if (!root) return;
  const d = DIRS[state.dir];
  root.innerHTML = `
    <div class="segmented subtabs" role="tablist" aria-label="Dirección de la traducción">
      ${Object.entries(DIRS).map(([k, v]) => `
        <button type="button" role="tab" data-act="dir" data-dir="${k}" aria-selected="${state.dir === k}">
          ${esc(v.fromLabel)} → ${esc(v.toLabel)}</button>`).join('')}
    </div>

    ${navigator.onLine ? '' : '<p class="sim-banner">Sin conexión: solo puedes buscar en las frases guardadas.</p>'}

    <section class="card">
      <div class="field">
        <label for="tr-input" class="sr-only">Texto en ${esc(d.fromLabel)}</label>
        <textarea id="tr-input" rows="3" maxlength="${MAX_CHARS}" lang="${d.from}"
          placeholder="${esc(d.placeholder)}">${esc(state.text)}</textarea>
      </div>
      <div class="tr-actions">
        ${canListen() ? `<button type="button" class="round-btn tr-mic${rec ? ' listening' : ''}" data-act="mic"
            aria-label="${rec ? 'Parar' : `Dictar en ${esc(d.fromLabel)}`}">${MIC_ICON}</button>` : ''}
        <span class="muted small char-count">${state.text.length}/${MAX_CHARS}</span>
        <button type="button" data-act="clear" class="btn-small"${state.text ? '' : ' hidden'}>Borrar</button>
        <button type="button" class="btn-primary" data-act="translate"${state.busy ? ' disabled' : ''}>
          ${state.busy ? 'Traduciendo…' : 'Traducir'}</button>
      </div>
    </section>

    <div id="tr-result">${resultHTML()}</div>
    <div id="tr-suggest"></div>

    <section class="card">
      <h2 class="card-title">Carteles, cartas y conversaciones</h2>
      <p class="muted small">Para traducir con la cámara o hablar por turnos, usa Google Traductor.
        Descarga el japonés en su app (Ajustes → Idiomas sin conexión) para que funcione sin internet.</p>
      <div class="btn-row">
        <a class="btn" href="${esc(googleTranslateUrl(state.text, d.from, d.to))}" target="_blank" rel="noopener" data-act="gt">Abrir en Google Traductor</a>
      </div>
    </section>

    ${historyHTML()}

    <p class="muted small tr-privacy">Las traducciones se hacen con MyMemory (necesita internet).
      No escribas datos personales como números de documentos o tarjetas.</p>`;

  renderSuggestions();
}

function resultHTML() {
  const r = state.result;
  if (!r) return '';
  const d = DIRS[r.dir];
  const outIsJa = d.to === 'ja';
  return `
    <section class="card tr-result">
      <p class="muted small">${esc(d.fromLabel)}: ${d.from === 'ja' ? `<span lang="ja">${jaWrapHTML(r.src)}</span>` : esc(r.src)}</p>
      <p class="tr-out${outIsJa ? ' jp' : ''}" ${outIsJa ? 'lang="ja"' : ''}>${outIsJa ? jaWrapHTML(r.out) : esc(r.out)}</p>
      <div class="btn-row">
        ${outIsJa
          ? `<button type="button" class="btn-primary" data-act="show">Enseñar</button>
             <button type="button" data-act="say-out">🔊 Escuchar</button>`
          : `<button type="button" data-act="say-src">🔊 Repetir en japonés</button>`}
        <button type="button" data-act="copy">Copiar</button>
      </div>
      <p class="muted small">Traducción automática: puede no ser perfecta. Para algo importante, busca abajo una frase guardada.</p>
    </section>`;
}

function renderSuggestions() {
  const box = root?.querySelector('#tr-suggest');
  if (!box) return;
  const list = similarPhrases(state.text, DIRS[state.dir].from);
  root.querySelector('[data-act="clear"]')?.toggleAttribute('hidden', !state.text);
  const gt = root.querySelector('[data-act="gt"]');
  if (gt) gt.href = googleTranslateUrl(state.text, DIRS[state.dir].from, DIRS[state.dir].to);
  box.innerHTML = list.length ? `
    <section class="card">
      <h2 class="card-title">Frases guardadas parecidas</h2>
      <p class="muted small">Revisadas y educadas. Funcionan sin conexión.</p>
      <ul class="phrase-list">
        ${list.map(p => `
          <li class="phrase" data-id="${esc(p.id)}">
            <div class="phrase-text" data-act="show-phrase" role="button" tabindex="0">
              <p class="phrase-es">${esc(p.es)}</p>
              <p class="phrase-ja jp" lang="ja">${jaWrapHTML(p.ja)}</p>
              <p class="phrase-romaji">${esc(p.romaji)}</p>
            </div>
            <div class="phrase-actions">
              <button type="button" class="round-btn" data-act="say-phrase" aria-label="Escuchar">${SPEAK_ICON}</button>
            </div>
          </li>`).join('')}
      </ul>
    </section>` : '';
}

function historyHTML() {
  const h = readHistory();
  if (!h.length) return '';
  return `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Últimas traducciones</h2>
        <button type="button" class="link-small btn-link" data-act="clear-history">Borrar</button>
      </div>
      <ul class="plain-list tr-history">
        ${h.map((x, i) => `
          <li><button type="button" class="tr-hist-item" data-act="history" data-i="${i}">
            <span class="small">${esc(x.src)}</span>
            <span class="small muted"${DIRS[x.dir]?.to === 'ja' ? ' lang="ja"' : ''}>${esc(x.out)}</span>
          </button></li>`).join('')}
      </ul>
    </section>`;
}

// ===== Acciones =====

async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const phrase = () => {
    const id = btn.closest('[data-id]')?.dataset.id;
    return similarPhrases(state.text, DIRS[state.dir].from, 10).find(p => p.id === id);
  };

  switch (act) {
    case 'dir':
      if (state.dir === btn.dataset.dir) return;
      rec?.stop();
      state.dir = btn.dataset.dir;
      writePref('traducir.dir', state.dir);
      // Si hay resultado, lo usamos como texto de partida en la otra dirección.
      if (state.result && state.result.dir !== state.dir) state.text = state.result.out;
      state.result = null;
      render();
      break;
    case 'clear':
      state.text = ''; state.result = null; render();
      root.querySelector('#tr-input')?.focus();
      break;
    case 'translate': doTranslate(); break;
    case 'mic': toggleMic(); break;
    case 'show': showJa(state.result.out, state.result.src); break;
    case 'say-out': say(state.result.out); break;
    case 'say-src': say(state.result.src); break;
    case 'copy':
      try { await navigator.clipboard.writeText(state.result.out); toast('Copiado'); }
      catch { toast('No se pudo copiar', { error: true }); }
      break;
    case 'show-phrase': { const p = phrase(); if (p) showJa(p.ja, p.es, p.romaji); break; }
    case 'say-phrase': { const p = phrase(); if (p) say(p.ja); break; }
    case 'history': {
      const x = readHistory()[Number(btn.dataset.i)];
      if (!x) return;
      state.dir = DIRS[x.dir] ? x.dir : state.dir;
      state.text = x.src;
      state.result = { src: x.src, out: x.out, dir: state.dir };
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'clear-history':
      writeHistory([]); render();
      break;
  }
}

async function doTranslate() {
  const text = state.text.trim();
  if (!text || state.busy) return;
  const d = DIRS[state.dir];
  state.busy = true;
  render();
  try {
    const out = await translate(text, d.from, d.to);
    state.result = { src: text, out, dir: state.dir };
    addHistory({ dir: state.dir, src: text, out, t: new Date().toISOString() });
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    state.busy = false;
    render();
  }
}

async function toggleMic() {
  if (rec) { rec.stop(); return; }
  const d = DIRS[state.dir];
  stopSpeaking();
  rec = listen(d.listenLang);
  render();
  try {
    const heard = await rec.result;
    if (heard) {
      state.text = heard;
      rec = null;
      render();
      doTranslate();
      return;
    }
  } catch (err) {
    toast(err.message, { error: true });
  }
  rec = null;
  render();
}

function showJa(ja, es, romaji = '') {
  showFullscreen({
    text: ja, sub: es, sub2: romaji,
    actions: [{ label: '🔊 Escuchar', primary: true, onClick: () => say(ja) }],
    onClose: stopSpeaking,
  });
}

async function say(ja) {
  try { await speak(ja); } catch (err) { toast(err.message, { error: true }); }
}

// ===== Historial y preferencias (solo en este móvil) =====

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function writeHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
}
function addHistory(entry) {
  const list = readHistory().filter(x => !(x.src === entry.src && x.dir === entry.dir));
  list.unshift(entry);
  writeHistory(list.slice(0, HISTORY_MAX));
}
function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}

const MIC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const SPEAK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
