/* 青森釣りアプリ Service Worker — v7: HTML/マニフェストはネットワーク優先、静的アセットはキャッシュ優先 */
const CACHE = 'aomori-tsuri-v7';
const CORE = [
  './manifest.webmanifest',
  './assets/hero.webp',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];
// NOTE: index.html is deliberately NOT in CORE. It is network-first (below),
// so a failed deploy can never poison the install, and a new version is
// picked up on the next launch instead of being hidden behind the cache.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        CORE.map((url) => c.add(url).catch(() => {
          // One missing/broken asset must never fail the whole install.
          // It will be fetched from the network (and cached if OK)
          // by the fetch handler on first use.
        }))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never intercept the worker script itself, and never cache non-GET.
  if (e.request.method !== 'GET' || url.pathname.endsWith('/sw.js')) return;
  // Weather APIs: network only, never cached (unchanged from v5).
  if (url.hostname.includes('open-meteo.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // Only handle same-origin requests from here on.
  if (url.origin !== self.location.origin) return;

  const isPage = e.request.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('/index.html');
  const isManifest = url.pathname.endsWith('/manifest.webmanifest');

  if (isPage || isManifest) {
    // NETWORK-FIRST: a new deploy is seen on the next launch.
    // A bad response (404/500) or offline falls back to the last good copy.
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }
        return caches.match(e.request).then((hit) => hit || res);
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // STATIC ASSETS (icons, hero): cache-first, but never store errors.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
