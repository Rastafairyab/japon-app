// Pestaña "Trenes": lee los PDF de Documentos (solo en este móvil) y lista los trenes
// por fecha, hora y destino. Los datos leídos se guardan en la base de datos local,
// nunca se suben a internet.
import { listDocs, getDoc, getAll, put, saveDoc, DATA_EVENT } from './db.js';
import { extractPdfText, openDocById } from './docs.js';
import { esc, uid, toast } from './utils.js';
import { openForm } from './form.js';
import { fmtDate } from './trip.js';

const PARSER_VERSION = 1;

// Pasa caracteres de ancho completo (０-９, Ａ-Ｚ, ：) a normales.
function normalize(s) {
  return s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}
const pad = (n) => String(n).padStart(2, '0');

function findDates(text, defYear) {
  const out = [];
  const push = (idx, y, m, d) => {
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) out.push({ idx, date: `${y}-${pad(m)}-${pad(d)}` });
  };
  let m;
  const reYmd = /(20\d\d)\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/g;
  while ((m = reYmd.exec(text))) push(m.index, +m[1], +m[2], +m[3]);
  const reMd = /(?<![\d\/\-.年])(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((m = reMd.exec(text))) {
    const i = m.index;
    if (!out.some(o => Math.abs(o.idx - i) < 8)) push(i, defYear, +m[1], +m[2]);
  }
  return out.sort((a, b) => a.idx - b.idx);
}

function findTimes(text) {
  const out = [];
  const re = /(?<!\d)([01]?\d|2[0-3])\s*[:時]\s*([0-5]\d)(?!\d)/g;
  let m;
  while ((m = re.exec(text))) out.push({ idx: m.index, time: `${pad(m[1])}:${m[2]}` });
  return out;
}

const TRAIN_RE = /(のぞみ|ひかり|こだま|みずほ|さくら|つばめ|はやぶさ|やまびこ|かがやき|はくたか|Nozomi|Hikari|Kodama|Mizuho|Sakura|Tsubame|Hayabusa|Yamabiko|Kagayaki|Hakutaka)\s*(?:No\.?\s*)?(\d{1,4})\s*号?/gi;
const ROMA = {
  のぞみ: 'Nozomi', ひかり: 'Hikari', こだま: 'Kodama', みずほ: 'Mizuho', さくら: 'Sakura',
  つばめ: 'Tsubame', はやぶさ: 'Hayabusa', やまびこ: 'Yamabiko', かがやき: 'Kagayaki', はくたか: 'Hakutaka',
};
const STATION = '[\\u3040-\\u30FF\\u4E00-\\u9FFFA-Za-z\\-]{1,12}';

function findStations(seg) {
  let from = '', to = '';
  const re = new RegExp(`(${STATION})\\s*(?:\\d{1,2}\\s*[:時]\\s*\\d{2}\\s*分?)?\\s*(発|着)`, 'g');
  let m;
  while ((m = re.exec(seg))) {
    if (m[2] === '発' && !from) from = m[1];
    if (m[2] === '着' && !to) to = m[1];
  }
  if (!from || !to) {
    const arrow = seg.match(new RegExp(`(${STATION})\\s*(?:\\d{1,2}:\\d{2})?\\s*[→⇒～~▶>]\\s*(?:\\d{1,2}:\\d{2})?\\s*(${STATION})`));
    if (arrow) { from = from || arrow[1]; to = to || arrow[2]; }
  }
  return { from, to };
}

