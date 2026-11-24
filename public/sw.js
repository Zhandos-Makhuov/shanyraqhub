// Shanyraq Hub Service Worker v4 (push; Phase 6: a tapped notification opens what it is about)
//
// Strategy:
//   * Page navigations (HTML): network-first, so a new deploy is picked up on the
//     next load; the cached shell is used only when offline.
//   * Hashed build assets (/assets/*) and icons: cache-first (their URLs change
//     whenever their content changes, so they never go stale).
//   * Everything else (cross-origin requests, APIs, Vite dev-server modules): not
//     intercepted, so the service worker never serves stale data.
const CACHE_NAME = 'shanyraq-cache-v4';
const SHELL_URL = '/index.html';
const PRECACHE = [
  SHELL_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        // Install still succeeds if precaching fails (e.g. offline during install).
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const isCacheFirstAsset = (url) =>
  url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

// Web Push (stage 7b): messages from the "send-push" Edge Function. Payload: { title, body, tab?, id? }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Shanyraq Hub', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.id || undefined,
      // Phase 6 (C-16): /?n=<notification id> — the site opens what the notification is about and marks it read.
      data: { url: data.id ? '/?n=' + encodeURIComponent(data.id) : '/' },
    })
  );
});

// Tapping a notification focuses an open Shanyraq Hub tab or opens the site.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const url = (event.notification.data && event.notification.data.url) || '/';
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      // The site is already open: bring it forward and let it open the notification there (no second window).
      open.postMessage({ type: 'shq-open', url });
      return open.focus();
    })
  );
});
