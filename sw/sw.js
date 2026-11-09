/*
 * Scrap Orbit's service worker: lets the web version start without internet and be installed
 * like an app. The build (vite.config.ts) fills in the file list and a version for each release.
 *
 * - The page itself (index.html) comes from the network first, so players get new releases
 *   straight away, and falls back to the saved copy when offline.
 * - Everything else in the list (scripts, styles, fonts, icons) has a unique name per release,
 *   so it is served from the saved copy first.
 * - Anything else (Firebase sign-in and cloud save, other sites) is left alone.
 */
const VERSION = '__VERSION__';
const CACHE = 'scrap-orbit-' + VERSION;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the release before this one too: a page that is still open may load its parts later.
      const keys = (await caches.keys()).filter((k) => k.startsWith('scrap-orbit-') && k !== CACHE).sort();
      for (const k of keys.slice(0, -1)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  const scope = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate') {
    if (url.pathname !== scope && url.pathname !== scope + 'index.html') return;
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(CACHE)).put(scope, res.clone());
          return res;
        } catch {
          return (await caches.match(scope)) || Response.error();
        }
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith(scope + 'assets/')) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
