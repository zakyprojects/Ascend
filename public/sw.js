// Pages: the app's HTML, kept under one key so any page opens offline.
const PAGE_CACHE_NAME = 'ascend-pages-v1';
const OFFLINE_PAGE_KEY = '/';
// Static files from public/ (icons, manifest, fonts): one entry per file, network first.
const STATIC_CACHE_NAME = 'ascend-static-v1';
const STATIC_FILE = /\.(?:png|svg|ico|webp|jpg|jpeg|woff2|webmanifest)$|^\/manifest\.json$/;
// Build files (/assets/*) carry a content hash in their name and never change, so they are served
// from this cache first. It keeps the newest ASSET_CACHE_LIMIT files; older builds' files go.
const ASSET_CACHE_NAME = 'ascend-assets-v1';
const ASSET_CACHE_LIMIT = 200;
const CURRENT_CACHES = [PAGE_CACHE_NAME, STATIC_CACHE_NAME, ASSET_CACHE_NAME];

// Install event - skip waiting to activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate event - drop every other cache whole (the old 'ascend-pwa-cache-v1' kept every URL it
// ever saw, version.json?t=… polls included, and grew too large to list), then take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name))))
      .catch(() => undefined)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle GET requests for our origin
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGE_CACHE_NAME, OFFLINE_PAGE_KEY));
  } else if (!url.search && STATIC_FILE.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE_NAME, request));
  }
  // Anything else (version.json polls, dev-server modules) goes straight to the network, uncached.
});

// Network first, so a new deployment shows at once; the cached copy only when offline.
async function networkFirst(request, cacheName, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(cacheKey, copy)).catch(() => undefined);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

// Cache first for immutable build files: a page's code opens at once instead of waiting on the
// network (a slow or waking phone connection can stall a request for seconds).
async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trimAssetCache(cache).catch(() => undefined);
  }
  return response;
}

// Keys come back in insertion order, so the oldest files are deleted first.
async function trimAssetCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - ASSET_CACHE_LIMIT)).map((key) => cache.delete(key)));
}

// Notification click event - focus or open client window when tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
