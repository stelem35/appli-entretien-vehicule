// Bump this version on every deploy that touches a cached file below,
// sinon les appareils déjà installés continuent de servir l'ancien cache
// (le navigateur ne réinstalle le service worker que si ce fichier change).
const CACHE_NAME = 'entretien-vehicule-v19';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/vehicules.js',
  './js/entretiens.js',
  './js/export.js',
  './js/backup.js',
  './js/dashboard.js',
  './js/bilan.js',
  './js/version.js',
  './js/devis.js',
  './js/rappels.js',
  './js/gcal.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' = toujours télécharger depuis le serveur, sinon d'anciens fichiers encore en cache HTTP
      // (GitHub Pages : 10 min) seraient rangés sous le nouveau numéro de version.
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Stratégie "cache first, repli réseau" : fonctionne hors-ligne dès le 1er chargement en ligne.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // sw.js lui-même (lu par l'app pour savoir quelle version est en ligne) : toujours le réseau, jamais le cache.
  if (new URL(event.request.url).pathname.endsWith('/sw.js')) return;

  // Seuls l'app elle-même et les bibliothèques PDF (jsDelivr) sont mis en cache : jamais l'API ni la connexion Google,
  // sinon d'anciennes réponses de l'agenda seraient servies à la place des données à jour.
  const { origin, hostname } = new URL(event.request.url);
  if (origin !== self.location.origin && !hostname.endsWith('jsdelivr.net')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
    })
  );
});
