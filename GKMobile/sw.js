const VERSION = "gk-mobile-v46";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./store.js", "./app.js", "./motion-ui.js", "./manifest.webmanifest",
  "./assets/emblem-reference.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
