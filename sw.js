// Service Worker for "You Are Not Half" Flipbook PWA
// Caches pages progressively so the book works fully offline

const CACHE_NAME = 'ynh-flipbook-v1';
const TOTAL_PAGES = 440;

// Core files to cache immediately on install
const CORE_FILES = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// ── Install: cache core files ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_FILES);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first strategy ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache valid responses for our own files
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const url = event.request.url;
        if (url.includes('/pages/') || url.includes('/icons/') || url.endsWith('.html') || url.endsWith('.json')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── Background page caching ────────────────────────────────────────────────
// Listen for messages from the main page to cache pages in batches
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_PAGES') {
    const { from, to, base } = event.data;
    cachePagesRange(from, to, base);
  }
});

async function cachePagesRange(from, to, base) {
  const cache = await caches.open(CACHE_NAME);
  for (let i = from; i <= to; i++) {
    const num = String(i).padStart(3, '0');
    const url = `${base}pages/page-${num}.jpg`;
    try {
      const cached = await cache.match(url);
      if (!cached) {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      }
    } catch (e) {
      // Skip failed fetches silently
    }
  }
  // Notify main thread that this batch is done
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'CACHE_PROGRESS', upTo: to }));
}
