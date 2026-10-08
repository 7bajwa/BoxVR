// BOXFLOW service worker — network-first (updates on GitHub Pages show up immediately),
// falling back to the cache so the game also runs offline once it has been played.
const CACHE = 'boxflow-v5';
const CORE = [
  './', './index.html', './editor.html', './css/style.css', './css/editor.css', './manifest.webmanifest',
  './vendor/three.module.js', './vendor/addons/loaders/GLTFLoader.js', './vendor/addons/utils/BufferGeometryUtils.js',
  './js/main.js', './js/config.js', './js/audio.js', './js/scoring.js', './js/spawner.js', './js/target.js', './js/fx.js',
  './js/rig.js', './js/kit.js', './js/content.js', './js/storage.js', './js/charts.js', './js/editor.js',
  './js/ui/panel.js', './js/ui/menus.js', './js/gloves.js', './js/hurdles.js',
  './content/registry.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
