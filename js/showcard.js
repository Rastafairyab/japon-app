// Pantalla completa para enseñar un texto a otra persona (taxista, camarero…).
// Fondo blanco y letra enorme. Se cierra con la ✕ o con el botón "atrás" de Android.
// Mientras está abierta, la pantalla no se apaga (si el móvil lo permite).
import { esc, jaWrapHTML } from './utils.js';

/**
 * @param {object} o
 * @param {string} o.text     Texto principal (grande)
 * @param {string} [o.lang]   Idioma del texto principal ('ja' por defecto)
 * @param {string} [o.note]   Línea pequeña encima (en japonés)
 * @param {string} [o.sub]    Línea pequeña debajo (p. ej. la traducción al español)
 * @param {string} [o.sub2]   Segunda línea debajo (p. ej. el romaji)
 * @param {{label:string, aria?:string, onClick:Function, primary?:boolean}[]} [o.actions]
 *                            Botones en la parte de abajo
 * @param {Function} [o.onPrev]  Si existe, deslizar a la derecha llama a esta función
 * @param {Function} [o.onNext]  Si existe, deslizar a la izquierda llama a esta función
 * @param {Function} [o.onClose]
 * @returns {Function & {update: Function}} cerrar(); cerrar.update({text, note, sub, sub2})
 */
export function showFullscreen({ text, lang = 'ja', note = '', sub = '', sub2 = '', actions = [], onPrev, onNext, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'showcard';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <button type="button" class="showcard-close" aria-label="Cerrar">✕</button>
    <div class="showcard-body"></div>
    ${actions.length ? `<div class="showcard-actions">
      ${actions.map((a, i) => `<button type="button" data-i="${i}" class="${a.primary ? 'showcard-primary' : ''}"${a.aria ? ` aria-label="${esc(a.aria)}"` : ''}>${esc(a.label)}</button>`).join('')}
    </div>` : ''}`;

  const body = ov.querySelector('.showcard-body');
  const paint = (c) => {
    const l = c.lang ?? lang;
    body.innerHTML = `
      ${c.note ? `<p class="showcard-note" lang="ja">${jaWrapHTML(c.note)}</p>` : ''}
      <div class="showcard-main" lang="${esc(l)}">${l === 'ja' ? jaWrapHTML(c.text) : esc(c.text)}</div>
      ${c.sub ? `<p class="showcard-sub">${esc(c.sub)}</p>` : ''}
      ${c.sub2 ? `<p class="showcard-sub2">${esc(c.sub2)}</p>` : ''}`;
    fitText(body.querySelector('.showcard-main'), body);
  };

  document.body.append(ov);
  document.body.classList.add('no-scroll');
  paint({ text, note, sub, sub2 });

  ov.querySelector('.showcard-actions')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) actions[Number(b.dataset.i)].onClick();
  });

  // Deslizar el dedo para pasar de frase.
  let x0 = null, y0 = null;
  if (onPrev || onNext) {
    ov.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    ov.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onNext?.(); else onPrev?.();
    });
  }

  let lock = null;
  navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});

  // Una entrada en el historial para que "atrás" cierre esta pantalla y no la app.
  history.pushState({ showcard: true }, '');

  let closed = false;
  const close = (fromBack = false) => {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onBack);
    lock?.release().catch(() => {});
    ov.remove();
    document.body.classList.remove('no-scroll');
    onClose?.();
    if (fromBack !== true) history.back();
  };
  const onBack = () => close(true);
  window.addEventListener('popstate', onBack);
  ov.querySelector('.showcard-close').addEventListener('click', () => close());
  ov.querySelector('.showcard-close').focus();

  close.update = (c) => { if (!closed) paint(c); };
  return close;
}

// Busca el tamaño de letra más grande con el que el texto cabe en pantalla.
// Primero intenta no partir los bloques de japonés; si así la letra quedaría
// demasiado pequeña, permite partirlos y vuelve a calcular.
const MIN_KEEP_BLOCKS = 34;

function fitText(el, box) {
  el.classList.remove('allow-break');
  let size = shrinkToFit(el, box);
  if (size < MIN_KEEP_BLOCKS && el.querySelector('.nb')) {
    el.classList.add('allow-break');
    size = shrinkToFit(el, box);
  }
}

function shrinkToFit(el, box) {
  const maxH = box.clientHeight * 0.62;
  let size = Math.min(window.innerWidth * 0.2, 160);
  el.style.fontSize = `${size}px`;
  while (size > 18 && (el.scrollHeight > maxH || el.scrollWidth > el.clientWidth + 1)) {
    size *= 0.92;
    el.style.fontSize = `${size}px`;
  }
  return size;
}
