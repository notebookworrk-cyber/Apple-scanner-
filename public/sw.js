/* ============================================================
   sw.js — Service Worker for PWA (cache-first for static assets)
   ============================================================ */

const CACHE_NAME = 'apple-scanner-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/js/app.js',
  '/js/camera.js',
  '/js/classifier.js',
  '/js/color-analysis.js',
  '/js/ui.js',
  '/models/model.json',
  '/models/group1-shard1of1.bin',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache GET responses for static assets
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});