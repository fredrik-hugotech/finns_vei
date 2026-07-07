/* Finns Fairway service worker — makes the app installable and resilient.
   Strategy: network-first for navigations (always fresh when online, cached
   shell when offline); stale-while-revalidate for same-origin static assets.
   API calls, tiles and cross-origin requests are never cached. */
const CACHE = 'ff-shell-v1';
const SHELL = ['/', '/sykle', '/brand/icon-192.png', '/brand/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // leave Mapbox/Supabase alone
  if (url.pathname.startsWith('/api/')) return;              // never cache API

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
