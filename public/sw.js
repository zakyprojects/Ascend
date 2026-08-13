const CACHE_NAME = 'ascend-pwa-cache-v1';

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
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Clean up old caches
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network first strategy to ensure we always get the latest Vercel deployment
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
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
