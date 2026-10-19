const VERSION = "gk-cuisine-v1";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./store.js", "./escpos.js", "./app.js", "./manifest.webmanifest",
  "./assets/emblem-reference.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL).then(() => cache.add("../shared/gk-bus.js").catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;
  const shared = request.url.includes("/shared/");
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached || Response.error());
      // The shared bus must stay fresh: network first, cache as offline fallback.
      return shared ? network : cached || network;
    })
  );
});
