// Pantalla "Frases": lista por categorías, buscador, favoritas, audio,
// modo "enseñar" a pantalla completa y modo repaso con tarjetas.
import { CATEGORIES, PHRASES, PHRASE_BY_ID } from '../phrases.js';
import { getAll, put, remove, DATA_EVENT } from '../db.js';
import { esc, toast, jaWrapHTML } from '../utils.js';
import { showFullscreen } from '../showcard.js';
import {
  speak, stopSpeaking, speechSupported, hasJapaneseVoice, getRate, setRate,
} from '../speech.js';

const CAT_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));

const ICON = {
  speak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
};

// Texto normalizado para buscar sin tildes ni macrones (ō → o).
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,、。？！]/g, '');
const INDEX = new Map(PHRASES.map(p => [p.id, norm(`${p.es} ${p.romaji} ${p.ja} ${p.note}`)]));

const state = {
  cat: readPref('frases.cat', 'todas'),   // 'todas' | 'fav' | id de categoría
  query: '',
  mode: 'lista',                          // 'lista' | 'repaso'
  review: null,
};
if (state.cat !== 'todas' && state.cat !== 'fav' && !CAT_BY_ID.has(state.cat)) state.cat = 'todas';

let favs = new Set();
let root = null;
let onData = null;
let releaseBack = null;

export default {
  handlesDataChange: true,

  async mount(el) {
    favs = new Set((await getAll('favorites')).map(f => f.id));
    root = document.createElement('div');
    el.append(root);
    renderShell();

    root.addEventListener('click', onClick);
    root.addEventListener('input', (e) => {
      if (e.target.matches('#phrase-search')) {
        state.query = e.target.value;
        renderList();
      }
    });
    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.phrase-text')) {
        e.preventDefault();
        e.target.click();
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('#slow-voice')) setRate(e.target.checked ? 'lento' : 'normal');
    });

    // Importar o restaurar datos: recargar favoritas.
    onData = async (e) => {
      if (e.detail?.store === 'favorites') return;   // los cambios propios ya están pintados
      favs = new Set((await getAll('favorites')).map(f => f.id));
      if (state.mode === 'lista') renderShell();
    };
    window.addEventListener(DATA_EVENT, onData);

    // Las voces pueden tardar en cargarse.
    setTimeout(updateVoiceBanner, 800);
  },

  unmount() {
    window.removeEventListener(DATA_EVENT, onData);
    stopSpeaking();
    exitReview({ fromUnmount: true });
    root = null;
  },
};

// ===== Lista =====

function filtered() {
  const q = norm(state.query.trim());
  return PHRASES.filter(p =>
    (state.cat === 'todas' || (state.cat === 'fav' ? favs.has(p.id) : p.cat === state.cat)) &&
    (!q || INDEX.get(p.id).includes(q)));
}

function renderShell() {
  if (!root) return;
  if (state.mode === 'repaso') return renderReview();

  const chips = [
    { id: 'todas', label: 'Todas' },
    { id: 'fav', label: `★ Favoritas${favs.size ? ` (${favs.size})` : ''}` },
    ...CATEGORIES.map(c => ({ id: c.id, label: c.name, kanji: c.kanji })),
  ];

  root.innerHTML = `
    <div class="phrases-controls">
      <div class="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>
        <input id="phrase-search" type="search" placeholder="Buscar en español, romaji o japonés" value="${esc(state.query)}" autocomplete="off" enterkeyhint="search" aria-label="Buscar frases">
      </div>
      <div class="chips" role="tablist" aria-label="Categorías">
        ${chips.map(c => `
          <button type="button" class="chip-btn" role="tab" data-act="cat" data-cat="${c.id}" aria-selected="${state.cat === c.id}">
            ${c.kanji ? `<span class="jp chip-kanji" lang="ja">${c.kanji}</span>` : ''}${esc(c.label)}
          </button>`).join('')}
      </div>
    </div>
    <div class="voice-banner" hidden></div>
    <p class="muted small hint-line">Toca una frase para enseñarla en grande.</p>
    <div class="phrases-toolbar">
      <span class="muted small" id="phrase-count"></span>
      <label class="toggle small"><input type="checkbox" id="slow-voice"${getRate() === 'lento' ? ' checked' : ''}> Voz lenta</label>
      <button type="button" class="btn-primary btn-small" data-act="review">Repasar</button>
    </div>
    <div id="phrase-list"></div>`;

  renderList();
  updateVoiceBanner();
}

