// Codenames TR - Service Worker
const CACHE = 'codenames-v84';
const ASSETS = [
  './',
  './index.html',
  './words.js',
  './lib/qrcode.min.js',
  './lib/jsQR.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(a => c.add(a).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Network-first: always try network, fall back to cache
  e.respondWith(
    fetch(e.request).then(resp => {
      // Cache successful GETs
      if (resp && resp.status === 200 && e.request.method === 'GET') {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => {
      // Offline fallback
      return caches.match(e.request);
    })
  );
});
