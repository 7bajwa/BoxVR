// BOXFLOW service worker — caches the app shell so it runs offline once installed.
const CACHE = 'boxflow-v1';
const ASSETS = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './vendor/three.module.js',
  './js/main.js', './js/config.js', './js/audio.js', './js/scoring.js', './js/env.js',
  './js/spawner.js', './js/target.js', './js/fx.js', './js/rig.js', './js/vrui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network-first so updates on GitHub Pages show up; fall back to cache offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)),
  );
});
