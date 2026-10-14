const CACHE_NAME = 'ascend-pwa-cache-v1';
// Build files (/assets/*) carry a content hash in their name and never change, so they are served
// from this cache first. It keeps the newest ASSET_CACHE_LIMIT files; older builds' files go.
const ASSET_CACHE_NAME = 'ascend-assets-v1';
const ASSET_CACHE_LIMIT = 200;

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - claim clients immediately to take control of open pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== ASSET_CACHE_NAME) {
            return caches.delete(cacheName); // Clean up old caches
          }
        })
      );
    })
      // Build files cached here before they had a cache of their own.
      .then(() => caches.open(CACHE_NAME))
      .then((cache) =>
        cache.keys().then((keys) =>
          Promise.all(keys.filter((key) => new URL(key.url).pathname.startsWith('/assets/')).map((key) => cache.delete(key)))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network first strategy to ensure we always get the latest Vercel deployment
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (new URL(event.request.url).pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }

  // Network First, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response and save it to the cache for offline fallback
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // If network fails (offline), try to serve from cache
        return caches.match(event.request);
      })
  );
});

// Cache first for immutable build files: a page's code opens at once instead of waiting on the
// network (a slow or waking phone connection can stall a request for seconds).
async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trimAssetCache(cache);
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