export function parseTrains(pages) {
  const text = normalize(pages.join('\n'));
  const yearMatch = text.match(/20\d\d/);
  const year = yearMatch ? +yearMatch[0] : new Date().getFullYear();
  const dates = findDates(text, year);
  const matches = [...text.matchAll(TRAIN_RE)];
  const found = [];

  matches.forEach((m, i) => {
    const start = m.index;
    const end = Math.min(matches[i + 1]?.index ?? text.length, start + 400);
    const seg = text.slice(Math.max(0, start - 120), end);
    const after = text.slice(start, end);
    const prevDate = dates.filter(d => d.idx <= start + 40).pop() ?? dates[0];
    const times = findTimes(after);
    const { from, to } = findStations(seg);
    const car = after.match(/(\d{1,2})\s*号車/)?.[1] ?? '';
    const seat = after.match(/(\d{1,2}\s*番\s*[A-E]?|\d{1,2}\s*[A-E])\s*席?/)?.[1]?.replace(/\s+/g, '') ?? '';
    const name = ROMA[m[1]] ?? (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
    found.push({
      train: `${name} ${m[2]}`, date: prevDate?.date ?? '',
      dep: times[0]?.time ?? '', arr: times[1]?.time ?? '',
      from, to, car, seat,
    });
  });

  // Quita duplicados (mismo tren y fecha), juntando los datos que falten.
  const byKey = new Map();
  for (const t of found) {
    const key = `${t.train}|${t.date}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, t);
    else for (const k of Object.keys(t)) if (!prev[k] && t[k]) prev[k] = t[k];
  }
  const out = [...byKey.values()];

  // Si no se reconoce ningún tren, una entrada por página con la primera fecha/hora.
  if (!out.length) {
    pages.forEach(p => {
      const t = normalize(p);
      const d = findDates(t, year)[0];
      const times = findTimes(t);
      if (!d && !times.length) return;
      const { from, to } = findStations(t);
      out.push({ train: 'Tren', date: d?.date ?? '', dep: times[0]?.time ?? '', arr: times[1]?.time ?? '', from, to, car: '', seat: '' });
    });
  }
  return out;
}

async function trainsFromDocs() {
  const docs = (await listDocs()).filter(d => d.type === 'application/pdf');
  const rows = [];
  for (const meta of docs) {
    let trains = meta.trains;
    if (!Array.isArray(trains) || meta.parserVersion !== PARSER_VERSION) {
      const doc = await getDoc(meta.id);
      if (!doc) continue;
      trains = parseTrains(await extractPdfText(doc));
      await saveDoc({ ...doc, trains, parserVersion: PARSER_VERSION, parsedAt: new Date().toISOString() });
    }
    trains.forEach((t, i) => rows.push({ ...t, id: `${meta.id}-${i}`, docId: meta.id, docName: meta.name, source: 'pdf' }));
  }
  return rows;
}

async function trainsFromItems() {
  const items = await getAll('items');
  return items
    .filter(it => it.type === 'tren' || (it.type === 'reserva' && it.docId))
    .map(it => ({
      id: it.id, train: it.title || 'Tren', date: it.date || '', dep: it.time || '', arr: '',
      from: '', to: it.place || '', car: '', seat: '', notes: it.notes || '', docId: it.docId || '', source: 'item',
    }));
}

export function trainsCard() {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">Trenes</h2>
    <p class="muted small">Leídos de los PDF de Documentos. Se leen y se guardan solo en este móvil.</p>
    <div class="btn-row">
      <button type="button" class="btn-primary" data-act="add">＋ Añadir tren</button>
      <button type="button" data-act="reparse">Volver a leer PDFs</button>
    </div>
    <ul class="train-list"><li class="muted small">Leyendo documentos…</li></ul>`;
  const list = card.querySelector('.train-list');
  let busy = false;

  async function render() {
    if (busy) return;
    busy = true;
    try {
      let pdfRows = [];
      let pdfError = '';
      try {
        pdfRows = await trainsFromDocs();
      } catch (err) {
        console.error(err);
        pdfError = navigator.onLine
          ? 'No se pudieron leer los PDF.'
          : 'Sin conexión: la primera vez hace falta internet para cargar el lector de PDF.';
      }
      const itemRows = await trainsFromItems();
      // Si un PDF ya tiene trenes leídos, no repetir su reserva del itinerario.
      const docsWithTrains = new Set(pdfRows.map(r => r.docId));
      const rows = [...pdfRows, ...itemRows.filter(r => !(r.source === 'item' && r.docId && docsWithTrains.has(r.docId) && r.train !== 'Tren'))]
        .sort((a, b) => `${a.date || '9999'}${a.dep}`.localeCompare(`${b.date || '9999'}${b.dep}`));

      list.innerHTML = (pdfError ? `<li class="muted small">${esc(pdfError)}</li>` : '') + (rows.length
        ? rows.map(r => {
          const route = [r.from && `${esc(r.dep)} ${esc(r.from)}`.trim() || esc(r.dep), r.to && `${esc(r.arr)} ${esc(r.to)}`.trim() || esc(r.arr)]
            .filter(Boolean).join(' → ');
          const seat = [r.car && `Coche ${esc(r.car)}`, r.seat && `Asiento ${esc(r.seat)}`].filter(Boolean).join(' · ');
          return `
          <li class="train-row">
            <div class="train-main">
              <strong>${esc(r.train)}</strong>
              <span class="muted small">${r.date ? esc(fmtDate(r.date)) : 'Sin fecha'}</span>
            </div>
            ${route ? `<div>${route}</div>` : ''}
            ${seat ? `<div class="muted small">${seat}</div>` : ''}
            ${r.notes ? `<div class="muted small">${esc(r.notes)}</div>` : ''}
            ${r.docId ? `<button type="button" class="btn-mini btn-mini-accent" data-act="open" data-doc="${esc(r.docId)}">📄 Abrir billete</button>` : ''}
          </li>`;
        }).join('')
        : (pdfError ? '' : '<li class="muted small">No se han encontrado trenes. Sube los billetes en Documentos o añade uno a mano.</li>'));
    } finally {
      busy = false;
    }
  }

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    try {
      if (btn.dataset.act === 'open') {
        await openDocById(btn.dataset.doc);
      } else if (btn.dataset.act === 'add') {
        openForm({
          title: 'Añadir tren',
          fields: [
            { name: 'title', label: 'Tren', type: 'text' },
            { name: 'date', label: 'Fecha', type: 'date', half: true },
            { name: 'time', label: 'Hora', type: 'time', half: true },
            { name: 'place', label: 'Destino', type: 'text' },
            { name: 'notes', label: 'Notas (coche, asiento…)', type: 'text' },
          ],
          values: {},
          validate: (v) => (v.date ? null : 'Pon la fecha del tren.'),
          onSave: async (v) => {
            await put('items', {
              id: uid(), type: 'tren', title: v.title || 'Tren', date: v.date, time: v.time || '',
              place: v.place || '', notes: v.notes || '', updatedAt: new Date().toISOString(),
            });
            toast('Tren añadido');
            render();
          },
        });
      } else if (btn.dataset.act === 'reparse') {
        const docs = await listDocs();
        for (const meta of docs) {
          if (!meta.trains && meta.parserVersion == null) continue;
          const doc = await getDoc(meta.id);
          if (!doc) continue;
          const { trains, parserVersion, parsedAt, ...rest } = doc;
          await saveDoc(rest);
        }
        list.innerHTML = '<li class="muted small">Leyendo documentos…</li>';
        await render();
        toast('PDFs leídos de nuevo');
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Algo ha fallado', { error: true });
    }
  });

  const onData = () => {
    if (!card.isConnected) { window.removeEventListener(DATA_EVENT, onData); return; }
    render();
  };
  window.addEventListener(DATA_EVENT, onData);

  render();
  return card;
}
