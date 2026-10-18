// Pages: the app's HTML, kept under one key so any page opens offline.
const PAGE_CACHE_NAME = 'ascend-pages-v1';
const OFFLINE_PAGE_KEY = '/';
// Static files from public/ (icons, manifest, fonts): one entry per file, network first.
const STATIC_CACHE_NAME = 'ascend-static-v1';
const STATIC_FILE = /\.(?:png|svg|ico|webp|jpg|jpeg|woff2|webmanifest)$|^\/manifest\.json$/;
// Build files (/assets/*) carry a content hash in their name and never change, so they are served
// from this cache first. It keeps the newest ASSET_CACHE_LIMIT files; older builds' files go.
// v2 (2026-10-18): drops a v1 cache that served a broken stylesheet to installed apps.
const ASSET_CACHE_NAME = 'ascend-assets-v2';
const ASSET_CACHE_LIMIT = 200;
// Push bookkeeping (not a page cache): the endpoint replaced in 'pushsubscriptionchange', kept
// until the page removes it from the account (src/lib/push.ts reads the same names).
const PUSH_CACHE_NAME = 'ascend-push-v1';
const OLD_ENDPOINT_KEY = '/__ascend/push-old-endpoint';
// Same public VAPID key as src/lib/push.ts (must match the send-push secret).
const VAPID_PUBLIC_KEY = 'BCm0FKHm8dST6fMA1txExLaijZvgYrl20Zy_jmS9oCDazA7lyEVVsnrYiNxXTw829zeFvaDoEl_VzMSgkP8ydGU';
const CURRENT_CACHES = [PAGE_CACHE_NAME, STATIC_CACHE_NAME, ASSET_CACHE_NAME, PUSH_CACHE_NAME];

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
  if (response.ok && hasAssetType(request, response)) {
    await cache.put(request, response.clone());
    trimAssetCache(cache).catch(() => undefined);
  }
  return response;
}

// Only a real stylesheet or script is kept under a .css/.js name, so a wrong response (an HTML
// page, an error body) is never served from the cache for the life of that file name.
function hasAssetType(request, response) {
  const type = response.headers.get('content-type') || '';
  const path = new URL(request.url).pathname;
  if (path.endsWith('.css')) return type.includes('text/css');
  if (path.endsWith('.js')) return type.includes('javascript');
  return true;
}

// Keys come back in insertion order, so the oldest files are deleted first.
async function trimAssetCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - ASSET_CACHE_LIMIT)).map((key) => cache.delete(key)));
}

// Web Push from the send-push Edge Function: { id, title, body, url }. Always shown (Chrome
// requires a visible notification for every push); the tag keeps one notice from showing twice.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ascend', {
      body: data.body || '',
      tag: data.id || undefined,
      icon: '/android-chrome-192x192.png',
      // Android draws the badge from its alpha only: a white Streak silhouette on transparent.
      badge: '/notification-badge.png',
      data: { url: data.url || '/' },
    })
  );
});

// The browser replaced or expired this device's push subscription. Subscribe again with the same
// key, remember the old endpoint, and tell any open window, which saves the new subscription to the
// account and removes the old one (the service worker has no sign-in of its own). With no window
// open, the next app start does the same (syncPushSubscription).
function vapidKeyBytes() {
  const base64 = (VAPID_PUBLIC_KEY + '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

self.addEventListener('pushsubscriptionchange', (event) => {
  const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null;
  event.waitUntil(
    (async () => {
      if (oldEndpoint) {
        const cache = await caches.open(PUSH_CACHE_NAME);
        await cache.put(OLD_ENDPOINT_KEY, new Response(oldEndpoint));
      }
      const subscription =
        event.newSubscription ||
        (await self.registration.pushManager.getSubscription()) ||
        (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes() }));
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({ type: 'ascend:push-subscription-changed', endpoint: subscription.endpoint });
      }
    })().catch(() => undefined)
  );
});

// Notification click event - focus or open client window when tapped. An open window is also
// told the notification's url (`ascend:navigate`); the app acts on the ones it knows (the focus
// timer opens PFC, FocusSessionProvider).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'ascend:navigate', url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