function renderList() {
  const listEl = root?.querySelector('#phrase-list');
  if (!listEl) return;
  const list = filtered();
  root.querySelector('#phrase-count').textContent =
    `${list.length} ${list.length === 1 ? 'frase' : 'frases'}`;
  root.querySelector('[data-act="review"]').disabled = list.length === 0;

  if (!list.length) {
    listEl.innerHTML = state.cat === 'fav' && !state.query
      ? '<p class="empty">Aún no tienes favoritas. Toca la ☆ de una frase para guardarla aquí.</p>'
      : '<p class="empty">No hay frases que coincidan con la búsqueda.</p>';
    return;
  }

  if (state.cat === 'todas' && !state.query.trim()) {
    listEl.innerHTML = CATEGORIES.map(c => `
      <h2 class="group-title"><span class="jp" lang="ja">${c.kanji}</span> ${esc(c.name)}</h2>
      <ul class="phrase-list">${list.filter(p => p.cat === c.id).map(phraseRow).join('')}</ul>`).join('');
  } else {
    listEl.innerHTML = `<ul class="phrase-list">${list.map(phraseRow).join('')}</ul>`;
  }
}

function phraseRow(p) {
  const fav = favs.has(p.id);
  return `
    <li class="phrase" data-id="${p.id}">
      <div class="phrase-text" data-act="teach" role="button" tabindex="0" aria-label="Enseñar «${esc(p.es)}» a pantalla completa">
        <p class="phrase-es">${esc(p.es)}</p>
        <p class="phrase-ja jp" lang="ja">${jaWrapHTML(p.ja)}</p>
        <p class="phrase-romaji">${esc(p.romaji)}</p>
        ${p.note ? `<p class="phrase-note">${esc(p.note)}</p>` : ''}
      </div>
      <div class="phrase-actions">
        <button type="button" class="round-btn" data-act="speak" aria-label="Escuchar">${ICON.speak}</button>
        <button type="button" class="round-btn fav-btn" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de favoritas' : 'Añadir a favoritas'}">${ICON.star}</button>
      </div>
    </li>`;
}

function updateVoiceBanner() {
  const el = root?.querySelector('.voice-banner');
  if (!el) return;
  let msg = '';
  if (!speechSupported()) {
    msg = 'Este navegador no puede leer en voz alta. Usa Chrome.';
  } else if (hasJapaneseVoice() === false) {
    msg = 'No se encuentra la voz japonesa. Instálala en Ajustes → Idioma → Salida de texto a voz → Google → Japonés.';
  }
  el.hidden = !msg;
  el.textContent = msg;
}

// ===== Acciones =====

async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) {
    // En repaso, tocar la tarjeta muestra la respuesta.
    if (state.mode === 'repaso' && e.target.closest('.review-card') && !state.review?.revealed) reveal();
    return;
  }
  const act = btn.dataset.act;
  const id = btn.closest('[data-id]')?.dataset.id;
  const p = id ? PHRASE_BY_ID.get(id) : null;

  switch (act) {
    case 'cat':
      state.cat = btn.dataset.cat;
      writePref('frases.cat', state.cat);
      root.querySelectorAll('[data-act="cat"]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      renderList();
      window.scrollTo(0, 0);
      break;
    case 'speak':
      if (p) say(p.ja, btn);
      break;
    case 'teach':
      if (p) teach(p);
      break;
    case 'fav':
      if (p) toggleFav(p, btn);
      break;
    case 'review': startReview(); break;
    case 'rev-show': reveal(); break;
    case 'rev-know': answer(true); break;
    case 'rev-again': answer(false); break;
    case 'rev-dir':
      state.review.dir = state.review.dir === 'es' ? 'ja' : 'es';
      state.review.revealed = false;
      renderReview();
      break;
    case 'rev-speak': say(PHRASE_BY_ID.get(state.review.deck[0]).ja, btn); break;
    case 'rev-restart': startReview(true); break;
    case 'rev-exit': exitReview(); break;
  }
}

async function say(text, btn) {
  btn?.classList.add('speaking');
  try {
    await speak(text);
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    btn?.classList.remove('speaking');
  }
}

async function toggleFav(p, btn) {
  const on = !favs.has(p.id);
  if (on) favs.add(p.id); else favs.delete(p.id);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Quitar de favoritas' : 'Añadir a favoritas');
  const favChip = root.querySelector('[data-cat="fav"]');
  if (favChip) favChip.textContent = `★ Favoritas${favs.size ? ` (${favs.size})` : ''}`;
  try {
    if (on) await put('favorites', { id: p.id }); else await remove('favorites', p.id);
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar la favorita', { error: true });
  }
  if (state.cat === 'fav') renderList();
}

// Modo "enseñar": la frase en grande; se puede pasar a la anterior o siguiente.
function teach(p) {
  const list = filtered();
  let i = Math.max(0, list.findIndex(x => x.id === p.id));
  const content = (q) => ({ text: q.ja, sub: q.es, sub2: q.romaji });
  const go = (d) => {
    i = (i + d + list.length) % list.length;
    stopSpeaking();
    close.update(content(list[i]));
  };
  const close = showFullscreen({
    ...content(list[i]),
    actions: [
      { label: '‹', aria: 'Frase anterior', onClick: () => go(-1) },
      { label: '🔊 Escuchar', primary: true, onClick: () => say(list[i].ja) },
      { label: '›', aria: 'Frase siguiente', onClick: () => go(1) },
    ],
    onPrev: () => go(-1),
    onNext: () => go(1),
    onClose: stopSpeaking,
  });
}

