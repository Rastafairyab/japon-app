// Base de datos local (IndexedDB) y copias de seguridad en JSON.
import { SEED, SEED_VERSION } from './seed.js';

const DB_NAME = 'japon-2026';
// v2: si existe una base de datos vacía o a medias (sin algún almacén), la
// actualización crea los que falten. No borra nada.
// v3: almacén 'docs' (PDF/imágenes). Va aparte de STORES: no entra en la copia de seguridad.
const DB_VERSION = 3;
export const APP_ID = 'japon-2026';
export const EXPORT_FORMAT = 1;

// almacén → campo clave
export const STORES = {
  flights: 'id',
  stays: 'id',
  items: 'id',
  favorites: 'id',
  settings: 'key',
};
const TRIP_STORES = ['flights', 'stays', 'items'];

// Avisa a las pantallas para que se vuelvan a pintar.
export const DATA_EVENT = 'japon:datachange';
const notify = (store) => window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: { store } }));

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            if (name === 'items') store.createIndex('date', 'date');
          }
        }
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();   // deja actualizar si hay otra pestaña abierta
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB bloqueada: cierra otras pestañas de la app.');
    });
  }
  return dbPromise;
}

// Ejecuta fn dentro de una transacción y resuelve cuando termina.
// Si fn devuelve una petición IDBRequest, se devuelve su resultado.
async function run(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let out;
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Operación cancelada'));
    try {
      out = fn(tx);
    } catch (err) {
      tx.abort();
      reject(err);
    }
  });
}

// ===== Operaciones básicas =====

export const getAll = (store) => run(store, 'readonly', tx => tx.objectStore(store).getAll());

export const get = (store, key) => run(store, 'readonly', tx => tx.objectStore(store).get(key));

export async function put(store, record) {
  await run(store, 'readwrite', tx => { tx.objectStore(store).put(record); });
  notify(store);
  return record;
}

export async function remove(store, key) {
  await run(store, 'readwrite', tx => { tx.objectStore(store).delete(key); });
  notify(store);
}

export const itemsByDate = (date) =>
  run('items', 'readonly', tx => tx.objectStore('items').index('date').getAll(date));

export async function getSetting(key, fallback = null) {
  const rec = await get('settings', key);
  return rec ? rec.value : fallback;
}

export const setSetting = (key, value) => put('settings', { key, value });

// ===== Datos iniciales =====

// Primera vez: carga todo. Si SEED_VERSION ha subido, actualiza vuelos y
// alojamientos que no se hayan editado a mano. Nunca toca planes ni favoritas.
export async function ensureSeeded() {
  const current = await getSetting('seedVersion', 0);
  if (current >= SEED_VERSION) return;

  await run(['flights', 'stays', 'items', 'settings'], 'readwrite', tx => {
    for (const store of ['flights', 'stays']) {
      const os = tx.objectStore(store);
      for (const rec of SEED[store]) {
        if (current === 0) { os.put(rec); continue; }
        const r = os.get(rec.id);
        r.onsuccess = () => { if (!r.result?.edited) os.put(rec); };
      }
    }
    if (current === 0) SEED.items.forEach(rec => tx.objectStore('items').put(rec));
    tx.objectStore('settings').put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

// Vuelve a los datos iniciales del viaje. Borra planes y ediciones; conserva las favoritas.
export async function resetTripData() {
  await run([...TRIP_STORES, 'settings'], 'readwrite', tx => {
    for (const store of TRIP_STORES) {
      const os = tx.objectStore(store);
      os.clear();
      SEED[store].forEach(rec => os.put(rec));
    }
    tx.objectStore('settings').put({ key: 'seedVersion', value: SEED_VERSION });
  });
  notify('*');
}

// ===== Exportar / importar =====

export async function exportAll() {
  const names = Object.keys(STORES);
  const reqs = await run(names, 'readonly', tx =>
    Object.fromEntries(names.map(n => [n, tx.objectStore(n).getAll()])));
  const data = Object.fromEntries(Object.entries(reqs).map(([n, r]) => [n, r.result]));
  return { app: APP_ID, format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), data };
}

// Comprueba que el archivo es una copia de esta app. Lanza un Error con un mensaje en español.
export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || payload.app !== APP_ID) {
    throw new Error('Este archivo no es una copia de seguridad de la app de Japón.');
  }
  if (payload.format > EXPORT_FORMAT) {
    throw new Error('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  }
  const data = payload.data;
  if (!data || typeof data !== 'object') throw new Error('La copia está vacía o dañada.');

  const counts = {};
  for (const [name, keyPath] of Object.entries(STORES)) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) throw new Error(`La sección «${name}» de la copia está dañada.`);
    for (const rec of list) {
      if (!rec || typeof rec !== 'object' || rec[keyPath] == null) {
        throw new Error(`Hay un registro sin «${keyPath}» en «${name}».`);
      }
    }
    counts[name] = list.length;
  }
  return counts;
}

// Sustituye TODOS los datos por los de la copia (en una sola transacción: o todo o nada).
export async function importAll(payload) {
  const counts = validateBackup(payload);
  const names = Object.keys(STORES);
  await run(names, 'readwrite', tx => {
    for (const name of names) {
      const os = tx.objectStore(name);
      os.clear();
      (payload.data[name] ?? []).forEach(rec => os.put(rec));
    }
    // Una copia antigua puede no traer la versión de los datos iniciales.
    if (!(payload.data.settings ?? []).some(s => s.key === 'seedVersion')) {
      tx.objectStore('settings').put({ key: 'seedVersion', value: SEED_VERSION });
    }
  });
  notify('*');
  return counts;
}

// Pide a Chrome que no borre los datos aunque el móvil vaya justo de espacio.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}

// ===== Documentos (PDF/imágenes): solo en este móvil, no van en la copia =====

export async function listDocs() {
  const all = await getAll('docs');
  return all.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function addDoc(file) {
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return put('docs', { id, name: file.name, type: file.type, size: file.size, blob, addedAt: new Date().toISOString() });
}

export const getDoc = (id) => get('docs', id);
export const deleteDoc = (id) => remove('docs', id);
export async function renameDoc(id, name) {
  const d = await get('docs', id);
  if (!d) return;
  d.name = name;
  return put('docs', d);
}
