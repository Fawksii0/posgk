const VERSION = "gk-courier-v7";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./store.js", "./app.js", "./manifest.webmanifest",
  "./assets/emblem-reference.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "../shared/gk-api.js", "../shared/gk-sound.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("gk-courier-") && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for the shell, images and fonts.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;
  if (request.url.includes("/shared/")) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then(hit => hit || Response.error())));
    return;
  }
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