// ===== Repaso =====

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startReview(restart = false) {
  const ids = restart && state.review ? state.review.allIds : filtered().map(p => p.id);
  if (!ids.length) return;
  const label = state.query.trim() ? 'Búsqueda'
    : state.cat === 'todas' ? 'Todas las frases'
    : state.cat === 'fav' ? 'Favoritas' : CAT_BY_ID.get(state.cat).name;
  state.review = {
    allIds: ids,
    deck: shuffle(ids),
    total: ids.length,
    known: 0,
    revealed: false,
    dir: state.review?.dir ?? 'es',
    label: restart ? state.review.label : label,
  };
  if (state.mode !== 'repaso') {
    state.mode = 'repaso';
    // "Atrás" sale del repaso en vez de salir de la app.
    history.pushState({ review: true }, '');
    const onBack = () => exitReview({ fromBack: true });
    window.addEventListener('popstate', onBack);
    releaseBack = () => window.removeEventListener('popstate', onBack);
  }
  window.scrollTo(0, 0);
  renderReview();
}

function exitReview({ fromBack = false, fromUnmount = false } = {}) {
  if (state.mode !== 'repaso') return;
  stopSpeaking();
  state.mode = 'lista';
  releaseBack?.();
  releaseBack = null;
  if (!fromBack && !fromUnmount) history.back();
  if (!fromUnmount) renderShell();
}

function reveal() {
  if (!state.review || state.review.revealed) return;
  state.review.revealed = true;
  renderReview();
}

function answer(known) {
  const r = state.review;
  const id = r.deck.shift();
  if (known) {
    r.known++;
  } else {
    // Vuelve a salir dentro de unas tarjetas.
    r.deck.splice(Math.min(3, r.deck.length), 0, id);
  }
  r.revealed = false;
  renderReview();
}

function renderReview() {
  const r = state.review;
  if (!root || !r) return;
  const pct = Math.round((r.known / r.total) * 100);

  const head = `
    <div class="review-head">
      <button type="button" class="btn-small" data-act="rev-exit">‹ Salir</button>
      <span class="small muted">${esc(r.label)}</span>
      <button type="button" class="btn-small" data-act="rev-dir">${r.dir === 'es' ? 'ES → JA' : 'JA → ES'}</button>
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.total}" aria-valuenow="${r.known}">
      <span style="width:${pct}%"></span>
    </div>
    <p class="small muted review-count">${r.known} de ${r.total} aprendidas</p>`;

  if (!r.deck.length) {
    root.innerHTML = `${head}
      <section class="review-card review-done">
        <p class="jp review-big" lang="ja">よくできました！</p>
        <p class="review-sub">¡Muy bien! Has repasado las ${r.total} frases.</p>
      </section>
      <div class="review-buttons">
        <button type="button" data-act="rev-exit">Volver a la lista</button>
        <button type="button" class="btn-primary" data-act="rev-restart">Repetir</button>
      </div>`;
    return;
  }

  const p = PHRASE_BY_ID.get(r.deck[0]);
  const front = r.dir === 'es'
    ? `<p class="review-big">${esc(p.es)}</p>`
    : `<p class="jp review-big" lang="ja">${jaWrapHTML(p.ja)}</p>`;
  const back = r.dir === 'es'
    ? `<p class="jp review-answer" lang="ja">${jaWrapHTML(p.ja)}</p><p class="phrase-romaji">${esc(p.romaji)}</p>`
    : `<p class="phrase-romaji">${esc(p.romaji)}</p><p class="review-answer">${esc(p.es)}</p>`;

  root.innerHTML = `${head}
    <section class="review-card${r.revealed ? ' is-revealed' : ''}" aria-live="polite">
      <span class="tag">${esc(CAT_BY_ID.get(p.cat).name)}</span>
      ${front}
      ${r.revealed ? `<hr>${back}${p.note ? `<p class="phrase-note">${esc(p.note)}</p>` : ''}` : '<p class="muted small">Piensa la respuesta y toca la tarjeta</p>'}
      ${r.revealed || r.dir === 'ja' ? `<button type="button" class="round-btn review-speak" data-act="rev-speak" aria-label="Escuchar">${ICON.speak}</button>` : ''}
    </section>
    <div class="review-buttons">
      ${r.revealed
        ? `<button type="button" data-act="rev-again">Otra vez</button>
           <button type="button" class="btn-primary" data-act="rev-know">La sé</button>`
        : '<button type="button" class="btn-primary wide" data-act="rev-show">Mostrar respuesta</button>'}
    </div>`;
}

// ===== Preferencias (solo comodidad) =====

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento local */ }
}
