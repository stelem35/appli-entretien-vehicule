// Petite couche d'accès IndexedDB (pas de dépendance externe).

const DB_NAME = 'entretien-vehicule-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vehicules')) {
        db.createObjectStore('vehicules', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('entretiens')) {
        const store = db.createObjectStore('entretiens', { keyPath: 'id' });
        store.createIndex('vehiculeId', 'vehiculeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const store = await tx(storeName, 'readonly');
  return wrapRequest(store.getAll());
}

export async function getById(storeName, id) {
  const store = await tx(storeName, 'readonly');
  return wrapRequest(store.get(id));
}

export async function getAllByIndex(storeName, indexName, value) {
  const store = await tx(storeName, 'readonly');
  return wrapRequest(store.index(indexName).getAll(value));
}

export async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  await wrapRequest(store.put(value));
  return value;
}

export async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  return wrapRequest(store.delete(id));
}

// --- Blobs (photos) ---

export async function saveBlob(id, blob) {
  await put('blobs', { id, blob });
  return id;
}

export async function getBlob(id) {
  if (!id) return null;
  const record = await getById('blobs', id);
  return record ? record.blob : null;
}

export async function deleteBlob(id) {
  if (!id) return;
  await remove('blobs', id);
}
