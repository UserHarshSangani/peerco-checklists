// Minimal, hand-written service worker. It ONLY precaches the static app
// shell (the offline fallback page and icons) and serves that fallback when
// a page navigation fails offline. It never touches Supabase requests
// (cross-origin, and non-navigation requests aren't intercepted at all) and
// never caches any app page — every real page load always goes to the
// network, so nobody's data goes stale or gets served without auth.

const CACHE_NAME = "peerco-daybook-shell-v3";
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

// Phone alerts. The server sends {title, body, url, tag}; tapping the alert
// opens (or focuses) that page of the app.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PeerCo Daybook", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "PeerCo Daybook", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      for (const w of windows) {
        if ("navigate" in w && "focus" in w) return w.navigate(target).then((c) => (c ? c.focus() : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});
