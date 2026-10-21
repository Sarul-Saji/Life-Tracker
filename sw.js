// Service worker: lets Compound open with no internet, like a real app.
// Strategy: try the internet first (so you always get the newest version),
// and fall back to the saved copy when you're offline.
// Only the main build session bumps CACHE (once per release). Tracker files don't need listing:
// every file the app loads is saved for offline use automatically the first time it's fetched.
const CACHE = 'compound-v15';
const ASSETS = [
  './', './index.html', './manifest.json',
  './core/base.css', './core/helpers.js', './core/state.js', './core/game.js', './core/ui.js', './core/home.js', './core/motion.js', './core/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (new URL(e.request.url).origin === location.origin && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
