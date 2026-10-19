const VERSION = "gk-mobile-v4";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./store.js", "./app.js", "./manifest.webmanifest",
  "./assets/emblem-reference.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("gk-mobile-") && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache the app shell; never cache API or shared-client responses.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/") || url.pathname.includes("/shared/")) return;
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok || response.type === "opaque") cache.put(request, response.clone());
        return response;
      }).catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
