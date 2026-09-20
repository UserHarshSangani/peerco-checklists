// Minimal, hand-written service worker. It ONLY precaches the static app
// shell (the offline fallback page and icons) and serves that fallback when
// a page navigation fails offline. It never touches Supabase requests
// (cross-origin, and non-navigation requests aren't intercepted at all) and
// never caches any app page — every real page load always goes to the
// network, so nobody's data goes stale or gets served without auth.

const CACHE_NAME = "peerco-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle same-origin page navigations. Everything else —
  // Supabase's REST/RPC calls, Next's JS/data requests, images — passes
  // straight through untouched.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
