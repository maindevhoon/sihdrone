// Trinetra service worker: offline shell and cached build assets. Bump VERSION when this logic changes.
const VERSION = 'trinetra-v4';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/models/bird.glb',
  ...['mavic-3', 'phantom-4-pro', 'matrice-350-rtk', 'mini-4-pro'].map(id => `/models/drone-${id}.glb`),
  '/models/credits.json',
  ...['mavic-3', 'phantom-4-pro', 'matrice-350-rtk', 'mini-4-pro', 'typhoon-h480', 'rc-cessna', 'black-kite', 'house-crow', 'rock-pigeon'].map(id => `/models/v3-${id}.glb`)];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Pages: network first so deployments arrive promptly; the cached shell keeps the app usable offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone(); void caches.open(VERSION).then(cache => cache.put('/', copy)); return response;
    }).catch(() => caches.match('/')));
    return;
  }
  // Hashed build assets, contact models and Cesium runtime files never change under the same URL.
  if (/^\/(assets|models|cesium)\//.test(url.pathname)) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); void caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    })));
  }
});
