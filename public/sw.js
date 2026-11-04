// Service Worker for HMS - Low-network and Offline Speed Optimization
const CACHE_NAME = 'hms-static-v1';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Precaching non-fatal errors tolerated
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Skip Supabase, chrome-extension, and external APIs
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    return;
  }

  // 3. Static assets (_next/static, images, fonts, styles) -> Cache First / Stale While Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => null);

          // Return cached response immediately if available; otherwise wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. HTML Navigation (routes like /doctor, /pharmacy, /reception) -> Fast Network with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          caches.open(CACHE_NAME).then((cache) => {
            cache.match(request).then((cachedResponse) => {
              if (cachedResponse) resolve(cachedResponse);
            });
          });
        }, 1800); // 1.8s timeout for low 2G network

        fetch(request)
          .then((networkResponse) => {
            clearTimeout(timer);
            if (networkResponse && networkResponse.status === 200) {
              const resClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
            }
            if (!timedOut) resolve(networkResponse);
          })
          .catch(async () => {
            clearTimeout(timer);
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
              resolve(cachedResponse);
            } else {
              const fallback = await cache.match('/');
              if (fallback) resolve(fallback);
            }
          });
      })
    );
  }
});
